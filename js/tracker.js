// ── Sources ────────────────────────────────────────────────────────────────────
//
// All three sources use the gov.uk search API (Access-Control-Allow-Origin: *)
// so they can be fetched directly from the browser with no proxy needed.
//
// "Ofcom (formal publications)" covers documents Ofcom files with or via gov.uk
// — annual reports, statutory consultations, regulatory decisions. It does NOT
// include Ofcom's own news, press releases, or enforcement notices, which live
// on ofcom.org.uk and are blocked by Cloudflare from automated fetching.
// Those items are added manually in manual-entries.js.
//
const SOURCES = {
  DCMS: {
    label: 'DCMS',
    apiUrl: 'https://www.gov.uk/api/search.json?filter_organisations=department-for-culture-media-and-sport&order=-public_timestamp&count=50',
  },
  DBIST: {
    label: 'DBIST',
    // Items tagged to legacy DBT may also appear here during gov.uk's re-tagging period
    apiUrl: 'https://www.gov.uk/api/search.json?filter_organisations=department-for-business-innovation-science-and-trade&order=-public_timestamp&count=50',
  },
  Ofcom: {
    label: 'Ofcom (formal publications)',
    apiUrl: 'https://www.gov.uk/api/search.json?filter_organisations=ofcom&order=-public_timestamp&count=50',
  },
};

// Keywords used to filter items for telecoms relevance.
// Extend this list as coverage needs change.
const KEYWORDS = [
  'telecoms', 'telecom', 'broadband', 'mobile', 'spectrum',
  '5G', '4G', 'fibre', 'fiber', 'Ofcom', 'BDUK', 'Openreach',
  'gigabit', 'connectivity', 'infrastructure', 'network',
  'rollout', 'coverage', 'roaming', 'satellite',
];

// ── State ──────────────────────────────────────────────────────────────────────

let allItems = [];
let activeSource = 'all';

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function matchesKeyword(item) {
  const text = (item.title + ' ' + item.context).toLowerCase();
  return KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

function getVisibleItems() {
  return allItems.filter(item => {
    const sourceMatch = activeSource === 'all' || item.source === activeSource;
    return sourceMatch && matchesKeyword(item);
  });
}

// ── Fetching ───────────────────────────────────────────────────────────────────

async function fetchGovUkSource(sourceId) {
  const source = SOURCES[sourceId];
  const res = await fetch(source.apiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data.results || []).map(r => ({
    id: sourceId + ':' + r.link,
    source: sourceId,
    date: r.public_timestamp ? r.public_timestamp.slice(0, 10) : '',
    title: r.title || '',
    context: r.description || '',
    url: 'https://www.gov.uk' + r.link,
  }));
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderFeed() {
  const container = document.getElementById('feed-container');
  const items = getVisibleItems();

  if (items.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant items found for this source.</p>';
    return;
  }

  container.innerHTML = items.map(item => {
    const label = SOURCES[item.source]?.label || item.source;
    return `
    <article class="feed-item" data-source="${escapeHtml(item.source)}">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(label)}</span>
        <span>${formatDate(item.date)}</span>
      </p>
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
      ${item.context ? `<p>${escapeHtml(item.context)}</p>` : ''}
    </article>`;
  }).join('');
}

// ── Filter button handler ──────────────────────────────────────────────────────

function filterFeed(source, buttonEl) {
  activeSource = source;
  document.querySelectorAll('.source-filters button').forEach(btn => {
    btn.classList.toggle('active', btn === buttonEl);
  });
  renderFeed();
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('feed-container').innerHTML = '<p class="no-results">Loading…</p>';

  const [dcmsResult, dbistResult, ofcomResult] = await Promise.allSettled([
    fetchGovUkSource('DCMS'),
    fetchGovUkSource('DBIST'),
    fetchGovUkSource('Ofcom'),
  ]);

  const items = [];

  for (const [sourceId, result] of [['DCMS', dcmsResult], ['DBIST', dbistResult], ['Ofcom', ofcomResult]]) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.warn(`[DCI Tracker] ${sourceId} fetch failed:`, result.reason);
    }
  }

  // Merge manual entries from manual-entries.js (loaded before this script)
  const manualItems = (typeof MANUAL_ENTRIES !== 'undefined' ? MANUAL_ENTRIES : []).map(e => ({
    id: 'manual:' + e.url,
    source: e.source,
    date: e.date,
    title: e.title,
    context: e.context || '',
    url: e.url,
  }));
  items.push(...manualItems);

  // Deduplicate by id, sort by date descending
  const seen = new Set();
  allItems = items
    .filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  renderFeed();
}

init();

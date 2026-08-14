// ── Sources ────────────────────────────────────────────────────────────────────
//
// DCMS and DBIST use the gov.uk search API directly from the browser —
// the API returns Access-Control-Allow-Origin: * so no proxy is needed.
//
// Ofcom (ofcom.org.uk) is blocked by Cloudflare bot protection for
// programmatic requests. apiUrl is null until a usable feed URL is
// confirmed manually in a browser, at which point it should route through
// an rss2json proxy (see the fetchSource stub below).
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
    label: 'Ofcom',
    // TODO: confirm feed URL by checking https://www.ofcom.org.uk/news-centre in a browser
    // (View Source → search for <link rel="alternate">) then wire via:
    // `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`
    apiUrl: null,
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

// Stub for future Ofcom RSS integration via rss2json proxy.
// When a feed URL is confirmed, replace this with a real fetch.
async function fetchOfcom() {
  return [];
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderFeed() {
  const container = document.getElementById('feed-container');

  if (activeSource === 'Ofcom') {
    container.innerHTML = `
      <p class="no-results">
        Ofcom is not yet connected — feed URL pending confirmation.
        Visit <a href="https://www.ofcom.org.uk/news-centre" target="_blank" rel="noopener">Ofcom's news centre</a> directly in the meantime.
      </p>`;
    return;
  }

  const items = getVisibleItems();

  if (items.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant items found for this source.</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="feed-item" data-source="${escapeHtml(item.source)}">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(item.source)}</span>
        <span>${formatDate(item.date)}</span>
      </p>
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
      ${item.context ? `<p>${escapeHtml(item.context)}</p>` : ''}
    </article>
  `).join('');
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

  const [dcmsResult, dbistResult] = await Promise.allSettled([
    fetchGovUkSource('DCMS'),
    fetchGovUkSource('DBIST'),
  ]);

  const items = [];

  if (dcmsResult.status === 'fulfilled') {
    items.push(...dcmsResult.value);
  } else {
    console.warn('[DCI Tracker] DCMS fetch failed:', dcmsResult.reason);
  }

  if (dbistResult.status === 'fulfilled') {
    items.push(...dbistResult.value);
  } else {
    console.warn('[DCI Tracker] DBIST fetch failed:', dbistResult.reason);
  }

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

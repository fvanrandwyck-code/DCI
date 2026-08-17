// ── Sources ────────────────────────────────────────────────────────────────────
//
// Each group maps to one filter button and can pull from multiple gov.uk
// organisation slugs — the current department plus its immediate predecessor.
// All use the gov.uk search API (Access-Control-Allow-Origin: *) so no
// proxy is needed.
//
// Orgs are listed current-first within each group. Where a document is tagged
// to both a current and a legacy department (common during gov.uk re-tagging),
// the current department's tag wins after deduplication.
//
// DCMS  group: DCMS (current)  + DSIT (dissolved July 2026)
// DBIST group: DBIST (current) + DBT  (immediate predecessor)
// Ofcom group: Ofcom formal publications on gov.uk only
//              Items from ofcom.org.uk (Cloudflare-blocked) go in manual-entries.js
//
const SOURCES = {
  DCMS: {
    orgs: [
      { slug: 'department-for-culture-media-and-sport',          tag: 'DCMS',  label: 'DCMS'  },
      { slug: 'department-for-science-innovation-and-technology', tag: 'DSIT',  label: 'DSIT'  },
    ],
  },
  DBIST: {
    orgs: [
      { slug: 'department-for-business-innovation-science-and-trade', tag: 'DBIST', label: 'DBIST' },
      { slug: 'department-for-business-and-trade',                    tag: 'DBT',   label: 'DBT'   },
    ],
  },
  Ofcom: {
    orgs: [
      { slug: 'ofcom', tag: 'Ofcom', label: 'Ofcom (formal publications)' },
    ],
  },
};

// Lookup: tag → { group, label } — used when resolving manual-entries.js items
const TAG_META = {};
for (const [groupId, group] of Object.entries(SOURCES)) {
  for (const org of group.orgs) {
    TAG_META[org.tag] = { group: groupId, label: org.label };
  }
}

// ── Format → Type label mapping ────────────────────────────────────────────────
//
// Maps gov.uk API `format` field values to the nine display labels used
// across the tracker. Unlisted raw values fall back to the raw value itself.
//
const FORMAT_LABELS = {
  open_consultation:         'Consultation',
  closed_call_for_evidence:  'Consultation',
  consultation_outcome:      'Consultation',
  call_for_evidence_outcome: 'Consultation',
  open_call_for_evidence:    'Call for evidence',
  decision:                  'Decision',
  guidance:                  'Guidance',
  detailed_guide:            'Guidance',
  statutory_guidance:        'Guidance',
  notice:                    'Notice',
  policy_paper:              'Policy paper',
  research:                  'Report',
  independent_report:        'Report',
  corporate_report:          'Report',
  press_release:             'Press release',
  news_story:                'Press release',
  speech:                    'Press release',
  correspondence:            'Press release',
  official_statistics:       'Statistics',
  statistics_announcement:   'Statistics',
  statistics:                'Statistics',
  national_statistics:       'Statistics',
  statistical_data_set:      'Statistics',
};

function mapFormat(raw) {
  return FORMAT_LABELS[raw] || raw;
}

// Keywords used to filter items for telecoms relevance.
// Applied identically to every item from every source, including DSIT and DBT.
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
    const groupMatch = activeSource === 'all' || item.group === activeSource;
    return groupMatch && matchesKeyword(item);
  });
}

// ── Fetching ───────────────────────────────────────────────────────────────────

async function fetchOrgSlug(groupId, org) {
  const apiUrl = `https://www.gov.uk/api/search.json?filter_organisations=${org.slug}&order=-public_timestamp&count=50`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return (data.results || []).map(r => ({
    id:      org.tag + ':' + r.link,
    source:  org.tag,    // true originating department tag — displayed in feed
    group:   groupId,    // filter group — determines which button reveals this item
    label:   org.label,  // display label shown in the source tag
    type:    mapFormat(r.format || ''),
    date:    r.public_timestamp ? r.public_timestamp.slice(0, 10) : '',
    title:   r.title || '',
    context: r.description || '',
    url:     'https://www.gov.uk' + r.link,
  }));
}

// Fetches all org slugs within a group in parallel and merges results.
// Current dept is listed first in each group's orgs array, so it wins
// on URL deduplication when the same document carries multiple org tags.
async function fetchGroup(groupId) {
  const group = SOURCES[groupId];
  const results = await Promise.allSettled(
    group.orgs.map(org => fetchOrgSlug(groupId, org))
  );

  const items = [];
  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.warn(`[DCI Tracker] ${group.orgs[i].tag} fetch failed:`, result.reason);
    }
  }
  return items;
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderFeed() {
  const container = document.getElementById('feed-container');
  const items = getVisibleItems();

  if (items.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant items found for this source.</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="feed-item" data-source="${escapeHtml(item.group)}">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(item.label)}</span>
        ${item.type ? `<span class="type-tag">${escapeHtml(item.type)}</span>` : ''}
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

  const [dcmsResult, dbistResult, ofcomResult] = await Promise.allSettled([
    fetchGroup('DCMS'),
    fetchGroup('DBIST'),
    fetchGroup('Ofcom'),
  ]);

  const items = [];
  for (const [groupId, result] of [['DCMS', dcmsResult], ['DBIST', dbistResult], ['Ofcom', ofcomResult]]) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.warn(`[DCI Tracker] ${groupId} group fetch failed:`, result.reason);
    }
  }

  // Merge manual entries from manual-entries.js (loaded before this script).
  // TAG_META resolves each entry's source tag to the correct group and display label.
  const manualItems = (typeof MANUAL_ENTRIES !== 'undefined' ? MANUAL_ENTRIES : []).map(e => {
    const meta = TAG_META[e.source] || { group: e.source, label: e.source };
    return {
      id:      'manual:' + e.url,
      source:  e.source,
      group:   meta.group,
      label:   meta.label,
      type:    e.type || '',
      date:    e.date,
      title:   e.title,
      context: e.context || '',
      url:     e.url,
    };
  });
  items.push(...manualItems);

  // Deduplicate by URL (current dept wins over legacy, as orgs are ordered current-first),
  // then sort by date descending.
  const seenUrls = new Set();
  allItems = items
    .filter(item => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  renderFeed();
}

init();

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
// Applied identically to every item from every source.
// Extend this list as coverage needs change.
const KEYWORDS = [
  'telecoms', 'telecom', 'broadband', 'mobile', 'spectrum',
  '5G', '4G', 'fibre', 'fiber', 'Ofcom', 'BDUK', 'Openreach',
  'gigabit', 'connectivity', 'infrastructure', 'network',
  'rollout', 'coverage', 'roaming', 'satellite',
];

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

// ── Fetching ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// Returns { items, total } — total lets callers detect exhaustion.
async function fetchOrgSlug(groupId, org, start = 0) {
  const apiUrl = `https://www.gov.uk/api/search.json?filter_organisations=${org.slug}&order=-public_timestamp&count=${PAGE_SIZE}&start=${start}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const results = data.results || [];
  const total   = data.total   || 0;

  const items = results.map(r => ({
    id:        org.tag + ':' + r.link,
    source:    org.tag,
    group:     groupId,
    label:     org.label,
    rawFormat: r.format || '',
    type:      mapFormat(r.format || ''),
    date:      r.public_timestamp ? r.public_timestamp.slice(0, 10) : '',
    title:     r.title || '',
    context:   r.description || '',
    url:       'https://www.gov.uk' + r.link,
    deadline:  null,
  }));

  return { items, total };
}

// Returns { items, orgOffsets, orgExhausted } so callers can track pagination state.
async function fetchGroup(groupId) {
  const group = SOURCES[groupId];
  const results = await Promise.allSettled(
    group.orgs.map(org => fetchOrgSlug(groupId, org, 0))
  );

  const items = [];
  const orgOffsets  = {}; // orgSlug → nextStart
  const orgExhausted = {}; // orgSlug → boolean

  for (const [i, result] of results.entries()) {
    const org = group.orgs[i];
    if (result.status === 'fulfilled') {
      const { items: orgItems, total } = result.value;
      items.push(...orgItems);
      orgOffsets[org.slug]   = orgItems.length;
      orgExhausted[org.slug] = orgItems.length < PAGE_SIZE || orgItems.length >= total;
    } else {
      console.warn(`[DCI] ${org.tag} fetch failed:`, result.reason);
      orgOffsets[org.slug]   = 0;
      orgExhausted[org.slug] = false;
    }
  }
  return { items, orgOffsets, orgExhausted };
}

// Fetches closing dates from the gov.uk content API for open consultation and
// call-for-evidence items. Mutates items in place; per-item failures are silent
// so the feed still renders without a bar if the content API call fails.
async function fetchDeadlines(items) {
  const targets = items.filter(item =>
    item.rawFormat === 'open_consultation' ||
    item.rawFormat === 'open_call_for_evidence'
  );
  if (targets.length === 0) return;

  await Promise.allSettled(
    targets.map(async item => {
      const path = item.url.replace('https://www.gov.uk', '');
      const res = await fetch('https://www.gov.uk/api/content' + path);
      if (!res.ok) return;
      const data = await res.json();
      if (data.details && data.details.closing_date) {
        item.deadline = data.details.closing_date;
      }
    })
  );
}

// ── Deadline bar ───────────────────────────────────────────────────────────────

const DEADLINE_TYPES = new Set(['Consultation', 'Call for evidence']);

function renderDeadlineBar(item) {
  if (!item.deadline || !DEADLINE_TYPES.has(item.type)) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const published = new Date(item.date + 'T00:00:00');
  const deadline  = new Date(item.deadline);

  const total    = deadline - published;
  const elapsed  = today - published;
  const fraction = total <= 0 ? 1 : Math.min(Math.max(elapsed / total, 0), 1);
  const pct      = Math.round(fraction * 100);
  const isPast   = today > deadline;

  let colorClass;
  if (isPast || fraction >= 0.75) colorClass = 'bar-red';
  else if (fraction >= 0.5)       colorClass = 'bar-amber';
  else                            colorClass = 'bar-green';

  const verb     = isPast ? 'Closed' : 'Closes';
  const dateText = deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return `
      <div class="deadline-bar">
        <div class="deadline-bar-track">
          <div class="deadline-bar-fill ${colorClass}" style="width:max(${pct}%,4px)"></div>
        </div>
        <span class="deadline-label${isPast ? ' deadline-past' : ''}">${verb} ${dateText}</span>
      </div>`;
}

// ── Shared data loader ─────────────────────────────────────────────────────────
//
// Fetches all sources in parallel, merges manual entries, deduplicates by URL,
// sorts by date descending, and fetches deadlines for open consultations.
// Returns { items, seenUrls, paginationState } so the Tracker page can load
// more items on demand. The homepage only needs items.
//
async function loadAllItems() {
  const groupIds = Object.keys(SOURCES);
  const groupResults = await Promise.allSettled(
    groupIds.map(groupId => fetchGroup(groupId))
  );

  const items = [];
  const paginationOffsets = {};
  const exhaustedKeys = new Set();

  for (const [i, result] of groupResults.entries()) {
    const groupId = groupIds[i];
    paginationOffsets[groupId] = {};
    if (result.status === 'fulfilled') {
      const { items: groupItems, orgOffsets, orgExhausted } = result.value;
      items.push(...groupItems);
      paginationOffsets[groupId] = orgOffsets;
      for (const [slug, isExhausted] of Object.entries(orgExhausted)) {
        if (isExhausted) exhaustedKeys.add(`${groupId}:${slug}`);
      }
    } else {
      console.warn(`[DCI] ${groupId} group fetch failed:`, result.reason);
    }
  }

  // Merge manual entries from manual-entries.js (loaded before this script).
  const manualItems = (typeof MANUAL_ENTRIES !== 'undefined' ? MANUAL_ENTRIES : []).map(e => {
    const meta = TAG_META[e.source] || { group: e.source, label: e.source };
    return {
      id:       'manual:' + e.url,
      source:   e.source,
      group:    meta.group,
      label:    meta.label,
      type:     e.type || '',
      date:     e.date,
      title:    e.title,
      context:  e.context || '',
      url:      e.url,
      deadline: e.deadline || null,
    };
  });
  items.push(...manualItems);

  // Deduplicate by URL (current dept wins over legacy, as orgs are ordered current-first),
  // then sort by date descending.
  const seenUrls = new Set();
  const allItems = items
    .filter(item => {
      if (seenUrls.has(item.url)) return false;
      seenUrls.add(item.url);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  await fetchDeadlines(allItems);

  return {
    items: allItems,
    seenUrls,
    paginationState: { offsets: paginationOffsets, exhaustedKeys },
  };
}

// ── Paginated loader ───────────────────────────────────────────────────────────
//
// Fetches the next batch from each non-exhausted org, deduplicates against
// seenUrls (mutated in place), fetches deadlines for any new open consultations,
// and returns { newItems, allExhausted }.
//
async function fetchMoreItems(paginationState, seenUrls) {
  const { offsets, exhaustedKeys } = paginationState;

  const fetchTasks = [];
  for (const [groupId, group] of Object.entries(SOURCES)) {
    const groupOffsets = offsets[groupId] || {};
    for (const org of group.orgs) {
      const key = `${groupId}:${org.slug}`;
      if (exhaustedKeys.has(key)) continue;
      fetchTasks.push({ groupId, org, start: groupOffsets[org.slug] || 0, key });
    }
  }

  if (fetchTasks.length === 0) {
    return { newItems: [], allExhausted: true };
  }

  const results = await Promise.allSettled(
    fetchTasks.map(({ groupId, org, start }) => fetchOrgSlug(groupId, org, start))
  );

  const rawItems = [];

  for (const [i, result] of results.entries()) {
    const { groupId, org, start, key } = fetchTasks[i];
    if (!offsets[groupId]) offsets[groupId] = {};

    if (result.status === 'fulfilled') {
      const { items, total } = result.value;
      rawItems.push(...items);
      const nextStart = start + items.length;
      offsets[groupId][org.slug] = nextStart;
      if (items.length < PAGE_SIZE || nextStart >= total) exhaustedKeys.add(key);
    } else {
      console.warn(`[DCI] Load more failed for ${org.tag}:`, result.reason);
    }
  }

  const newItems = rawItems.filter(item => {
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });

  newItems.sort((a, b) => b.date.localeCompare(a.date));

  await fetchDeadlines(newItems);

  const allExhausted = fetchTasks.every(({ key }) => exhaustedKeys.has(key));
  return { newItems, allExhausted };
}

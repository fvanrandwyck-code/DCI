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

// gov.uk API `format` values that are never real content — org index pages,
// topic finders, nav scaffolding, etc. Identified as "definitely noise"
// during the Type tag work above but never actually excluded from results,
// only from the display mapping. Filtered out wherever items are fetched so
// none of this can surface anywhere on the site.
const EXCLUDED_FORMATS = new Set([
  'organisation',
  'finder',
  'topical_event',
  'about',
  'our_governance',
  'media_enquiries',
  'step_by_step_nav',
]);

// Keywords used to filter items for telecoms relevance.
// Applied identically to every item from every source.
// Extend this list as coverage needs change.
const KEYWORDS = [
  'telecoms', 'telecom', 'broadband', 'mobile', 'spectrum',
  '5G', '4G', 'fibre', 'fiber', 'Ofcom', 'BDUK', 'Openreach',
  'gigabit', 'connectivity', 'infrastructure', 'network',
  'rollout', 'coverage', 'roaming', 'satellite',
  'radiofrequency', 'jammer',
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

// Returns { items, rawCount, total } — rawCount is the number of API results
// consumed by this page (before the noise-format exclusion), which callers
// need for pagination offsets; total lets callers detect exhaustion.
async function fetchOrgSlug(groupId, org, start = 0) {
  const apiUrl = `https://www.gov.uk/api/search.json?filter_organisations=${org.slug}&order=-public_timestamp&count=${PAGE_SIZE}&start=${start}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const rawResults = data.results || [];
  const results     = rawResults.filter(r => !EXCLUDED_FORMATS.has(r.format));
  const total       = data.total || 0;

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

  return { items, rawCount: rawResults.length, total };
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
      const { items: orgItems, rawCount, total } = result.value;
      items.push(...orgItems);
      orgOffsets[org.slug]   = rawCount;
      orgExhausted[org.slug] = rawCount < PAGE_SIZE || rawCount >= total;
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
      const { items, rawCount, total } = result.value;
      rawItems.push(...items);
      const nextStart = start + rawCount;
      offsets[groupId][org.slug] = nextStart;
      if (rawCount < PAGE_SIZE || nextStart >= total) exhaustedKeys.add(key);
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

// ── Open consultations loader ──────────────────────────────────────────────────
//
// Queries every org slug specifically for open_consultation and
// open_call_for_evidence formats, guaranteeing completeness regardless of
// how much other content has been published since. Used by the homepage only.
// Returns items with deadlines populated; keyword filtering is done by the caller.
//
async function fetchOpenConsultationsItems() {
  const OPEN_FORMATS = ['open_consultation', 'open_call_for_evidence'];
  const fetchTasks = [];

  for (const [groupId, group] of Object.entries(SOURCES)) {
    for (const org of group.orgs) {
      for (const format of OPEN_FORMATS) {
        fetchTasks.push({ groupId, org, format });
      }
    }
  }

  const results = await Promise.allSettled(
    fetchTasks.map(({ groupId, org, format }) =>
      fetch(`https://www.gov.uk/api/search.json?filter_organisations=${org.slug}&filter_format=${format}&order=-public_timestamp&count=50`)
        .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .then(data => (data.results || [])
          .filter(r => !EXCLUDED_FORMATS.has(r.format))
          .map(r => ({
            id:        org.tag + ':' + r.link,
            source:    org.tag,
            group:     groupId,
            label:     org.label,
            rawFormat: r.format || format,
            type:      mapFormat(r.format || format),
            date:      r.public_timestamp ? r.public_timestamp.slice(0, 10) : '',
            title:     r.title || '',
            context:   r.description || '',
            url:       'https://www.gov.uk' + r.link,
            deadline:  null,
          })))
    )
  );

  const seenUrls = new Set();
  const items = [];

  for (const [i, result] of results.entries()) {
    const { org, format } = fetchTasks[i];
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          items.push(item);
        }
      }
    } else {
      console.warn(`[DCI] ${org.tag} ${format} fetch failed:`, result.reason);
    }
  }

  await fetchDeadlines(items);
  return items;
}

// ── Parliamentary Written Questions ──────────────────────────────────────────
//
// Politics tracker data source: UK Parliament's Written Questions API.
// Unlike gov.uk's search, which is already scoped to a single department,
// this API searches the full text of every written question ever tabled —
// so broad KEYWORDS terms ("infrastructure", "network", "coverage") match
// huge, mostly-irrelevant volumes here. Testing showed the API's latency
// scales with the number of OR'd search terms in a single call, not with
// how many results those terms match: one call joining all of KEYWORDS
// times out / 500s, but splitting into several smaller parallel calls (5-6
// terms each) stays fast without losing any recall — no need to narrow the
// keywords themselves. PARLIAMENT_START scopes results to the current
// Parliament (elected 4 July 2024) rather than a rolling recent window,
// since the site's public affairs audience wants to see what current
// MPs/Lords have said since being elected.
//
// The API has no sort/order parameter — result order is relevance-based,
// not chronological, though it empirically clusters toward recent items.
// Items are re-sorted by dateTabled client-side, same as everywhere else
// on the site; this is an approximation until "Load more" pagination
// (added later, same as the Policy tracker) makes it exhaustive.
//
const PQ_API_BASE      = 'https://questions-statements-api.parliament.uk/api/writtenquestions/questions';
const PQ_CHUNK_SIZE    = 6;
const PARLIAMENT_START = '2024-07-04';
const PQ_TAKE          = 50;

// Short display labels for departments that answer telecoms-relevant PQs —
// mirrors the SOURCES tag style used elsewhere. Falls back to the raw
// answeringBodyName for anything unmapped.
const PQ_ANSWERING_BODY_LABELS = {
  'Department for Culture, Media and Sport':            'DCMS',
  'Department for Digital, Culture, Media and Sport':   'DCMS',
  'Department for Science, Innovation and Technology':  'DSIT',
  'Department for Business, Innovation, Science and Trade': 'DBIST',
  'Department for Business and Trade':                  'DBT',
  'Ministry of Defence':                                'MoD',
  'Department for Transport':                           'DfT',
  'Department for Energy Security and Net Zero':        'DESNZ',
  'Foreign, Commonwealth and Development Office':       'FCDO',
};

function mapAnsweringBody(name) {
  return PQ_ANSWERING_BODY_LABELS[name] || name;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// Most questionText values open with a fixed preamble ("To ask His
// Majesty's Government ..." / "To ask the Secretary of State for X, ...")
// before the actual question content. Stripped, with the remaining text
// re-capitalised, so it reads as a standalone sentence rather than a
// fragment starting mid-clause ("why no..." -> "Why no..."). Leaves text
// unchanged if it doesn't match either common preamble form.
function stripQuestionPreamble(text) {
  const stripped = text.replace(
    /^To ask (?:His Majesty's Government|Her Majesty's Government|the (?:Secretary of State|Minister|Chancellor|Prime Minister)[^,]*),?\s*/i,
    ''
  );
  if (stripped === text) return text;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

// memberName/memberParty are surfaced separately (rather than folded into
// context as before) so the render layer can use the asking member as the
// item headline. Both are null when askingMember data is missing — the
// render layer falls back to the topic heading as the headline in that case.
function mapQuestionToItem(v) {
  const dateTabled = (v.dateTabled || '').slice(0, 10);
  const member = v.askingMember;
  return {
    id:            'PQ:' + v.uin,
    house:         v.house,
    label:         mapAnsweringBody(v.answeringBodyName || ''),
    memberName:    (member && member.name) || null,
    memberParty:   (member && member.partyAbbreviation) || null,
    title:         v.heading || truncate(stripQuestionPreamble(v.questionText || ''), 80),
    date:          dateTabled,
    dateAnswered:  v.dateAnswered ? v.dateAnswered.slice(0, 10) : null,
    context:       truncate(stripQuestionPreamble(v.questionText || ''), 180),
    url:           `https://questions-statements.parliament.uk/written-questions/detail/${dateTabled}/${v.uin}`,
  };
}

async function fetchParliamentaryQuestions() {
  const chunks = chunkArray(KEYWORDS, PQ_CHUNK_SIZE);

  const results = await Promise.allSettled(
    chunks.map(chunk => {
      const searchTerm = encodeURIComponent(chunk.join(' '));
      const url = `${PQ_API_BASE}?searchTerm=${searchTerm}&tabledWhenFrom=${PARLIAMENT_START}&expandMember=true&take=${PQ_TAKE}`;
      return fetch(url).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    })
  );

  const seenIds = new Set();
  const items = [];

  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      for (const r of (result.value.results || [])) {
        const v = r.value;
        if (seenIds.has(v.id)) continue;
        seenIds.add(v.id);
        items.push(mapQuestionToItem(v));
      }
    } else {
      console.warn(`[DCI] PQ chunk ${i} (${chunks[i].join(', ')}) fetch failed:`, result.reason);
    }
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items;
}

// PQ-specific relevance filter — NOT used by matchesKeyword() or any
// gov.uk/Policy tracker source. Several KEYWORDS terms are too broad
// against Parliament's unscoped full-text search to be useful alone —
// they only work as filters on gov.uk because that search is already
// scoped to a relevant department. Every KEYWORDS term not listed below
// still matches on its own bare presence, unchanged.
//
// - mobile / infrastructure / satellite: fine on gov.uk, noisy here
//   (e.g. "Mobile Power" aid programme, Ofgem electricity infrastructure,
//   MoD Skynet/satellite procurement, NHS "satellite radiotherapy units")
//   — require a telecoms-specific compound phrase nearby instead of the
//   bare word.
// - Ofcom: a regulator name covering broadcasting, post, and online
//   safety as well as telecoms (e.g. a Supreme Court gender-identity
//   case referencing Ofcom's broadcasting remit) — a fixed phrase list
//   doesn't fit a proper noun the way it does a common noun, so instead
//   requires co-occurrence with ANY other KEYWORDS term as corroboration.
//
// Every tightened term stays unchanged in the actual API searchTerm query
// (this is a client-side filter applied after fetching, not a change to
// what's searched for), so recall/speed are unaffected.
const PQ_TIGHTENED_TERMS = {
  mobile: [
    'mobile broadband', 'mobile coverage', 'mobile network', 'mobile phone',
    'mobile mast', 'mobile operator', 'mobile signal', 'mobile connectivity',
    'mobile infrastructure', 'mobile market',
  ],
  infrastructure: [
    'digital infrastructure', 'telecoms infrastructure', 'telecommunications infrastructure',
    'broadband infrastructure', 'network infrastructure', 'mobile infrastructure',
    'critical national infrastructure', 'connectivity infrastructure',
  ],
  satellite: [
    'satellite broadband', 'satellite communications', 'satellite connectivity',
    'satellite internet', 'satellite network',
  ],
  ofcom: null, // special case: needs co-occurrence with any OTHER KEYWORDS term
};

function matchesPQRelevance(item) {
  const text = (item.title + ' ' + item.context).toLowerCase();
  const tightened = new Set(Object.keys(PQ_TIGHTENED_TERMS));

  const freeMatch = KEYWORDS.some(kw => {
    const lower = kw.toLowerCase();
    return !tightened.has(lower) && text.includes(lower);
  });
  if (freeMatch) return true;

  for (const kw of KEYWORDS) {
    const lower = kw.toLowerCase();
    if (!tightened.has(lower) || !text.includes(lower)) continue;

    const compounds = PQ_TIGHTENED_TERMS[lower];
    if (compounds) {
      if (compounds.some(phrase => text.includes(phrase))) return true;
    } else {
      const corroborated = KEYWORDS.some(other => {
        const otherLower = other.toLowerCase();
        return otherLower !== lower && text.includes(otherLower);
      });
      if (corroborated) return true;
    }
  }
  return false;
}

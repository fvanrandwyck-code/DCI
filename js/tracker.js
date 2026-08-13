// ── Configuration ──────────────────────────────────────────────────────────────
//
// When real RSS feeds are confirmed, replace the placeholder URLs below.
// DSIT no longer exists (abolished July 2026 machinery-of-government change);
// DCMS is now the lead department for telecoms/broadband/mobile.
//
const FEED_SOURCES = [
  {
    id: 'DCMS',
    label: 'DCMS',
    // TODO: confirm current feed URL after July 2026 MoG change
    feedUrl: 'https://www.gov.uk/government/organisations/department-for-culture-media-and-sport.atom',
  },
  {
    id: 'Ofcom',
    label: 'Ofcom',
    // TODO: confirm current Ofcom news feed URL
    feedUrl: 'https://www.ofcom.org.uk/news-centre/rss',
  },
  {
    id: 'DBIST',
    label: 'DBIST',
    // TODO: confirm DBIST feed URL (tech/innovation policy read-across)
    feedUrl: 'https://www.gov.uk/government/organisations/department-for-business-and-trade.atom',
  },
];

// Keywords used to filter items for telecoms relevance.
// Extend this list as coverage needs change.
const KEYWORDS = [
  'telecoms', 'telecom', 'broadband', 'mobile', 'spectrum',
  '5G', '4G', 'fibre', 'fiber', 'Ofcom', 'BDUK', 'Openreach',
  'gigabit', 'connectivity', 'infrastructure', 'network',
  'rollout', 'coverage', 'roaming', 'satellite',
];

// ── Dummy entries ──────────────────────────────────────────────────────────────
//
// Placeholder data in the same shape as real RSS items will produce.
// Replace with live feed data once URLs are confirmed.
//
const DUMMY_ENTRIES = [
  {
    id: 'dummy-1',
    source: 'Ofcom',
    date: '2026-08-11',
    title: 'Ofcom opens consultation on 26 GHz spectrum band for 5G fixed wireless access',
    context: 'Ofcom is seeking views on licensing conditions for the 26 GHz millimetre wave band, which operators have flagged as important for fixed wireless access in rural areas not yet reached by full-fibre.',
    url: '#',
  },
  {
    id: 'dummy-2',
    source: 'DCMS',
    date: '2026-08-09',
    title: 'DCMS publishes response to the telecoms security framework review',
    context: 'The department has set out its conclusions following the 18-month review of the Telecommunications (Security) Act 2021, confirming the designation regime for high-risk vendors will remain in place with minor procedural updates.',
    url: '#',
  },
  {
    id: 'dummy-3',
    source: 'DBIST',
    date: '2026-08-07',
    title: 'DBIST and DCMS launch joint AI connectivity working group',
    context: 'The new group will examine whether existing broadband and mobile infrastructure is sufficient to support AI adoption in SMEs, with a particular focus on rural and semi-rural business connectivity.',
    url: '#',
  },
  {
    id: 'dummy-4',
    source: 'Ofcom',
    date: '2026-08-04',
    title: 'Ofcom enforcement action: operator fined for misleading broadband speed advertising',
    context: 'Ofcom has issued a £2.4m penalty following a finding that speeds advertised at the point of sale were not achievable for a significant proportion of customers during peak hours.',
    url: '#',
  },
  {
    id: 'dummy-5',
    source: 'DCMS',
    date: '2026-07-31',
    title: 'Minister statement: Gigabit Broadband Voucher Scheme extended to 2027',
    context: 'The Secretary of State confirmed the extension in a written ministerial statement, citing slower-than-projected uptake in rural premises eligible for the scheme and pressure from operators for longer planning horizons.',
    url: '#',
  },
  {
    id: 'dummy-6',
    source: 'Ofcom',
    date: '2026-07-28',
    title: 'Ofcom publishes annual Connected Nations report — coverage and speeds data updated',
    context: 'The report shows 79% of UK premises can now access gigabit-capable broadband, up from 70% a year ago, though mobile 5G outdoor coverage remains concentrated in urban areas and along major transport corridors.',
    url: '#',
  },
  {
    id: 'dummy-7',
    source: 'DCMS',
    date: '2026-07-24',
    title: 'DCMS consults on shared rural network obligations ahead of 2027 review',
    context: 'With the Shared Rural Network agreement between the four mobile operators due for review in 2027, DCMS is seeking evidence on whether current partial not-spots obligations are being met and whether the coverage definition should be updated.',
    url: '#',
  },
  {
    id: 'dummy-8',
    source: 'DBIST',
    date: '2026-07-18',
    title: 'DBIST innovation strategy flags connectivity as enabling condition for industrial policy',
    context: 'The strategy document positions reliable broadband and mobile connectivity as a prerequisite for the government\'s broader industrial policy goals, recommending closer coordination between DCMS and DBIST on infrastructure investment planning.',
    url: '#',
  },
];

// ── State ──────────────────────────────────────────────────────────────────────

let activeSource = 'all';

// ── Functions ──────────────────────────────────────────────────────────────────

function matchesKeyword(item) {
  const text = (item.title + ' ' + item.context).toLowerCase();
  return KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

function getVisibleItems() {
  return DUMMY_ENTRIES.filter(item => {
    const sourceMatch = activeSource === 'all' || item.source === activeSource;
    const keywordMatch = matchesKeyword(item);
    return sourceMatch && keywordMatch;
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderFeed() {
  const container = document.getElementById('feed-container');
  const items = getVisibleItems();

  if (items.length === 0) {
    container.innerHTML = '<p class="no-results">No items match the current filter.</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="feed-item" data-source="${item.source}">
      <p class="feed-item-meta">
        <span class="source-tag">${item.source}</span>
        <span>${formatDate(item.date)}</span>
      </p>
      <h3><a href="${item.url}">${item.title}</a></h3>
      <p>${item.context}</p>
    </article>
  `).join('');
}

function filterFeed(source, buttonEl) {
  activeSource = source;

  document.querySelectorAll('.source-filters button').forEach(btn => {
    btn.classList.toggle('active', btn === buttonEl);
  });

  renderFeed();
}

// ── Live feed fetching (stub) ──────────────────────────────────────────────────
//
// When real feed URLs are confirmed, this function replaces DUMMY_ENTRIES.
// RSS feeds are XML — they can't be fetched directly from the browser via
// fetch() due to CORS. Options when wiring this up:
//
//   1. Use a proxy service (e.g. rss2json.com, RSS.app) that returns JSON.
//   2. Use a dedicated RSS aggregation tool embedded via iframe (Feedspot,
//      RSS.app widget) — zero maintenance, replaces this JS entirely.
//   3. Route feeds via a serverless function (Cloudflare Worker, Netlify
//      Function) that fetches, parses, and returns JSON to the client.
//
// Option 2 is likely the right starting point given the project setup.
//
async function fetchLiveFeeds() {
  // TODO: implement when feed URLs and proxy approach are confirmed.
  // For each source in FEED_SOURCES:
  //   1. Fetch via proxy (e.g. `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.feedUrl)}`)
  //   2. Parse returned items
  //   3. Filter by KEYWORDS
  //   4. Merge and sort by date descending
  //   5. Call renderFeed() with live data instead of DUMMY_ENTRIES
  console.log('Live feed fetching not yet implemented — using dummy entries.');
}

// ── Init ───────────────────────────────────────────────────────────────────────

(function init() {
  renderFeed();
  // fetchLiveFeeds(); // uncomment when live feed integration is ready
})();

// ── State ──────────────────────────────────────────────────────────────────────

const PQ_PAGE_SIZE = 20;
let visibleItems  = [];  // full merged pool (questions + statements), append-only
let activeFilter  = 'all'; // 'all' | 'question' | 'statement'
let shownCount    = 0;   // position within the CURRENTLY FILTERED view

// Items matching the active content-type filter — the underlying pool
// (visibleItems) always holds both types regardless of which filter is
// selected, so switching filters never needs a new fetch.
function getFilteredItems() {
  if (activeFilter === 'all') return visibleItems;
  return visibleItems.filter(item => item.contentType === activeFilter);
}

// ── Item rendering ─────────────────────────────────────────────────────────────
// Headline/meta-line construction (buildPoliticsHeadline, buildPoliticsMetaLine)
// lives in dci-data.js — shared with the homepage's "Latest Questions &
// Statements" section. Works for both item.contentType 'question' and
// 'statement' items in this same merged feed.

function renderItemHtml(item) {
  const metaLine = buildPoliticsMetaLine(item);
  const { html: headlineText, className: h3Class } = buildPoliticsHeadline(item);

  return `
    <article class="feed-item">
      <h3 class="${h3Class}"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${headlineText}</a></h3>
      <p class="feed-item-meta">${metaLine}</p>
      ${item.context ? `<p>${escapeHtml(item.context)}</p>` : ''}
    </article>`;
}

// ── Parliamentary Business (Sitting Status + Debates & Committees) ─────────────

function renderSittingStatus(statuses) {
  const container = document.getElementById('sitting-status');
  container.innerHTML = statuses.map(s => {
    const dotClass = s.sitting ? 'sitting-dot-sitting' : 'sitting-dot-recess';
    const verb = s.sitting ? 'Sitting' : 'Recess';
    const dateText = s.date ? ` until ${formatDate(s.date)}` : '';
    return `<p class="sitting-status-line"><span class="sitting-dot ${dotClass}"></span>${escapeHtml(s.house)}: ${verb}${dateText}</p>`;
  }).join('');
}

function renderCommitteeEventHtml(item) {
  const metaLine = [escapeHtml(item.house), 'Committee', formatDate(item.date), escapeHtml(item.committee)].join(' | ');
  return `
    <article class="feed-item">
      <h3 class="${pqHouseClass(item.house)}"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
      <p class="feed-item-meta">${metaLine}</p>
      ${item.context ? `<p>${escapeHtml(item.context)}</p>` : ''}
    </article>`;
}

// bill here is the result of merging a js/manual-bills.js entry
// ({ billId, context }) with its fetched record from
// data/bills-data.json (title, url, status, stage history, etc.) — see
// renderBillsToWatch() below for where that merge happens. A bill listed
// in manual-bills.js but never yet present in the fetched data (just
// added, build hasn't run) gets a synthesised 'unavailable' stub with
// the same shape, so this function never has to special-case "missing"
// vs. "fetched but status unavailable" — they're identical by the time
// they get here.
function renderBillHtml(bill) {
  if (bill.status === 'unavailable') {
    return `
    <article class="feed-item">
      <h3><a href="${escapeHtml(bill.url)}" target="_blank" rel="noopener">${escapeHtml(bill.title || `Bill ${bill.billId}`)}</a></h3>
      <p class="feed-item-meta">Status unavailable</p>
      <p>${escapeHtml(bill.context)}</p>
    </article>`;
  }

  // Royal Assent gets the full tracker (status 'act'); withdrawn/defeated
  // get the status line only, no tracker — there's no "position in the
  // process" left to usefully show once a bill has died.
  const showTracker = bill.status === 'active' || bill.status === 'act';
  const lastActivity = bill.lastStageActivityDate
    ? `<p class="feed-item-meta">Last stage activity: ${formatDate(bill.lastStageActivityDate)}</p>`
    : '';

  return `
    <article class="feed-item">
      <h3 class="${pqHouseClass(bill.currentHouse)}"><a href="${escapeHtml(bill.url)}" target="_blank" rel="noopener">${escapeHtml(bill.title)}</a></h3>
      <p class="feed-item-meta">${escapeHtml(buildBillStatusLine(bill))}</p>
      ${showTracker ? renderStageTracker(bill) : ''}
      ${lastActivity}
      <p>${escapeHtml(bill.context)}</p>
    </article>`;
}

const BILLS_DATA_URL = 'data/bills-data.json';

function billUnavailableStub(entry) {
  return {
    billId: entry.billId,
    title: null,
    url: `https://bills.parliament.uk/bills/${entry.billId}`,
    status: 'unavailable',
    currentHouse: null, currentStageName: null, currentStageHouse: null,
    nextMilestone: null, lastStageActivityDate: null, lastConfirmedAt: null, stages: [],
    context: entry.context,
  };
}

// The oldest lastConfirmedAt among the currently-listed bills — NOT the
// fetched file's own generatedAt, which only says when the build script
// last RAN, not when every listed bill was last successfully confirmed.
// A held-back bill (see build-bills-data.mjs's backwards-move/
// unrecognized-stage safeguards) carries its lastConfirmedAt forward
// unchanged from whenever it was last actually confirmed, which can be
// well before the file's generatedAt — using the oldest value here means
// the freshness label can never overstate how current the stalest card
// on screen actually is. A bill that's never been confirmed at all
// (lastConfirmedAt: null, e.g. a brand new listing or persistent
// failure) is excluded from this calculation rather than treated as
// "infinitely stale" — there's a separate "Status unavailable" card for
// that case already.
function oldestLastConfirmedAt(bills) {
  const known = bills.map(b => b.lastConfirmedAt).filter(Boolean);
  if (known.length === 0) return null;
  return known.reduce((oldest, iso) => (iso < oldest ? iso : oldest));
}

// Merges js/manual-bills.js's { billId, context } list with
// data/bills-data.json's fetched records at render time — the manual
// file owns WHICH bills appear and the editorial text; everything else
// (title, URL, stage, status) comes from the fetched file. A bill
// listed but not yet present in the fetched data (just added, or every
// fetch attempt has failed so far) renders the same 'unavailable' stub
// renderBillHtml() already knows how to draw.
async function renderBillsToWatch() {
  const container = document.getElementById('bills-to-watch');
  container.innerHTML = '<p class="no-results">Loading…</p>';

  let fetchedBills = [];
  try {
    const res = await fetch(BILLS_DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    fetchedBills = data.bills || [];
  } catch (err) {
    console.warn('[DCI] Bills data fetch failed:', err);
  }

  const fetchedById = new Map(fetchedBills.map(b => [b.billId, b]));
  const merged = MANUAL_BILLS.map(entry => {
    const fetched = fetchedById.get(entry.billId);
    return fetched ? { ...fetched, context: entry.context } : billUnavailableStub(entry);
  });

  renderBillsFreshnessLabel(oldestLastConfirmedAt(merged));

  container.innerHTML = merged.length === 0
    ? '<p class="no-results">No bills currently being tracked.</p>'
    : merged.map(renderBillHtml).join('');
}

// ── Data freshness label ────────────────────────────────────────────────────
// All Parliament-sourced data on this page (Questions, Statements, Sitting
// Status, Committee events) comes from one pre-built static file rather
// than a live fetch — see POLITICS_DATA_URL below. This label makes that
// batch-refresh cadence transparent rather than silently implying
// real-time data.

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderFreshnessLabel(iso) {
  const el = document.getElementById('data-freshness');
  if (!el) return;
  el.textContent = iso ? `Parliamentary data last refreshed ${formatDateTime(iso)}.` : '';
}

// Same pattern, separate label — Bills to Watch is fetched on its own
// schedule (.github/workflows/refresh-bills-data.yml), independent of
// the Questions/Statements/Sitting Status/Committee events refresh
// above, so it gets its own "as of" timestamp rather than sharing one.
function renderBillsFreshnessLabel(iso) {
  const el = document.getElementById('bills-freshness');
  if (!el) return;
  el.textContent = iso ? `Bill status refreshed ${formatDateTime(iso)}.` : '';
}

// ── Load more (reveals more of the already-fetched batch — no new fetch) ───────

function appendRendered(items) {
  const container = document.getElementById('feed-container');
  container.insertAdjacentHTML('beforeend', items.map(renderItemHtml).join(''));
}

function updateLoadMoreButton() {
  const btn = document.getElementById('load-more-btn');
  if (!btn) return;
  btn.style.display = shownCount >= getFilteredItems().length ? 'none' : '';
}

function loadMore() {
  const filtered = getFilteredItems();
  const next = filtered.slice(shownCount, shownCount + PQ_PAGE_SIZE);
  appendRendered(next);
  shownCount += next.length;
  updateLoadMoreButton();
}

// ── Content-type filter (All / Questions / Statements) ─────────────────────────
// Filters the already-loaded visibleItems pool — no new fetch, same
// principle as loadMore() above. A full re-render, mirroring the Policy
// tracker's filterFeed()/renderFeed() pattern.

function renderFeed() {
  const container = document.getElementById('feed-container');

  // visibleItems arrives pre-sorted from data/politics-data.json, but a
  // full rebuild is cheap and this keeps renderFeed() correct regardless
  // of caller — always a full, clean re-render, never a partial update.
  visibleItems.sort((a, b) => b.date.localeCompare(a.date));

  const filtered = getFilteredItems();
  const firstPage = filtered.slice(0, PQ_PAGE_SIZE);

  container.innerHTML = firstPage.length === 0
    ? '<p class="no-results">No telecoms-relevant items for this filter.</p>'
    : firstPage.map(renderItemHtml).join('');

  shownCount = firstPage.length;
  updateLoadMoreButton();
}

function filterFeed(filter, buttonEl) {
  activeFilter = filter;
  document.querySelectorAll('.source-filters button').forEach(btn => {
    btn.classList.toggle('active', btn === buttonEl);
  });
  renderFeed();
}

// ── Init ───────────────────────────────────────────────────────────────────────
//
// All Parliament-sourced content on this page — Questions, Statements,
// Sitting Status, Committee events, AND Bills to Watch — now comes from
// pre-built static files rather than live client-side fetches (both
// questions-statements-api/whatson-api and bills-api.parliament.uk took
// 8-20+ seconds live, and bills-api has no CORS support at all, so it
// was never fetchable from the browser regardless). Politics data is
// refreshed by .github/workflows/refresh-politics-data.yml (see
// scripts/build-politics-data.mjs); Bills data by the separate
// refresh-bills-data.yml (see scripts/build-bills-data.mjs) — two
// independent files, two independent freshness labels, fetched here in
// parallel rather than one blocking the other.
const POLITICS_DATA_URL = 'data/politics-data.json';

async function init() {
  const billsPromise = renderBillsToWatch();

  const container = document.getElementById('feed-container');
  container.innerHTML = '<p class="no-results">Loading…</p>';
  document.getElementById('sitting-status').innerHTML = '<p class="no-results">Loading…</p>';
  document.getElementById('committee-events').innerHTML = '<p class="no-results">Loading…</p>';

  let data;
  try {
    const res = await fetch(POLITICS_DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.warn('[DCI] Politics data fetch failed:', err);
    container.innerHTML = '<p class="no-results">Parliamentary data unavailable.</p>';
    document.getElementById('sitting-status').innerHTML = '<p class="no-results">Sitting status unavailable.</p>';
    document.getElementById('committee-events').innerHTML = '<p class="no-results">Committee schedule unavailable.</p>';
    return;
  }

  renderFreshnessLabel(data.generatedAt);

  visibleItems = data.items || [];
  if (visibleItems.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant parliamentary questions or statements found.</p>';
    shownCount = 0;
    updateLoadMoreButton();
  } else {
    renderFeed();
  }

  renderSittingStatus(data.sittingStatus || []);

  const events = data.committeeEvents || [];
  document.getElementById('committee-events').innerHTML = events.length === 0
    ? '<p class="no-results">No telecoms-relevant committee sessions scheduled in the next 30 days.</p>'
    : events.map(renderCommitteeEventHtml).join('');

  await billsPromise;
}

init();

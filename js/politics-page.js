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

function renderBillHtml(bill) {
  return `
    <article class="feed-item">
      <h3 class="${pqHouseClass(bill.house)}"><a href="${escapeHtml(bill.url)}" target="_blank" rel="noopener">${escapeHtml(bill.title)}</a></h3>
      <p class="feed-item-meta">${escapeHtml(buildBillStatusLine(bill))}</p>
      ${renderStageTracker(bill)}
      ${bill.stageDetail ? `<p>${escapeHtml(bill.stageDetail)}</p>` : ''}
      <p>${escapeHtml(bill.context)}</p>
    </article>`;
}

function renderBillsToWatch() {
  const container = document.getElementById('bills-to-watch');
  container.innerHTML = MANUAL_BILLS.length === 0
    ? '<p class="no-results">No bills currently being tracked.</p>'
    : MANUAL_BILLS.map(renderBillHtml).join('');
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
// Sitting Status, and Committee events — now comes from ONE pre-built
// static file rather than live client-side fetches against Parliament's
// API (which took 8-20+ seconds even with progressive rendering). The
// file is refreshed on a schedule by a GitHub Action
// (.github/workflows/refresh-politics-data.yml), which runs the exact
// same fetch/filter functions below server-side (see
// scripts/build-politics-data.mjs) — this page just loads the result.
// Bills to Watch stays separate (manual-bills.js, hand-curated, no
// fetch involved either way).
const POLITICS_DATA_URL = 'data/politics-data.json';

async function init() {
  renderBillsToWatch();

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
}

init();

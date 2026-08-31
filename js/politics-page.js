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

// Used while chunks are still streaming in: reveals newly-arrived items
// (of whichever content type is currently filtered) only until the first
// page is full, then stops — anything beyond that waits for an explicit
// "Load more" click, same contract as loadMore() above. Keeps progressive
// rendering from fighting with pagination.
function revealUpToFirstPage() {
  if (shownCount >= PQ_PAGE_SIZE) return;
  const filtered = getFilteredItems();
  const target = Math.min(PQ_PAGE_SIZE, filtered.length);
  const next = filtered.slice(shownCount, target);
  if (next.length === 0) return;
  appendRendered(next);
  shownCount = target;
}

// ── Content-type filter (All / Questions / Statements) ─────────────────────────
// Filters the already-loaded visibleItems pool — no new fetch, same
// principle as loadMore() above. A full re-render, mirroring the Policy
// tracker's filterFeed()/renderFeed() pattern.

function renderFeed() {
  const container = document.getElementById('feed-container');

  // Full rebuild — nothing on screen to protect, unlike during streaming
  // (see init()'s settle-time comment: that sort only ever covers the
  // *unrevealed* tail, leaving the originally-streamed prefix in arrival
  // order for DOM stability). A user-triggered filter switch has no such
  // constraint, so this is the moment to canonicalise ordering — without
  // it, switching filters and back re-exposes that stale prefix instead
  // of a true top-N-by-date.
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

async function init() {
  const container = document.getElementById('feed-container');
  container.innerHTML = '<p class="no-results">Fetching Parliamentary data — this can take up to 20 seconds…</p>';

  visibleItems = [];
  shownCount = 0;
  let loadingMessageCleared = false;

  // Questions and Statements stream into the same callback — both content
  // types merge into one array as their chunks land, no separate merge
  // step needed. Statement chunks tend to resolve much faster than
  // question chunks, so they're often what fills the first page initially.
  const onChunk = newRawItems => {
    const relevant = newRawItems.filter(matchesPQRelevance);
    if (relevant.length === 0) return;

    if (!loadingMessageCleared) {
      container.innerHTML = '';
      loadingMessageCleared = true;
    }

    visibleItems.push(...relevant);
    revealUpToFirstPage();
    updateLoadMoreButton();
  };

  await Promise.all([
    fetchParliamentaryQuestionsStreaming(onChunk),
    fetchWrittenStatementsStreaming(onChunk),
  ]);

  // Every chunk (both types) has now settled. During streaming,
  // revealUpToFirstPage() only ever appended new items without a full
  // re-sort, so the initially-revealed prefix is still in raw
  // chunk-arrival order, not necessarily correct date order — an item
  // that arrived slightly later in a slower chunk could rank ahead of
  // it by date but never get the chance to displace it (this was the
  // actual bug: that prefix was never revisited, so such items stayed
  // permanently hidden below the fold even after loading finished).
  // Now that every chunk is in, do a ONE-TIME full re-sort + re-render
  // via renderFeed() — same function the filter buttons already use, so
  // this also respects whichever filter is currently active. A single
  // reflow at the exact moment loading completes is expected; nothing
  // re-sorts again after this, so already-read content won't shift later.
  if (visibleItems.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant parliamentary questions or statements found.</p>';
  } else {
    renderFeed();
  }
}

init();

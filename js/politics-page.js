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

  // Every chunk (both types) has now settled. Items already on screen
  // keep their position — only the not-yet-revealed remainder gets
  // sorted, so "Load more" pulls in correct date order from here on.
  const shown = visibleItems.slice(0, shownCount);
  const rest  = visibleItems.slice(shownCount).sort((a, b) => b.date.localeCompare(a.date));
  visibleItems = shown.concat(rest);
  updateLoadMoreButton();

  if (visibleItems.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant parliamentary questions or statements found.</p>';
  }
}

init();

// ── State ──────────────────────────────────────────────────────────────────────

const PQ_PAGE_SIZE = 20;
let visibleItems = [];
let shownCount   = 0;

// ── Item rendering ─────────────────────────────────────────────────────────────
// Headline/meta-line construction (buildQuestionHeadline, buildQuestionMetaLine)
// lives in dci-data.js — shared with the homepage's "Latest Questions" section.

function renderItemHtml(item) {
  const metaLine = buildQuestionMetaLine(item);
  const { html: headlineText, className: h3Class } = buildQuestionHeadline(item);

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
  btn.style.display = shownCount >= visibleItems.length ? 'none' : '';
}

function loadMore() {
  const next = visibleItems.slice(shownCount, shownCount + PQ_PAGE_SIZE);
  appendRendered(next);
  shownCount += next.length;
  updateLoadMoreButton();
}

// Used while chunks are still streaming in: reveals newly-arrived items
// only until the first page is full, then stops — anything beyond that
// waits for an explicit "Load more" click, same contract as loadMore()
// above. Keeps progressive rendering from fighting with pagination.
function revealUpToFirstPage() {
  if (shownCount >= PQ_PAGE_SIZE) return;
  const target = Math.min(PQ_PAGE_SIZE, visibleItems.length);
  const next = visibleItems.slice(shownCount, target);
  if (next.length === 0) return;
  appendRendered(next);
  shownCount = target;
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  const container = document.getElementById('feed-container');
  container.innerHTML = '<p class="no-results">Fetching Parliamentary data — this can take up to 20 seconds…</p>';

  visibleItems = [];
  shownCount = 0;
  let loadingMessageCleared = false;

  await fetchParliamentaryQuestionsStreaming(newRawItems => {
    const relevant = newRawItems.filter(matchesPQRelevance);
    if (relevant.length === 0) return;

    if (!loadingMessageCleared) {
      container.innerHTML = '';
      loadingMessageCleared = true;
    }

    visibleItems.push(...relevant);
    revealUpToFirstPage();
    updateLoadMoreButton();
  });

  // Every chunk has now settled. Items already on screen keep their
  // position — only the not-yet-revealed remainder gets sorted, so
  // "Load more" pulls in correct date order from here on.
  const shown = visibleItems.slice(0, shownCount);
  const rest  = visibleItems.slice(shownCount).sort((a, b) => b.date.localeCompare(a.date));
  visibleItems = shown.concat(rest);
  updateLoadMoreButton();

  if (visibleItems.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant parliamentary questions found.</p>';
  }
}

init();

// ── State ──────────────────────────────────────────────────────────────────────

let allItems       = [];
let activeSource   = 'all';
let paginationState = null;
let seenUrls       = null;
let loadingMore    = false;

// ── Item rendering ─────────────────────────────────────────────────────────────

function renderItemHtml(item) {
  return `
    <article class="feed-item" data-source="${escapeHtml(item.group)}">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(item.label)}</span>
        ${item.type ? `<span class="type-tag">${escapeHtml(item.type)}</span>` : ''}
        <span>${formatDate(item.date)}</span>
      </p>
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
      ${item.context ? `<p>${escapeHtml(item.context)}</p>` : ''}
      ${renderDeadlineBar(item)}
    </article>`;
}

// ── Open consultations ────────────────────────────────────────────────────────
// Moved here from the homepage — same filter/sort logic and deadline-bar
// treatment, just plain .feed-item spacing now that it's a full section on
// its own page rather than a condensed homepage card.

function renderOpenConsultations(consultationItems) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const open = consultationItems
    .filter(item =>
      item.deadline &&
      new Date(item.deadline) > today &&
      matchesKeyword(item)
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline)); // closest deadline first

  const container = document.getElementById('open-consultations');

  if (open.length === 0) {
    container.innerHTML = '<p class="no-results">No open telecoms consultations or calls for evidence at the moment.</p>';
    return;
  }

  container.innerHTML = open.map(item => `
    <article class="feed-item">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(item.label)}</span>
        <span class="type-tag">${escapeHtml(item.type)}</span>
      </p>
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
      ${renderDeadlineBar(item)}
    </article>
  `).join('');
}

// ── Visible items ──────────────────────────────────────────────────────────────

function getVisibleItems() {
  return allItems.filter(item => {
    const groupMatch = activeSource === 'all' || item.group === activeSource;
    return groupMatch && matchesKeyword(item);
  });
}

// ── Full feed render (used on init and filter change) ─────────────────────────

function renderFeed() {
  const container = document.getElementById('feed-container');
  const items = getVisibleItems();

  container.innerHTML = items.length === 0
    ? '<p class="no-results">No telecoms-relevant items found for this source.</p>'
    : items.map(renderItemHtml).join('');

  setLoadMoreStatus('');
}

// ── Load more UI helpers ───────────────────────────────────────────────────────

function setLoadMoreStatus(msg) {
  const el = document.getElementById('load-more-status');
  if (el) el.textContent = msg;
}

function isAllExhausted() {
  if (!paginationState) return true;
  for (const [groupId, group] of Object.entries(SOURCES)) {
    for (const org of group.orgs) {
      if (!paginationState.exhaustedKeys.has(`${groupId}:${org.slug}`)) return false;
    }
  }
  return true;
}

function updateLoadMoreButton(allExhausted) {
  const btn = document.getElementById('load-more-btn');
  if (!btn) return;
  if (allExhausted) {
    btn.style.display = 'none';
    setLoadMoreStatus('No earlier items.');
  } else {
    btn.style.display = '';
    btn.disabled = false;
    btn.textContent = 'Load more';
  }
}

// ── Load more handler ──────────────────────────────────────────────────────────

async function loadMore() {
  if (loadingMore || !paginationState) return;
  loadingMore = true;

  const btn = document.getElementById('load-more-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  setLoadMoreStatus('');

  const { newItems, allExhausted } = await fetchMoreItems(paginationState, seenUrls);

  // Merge into allItems and re-sort (new items are always older, but inter-org
  // ordering within the batch may vary, so re-sort the full list).
  allItems = [...allItems, ...newItems].sort((a, b) => b.date.localeCompare(a.date));

  // Determine which new items are visible under the current filter.
  const visibleNew = newItems.filter(item => {
    const groupMatch = activeSource === 'all' || item.group === activeSource;
    return groupMatch && matchesKeyword(item);
  });

  if (visibleNew.length > 0) {
    const container = document.getElementById('feed-container');
    const noResults = container.querySelector('.no-results');
    if (noResults) noResults.remove();
    container.insertAdjacentHTML('beforeend', visibleNew.map(renderItemHtml).join(''));
    setLoadMoreStatus('');
  } else if (!allExhausted) {
    setLoadMoreStatus('Checked further back — nothing new to show yet.');
  }

  updateLoadMoreButton(allExhausted);
  loadingMore = false;
}

// ── Filter button handler ──────────────────────────────────────────────────────

function filterFeed(source, buttonEl) {
  activeSource = source;
  document.querySelectorAll('.source-filters button').forEach(btn => {
    btn.classList.toggle('active', btn === buttonEl);
  });
  renderFeed();
  updateLoadMoreButton(isAllExhausted());
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('feed-container').innerHTML = '<p class="no-results">Loading…</p>';
  document.getElementById('open-consultations').innerHTML = '<p class="no-results">Loading…</p>';

  // Both fetches are started here, before either is awaited, and each
  // renders independently as soon as its own data lands — the main feed
  // must not wait on Open Consultations (or vice versa).
  const feedPromise = loadAllItems().then(result => {
    allItems        = result.items;
    seenUrls        = result.seenUrls;
    paginationState = result.paginationState;
    renderFeed();
    updateLoadMoreButton(isAllExhausted());
  });

  const consultationsPromise = fetchOpenConsultationsItems().then(renderOpenConsultations);

  await Promise.all([feedPromise, consultationsPromise]);
}

init();

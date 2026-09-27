// ── Rendering ──────────────────────────────────────────────────────────────────

function renderLatestPublications(allItems) {
  const recent = allItems
    .filter(item => matchesItemRelevance(item))
    .slice(0, 7);

  const container = document.getElementById('latest-publications');

  if (recent.length === 0) {
    container.innerHTML = '<p class="no-results">Nothing published in the last 7 days.</p>';
    return;
  }

  container.innerHTML = recent.map(item => `
    <article class="feed-item home-item">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(item.label)}</span>
        ${item.type ? `<span class="type-tag">${escapeHtml(item.type)}</span>` : ''}
        <span>${formatDate(item.date)}</span>
      </p>
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
    </article>
  `).join('');
}

const HOME_POLITICS_LIMIT = 7;

function renderPoliticsRowHtml(item) {
  const metaLine = buildPoliticsMetaLine(item);
  const { html: headlineText, className: h3Class } = buildPoliticsHeadline(item);

  return `
    <article class="feed-item home-item">
      <p class="feed-item-meta">${metaLine}</p>
      <h3 class="${h3Class}"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${headlineText}</a></h3>
    </article>`;
}

// ── Init ───────────────────────────────────────────────────────────────────────
//
// The Politics section loads the same pre-built static file politics.html
// uses (see js/politics-page.js's init() comment for the full picture) —
// a GitHub Action refreshes it on a schedule, so this is just a fast
// static-file fetch rather than a live call to Parliament's API.
const POLITICS_DATA_URL = 'data/politics-data.json';

async function init() {
  const publicationsEl = document.getElementById('latest-publications');
  const politicsEl      = document.getElementById('latest-questions');
  publicationsEl.innerHTML = '<p class="no-results">Loading…</p>';
  politicsEl.innerHTML      = '<p class="no-results">Loading…</p>';

  // Both fetches are started here, before either is awaited, so they run
  // concurrently rather than one blocking the other.
  const publicationsPromise = loadAllItems().then(({ items }) => {
    renderLatestPublications(items);
  });

  const politicsPromise = fetch(POLITICS_DATA_URL)
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
    .then(data => {
      const top = (data.items || []).slice(0, HOME_POLITICS_LIMIT);
      politicsEl.innerHTML = top.length === 0
        ? '<p class="no-results">No telecoms-relevant parliamentary questions or statements found.</p>'
        : top.map(renderPoliticsRowHtml).join('');
    })
    .catch(err => {
      console.warn('[DCI] Politics data fetch failed:', err);
      politicsEl.innerHTML = '<p class="no-results">Parliamentary data unavailable.</p>';
    });

  await Promise.all([publicationsPromise, politicsPromise]);
}

init();

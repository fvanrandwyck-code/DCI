// ── State ──────────────────────────────────────────────────────────────────────

let allItems = [];
let activeSource = 'all';

// ── Visible items ──────────────────────────────────────────────────────────────

function getVisibleItems() {
  return allItems.filter(item => {
    const groupMatch = activeSource === 'all' || item.group === activeSource;
    return groupMatch && matchesKeyword(item);
  });
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderFeed() {
  const container = document.getElementById('feed-container');
  const items = getVisibleItems();

  if (items.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant items found for this source.</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <article class="feed-item" data-source="${escapeHtml(item.group)}">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(item.label)}</span>
        ${item.type ? `<span class="type-tag">${escapeHtml(item.type)}</span>` : ''}
        <span>${formatDate(item.date)}</span>
      </p>
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
      ${item.context ? `<p>${escapeHtml(item.context)}</p>` : ''}
      ${renderDeadlineBar(item)}
    </article>
  `).join('');
}

// ── Filter button handler ──────────────────────────────────────────────────────

function filterFeed(source, buttonEl) {
  activeSource = source;
  document.querySelectorAll('.source-filters button').forEach(btn => {
    btn.classList.toggle('active', btn === buttonEl);
  });
  renderFeed();
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('feed-container').innerHTML = '<p class="no-results">Loading…</p>';
  allItems = await loadAllItems();
  renderFeed();
}

init();

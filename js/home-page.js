// ── Helpers ────────────────────────────────────────────────────────────────────

function daysSince(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / 86400000);
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function renderOpenConsultations(allItems) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const open = allItems
    .filter(item =>
      DEADLINE_TYPES.has(item.type) &&
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
    <article class="feed-item home-item">
      <p class="feed-item-meta">
        <span class="source-tag">${escapeHtml(item.label)}</span>
        <span class="type-tag">${escapeHtml(item.type)}</span>
      </p>
      <h3><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a></h3>
      ${renderDeadlineBar(item)}
    </article>
  `).join('');
}

function renderThisWeek(allItems) {
  const recent = allItems
    .filter(item => matchesKeyword(item) && daysSince(item.date) <= 7)
    .slice(0, 5);

  const container = document.getElementById('this-week');

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

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('open-consultations').innerHTML = '<p class="no-results">Loading…</p>';
  document.getElementById('this-week').innerHTML = '<p class="no-results">Loading…</p>';

  const allItems = await loadAllItems();

  renderOpenConsultations(allItems);
  renderThisWeek(allItems);
}

init();

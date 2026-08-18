// ── Rendering ──────────────────────────────────────────────────────────────────

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

function renderLatestPublications(allItems) {
  const recent = allItems
    .filter(item => matchesKeyword(item))
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

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  document.getElementById('open-consultations').innerHTML = '<p class="no-results">Loading…</p>';
  document.getElementById('latest-publications').innerHTML = '<p class="no-results">Loading…</p>';

  const [{ items: allItems }, consultationItems] = await Promise.all([
    loadAllItems(),
    fetchOpenConsultationsItems(),
  ]);

  renderOpenConsultations(consultationItems);
  renderLatestPublications(allItems);
}

init();

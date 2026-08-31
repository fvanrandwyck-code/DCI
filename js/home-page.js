// ── Rendering ──────────────────────────────────────────────────────────────────

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

async function init() {
  const publicationsEl = document.getElementById('latest-publications');
  const politicsEl      = document.getElementById('latest-questions');
  publicationsEl.innerHTML = '<p class="no-results">Loading…</p>';
  politicsEl.innerHTML      = '<p class="no-results">Fetching Parliamentary data — this can take up to 20 seconds…</p>';

  // Both fetches are started here, before either is awaited, so they run
  // concurrently rather than one blocking the other.
  const publicationsPromise = loadAllItems().then(({ items }) => {
    renderLatestPublications(items);
  });

  let politicsItems = [];
  let politicsShown = 0;
  let politicsLoadingCleared = false;

  // Questions and Statements stream into the same callback and share one
  // combined cap of 7 — same merge pattern as politics.html.
  const onChunk = newRawItems => {
    const relevant = newRawItems.filter(matchesPQRelevance);
    if (relevant.length === 0 || politicsShown >= HOME_POLITICS_LIMIT) return;

    if (!politicsLoadingCleared) {
      politicsEl.innerHTML = '';
      politicsLoadingCleared = true;
    }

    politicsItems.push(...relevant);
    const target = Math.min(HOME_POLITICS_LIMIT, politicsItems.length);
    const next = politicsItems.slice(politicsShown, target);
    if (next.length === 0) return;
    politicsEl.insertAdjacentHTML('beforeend', next.map(renderPoliticsRowHtml).join(''));
    politicsShown = target;
  };

  const politicsPromise = Promise.all([
    fetchParliamentaryQuestionsStreaming(onChunk),
    fetchWrittenStatementsStreaming(onChunk),
  ]).then(() => {
    if (politicsShown === 0) {
      politicsEl.innerHTML = '<p class="no-results">No telecoms-relevant parliamentary questions or statements found.</p>';
    }
  });

  await Promise.all([publicationsPromise, politicsPromise]);
}

init();

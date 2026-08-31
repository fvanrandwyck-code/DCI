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

  let politicsItems = [];  // full accumulated pool — always grows, never capped mid-stream
  let politicsShown = 0;   // how many rows are currently rendered (progressive reveal only)
  let politicsLoadingCleared = false;

  function revealUpToLimit() {
    if (politicsShown >= HOME_POLITICS_LIMIT) return;
    const target = Math.min(HOME_POLITICS_LIMIT, politicsItems.length);
    const next = politicsItems.slice(politicsShown, target);
    if (next.length === 0) return;
    politicsEl.insertAdjacentHTML('beforeend', next.map(renderPoliticsRowHtml).join(''));
    politicsShown = target;
  }

  // Questions and Statements stream into the same callback and share one
  // combined cap of 7 — same merge pattern as politics.html. Every
  // relevant item is accumulated into politicsItems regardless of the
  // display cap — capping *acceptance* (rather than just display) meant
  // later-arriving chunks were silently dropped rather than evaluated
  // against what was already shown.
  const onChunk = newRawItems => {
    const relevant = newRawItems.filter(matchesPQRelevance);
    if (relevant.length === 0) return;

    if (!politicsLoadingCleared) {
      politicsEl.innerHTML = '';
      politicsLoadingCleared = true;
    }

    politicsItems.push(...relevant);
    revealUpToLimit();
  };

  const politicsPromise = Promise.all([
    fetchParliamentaryQuestionsStreaming(onChunk),
    fetchWrittenStatementsStreaming(onChunk),
  ]).then(() => {
    // Every chunk has now settled. Streaming only ever appended in
    // arrival order, so without a final correction the homepage could
    // permanently show a stale top 7 even after every relevant item has
    // actually arrived — same one-time settle-time fix as politics.html.
    politicsItems.sort((a, b) => b.date.localeCompare(a.date));
    const top = politicsItems.slice(0, HOME_POLITICS_LIMIT);

    politicsEl.innerHTML = top.length === 0
      ? '<p class="no-results">No telecoms-relevant parliamentary questions or statements found.</p>'
      : top.map(renderPoliticsRowHtml).join('');
  });

  await Promise.all([publicationsPromise, politicsPromise]);
}

init();

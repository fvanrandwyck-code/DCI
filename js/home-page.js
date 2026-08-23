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

const HOME_QUESTIONS_LIMIT = 7;

function renderQuestionRowHtml(item) {
  const metaLine = buildQuestionMetaLine(item);
  const { html: headlineText, className: h3Class } = buildQuestionHeadline(item);

  return `
    <article class="feed-item home-item">
      <p class="feed-item-meta">${metaLine}</p>
      <h3 class="${h3Class}"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${headlineText}</a></h3>
    </article>`;
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  const publicationsEl = document.getElementById('latest-publications');
  const questionsEl    = document.getElementById('latest-questions');
  publicationsEl.innerHTML = '<p class="no-results">Loading…</p>';
  questionsEl.innerHTML    = '<p class="no-results">Fetching Parliamentary data — this can take up to 20 seconds…</p>';

  // Both fetches are started here, before either is awaited, so they run
  // concurrently rather than one blocking the other.
  const publicationsPromise = loadAllItems().then(({ items }) => {
    renderLatestPublications(items);
  });

  let questionItems = [];
  let questionsShown = 0;
  let questionsLoadingCleared = false;

  const questionsPromise = fetchParliamentaryQuestionsStreaming(newRawItems => {
    const relevant = newRawItems.filter(matchesPQRelevance);
    if (relevant.length === 0 || questionsShown >= HOME_QUESTIONS_LIMIT) return;

    if (!questionsLoadingCleared) {
      questionsEl.innerHTML = '';
      questionsLoadingCleared = true;
    }

    questionItems.push(...relevant);
    const target = Math.min(HOME_QUESTIONS_LIMIT, questionItems.length);
    const next = questionItems.slice(questionsShown, target);
    if (next.length === 0) return;
    questionsEl.insertAdjacentHTML('beforeend', next.map(renderQuestionRowHtml).join(''));
    questionsShown = target;
  }).then(() => {
    if (questionsShown === 0) {
      questionsEl.innerHTML = '<p class="no-results">No telecoms-relevant parliamentary questions found.</p>';
    }
  });

  await Promise.all([publicationsPromise, questionsPromise]);
}

init();

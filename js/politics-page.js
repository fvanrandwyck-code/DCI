// ── State ──────────────────────────────────────────────────────────────────────

const PQ_PAGE_SIZE = 20;
let visibleItems = [];
let shownCount   = 0;

// ── Item rendering ─────────────────────────────────────────────────────────────

function houseClass(house) {
  if (house === 'Commons') return 'pq-house-commons';
  if (house === 'Lords')   return 'pq-house-lords';
  return '';
}

function renderItemHtml(item) {
  // Plain pipe-separated meta line, all in the same light grey (inherited
  // from .feed-item-meta) — no per-element colour, no brackets. House
  // colouring lives only on the headline below.
  const metaParts = [escapeHtml(item.house), formatDate(item.date), escapeHtml(item.label)];
  if (!item.dateAnswered) metaParts.push('Awaiting answer');
  const metaLine = metaParts.join(' | ');

  // Single headline/link: "{member} ({party}) | {topic}" coloured by
  // house — pipe rather than colon, since topics often contain their own
  // colon (e.g. "South Eastern Main Line: Mobile Broadband"). "MP"
  // appended for Commons members only (Lords titles like "Lord X" /
  // "Baroness X" already convey status on their own). Falls back to the
  // topic heading alone, uncoloured, when askingMember data is missing.
  let headlineText, h3Class;
  if (item.memberName) {
    const mpSuffix = item.house === 'Commons' ? ' MP' : '';
    const party = item.memberParty ? ` (${escapeHtml(item.memberParty)})` : '';
    headlineText = `${escapeHtml(item.memberName)}${mpSuffix}${party} | ${escapeHtml(item.title)}`;
    h3Class = houseClass(item.house);
  } else {
    headlineText = escapeHtml(item.title);
    h3Class = '';
  }

  return `
    <article class="feed-item">
      <h3 class="${h3Class}"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${headlineText}</a></h3>
      <p class="feed-item-meta">${metaLine}</p>
      ${item.context ? `<p>${escapeHtml(item.context)}</p>` : ''}
    </article>`;
}

// ── Load more (reveals more of the already-fetched batch — no new fetch) ───────

function updateLoadMoreButton() {
  const btn = document.getElementById('load-more-btn');
  if (!btn) return;
  if (shownCount >= visibleItems.length) {
    btn.style.display = 'none';
  } else {
    btn.style.display = '';
  }
}

function loadMore() {
  const container = document.getElementById('feed-container');
  const next = visibleItems.slice(shownCount, shownCount + PQ_PAGE_SIZE);
  container.insertAdjacentHTML('beforeend', next.map(renderItemHtml).join(''));
  shownCount += next.length;
  updateLoadMoreButton();
}

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  const container = document.getElementById('feed-container');
  container.innerHTML = '<p class="no-results">Loading…</p>';

  const items = await fetchParliamentaryQuestions();
  visibleItems = items.filter(matchesPQRelevance);

  if (visibleItems.length === 0) {
    container.innerHTML = '<p class="no-results">No telecoms-relevant parliamentary questions found.</p>';
    return;
  }

  container.innerHTML = '';
  shownCount = 0;
  loadMore();
}

init();

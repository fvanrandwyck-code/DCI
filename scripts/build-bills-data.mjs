#!/usr/bin/env node
// ── Bills to Watch build script ─────────────────────────────────────────────
//
// Runs server-side (locally, or via the scheduled GitHub Action in
// .github/workflows/refresh-bills-data.yml) to fetch each curated bill's
// real status from bills-api.parliament.uk and write data/bills-data.json.
// politics.html merges this with js/manual-bills.js's { billId, context }
// entries at render time — this script owns everything else: title, URL,
// current House, stage history, next milestone.
//
// bills-api.parliament.uk has no CORS support (confirmed directly — no
// Access-Control-Allow-Origin header on the real response, same check
// used for questions-statements-api/whatson-api), so it can't be fetched
// from the browser at all. That's the whole reason this exists as a
// server-side build step rather than a client-side fetch like the Policy
// tracker's gov.uk sources.
//
// STAGE MAPPING — the Bills API only ever returns stages a bill has
// ALREADY reached, never its future path, and real bills' stage history
// is cluttered with procedural stages (Money resolutions, Carry-over
// motions, Programme motions) interleaved with the substantive ones.
// Every one of the 49 stage types in the API's own canonical
// /api/v1/Stages reference list is accounted for below, in one of:
// STAGE_TYPE_MAP (maps to a core backbone slot), PING_PONG_STAGE_IDS,
// ROYAL_ASSENT_STAGE_ID, or SKIP_STAGE_IDS. If a stageId ever appears
// that's in none of these (a genuinely new stage type), that bill's
// computation is treated as invalid for this run — see
// computeBillRecord() — rather than guessed at.
//
// House is read directly from each stage's own `house` field (confirmed
// present on every stage in the canonical list and on every bill's own
// stage history) — never inferred positionally for stages that have
// actually happened. Positional inference (originatingHouse + index) is
// used ONLY to label the generic, not-yet-reached UPCOMING slots, where
// there is no real data to read.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MANUAL_BILLS_PATH = join(REPO_ROOT, 'js', 'manual-bills.js');
const OUTPUT_DIR = join(REPO_ROOT, 'data');
const OUTPUT_PATH = join(OUTPUT_DIR, 'bills-data.json');

const BILLS_API_BASE = 'https://bills-api.parliament.uk/api/v1';

// ── Canonical stage mapping ──────────────────────────────────────────────────
//
// FULL TABLE (all 49 real stageIds from /api/v1/Stages, fetched and
// verified against real bill data during investigation — see project
// notes for the complete per-bill evidence):
//
//  id | house    | name                                                  | maps to
//  ---|----------|-------------------------------------------------------|------------------------------------
//   1 | Lords    | 1st reading                                          | core: 1st-reading
//   2 | Lords    | 2nd reading                                          | core: 2nd-reading
//   3 | Lords    | Committee stage                                      | core: committee
//   4 | Lords    | Report stage                                         | core: report
//   5 | Lords    | 3rd reading                                          | core: 3rd-reading
//   6 | Commons  | 1st reading                                          | core: 1st-reading
//   7 | Commons  | 2nd reading                                          | core: 2nd-reading
//   8 | Commons  | Committee stage                                      | core: committee
//   9 | Commons  | Report stage                                         | core: report
//  10 | Commons  | 3rd reading                                          | core: 3rd-reading
//  11 | Unassign | Royal Assent                                         | ROYAL_ASSENT
//  12 | Commons  | Consideration of Lords amendments                    | PING_PONG
//  13 | Lords    | Consideration of Commons amendments and / or reasons | PING_PONG
//  14 | Commons  | Programme motion                                     | SKIP (procedural)
//  15 | Commons  | Money resolution                                     | SKIP (procedural)
//  16 | Unassign | Lords Examiners                                      | SKIP (Private Bill procedure, unused by Public Bills)
//  17 | Unassign | Commons Examiners                                    | SKIP (Private Bill procedure, unused by Public Bills)
//  18 | Commons  | Carry-over motion                                    | SKIP (procedural)
//  19 | Lords    | Carry-over motion                                    | SKIP (procedural)
//  20 | Commons  | Motion to suspend Bill till next session considered  | SKIP (procedural)
//  21 | Commons  | Bill reintroduced                                    | SKIP (procedural)
//  22 | Lords    | Bill reintroduced                                    | SKIP (procedural)
//  23 | Unassign | Petition to introduce a Private Bill...              | SKIP (Private Bill procedure)
//  24 | Lords    | Order of Commitment discharged                       | core: committee — JUDGMENT CALL: the House
//     |          |                                                       | formally declines to send the bill to
//     |          |                                                       | committee; treated as "Committee resolved"
//     |          |                                                       | (the bill has passed this point), not a
//     |          |                                                       | literal sitting. Not explicitly named in
//     |          |                                                       | the brief — verify against procedure.
//  25 | Commons  | Second reading committee                             | core: 2nd-reading (explicit in brief)
//  26 | Commons  | Order of Commitment discharged                       | core: committee — same reasoning as 24. JUDGMENT CALL.
//  27 | Lords    | Committee negatived                                  | core: committee — motion for committee
//     |          |                                                       | rejected; same reasoning as 24/26. JUDGMENT CALL.
//  28 | Commons  | Guillotine motion                                    | SKIP (procedural)
//  29 | Commons  | Allocation of time motion                            | SKIP (procedural)
//  30 | Lords    | Second reading committee                             | core: 2nd-reading (explicit in brief)
//  31 | Commons  | Motion to suspend Bill till next session approved    | SKIP (procedural)
//  32 | Commons  | Motion to revive Bill                                | SKIP (procedural)
//  33 | Lords    | Motion to suspend Bill till next session approved    | SKIP (procedural)
//  34 | Lords    | Motion to revive Bill                                | SKIP (procedural)
//  35 | Lords    | Instruction to Committee on the Bill                 | SKIP (procedural)
//  36 | Commons  | Ways and Means resolution                            | SKIP (procedural)
//  37 | Commons  | Instruction                                          | SKIP (procedural)
//  38 | Commons  | Legislative Grand Committee                          | SKIP — JUDGMENT CALL: an England/Wales-only-
//     |          |                                                       | matters check additional to Report stage,
//     |          |                                                       | not one of the 5 core stages; no real
//     |          |                                                       | example observed during investigation.
//  39 | Commons  | Reconsideration                                      | SKIP — JUDGMENT CALL: no real example
//     |          |                                                       | observed in any sampled bill; name suggests
//     |          |                                                       | possible ping-pong adjacency but unconfirmed.
//  40 | Commons  | Consequential consideration                          | SKIP — JUDGMENT CALL: same as 39, unconfirmed.
//  41 | Unassign | Examination for compliance with Standing Orders      | SKIP (Private Bill procedure)
//  42 | Commons  | Consideration of Lords message                       | PING_PONG — confirmed in real multi-round
//     |          |                                                       | ping-pong sequences alongside 12 and 13.
//  43 | Commons  | Select Committee stage                               | core: committee (explicit in brief)
//  44 | Commons  | Second House Examination                             | SKIP — JUDGMENT CALL: unclear purpose, no
//     |          |                                                       | real example observed.
//  46 | Lords    | Lords Special Public Bill Committee                  | core: committee — JUDGMENT CALL: same role
//     |          |                                                       | as "Committee of the whole House", Lords
//     |          |                                                       | side; not explicitly named in the brief.
//  47 | Commons  | Committal (to a Select Committee)                    | SKIP — JUDGMENT CALL: read as the referral
//     |          |                                                       | motion that PRECEDES stage 43 (the actual
//     |          |                                                       | sitting), not the stage itself.
//  48 | Commons  | Committee stage (re-committed clauses and schedules) | core: committee (explicit in brief)
//  49 | Commons  | Committee of the whole House                         | core: committee (explicit in brief)
//  50 | Commons  | Power of public bill committee to send for...        | SKIP (administrative, not a reading/stage)
//
// (id 45 does not exist in the API's own list — not a gap in this table.)
//
const CORE_STAGE_TYPES = ['1st-reading', '2nd-reading', 'committee', 'report', '3rd-reading'];

// Display labels for upcoming (not-yet-reached) slots only — reached
// slots always use the real API description instead (see
// buildStagesArray). Matches the Bills API's own casing/wording so a
// reached "Report stage" and an upcoming "Report stage" tooltip don't
// look inconsistent with each other.
const CORE_STAGE_LABELS = {
  '1st-reading': '1st reading',
  '2nd-reading': '2nd reading',
  'committee':   'Committee stage',
  'report':      'Report stage',
  '3rd-reading': '3rd reading',
};

const STAGE_TYPE_MAP = {
  1: '1st-reading', 6: '1st-reading',
  2: '2nd-reading', 7: '2nd-reading', 25: '2nd-reading', 30: '2nd-reading',
  3: 'committee', 8: 'committee', 24: 'committee', 26: 'committee',
  27: 'committee', 43: 'committee', 46: 'committee', 48: 'committee', 49: 'committee',
  4: 'report', 9: 'report',
  5: '3rd-reading', 10: '3rd-reading',
};

const ROYAL_ASSENT_STAGE_ID = 11;
const PING_PONG_STAGE_IDS = new Set([12, 13, 42]);

const SKIP_STAGE_IDS = new Set([
  14, 15, 36,             // Programme motion, Money resolution, Ways and Means resolution
  18, 19,                 // Carry-over motion (Commons/Lords)
  20, 31, 33,             // Motion to suspend Bill till next session (considered/approved)
  32, 34,                 // Motion to revive Bill (Commons/Lords)
  21, 22,                 // Bill reintroduced (Commons/Lords)
  28, 29,                 // Guillotine motion, Allocation of time motion
  35, 37,                 // Instruction to Committee / Instruction
  38,                      // Legislative Grand Committee — JUDGMENT CALL
  39, 40,                  // Reconsideration, Consequential consideration — JUDGMENT CALL
  41,                      // Examination for compliance with Standing Orders (Private Bill)
  23, 16, 17,              // Private Bill procedure: Petition / Lords+Commons Examiners
  44,                      // Second House Examination — JUDGMENT CALL
  47,                      // Committal (to a Select Committee) — JUDGMENT CALL
  50,                      // Power of public bill committee to send for persons, papers and records
]);

const RETRY_DELAY_MS = 5000;

function ghWarning(message) {
  console.warn(`::warning::${message}`);
  console.warn(`[build-bills] ${message}`);
}

function fmtDate(iso) {
  if (!iso) return null;
  return iso.slice(0, 10);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchBillRaw(billId) {
  const [detail, stagesResp] = await Promise.all([
    fetchJson(`${BILLS_API_BASE}/Bills/${billId}`),
    fetchJson(`${BILLS_API_BASE}/Bills/${billId}/Stages`),
  ]);
  const stages = (stagesResp.items || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return { detail, stages };
}

async function fetchBillWithRetry(billId) {
  try {
    return await fetchBillRaw(billId);
  } catch (err) {
    console.warn(`[build-bills] Bill ${billId} fetch failed (${err.message}) — retrying once.`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchBillRaw(billId); // let a second failure propagate to the caller
  }
}

function billUrl(billId) {
  return `https://bills.parliament.uk/bills/${billId}`;
}

// Partitions a bill's real, ordered stage history. coreByKey is keyed by
// "{type}|{house}" (NOT type alone) — a bill that has fully passed both
// Houses has TWO real "committee" rows (one per House, different
// stageIds, different houses); keying by type alone would let the
// later one silently overwrite the earlier one's real name/date, losing
// data for a bill as unremarkable as a normal two-House passage.
// Returns { unrecognized } instead if any stageId isn't accounted for
// anywhere in the mapping above.
function classifyStages(rawStages) {
  const coreByKey = {};
  const pingPongEvents = [];
  let royalAssent = null;
  let unrecognized = null;

  for (const s of rawStages) {
    const id = s.stageId;
    const sittingDates = (s.stageSittings || []).map(sit => sit.date).filter(Boolean);

    if (id === ROYAL_ASSENT_STAGE_ID) {
      royalAssent = { sortOrder: s.sortOrder, sittingDates };
    } else if (PING_PONG_STAGE_IDS.has(id)) {
      pingPongEvents.push({ house: s.house, name: s.description, sortOrder: s.sortOrder, sittingDates });
    } else if (STAGE_TYPE_MAP[id]) {
      const type = STAGE_TYPE_MAP[id];
      const key = `${type}|${s.house}`;
      const existing = coreByKey[key];
      if (!existing || s.sortOrder > existing.sortOrder) {
        coreByKey[key] = { name: s.description, sortOrder: s.sortOrder, sittingDates };
      }
    } else if (SKIP_STAGE_IDS.has(id)) {
      // intentionally ignored
    } else {
      unrecognized = { stageId: id, description: s.description, house: s.house };
    }
  }

  if (unrecognized) return { unrecognized };
  return { coreByKey, pingPongEvents, royalAssent };
}

// Builds the final { index, reached, current, house, name, sittingDates }
// array stored in the output JSON — the ONLY place stage-mapping logic
// runs; the browser (dci-data.js's renderStageTracker) just draws this
// as-is (ignoring the extra sittingDates field, kept here only so
// computeBillRecord can derive nextMilestone from whichever slot is
// current without re-deriving lookup keys).
function buildStagesArray({ originatingHouse, coreByKey, pingPongEvents, royalAssent }) {
  const otherHouse = originatingHouse === 'Commons' ? 'Lords' : 'Commons';
  const houseForCoreIndex = i => (i < 5 ? originatingHouse : otherHouse);

  const hasPingPong = pingPongEvents.length > 0;
  const latestPingPong = hasPingPong
    ? pingPongEvents.reduce((a, b) => (b.sortOrder > a.sortOrder ? b : a))
    : null;

  const pingPongIndex = 10; // inserted just before Royal Assent when present
  const royalAssentIndex = hasPingPong ? 11 : 10;

  // Furthest reached core index, determined purely by which (type,
  // house) slots actually have a real record — not by scanning for a
  // single overwritten "latest" value per type (see classifyStages).
  let maxCoreIndex = -1;
  for (let i = 0; i < 10; i++) {
    const type = CORE_STAGE_TYPES[i % 5];
    const house = houseForCoreIndex(i);
    if (coreByKey[`${type}|${house}`] && i > maxCoreIndex) maxCoreIndex = i;
  }

  let currentStageIndex;
  if (royalAssent) currentStageIndex = royalAssentIndex;
  else if (hasPingPong) currentStageIndex = pingPongIndex;
  else currentStageIndex = maxCoreIndex;

  const stages = [];
  for (let i = 0; i < 10; i++) {
    const type = CORE_STAGE_TYPES[i % 5];
    const house = houseForCoreIndex(i);
    const real = coreByKey[`${type}|${house}`];
    stages.push({
      index: i,
      reached: i <= currentStageIndex,
      current: i === currentStageIndex,
      house,
      name: real ? real.name : CORE_STAGE_LABELS[type],
      sittingDates: real ? real.sittingDates : [],
    });
  }

  if (hasPingPong) {
    stages.push({
      index: pingPongIndex,
      reached: true,
      current: pingPongIndex === currentStageIndex,
      house: latestPingPong.house,
      name: latestPingPong.name,
      sittingDates: latestPingPong.sittingDates,
    });
  }

  stages.push({
    index: royalAssentIndex,
    reached: !!royalAssent,
    current: royalAssentIndex === currentStageIndex,
    house: null,
    name: 'Royal Assent',
    sittingDates: royalAssent ? royalAssent.sittingDates : [],
  });

  return { stages, currentStageIndex };
}

function mostRecentPastDate(allSittingDates, today) {
  const past = allSittingDates.filter(d => d && d.slice(0, 10) <= today);
  if (past.length === 0) return null;
  return past.reduce((a, b) => (b > a ? b : a)).slice(0, 10);
}

function earliestFutureDate(sittingDates, today) {
  const future = (sittingDates || []).filter(d => d && d.slice(0, 10) > today);
  if (future.length === 0) return null;
  return future.reduce((a, b) => (b < a ? b : a)).slice(0, 10);
}

function formatUkDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Strips the internal-only sittingDates field before writing to JSON —
// used by computeBillRecord/buildStagesArray but not by the renderer.
function stripInternalFields(stages) {
  return stages.map(({ sittingDates, ...rest }) => rest);
}

// Builds the full output record for one bill, or returns
// { invalid: true, reason } if the fetched data fails validation
// (unrecognized stage, or a computed position that moves backwards
// versus the previous run) — the caller falls back to the previous
// record in that case, rather than writing a wrong one. runTimestamp is
// the single ISO timestamp shared by every bill confirmed in this run
// (not a fresh Date() per call) — see lastConfirmedAt below and main()'s
// freshness-label notes.
function computeBillRecord(billId, { detail, stages: rawStages }, previous, today, runTimestamp) {
  const title = detail.shortTitle;
  const originatingHouse = detail.originatingHouse;
  const currentHouse = detail.currentHouse;
  const isAct = !!detail.isAct;
  const billWithdrawn = detail.billWithdrawn ? fmtDate(detail.billWithdrawn) : null;
  const isDefeated = !!detail.isDefeated;

  const classified = classifyStages(rawStages);
  if (classified.unrecognized) {
    return {
      invalid: true,
      reason: `unrecognized stageId ${classified.unrecognized.stageId} ` +
        `("${classified.unrecognized.description}", house ${classified.unrecognized.house})`,
    };
  }

  const allSittingDates = rawStages.flatMap(s => (s.stageSittings || []).map(sit => sit.date));
  const lastStageActivityDate = mostRecentPastDate(allSittingDates, today);

  // Status precedence: withdrawn/defeated are terminal regardless of
  // isAct (a bill can't be both); Royal Assent only applies otherwise.
  // NOTE: isDefeated has never been observed set to true on any real
  // bill during investigation (0 of ~850+ bills in the live dataset at
  // the time) — this path is implemented from the API schema alone, not
  // verified against a real example. The API also exposes no
  // defeat-date field, so "Defeated." has no date to report, unlike
  // withdrawn/Royal Assent, which do.
  let status;
  if (billWithdrawn) status = 'withdrawn';
  else if (isDefeated) status = 'defeated';
  else if (isAct || classified.royalAssent) status = 'act';
  else status = 'active';

  if (status === 'withdrawn' || status === 'defeated') {
    return {
      invalid: false,
      record: {
        billId, title, url: billUrl(billId), status,
        currentHouse, currentStageName: null, currentStageHouse: null, currentStageIndex: null,
        nextMilestone: status === 'withdrawn'
          ? `Withdrawn on ${formatUkDate(billWithdrawn)}.`
          : 'Defeated.',
        lastStageActivityDate, lastConfirmedAt: runTimestamp,
        stages: [],
      },
    };
  }

  const { stages, currentStageIndex } = buildStagesArray({ originatingHouse, ...classified });

  // Backwards-movement guard: a bill cannot un-pass a stage it has
  // already reached. 'act' always ranks above any numeric index.
  if (previous && previous.status !== 'unavailable') {
    const prevRank = previous.status === 'act' ? 999 : (previous.currentStageIndex ?? -1);
    const newRank = status === 'act' ? 999 : currentStageIndex;
    if (newRank < prevRank) {
      return {
        invalid: true,
        reason: `computed position moved backwards (was rank ${prevRank}, now ${newRank})`,
      };
    }
  }

  const currentSlot = stages.find(s => s.current);
  const currentStageName = currentSlot.name;
  const currentStageHouse = currentSlot.house;

  let nextMilestone;
  if (status === 'act') {
    const assentDate = currentSlot.sittingDates[0] ? fmtDate(currentSlot.sittingDates[0]) : lastStageActivityDate;
    nextMilestone = `Received Royal Assent on ${formatUkDate(assentDate)}.`;
  } else {
    const future = earliestFutureDate(currentSlot.sittingDates, today);
    nextMilestone = future
      ? `Sitting scheduled for ${formatUkDate(future)}.`
      // Deliberately no stage name here — buildBillStatusLine()
      // (dci-data.js) already prefixes this with "{House} {stage}.", so
      // repeating the stage name ("No 2nd reading sitting date
      // scheduled yet.") would read redundantly right after it.
      : 'No sitting date scheduled yet.';
  }

  return {
    invalid: false,
    record: {
      billId, title, url: billUrl(billId), status,
      currentHouse, currentStageName, currentStageHouse, currentStageIndex,
      nextMilestone, lastStageActivityDate, lastConfirmedAt: runTimestamp,
      stages: stripInternalFields(stages),
    },
  };
}

// lastConfirmedAt is always null here — a stub is only ever used when a
// bill has NEVER had a successful fetch+validation, so there is nothing
// to date. A held-back bill (fetch/validation failed THIS run, but
// succeeded at some point before) is handled separately in main() by
// carrying the previous record forward unchanged, including its real
// lastConfirmedAt — this stub is not used for that case.
function unavailableStub(billId, titleIfKnown = null) {
  return {
    billId,
    title: titleIfKnown,
    url: billUrl(billId),
    status: 'unavailable',
    currentHouse: null, currentStageName: null, currentStageHouse: null, currentStageIndex: null,
    nextMilestone: null, lastStageActivityDate: null, lastConfirmedAt: null, stages: [],
  };
}

async function main() {
  // Load manual-bills.js's actual MANUAL_BILLS array via vm (same
  // technique already used by scripts/build-politics-data.mjs for
  // dci-data.js) rather than regex-scraping the source text — a naive
  // regex over the file's own documentation comments (which include a
  // worked example containing "billId: 4035") silently duplicated the
  // real entry during testing. This script only needs the IDs, not the
  // editorial context text (that's merged in at render time, client-side).
  //
  // MANUAL_BILLS is declared with `const`, which (unlike a top-level
  // `function` declaration) does NOT attach to vm's context object on
  // its own — confirmed directly: a plain `vm.runInContext('const X = 1',
  // context)` leaves context.X undefined, while `var`/function
  // declarations do attach. The explicit globalThis assignment below
  // (the same shim pattern already used in this project's own ad hoc
  // test scripts) is required to read it back out.
  const manualSource = readFileSync(MANUAL_BILLS_PATH, 'utf8');
  const manualContext = {};
  vm.createContext(manualContext);
  manualContext.globalThis = manualContext;
  vm.runInContext(manualSource + '\nglobalThis.MANUAL_BILLS = MANUAL_BILLS;', manualContext, { filename: 'manual-bills.js' });
  const billIds = (manualContext.MANUAL_BILLS || []).map(b => b.billId);
  if (billIds.length === 0) {
    console.log('[build-bills] No bills listed in manual-bills.js — writing empty output.');
  }

  const previousById = new Map();
  if (existsSync(OUTPUT_PATH)) {
    try {
      const previous = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
      for (const b of previous.bills || []) previousById.set(b.billId, b);
    } catch (err) {
      console.warn('[build-bills] Could not parse existing data/bills-data.json, starting fresh:', err.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const runTimestamp = new Date().toISOString();
  const bills = [];
  let anyHeldBack = false;

  for (const billId of billIds) {
    const previous = previousById.get(billId) || null;

    let raw;
    try {
      raw = await fetchBillWithRetry(billId);
    } catch (err) {
      console.warn(`[build-bills] Bill ${billId}: fetch failed after retry (${err.message}).`);
      ghWarning(`Bill ${billId}: fetch failed after retry (${err.message}) — keeping previous data.`);
      anyHeldBack = true;
      bills.push(previous || unavailableStub(billId));
      continue;
    }

    const result = computeBillRecord(billId, raw, previous, today, runTimestamp);
    if (result.invalid) {
      ghWarning(`Bill ${billId} (${raw.detail?.shortTitle || 'unknown title'}): ${result.reason} — keeping previous data.`);
      anyHeldBack = true;
      bills.push(previous || unavailableStub(billId, raw.detail?.shortTitle || null));
    } else {
      bills.push(result.record);
    }
  }

  const output = { generatedAt: runTimestamp, bills };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`[build-bills] Wrote ${bills.length} bill record(s) to ${OUTPUT_PATH}`);

  // Signal to the workflow (refresh-bills-data.yml) that something was
  // held back, WITHOUT failing this script itself — the commit/push
  // step still needs to run normally so the other, successfully-updated
  // bills' data still reaches main. A later workflow step reads this
  // output and deliberately fails the job afterward, so GitHub's failure
  // notification still reaches a human, without blocking the commit.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `held_back=${anyHeldBack}\n`);
  }
  if (anyHeldBack) {
    console.warn('[build-bills] One or more bills were held back this run — see ::warning:: annotations above.');
  }
}

main().catch(err => {
  console.error('[build-bills] Fatal error:', err);
  process.exit(1);
});

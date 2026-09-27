#!/usr/bin/env node
// ── Politics data build script ──────────────────────────────────────────────
//
// Runs server-side (locally, or via the scheduled GitHub Action in
// .github/workflows/refresh-politics-data.yml) to pre-fetch and
// pre-filter Parliament data, replacing the live client-side fetch that
// used to run in every visitor's browser — Parliament's API has no fast
// path, so that took 8-20+ seconds even with progressive rendering.
// Writes data/politics-data.json, which politics.html and the homepage
// now load directly instead of calling the Parliament API themselves.
//
// Deliberately reuses js/dci-data.js's fetch/filter functions AS-IS
// (loaded via Node's vm module — the same technique used throughout this
// project's own testing all along) rather than reimplementing any fetch
// logic here. Zero duplication, zero risk of this script's filtering
// drifting out of sync with what the Policy tracker still does
// client-side for gov.uk sources.
//
// SAFETY: if the fetched data looks obviously wrong (e.g. suspiciously
// few raw items — a near-total-zero result across every chunk almost
// certainly means an API outage or schema change, not genuine silence),
// this exits non-zero WITHOUT writing the output file, so a bad run
// never overwrites good data. The GitHub Action only commits if this
// script exits successfully.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DCI_DATA_PATH = join(REPO_ROOT, 'js', 'dci-data.js');
const OUTPUT_DIR = join(REPO_ROOT, 'data');
const OUTPUT_PATH = join(OUTPUT_DIR, 'politics-data.json');

// Conservative floor — real runs during development consistently returned
// well over 100 raw items across all chunks combined. Anything below this
// is treated as a likely fetch failure rather than genuine data.
const MIN_RAW_ITEMS = 20;

// A single chunk fetch occasionally fails transiently (observed directly
// during development: one of ten parallel Questions/Statements chunk
// requests came back HTTP 403, while the identical request succeeded
// moments later on retry) — fetchParliamentaryQuestionsStreaming/
// fetchWrittenStatementsStreaming already log and skip a failed chunk
// rather than crashing (via Promise.allSettled), so a single blip doesn't
// lose the whole run, but it does mean that chunk's items are silently
// missing. Unlike a live page (where a visitor can just reload), this is
// an unattended background job, so it's worth one clean retry of the
// whole fetch before accepting a low count as a real failure.
async function fetchRawItems(context) {
  const rawItems = [];
  await Promise.all([
    context.fetchParliamentaryQuestionsStreaming(newItems => rawItems.push(...newItems)),
    context.fetchWrittenStatementsStreaming(newItems => rawItems.push(...newItems)),
  ]);
  return rawItems;
}

async function main() {
  const dciDataSource = readFileSync(DCI_DATA_PATH, 'utf8');
  const context = { fetch, console, MANUAL_ENTRIES: [] };
  vm.createContext(context);
  vm.runInContext(dciDataSource, context, { filename: 'dci-data.js' });

  let rawItems = await fetchRawItems(context);
  if (rawItems.length < MIN_RAW_ITEMS) {
    console.warn(`[build] First attempt returned only ${rawItems.length} raw items — retrying once.`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    const retryItems = await fetchRawItems(context);
    if (retryItems.length > rawItems.length) rawItems = retryItems;
  }

  if (rawItems.length < MIN_RAW_ITEMS) {
    console.error(
      `[build] Only ${rawItems.length} raw items fetched after retry (expected at least ${MIN_RAW_ITEMS}) — ` +
      `treating as a likely API failure. Not writing output.`
    );
    process.exit(1);
  }

  // Questions/Statements use distinct id prefixes (PQ:/WS:), so no
  // cross-stream collision is possible — this is just a defensive final
  // dedupe pass, same spirit as the existing streaming functions' own
  // per-call seenIds.
  const seen = new Set();
  const items = rawItems
    .filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .filter(context.matchesPQRelevance)
    .sort((a, b) => b.date.localeCompare(a.date));

  let sittingStatus = [];
  try {
    sittingStatus = await context.fetchSittingStatus();
  } catch (err) {
    console.warn('[build] Sitting status fetch failed, writing empty array:', err.message);
  }

  let committeeEvents = [];
  try {
    committeeEvents = await context.fetchUpcomingCommitteeEvents();
  } catch (err) {
    console.warn('[build] Committee events fetch failed, writing empty array:', err.message);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    items,
    sittingStatus,
    committeeEvents,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(
    `[build] Wrote ${items.length} items, ${sittingStatus.length} sitting statuses, ` +
    `${committeeEvents.length} committee events to ${OUTPUT_PATH}`
  );
}

main().catch(err => {
  console.error('[build] Fatal error:', err);
  process.exit(1);
});

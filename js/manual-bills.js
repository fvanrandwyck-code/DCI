// ── Bills to Watch — curated bill list ──────────────────────────────────────────
//
// WHICH bills appear in Bills to Watch, plus the editorial "why it
// matters" text for each — a small, deliberately curated shortlist, NOT
// a broad keyword search (same reasoning as the curated committee list
// for Upcoming Debates & Committees). Everything else about a bill —
// title, URL, current House, stage, stage history, next milestone — is
// fetched automatically by a GitHub Action and written to
// data/bills-data.json; see scripts/build-bills-data.mjs for how. This
// list is merged with that fetched data at render time in
// politics-page.js, so adding an entry here is the only step needed —
// no stage tracking, no dates, nothing to keep in sync by hand.
//
// ── HOW TO ADD A BILL ────────────────────────────────────────────────────────────
//
//   1. Find the bill on bills.parliament.uk and copy its ID from the
//      URL — e.g. https://bills.parliament.uk/bills/4035 -> billId: 4035
//   2. Add { billId: ____, context: '...' } to the array below
//   3. Commit and push. The next scheduled run of
//      .github/workflows/refresh-bills-data.yml (every 4 hours, offset
//      from the Politics data refresh) fetches its status — "Status
//      unavailable" shows in the meantime, not a blank card
//   4. To remove a bill, delete its entry — no other cleanup needed
//
// ── FIELDS ───────────────────────────────────────────────────────────────────────
//
//   billId  — the bill's numeric ID on bills.parliament.uk (from its URL)
//   context — one or two sentences: why this bill matters for telecoms
//
const MANUAL_BILLS = [
  {
    billId: 4035,
    context: 'A DSIT bill establishing new cyber security duties for critical infrastructure operators, data centres, and managed service providers.',
  },
];

// ── Bills to Watch (manual entries) ─────────────────────────────────────────────
//
// A small, deliberately curated shortlist of bills central to telecoms
// policy right now — NOT a broad keyword search (the Bills API has no
// CORS support, so it can't be fetched live from the browser anyway; see
// project notes on that investigation). Rendered in the Parliamentary
// Business section of politics.html as point-in-time status, alongside
// Sitting Status and Upcoming Debates & Committees — not in the
// chronological Questions & Statements feed, since a bill's stage is an
// ongoing status, not a dated, one-off publication.
//
// Unlike manual-entries.js's Ofcom items (append-only, never edited once
// added), THESE ENTRIES GO STALE ON THEIR OWN SCHEDULE as a bill
// progresses through Parliament, independent of when this file was last
// touched. Re-check every entry against bills.parliament.uk periodically
// and update currentStageIndex/nextMilestone/lastChecked — an entry with
// an old lastChecked date is a signal to verify it, not a bug.
//
// ── HOW TO ADD A NEW BILL ────────────────────────────────────────────────────────
//
//   1. Find the bill on bills.parliament.uk and note its current stage
//      and which House it started in.
//   2. Copy the object below (from the opening { to the closing },)
//   3. Paste it inside the MANUAL_BILLS array, before the closing ]
//   4. Fill in all fields (stageDetail and hasPingPong are optional —
//      see FIELDS below) and save
//   5. Commit and push — the entry will appear in Bills to Watch immediately
//
// ── HOW TO UPDATE AN EXISTING BILL AS IT PROGRESSES ─────────────────────────────
//
//   1. Re-check the bill's current stage on bills.parliament.uk
//   2. Update currentStageIndex to match (see THE STAGE BACKBONE below)
//   3. Update stageDetail if the backbone label still needs a bill-specific
//      clarification, or clear it if it no longer applies
//   4. If the bill has entered Consideration of Amendments (ping-pong),
//      set hasPingPong to true
//   5. Update nextMilestone to describe what's coming next
//   6. Update lastChecked to today's date
//   7. Commit and push
//
// ── FIELDS ───────────────────────────────────────────────────────────────────────
//
//   title             — the bill's short title, as it appears on bills.parliament.uk
//   house             — 'Commons' | 'Lords' — the bill's CURRENT house (not
//                        necessarily where it started). Colours the title
//                        link, same as Questions/Statements/Committee events.
//   originatingHouse  — 'Commons' | 'Lords' — the House the bill STARTED in.
//                        Determines which House owns each stage-tracker dot
//                        (see THE STAGE BACKBONE below) — the first 5 stages
//                        belong to this House, the next 5 to the other one.
//   currentStageIndex — 0-10, position in BILL_STAGE_BACKBONE (see next section)
//   hasPingPong       — (optional, default false) set true once the bill has
//                        entered Consideration of Amendments — most bills
//                        never reach this, so it's off by default rather
//                        than shown as a permanent extra hollow dot on every
//                        entry regardless of relevance.
//   stageDetail       — (optional, blank by default) present-tense clarification
//                        for cases where the backbone label still doesn't fully
//                        capture this bill's specific situation. Should rarely be
//                        needed now that the tracker shows the real stage name and
//                        real House colour directly (e.g. "Report (Lords)") rather
//                        than a summarised "Other House" label. Always say "House
//                        of Commons"/"House of Lords" (or "Commons"/"Lords" for
//                        brevity) — never "the other place" or other jargon.
//   nextMilestone     — forward-looking: what's coming next, and roughly when,
//                        in plain English. Use a sentence like "No sitting date
//                        scheduled yet" if nothing is confirmed. Rendered as
//                        part of the combined "Status | ..." line, alongside
//                        the current stage — not shown separately.
//   context           — one or two sentences: why this bill matters for
//                        telecoms. Mention the sponsoring department here as
//                        natural prose (e.g. "A DSIT bill establishing...")
//                        rather than as a separate field — this is the only
//                        place that information appears.
//   url               — link to the bill's page on bills.parliament.uk
//   lastChecked       — YYYY-MM-DD, the date a human last verified this entry
//                        against bills.parliament.uk
//
// ── THE STAGE BACKBONE ───────────────────────────────────────────────────────────
//
// The Bills API only ever returns stages a bill has ALREADY reached —
// never its future path — so a tracker showing upcoming stages can't be
// derived from the API regardless of how this file is structured. Real
// bills' actual stage lists are also cluttered with procedural stages a
// reader doesn't need (Money resolutions, Carry-over motions, Programme
// motions) interleaved with the substantive ones.
//
// Confirmed against the Cyber Security and Resilience Bill's real stage
// history: a standard bill goes through 5 substantive stages in the House
// it starts in (1st Reading, 2nd Reading, Committee, Report, 3rd Reading),
// then the same 5 stages again in the other House, then Royal Assent — 11
// stages total. Which House owns indices 0-4 vs 5-9 depends on
// originatingHouse; index 10 (Royal Assent) isn't a Commons/Lords event at
// all, so it's never House-coloured. Consideration of Amendments
// (ping-pong) is NOT part of this fixed sequence — only some bills need it
// — see hasPingPong above.
//
const BILL_STAGE_BACKBONE = [
  '1st Reading', '2nd Reading', 'Committee', 'Report', '3rd Reading',   // First House (indices 0-4)
  '1st Reading', '2nd Reading', 'Committee', 'Report', '3rd Reading',   // Second House (indices 5-9)
  'Royal Assent',                                                       // index 10 — not House-specific
];

// Returns 'Commons' | 'Lords' | null (Royal Assent) for a given backbone
// index, given which House the bill started in.
function billStageHouse(index, originatingHouse) {
  if (index < 5) return originatingHouse;
  if (index < 10) return originatingHouse === 'Commons' ? 'Lords' : 'Commons';
  return null;
}

// ── EXAMPLE ────────────────────────────────────────────────────────────────────
//
//   {
//     title:             'Example Bill',
//     house:              'Commons',
//     originatingHouse:   'Commons',
//     currentStageIndex:  2,
//     hasPingPong:        false,
//     stageDetail:        '',
//     nextMilestone:      'Committee stage sitting expected late October.',
//     context:            'A DSIT bill doing [one-sentence explanation of telecoms relevance].',
//     url:                'https://bills.parliament.uk/bills/0000',
//     lastChecked:        '2026-09-13',
//   },
//
// ───────────────────────────────────────────────────────────────────────────────

const MANUAL_BILLS = [
  {
    title:             'Cyber Security and Resilience (Network and Information Systems) Bill',
    house:             'Lords',
    originatingHouse:  'Commons',
    currentStageIndex: 8,
    hasPingPong:       false,
    stageDetail:       '',
    nextMilestone:     'No Report stage sitting date scheduled yet.',
    context:           'A DSIT bill establishing new cyber security duties for critical infrastructure operators, data centres, and managed service providers.',
    url:               'https://bills.parliament.uk/bills/4035',
    lastChecked:       '2026-09-13',
  },
];

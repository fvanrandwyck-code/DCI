// ── Manual Tracker Entries ─────────────────────────────────────────────────────
//
// Add Ofcom items here that appear on ofcom.org.uk but won't be captured
// by the automated gov.uk source — enforcement decisions, consultation
// launches, spectrum decisions, and press releases.
//
// These entries merge into the main feed alongside automated items and
// are sorted by date with everything else. They are not shown separately.
//
// ── HOW TO ADD A NEW ENTRY ─────────────────────────────────────────────────────
//
//   1. Copy the object below (from the opening { to the closing },)
//   2. Paste it inside the MANUAL_ENTRIES array, before the closing ]
//   3. Fill in the four fields and save
//   4. Commit and push — the entry will appear in the Tracker immediately
//
// ── FIELDS ─────────────────────────────────────────────────────────────────────
//
//   source  — always 'Ofcom' (renders as "Ofcom (formal publications)" in the feed)
//   date    — publication date, YYYY-MM-DD format
//   title   — the item headline, as it appears on Ofcom's site
//   context — 1–2 sentences of your own context: what it is and why it matters
//             for operators/investors. This is the value-add over the raw headline.
//   url     — direct link to the item on ofcom.org.uk
//
// ── EXAMPLE ────────────────────────────────────────────────────────────────────
//
//   {
//     source:  'Ofcom',
//     date:    '2026-08-15',
//     title:   'Ofcom opens consultation on wholesale broadband pricing: Openreach charge controls 2027–2031',
//     context: 'Four-year charge control review covering leased lines and physical infrastructure access. Key input for operators whose commercial models depend on Openreach wholesale pricing — decisions expected Q1 2027.',
//     url:     'https://www.ofcom.org.uk/consultations-and-statements/category-1/wholesale-broadband-pricing',
//   },
//
// ───────────────────────────────────────────────────────────────────────────────

const MANUAL_ENTRIES = [

  // Add real entries here. Delete or keep the example above as a reference.

];

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
//   3. Fill in all five fields and save
//   4. Commit and push — the entry will appear in the Tracker immediately
//
// ── FIELDS ─────────────────────────────────────────────────────────────────────
//
//   source   — always 'Ofcom' (renders as "Ofcom (formal publications)" in the feed)
//   type     — use one of the nine values below (must match exactly, case-sensitive)
//   date     — publication date, YYYY-MM-DD format
//   title    — the item headline, as it appears on Ofcom's site
//   context  — 1–2 sentences of your own context: what it is and why it matters
//              for operators/investors. This is the value-add over the raw headline.
//   url      — direct link to the item on ofcom.org.uk
//   deadline — (optional) response deadline, YYYY-MM-DD format
//              Only needed for 'Consultation' and 'Call for evidence' entries.
//              Renders a colour-coded progress bar showing time elapsed vs deadline.
//
// ── VALID TYPE VALUES ──────────────────────────────────────────────────────────
//
//   'Call for evidence'  — formal calls for evidence (distinct from consultations)
//   'Consultation'       — open consultations, and consultation outcomes
//   'Decision'           — formal regulatory or enforcement decisions
//   'Guidance'           — guidance documents and regulatory requirements
//   'Notice'             — regulatory notices, including provisional rulings
//   'Policy paper'       — policy papers, white papers, green papers
//   'Press release'      — press releases, news items, speeches, correspondence
//   'Report'             — research reports, independent reviews, annual reports
//   'Statistics'         — statistical publications and data releases
//
// ── EXAMPLE ────────────────────────────────────────────────────────────────────
//
//   {
//     source:   'Ofcom',
//     type:     'Consultation',
//     date:     '2026-08-15',
//     deadline: '2026-10-15',
//     title:    'Ofcom opens consultation on wholesale broadband pricing: Openreach charge controls 2027–2031',
//     context:  'Four-year charge control review covering leased lines and physical infrastructure access. Key input for operators whose commercial models depend on Openreach wholesale pricing — decisions expected Q1 2027.',
//     url:      'https://www.ofcom.org.uk/consultations-and-statements/category-1/wholesale-broadband-pricing',
//   },
//
// ───────────────────────────────────────────────────────────────────────────────

const MANUAL_ENTRIES = [
  {
    source:  'Ofcom',
    type:    'Decision',
    date:    '2026-07-08',
    title:   'Ofcom fines Virgin Media £28m for repeatedly preventing customers from cancelling contracts',
    context: 'One of Ofcom\'s larger recent enforcement actions against an operator, targeting conduct that obstructs switching -- directly relevant to how Ofcom polices contract and retention practices across the industry.',
    url:     'https://www.ofcom.org.uk/phones-and-broadband/switching-provider/ofcom-fines-virgin-media-28m-for-repeatedly-preventing-customers-from-cancelling-contracts',
  },
  {
    source:  'Ofcom',
    type:    'Guidance',
    date:    '2026-07-15',
    title:   'New rules to thwart text message scammers and protect consumers and businesses',
    context: 'New regulatory requirements on how operators must handle and filter scam SMS traffic -- an operational compliance obligation landing directly on telecoms providers, not just a consumer-advice update.',
    url:     'https://www.ofcom.org.uk/phones-and-broadband/scam-calls-and-messages/new-rules-to-thwart-text-message-scammers-and-protect-consumers-and-businesses',
  },
  {
    source:  'Ofcom',
    type:    'Decision',
    date:    '2026-07-16',
    title:   'Protection for prisons, power stations and airports against hostile drones',
    context: 'A spectrum-policy decision enabling counter-drone technology at sensitive sites -- relevant to the spectrum-management side of digital infrastructure policy, even though the framing is security-led.',
    url:     'https://www.ofcom.org.uk/spectrum/innovative-use-of-spectrum/protection-for-prisons-power-stations-and-airports-against-hostile-drones',
  },
  {
    source:  'Ofcom',
    type:    'Statistics',
    date:    '2026-07-23',
    title:   'Ofcom: Telecoms and pay-TV complaints fall to record low',
    context: 'Ofcom\'s regular industry complaints benchmark -- a standard reference point for how operators are performing on service quality, often cited in wider debates about competition and regulation.',
    url:     'https://www.ofcom.org.uk/phones-and-broadband/service-quality/ofcom-telecoms-and-pay-tv-complaints-fall-to-record-low',
  },
  {
    source:  'Ofcom',
    type:    'Notice',
    date:    '2026-07-28',
    title:   'Ofcom proposes to block new Openreach commercial offer to protect fair competition and keep long-term prices low',
    context: 'The first time Ofcom has moved to block a commercial offer from Openreach — provisionally ruling that steep discounts targeted at new full-fibre customers could undermine altnets\' ability to compete. Consultation open until 27 August, final decision expected by end of September.',
    url:     'https://www.ofcom.org.uk/phones-and-broadband/telecoms-infrastructure/ofcom-proposes-to-block-new-openreach-commercial-offer-to-protect-fair-competition-and-keep-long-term-prices-low',
  },
];

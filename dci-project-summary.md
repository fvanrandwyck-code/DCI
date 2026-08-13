# Digital Connectivity Insights (DCI) — Project Summary

## The idea
A publication exploring the relationship between government and the telecoms industry — why UK (and eventually international) policymakers are making the decisions they're making about digital infrastructure, and what that means for people building, running, and investing in it.

Two purposes it serves:
- A **portfolio/credibility project** demonstrating expertise, ahead of a possible longer-term move from public affairs into journalism/analysis.
- A **side project, not an income or relocation vehicle** — it won't fund or enable relocating out of the UK in any near-term sense (the core content depends on London/Brussels proximity and access), so the international career track (Singapore/Hong Kong/South Africa roles) remains the actual relocation path, separate from this.

## Positioning
- **Primary audience**: industry (operators, vendors, investors, other PA professionals) who need to anticipate government's direction of travel, not just react to it.
- **Secondary audience**: policy/political people (civil servants, political staff, journalists, think tanks) who understand policy machinery but lack deep telecoms-industry fluency.
- **Angle**: translator between government's institutional logic and industry's commercial reality — explaining not just what happened, but why, and what's likely to come next.
- **Voice**: first-person, personal analysis — not a faceless institutional publication — while staying sharp and specific in scope (not a loose "my thoughts on trends" framing).
- **Independence**: written in a personal capacity, separate from techUK employment. Won't cover live client/lobbying matters personally involved in; will disclose relevant professional connections explicitly where they exist.

## Name & domain
- **Name**: Digital Connectivity Insights (DCI)
- **Domain**: digitalconnectivityinsights.com (confirmed available)
- Worth a final sanity check that "DCI" doesn't read as too close to existing DCMS/Ofcom terminology ("digital communications infrastructure") before fully locking in.

## Content model
Two distinct content types, kept clearly separated on the site:

1. **The Tracker** — a regularly-updated (not necessarily literally daily) feed of UK digital infrastructure policy developments, curated not analysed (headline + 1–2 sentences of context). Built to run largely automatically:
   - Sources to start: **DCMS** (now the lead department for telecoms/broadband/mobile, following the July 2026 abolition of DSIT), **Ofcom** (regulator), **DBIST** (secondary — tech/innovation policy read-across)
   - Note: DSIT no longer exists as of the July 2026 machinery-of-government reshuffle — don't build the source list around it. Departmental structure has shifted twice in under two years, so keep the source list easy to amend.
   - Filtered by keyword (telecoms, broadband, mobile, spectrum, 5G, Ofcom, BDUK, Openreach, etc.) so non-telecoms departmental content is excluded.
   - Build approach: start with a no-code RSS aggregation/filtering tool (e.g. RSS.app, Feedspot) combining and filtering the source feeds, embedded on the site's Tracker page — near-zero ongoing maintenance.
   - Upgrade path (later, only if the tracker proves used): route matched items via Zapier/Make into Airtable, add your own one-line commentary per item, display from there instead of the raw embed.

2. **Analysis** — monthly long-form deep dives, your core original writing, cross-posted to Substack, LinkedIn, and other channels. This is the flagship content; the tracker exists partly to surface material for these pieces.

## Distribution
- **Substack**: primary newsletter/email + growth engine (discovery, recommendations network) — not being replaced or migrated away from.
- **Own website (DCI)**: companion site, not a Substack replacement — houses the Tracker, an expanded About/positioning, and the Analysis archive. Planned build: **Framer** (no-code, low maintenance, enough flexibility for multiple content types).
- **LinkedIn**: additional distribution for the monthly pieces.

## Already drafted
- **About page** — full draft written (positioning, audience, independence/disclosure statement, cadence). File: `newsletter-about-page.md`. Needs: final name/domain filled in, bio details, contact email.

## Open items / to pick up next (in Claude Code)
- Build the Framer site structure: homepage, Tracker page, Analysis archive, About page.
- Set up RSS aggregation/filtering for the Tracker (DCMS, Ofcom, DBIST feeds; telecoms keyword filter).
- Homepage design concept — not yet started (offered, not yet built).
- Finalise About page copy with real name/domain/bio.
- Decide whether to do a final naming sanity-check against DCMS/Ofcom terminology before fully committing to "DCI."

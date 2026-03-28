# Marketing — homepage content map (this product)

**Purpose:** Map real product capabilities to homepage sections described in [MARKETING-HOMEPAGE-PRINCIPLES.md](MARKETING-HOMEPAGE-PRINCIPLES.md). Use for copy drafts, design briefs, and screenshot/video storyboards.

**Sources of truth:** [README.md](../README.md) (feature list), [MASTER-PLAN.md](MASTER-PLAN.md) (gaps / honest status).

---

## Positioning anchors (draft angles)

Use these as headline/sub-head raw material; refine with ICP (conference, gym, church, venue, corporate internal events, etc.).

| Angle | Pain | Outcome |
|--------|------|--------|
| Door speed | Lines, slow lookup, paper lists | Faster check-in at the door with camera scan |
| Accuracy & abuse | Shared screenshots, wrong person | Token-based QR (no PII in payload) + clear "already checked in" handling |
| Ops reality | Bad Wi‑Fi, crowded lobby | Offline queue + sync when back online |
| Organizer workflow | Spreadsheets everywhere | CSV import/export, event-scoped lists, admin dashboard |
| Builders / LC-NC | Custom forms, other tools | CSV import/export + future Zapier/Make parity (CSV still default) |

**Constraint to phrase carefully (product model today):** README notes **one organization per organizer** and **one event per organization** — homepage language should not imply unlimited parallel orgs/events per account unless that changes. "Central hub" in dev docs refers to architecture (event-scoped data, APIs), not necessarily unlimited events per customer.

---

## Hero (headline, sub, CTA, proof)

**Possible headlines (outcome-oriented):**

- Check guests in at the door in seconds — even when the network fails.
- QR check-in built for live venues: fast scans, offline-safe, no personal data in the code.

**Sub-head (who it's for):**

- For organizers and door staff running events where lines and connectivity matter.

**Primary CTA ideas:**

- Start free / Create your organization / See a demo scan (if you add a public demo).

**Proof (collect real assets over time):**

- Placeholder: "Used by …" only when true.
- Technical trust line: "QR payload: id + token only — no email in the barcode" (accurate per STEP-1 / README).

---

## Problem → solution (narrative blocks)

| Visitor pain | Product response (factual) |
|--------------|----------------------------|
| Long lines, manual lists | Continuous camera scanning, debounced reads, torch + distance hint |
| "Is this the right person?" / duplicate entry | Traffic-light UI; **409** = already checked in; distinct audio/haptic; manual search by name/email |
| Wi‑Fi dead zones | IndexedDB cache, offline check-in queue, dedupe, retry/backoff, queue count visible to staff |
| Guestlist in Excel/Sheets | CSV import with delimiter detect, UTF-8 guidance, merge/replace modes, row warnings + skipped-row export |
| Another system collects signups | CSV import (primary); automation integrations on roadmap |
| Staff need simple tools | Dedicated `/scanner` vs `/admin`; Clerk auth; org memberships + invitations |

---

## Aha section (show, don't tell)

**Strong visual candidates:**

1. **Scanner:** Traffic-light states (green / amber / red), torch, "6–10 inches" hint, success overlay.
2. **Admin:** Event selector, attendee table, stats, dark mode / density (polish story).
3. **Attendee-facing:** QR display + email delivery story (Resend); high-contrast QR (error correction H).

**Demo/training note:** `DEMO-*` codes exist for non-prod training; if marketing wants a safe public demo, that requires a deliberate product decision (MASTER-PLAN: gated in production).

---

## Benefits (features → outcomes)

| Capability (README / codebase) | Benefit copy direction |
|-------------------------------|------------------------|
| v2 QR `eventId:entryId:token`, no PII in QR | Privacy-preserving check-in; stolen photo is not "full identity leak" from the code alone |
| Manual check-in by name | Backup when QR won't read; accessibility / edge cases |
| Atomic manual check-in + 409 | No double check-in confusion; staff see consistent state |
| Rate limits (RSVP, webhook, check-in) | Abuse resistance for public endpoints |
| Zod + CSV injection sanitization | Safer imports and forms |
| Clerk + org memberships | Team access without sharing one password |
| `/api/health` + CI | Operational seriousness for buyers who care |

---

## Integrations / ecosystem

- **Today:** Webhook for programmatic entry; CSV as primary path for most organizers.
- **Story to watch:** [INTEGRATIONS-STRATEGY.md](INTEGRATIONS-STRATEGY.md) (Zapier/Make — not necessarily shipped).
- **Honest homepage line:** "Connect your form or import a spreadsheet" beats "1000+ integrations" until true.

---

## Pricing / plans

- **Finance placeholder:** `/admin/organization/finance` exists; ticketing/Stripe not implemented ([TICKETING-TYPES-PRICING-STRATEGY.md](TICKETING-TYPES-PRICING-STRATEGY.md)).
- Homepage should separate **SaaS subscription** story from **future ticket fees** if both are on the roadmap.
- Until numbers are real: "Pricing" section might be "Contact us" or "Starts at …" only after you have a number.

---

## Trust & security

**Claims you can ground in docs/code:**

- No PII in QR payload; token-based check-in.
- Input validation, rate limiting, health endpoint, CI.
- Offline behavior and idempotent replay semantics (409 as success on replay) — good for technical buyers.

**Add when available:** SOC 2, GDPR page, subprocessors list, DPA — not inferred from repo; add only when true.

---

## Social proof placeholders

- Testimonials: capture after pilot customers.
- Metrics: e.g. check-ins per event, median door time — only if measured.

---

## FAQ (starter questions visitors may ask)

- What happens if someone shows a screenshot of someone else's QR? → Already-checked-in signal + staff guidance (Option A in MASTER-PLAN); optional future metrics (Option B).
- Does it work offline? → Yes, with queued sync (describe simply).
- Can we use our own registration form? → Webhook + docs; CSV alternative.
- Is attendee email on the QR? → No (v2 format).
- Multi-event? → Align wording with current org/event limits in README.

---

## Onboarding continuity (homepage → product)

First-run paths to keep messaging aligned with:

- `/onboarding/organization`, `/onboarding/profile`, `/invite/accept`
- Login routing: users without org → onboarding ([`src/pages/login.astro`](../src/pages/login.astro))

Homepage CTA should match what happens after sign-up (e.g. "Create organization" not "Start event" if the flow is org-first).

---

## Gap list — do not claim on homepage until done

From MASTER-PLAN **Missing / Partial** (non-exhaustive; re-read before launch):

- Production Resend domain / `FROM_EMAIL` on owned domain
- Bulk QR ZIP download; print/badge layout
- Hardware keyboard-wedge scanner
- No-shows report / stronger live dashboard
- Optional: real-time multi-staff admin sync, Apple Wallet, paid ticketing

Use [EMAIL-SENDER-GO-LIVE-CHECKLIST.md](EMAIL-SENDER-GO-LIVE-CHECKLIST.md) before promising deliverability at scale.

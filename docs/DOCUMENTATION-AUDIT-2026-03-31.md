# Documentation audit — 2026-03-31

**Purpose:** Inventory project documentation, classify accuracy and intent, and flag overlap or staleness. **Authoritative dev progress** remains [`MASTER-PLAN.md`](MASTER-PLAN.md); this report does not replace it.

---

## Executive summary

| Category | Count (approx.) | Notes |
|----------|------------------|--------|
| **Aligned with shipped product** | ~15 core technical + ops docs | Master plan, setup guides, integration docs, user/staff guides |
| **Implemented but incomplete / drift** | Several | Partial features called out in master plan; some docs describe “before” state or unfinished checklists |
| **Planned / backlog (explicit)** | MASTER-PLAN §6–§14, integration roadmap | Hardware wedge, OpenAPI, Zapier/Make, ticketing, reporting |
| **Strategy, marketing, or speculative** | ~12+ | Product positioning, competitive docs, visual references, architecture sketches |

**Highest-value fixes for doc hygiene:** (1) reconcile **README** “Planned development” / Resend status with **MASTER-PLAN** (email go-live is done there); (2) mark **STEP-1** baseline section as historical or move to appendix; (3) refresh **UI modernization** checklists to “completed” or archive; (4) add a one-line banner to **ROADMAP-EVENT-RSVP** that `/rsvp` exists but per-event builder/domain work is still future.

---

## 1. Single source of truth

| Document | Role | Assessment |
|----------|------|--------------|
| [`MASTER-PLAN.md`](MASTER-PLAN.md) | Dev checklist, concern audit, implementation order, §14 OpenAPI roadmap | **Current** (last updated 2026-03-28). Best aggregate view of done vs partial vs missing. |

**Recommendation:** Any “what’s shipped?” question should start here; other docs are specialized or historical.

---

## 2. Done — reflects implemented work (or completed remediation)

These docs either track completed steps or describe systems that exist in code today.

| Document | What it covers | Notes |
|----------|----------------|-------|
| [`MASTER-PLAN.md`](MASTER-PLAN.md) | Checked items through org model, offline, UI phases, email go-live, many §11 steps | Concern table mixes **Done**, **Partial**, **Missing**, **Backlog** — read labels carefully. |
| [`STEP-2-CENTRAL-HUB.md`](STEP-2-CENTRAL-HUB.md) | Events, CSV-first hub, v2 QR shape | Accurate architecture reference. |
| [`INTEGRATIONS-STRATEGY.md`](INTEGRATIONS-STRATEGY.md) | Principles + **implemented** CSV + Eventbrite | “Target” LC/NC section is forward-looking but clearly labeled. |
| [`EVENTBRITE-INTEGRATION.md`](EVENTBRITE-INTEGRATION.md) | Pull sync, credentials, matching | Operational/engineering reference aligned with codebase pointers. |
| [`AUTH-CLERK-SETUP.md`](AUTH-CLERK-SETUP.md) | Clerk + org/membership model | Listed in master plan as done (item 2 + 12). |
| [`AUTH-GOOGLE-SETUP.md`](AUTH-GOOGLE-SETUP.md) | Provider setup | Supporting setup doc. |
| [`VERCEL-DEPLOYMENT.md`](VERCEL-DEPLOYMENT.md) | Deploy steps | Marked done in master plan. |
| [`EMAIL-SENDER-GO-LIVE-CHECKLIST.md`](EMAIL-SENDER-GO-LIVE-CHECKLIST.md) | Resend domain / FROM | Items checked complete in master plan §13. |
| [`SENTRY-SETUP.md`](SENTRY-SETUP.md) | Observability setup | Prescriptive setup (verify env matches repo). |
| [`qr-edge-cases.md`](qr-edge-cases.md) | Tests and CSV/manual paths | Tied to `scripts/test-edge-cases.mjs`. |
| [`DB-MODULE-LAYOUT.md`](DB-MODULE-LAYOUT.md) | Incremental `db.ts` split | **Partial** split documented; matches “Partial” in master plan. |
| [`USER-GUIDE.md`](USER-GUIDE.md), [`STAFF-GUIDE.md`](STAFF-GUIDE.md), [`FAQ.md`](FAQ.md), [`QUICK-START.md`](QUICK-START.md) | End-user / operator | Operational; should be updated when UX changes (per `docs/README.md`). |
| [`audit/AUDIT-2026-03-21.md`](audit/AUDIT-2026-03-21.md) | Security audit + **remediation log** | Historical snapshot; remediation log shows many items addressed. |
| [`EVENT-DAY-STRESS-HARDENING.md`](EVENT-DAY-STRESS-HARDENING.md) | Verify-first checklist + backlog tiers | **Reference** — describes what’s solid vs what to load-test; not a completion checklist. |

---

## 3. Implemented but needs work, partial, or at risk of staleness

### 3.1 Product / engineering reality (from MASTER-PLAN, not duplicate docs)

Master plan already labels these **Partial** or **Missing**: QR bulk ZIP, print badges, duplicate-name disambiguation, hardware keyboard wedge, stolen screenshot Option B, session ergonomics, no-shows report, live counter cadence, `db.ts` further split, real-time multi-staff sync, export-before-wipe, etc.

### 3.2 Documentation-specific drift

| Document | Issue | Suggested action |
|----------|--------|------------------|
| [`README.md`](../README.md) | “Planned development” still lists P0 Resend / `FROM_EMAIL` as **in progress**; master plan §13 marks **Done** (2026-03-23). | Update README table to match master plan or point only to master plan for status. |
| [`STEP-1-QR-SECURITY-PLAN.md`](STEP-1-QR-SECURITY-PLAN.md) | Contains **“Current State (Baseline — before Step 1)”** table describing old `Math.random`/JSON QR — reads like present-day if skimmed. | Prefix with **“Historical baseline (pre-migration)”** or collapse into appendix. |
| [`ui-modernization/CURSOR-CHECKLIST.md`](ui-modernization/CURSOR-CHECKLIST.md) | Pre-flight and many tasks unchecked | Master plan marks UI Phase 1–2 + Radix **Done** — either check off, add “Completed 2026-03” banner, or archive. |
| [`ui-modernization/qr-ui-implementation-roadmap.md`](ui-modernization/qr-ui-implementation-roadmap.md) | Step-by-step “create StatusBadge…” instructions | Same as above: **implementation guide**; status is largely superseded by shipped code. |
| [`ROADMAP-EVENT-RSVP.md`](ROADMAP-EVENT-RSVP.md) | “Current State” table: no per-event RSVP, static fields | **Partially stale:** `/rsvp` exists; **per-event form builder / theming / domains** remain sketch. `rsvp.astro` reads `?event=` but form wiring may be incomplete — clarify in doc. |
| [`Master-Bloat-Audit.md`](Master-Bloat-Audit.md) | Tracks burn-down; some items **Open** | Still useful; refresh “Last checked” when touched. |

### 3.3 Open findings in newer audit (may conflict with “all clear” messaging)

| Document | Issue |
|----------|--------|
| [`audit/AUDIT-2026-03-27.md`](audit/AUDIT-2026-03-27.md) | **CR-1:** Unauthenticated `POST /api/attendees` can target arbitrary `eventId` (product/security decision pending). **HI-1:** Resend webhook signature verification stubbed. **HI-2:** In-memory rate limits across instances. |

**Assessment:** README and 2026-03-21 audit emphasize resolved criticals; the 2026-03-27 audit highlights **remaining** risks. Treat both as complementary: remediation history vs current gap list.

---

## 4. Planned / backlog (explicit in master plan or strategy docs)

| Item | Where tracked | Notes |
|------|---------------|--------|
| Hardware keyboard wedge | MASTER-PLAN §6 | Not implemented |
| Zapier / Make first-class | MASTER-PLAN §10, §14.9, INTEGRATIONS-STRATEGY | Planned |
| Capacity, no-shows analytics, Wallet, group check-in | MASTER-PLAN §10 | Optional / later |
| Paid ticketing (Stripe, fees, payout tiers) | MASTER-PLAN, [`TICKETING-TYPES-PRICING-STRATEGY.md`](TICKETING-TYPES-PRICING-STRATEGY.md) | Strategy doc; not shipped |
| Public OpenAPI §14 (keys, CRUD, check-in API, webhooks, spec) | MASTER-PLAN §14 | Full section unchecked |
| Real-time admin sync (SSE/polling) | MASTER-PLAN backlog | Backlog |
| GDPR export before wipe | MASTER-PLAN backlog | Backlog |
| [`PARTIFUL-KILLER.md`](PARTIFUL-KILLER.md) epics (`tenancy-multi-event`, `stripe-ticketing`, etc.) | Explicitly **strategy-only**; fold into master plan when executing | |

---

## 5. Speculative, positioning, or non-implementation docs

These are valuable for **GTM, positioning, and design** but are not dev checklists.

| Document | Nature |
|----------|--------|
| [`PRODUCT-STRATEGY.md`](PRODUCT-STRATEGY.md) | ICPs, pricing posture, competitive angles, AI/credibility notes — **future-facing** in places |
| [`POSH-COMPETITIVE-ANALYSIS.md`](POSH-COMPETITIVE-ANALYSIS.md) | Competitive matrix and messaging |
| [`FOUNDER-CONTEXT.md`](FOUNDER-CONTEXT.md) | Narrative / positioning |
| [`MARKETING-IDEAS.md`](MARKETING-IDEAS.md), [`MARKETING-HOMEPAGE-*.md`](MARKETING-HOMEPAGE-ROUND-1.md) | Homepage concepts and principles |
| [`docs/visual-reference/*`](visual-reference/README.md) | Third-party landing references for inspiration |
| [`TICKETING-TYPES-PRICING-STRATEGY.md`](TICKETING-TYPES-PRICING-STRATEGY.md) | **Future** Stripe + schema strategy; states “not an implementation spec” |
| [`ROADMAP-EVENT-RSVP.md`](ROADMAP-EVENT-RSVP.md) | **Architecture sketch** — “pending prioritization” |
| [`PARTIFUL-KILLER.md`](PARTIFUL-KILLER.md) | Competitive roadmap + epic slugs; points to MASTER-PLAN for execution |

---

## 6. Index by folder (quick reference)

| Location | Contents |
|----------|----------|
| Repo root [`README.md`](../README.md) | Features, quick start, routes — **verify roadmap table vs master plan** |
| [`docs/README.md`](README.md) | Human-facing doc index |
| [`docs/audit/`](audit/) | Full integrity audits + template prompt |
| [`docs/ui-modernization/`](ui-modernization/) | UI roadmap, Radix mapping, architecture — **mostly historical after Phase 1–2 done** |
| [`docs/visual-reference/`](visual-reference/) | Marketing/visual references only |
| [`CURSOR-RULES.md`](../CURSOR-RULES.md) (if present) | Editor/agent rules — not product docs |

---

## 7. Recommended next actions (documentation only)

1. **One README edit:** Align “Planned development” / email sender row with [`MASTER-PLAN.md`](MASTER-PLAN.md) §13.
2. **STEP-1:** Add a short “Historical” label to the pre–Step 1 baseline section.
3. **UI modernization folder:** Top-of-file banner: “Phase 1–2 complete per master plan — retained for reference.”
4. **ROADMAP-EVENT-RSVP:** Clarify delta between today’s `/rsvp` + `?event=` and the full “form builder + custom domain” vision.
5. **Audit continuity:** Link [`AUDIT-2026-03-27.md`](audit/AUDIT-2026-03-27.md) from README “Security” if those findings remain accepted technical debt.

---

*This audit is a snapshot; update or supersede when major docs or releases ship.*

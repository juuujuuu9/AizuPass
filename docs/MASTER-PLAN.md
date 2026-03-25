# Master Plan — Dev Checklist & Roadmap

**Purpose:** Single source of truth for development progress. Use as the dev checklist; update when completing work; reference from other docs. Feeds into later documentation.

**Last updated:** 2026-03-25 — Eventbrite: organizer sync from **Integrations** (`/admin/events/integrations`) → `POST /api/integrations/eventbrite/sync`; credentials optional in `events.settings.eventbrite` (token never re-exposed in UI). Prior: §11.A P1 offline queue; §13 `npm run smoke:email`; ingest **`/api/ingest/entry`**.

---

## How to use this doc

- **Dev checklist:** Work through the [Implementation order](#implementation-order) below; check off items as done.
- **Progress:** When you complete an item, update its checkbox and the "Last updated" date at the top. Add a short "Done" note (e.g. PR or key files) if helpful.
- **References:** Other docs (e.g. [STEP-1-QR-SECURITY-PLAN.md](STEP-1-QR-SECURITY-PLAN.md)) implement specific items; this plan stays high-level and points to them.
- **Docs later:** This file can be used as the basis for release notes, onboarding, or public roadmap.

---

## Concern audit (current vs target)

| Concern | Status | Notes |
|--------|--------|-------|
| RSVP in DB | Done | `scripts/setup-tables.mjs`, `src/lib/db.ts` |
| Unique identifier | **Done** | UUID + short-lived token; see STEP-1. |
| QR gen + email | Done | `src/lib/email.ts`, RSVPForm |
| Production sender domain (`FROM_EMAIL`) | **Done** | Resend: `aizupass.com` verified, Pro. Production `FROM_EMAIL`/`FROM_NAME` set on deploy; bulk-email modal reads server `FROM_EMAIL` (`import.astro`). Smoke: `npm run smoke:email` (2026-03-23). |
| QR download (single + bulk ZIP) | Missing | CSV export exists; no QR PNG download/ZIP flow yet. |
| Print-ready QR badges (name below code) | Missing | No print stylesheet or badge layout currently. |
| QR minimum size thresholds | Partial | QR width is set in config, but no explicit print-size enforcement/tests. |
| Duplicate-name disambiguation | Missing | Canonical IDs are unique; print/search/export disambiguators are not implemented. |
| Scanner + validation | Done | CheckInScanner, `api/checkin` with 409 for duplicate |
| Low-light / damaged QR fallback UX | Partial | Manual name check-in exists; no dedicated degraded-scan mode/test matrix enforcement. |
| Scanning speed / perceived latency | Partial | Debounce + preload implemented; no explicit p95 budget instrumentation/loading-state SLA. |
| PII in QR | **Done** | QR is `id:qr_token` only; no email in payload. |
| Staff login (Clerk) | **Done** | Clerk authentication + app-managed org membership authorization (`organizations`, `organization_memberships`, `organization_invitations`). |
| Scanner role vs admin ACL | **Done** | Access is org/event scoped: organizer manages org/event; staff scans and works inside assigned org events only. |
| Session timeout + fast re-entry | Partial | Clerk session; scanner: 401/403 handling, `/api/me/profile` ping on focus, sign-in / onboarding links (`CheckInScanner`). |
| Manual override (search by name) | **Done** | CheckInScanner "Check in by name" search; GET /api/attendees?q=; POST /api/checkin { attendeeId }. |
| Manual check-in race safety | **Done** | Manual attendee path now uses conditional atomic update and returns 409 on duplicate check-in. |
| Traffic light UI (Green/Yellow/Red) | Done | Green/amber/red; 409 = yellow (already checked in). CheckInScanner + api/checkin. |
| Audio / haptic feedback | Done | Preload + vibrate + success/error/already tones; aria-live. src/lib/feedback.ts, CheckInScanner. |
| Target overlay / distance hint | **Done** | "6–10 inches" hint when scanning; qrbox. |
| Flashlight / torch | **Done** | Custom torch button via getRunningTrackCameraCapabilities when supported. |
| Hardware scanner (keyboard wedge) | Missing | No hidden input for laser scanners. |
| Stolen screenshot / scan count | Partial | Option A is implemented (clear already-checked-in guidance in scanner); Option B (duplicate scan counters in DB/admin) is still pending. |
| Brightness / high-contrast QR | **Done** | Explicit black/white QR colors + `errorCorrectionLevel: 'H'` in `src/config/qr.ts`; scanner guidance includes attendee brightness reminder. |
| Demo check-in codes gated | **Done** | Demo codes (`DEMO-SUCCESS`/`DEMO-ALREADY`/`DEMO-INVALID`) gated behind `!import.meta.env.PROD` in `api/checkin.ts`. |
| Debug code in production | **Done** | Removed agent log fetch calls from CheckInScanner.tsx. |
| Auth bypass vulnerability | **Done** | Added NODE_ENV check to test bypass in middleware.ts. |
| Input validation | **Done** | Added zod validation for email, forms, check-ins. |
| CSV injection protection | **Done** | Sanitize formula-triggering characters in CSV import. |
| Health check endpoint | **Done** | Created /api/health for monitoring. |
| CI/CD pipeline | **Done** | GitHub Actions workflow for build and test. |
| Production deployment docs | **Done** | VERCEL-DEPLOYMENT.md with step-by-step guide. |
| SaaS product naming | **Done** | **AizuPass** — browser titles via `Layout.astro` / `ScannerLayout.astro`, auth page headings, README, product strategy; npm package name `aizupass`. |
| Offline capability | **Done** | IndexedDB `aizupass-offline` (was `qr-check-in-offline`); one-time copy + merge + legacy delete on first open (`localStorage` marker `aizupass-offline-migrated`). Cache, offline queue, sync on reconnect; 409 = success. `src/lib/offline.ts`, `api/attendees/offline-cache`. |
| Offline sync resilience (backoff/idempotency/queue visibility) | **Done** | Added queue dedupe, retry-with-backoff sync, and scanner-visible queue count. |
| Event-day scale / cache warm-up / load verification | Reference | Stress lens + prioritized hardening (verify-first): [EVENT-DAY-STRESS-HARDENING.md](EVENT-DAY-STRESS-HARDENING.md). |
| Multi-event / central hub | **Done** | Events table, event-scoped attendees; guestlist ingestion: **CSV primary** for most users; `POST /api/ingest/entry` for automation; **Eventbrite** pull sync on **Integrations** (private token); Zapier/Make first-class TBD — see [INTEGRATIONS-STRATEGY.md](INTEGRATIONS-STRATEGY.md). |
| Event-scoped scanner/manual override hardening | Partial | Event scoping exists broadly; scanner entry path/manual UX still needs stricter guardrails. |
| Persistent event selection | **Done** | staff_preferences table; last_selected_event_id survives logout/login, works across devices. |
| Attendance export with operational presets | Partial | Export with timestamps exists; dedicated checked-in/no-show presets pending. |
| No-shows report | Missing | Can be derived from CSV, but no explicit in-app no-shows view/export flow. |
| Real-time check-in counter dashboard | Partial | 30s polling exists; near real-time organizer dashboard still limited. |
| Add to Wallet / Group / Capacity / Analytics | Not implemented | Optional; prioritize later. |
| Paid ticketing (Stripe, ticket types, inventory) | Not implemented | Fourth attendee path: Checkout → webhook → attendee + payment metadata; catalog vs fulfillment split. See [TICKETING-TYPES-PRICING-STRATEGY.md](TICKETING-TYPES-PRICING-STRATEGY.md). Billing placeholder: `/admin/organization/billing` (SaaS vs ticket charges — keep separate). |
| Rate limiting on RSVP/webhook | **Done** | `lib/rate-limit.ts`; 20/min attendees, 60/min webhook; checkin unchanged (5/min). |
| Scanner debounce (150ms→500ms) | **Done** | `config/qr.ts` debounceMs: 500; CheckInScanner uses it. |
| QR error correction H | **Done** | `config/qr.ts`; webhook email uses QR_GENERATION. |
| db.ts split | **Partial** | First slice done (2026-03-22): `client.ts`, `event-row.ts`, `organizations.ts`; `db.ts` re-exports. Remaining: attendees/check-in/events-in-root as future slices. [DB-MODULE-LAYOUT.md](DB-MODULE-LAYOUT.md). |
| Real-time sync (multi-staff) | Backlog | Two staff don't see each other's check-ins; optional polling/SSE for admin. |
| Export/archive before wipe | Backlog | GDPR, data retention; export flow before delete-event. |

---

## Implementation order

Follow this order; check off and date as you complete each item.

### 1. UUID + no PII in QR — security and reliability

- [x] **Done.** UUID for attendee `id`; QR payload is `id:qr_token` only; rate limit + audit on check-in. See [STEP-1-QR-SECURITY-PLAN.md](STEP-1-QR-SECURITY-PLAN.md). Run `npm run migrate-qr` if you have existing data.

### 2. Clerk Authentication — org-scoped dashboard/scanner access

- [x] **Done.** Migrated from auth-astro to Clerk (March 2026), then moved authorization from env email roles to app-managed organizations/memberships/invitations (March 2026). Dedicated `/admin`, `/scanner`, `/login`; middleware requires sign-in and APIs enforce org/event scoping. RSVP stays public on `/`. Env: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. Supports multiple auth providers (Google, email/password, magic links, etc.). See [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md).

### 3. Central Hub (multi-event)

- [x] **Done.** Schema: `events` table, `attendees` extended with `event_id`, `microsite_entry_id`, `source_data`; migration `npm run migrate-events` (with `--dry-run`); default event backfill.
- [x] **Done.** QR format: `eventId:entryId:token` (v2); encode/decode in `src/lib/qr.ts`; v1-legacy (2 parts) supported during transition.
- [x] **Done.** Webhook: `POST /api/ingest/entry` with `MICROSITE_WEBHOOK_KEY`; idempotency by `event_id` + `microsite_entry_id`; optional QR refresh. Option B (per-event keys) doc’d in STEP-2.
- [x] **Done.** Admin: event selector, filter attendees/stats by event; `GET /api/events`, `GET /api/attendees?eventId=`; `/admin/events`, `/admin/events/new`.
- [x] **Done.** Scanner: event name shown in success result when present.
- [x] **Done.** CSV import: Admin → select event → Import CSV; map columns to attendees; dedupe by event+email; `source_data` for import metadata. See [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md).
- [x] **Done (Mar 2026 hardening).** CSV import edge cases: delimiter auto-detect (comma/semicolon/tab), UTF-8 guidance, row-level warnings + downloadable skipped-row CSV, explicit `add`/`merge`/`replace` import modes, and batched server processing for larger files.
- [x] **Done (Mar 2026 identity contract tightening).** CSV import now requires `email` plus either (`first_name` + `last_name`) or `full_name` fallback mapping; optional extra columns are explicitly user-mapped with custom labels and saved in `source_data`.

### 4. Manual check-in by name

- [x] **Done.** "Check in by name" on scanner page: search by name/email (GET /api/attendees?q=); POST /api/checkin with attendeeId for staff override. CheckInScanner, db searchAttendees, api searchAttendees + checkInAttendeeById.

### 5. Traffic light UI + audio/haptic + distance hint

- [x] **Done.** Green — success; Yellow (amber) — already checked in (409); Red — invalid/not found. Vibrate + preloaded audio + aria-live; standalone overlay + "Scan next"; 500 ms debounce for scan stability; continuous scanning on `/scanner`. `src/lib/feedback.ts`, `CheckInScanner.tsx`, `src/config/qr.ts`, `api/checkin` 409 body.
- [x] **Done.** "6–10 inches" distance hint when scanning; custom torch button when device supports it (getRunningTrackCameraCapabilities).

### 6. Hardware scanner (keyboard wedge)

- [ ] Hidden/minimal focused input on scanner page; on Enter, treat value as scanned code and call same check-in logic.

### 7. Stolen screenshot visibility

- [x] **Done (Option A).** Clear 409 copy added in scanner UI ("If this is a different guest, ask for ID and use name search."). Option B (`scan_attempt_count` + duplicate scan metrics in admin/scanner) remains backlog.

### 8. High-contrast QR + brightness copy

- [x] **Done.** Explicit black/white QR generation config (`dark: '#000000'`, `light: '#FFFFFF'`) with `errorCorrectionLevel: 'H'`; scanner instructions reinforce attendee brightness guidance.

### 9. Offline capability

- [x] **Done.** IndexedDB cache via GET /api/attendees/offline-cache (staff-only, includes qr_token); offline check-in queue; sync when online; 409 treated as success. Manual search uses cache when offline. `src/lib/offline.ts`, CheckInScanner.
- [x] **Done (2026-03-23).** IndexedDB database name aligned with AizuPass: `aizupass-offline`, with one-time migration from legacy `qr-check-in-offline` (guest-list + queue merge by id, then legacy DB deleted; retries if migration throws before the marker is set).

### 10. Optional (later)

- [x] Protect admin API routes (attendees, send-email, checkin, refresh-qr) with session check — done in middleware.
- [ ] **Integrations — Zapier / Make (first-class):** Published connector(s) or maintained recipes with **parity** to the HTTP guestlist API for LC/NC users; same strategic weight as API improvements. Strategy: [INTEGRATIONS-STRATEGY.md](INTEGRATIONS-STRATEGY.md).
- [ ] Capacity widget and/or no-show analytics.
- [ ] Add to Wallet, group check-in — if needed.
- [ ] **Paid ticketing:** Stripe Checkout → webhook → attendee creation with ticket type + payment metadata; reuse QR email flow. Strategy and schema notes: [TICKETING-TYPES-PRICING-STRATEGY.md](TICKETING-TYPES-PRICING-STRATEGY.md).

### 11. Edge-case hardening (operational)

- [ ] **QR delivery + print**
  - Single QR PNG download in attendee/admin QR surfaces. **Done (2026-03-18):** Added `Download QR` action in `QRDisplay` (normal + fullscreen modes).
  - Bulk QR ZIP export by event/selection.
  - Print-friendly badge layout with guest name visible below QR.
  - Duplicate-name disambiguation for print/export/search (short ID suffix).
- [ ] **QR scannability safeguards**
  - Explicit print vs screen QR profiles in config.
  - Minimum physical size threshold with documented pass/fail test matrix.
- [ ] **Door-operations resilience**
  - Low-light/damaged-code fallback UX improvements. **Partial (2026-03-23):** while scanning, explicit fallback to torch + check-in by name (`CheckInScanner.tsx`).
  - Sub-second perceived feedback target with measurable latency budget.
  - Clear re-scan copy and differentiated already-checked-in cues. **Done (2026-03-18):** explicit ID-check guidance + distinct warning-state feedback in scanner (`src/components/CheckInScanner.tsx`, `src/lib/feedback.ts`).
- [ ] **Offline + multi-station correctness**
  - Sync retry/backoff and queue visibility for operators. **Done (2026-03-18):** retry-with-backoff + live queued count (`src/lib/offline.ts`, `src/components/CheckInScanner.tsx`).
  - Manual check-in path made atomic/idempotent (409 on duplicate). **Done (2026-03-18):** conditional DB update + 409 replay behavior (`src/lib/db.ts`, `src/pages/api/checkin.ts`).
  - Duplicate submission protection for offline replay. **Done (2026-03-23):** single-transaction dedupe in `addToQueue`; `syncQueue` runs serialized; initial online mount drains queue; 401/403 stops sync without dropping rows (`src/lib/offline.ts`, `CheckInScanner.tsx`).
- [ ] **Roles + session ergonomics**
  - Enforce scanner vs admin route/API boundaries in middleware. **Done (2026-03-18):** middleware/API boundaries enforced, now org/membership scoped.
  - Tighten scanner-device re-auth/session-expiry flow. **Partial (2026-03-23):** `GET /api/me/profile` session probe, tab visibility refresh, inline banner + toasts on 401/403 for scan, manual check-in, cache fetch, and queue sync (`src/pages/api/me/profile.ts`, `CheckInScanner.tsx`).
- [ ] **Post-event reporting**
  - Dedicated no-shows report/filter + export.
  - Enhanced live counter (`checked-in / total`) with tighter update cadence.

#### 11.A Priority sequence (execution order)

- **P1 — correctness + door reliability (do first)**
  - Offline + multi-station correctness
  - Door-operations resilience
  - Roles + session ergonomics (API/route boundaries first)
- **P2 — attendee asset quality**
  - QR delivery + print
  - QR scannability safeguards
- **P3 — organizer visibility**
  - Post-event reporting (no-shows + upgraded live counter)

#### 11.B Next logical step (ready to execute)

- [x] **Step 11.1 — Fix manual check-in race + idempotency baseline**  
  **Why first:** Prevents double-check-ins across simultaneous staff actions; highest operational risk.  
  **Scope:**  
  - Make manual `attendeeId` check-in path conditional/atomic (`already checked in` => 409).  
  - Ensure offline sync treats duplicate replay as idempotent success.  
  - Add regression coverage for concurrent manual check-ins.  
  **Done (2026-03-18):** Added atomic manual check-in update + 409 replay handling (`src/lib/db.ts`, `src/pages/api/checkin.ts`), queue dedupe for offline replay (`src/lib/offline.ts`), and concurrent manual race test (`scripts/test-edge-cases.mjs`).  
  **Primary files:** `src/lib/db.ts`, `src/pages/api/checkin.ts`, `src/lib/offline.ts`, `scripts/test-edge-cases.mjs`.  
  **Acceptance criteria:**  
  - Two simultaneous manual check-ins for same attendee result in exactly one success and one 409.  
  - Replayed offline queue item for already-checked-in attendee does not create duplicate state or error loop.  
  - Existing QR token scan path behavior remains unchanged.

#### 11.C Immediate follow-on steps

- [x] **Step 11.2 — Scanner feedback hardening** (explicit 409 guidance, distinct already-checked-in cue, processing-state UX)  
  **Done (2026-03-18):** Added scan/manual processing-state indicator, converted already-checked-in to warning UX, added explicit ID-check guidance in scanner UI, and made already-checked-in feedback acoustically distinct via a double-beep pattern (`src/components/CheckInScanner.tsx`, `src/lib/feedback.ts`).
- [x] **Step 11.3 — Offline sync resilience** (retry/backoff + queue visibility)  
  **Done (2026-03-18):** Added retry-with-backoff sync behavior for transient server failures and exposed live queued-check-in count in scanner UI (`src/lib/offline.ts`, `src/components/CheckInScanner.tsx`).
- [x] **Step 11.4 — Role boundary enforcement** (true scanner/admin ACL split in middleware + API surface)  
  **Done (2026-03-18):** Enforced role boundaries in middleware/API surface; later superseded by org/membership-based authorization in Step 12.

### 12. Organization-based access model (one org / one event for now)

- [x] **Done (2026-03-18).** Replaced env-based email role mapping with app-managed organizations, memberships, and invitations. Enforced one organization per organizer and one event per organization (paywall-ready constraint); scoped dashboard/scanner/API access to organization events. Added organizer onboarding and staff invitation acceptance flows. Primary files: `scripts/migrate-organizations.mjs`, `src/lib/db.ts`, `src/middleware.ts`, `src/pages/api/organizations/*`, `src/pages/onboarding/organization.astro`, `src/pages/invite/accept.astro`, `src/pages/admin/organization.astro`.

### 13. Go-live email sender readiness

- [x] Verify Resend sending domain for production website domain.  
  **Done (2026-03-23):** `aizupass.com` in Resend; Pro plan.
- [x] Set `FROM_EMAIL` to `noreply@aizupass.com` (or another address on the verified domain) in production environment.  
  **Done (2026-03-23):** production env updated to verified-domain sender.
- [x] Confirm sender preview in admin bulk email modal shows `... <noreply@aizupass.com>` (or your chosen `FROM_EMAIL`).  
  **Done (2026-03-23):** bulk-email dialog on `/admin/events/import` embeds server `FROM_EMAIL` in the sender preview; display name is org name or custom via `import-page.ts` (aligns with `send-bulk-qr` overrides).
- [x] Run one end-to-end bulk-email smoke test in production-like env after domain verification.  
  **Done (2026-03-23):** `npm run smoke:email -- <recipient>` — Resend send with `AizuPass <noreply@aizupass.com>` + PNG attachment (`scripts/smoke-prod-email.mjs`). Optional follow-up: send one QR email from live Admin to fully exercise `/api/send-email` or bulk path on Vercel.

### UI/UX polish (done)

- [x] **Done.** Status badges (success/muted), empty states, table hover actions, activity feed with relative timestamps, typography hierarchy, dark mode (class-based toggle), search with cmd+K (fuse.js), progress bar on check-in rate card, micro-interactions (scanner pulse, delete spinner), density toggle, avatars, bulk select/delete/export, event combobox. See `.cursor/plans/` for full spec.

### UI Modernization (Phase 1–2)

- [x] **Done.** Phase 1 — Foundation: `src/lib/formatters.ts` (formatRelativeTime), animation styles in `global.css` (status flip, QR breathing, live indicator, skeleton, etc.), `StatusBadge` and `EmptyState` primitives in `src/components/ui/`. Phase 2 — Table: gradient avatars, `StatusBadge` in status column, Check-in column with `formatRelativeTime(checkedInAt)`, hover-only action buttons, `EmptyState` when no attendees. See [docs/ui-modernization/](ui-modernization/) and `.cursor/rules/ui-modernization.mdc`.

### Radix Colors

- [x] **Done.** `@radix-ui/colors` installed; `src/styles/tokens.css` with mauve/green/red/amber scales + brand (#d63a2e) mapping; `global.css` themed via semantic tokens; scanner overlay, CTAs, toasts, error states, QR frame use Radix vars. See [docs/ui-modernization/radix-colors-mapping.md](ui-modernization/radix-colors-mapping.md).

### Backlog (from OpenKlaw architecture review)

Quick wins (≈30 min each):

| Priority | Item | Notes |
|----------|------|-------|
| P1 | Rate limit RSVP + webhook | [x] Done. `lib/rate-limit.ts`; attendees 20/min, webhook 60/min. |
| P2 | Scanner debounce 150ms→500ms | [x] Done. `config/qr.ts` debounceMs: 500. |
| P3 | QR `errorCorrectionLevel: 'H'` | [x] Done. `config/qr.ts` + webhook email. |
| P4 | Split db.ts | Optional refactor: `lib/db/attendees.ts`, `events.ts`, `checkin.ts`. |

Deferred / lower priority:

- **P2 (duplicate check-in UX)**: Already handled — check-in API returns 409 for "already checked in"; both staff see yellow/amber.
- **Real-time sync**: Admin dashboard doesn't auto-update; consider polling or SSE for multi-staff events.
- **Export/archive**: Add CSV export flow before event wipe for GDPR/retention.

---

## Related docs

| Doc | Covers |
|-----|--------|
| [STEP-1-QR-SECURITY-PLAN.md](STEP-1-QR-SECURITY-PLAN.md) | Item 1: UUID, token-only QR, rate limit, audit, migration. |
| [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md) | Item 3: Central hub, events, CSV import (primary), webhook optional. |
| [INTEGRATIONS-STRATEGY.md](INTEGRATIONS-STRATEGY.md) | Guestlist integrations: CSV-first for typical users; API + Zapier/Make as equal-weight automation paths; security/scalability notes. |
| [FORM-MICROSITE-SETUP.md](FORM-MICROSITE-SETUP.md) | Linking a form microsite to the hub; copying Cursor rule into new projects. |
| [form-microsite-hub-integration.mdc](form-microsite-hub-integration.mdc) | Portable Cursor rule: copy to new microsite’s `.cursor/rules/` for hub integration context. |
| [EMAIL-SENDER-GO-LIVE-CHECKLIST.md](EMAIL-SENDER-GO-LIVE-CHECKLIST.md) | Production sender cutover checklist (Resend domain verify, `FROM_EMAIL=noreply@...`, modal preview + smoke test). |
| [ui-modernization/](ui-modernization/) | UI Modernization: CURSOR-CHECKLIST, qr-ui-components, qr-ui-animations.css. Rule: `.cursor/rules/ui-modernization.mdc`. Radix Colors: `radix-colors-mapping.md`. |
| [qr-edge-cases.md](qr-edge-cases.md) | API edge-case tests, CSV import validation, critical manual paths. `scripts/test-edge-cases.mjs`, `scripts/generate-test-csvs.mjs`. |
| [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md) | Item 2 + 12: Clerk auth setup, org/membership-based authorization, onboarding/invites. |
| [TICKETING-TYPES-PRICING-STRATEGY.md](TICKETING-TYPES-PRICING-STRATEGY.md) | Future: paid ticketing — ticket type catalog, Stripe alignment, fulfillment vs SaaS billing, idempotency, build sequencing. |
| [DB-MODULE-LAYOUT.md](DB-MODULE-LAYOUT.md) | Incremental split of `src/lib/db.ts` into `src/lib/db/*.ts`; public imports stay `@/lib/db`. |

---

## Keeping this updated

1. When you **start** work on a checklist item: no change required (optional: add "In progress" in the item).
2. When you **complete** an item: set `[x]`, add a one-line "Done" note and key files/PR if useful, and update **Last updated** at the top.
3. If the **concern audit** table changes (new concern or status change): update the table and any new implementation row.
4. When adding **new docs** that implement an item: add them under [Related docs](#related-docs).

# Master Plan — Dev Checklist & Roadmap

**Purpose:** Single source of truth for development progress. Use as the dev checklist; update when completing work; reference from other docs. Feeds into later documentation.

**Last updated:** 2026-02-18 (test plan expansion)

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
| Scanner + validation | Done | CheckInScanner, `api/checkin` with 409 for duplicate |
| PII in QR | **Done** | QR is `id:qr_token` only; no email in payload. |
| Staff login (Clerk) | **Done** | Clerk authentication with role-based access; STAFF_EMAILS/ADMIN_EMAILS/STAFF_DOMAINS allowlist. Migrated from auth-astro to Clerk in March 2026. |
| Manual override (search by name) | **Done** | CheckInScanner "Check in by name" search; GET /api/attendees?q=; POST /api/checkin { attendeeId }. |
| Traffic light UI (Green/Yellow/Red) | Done | Green/amber/red; 409 = yellow (already checked in). CheckInScanner + api/checkin. |
| Audio / haptic feedback | Done | Preload + vibrate + success/error/already tones; aria-live. src/lib/feedback.ts, CheckInScanner. |
| Target overlay / distance hint | **Done** | "6–10 inches" hint when scanning; qrbox. |
| Flashlight / torch | **Done** | Custom torch button via getRunningTrackCameraCapabilities when supported. |
| Hardware scanner (keyboard wedge) | Missing | No hidden input for laser scanners. |
| Stolen screenshot / scan count | Missing | No "duplicate use" visibility in admin/scanner. |
| Brightness / high-contrast QR | Partial | Email copy exists; QR config not explicit. |
| Offline capability | **Done** | IndexedDB cache, offline queue, sync on reconnect; 409 = success. `src/lib/offline.ts`, `api/attendees/offline-cache`. |
| Multi-event / central hub | **Done** | Events table, event-scoped attendees; microsite sync = CSV import (primary); webhook optional. |
| Persistent event selection | **Done** | staff_preferences table; last_selected_event_id survives logout/login, works across devices. |
| Add to Wallet / Group / Capacity / Analytics | Not implemented | Optional; prioritize later. |
| Rate limiting on RSVP/webhook | **Done** | `lib/rate-limit.ts`; 20/min attendees, 60/min webhook; checkin unchanged (5/min). |
| Scanner debounce (150ms→500ms) | **Done** | `config/qr.ts` debounceMs: 500; CheckInScanner uses it. |
| QR error correction H | **Done** | `config/qr.ts`; webhook email uses QR_GENERATION. |
| db.ts split | Backlog | 300+ lines; consider lib/db/attendees, events, checkin. |
| Real-time sync (multi-staff) | Backlog | Two staff don't see each other's check-ins; optional polling/SSE for admin. |
| Export/archive before wipe | Backlog | GDPR, data retention; export flow before delete-event. |

---

## Implementation order

Follow this order; check off and date as you complete each item.

### 1. UUID + no PII in QR — security and reliability

- [x] **Done.** UUID for attendee `id`; QR payload is `id:qr_token` only; rate limit + audit on check-in. See [STEP-1-QR-SECURITY-PLAN.md](STEP-1-QR-SECURITY-PLAN.md). Run `npm run migrate-qr` if you have existing data.

### 2. Clerk Authentication — staff-only Admin

- [x] **Done.** Migrated from auth-astro to Clerk (March 2026). Dedicated `/admin`, `/scanner`, `/login`; middleware protects routes and APIs; Clerk handles sessions; role from env allowlist (STAFF_EMAILS, ADMIN_EMAILS, STAFF_DOMAINS). RSVP stays public on `/`. Env: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. Supports multiple auth providers (Google, email/password, magic links, etc.). See [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md).

### 3. Central Hub (multi-event)

- [x] **Done.** Schema: `events` table, `attendees` extended with `event_id`, `microsite_entry_id`, `source_data`; migration `npm run migrate-events` (with `--dry-run`); default event backfill.
- [x] **Done.** QR format: `eventId:entryId:token` (v2); encode/decode in `src/lib/qr.ts`; v1-legacy (2 parts) supported during transition.
- [x] **Done.** Webhook: `POST /api/webhooks/entry` with `MICROSITE_WEBHOOK_KEY`; idempotency by `event_id` + `microsite_entry_id`; optional QR refresh. Option B (per-event keys) doc’d in STEP-2.
- [x] **Done.** Admin: event selector, filter attendees/stats by event; `GET /api/events`, `GET /api/attendees?eventId=`; `/admin/events`, `/admin/events/new`.
- [x] **Done.** Scanner: event name shown in success result when present.
- [x] **Done.** CSV import: Admin → select event → Import CSV; map columns to attendees; dedupe by event+email; `source_data` for import metadata. See [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md).

### 4. Manual check-in by name

- [x] **Done.** "Check in by name" on scanner page: search by name/email (GET /api/attendees?q=); POST /api/checkin with attendeeId for staff override. CheckInScanner, db searchAttendees, api searchAttendees + checkInAttendeeById.

### 5. Traffic light UI + audio/haptic + distance hint

- [x] **Done.** Green — success; Yellow (amber) — already checked in (409); Red — invalid/not found. Vibrate + preloaded audio + aria-live; standalone overlay + "Scan next"; 150 ms delay; continuous scanning on /scanner. `src/lib/feedback.ts`, `CheckInScanner.tsx`, `api/checkin` 409 body.
- [x] **Done.** "6–10 inches" distance hint when scanning; custom torch button when device supports it (getRunningTrackCameraCapabilities).

### 6. Hardware scanner (keyboard wedge)

- [ ] Hidden/minimal focused input on scanner page; on Enter, treat value as scanned code and call same check-in logic.

### 7. Stolen screenshot visibility

- [ ] Option A: Clear 409 copy ("If this is a new guest, ask for ID…"). Option B: `scan_attempt_count` (or similar) in DB; show "Duplicate scans: N" in admin and on scanner.

### 8. High-contrast QR + brightness copy

- [ ] Explicit black/white in QR config if needed; keep or strengthen email copy about brightness.

### 9. Offline capability

- [x] **Done.** IndexedDB cache via GET /api/attendees/offline-cache (staff-only, includes qr_token); offline check-in queue; sync when online; 409 treated as success. Manual search uses cache when offline. `src/lib/offline.ts`, CheckInScanner.

### 10. Optional (later)

- [x] Protect admin API routes (attendees, send-email, checkin, refresh-qr) with session check — done in middleware.
- [ ] Capacity widget and/or no-show analytics.
- [ ] Add to Wallet, group check-in — if needed.

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
| [FORM-MICROSITE-SETUP.md](FORM-MICROSITE-SETUP.md) | Linking a form microsite to the hub; copying Cursor rule into new projects. |
| [form-microsite-hub-integration.mdc](form-microsite-hub-integration.mdc) | Portable Cursor rule: copy to new microsite’s `.cursor/rules/` for hub integration context. |
| [ui-modernization/](ui-modernization/) | UI Modernization: CURSOR-CHECKLIST, qr-ui-components, qr-ui-animations.css. Rule: `.cursor/rules/ui-modernization.mdc`. Radix Colors: `radix-colors-mapping.md`. |
| [qr-edge-cases.md](qr-edge-cases.md) | API edge-case tests, CSV import validation, critical manual paths. `scripts/test-edge-cases.mjs`, `scripts/generate-test-csvs.mjs`. |
| [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md) | Item 2: Clerk authentication setup, environment variables, role configuration. |
| (This implementation) | Item 2: Clerk middleware, login page, staff allowlist (src/lib/staff.ts). |

---

## Keeping this updated

1. When you **start** work on a checklist item: no change required (optional: add "In progress" in the item).
2. When you **complete** an item: set `[x]`, add a one-line "Done" note and key files/PR if useful, and update **Last updated** at the top.
3. If the **concern audit** table changes (new concern or status change): update the table and any new implementation row.
4. When adding **new docs** that implement an item: add them under [Related docs](#related-docs).

# Bloat Audit — Blind Round Summary

**Date:** 2026-03-19
**Codebase:** ~11,100 lines across 80+ source files
**Models:** Composer 2 · Kimi K2.5 · Claude Opus 4.6
**Method:** All three audits run in parallel with no model seeing another's output.

This supersedes the original sequential summary (`bloat_audit_summary.docx`). In that run each model had access to prior audits, creating compounding confirmation bias. These findings are independent.

---

## Status vs codebase

**Last checked:** 2026-03-22 — refresh this section when you burn down items below.

### Phase 1 — pure deletions / deps

| Audit item | Status |
|------------|--------|
| Delete `rate-limit-edge.ts` | **Done** — file absent |
| Remove unused webhook Zod exports from `validation.ts` | **Done** — no webhook schema exports in that file |
| Remove `tslib` from `dependencies` | **Done** |
| Move `dotenv` to `devDependencies` | **Done** |
| Delete `AppShell.tsx`, `scroll-area.tsx`, `auth.d.ts` | **Done** — files absent |

### Phase 2 — dedup / small refactors

| Audit item | Status |
|------------|--------|
| `postCheckIn()` in `src/services/api.ts` | **Done** |
| QR via `src/lib/qr-client.ts` | **Done** — RSVP, admin, webhook, bulk paths |
| `src/lib/env.ts` | **Done** |
| `rowToOffline` + `OfflineCacheAttendee` single source | **Done** — `db.ts`; type imported in `offline.ts` |
| UUID validation consolidated | **Done** — `src/lib/uuid.ts` |
| Gate demo check-in in production | **Done** — `src/pages/api/checkin.ts` |

### Phase 3 — structural

| Audit item | Status |
|------------|--------|
| `json()` / `errorResponse()` / `csvResponse()` in `src/lib/api-response.ts` | **Done** for the former stragglers (`export` → `csvResponse`, `send-bulk-qr`, `health` GET, `refresh-qr`, `refresh-qr-bulk`). `health` HEAD still uses `new Response(null)` (no body). |
| Extract `import.astro` inline script | **Done** — `scripts/import-page` + thin boot in `import.astro` |
| Migration boilerplate helper | **Done** — `scripts/lib/migration-helpers.mjs` |
| Split `src/lib/db.ts` | **Partial (2026-03-22)** — `src/lib/db/{client,event-row,organizations}.ts`; core `db.ts` ~617 lines + re-exports (~424 lines moved out). See [DB-MODULE-LAYOUT.md](DB-MODULE-LAYOUT.md). |
| Remove dead `db.ts` functions | **Open** — verify callers before deleting (org-scoping regressions are costly) |
| Invite staff modal dedup | **Done** — `InviteStaffModal.astro` + `scripts/invite-staff-modal.ts`; rendered from `DashboardHeader` when `isAdmin && organization` (fixes header Invite on all those pages) |
| Collapse middleware auth gates | **Open** — not re-audited in this pass |

### Medium / Opus micro (treat as backlog until reverified)

RSVP/Zod type overlap, Resend helper merge, `checkin.ts` duplicated “already checked in” response shape, `CheckInScanner` offline search dedup, `AdminDashboard` repeated `filter` counts → `useMemo`, etc.

### Recommended next steps (bloat reduction)

1. ~~**Finish `api-response` migration**~~ — done for the routes listed above (2026-03-22).
2. ~~**Shared Invite Staff UI**~~ — done: `InviteStaffModal.astro` + `invite-staff-modal.ts` (2026-03-22).
3. **Incremental `db.ts` split** — first slice (organizations/invitations) done; next: e.g. attendees or check-in when those files are in scope. [DB-MODULE-LAYOUT.md](DB-MODULE-LAYOUT.md).

---

## How to read confidence tiers

| Tier | Basis | ~Lines | Action |
|------|-------|--------|--------|
| **High** | All 3 models agreed | ~310 | Act immediately |
| **Medium** | 2 of 3 models agreed | ~80 | Verify, then act |
| **Opus-only structural** | Large / architectural finds | ~1,000+ | High payoff if verified |
| **Opus-only micro** | Single-line / marginal | ~50 | Deprioritize |
| **Kimi-only** | Mix of structural and micro | ~255 | Verify in next pass |

---

## High Confidence — All 3 Models Agreed

> Safe to act on immediately. Zero cross-contamination between models.

| Finding | Location | ~Lines | Risk | Action |
|---------|----------|--------|------|--------|
| `rate-limit-edge.ts` — zero imports anywhere in repo | `src/lib/` | 127 | Zero | **Delete** |
| Unused webhook Zod exports — `webhookEntrySchema`, `WebhookEntryData`, `validateWebhookEntry` never imported | `src/lib/validation.ts` | ~30 | Zero | Delete exports |
| `checkInAttendee` ≈ `checkInAttendeeById` — near-identical POST + 409 handling | `src/services/api.ts` | ~40→25 | Low | Extract private `postCheckIn()` |
| QR `toDataURL` sprawl — 4+ call sites with inconsistent options; webhook omits `color` from `QR_GENERATION` | Multiple files | ~40 | Low | Route all through `qr-client.ts` |
| `process.env / import.meta.env` fallback pattern repeated 6–10+ times | Multiple files | ~30 instances | Low | Create `src/lib/env.ts` |
| `tslib` direct dependency — `importHelpers` not enabled; only pulled in transitively | `package.json` | 1 dep | Zero | Remove from `dependencies` |
| `dotenv` in `dependencies` — only `scripts/*.mjs` use it | `package.json` | 1 dep | Zero | Move to `devDependencies` |
| `db.ts` monolith — 964 lines covering 6 domains | `src/lib/db.ts` | 964 | Medium | Split when next touching a domain |

---

## Medium Confidence — 2 of 3 Models Agreed

| Finding | Models | ~Lines | Action |
|---------|--------|--------|--------|
| `RSVPFormData` interface duplicates Zod-inferred type in `validation.ts` | Composer + Opus | ~9 | Import from `validation.ts`; delete interface |
| `getResend` and `getConfiguredEmailSender` both read same env key | Composer + Opus | ~10 | Merge into one function |
| `CheckInScanner` offline search filter-and-map duplicated at L278-313 and L319-341 | Opus + Kimi | ~20 | Extract `searchOfflineCache()` helper |
| `checkin.ts` "already checked in" response constructed twice (L62-79 and L100-108) | Opus + Kimi | ~15 | Extract `alreadyCheckedInResponse()` |
| `rowToOffline` lambda defined independently in two `db.ts` functions | Opus + Kimi | ~11 | Extract to module level |
| `OfflineCacheAttendee` type defined identically in both `offline.ts` and `db.ts` | Opus + Kimi | ~10 | Define once; import in both |
| UUID regex + `isValidUUID`/`validateUUID` defined independently in `offline.ts` and `qr.ts` | Opus + Kimi | ~5 | Consolidate in `qr.ts` |

---

## Opus 4.6 — Unique Findings (Blind)

> Opus had no access to other audits this round. These are genuine independent observations, not confirmation artifacts.

### Structural / high-value if verified

| Finding | Location | ~Lines | Notes |
|---------|----------|--------|-------|
| `AppShell.tsx` — entire component, never imported anywhere | `src/components/` | 161 | Zero-risk deletion if confirmed |
| `scroll-area.tsx` — never imported | `src/components/ui/` | 55 | Likely shadcn install artifact |
| `auth.d.ts` — `StaffRole`/`User` never imported; `env.d.ts` is canonical | `src/auth.d.ts` | 12 | Safe delete if confirmed |
| 8 additional dead `db.ts` functions — superseded by org-scoped variants (`getAllEvents`, `checkInAttendee`, `getAttendeesForOfflineCache`, `searchAttendees`, etc.) | `src/lib/db.ts` | ~150 | High value if verified; wrong fn could silently bypass org scoping |
| API `Response()` boilerplate — 3-line construction repeated ~80× across 19 routes | `src/pages/api/` | ~160 net | Add `json()`/`errorResponse()` in `src/lib/api-response.ts` |
| `appBaseUrl` fallback chain copy-pasted 4 times | Multiple routes | ~20 | Extract `getAppBaseUrl()` |
| **Demo check-in codes active in prod — no env gate** | `src/pages/api/checkin.ts` | ~43 | ⚠️ Security, not just bloat — gate behind `import.meta.env.PROD !== true` or move to `/api/demo-checkin` |
| Invite Staff modal duplicated across two admin pages (same markup, JS, fetch) | Admin pages | ~130 | Extract to shared `InviteStaffModal.astro` |
| `import.astro` 580-line inline script — no type checking; also contains duplicate CSV parser | `import.astro` | 580 inline | Extract to `.ts` file |
| Middleware auth gates — 3 overlapping mechanisms for same routes (per-path `if`, `isProtectedApi`, `isAuthenticatedRoute`) | `src/middleware.ts` | ~40 | Collapse to single "if not public → requireAuth" |

### Micro-optimizations

| Finding | Notes |
|---------|-------|
| `AdminDashboard.tsx` computes `attendees.filter(a => a.checkedIn).length` 5× per render | Wrap in `useMemo` |
| `CheckInScanner.tsx` enormous inline type union on `toCheckInResult` param (L39-42) | Import `OfflineCheckInResult` from `offline.ts` |
| `update-last-event.ts` manually reimplements `requireUserId()` instead of calling it | Inconsistent with every other route |
| `audit.ts` accepts `entryId` param but never includes it in output | Possible data loss bug — verify |
| `db.ts` `updateAttendeeQRToken` has unused `_eventId` parameter | Remove |
| `AdminPage.tsx` has a hand-drawn 16-line SVG QR icon while `lucide-react` is already imported | Replace with `<QrCode />` |
| `checkin.ts` has 3 near-identical demo code `if`-blocks | Collapse to lookup table |

---

## Kimi K2.5 — Unique Findings (Blind)

| Finding | Location | ~Lines | Notes |
|---------|----------|--------|-------|
| Migration script boilerplate — same 15-line neon/dotenv setup in 6 scripts | `scripts/*.mjs` | ~75 | Extract `scripts/lib/migration-helpers.mjs` |
| Verbose `Response()` construction in `checkin.ts` — same pattern ~20 times in one file | `src/pages/api/checkin.ts` | ~60 | Overlaps Opus API boilerplate finding; address together |
| Comment bloat — 100+ lines narrating self-documenting code across multiple files | Multiple | ~100 | Delete obvious; keep rationale comments (scanner distance, error correction) |
| Micro utility files — `utils.ts` (7 lines), `formatters.ts` (11 lines) | `src/lib/` | ~20 | Merge into `src/lib/helpers.ts` |

---

## Intentionally Not Flagged — Justified Complexity

All three models independently agreed these are not bloat. Do not re-flag without new evidence.

| File / Pattern | Reason |
|----------------|--------|
| `src/lib/offline.ts` | Complex but necessary for offline-first architecture |
| `src/lib/audit.ts` | Small, clear single responsibility (aside from the `entryId` bug Opus flagged) |
| `src/lib/validation.ts` (active schemas) | Zod schemas are verbose but explicit; all active callers |
| `src/pages/api/attendees/import.ts` | 652 lines — CSV import is genuinely complex |
| shadcn/ui primitives (`button`, `card`, `dialog`, etc.) | Standard pattern overhead; trimming hurts consistency |
| `fuse.js` | Legitimately used for fuzzy attendee search in two components |
| `demo-codes.astro` | Small, staff-facing utility — not the same as the prod API gate risk |
| `src/lib/feedback.ts` | Clear single responsibility (haptics/sounds) |

---

## Recommended Action Order

### Phase 1 — Pure deletions (zero behavior change)

Run `npm run build` after each.

1. Delete `src/lib/rate-limit-edge.ts`
2. Remove dead Zod exports from `validation.ts` (`webhookEntrySchema`, `WebhookEntryData`, `validateWebhookEntry`)
3. Remove `tslib` from `package.json` `dependencies`
4. Move `dotenv` to `devDependencies`
5. Verify and delete `AppShell.tsx` + `scroll-area.tsx` + `auth.d.ts` (grep for imports first)

### Phase 2 — Deduplication (low risk; test after each)

Run `npm run test:edge-cases:ci` after this phase.

6. Extract private `postCheckIn(body)` in `src/services/api.ts`
7. Route all QR generation through `qr-client.ts`; align `QR_GENERATION` options at all call sites
8. Create `src/lib/env.ts` for `process.env`/`import.meta.env` fallback
9. Extract `rowToOffline` and `OfflineCacheAttendee` to a single source
10. Consolidate UUID validation (`offline.ts` + `qr.ts`)
11. ⚠️ **Gate demo check-in codes behind `!import.meta.env.PROD`** (security — don't defer)

### Phase 3 — Structural (verify scope first)

Smoke-test RSVP flow + scanner + admin table after this phase.

12. Verify and remove 8 additional dead `db.ts` functions (confirm no hidden callers first)
13. Add `json()`/`errorResponse()` helper in `src/lib/api-response.ts`; replace 80 call sites
14. Extract `import.astro` 580-line inline script to typed `.ts` file
15. Extract migration boilerplate to `scripts/lib/migration-helpers.mjs`
16. Split `db.ts` into domain modules (`events.ts`, `attendees.ts`, `organizations.ts`, `invitations.ts`) — do opportunistically as you touch each domain, not all at once

---

## Relationship to Original Summary

The original `bloat_audit_summary.docx` documented a sequentially-biased run (each model saw prior audits). Items that appear in **both** that document and this one at high confidence are true positives. Items present only in the original should be treated as likely bias artifacts. Items appearing only in this blind run are newly discovered.
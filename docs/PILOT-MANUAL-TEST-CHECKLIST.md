# Pilot run — manual test checklist

**Purpose:** Comprehensive **manual** tests to complete before a real-world pilot (live event or customer trial). Run these in an environment that matches production as closely as possible (ideally **staging** with production-like env vars, or production with a **dedicated test event** and a tiny guest list).

**Related:** Automated API checks: [`qr-edge-cases.md`](qr-edge-cases.md) (`npm run test:edge-cases`). Email sender: [`EMAIL-SENDER-GO-LIVE-CHECKLIST.md`](EMAIL-SENDER-GO-LIVE-CHECKLIST.md). Deploy: [`VERCEL-DEPLOYMENT.md`](VERCEL-DEPLOYMENT.md). **Process:** Keep this doc aligned with roadmap work per [`TESTING-AND-QUALITY-WORKFLOW.md`](TESTING-AND-QUALITY-WORKFLOW.md); record verification in [`TEST-RESULTS-LOG.md`](TEST-RESULTS-LOG.md).

**How to use:** Check boxes as you go. Capture **pass/fail**, **device/browser**, and **notes** (especially for failures). Block the pilot until **Critical** items are green or explicitly accepted.

---

## Before you start

- [ ] **Environment identified** — Staging URL or production; same Vercel project and env vars you will use for the pilot.
- [ ] **Database** — Migrations applied; no pending one-off scripts required for pilot features.
- [ ] **Clerk** — Production Clerk app (or staging) matches deploy; sign-in methods you need are enabled (e.g. Google).
- [ ] **Resend** — Sending domain verified if pilot sends real email; `FROM_EMAIL` / `FROM_NAME` set. See [EMAIL-SENDER-GO-LIVE-CHECKLIST.md](EMAIL-SENDER-GO-LIVE-CHECKLIST.md).
- [ ] **Test accounts** — At least: one **organizer**, one **staff** scanner account (can be same org), optional second staff for multi-device tests.
- [ ] **Hardware** — At least two smartphones (scanner + attendee QR); charger available for long session test.
- [ ] **No test bypass in prod** — `BYPASS_AUTH_FOR_TESTS` **not** set in production; pilot checklist assumes real auth.

---

## 1. Organization & access

- [ ] Organizer can sign in and reach **Event Workspace** (`/admin`).
- [ ] Organizer can create or select **organization** context (onboarding complete if required).
- [ ] **Staff invitation** — Invite a second user; invite email received; invitee can accept and see assigned org/events (or expected role behavior).
- [ ] **Scanner-only path** — Staff can open **`/scanner`** (or embedded scanner from admin) without breaking when org has events.
- [ ] **Unauthorized access** — Unauthenticated user hitting protected routes is redirected to sign-in (spot-check).

---

## 2. Events

- [ ] Create a **new event** (name, dates as applicable).
- [ ] **Event selector** — Switching events updates guest list / stats for the correct event.
- [ ] **Persistent selection** — Log out and back in; last selected event restores where implemented (staff preferences).
- [ ] **URL deep link** — Opening `/scanner?event=<id>` (if used) selects the correct event.

---

## 3. Guest list — CSV import

- [ ] Import a **small valid CSV** (see `test-csvs/` from `npm run test:generate-csvs` or minimal file) — all rows appear.
- [ ] **Required columns** — Import rejects or warns when `email` / name rules are not met (per current product behavior).
- [ ] **Duplicate handling** — Re-import or duplicate emails within file behave as expected (skipped/merged per mode).
- [ ] **Import modes** — If using add/merge/replace, spot-check one mode matches expectation for a second import.
- [ ] **Large file sanity** — Optional: import a larger CSV (hundreds of rows) if pilot expects it; UI remains usable.

---

## 4. Guest list — Eventbrite (if pilot uses it)

- [ ] Integration credentials configured per [EVENTBRITE-INTEGRATION.md](EVENTBRITE-INTEGRATION.md).
- [ ] **Pull sync** — Attendees appear in AizuPass for the mapped event.
- [ ] **Idempotency** — Second sync does not duplicate rows or corrupts data (spot-check counts).

---

## 5. Email & QR delivery

- [ ] Send **single attendee email** (or bulk) — email arrives; **from** address matches production sender.
- [ ] **QR in email** — QR displays; scans successfully on scanner flow below.
- [ ] **Bulk send** — Small bulk send completes; partial failure reporting acceptable; no wrong-event content in body.

---

## 6. Scanner — core flows (Critical)

- [ ] **Happy path** — Scan valid QR → **success** (green), attendee shows checked in in admin.
- [ ] **Double scan** — Scan same QR again → **already checked in** (yellow/amber), not a red error; messaging clear.
- [ ] **Wrong event / invalid token** — Invalid or tampered payload → red / invalid handling; staff not stuck (can scan again).
- [ ] **Manual check-in by name** — Search finds attendee; check-in succeeds; list updates.
- [ ] **Manual + duplicate** — Manual check-in for already-checked-in attendee → expected warning/idempotent behavior.

---

## 7. Scanner — door-operations & resilience

- [ ] **Immediate feedback** — After a successful decode, UI shows processing quickly (no multi-second dead air before “processing” on a good network).
- [ ] **Duplicate decode suppression** — Rapid re-reads of the same QR do not produce duplicate submissions (single logical check-in).
- [ ] **Consecutive invalid** — Two invalid scans in a row → **amber helper banner** appears (torch / brightness / name search).
- [ ] **Torch** — If device supports torch: toggle works; turning **torch on** clears the helper banner when shown.
- [ ] **Distance / glare copy** — On-screen guidance is consistent (e.g. distance **6–10 inches**, brightness, glare).
- [ ] **Audio / haptic** — Success vs already-checked-in vs error feel distinct (spot-check in noisy environment if possible).

---

## 8. Offline & sync (Critical)

- [ ] **Offline queue** — Airplane mode on staff device; scan valid QR → queued success path; queue count visible if applicable.
- [ ] **Reconnect** — Turn network on; queue **syncs**; attendee checked in in admin; toast or feedback confirms sync.
- [ ] **409 on replay** — Already-synced queue item does not error-loop (idempotent success).

---

## 9. Session & auth (scanner)

- [ ] **Long session** — Scanner open **30–60+ minutes** idle then scan — still works or clear **session banner** with link to sign-in (no silent failure).
- [ ] **Tab background / resume** — Switch away from the scanner tab (or lock phone) for several minutes, return — session should re-check (no silent dead scanner); if banner shows, **Refresh session** works or **Sign in** is clearly required.
- [ ] **Refresh session control** — With banner visible (or after forcing an auth edge case in staging), **Refresh session** runs without crashing; success clears banner or failure shows a toast + keeps **Sign in** / **Continue setup** usable.
- [ ] **401 path** — After session invalidation (or test in staging), scanner shows sign-in prompt / banner; after re-auth, scanning works.
- [ ] **403 / onboarding** — User missing profile completion sees actionable message (if applicable to your Clerk setup).

---

## 10. Admin workspace

- [ ] **Stats / counts** — Checked-in counts match spot-checks after several scans.
- [ ] **Export** — CSV or available export downloads; columns usable for ops.
- [ ] **Bulk QR ZIP** — Select several attendees → **QR ZIP** — ZIP downloads; PNGs open; filenames are readable and unique (name + id slug). Organizer account only.
- [ ] **Bulk actions** — If pilot uses bulk delete/export, run on test rows only; verify behavior.

---

## 11. Device & browser matrix

Complete at least one row for **pilot primary device**:

| Device        | Browser / context | Scanner | Offline | Notes |
|---------------|-------------------|---------|---------|-------|
| iPhone Safari |                   | [ ]     | [ ]     |       |
| Android Chrome |                 | [ ]     | [ ]     |       |
| Optional: second device |        | [ ]     | [ ]     |       |

- [ ] **Standalone scanner page** — Full-page `/scanner` (if used on phones) layout acceptable; no clipped buttons.
- [ ] **Embedded scanner** — Admin embed path works if pilot uses it.

---

## 12. Production safety & compliance

- [ ] **Demo codes** — `DEMO-*` codes **do not** work in production (`import.meta.env.PROD`); verify only in dev/staging if needed.
- [ ] **Rate limits** — Rapid repeated API actions do not take down UX (optional spot-check; expect 429 where implemented).
- [ ] **PII handling** — QR payload contains **no email** in barcode (token/id only); confirm with one sample decode if unsure.

---

## 13. Sign-off

| Role        | Name | Date | Approved (Y/N) |
|-------------|------|------|------------------|
| Organizer   |      |      |                  |
| Tech lead   |      |      |                  |

**Pilot go / no-go criteria (suggested):** All **Critical** sections (6, 8) pass; no open **Critical** blockers in [qr-edge-cases Production Blockers](qr-edge-cases.md#production-blockers-checklist); email sender verified if sending to real guests.

---

## Revision history

| Date       | Change |
|------------|--------|
| 2026-04-04 | Initial checklist: pilot manual tests consolidated (scanner door-ops, offline, admin, devices). |

# Event-day stress & hardening (reference)

**Purpose:** Capture the “bad venue WiFi / many devices / big guestlist” lens (common in live-event ops writeups) and turn it into a **prioritized, verify-first plan**. This doc does **not** replace implementation detail in code; it records what is already solid, what to **test before doors**, and what to build **only when scale or ticketing demands it**.

**Related:** [MASTER-PLAN.md](MASTER-PLAN.md) (checklist), [TICKETING-TYPES-PRICING-STRATEGY.md](TICKETING-TYPES-PRICING-STRATEGY.md) (future Stripe path), [STAFF-GUIDE.md](STAFF-GUIDE.md) (operator-facing).

---

## 1. What is already the right shape (do not “fix”)

These behaviors are intentional and match real door operations. Treat regressions here as bugs; avoid redesigning without a measured problem.

| Area | What you have | Where |
|------|----------------|-------|
| Offline check-in | Guest list in IndexedDB; scans queue when offline; sync when online | `src/lib/offline.ts`, `CheckInScanner.tsx` |
| Idempotent replay | 409 (already checked in) treated as success on replay | `api/checkin`, offline sync path |
| Sync resilience | Retry/backoff, queue dedupe, visible queued count | `src/lib/offline.ts`, scanner UI |
| Critical path deps | Scan path: camera → decode → local cache/queue → optional HTTP; **no** Clerk/Resend on the scan line | Scanner + offline modules |
| Rate limiting | Exists for several public/admin surfaces | `src/lib/rate-limit.ts` |

**Principle:** Purchase/auth/email can degrade; **admission** must not depend on perfect WiFi. That split is already reflected in the architecture.

---

## 2. Real risks (ranked)

| Risk | Severity | Why |
|------|----------|-----|
| **Many devices downloading full offline cache at once** on weak WiFi | Medium | `GET /api/attendees/offline-cache` returns the full guest list payload for staff; concurrent cold opens amplify venue bandwidth and your server/DB load. |
| **Large guestlists** | Medium–Low | IndexedDB and single JSON response size; memory and download time scale with attendee count. |
| **Ticketing + checkout spikes** (when/if Stripe exists) | Medium (future) | Stripe is robust; **your** API + Neon pool + webhook handlers are the usual ceiling. |
| **Third-party outages** (Clerk, Resend) | Low for doors | Clerk: existing sessions; Resend: not on scan path. Still matters for **new** staff login and email. |

---

## 3. Verify before production events (no code required)

Run these as **manual or scripted checks**; record results for the specific venue size you care about.

| Scenario | What to observe | Pass criteria |
|----------|-----------------|---------------|
| **Airplane mode** | Open scanner with event selected, no network | Empty or stale cache: UI still usable; check-ins queue; no crash loop. |
| **Offline → online** | Queue check-ins, reconnect | Sync drains queue; 409 replays OK; toast/count accurate. |
| **Two scanners, one guest** | Same QR nearly simultaneously | One success, one 409/yellow path; no duplicate check-in in DB. |
| **Background tab / sleep** | Scan, lock device, resume | IndexedDB data still present; queue not silently lost (spot-check count). |
| **Large list smoke** | Import or seed N attendees (N = your expected max × 1.2) | Offline cache download completes on **one** device on **3G throttled** DevTools network within an acceptable time budget you define (e.g. under 60s for N). |
| **Concurrent cache fetch** (optional k6/locust) | Many parallel `GET /api/attendees/offline-cache` with valid staff session | No mass 5xx; p95 latency and Neon pool within limits; adjust VUs until you find knee. |

If a check fails, **fix that class of bug first** before adding new features (e.g. delta sync).

---

## 4. Hardening backlog (build only when verification says so)

### Tier A — High value, low scope (operational)

| Item | Problem it solves | Suggested shape | Build when |
|------|-------------------|-----------------|------------|
| **Explicit “Download / refresh guest list”** | Staff coordinate cache warm-up **before** doors instead of N implicit refreshes | Admin (or scanner) control: button + last-downloaded timestamp + row count; optional “downloading…” state | First event with **many staff devices** or flaky preload |
| **“Force sync now”** | Operator wants retry without toggling airplane mode | Reuse existing `syncQueue` from a visible button when online | Sync failures are frequent enough that staff ask for it |
| **Clearer cache state in UI** | “Do I have data?” vs “am I offline?” | Already partial (offline banner, queue count); extend with **last cache time** + **attendee count** from cached payload | Confusion at rehearsal |

### Tier B — Medium scope (scale)

| Item | Problem it solves | Suggested shape | Build when |
|------|-------------------|-----------------|------------|
| **Delta / incremental offline cache** | Full JSON too large or too slow | `If-None-Match` / `since=cachedAt` / per-event version bump; server returns patch or full | Verified payload size or p95 download time exceeds budget |
| **Pagination or compressed cache** | Single response dominates | Chunked download or gzip-friendly shape (measure first) | Tier A insufficient |
| **IndexedDB quota edge cases** | Very large events | Detect quota errors; surface “cache incomplete” + admin guidance | Hitting browser limits in testing |
| **Emergency export** | Long outage; manual reconciliation | Export queued check-ins as CSV from admin or hidden support flow | Ops ask for it or compliance needs it |

### Tier C — Ticketing era (not applicable until Stripe)

| Item | Notes |
|------|--------|
| Checkout session creation | Prefer async fulfillment; avoid long transactions in request path |
| Webhook idempotency | Already a pattern elsewhere; must be strict for payment |
| DB pool / timeouts | Neon serverless + connection limits; monitor under load |
| Rate limits | Extend deliberately; don’t starve legitimate bursts |

Align implementation with [TICKETING-TYPES-PRICING-STRATEGY.md](TICKETING-TYPES-PRICING-STRATEGY.md) when that work starts.

---

## 5. Out of scope / deprioritized without new requirements

- **Embedding full verification in QR alone** — Conflicts with token/server validation model; only revisit with a dedicated crypto/signing design (see [STEP-1-QR-SECURITY-PLAN.md](STEP-1-QR-SECURITY-PLAN.md)).
- **Replacing html5-qrcode** — Local library; revisit only on device-specific failure reports.
- **Green/yellow/red for sync** — You already have traffic-light **check-in outcomes** and offline/queue messaging; avoid duplicate metaphors unless UX research says operators confuse them.

---

## 6. Quick reference — bottleneck endpoint

- **Offline cache:** `GET /api/attendees/offline-cache?eventId=…` — staff-only; returns `cachedAt`, `events`, `attendees` (includes `qr_token`). Implementation: `src/pages/api/attendees/offline-cache.ts`.
- **Scanner cache load:** On `activeEventId` availability and on browser `online`, `CheckInScanner` calls `apiService.getOfflineCache` and writes via `setCachedData` (`src/components/CheckInScanner.tsx`).

---

## 7. Maintenance

After each major event or load test, add a short note (date, guest count, device count, outcome) in your runbook or a subsection below.

### Test log (append)

| Date | Event scale | Notes |
|------|-------------|-------|
| _—_ | _—_ | _—_ |

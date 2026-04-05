# Testing & quality workflow

**Purpose:** Keep **code quality and integrity** consistent as the roadmap evolves: every meaningful change ships with **edge-case thinking**, **automated verification** where practical, **documented outcomes**, and **up-to-date manual requirements**—without ad-hoc process drift.

**Audience:** Humans and agents implementing or reviewing work tied to [MASTER-PLAN.md](MASTER-PLAN.md).

---

## 1. Where artifacts live (single map)

| Artifact | Role |
|----------|------|
| [MASTER-PLAN.md](MASTER-PLAN.md) | Roadmap + concern audit; checkbox + Done notes when work completes. |
| [qr-edge-cases.md](qr-edge-cases.md) | API/automation-oriented cases, scripts, CSV fixtures, **critical manual paths** (short). |
| [PILOT-MANUAL-TEST-CHECKLIST.md](PILOT-MANUAL-TEST-CHECKLIST.md) | Full **pre-pilot** manual matrix (devices, offline, session, sign-off). |
| [TEST-RESULTS-LOG.md](TEST-RESULTS-LOG.md) | Append-only **record of what ran and what passed** (dates, scope, links). |
| `scripts/test-edge-cases.mjs`, `scripts/ci-test-edge-cases.mjs` | Automated API edge-case runners. |
| `.github/workflows/ci.yml` | CI: `tsc`, `build`; on `main`, DB-backed `test:edge-cases:ci` when configured. |

Add a **feature-specific doc** (e.g. `EVENTBRITE-INTEGRATION.md`) only when a domain needs long-form protocol; still link it from the master plan or qr-edge-cases when relevant.

---

## 2. When you complete a roadmap item (required habit)

Do **all** applicable steps in the same PR or immediately after merge—**not** “later.”

1. **Master plan** — Update [MASTER-PLAN.md](MASTER-PLAN.md): `[x]`, short Done note (files/PR), **Last updated** date.
2. **Edge cases** — Add or update rows/sections in [qr-edge-cases.md](qr-edge-cases.md): new scenarios (creative but relevant), expected outcomes, and whether they are **automated** or **manual-only**.
3. **Automated tests** — Extend `scripts/test-edge-cases.mjs` (or unit tests if introduced) when the behavior is API-stable and testable; ensure **`pnpm exec tsc --noEmit`** and **`pnpm build`** pass locally.
4. **Manual requirements** — Update [PILOT-MANUAL-TEST-CHECKLIST.md](PILOT-MANUAL-TEST-CHECKLIST.md) when pilot-facing behavior changes (new flows, new failure modes, new devices concerns). Keep [PILOT-MANUAL-TEST-CHECKLIST.md](PILOT-MANUAL-TEST-CHECKLIST.md) aligned with reality—remove or reword obsolete bullets.
5. **Results** — Append a row to [TEST-RESULTS-LOG.md](TEST-RESULTS-LOG.md) for the merged work with **proof of work** and **proof of passing** (see §2.1). Include PR or merge commit link.

### 2.1 Proof of work and proof of passing (required)

Every logged verification must make it **possible for a reviewer to see that tests were actually run and what the outcome was**—not just “tests passed.”

**Automated (local or CI)**

- **Proof of work:** Which commands ran (`pnpm exec tsc --noEmit`, `pnpm build`, `pnpm run test:edge-cases`, etc.).
- **Proof of passing:** Evidence of success, e.g.:
  - **CI:** Link to the **green** GitHub Actions run for the relevant commit or PR (workflow name + run URL).
  - **Local / agent:** Final lines of output showing success, or explicit `exit code 0`, pasted into the PR description and/or the log row.
- **Failure:** If something failed and was fixed, log the failing output or run link once, then the passing run after the fix.

**Manual (pilot checklist, device flows, email in inbox)**

- **Proof of work:** Which checklist **sections or step numbers** were executed (e.g. `PILOT §6–8`, `qr-edge-cases Path 6`).
- **Proof of passing:** Short attestation: **date**, **tester initials or name**, **device/browser** (e.g. `iOS 18 Safari`, `Pixel 8 Chrome`). Optional: link to screenshot or issue comment; store artifacts under `docs/test-results/` only if the team wants a durable attachment (name files `YYYY-MM-short-scope.ext`).

**Not acceptable:** Log rows that only say “tested” or “OK” with no command, link, section ID, or identifiable run.

**PR discipline:** For non-trivial changes, the PR description should include the same proof (commands + outcome or CI link) so the log row can point to the PR as the primary artifact.

---

## 3. Edge-case brainstorming (stay creative, stay bounded)

Use categories so coverage stays **organized** and **thorough** without random one-offs:

| Lens | Examples |
|------|----------|
| **Auth / identity** | Session expiry, wrong org, missing profile, token reuse. |
| **Concurrency** | Two staff, same attendee; offline queue replay; duplicate POSTs. |
| **Malformed input** | Bad QR shape, CSV injection, oversized fields, wrong `eventId`. |
| **Degraded environment** | Offline, slow network, permission denied (camera), airplane mode mid-sync. |
| **Idempotency** | 409 already checked-in, queue replay, import twice. |
| **Product rules** | Event scope, rate limits, demo codes in non-prod only. |

If a case is **manual-only** (camera UX, haptics), document it explicitly—do not pretend it is automated.

---

## 4. Automated vs manual (clear split)

- **Automated (CI or local scripts):** HTTP APIs, deterministic DB outcomes, parsers, pure logic.
- **Manual:** Camera, torch, audio, multi-device layouts, long-session feel, Resend inbox rendering on real mail clients.

CI today: see `.github/workflows/ci.yml` (typecheck + build; optional `test-edge-cases:ci` on `main` with `DATABASE_URL`).

---

## 5. Consistency over time

- **One log:** [TEST-RESULTS-LOG.md](TEST-RESULTS-LOG.md) is the project’s running proof of verification—short rows, links out, **proof columns filled** (§2.1).
- **No orphan features:** If it is in the master plan as Done, it should be **represented** in qr-edge-cases and/or pilot manual doc, unless explicitly marked “N/A” with a one-line reason in the Done note.
- **PR discipline:** PR description should list **tests run** with **proof of passing** (§2.1); the log row can reference the PR as the canonical paste target for long output.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-04-04 | §2.1 Proof of work / proof of passing; PR + log requirements for verifiable outcomes. |
| 2026-04-04 | Initial workflow: artifact map, completion habit, edge-case lenses, automated/manual split, link to TEST-RESULTS-LOG. |

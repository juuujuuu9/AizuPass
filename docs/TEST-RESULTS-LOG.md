# Test results log

**Purpose:** Append-only record of **what was verified**, **when**, and **verifiable proof** that work ran and passed (or failed-then-fixed). See [TESTING-AND-QUALITY-WORKFLOW.md §2.1](TESTING-AND-QUALITY-WORKFLOW.md#21-proof-of-work-and-proof-of-passing-required).

**How to use:** Add a **new row** (newest at the top) whenever you merge meaningful work: roadmap item, release candidate, or pilot prep. **Do not** leave proof columns empty for automated work—use a CI run URL, or paste command + success line, or point to a PR that contains that proof.

---

## Log

*Newest entries first.*

| Date (UTC) | Scope | Commands / coverage | Automated proof (pass) | Manual proof (pass) | PR / ref | Notes |
|------------|-------|---------------------|-------------------------|---------------------|----------|-------|
| 2026-04-04 | Bulk QR ZIP (§11 QR delivery) | `pnpm exec tsc --noEmit`; `pnpm build`; `qr-export-payloads`, `getQRPayloadForExport`, `AdminDashboard` | Local: tsc + build exit 0 (`Complete!`, agent run 2026-04-04) | PILOT §10 — pending: select rows → **QR ZIP** download | — | `jszip`; non-rotating export when token valid; max 500; organizer-only. |
| 2026-04-04 | Scanner session ergonomics (§11 roles + session) | `pnpm exec tsc --noEmit`; `pnpm build`; `CheckInScanner` + `useAuth` + `getToken` | Local: tsc exit 0; build `Complete` (agent run 2026-04-04) | PILOT §9 manual — pending human: tab resume + Refresh session | — | Clerk token refresh before probe; focus/online/5 min interval; banner **Refresh session**. |
| 2026-04-04 | Testing & quality workflow | `pnpm exec tsc --noEmit`; `pnpm build` | Local: both exit 0; build ended with `Server built` / `Complete` (see agent run 2026-04-04) | N/A — docs-only | — | Introduced workflow + log + rules; prior build proof from implementation session. |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-04-04 | Table columns: Commands/coverage + automated proof + manual proof (see workflow §2.1). |
| 2026-04-04 | Initial log + first entry (workflow bootstrap). |

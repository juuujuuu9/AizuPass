# Audit template prompt

Use this prompt in a fresh chat (or with another model) when you want a **full integrity audit** report structured like [`AUDIT-2026-03-21.md`](AUDIT-2026-03-21.md).

**Optional first line** (stack context for this repo):

```text
Assume AizuPass: Astro + React + Neon Postgres + Clerk + Vercel; prioritize serverless cold starts, multi-tenant org/event scoping, and API route security.
```

---

## Prompt (copy everything below the line)

---

You are a senior security and reliability auditor. Perform a full integrity audit of this codebase (read the repo: app structure, API routes, middleware, auth, DB layer, client components that touch secrets or PII, config, and deployment-related files).

Deliver a single markdown audit report with this structure:

1. **Title & metadata** — Date, scope (security, reliability, scalability, architecture, bloat), stack summary, approximate file count / areas covered.

2. **Remediation log** — Table: finding ID → short resolution note for anything already fixed or partially fixed during/after a prior pass (if unknown, omit).

3. **Findings summary** — Table: Severity (CRITICAL / HIGH / MEDIUM / LOW) with counts and one-line description of each tier.

4. **Detailed findings** — For each finding:
   - ID (e.g. CR-1, HI-1, ME-1, LO-1)
   - Title
   - **Location** (file paths + line refs where possible)
   - **Confidence** (High / Medium / Low)
   - Short explanation of risk or impact
   - **Fix** — concrete, actionable remediation (not vague “review security”)
   - Code snippet only when it clarifies the issue

5. **Positive patterns** — Bulleted list of what the codebase does well (defense in depth, consistent patterns, good primitives).

6. **Recommended action plan** — Phased (e.g. Week 1 critical, Month 1 reliability, Quarter architecture) with rough effort estimates.

**Audit lenses (must cover all that apply):**

- Authentication / authorization / session handling / IDOR and object-level scoping
- CSRF, SSRF, open redirects, injection (SQL, XSS, HTML in email, CSV)
- Secrets, env handling, debug/demo paths in production
- Rate limiting, abuse, pagination, unbounded queries
- Data integrity (transactions, races, idempotency) — call out driver/DB limitations explicitly
- Logging / audit trails — completeness and PII
- Dependencies and supply chain (only if you can infer from manifests)
- Operational: health checks, error handling, observability leaks (e.g. NODE_ENV in responses)
- Frontend: accessibility gaps, unsafe patterns, hydration, client-only assumptions
- Docs / dead code / duplication

**Output constraints:**

- Prefer precision over volume; group duplicate issues.
- Use severity consistently: CRITICAL = exploit or data loss imminent; HIGH = likely bug or serious weakness; MEDIUM = quality or moderate risk; LOW = cleanup and best practice.
- End the doc with a one-line footer noting the audit date.

Do not implement fixes unless asked; focus on the report.

---

## After the run

- Save the output under `docs/audit/` with a dated filename, e.g. `AUDIT-YYYY-MM-DD.md`.
- When remediation is done, add rows to the **Remediation log** in that file or in a follow-up note.

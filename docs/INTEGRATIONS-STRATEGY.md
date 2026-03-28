# Integrations strategy

**Audience:** Product, engineering, and support.  
**Scope:** How external tools (forms, ticketing, automation) feed the **guestlist** in this hub (QR Check-In).

**Related:** [MASTER-PLAN.md](MASTER-PLAN.md) (roadmap + checklist), [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md) (architecture, CSV import).

---

## Principles

1. **CSV is the default path for typical organizers** — No API keys, works with any export or spreadsheet, lowest friction for “average user” workflows. Admin → event → Import CSV remains the primary mental model in product copy and onboarding.

2. **HTTP API and automation platforms are equal-weight** for teams that automate — Many small–medium orgs are **low-code/no-code (LC/NC) reliant**: Zapier, Make, n8n, etc. Those paths should be treated as **first-class**, not as a thin wrapper around “real” API work. Raw API matters for custom backends; Zapier/Make matter for ops and agencies without dedicated backend time.

3. **Developers and ops are the main integrators** — Position docs, errors, and support around **server-side webhooks**, **stable idempotency keys**, and **Zapier/Make recipes** rather than enterprise OAuth unless demand appears.

---

## Current building blocks (implemented)

| Path | Role | Notes |
|------|------|--------|
| **CSV import** | Primary for most users | Dedupe by event + email; import modes and column mapping; see STEP-2 and admin UI. |
| **Eventbrite (organizer)** | Pull guestlist into an event | Admin → **Integrations** (`/admin/events/integrations`): Eventbrite event ID + [private token](https://www.eventbrite.com/platform/docs/authentication); `POST /api/integrations/eventbrite/sync`; idempotency via `microsite_entry_id` prefix `eb:{attendeeId}`; optional “save credentials” stores token in `events.settings.eventbrite` (stripped from all `rowToEvent` responses). **Details, testing protocol, edge cases:** [EVENTBRITE-INTEGRATION.md](EVENTBRITE-INTEGRATION.md). |

---

## Target experience (product)

- **Organizer (non-technical):** Land on “import your list” → CSV. Clear column help and failure exports (already aligned with CSV hardening in the master plan).

- **Builder (developer):** OpenAPI-oriented or clearly documented JSON contract; `curl` examples; idempotency and error codes suitable for retries.

- **Operator (LC/NC):** Zapier or Make **actions** that map trigger fields → hub guestlist fields, with test-step behavior that does not create duplicate guests on retry. Same capabilities as the API where feasible (create/update attendee, optional QR flags).

---

## Security (guardrails)

- **Secrets:** Prefer **scoped keys** (per event or per org) over a single global key as usage scales; rotate without downtime where possible.
- **Never expose keys to the browser** — Webhook calls stay server-side or inside Zapier’s secure connector.
- **Rate limits** — Apply per-key or per-integration limits in addition to IP-based limits as needed.
- **Logging** — Do not log full bearer tokens or full PII; align with GDPR and customer expectations.

---

## Scalability and semantics

- **Retries** — External systems (including Zapier) retry; **idempotency** (`micrositeEntryId` or equivalent) must be documented as mandatory for stable integrations.
- **Bursts** — Ticketing on-sales can spike traffic; monitor DB and email side effects on bulk operations. Queue or backoff strategies belong on the roadmap if real pain appears.
- **Business semantics** — “Order paid” ≠ one row; refunds and multi-ticket orders need explicit product rules or documented limitations (append-only guestlist vs sync).

---

## Pitfalls to flag in support/docs

- Duplicate Zap runs / duplicate API calls → same guest twice vs idempotent update — **always** set stable external IDs when possible.
- Mapping mistakes (wrong email column) → wrong guestlist — test with a single row first.
- Third-party ToS and data flow — customer remains controller; document subprocessors if needed.

---

## Roadmap pointer

Tracked items (e.g. first-class Zapier/Make connector) live in [MASTER-PLAN.md](MASTER-PLAN.md). Update this strategy when the integration surface changes materially.

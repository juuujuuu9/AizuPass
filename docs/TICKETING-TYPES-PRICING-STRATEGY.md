# Ticket types & pricing — implementation strategy

**Purpose:** Future reference for paid ticketing: data model, Stripe alignment, and how it fits the existing hub (RSVP, CSV import, webhooks, QR email). Not an implementation spec; update this doc when decisions change.

**Master plan:** [MASTER-PLAN.md](MASTER-PLAN.md)

**Context in this codebase**

- **Tenancy:** `organizations` → `events` (`organization_id`) → `attendees` (`event_id`). See `src/lib/db.ts`, org flows in [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md).
- **Attendee entry paths today:** public `POST /api/attendees` (RSVP), CSV import, `POST /api/ingest/entry` with idempotency on `(event_id, microsite_entry_id)`. See [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md).
- **Uniqueness:** Per-event email uniqueness (`UNIQUE(event_id, email)`) for RSVP-style registration.
- **QR:** Payload `eventId:entryId:token`; generation and email reuse after attendee exists.
- **SaaS vs ticket charges:** `/admin/organization/billing` is the natural home for **your product’s** subscription (organizers pay you). **Per-event ticket sales** are a separate Stripe surface (Connect or simple charges + metadata); do not conflate the two in one webhook handler without explicit routing.

---

## 1. Two conceptual layers

| Layer | Question it answers |
|-------|---------------------|
| **Catalog** | What is sold? Name, price, currency, caps, visibility, sale window. |
| **Fulfillment** | Who bought it? Links person + event + catalog row to money and Stripe ids for support and reconciliation. |

Separating these avoids rework when you add upgrades, transfers, partial refunds, or multi-item carts.

---

## 2. Suggested schema (minimal first ship)

### `event_ticket_types` (or `ticket_types`)

Child of `events` (not organizations): pricing is event-specific.

- `id`, `event_id`, `name`, optional `slug` (for checkout URLs)
- `description` (optional)
- `price_cents` — use `0` for free tiers / comp types
- `currency` — often org or platform default; multi-currency events need a clear rule
- `quantity_total` — nullable = unlimited
- `sort_order`, `is_active`
- Optional: `sales_opens_at`, `sales_closes_at`
- Optional later: `stripe_price_id` when catalog is mirrored in Stripe for coupons and reporting

### Fulfillment: columns vs table

**Option A — columns on `attendees`**

Add nullable fields such as: `ticket_type_id`, `amount_paid_cents`, `currency`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`.

- **Best when:** one registration row per checkout (one ticket per person per payment).

**Option B — `purchases` / `payments` table**

Rows: `attendee_id`, `ticket_type_id`, amounts, Stripe ids, `status` (`pending` / `paid` / `refunded`).

- **Best when:** one checkout creates **multiple** attendees (family pack, cart) or you sell add-ons.

**Fork to decide early:** one-ticket-per-checkout (A is enough) vs cart / multiple attendees per payment (prefer B).

### Idempotency

Mirror webhook discipline used for microsite entries: enforce uniqueness on `stripe_checkout_session_id` or `payment_intent` so Stripe retries never double-create attendees.

---

## 3. Pricing representation

| Approach | When to use |
|----------|-------------|
| **Integer `price_cents` + Checkout `price_data`** | Fast MVP; no pre-created Stripe Prices. |
| **Stripe Price IDs as source of truth** | Coupons, analytics, and refund flows that align tightly with Stripe. |
| **Dynamic `price_data` only** | Simplest ops; weaker long-term reporting until you add Price ids. |

Pragmatic path: start with **`price_cents` + `price_data`**, then attach **`stripe_price_id`** to types when promos and reporting matter.

---

## 4. Coexistence with existing entry paths

Paid flow becomes a **fourth path**: Stripe Checkout → success webhook → create (or finalize) attendee with ticket + payment fields → existing **QR + Resend** path.

- **CSV / webhook / free RSVP:** leave `ticket_type_id` null or point at a default “Imported” / “RSVP” type if you want uniform reporting.
- **Free ticket types:** same table with `price_cents = 0`; optional “claim” flow if you need inventory limits without card collection.

**Email uniqueness:** Today one row per `(event_id, email)`. Either keep that (second purchase = error or explicit upgrade flow) or allow multiple rows per email for bulk buyers — product decision with DB impact.

---

## 5. Inventory and concurrency

Avoid naive `quantity_sold++` without locking under concurrent checkouts.

- **MVP:** transaction + row lock on the `ticket_types` row when moving from `pending` to `paid`, or count paid rows vs `quantity_total` inside a transaction.
- **Stricter:** check constraints or serializable isolation if you sell high-contention drops.

---

## 6. Product sequencing (build order)

1. **Single paid GA type per event** — one ticket type, one Checkout session, webhook creates attendee + QR email.
2. **Multiple tiers** (e.g. GA / VIP) — multiple type rows; Checkout `line_items`.
3. **Time windows** — `sales_opens_at` / `sales_closes_at`, or separate named types (“Early bird”) before dynamic pricing logic.
4. **Coupons** — Stripe Promotion Codes + stored `stripe_price_id` on types.
5. **Comp / staff** — `is_public = false`, `price_cents = 0`, created only from admin.

**Defer until needed:** reserved seating, complex refund policy encoding in DB, full order/cart model until you need multi-line receipts.

---

## 7. What not to over-model on day one

- Reserved seating (sections, seats) — different problem domain.
- Refund rules in schema — start with policy copy + Stripe dashboard; encode when support load justifies it.
- Full **orders** table — add when carts or add-ons appear.

---

## 8. Summary

You are adding a **payment rail** in front of attendee creation, not replacing the check-in core. **`event_ticket_types`** holds the catalog; **payment metadata** lives on `attendees` or a **`purchases`** table depending on cart semantics. Keep **organizer SaaS billing** and **ticket buyer charges** as distinct Stripe concepts and route webhooks accordingly.

When implementation starts, update [MASTER-PLAN.md](MASTER-PLAN.md) with concrete checklist items and link PRs or migrations here.

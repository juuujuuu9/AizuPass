# Ticket types & pricing — implementation strategy

**Purpose:** Future reference for paid ticketing: data model, Stripe alignment, and how it fits the existing hub (RSVP, CSV import, QR email). Not an implementation spec; update this doc when decisions change.

**Master plan:** [MASTER-PLAN.md](MASTER-PLAN.md)

**Context in this codebase**

- **Tenancy:** `organizations` → `events` (`organization_id`) → `attendees` (`event_id`). See `src/lib/db.ts`, org flows in [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md).
- **Attendee entry paths today:** RSVP (see app flows), CSV import, Eventbrite sync (uses `microsite_entry_id` with `eb:` prefix). See [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md).
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

## 4. Platform processing fee (revenue model) — UPDATED

**Strategy:** Match Eventbrite exactly. Same fees, better everything (cash flow, data ownership, branding).

A per-ticket processing fee is baked into every sale and retained by the platform as a revenue stream distinct from SaaS subscriptions.

### Fee structure (Eventbrite-matching)

|| Model | Who pays | Example | Best for |
||-------|----------|---------|----------|
|| **Pass-through (default)** | Attendee | $25 ticket + $3.39 fees = $28.39 total | All events; transparent |
|| **Absorbed** | Organizer | $25 ticket, $21.61 payout | Premium galas, charities (Pro/Business feature) |
**Attendee pays (pass-through by default):**
- **Service fee:** 3.5% + $1.79 per ticket (platform revenue)
- **Payment processing:** 2.9% (pass-through to Stripe)

**Positioning:** *"We charge exactly what Eventbrite charges. But unlike them, you own your guest list and get your money faster."*

### Total fee examples

| Ticket Price | Service Fee | Stripe (2.9%) | Total Fee | Attendee Pays |
|--------------|-------------|---------------|-----------|---------------|
| $10 | $2.14 | $0.29 | $2.43 | $12.43 |
| $25 | $2.66 | $0.73 | $3.39 | $28.39 |
| $50 | $3.54 | $1.45 | $4.99 | $54.99 |
| $100 | $5.29 | $2.90 | $8.19 | $108.19 |

**Platform net revenue per ticket** (service fee minus Stripe's portion): ~$1.50-2.50 depending on ticket price.

### Payout speed gate (the upgrade driver)

|| Component | Where it goes |
||-----------|---------------|
| Stripe processing (~2.9% + $0.30) | Stripe (payment rail cost) |
| Platform fee (remainder) | AizuPass (your revenue) |

The real differentiator isn't lower fees — it's cash flow. Eventbrite holds money until post-event.

| Tier | Payout Timing | Monthly Cost |
|------|---------------|--------------|
| **Freemium** | 7 days after event ends | $0 |
| **Pro** | 48 hours after each sale | $39/mo |
| **Business** | Daily (next business day) | $99/mo |

**Freemium pitch:** *"Get started free. Money arrives after your event wraps up."*
**Pro pitch:** *"Get paid within 48 hours — not weeks later."*

### Data model additions

Add to `event_ticket_types`:
- `platform_fee_cents` — calculated as 3.5% + $1.79 per ticket
- `stripe_fee_cents` — 2.9% of ticket price
- `fee_mode` — `'pass_through' | 'absorbed'` (organizer choice, Pro/Business feature)

Add to `attendees` / `purchases`:
- `platform_fee_cents` — what platform captured
- `stripe_fee_cents` — what Stripe took
- `payout_cents` — what organizer receives (if absorbed) or ticket face value (if pass-through)
- `payout_scheduled_at` — when payout will be released (tier-dependent)

### Display and compliance

- Checkout must show all line items: "Ticket: $25.00 | Service fee: $2.66 | Processing: $0.73 | **Total: $28.39**"
- No hidden fees at final step — transparent from first click
- Email receipt breaks down all components
- Organizer dashboard shows gross, fees, and net clearly

---

## 5. Coexistence with existing entry paths

Paid flow becomes a **fourth path**: Stripe Checkout → success webhook → create (or finalize) attendee with ticket + payment fields → existing **QR + Resend** path.

- **CSV / webhook / free RSVP:** leave `ticket_type_id` null or point at a default “Imported” / “RSVP” type if you want uniform reporting.
- **Free ticket types:** same table with `price_cents = 0`; optional “claim” flow if you need inventory limits without card collection.

**Email uniqueness:** Today one row per `(event_id, email)`. Either keep that (second purchase = error or explicit upgrade flow) or allow multiple rows per email for bulk buyers — product decision with DB impact.

---

## 6. Inventory and concurrency

Avoid naive `quantity_sold++` without locking under concurrent checkouts.

- **MVP:** transaction + row lock on the `ticket_types` row when moving from `pending` to `paid`, or count paid rows vs `quantity_total` inside a transaction.
- **Stricter:** check constraints or serializable isolation if you sell high-contention drops.

---

## 7. Product sequencing (build order)

1. **Single paid GA type per event** — one ticket type, one Checkout session, webhook creates attendee + QR email.
2. **Multiple tiers** (e.g. GA / VIP) — multiple type rows; Checkout `line_items`.
3. **Time windows** — `sales_opens_at` / `sales_closes_at`, or separate named types (“Early bird”) before dynamic pricing logic.
4. **Coupons** — Stripe Promotion Codes + stored `stripe_price_id` on types.
5. **Comp / staff** — `is_public = false`, `price_cents = 0`, created only from admin.

**Defer until needed:** reserved seating, complex refund policy encoding in DB, full order/cart model until you need multi-line receipts.

---

## 8. What not to over-model on day one

- Reserved seating (sections, seats) — different problem domain.
- Refund rules in schema — start with policy copy + Stripe dashboard; encode when support load justifies it.
- Full **orders** table — add when carts or add-ons appear.

---

## 9. Summary

You are adding a **payment rail** in front of attendee creation, not replacing the check-in core. **`event_ticket_types`** holds the catalog; **payment metadata** lives on `attendees` or a **`purchases`** table depending on cart semantics. Keep **organizer SaaS billing** and **ticket buyer charges** as distinct Stripe concepts and route webhooks accordingly.

When implementation starts, update [MASTER-PLAN.md](MASTER-PLAN.md) with concrete checklist items and link PRs or migrations here.

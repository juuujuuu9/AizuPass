# Step 2: Central Hub (Multi-Event)

This doc describes the **Central Hub** architecture: one app and database to manage multiple events.

**Master plan:** [docs/MASTER-PLAN.md](MASTER-PLAN.md) — Central Hub = item 3 there.

---

## Architecture

```
External tools / spreadsheets  ----CSV---->  Central Hub (this project)  <----  Scanner App
                                                      |
                                              Central DB
                                              - events
                                              - attendees (event-scoped)
```

- **Events** are first-class; each attendee belongs to one event.
- **QR payload (v2):** `eventId:entryId:token` — no PII; event-scoped check-in.
- **Default event:** In-app RSVP and legacy (v1) QRs use the event identified by `DEFAULT_EVENT_SLUG` (e.g. `default`). No `DEFAULT_EVENT_ID` to avoid circular config.

---

## Schema summary

- **events:** `id` (UUID), `name`, `slug` (UNIQUE), `microsite_url`, `settings` (JSONB), `created_at`.
- **attendees:** `event_id` (FK to events), `microsite_entry_id` (optional stable id — e.g. **Eventbrite** sync uses `eb:{id}`), `source_data` (JSONB). Unique index on `(event_id, microsite_entry_id)` where `microsite_entry_id` IS NOT NULL. **Same email in different events is allowed:** per-event uniqueness via `UNIQUE(event_id, email)`.

**If you see "Email already registered" when adding the same email to a different event:** run `npm run migrate-events` so the DB uses per-event uniqueness only (and ensure RSVP/API pass `eventId` when creating attendees).

---

## Guestlist: CSV import (primary)

1. Export a CSV from your tool (columns: name or first_name/last_name, email; optional phone, company, dietary_restrictions, created_at).
2. In Admin, select the event → **Import CSV** → upload.
3. The hub maps columns, deduplicates by **event + email** (skips existing), and stores import metadata in `source_data`.

For CSV, `microsite_entry_id` is usually null unless you populate it from another system.

---

## Default event and v1 QR

- **Default event:** Resolved by `DEFAULT_EVENT_SLUG`. Cached in memory to avoid repeated DB lookups. Used for RSVP flows that omit `eventId` and for v1-legacy QR decoding.
- **v1-legacy QR:** Check-in may accept two-part payload during transition; `decodeQR` can resolve event via `getDefaultEventId()`.

---

## Quick start

```bash
echo "DEFAULT_EVENT_SLUG=default" >> .env
node scripts/migrate-events.mjs --dry-run
node scripts/migrate-events.mjs
pnpm run dev
```

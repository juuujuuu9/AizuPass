# Step 2: Central Hub (Multi-Event)

This doc describes the **Central Hub** architecture: one app and database to manage multiple events and optional landing-page (microsite) integrations.

**Master plan:** [docs/MASTER-PLAN.md](MASTER-PLAN.md) — Central Hub = item 3 there.

---

## Architecture

```
Landing Page (Microsite)  ----webhook---->  Central Hub (this project)  <----  Scanner App
         |                                            |
         |                                    Central DB
         |                                    - events
         |                                    - attendees (event-scoped)
         +------------------------------------  (entries from microsites)
```

- **Events** are first-class; each attendee belongs to one event.
- **QR payload (v2):** `eventId:entryId:token` — no PII; event-scoped check-in.
- **Webhook:** Microsites POST to `POST /api/ingest/entry` with `eventSlug`, `micrositeEntryId`, `name`, `email`, etc.; hub creates attendee and optionally generates QR and sends email.
- **Default event:** In-app RSVP and legacy (v1) QRs use the event identified by `DEFAULT_EVENT_SLUG` (e.g. `default`). No `DEFAULT_EVENT_ID` to avoid circular config.

---

## Schema summary

- **events:** `id` (UUID), `name`, `slug` (UNIQUE), `microsite_url`, `settings` (JSONB: e.g. `qr_enabled`, `qr_send_email`, optional `webhook_secret` for per-event keys), `created_at`.
- **attendees:** Existing columns plus `event_id` (FK to events), `microsite_entry_id`, `source_data` (JSONB), `created_at`. Unique index on `(event_id, microsite_entry_id)` where `microsite_entry_id IS NOT NULL` for idempotency. **Same email in different events (lists) is allowed:** uniqueness is per event via `UNIQUE(event_id, email)`; the migration drops any global `UNIQUE(email)` so one person can register for multiple events.

**If you see "Email already registered" when adding the same email to a different event:** run `npm run migrate-events` so the DB uses per-event uniqueness only (and ensure RSVP/API pass `eventId` when creating attendees).

---

## Webhook

- **Route:** `POST /api/ingest/entry`. Not protected by session; handler validates `Authorization: Bearer <key>`.
- **Option A (Phase 1):** Single key. Env: `MICROSITE_WEBHOOK_KEY`. Body includes `eventSlug`; hub looks up event by slug.
- **Option B (Phase 2):** Per-event keys. Either env `MICROSITE_KEYS` (slug → key) or `events.settings.webhook_secret`. Handler tries global key first, then event’s `settings.webhook_secret`; event is determined by key (ignore or verify `eventSlug` in body). Prevents one microsite from writing to another’s event.

**Idempotency:** If `event_id` + `microsite_entry_id` already exist, return existing entry; if `generateQR` and current token is expired, refresh token and return `refreshed: true`.

---

## Default event and v1 QR

- **Default event:** Resolved by `DEFAULT_EVENT_SLUG` (e.g. `default`). Cached in memory (e.g. 1h) to avoid repeated DB lookups. Used for in-app RSVP (no `eventId` in body) and for decoding v1-legacy QR (two-part `entryId:token`).
- **v1-legacy QR:** During transition, check-in accepts two-part payload; `decodeQR` resolves event via `getDefaultEventId()` and logs legacy usage so you can drop v1 when safe.

---

## Syncing microsite data: CSV import (primary)

The **primary** way to get attendee data from external sites (microsites, landing pages, spreadsheets) into the hub is **CSV import**.

1. Export a CSV from the microsite or tool (columns: name or first_name/last_name, email, and optionally phone, company, dietary_restrictions, created_at).
2. In Admin, select the event → **Import CSV** → choose file → upload.
3. The hub maps columns to the `attendees` table, deduplicates by **event + email** (skips existing), and stores import metadata in `source_data` (e.g. `{ imported: true, importedAt }`). Extra CSV columns can be stored in `source_data` for reference.
4. No webhook or shared keys to sync; one-off or repeated imports as needed.

**Table:** No change required. Existing `attendees` columns already support CSV-imported rows. Use `microsite_entry_id` only when you have a stable external id (e.g. from a webhook); for CSV, leave it null.

**Optional webhook:** Real-time push is still available via `POST /api/ingest/entry` and `MICROSITE_WEBHOOK_KEY`. Use only if you need live sync.

---

## Microsite sends QR emails (hub-compatible)

**Paste this section into Cursor** when building a new microsite so it can create attendees in the hub and send hub-compatible QR emails from the microsite.

When the microsite owns the registration flow and wants to **send the QR email itself** (e.g. its own branding, templates), use the webhook to create the attendee and get a compatible QR payload; do not ask the hub to send the email.

### Hub setup

1. **Event:** Ensure the event exists in the hub with the slug the microsite will use (e.g. `summer-gala`). Create via Admin or migration.
2. **Webhook key:** In the hub’s `.env`:
   ```bash
   MICROSITE_WEBHOOK_KEY=<shared-secret>
   ```
   Generate with: `openssl rand -hex 32`. Share this secret only with the microsite (server-side).
3. **Optional:** `PUBLIC_APP_URL` — used in the webhook response for `qrUrl` (e.g. link to view QR in browser). Not required if the microsite only uses `qrPayload`.

### Microsite flow

1. **On registration:** From the microsite backend (never from the browser, to keep the key secret), call the hub:
   ```http
   POST https://<hub-domain>/api/ingest/entry
   Authorization: Bearer <MICROSITE_WEBHOOK_KEY>
   Content-Type: application/json

   {
     "eventSlug": "summer-gala",
     "email": "guest@example.com",
     "name": "Jane Doe",
     "micrositeEntryId": "optional-stable-id-from-your-db",
     "generateQR": true,
     "sendEmail": false
   }
   ```
   - `eventSlug`, `email` required. `name` optional (split into first/last by hub). `micrositeEntryId` optional but recommended for idempotency (same guest re-registering returns same entry + refreshed QR if expired).
   - `generateQR: true` → hub creates/refreshes a QR token and returns `qrPayload`.
   - `sendEmail: false` → hub does not send email; microsite will send.

2. **Response (201):**
   ```json
   {
     "entryId": "<uuid>",
     "qrPayload": "<eventId>:<entryId>:<token>",
     "qrUrl": "https://<hub>/qr/..."
   }
   ```
   For idempotent existing entry: same shape, plus `"existing": true` and optionally `"refreshed": true` if the token was refreshed.

3. **Generate QR image on the microsite:** Encode **exactly** the string `qrPayload` (no extra whitespace or prefix). Any QR library that encodes a string will work; the hub’s scanner expects the format `eventId:entryId:token`. Example (Node): `qrPayload` → PNG/Data URL (e.g. `qrcode` npm package).

4. **Send the email from the microsite** with that image attached/inlined, using your own template and mail provider.

Result: The attendee exists in the hub with a valid token; the QR you send from the microsite will scan and check in at the hub.

---

## Quick start

```bash
echo "MICROSITE_WEBHOOK_KEY=$(openssl rand -hex 32)" >> .env
echo "DEFAULT_EVENT_SLUG=default" >> .env
node scripts/migrate-events.mjs --dry-run
node scripts/migrate-events.mjs
npm run dev
```

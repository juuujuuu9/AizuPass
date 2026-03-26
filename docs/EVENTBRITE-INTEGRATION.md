# Eventbrite integration

**Audience:** Organizers, support, and engineers.  
**Scope:** Pull Eventbrite attendees into an AizuPass **event** guestlist (create/update rows, QR for new guests). This is a **pull sync** from the organizer’s Eventbrite account using a **private API token**, not Eventbrite webhooks.

**Related:** [INTEGRATIONS-STRATEGY.md](INTEGRATIONS-STRATEGY.md), [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md) (events + attendees model), [MASTER-PLAN.md](MASTER-PLAN.md).

**Code (reference):**

| Area | Location |
|------|-----------|
| Sync API | `src/pages/api/integrations/eventbrite/sync.ts` |
| Eventbrite HTTP client | `src/lib/eventbrite.ts` |
| Credentials + DB merge | `src/lib/db.ts` (`getEventSettingsRawForManage`, `mergeEventbriteSettingsForManage`, batch lookups, `updateAttendeeMicrositeEntryId`) |
| Settings redaction in API/UI | `src/lib/db/event-row.ts` (`sanitizeEventSettings`) |
| Organizer UI | `src/pages/admin/events/integrations.astro`, `src/scripts/eventbrite-integration-page.ts` |

---

## What it does

1. An **organizer** opens **Admin → Integrations** (`/admin/events/integrations?event=<hubEventId>`).
2. They enter the **Eventbrite event ID** and a **private token** with access to that event (see Eventbrite’s [authentication docs](https://www.eventbrite.com/platform/docs/authentication)).
3. Optionally they enable **save credentials** so the hub stores `eventbriteEventId`, `privateToken`, and `lastSyncedAt` under `events.settings.eventbrite` for later syncs (token is **never** returned to the browser; see [Credentials storage](#credentials-storage)).
4. **Sync** calls Eventbrite `GET /v3/events/{id}/attendees/` with pagination, merges results into the hub event’s **attendees** table, and returns counts: `created`, `updated`, `skipped`.

---

## Matching and idempotency

- Each Eventbrite **attendee** is keyed in the hub as **`microsite_entry_id` = `eb:{eventbriteAttendeeId}`** (stable per ticket holder record in Eventbrite’s API).
- For each incoming row the sync resolves the hub attendee in this order:
  1. Existing row with that **`eb:`** microsite id for this **hub event**.
  2. Else existing row with the same **email** (case-insensitive, trimmed) for this hub event.
- **Updates** refresh `first_name`, `last_name`, `email`, merge **`source_data.eventbrite`** (snapshot: `attendeeId`, `orderId`, `status`, `checkedIn`, `syncedAt`), and set `microsite_entry_id` to `eb:…` if it was missing (e.g. previously CSV-only).
- **Creates** insert a new attendee with `microsite_entry_id`, `source_data`, then **`getOrCreateQRPayload`** so new guests get a check-in QR like CSV import.

---

## Rows skipped or excluded

| Condition | Behavior |
|-----------|----------|
| `cancelled` or `refunded` on Eventbrite | Not imported |
| No email on profile | Not imported (cannot satisfy hub identity expectations for this path) |
| Create hits DB **unique** conflict (e.g. duplicate email in same event from two EB rows in one batch) | Caught; row counted **`skipped`** (implementation treats unique/common duplicate errors as skip) |

---

## Eventbrite → hub check-in state

- **New** hub attendees only: if Eventbrite `checked_in` is true, the hub sets **`checked_in`** and **`checked_in_at`** on create (`initialCheckedIn`).
- **Existing** hub attendees: **check-in state is not overwritten** from Eventbrite on sync—AizuPass remains source of truth for staff scanning after the first import.

Support should be clear with organizers: Eventbrite “checked in” only seeds **new** rows; repeat syncs do not undo or mirror check-in for people already in the hub.

---

## Credentials storage

Stored JSON shape (server-only reads for sync; **never** exposed in `rowToEvent`):

- `eventbriteEventId` — Eventbrite numeric event id  
- `privateToken` — bearer token  
- `lastSyncedAt` — ISO timestamp (updated when **save credentials** is used on a successful sync)

**Sanitization:** `sanitizeEventSettings` strips `privateToken` from any `events.settings` returned through normal event mapping and sets **`credentialsSaved: true`** when a token was stored so the UI can show “saved” placeholders without revealing the secret.

**Risk note:** Tokens live in the database in plaintext (same class of risk as other integration secrets in `settings`). Rotate tokens in Eventbrite if compromised; consider env-based or vault storage if policy requires it.

---

## API: `POST /api/integrations/eventbrite/sync`

- **Auth:** Signed-in user; must **manage** the hub event (`requireEventManage`).
- **Rate limit:** `eventbrite-sync:{clientIp}` — **20** requests per **60s** window per IP (see `checkRateLimit` in `src/lib/rate-limit.ts`).
- **Body (JSON):**

| Field | Required | Description |
|--------|----------|-------------|
| `eventId` | Yes | Hub event UUID |
| `eventbriteEventId` | If not saved | Eventbrite event id string |
| `privateToken` | If not saved | Private token (can omit on later syncs if credentials saved) |
| `saveCredentials` | No | If true, persist token + event id + `lastSyncedAt` after successful sync |

- **Success (200):** `{ ok, created, updated, skipped, eventbriteTotal, eligible, saveCredentials }`  
  - `eventbriteTotal` — rows returned across all pages from Eventbrite before filtering  
  - `eligible` — rows after excluding cancelled/refunded/empty email  
- **Common errors:** `400` missing ids/token, `401/403` from Clerk, `429` rate limit, `502` upstream Eventbrite error (including friendly copy for 401/403 token rejection).

---

## Testing protocol

Use a **staging** or low-risk Eventbrite event when possible. Document Eventbrite event id and test accounts; do not paste production tokens into tickets or public chats.

### 1. Access control

1. Sign in as **staff** (non-organizer) for an org → open `/admin/events/integrations?event=…`  
   - **Expect:** Redirect away or no integration form (same rules as import/manage).  
2. Sign in as **organizer** → Integrations shows form; sync succeeds with valid token.

### 2. Happy path (small event)

1. Create or pick a hub **event**; note **hub** `eventId`.  
2. Eventbrite: 2–3 test orders with **unique emails**, not cancelled/refunded.  
3. Run sync **without** save credentials → **Expect:** `created` matches new guests; attendees have `eb:` ids; new rows have QR payloads usable at scanner.  
4. Run sync **again** → **Expect:** `updated` (or zero `created`), no duplicate attendees for same emails/`eb:` ids.

### 3. Saved credentials

1. Sync with **save credentials** checked.  
2. Reload Integrations; leave token blank; sync again.  
3. **Expect:** Success; UI shows saved placeholder; `lastSyncedAt` in DB/settings advances when save is used.

### 4. Token and Eventbrite errors

1. Wrong token → **Expect:** `502` with message about Eventbrite rejecting token.  
2. Wrong Eventbrite event id → **Expect:** Error from Eventbrite (non-200 surfaced as `EventbriteApiError`).

### 5. Filter rules

1. **Cancelled** or **refunded** attendee on Eventbrite → **Expect:** Not counted in `eligible`; no row created.  
2. Attendee with **empty email** (if you can construct in test data) → **Expect:** Skipped from import list.

### 6. Match precedence and CSV coexistence

1. Import a guest via **CSV** only (no `eb:` id).  
2. Add same person as Eventbrite attendee (same email).  
3. Sync → **Expect:** Same hub row **updated**, `microsite_entry_id` becomes `eb:…`, `source_data.eventbrite` populated.

### 7. Pagination (optional)

1. Event with **>50** attendees (Eventbrite default page size).  
2. **Expect:** All pages fetched (`fetchAllEventAttendees` loops `page` until `page_count`); counts consistent with Eventbrite dashboard for non-excluded rows.

### 8. Rate limit (optional, dev/staging)

1. Trigger **>20** sync POSTs from the same IP within a minute.  
2. **Expect:** `429` with retry messaging.

### Regression (automated)

- Run **`npm run build`** and **`npx tsc --noEmit`** (CI does both).  
- Eventbrite itself is **not** called in repo automated tests; keep the manual checklist above for integration validation.

---

## Edge cases and limitations (support cheat sheet)

| Topic | Detail |
|--------|--------|
| **Duplicate email, two EB attendees** | Second create may hit `UNIQUE(event_id, email)` → **skipped**; resolve in Eventbrite or hub manually. |
| **Email changed on Eventbrite** | Match may follow **eb:** id and update email; if old row only had email match, behavior depends on order of operations; re-sync after EB updates. |
| **Multi-ticket / transfer semantics** | One EB attendee id per ticket line; transfers/cancellations in Eventbrite may add/remove ids—re-sync refreshes metadata; cancelled/refunded excluded. |
| **Hub check-in already true** | Sync **does not** clear or set check-in for **existing** rows from Eventbrite `checked_in`. |
| **Unpaid / pending** | If Eventbrite still returns a row with email and not cancelled/refunded, it may import; product policy may want to filter by status later—currently not filtered beyond cancelled/refunded/email. |
| **Serverless rate limit store** | In-memory limiter is **per instance**; many cold starts can allow more than 20/min globally—acceptable for abuse reduction, not strict global cap. |
| **OAuth / multi-org EB** | Not implemented; private token only. |
| **Real-time** | Sync is **on demand** only (no Eventbrite webhook). |

---

## Operational checklist (go-live)

- [ ] Eventbrite **private token** scoped/minimized per org policy; rotated from dev to prod.  
- [ ] Correct **Eventbrite event id** paired with correct **hub event**.  
- [ ] Organizers trained: first sync before doors; re-sync policy for late registrations.  
- [ ] Support doc: [Testing protocol](#testing-protocol) + [Edge cases](#edge-cases-and-limitations-support-cheat-sheet) linked from internal runbook.

---

## Changelog pointer

Track product status at a high level in [MASTER-PLAN.md](MASTER-PLAN.md) and [INTEGRATIONS-STRATEGY.md](INTEGRATIONS-STRATEGY.md). Update **this** doc when API, filters, or credential behavior changes.

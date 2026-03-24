# Form microsite setup — linking to the hub

This doc is for **you** (or your team) when creating a new form microsite that should integrate with this Central Hub (QR-Check-In). It covers linking steps and how to give Cursor the right context in the new project.

**Hub repo:** This project (QR-Check-In).  
**Microsite:** Any separate app (e.g. Astro, Next, static form + serverless) that collects signups and optionally pushes them to the hub or exports CSV for import.

---

## 1. Give Cursor hub context in the new project

Copy the hub-integration rule from this repo into the new microsite so Cursor knows how to talk to the hub.

**From this repo:**

- **File to copy:** `docs/form-microsite-hub-integration.mdc`

**In the new microsite project:**

1. Ensure the project has a `.cursor/rules/` directory (create it if needed).
2. Copy the file there, e.g.:
   - **Destination:** `.cursor/rules/hub-integration.mdc`
   - Content = contents of `docs/form-microsite-hub-integration.mdc`.

**One-time copy (example):**

```bash
# From the new microsite repo root
mkdir -p .cursor/rules
cp /path/to/QR-Check-In/docs/form-microsite-hub-integration.mdc .cursor/rules/hub-integration.mdc
```

After that, Cursor will apply the hub-integration rule in that project (env vars, webhook contract, QR payload, CSV option).

**Optional:** If the hub repo URL or doc paths differ, edit the "Reference" link in the copied `.mdc` so it points to your hub’s STEP-2 doc.

---

## 2. Linking steps (microsite → hub)

### Option A: Real-time sync via webhook

1. **Hub:** Create the event in Admin (or migration) and note its **slug** (e.g. `summer-gala`).
2. **Hub:** In `.env`, set `MICROSITE_WEBHOOK_KEY` (e.g. `openssl rand -hex 32`). Do not commit it.
3. **Microsite:** In `.env`, set:
   - `HUB_URL` = hub base URL (e.g. `https://checkin.example.com`)
   - `HUB_WEBHOOK_KEY` = same value as hub’s `MICROSITE_WEBHOOK_KEY`
   - `HUB_EVENT_SLUG` = event slug from step 1
4. **Microsite:** On form submit (server-side), `POST` to `{HUB_URL}/api/ingest/entry` with `Authorization: Bearer {HUB_WEBHOOK_KEY}` and JSON body (see `hub-integration.mdc` or [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md)).
5. If the microsite sends the QR email itself: use `generateQR: true`, `sendEmail: false`, then encode the returned `qrPayload` as QR and send your own email.

### Option B: CSV import (no webhook)

1. **Hub:** Create the event in Admin.
2. **Microsite:** Export signups as CSV (name, email, and any extra columns you want).
3. **Hub:** Admin → select event → Import CSV → upload. Hub dedupes by event + email.

No webhook key or env vars needed on the microsite.

---

## 3. Summary

| What | Where |
|------|--------|
| Cursor rule for hub integration | Copy `docs/form-microsite-hub-integration.mdc` → new project’s `.cursor/rules/hub-integration.mdc` |
| Hub architecture and webhook detail | This repo: [STEP-2-CENTRAL-HUB.md](STEP-2-CENTRAL-HUB.md) |
| Master plan and roadmap | This repo: [MASTER-PLAN.md](MASTER-PLAN.md) |

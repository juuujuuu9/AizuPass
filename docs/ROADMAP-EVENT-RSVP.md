# Roadmap: Event-Specific RSVP System

> Compiled: 2026-03-26  
> Status: Architecture sketch — pending prioritization

## Summary

This document sketches the technical architecture for making RSVP an **optional, per-event feature** with customizable forms, theming, and custom domain support. Organizers will be able to enable/disable RSVP per event, design registration pages with custom fields, and optionally use their own domain (e.g., `register.myconference.com`).

This is a **roadmap reference** — not yet in active development. Implementation should be phased based on customer demand.

---

## Current State (As-Is)

| Aspect | Current | Limitation |
|--------|---------|------------|
| RSVP endpoint | `POST /api/attendees` — public, unauthenticated | Single global form, no per-event customization |
| Event association | Hardcoded to `DEFAULT_EVENT_SLUG` env var | Cannot have multiple simultaneous RSVP pages |
| Form fields | Static: firstName, lastName, email, phone, company, dietaryRestrictions | No organizer customization |
| Styling | None — plain form | No brand/theming support |
| Domain | Same as app (`/rsvp`) | No custom domain support |
| Email | Called client-side via `POST /api/send-email` (requires auth — fails for public RSVP) | Email delivery unreliable for public registrations |

---

## Proposed Architecture (To-Be)

### 1. Data Model Changes

#### Extend `events.settings` JSONB

```typescript
interface EventSettings {
  // ... existing Eventbrite config ...
  
  rsvp?: {
    enabled: boolean;
    config: RSVPConfig;
  };
}

interface RSVPConfig {
  // Customization
  title?: string;                    // "Register for TechConf 2026"
  description?: string;            // Markdown supported
  confirmationMessage?: string;      // Shown after submit
  
  // Theming
  theme?: {
    primaryColor?: string;           // #3b82f6
    logoUrl?: string;                // Organizer logo
    backgroundColor?: string;        // #ffffff
    backgroundImageUrl?: string;     // Optional hero/bg
    fontFamily?: 'system' | 'inter' | 'roboto'; // Limited selection for stability
  };
  
  // Form builder
  fields: RSVPField[];               // Ordered list of form fields
  
  // Behavior
  allowMultipleRegistrations?: boolean; // Same email can register multiple times?
  requireApproval?: boolean;         // Organizer approves before QR sent
  redirectAfterSubmit?: string;      // External URL or null (show QR inline)
  
  // Custom domain (Phase 3)
  customDomain?: {
    domain: string;                  // "register.myconference.com"
    verified: boolean;               // DNS + SSL confirmed
    verifiedAt?: string;
  };
}

type RSVPFieldType = 
  | 'text' 
  | 'email' 
  | 'tel' 
  | 'textarea' 
  | 'select' 
  | 'multiselect' 
  | 'checkbox' 
  | 'date' 
  | 'number';

interface RSVPField {
  id: string;                        // Unique field identifier
  type: RSVPFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];                // For select/multiselect
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;                  // Regex for validation
    min?: number;                      // For number
    max?: number;
  };
  // Mapping to system fields (optional)
  mapsTo?: 'firstName' | 'lastName' | 'email' | 'phone' | 'company' | 'dietaryRestrictions' | null;
}
```

#### New Table: `rsvp_registrations` (Optional Normalization)

Currently attendees are created directly. For the RSVP feature, we may want separation:

```sql
-- Option A: Keep using attendees table (simpler)
-- Add attendees.source = 'rsvp' | 'import' | 'manual' | 'eventbrite'

-- Option B: Separate rsvp_submissions table (more flexible)
CREATE TABLE rsvp_submissions (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  attendee_id UUID REFERENCES attendees(id), -- null until approved
  status: 'pending' | 'approved' | 'rejected',
  form_data JSONB, -- Raw form responses
  custom_fields JSONB, -- Extra fields not in attendees table
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id)
);
```

**Recommendation:** Start with Option A (add `source` column to `attendees`). Move to Option B only if `requireApproval` workflow becomes needed.

---

### 2. Route Structure

#### Dynamic Event RSVP Page

```
Current:  /rsvp.astro
Proposed:  /rsvp/[eventSlug].astro

URL Examples:
- /rsvp/tech-conf-2026              (default domain)
- /rsvp/summer-gala                 (default domain)
- https://register.myevent.com/     (custom domain, same page)
```

#### Route Logic

```typescript
// /rsvp/[eventSlug].astro
const { eventSlug } = Astro.params;
const host = Astro.url.host; // For custom domain matching

// 1. Find event by slug OR by custom domain
let event;
if (host && host !== 'app.aizupass.com') {
  event = await getEventByCustomDomain(host);
}
if (!event) {
  event = await getEventBySlug(eventSlug);
}

// 2. Validate RSVP enabled
if (!event?.settings?.rsvp?.enabled) {
  return Astro.redirect('/404');
}

// 3. Load RSVP config
const config = event.settings.rsvp.config;

// 4. Render DynamicRSVPForm with config
```

#### API Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /api/rsvp/:eventSlug/config` | Get public RSVP config (fields, theme) | None |
| `POST /api/rsvp/:eventSlug/submit` | Submit registration | None + rate limit |
| `POST /api/rsvp/:eventSlug/resend-email` | Resend QR to registered email | Email verification |
| `GET /api/events/:id/rsvp/stats` | Registration stats for organizer | Required |

**Key Change:** Email sending moves to **server-side** on submission, eliminating the auth issue.

---

### 3. Component Architecture

#### New Components

```
src/components/rsvp/
├── DynamicRSVPForm.tsx          # Main form renderer (from config)
├── FieldRenderer.tsx            # Renders individual field types
├── RSVPThemeProvider.tsx        # CSS variable injection from theme config
├── RSVPPreview.tsx              # Admin preview of RSVP page
├── CustomDomainManager.tsx      # DNS verification UI
└── FormBuilder/
    ├── FormBuilder.tsx          # Drag-and-drop or list editor
    ├── FieldEditor.tsx          # Edit single field (type, validation, etc)
    └── FieldTypeSelector.tsx    # Select field type
```

#### Form Renderer Logic

```typescript
// DynamicRSVPForm.tsx
interface Props {
  eventId: string;
  config: RSVPConfig;
}

// Render fields in order from config.fields
// Apply validation rules client-side (Zod generated from config)
// Submit to POST /api/rsvp/:slug/submit
// Show confirmation or QR based on config.redirectAfterSubmit
```

---

### 4. Custom Domain Support (Phase 3)

#### Technical Requirements

1. **DNS**: Organizer creates CNAME → `cname.aizupass.com` (or your domain)
2. **Vercel**: Add domain to project (manual or via API)
3. **SSL**: Vercel handles automatically
4. **Middleware**: Parse `Host` header, look up event by `customDomain.domain`

#### Middleware Addition

```typescript
// src/middleware.ts addition
const host = new URL(context.request.url).host;
if (host !== 'app.aizupass.com') {
  // Check if this is a custom domain RSVP
  const event = await getEventByCustomDomain(host);
  if (event?.settings?.rsvp?.enabled) {
    // Rewrite to RSVP page with this event
    return context.rewrite(`/rsvp/${event.slug}`);
  }
}
```

#### Operational Complexity

| Concern | Mitigation |
|---------|------------|
| Domain verification | Require TXT record + CNAME before enabling |
| SSL provisioning | Vercel auto; handle "provisioning" state in UI |
| Domain release | Cleanup when organizer disconnects |
| Abuse | Rate limit custom domain creation per org |

---

### 5. Phased Implementation Plan

#### Phase 1: Basic Event-Specific RSVP (2-3 weeks)

**Goal:** Multiple events can have separate RSVP pages with basic customization.

- [ ] Add `rsvp.enabled` and `rsvp.config` to `events.settings` schema
- [ ] Create `/rsvp/[eventSlug].astro` route
- [ ] Build `DynamicRSVPForm` with static field list (system fields only)
- [ ] Move email sending to server-side in `POST /api/attendees`
- [ ] Add RSVP toggle to event settings admin UI
- [ ] Migration: Add `attendees.source` column ('rsvp' | 'import' | 'manual' | 'eventbrite')

**Files to touch:**
- `src/pages/rsvp/[eventSlug].astro` (new)
- `src/components/rsvp/DynamicRSVPForm.tsx` (new)
- `src/pages/api/attendees.ts` (server-side email)
- `src/pages/admin/events/settings.astro` or similar (RSVP toggle)
- `src/lib/db.ts` (add `source` column handling)

#### Phase 2: Form Builder + Theming (4-6 weeks)

**Goal:** Organizers can customize form fields and apply basic theming.

- [ ] Extend `RSVPConfig` with `fields` array
- [ ] Build `FormBuilder` admin UI component
- [ ] Create `FieldRenderer` for all field types
- [ ] Generate Zod validation dynamically from field config
- [ ] Implement `RSVPThemeProvider` with CSS variable injection
- [ ] Add theme editor (color picker, logo upload)

**New files:**
- `src/components/rsvp/FormBuilder/` (directory)
- `src/components/rsvp/FieldRenderer.tsx`
- `src/components/rsvp/RSVPThemeProvider.tsx`

#### Phase 3: Custom Domains (3-4 weeks)

**Goal:** Organizers can use their own domain for RSVP.

- [ ] Add `customDomain` to `RSVPConfig`
- [ ] Build DNS verification flow (TXT record check)
- [ ] Add middleware for custom domain routing
- [ ] Build `CustomDomainManager` UI
- [ ] Document DNS setup for organizers

**New files:**
- `src/components/rsvp/CustomDomainManager.tsx`
- `src/lib/dns-verification.ts` (DNS lookup utilities)

#### Phase 4: Advanced Features (Future)

- [ ] `requireApproval` workflow (pending → approved → QR sent)
- [ ] Payment integration (Stripe for paid events)
- [ ] Ticket tier selection (General, VIP, Early Bird)
- [ ] Capacity limits / waitlist
- [ ] Group registration (register +1, +2, etc)

---

### 6. API Changes Detail

#### `POST /api/attendees` Modification

```typescript
// Current: Creates attendee, returns attendee
// New: Optionally sends email server-side

export const POST: APIRoute = async ({ request }) => {
  // ... validation ...
  
  const attendee = await createAttendee({
    ...data,
    source: 'rsvp' // new field
  });
  
  // Auto-generate QR token
  const qrResult = await getOrCreateQRPayload(attendee.id);
  
  // Server-side email sending (new)
  if (shouldAutoSendEmail(eventId)) {
    const qrCodeBase64 = await generateQRCodeBase64(qrResult.qrPayload);
    await sendQRCodeEmail(attendee, qrCodeBase64, {
      eventName: event.name,
      fromName: organization.name
    });
  }
  
  return json({
    ...attendee,
    qrPayload: qrResult.qrPayload,
    emailSent: true // client can show appropriate message
  }, 201);
};
```

#### New: `GET /api/rsvp/:eventSlug/config`

```typescript
// Public endpoint — returns sanitized config for form rendering
{
  "event": {
    "id": "...",
    "name": "TechConf 2026",
    "slug": "tech-conf-2026"
  },
  "rsvp": {
    "title": "Register for TechConf 2026",
    "description": "Join us for...",
    "fields": [...], // Only public-safe field config
    "theme": {
      "primaryColor": "#3b82f6",
      "logoUrl": "https://..."
    }
  }
}
```

---

## Open Questions / TODO

- [ ] **Decision:** Keep using `attendees` table (add `source` column) vs. new `rsvp_submissions` table?
- [ ] **Decision:** Limit field types to simple ones initially (text, email, select) or build all at once?
- [ ] **Performance:** Cache RSVP config in Redis/memory to avoid DB lookup per page view?
- [ ] **Security:** Rate limiting for `POST /api/rsvp/:slug/submit` — per IP, per event, or both?
- [ ] **Storage:** Logo/theme asset storage — use existing CDN pattern or new bucket?
- [ ] **Pricing:** Is custom domain a paid feature? Limit per plan tier?
- [ ] **Analytics:** Track RSVP page views, conversion rates per event?

---

## References

- Current RSVP implementation: `src/components/RSVPForm.tsx`, `src/pages/api/attendees.ts`
- Event settings pattern: `src/lib/db/event-row.ts` (see `sanitizeEventSettings`)
- Guestlist from external tools: CSV import — `docs/STEP-2-CENTRAL-HUB.md`
- Master plan/roadmap: `docs/MASTER-PLAN.md`

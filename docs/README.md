# QR Check-In Documentation

This folder contains user-facing documentation for the QR Check-In system.

## Documents

| Document | Audience | Purpose |
|----------|----------|---------|
| [QUICK-START.md](./QUICK-START.md) | Event organizers | Get up and running in 5 minutes |
| [USER-GUIDE.md](./USER-GUIDE.md) | Everyone | Complete guide for all user types |
| [FAQ.md](./FAQ.md) | Everyone | Common questions and answers |
| [STAFF-GUIDE.md](./STAFF-GUIDE.md) | Event staff | Day-of-event scanner instructions |

## Who Should Read What

**Event Organizers / Admins:**
1. Start with [QUICK-START.md](./QUICK-START.md)
2. Reference [USER-GUIDE.md](./USER-GUIDE.md) for detailed procedures
3. Print [STAFF-GUIDE.md](./STAFF-GUIDE.md) for your check-in team

**Event Staff (Check-in people):**
1. Read [STAFF-GUIDE.md](./STAFF-GUIDE.md) — it's one page
2. Reference [FAQ.md](./FAQ.md) if you hit edge cases

**Attendees:**
1. [USER-GUIDE.md#for-attendees](./USER-GUIDE.md#for-attendees) — how to get and use their QR code
2. [FAQ.md](./FAQ.md) — common attendee questions

## Printing

**For staff:** Print [STAFF-GUIDE.md](./STAFF-GUIDE.md) — it's designed as a one-page reference.

**For the registration table:** Keep a printed [FAQ.md](./FAQ.md) handy for attendee questions.

## Strategy & Context

| Document | Purpose |
|----------|---------|
| [PRODUCT-STRATEGY.md](./PRODUCT-STRATEGY.md) | Competitive positioning, pricing tiers, AI features, credibility plan |
| [PARTIFUL-KILLER.md](./PARTIFUL-KILLER.md) | vs Partiful: wedge table, integration-aware roadmap, epic slugs for implementation |
| [POSH-COMPETITIVE-ANALYSIS.md](./POSH-COMPETITIVE-ANALYSIS.md) | vs Posh.vip: competitive matrix, positioning taglines, kickback/affiliate strategy |
| [FOUNDER-CONTEXT.md](./FOUNDER-CONTEXT.md) | Origin story, agency niche insights, scanner gun replacement narrative |

## Technical Roadmaps

| Document | Purpose |
|----------|---------|
| [ROADMAP-EVENT-RSVP.md](./ROADMAP-EVENT-RSVP.md) | Event-specific RSVP system: form builder, theming, custom domains (architecture sketch) |
| [STEP-1-QR-SECURITY-PLAN.md](./STEP-1-QR-SECURITY-PLAN.md) | QR token security: short-lived tokens, rotation, check-in race condition fixes |
| [STEP-2-CENTRAL-HUB.md](./STEP-2-CENTRAL-HUB.md) | Hub-and-spoke architecture: microsites, webhooks, CSV ingest |
| [INTEGRATIONS-STRATEGY.md](./INTEGRATIONS-STRATEGY.md) | Integration taxonomy: Eventbrite, Zapier, native integrations |

## Contributing

When updating code, update the relevant documentation:
- New features → Update USER-GUIDE.md
- UI changes → Update screenshots/descriptions
- New error messages → Add to FAQ.md

---

*These docs are written for humans, not computers. Keep them friendly and practical.*

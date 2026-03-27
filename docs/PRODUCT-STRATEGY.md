# AizuPass — Product Strategy

> Compiled: 2026-03-21 · **ICP & culture positioning added:** 2026-03-23 · **Product name:** AizuPass (2026-03-23)

## Summary

Product strategy and competitive positioning for **AizuPass** — covering market gaps, pricing tiers, customization philosophy, AI integration, and credibility-building tactics. Targets the underserved SME segment between spreadsheet hacks and enterprise overkill.

**Primary GTM focus (future reference):** independent music collectives and regional shows (50–250 guests), plus agencies running private invite-only activations (150–500 attendees), with emphasis on aesthetic-forward culture audiences (music, fashion, creative, CPG launches). See [Target ICPs & culture positioning](#target-icps--culture-positioning).

## Competitive Positioning

### Market Tiers

- **Enterprise ($5K+/yr):** Cvent, Bizzabo, Whova — overkill for small events
- **Mid-Market ($99-$499/event):** Zkipster, RSVPify, Guest Manager — per-event pricing friction
- **Freemium/Budget:** Eventbrite Organizer, Eventleaf, Jibble — limited customization, poor offline

### Key Gaps to Exploit

| Gap | Our Angle |
|-----|-----------|
| Offline-first | True airplane-mode functionality (not "sync when reconnected") |
| Staff UX | Satisfying audio-visual feedback designed for scanner, not guest |
| Zero-friction setup | CSV upload vs. complex registration flows |
| Transparent pricing | No "contact sales" — clear tiers |
| Multi-device simplicity | Seamless sync without IT setup |

### vs. large ticketing (e.g. AXS)

AXS wins on **venue scale, exclusive inventory, and promoter contracts**. We do not compete on arena distribution. We win on **taste, speed, transparency, owned audience, and door experience** for events below that tier — especially where the product must feel like part of the creative output, not a box office.

### vs. Eventbrite (Pricing Parity, Experience Superiority)

| Dimension | Eventbrite | AizuPass |
|-----------|------------|----------|
| **Ticket fees** | 3.5% + $1.79 + 2.9% processing | **Same** — we match exactly |
| **Payout timing** | After event ends | **48 hours (Pro) or daily (Business)** — cash flow advantage |
| **Guest data** | Eventbrite owns/markets to | **You own it** — no platform interference |
| **Discovery** | Public marketplace, competing events | **None** — your guests see only your event |
| **Branding** | Heavy Eventbrite ads, emails | **Your logo, your colors, your domain** |

**The pitch:** *"Switch for the cash flow. Stay for the control."*

---

## Target ICPs & culture positioning

*Captured for future strategy and messaging reference.*

### Segment A — Independent collectives & small promoters

- **Scale:** Local and regional shows; roughly **50–250** guests.
- **Care about:** Credibility without corporate ticketing UX; fast setup; simple money flow; door flow that preserves mood; **repeat community** (same crowd, DMs, group chats).
- **Language to use:** Doors, tiers, early access, releases, room — not only “tickets.”

### Segment B — Agencies (private / invite-only)

- **Scale:** Promotional events and activations; roughly **150–500** attendees.
- **Care about:** **Control** (who gets in, plus-ones, tiers); **client branding** (white-label feel — their name, not ours); **ops** (multiple door staff, headcount, no accidental public listing); **post-event proof** (check-in stats and times for recap decks).
- **Language to use:** RSVP, guest list, activation, capacity, approval/deny — alongside ticketing where payment applies.

### Shared “vibe” audience

Target buyers and guests skew **hip, aesthetic-forward, culture-heavy**: creative industries, fashion, music, consumer goods launches. Implications:

| Theme | Product / brand implication |
|--------|-----------------------------|
| Visual identity | Strong typography, minimal presets, dark themes; strict brand kit for agency clients (logo, colors, fonts where feasible). |
| Copy | Avoid generic “conference” tone; match invite/flyer energy. |
| Exclusivity | Hidden links, codes, tiers, waitlists; optional named / non-transferable entries for high-control events. |
| Social share | Assets that read as **flyers or invites**, not receipts. |
| Door | Fast QR, multiple scanners, clear VIP / GA / staff — lines and fumbling read as brand failure at fashion and client events. |

### Go-to-market notes

- **Channels:** Experiential and PR agencies, boutique promoters, venues doing one-offs, culture retail, scene newsletters — not only “event ticketing” SEO.
- **Proof:** Case studies with **event photography** and invite creative; ops metrics agencies respect (wait time, check-in completion, private link discipline).
- **Pricing posture:** Predictable tiers; **per-event** or **per-org monthly** so collectives are not punished for occasional shows; invoice-friendly options for agencies.

### Positioning one-liners (draft)

- **Collectives:** “Door flow and RSVPs that look like your release — not a box office.”
- **Agencies:** “Invite-only RSVPs, tiers, and check-in for brand activations — your client on every surface.”

### Risks to design for

- **Leakage:** Unguessable URLs, optional auth, rate limits; unlisted / non-discoverable events by default for private flows.
- **Ops trust:** Overcommit and flake management (caps, waitlists, clear comms to client).
- **Payments:** Chargebacks and fraud matter once ticket prices and alcohol-adjacent events scale — plan before high-ticket sales.

---

## Customization Tiering

| Feature | Freemium | Pro |
|---------|----------|-----|
| Event name | Yes | Yes |
| "From" email address | Yes | Yes |
| Custom logo | No | Yes |
| Custom email copy | No | Yes |
| Custom colors (UI + email) | No | Yes |
| Custom domain for emails | No | Yes (consider) |

**Rationale:** Freemium = professional baseline (their identity visible). Pro = full brand ownership (our brand removed).

### Considerations

- "Via [AppName]" footer on freemium emails — keeps attribution, sets upgrade expectation
- Deliverability complexity: Custom from domains require SPF/DKIM — engineering cost vs. stickiness tradeoff
- Live color preview — show check-in screen + email simultaneously; aesthetic cohesion sells upgrades at weddings/events

### Potential Add-on

"Branding Pass" — $5-10/event for logo + colors only (one-off users not ready for Pro subscription)

---

## Staff Access Strategy

**Decision:** Include 1 staff user in freemium, unlimited staff on Pro/Business.

**Why:**
- Single organizers (freemium target) typically check in alone at small events
- Needing 2+ scanners = event growth = value proven = willingness to pay
- **Real upgrade driver:** Payout speed, not staff count — cash flow is the pain point

**Freemium** gets 1 staff (organizer-only check-in)
**Pro/Business** get unlimited staff + faster payouts (48hr/daily)

### Tier Structure

| Tier | Price | Limits | Payout Speed | Key Features |
|------|-------|--------|--------------|--------------|
| **Freemium** | $0 | 1 org, 1 event, 1 staff, 150 guests | 7 days post-event | RSVP, CSV import, offline check-in, basic QR |
| **Pro** | $39/mo | Unlimited everything | 48 hours after sale | Custom logo, analytics, 2+ staff, fee absorption option |
| **Business** | $99/mo | Unlimited everything | Daily payout | White-label (custom domain, colors), API access, phone support |

**The pitch:** *"Same fees as Eventbrite. Get your money 5 days faster."*

---

## AI Integration (Problem-First)

**Skip:** Facial recognition (commoditized, privacy complexity, overkill for small events)

### Implement

| Feature | Problem Solved | Implementation |
|---------|---------------|----------------|
| Smart Guest Prediction | QR fails/guest forgets phone — staff frantically searching | Fuzzy match on 3-4 chars (handles typos, "Mike" vs "Michael") |
| Walk-in Anomaly Detection | Crashers, duplicate passes, capacity issues | Real-time pattern flagging: same QR at multiple entrances, unusual velocity |
| Intelligent Audio Feedback | Generic beeps convey no information | Context-aware tones: VIP chime vs standard, distinct error tones for duplicates/not-found |
| Post-Event Insights (Pro) | Organizers want patterns, lack data skills | Natural language summary: "Most guests arrived 7:15-7:45 PM. 12 VIPs early. Consider opening bar at 7:00 next time." |

### Pro-tier AI Upsell

AI-generated email copy variations ("formal gala" vs "casual backyard" tone), smart color palette suggestions from uploaded logo — makes Pro feel "effortless" not just "more toggles."

---

## Credibility Building

### Phase 1: Social Proof Without Users

- Demo videos emphasizing the "satisfying" audio-visual feedback — visceral differentiator
- Self-hosted case study: document own test event, setup-to-scan timeline
- Transparent security docs: offline data handling, encryption, GDPR

### Phase 2: Early Adopter Program

- "Founding Organizer" tier: First 50 accounts get lifetime Pro at freemium price for video testimonials + feedback
- Wedding planner partnerships: Free Pro to 5-10 established planners for multi-event use + referrals
- Venue partnerships: Co-working spaces, boutique hotels, private dining — branded tablets in exchange for referrals

### Phase 3: Scale Trust

- Public uptime dashboard (sync success rates for offline-first claim)
- Open security audit results (crucial for private event data sensitivity)
- Founder story content (frustration with spreadsheet searching resonates)

### Specific Tactics

- "3-tap test" guarantee: >3 taps to check in = refund
- "Works in airplane mode" badge — document zero-connectivity performance
- Comparison transparency: Side-by-side setup time vs Eventbrite/RSVPify (2 min vs 20 min)

---

## Market Context

- Event management software CAGR: 8.6-13.1%
- SMEs represent largest underserved segment
- Positioning: "Fastest setup for private events" — between spreadsheet hacks and enterprise overkill

---

## Open Questions / TODO

**Pricing decisions (resolved):**
- [x] Ticket processing fees: Match Eventbrite at 3.5% + $1.79 (attendee pays)
- [x] Payout speed as upgrade driver: 7 days (Free) → 48 hours (Pro $39) → Daily (Business $99)
- [ ] "Branding Pass" one-off pricing viability ($5-10/event for logo+colors only)

**Technical:**
- [ ] SPF/DKIM complexity assessment for custom email domains
- [ ] Fuzzy matching algorithm selection for guest prediction
- [ ] Audio synthesis library for intelligent feedback tones
- [ ] Founding Organizer tier capacity (50? 100?)
- [ ] Venue partnership legal structure (equipment loan vs. revenue share)

## References

- [MASTER-PLAN.md](./MASTER-PLAN.md) — dev checklist and roadmap
- [FOUNDER-CONTEXT.md](./FOUNDER-CONTEXT.md) — origin story and agency-specific insights

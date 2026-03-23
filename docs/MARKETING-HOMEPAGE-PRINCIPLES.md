# Marketing — SaaS homepage & onboarding (principles)

**Purpose:** Pre-planning context for the public homepage and top-of-funnel onboarding. Not implementation spec.

**Companion:** Product-specific copy and section mapping lives in [MARKETING-HOMEPAGE-CONTENT-MAP.md](MARKETING-HOMEPAGE-CONTENT-MAP.md) (features ↔ sections).

**Related product truth:** [README.md](../README.md), [MASTER-PLAN.md](MASTER-PLAN.md).

---

## Core philosophy

**Value clarity above everything else.** Visitors decide in seconds. The page answers one question: *Does this solve my problem?* Every section earns its place by moving the visitor closer to "yes."

---

## Structural pillars

### Hero

Highest-value real estate. Strong patterns:

- **Headline:** Specific and outcome-oriented (not "Streamline your workflow" — e.g. "Ship code reviews 3x faster").
- **Sub-headline:** Who it's for and what context (venue, team size, event type).
- **Single primary CTA** (one obvious next step).
- **Early social proof:** Logos, "used by X teams," or similar — reduces anxiety before scroll.

### Problem → solution

Narrative arc: acknowledge pain, then position the product as resolution. More persuasive than a raw feature list because it creates resonance before the pitch.

### Features as outcomes

Frame capabilities as benefits ("your team stays in sync without status meetings" vs "real-time collaboration"). Product comprehension often uses interactive demos, short loops, or scroll-triggered visuals — not only static screenshots.

### Social proof (layered)

Distributed through the page, not only the footer:

1. Logos (near top)
2. Quotes (near relevant benefits)
3. Numbers / stats ("cut onboarding time by 60%")
4. Deeper case studies (secondary pages)

### Pricing signal

Hidden pricing increases friction. Many sites show a tier overview or "starts at $X" on the homepage. *(Align with actual billing model when defined — see product map doc.)*

### Trust infrastructure

Security, compliance, data handling, integrations — badges and short claims that answer late objections without forcing a deep dive.

---

## Anatomy (typical high-performing SaaS homepage)

Top-to-bottom flow often mirrors: **awareness → comprehension → trust → action.**

1. Nav with persistent, contrasting CTA (often top-right).
2. Hero (headline, sub, CTA, proof).
3. Problem / agitation → solution pivot.
4. "How it works" or product moment (**aha** as high as possible — show the product, don't only describe it).
5. Benefit blocks tied to outcomes (optionally interactive).
6. Social proof mid-page.
7. Integrations / ecosystem (if relevant).
8. Pricing teaser or full pricing block.
9. Trust (security, privacy, compliance).
10. FAQ + final CTA + footer.

---

## Industry-standard tactics

### Aha moment near the top

Let visitors *see* the product (scanner UI, guestlist, check-in state) as early as credibility allows.

### Conversion micro-optimizations

- Fewer form fields where signup is captured on-page.
- Placeholder / ghost text that models real input.
- CTA copy that matches intent ("Start checking in" vs generic "Sign up").

### Navigation

Persistent primary CTA; optional mega-menu for Features / Use cases if the surface area grows.

### Mobile-first parity

Hero message and CTA must work at small widths; treat mobile scroll as first-class.

---

## Onboarding (product) vs homepage

Homepage sells the *problem* and the *first step*. In-app onboarding (org creation, first event, first import, first scan) is a separate funnel — keep messaging consistent so the homepage promise matches the first-run experience. Reference flows in [AUTH-CLERK-SETUP.md](AUTH-CLERK-SETUP.md) and app routes under `/onboarding/*` when writing copy.

---

## Honesty bar

Before publishing claims, check [MASTER-PLAN.md](MASTER-PLAN.md) concern audit for **Partial** / **Missing** items so marketing does not over-promise (e.g. hardware wedge, bulk QR ZIP, no-shows report).

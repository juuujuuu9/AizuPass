# QR scannability — screen vs print

**Purpose:** Document how QR codes are generated for **screen** (scanner preview, email) vs **print** (badges, bulk ZIP), and a practical **pass/fail** check for physical size. Implementation: `src/config/qr.ts`, `src/lib/qr-client.ts`.

## Profiles

| Profile | Config constant | Typical use | Bitmap width (px) | Margin (modules) | Error correction |
|--------|-----------------|-------------|-------------------|------------------|------------------|
| Screen / email | `QR_GENERATION` | Phone display, RSVP email embed | 280 | 4 | H |
| Print | `QR_PRINT` | Admin **Print badges**, **QR ZIP** (`profile: 'print'`) | 512 | 4 | H |

Both use **pure black / white** modules for maximum contrast.

## Physical size (approximate)

Printed output depends on **how many millimeters/inches the PNG is laid out at**, not the pixel count alone.

At **300 DPI** (common laser print):

- **512 px** square → ~**43 mm** (~1.7 in) if displayed at **native** 1:1 pixel size in the layout.
- **280 px** square → ~**24 mm** (~0.94 in) at 300 DPI.

**Operational rule of thumb:** For event check-in at a typical door distance, aim for the **printed QR module area** at least **~25 mm** on the short side (many vendors cite ~2–3 cm minimum for generic QR; we bias slightly larger for print profile).

| Scenario | Expected result |
|----------|-----------------|
| Badge layout uses print PNG at **≥ ~35 mm** square | **Pass** — comfortable for staffed lanes |
| Badge or sticker **&lt; ~20 mm** square | **Fail / risky** — increase layout size or use print profile at full width |
| Screen-only QR photographed from attendee phone | **Pass** if brightness OK — `QR_GENERATION` width tuned for phone UI |

## Pass/fail test matrix (manual)

Run these once per **printer + paper + badge template** change.

| # | Check | Pass criteria |
|---|--------|----------------|
| 1 | Distance | Scanner reads badge at **~25–40 cm** under normal indoor light |
| 2 | Angle | Reads at **~15–20°** tilt from perpendicular |
| 3 | Quiet zone | White margin visible around the symbol (no crop into modules) |
| 4 | Contrast | Black on white; no color inversion; no heavy overlays on the code |
| 5 | Duplicate guests | Same **first + last** name: disambiguate with **short id** in UI / CSV (see Admin attendee list) |

## Related

- `docs/qr-edge-cases.md` — product edge cases
- `docs/MASTER-PLAN.md` §11 — roadmap items for QR delivery and scannability

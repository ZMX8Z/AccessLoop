---
name: AccessLoop Utility System
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3e4947'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0f766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#80d5cb'
  secondary: '#006c4e'
  on-secondary: '#ffffff'
  secondary-container: '#97f5cc'
  on-secondary-container: '#007353'
  tertiary: '#863b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#ac4d01'
  on-tertiary-container: '#ffe4d7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#80d5cb'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#97f5cc'
  secondary-fixed-dim: '#7bd8b1'
  on-secondary-fixed: '#002115'
  on-secondary-fixed-variant: '#00513a'
  tertiary-fixed: '#ffdbca'
  tertiary-fixed-dim: '#ffb68e'
  on-tertiary-fixed: '#331200'
  on-tertiary-fixed-variant: '#763300'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  tabular-data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for accessible mobility, route planning, and civic infrastructure auditing. Its primary mandate is actionable clarity, uncompromised legibility, and high-trust utility under varying field conditions (e.g., bright sunlight, one-handed navigation, power wheelchair mounts, and screen magnification).

The design ethos merges **Civic Functionalism** with **Modern Tactile Utility**:
- **Dignified & Unambiguous:** Avoids clinical or patronizing aesthetics. Information on curb cuts, cross-slopes, surface textures, and transit elevator statuses is communicated with precision engineering.
- **Cognitive Ease Under Physical Demand:** Touch targets adhere strictly to 44×44px minimum bounding boxes. Status indicators pair high-contrast tonal badges with geometric non-color symbology (shapes, pictograms) so state changes are universally decipherable regardless of color vision deficiency.
- **Calm, High-Readability Chrome:** A cool neutral baseline allows vital physical barriers (steep inclines, missing curb ramps, construction blockages) to visually surface without decorative distraction.

## Colors

The system uses a calibrated palette optimized for WCAG 2.1 AAA contrast on structural text and AA+ on all functional badges.

### Brand & Interactive Colors
- **Primary Teal (`#0F766E`):** Core interactive states, active route paths, primary buttons, and verified infrastructure landmarks.
  - *Primary Dark (`#115E59`):* Pressed states, active focus rings, and high-emphasis headers.
  - *Primary Light / Container (`#CCFBF1`):* Route segment highlight fills, selection tints, and soft interactive states. Contrast against dark teal text exceeds 7:1.

### Semantic Status Palette
Each semantic tier pairs a high-contrast dark text/icon tone with an intentionally tinted pastel container to ensure readable, non-vibrating information cards:
- **Accessible / Clear Route (`#047857` on `#D1FAE5`):** Level pathways, operational ramps, verified automated doorways, and step-free navigation.
- **Caution / Grade Warning (`#B45309` on `#FEF3C7`):** Cross-slopes > 2.0%, running slopes between 5.0%–8.3% (1:12), cracked paving, or temporary maintenance.
- **Critical Barrier / Blockage (`#B91C1C` on `#FEE2E2`):** Missing curb ramps, stairs without ramp/lift alternative, broken elevators, construction dead-ends.
- **Unknown / Unverified Data (`#64748B` on `#F1F5F9`):** Unaudited street segments, historical crowdsourced reports awaiting confirmation.

### Surfaces & Neutral Architecture
- **Canvas Base:** `#F8FAFC` (Slate 50) provides a soft, low-glare outdoor canvas.
- **Surface Elevation (Cards, Panels):** `#FFFFFF` (Pure White) creates crisp spatial separation from the canvas.
- **Primary Text:** `#0F172A` (Slate 900) ensures a contrast ratio exceeding 13:1 on white surfaces.
- **Secondary / Supporting Text:** `#475569` (Slate 600) strictly maintained above 4.5:1 for annotations and units.
- **Structural Borders:** Subtle interior borders use `#E2E8F0` (Slate 200), transitioning to `#CBD5E1` (Slate 300) for interactive control boundaries and segment dividing strokes.

## Typography

Typography is set exclusively in **Inter** to utilize its neutral grotesque geometry, generous x-height, and extensive OpenType numerical features.

### Readability Principles
- **Strict Size Floor:** Body text never drops below `14px` (`body-md`). Metadata badges and auxiliary tags utilize `12px` / `13px` only in all-caps or semibold weights with elevated tracking to retain legibility under outdoor vibration.
- **Tabular Numerics for Slope Metrics:** All incline percentages (`%`), converted angular calculations (`°`), and distance readouts require `font-variant-numeric: tabular-nums lining-nums`. This prevents layout jitter during real-time GPS telemetry updates and allows vertical comparison across multi-stop elevation profiles.
- **Mathematical Dual-Reporting:** Display slopes consistently as both percentage and degree conversion: e.g., `8.3% (4.7°)`. The converted degree is calculated as `atan(grade / 100)`.

## Layout & Spacing

The layout architecture employs a structured fluid responsive grid optimized for map-centric data displays, bottom-sheet operational flows, and split-view navigation.

### Breakpoints & Canvas Distribution
- **Compact (Mobile: < 640px):** 4-column layout with `1rem` outer margins and `1rem` gutters. Map canvas occupies the baseline viewport, overlaid with swipeable bottom sheets (`max-height: 85vh`) containing route metrics and obstacle reporting.
- **Medium (Tablet: 640px – 1024px):** 8-column layout with `1.5rem` margins and `1.5rem` gutters. Implements a persistent side tray (`380px` fixed width) for route summaries and step-by-step cue sheets, leaving the remainder to the live geospatial view.
- **Expanded (Desktop / Dispatch: > 1024px):** 12-column layout with `2.5rem` margins. Three-zone structure: persistent filter/navigation panel (`360px`), live spatial mapping layer (fluid flex), and persistent barrier inspection inspector (`420px`).

### Ergonomics & Spacing Rhythm
- **The 44px Safe Bounding Box:** All actionable elements—regardless of visible icon size—are padded to meet an immutable `44×44px` physical touch footprint (`min-height: 2.75rem`, `min-width: 2.75rem`).
- **Data Densities:** Internal card padding utilizes `space-md` (`1rem`) on mobile and expands to `space-lg` (`1.5rem`) on desktop panels. List rows enforce a minimum vertical pitch of `56px` to avoid mis-taps by users with motor tremors or while navigating uneven terrain.

## Elevation & Depth

Visual hierarchy relies on crisp surface segmentation, purposeful layering, and minimal ambient diffusion rather than deep dramatic shadows. This ensures crisp edge detection for users with low contrast sensitivity.

### Layer Hierarchy
1. **Base Tier (Ground 0):** Map canvas, background street tiles, and satellite layers set on `#F8FAFC`.
2. **Surface Tier (Layer 1):** Floating controls, telemetry summaries, route comparison cards, and cue cards set on `#FFFFFF` with a `1px` structural outline of `#E2E8F0` and an ultra-subtle ambient drop: `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.06), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`.
3. **Floating Overlays & Drawer Sheets (Layer 2):** Route selection sheets, barrier report cards, and modal sheets use `#FFFFFF` accompanied by a refined high-altitude ambient shadow: `box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.10), 0 8px 10px -6px rgba(15, 23, 42, 0.04)` combined with an explicit `#CBD5E1` boundary.
4. **Critical Interrupts & Emergency Alerts (Layer 3):** Modal barrier warnings and road closure notifications feature an explicit high-contrast edge: `1px solid #0F172A` with an ambient ring: `0 20px 25px -5px rgba(15, 23, 42, 0.20)`.

### Focus States & High Contrast
Any focused interactive node receives an offset keyboard focus boundary: `2px solid #0F766E` with an outer white buffer ring: `box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 4px #0F766E`. Focus indicators are never removed or suppressed.

## Shapes

The design system incorporates a disciplined, balanced curvature philosophy (`roundedness: 2`). This applies a base radius of `0.5rem` (8px), scaling to `1rem` (16px) on interactive panels and modal cards, and `1.5rem` (24px) on pull-sheets.

- **Micro Controls (Inputs, Small Badges, Inline Segment Tags):** `rounded-md` (`0.375rem` / 6px) to maintain structured data density.
- **Standard Controls (Buttons, Inputs, Metric Tiles):** `rounded-lg` (`0.5rem` / 8px).
- **Surface Panels, Route Cards, Modal Dialogs:** `rounded-xl` (`0.75rem` to `1rem` / 12px–16px), providing approachable, modern containment without unnecessary loss of structural corner space.
- **Floating Status Pills & Map Icon Markers:** Full circular/pill geometry (`9999px`) reserved specifically for single-value telemetry chips, location target pins, and directional floating action triggers.

## Components

### Buttons
- **Primary:** Filled `#0F766E` surface, text `#FFFFFF`, bold `14px`, 48px standard height, `rounded-lg` (8px). On `:hover`, background transitions to `#115E59`. On `:active`, scales visually via subtle inward pressure or tint shift.
- **Secondary / Outline:** Background `#FFFFFF`, border `1.5px solid #CBD5E1`, text `#0F172A`. On `:hover`, border shifts to `#0F766E` and surface to `#F0FDFA`.
- **Destructive / Hazard Report:** Background `#B91C1C`, text `#FFFFFF`. Used for instant barrier confirmations (e.g., "Confirm Path Blocked").
- **Touch Standard:** All buttons enforce minimum `min-height: 44px` and `min-width: 44px` with `padding: 0.75rem 1.25rem`.

### Chips & Semantic Status Badges
- Status badges feature a mandatory two-part pattern: a distinct non-color SVG geometric indicator (e.g., checkmark circle, triangle caution, hexagon slash, square question) followed by concise text and tabular numeric grade data.
- **Accessible Segment:** Surface `#D1FAE5`, border `#A7F3D0`, text `#047857`. Icon: filled circle with checkmark.
- **Gradient Caution:** Surface `#FEF3C7`, border `#FDE68A`, text `#B45309`. Icon: equilateral warning triangle.
- **Severe Barrier / Impassable:** Surface `#FEE2E2`, border `#FECACA`, text `#B91C1C`. Icon: octagonal stop or slash badge.
- **Unverified Data:** Surface `#F1F5F9`, border `#E2E8F0`, text `#64748B`. Icon: circle with centered question mark.

### Form Inputs & Step Counters
- **Text & Numeric Inputs:** Height 48px, background `#FFFFFF`, border `1px solid #CBD5E1`, internal text `#0F172A`, font size `16px` (prevents browser auto-zooming on iOS).
- **Slope & Width Adjustment Pickers:** Large counter step buttons (`+` and `-`) sized at `48×48px` to allow easy parameter adjustments (e.g., maximum user incline tolerance: `5%`, `8%`, `10%`) with gross-motor input.

### Checkboxes & Segment Radios
- Minimum dimension `24×24px` centered within a `48×48px` tap footprint.
- Active stroke `#0F766E`, checkmark icon white, border width `2px`. High color-contrast outer ring ensures visibility across map vector backgrounds.

### Route Segment & Barrier Cards
- High-density telemetry cards containing:
  - Route Title (`body-bold`, `16px`).
  - Key Barrier Metrics Strip: Maximum Incline `% (°)`, Minimum Sidewalk Width (e.g., `42 in / 106 cm`), and Surface Type (e.g., "Poured Concrete", "Cobblestone", "Packed Gravel").
  - Surface `#FFFFFF`, border `1px solid #E2E8F0`, corner radius `12px` (`rounded-xl`), internal padding `16px`.
  - Elevation cross-section sparkline showing gradient changes along the route with color-coded segments matching the semantic token palette.

### Barrier Reporting Sheet (Specialized Component)
- Modal panel activated via quick action or location tag.
- Fast-select categorical grid: "No Curb Cut", "Elevator Out", "Steep Slope (>8.3%)", "Surface Damage", "Construction Blockage".
- Large touch-target buttons (`minimum height 56px`), with high-contrast icon-plus-label arrangements. Includes instant geo-coordinate readouts in `tabular-data` style.

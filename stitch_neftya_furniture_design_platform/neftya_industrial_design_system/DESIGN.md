---
name: Neftya Industrial Design System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#44474d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#75777e'
  outline-variant: '#c5c6ce'
  surface-tint: '#4e5f7e'
  primary: '#031632'
  on-primary: '#ffffff'
  primary-container: '#1a2b48'
  on-primary-container: '#8293b5'
  inverse-primary: '#b6c7eb'
  secondary: '#755a26'
  on-secondary: '#ffffff'
  secondary-container: '#fdd798'
  on-secondary-container: '#785c29'
  tertiary: '#06172a'
  on-tertiary: '#ffffff'
  tertiary-container: '#1c2c40'
  on-tertiary-container: '#8393ac'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#b6c7eb'
  on-primary-fixed: '#081b38'
  on-primary-fixed-variant: '#374765'
  secondary-fixed: '#ffdea8'
  secondary-fixed-dim: '#e6c183'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5b4311'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  technical-data:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  max-width: 1440px
---

## Brand & Style

The visual identity of the design system is rooted in **Functional Minimalism** with a technical, CAD-inspired edge. It positions the platform as a professional-grade tool rather than a generic marketplace. The aesthetic balances the warmth of physical craftsmanship with the cold precision of digital engineering.

The UI should evoke the feeling of a well-organized drafting table. This is achieved through a systematic application of whitespace, high-fidelity iconography, and subtle structural indicators like hairline borders and micro-grids. The emotional response is one of "ordered creativity"—where the complexity of manufacturing is tamed by a logical, high-performance interface. Use thin 0.5px lines and dot-grid backgrounds (at low opacity) to reinforce the blueprint aesthetic.

## Colors

The palette is anchored by **Artisan Blue**, a deep navy that conveys stability and technical authority. **Sawdust Gold** serves as a high-intent accent, used sparingly to highlight craftsmanship, active selections, or premium AI insights.

The neutral scale is critical for the "blueprint" feel. We utilize a range of "Technical Greys" (Cool Greys) to differentiate between background layers and UI surfaces. 
- **Surface Primary:** `#F8FAFC` (The drafting paper)
- **Surface Secondary:** `#F1F5F9` (Control panels)
- **Border/Stroke:** `#E2E8F0` (Structural lines)
- **Text Primary:** `#0F172A` (Maximum legibility)

## Typography

The typography system prioritizes clarity and density. **Inter** is the primary typeface for its exceptional legibility and neutral, modern tone. It is used for all interface elements and content.

For technical measurements, specifications, and CAD data, **JetBrains Mono** is introduced. This monospaced font provides the necessary precision for numerical input and engineering notes, reinforcing the "tool" nature of the platform. Use `label-caps` for section headers in sidebars to create a clear structural hierarchy similar to technical documentation.

## Layout & Spacing

The layout follows a **Fixed-Fluid Hybrid Grid**. Sidebars (Layers/Tools) are fixed-width at 280px to maximize the working canvas. The central workspace uses a fluid 12-column grid.

Spacing follows a strict 4px baseline grid to maintain mathematical consistency across the UI. Layout containers should use "Safe Zones" of 40px on desktop to provide a premium, gallery-like feel to furniture renders. Use heavy internal padding in cards (24px+) to prevent technical data from feeling cluttered.

## Elevation & Depth

This design system avoids heavy shadows in favor of **Tonal Layers and Low-Contrast Outlines**. 

- **Level 0 (Canvas):** The base background using a subtle dot-grid pattern.
- **Level 1 (Panels):** Sidebars and toolbars, defined by a 1px solid border (`#E2E8F0`) rather than a shadow.
- **Level 2 (Popovers):** Modals and context menus use an "Ambient Shadow"—an extremely diffused 15% opacity Artisan Blue shadow with a 32px blur—to suggest they are floating above the drafting surface.
- **Active State:** Elements being edited gain a subtle Sawdust Gold outer glow (2px) to denote focus.

## Shapes

The shape language is "Soft-Industrial." We avoid perfectly sharp corners to maintain an approachable modern feel, but keep the radius small (0.25rem / 4px) to remain professional and technical. 

- **Primary Buttons:** Soft (4px) corner radius.
- **Input Fields:** Soft (4px) corner radius.
- **Interactive Nodes (Canvas):** Sharp (0px) to represent exact mathematical points.
- **Containers:** Large layout sections use Soft (4px) borders to maintain a cohesive, "machined" look.

## Components

### Buttons
- **Primary:** Solid Artisan Blue with white text. High-contrast, authoritative.
- **Secondary:** Ghost style. 1px Artisan Blue border, transparent background.
- **Action:** Sawdust Gold is reserved for "Finalize" or "Publish" actions.

### Inputs & Measurement Fields
Inputs should look like data entries in a CAD program. Use a light grey fill (`#F1F5F9`) and a bottom-border only in the idle state, moving to a full Artisan Blue stroke on focus. Append units (mm, cm, in) using JetBrains Mono to the right of the value.

### Cards
Cards are "Technical Specifications." They should feature a top-aligned image, followed by a hairline separator, and then metadata displayed in a 2-column grid format using the `technical-data` type style.

### Breadcrumbs & Status
Use a "Pipeline" style for process tracking (e.g., Design > Material Selection > Manufacturing). Completed steps should use a subtle Artisan Blue tint.

### The AI Assistant (Neftya Autopilot)
The AI component should be represented by a "Glow" effect using a gradient of Artisan Blue to Sawdust Gold. Its inputs are always enclosed in a glassmorphic container (backdrop-blur: 10px) to distinguish AI-generated suggestions from manual inputs.
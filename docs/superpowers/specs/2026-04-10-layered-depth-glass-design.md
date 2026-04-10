# Layered Depth Glass Refresh Design

## Goal

Upgrade the existing glassmorphism UI into a layered-depth visual system without changing page structure, information architecture, or interaction flow.

## Visual Intent

The interface should read as four distinct planes instead of one uniform translucent surface:

1. Background layer: distant atmospheric light field with slow blue, purple, and cyan orb drift.
2. Mid layer: sidebar, top-level shells, and chrome that sit closer to the background with calmer blur and denser fills.
3. Foreground layer: content cards that feel lifted through stronger blur, brighter glass, and hover elevation.
4. Emphasis layer: pure white chips and metric surfaces that clearly sit above the glass panels.

## Scope

### In scope

- Global visual tokens in `src/app/globals.css`
- Workspace shell styling in `src/components/workspace-dashboard.tsx`
- Login/loading surfaces in `src/components/login-screen.tsx`
- Source-level regression coverage for the new visual contract

### Out of scope

- Layout restructuring
- Content changes
- Data flow, API logic, or navigation changes
- New components or feature behavior

## Requirements

### Background layer

- Replace flat body backdrop with the layered orb field treatment.
- Keep three oversized radial orbs in blue, purple, and cyan.
- Maintain slow drift motion at 120 seconds per cycle.
- Ensure the effect remains decorative and non-interactive.

### Mid layer

- Sidebar and shell surfaces use 8px blur and denser translucent backgrounds.
- Borders should visually recede to 0.5px-equivalent lines.
- Active sidebar entries use white text and a 3px white leading indicator, without a filled blue block.

### Foreground layer

- Main cards use 20px blur, bright white glass, and the two-layer outer-shadow plus inner-highlight treatment.
- Hover interactions should lift cards slightly and deepen the shadow.

### Emphasis layer

- Numeric metrics and important status badges use solid white fills with stronger shadows.
- Accent color is limited to one primary blue: `#1a6fd4`.
- Remove multicolor status chips in favor of monochrome or blue-accented emphasis styling.

### Typography and color convergence

- Secondary copy should resolve to the main ink color at 50% opacity instead of separate gray values.
- Existing strong primary text remains dark and legible.

## Implementation Notes

- Reuse and strengthen the existing `depth-*` utility classes rather than introducing a new styling system.
- Refactor repeated dashboard class constants so visual updates apply broadly with small JSX diffs.
- Add source-level tests that lock the sidebar treatment and monochrome badge direction to prevent regression.

## Verification

- Run targeted source tests for the new visual contract.
- Run a production build to confirm the updated classes compile cleanly.
- Start the local dev server so the refreshed UI can be inspected in-browser.

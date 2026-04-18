# Comprehensive Improvements Design

**Date:** 2026-04-17  
**Project:** Webgraphy  
**Scope:** Documentation, type coverage, error handling, testing, mobile responsiveness

---

## Overview

This spec covers 5 major improvements across 4 PRs, prioritized in order of execution:

1. **PR 1:** Shader documentation (comprehensive)
2. **PR 2:** Type coverage improvements (full)
3. **PR 3:** Error boundaries + vitest config
4. **PR 4:** Mobile responsive CSS

All changes are backward-compatible and non-breaking. Existing tests remain valid throughout.

---

## PR 1: Shader Documentation

### Goal
Provide comprehensive documentation of WebGL rendering pipeline with inline comments, design document, and reference guide.

### Files Modified / Created

**Modified:** `src/components/Plot/WebGLRenderer.tsx`
- Add inline comments to `VERTEX_SHADER_SOURCE` explaining:
  - `toScreen()` transform: world space → viewport-relative → screen pixels
  - Why `a_t` and `a_dist_start` attributes exist (segment-based line geometry)
  - Why `gl_PointSize` is set (circle/point rendering)
  - Viewport calculation and padding handling

- Add inline comments to `FRAGMENT_SHADER_SOURCE` explaining:
  - `drawCircle()`: distance field rendering for anti-aliased circles
  - `drawSquare()` / `drawCross()`: shape variants
  - `drawLineSegment()`: dashing algorithm using modulo distance
  - Conditional dispatch by `u_style` uniform

**Created:** `docs/shaders/SHADER_GUIDE.md`
Comprehensive reference (500-800 words) covering:
- Coordinate systems: world space (data domain) → viewport-relative (pan/zoom) → screen pixels (canvas)
- Math: linear interpolation between viewport bounds and screen bounds
- Rendering approach: why segment-based geometry (GPU extrusion) vs. CPU vertex generation
- Shape rendering: SDF for circle, conditional rendering for other shapes
- Dashing: how `v_dist_start` + distance modulo create dash patterns
- Performance: GPU efficiency, why this avoids large vertex buffers for line data

**Created:** `docs/superpowers/specs/2026-04-17-webgl-rendering-design.md`
Design document (300-500 words) covering:
- Architecture: data flow from series → geometry → GPU buffers
- Attributes/uniforms/varyings: what each uniform controls, why attributes are used for per-vertex data
- LTTB downsampling: why largest-triangle-three-buckets is used before GPU rendering
- Color/style dispatch: per-series uniforms for line color, style, thickness
- Viewport transforms: pan/zoom coordinate math in shader

### Success Criteria
- All shader code blocks have clear section headers ("VERTEX SHADER", "FRAGMENT SHADER")
- Every shader function and key variable has at least one comment
- Two documentation files are complete and committed
- No functional changes to WebGL rendering

---

## PR 2: Type Improvements

### Goal
Eliminate `as any` casts and add comprehensive JSDoc hints for complex functions.

### Files Modified

**Modified:** `src/components/Plot/ChartContainer.tsx`
- Replace `as any` casts with proper types:
  - Create `DatasetsByAxisId` type for `dsByX` object
  - Create `SeriesByAxisId` type for `sByX` object
  - Create `XAxisClickTarget` interface for click event target data
  - Remove `.filter(Boolean) as any[]` — use explicit type guards
  - Replace `(target as any).xAxisId` with proper typed event target
- Result: 0 `as any` casts in this file

**Modified:** Core type definitions (in `src/services/persistence.ts` or equivalent)
- Ensure `Dataset`, `SeriesConfig`, `YAxisConfig`, `XAxisConfig` interfaces are complete
- Add missing fields if any are undefined in current types
- Document each field with JSDoc comments

**Modified:** Complex function files (identified via grep)
- `src/components/Plot/ChartContainer.tsx` — add JSDoc to event handlers and render helpers
- `src/utils/coords.ts` — add JSDoc to viewport transform functions
- `src/utils/lttb.ts` — add JSDoc to downsampling logic
- `src/services/export.ts` — add JSDoc to export helpers
- Pattern: `/** @param {Type} name - description */` for parameters, `@returns {Type}` for output

### Success Criteria
- Zero `as any` casts in production code (tests can keep existing mocks as-is)
- All data structure interfaces fully describe their shape
- Complex functions have JSDoc type hints
- Build passes with no type errors
- Existing tests pass without modification

---

## PR 3: Error Boundaries + Vitest Config

### Goal
Add error boundary components for graceful error handling and configure vitest for test execution.

### Files Created

**Created:** `src/components/ErrorBoundary.tsx`
- Class component implementing React's `componentDidCatch`
- Catches errors during render, in lifecycle methods, and in event handlers
- Logs errors with component stack: `console.error('[ErrorBoundary]', error, errorInfo.componentStack)`
- Top-level fallback: simple message + "Reset App" button that calls `window.location.reload()`
- Component-level fallback: "Rendering failed" + close/retry options

**Created:** `vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### Files Modified

**Modified:** `src/App.tsx`
- Wrap `<App>` content in top-level `<ErrorBoundary>`
- Structure: `<ErrorBoundary><YourAppContent /></ErrorBoundary>`

**Modified:** `src/components/Plot/PlotArea.tsx`
- Wrap `<WebGLRenderer>` in component-level `<ErrorBoundary>`
- Catches WebGL initialization errors, rendering failures

**Modified:** `src/components/Layout/Sidebar.tsx`
- Wrap file import/data processing in component-level boundary
- Catches CSV/JSON parsing errors, malformed data

### Success Criteria
- ErrorBoundary component catches React render errors gracefully
- Top-level boundary prevents full app crash
- Component-level boundaries isolate failures
- `npm test` runs all existing tests successfully
- Vitest coverage report generates (even if coverage is low)
- CI can run `npm test` in automation

---

## PR 4: Mobile Responsive CSS

### Goal
Make UI responsive for mobile (375px+) and tablet (768px+) viewports using CSS media queries.

### Files Modified

**Modified:** `src/components/Layout/Sidebar.tsx` styles (or relevant CSS file)
- Add media query for tablet and below (max-width: 768px):
  - Show hamburger menu toggle (already exists, ensure visibility)
  - Reduce sidebar padding from 16px to 8px
  - Stack controls vertically if needed
  - Ensure buttons are ≥44px tall for touch targets

- Add media query for mobile (max-width: 375px):
  - Further reduce padding to 4px
  - Ensure critical buttons remain accessible
  - Use `flex-wrap: wrap` for better text layout

**Modified:** `src/components/Plot/PlotArea.tsx` styles
- Add media query for small screens:
  - Plot area expands to fill available space (no fixed margins)
  - Reduce axis label size on mobile (ensure readability)

**Modified:** Global/component styles (layout CSS)
- Guard hover states: use `@media (hover: hover)` to avoid hover-dependent interactions on touch devices
- Ensure no CSS requires hover for functionality

### Success Criteria
- Viewport at 375px shows all controls without horizontal scroll
- Viewport at 768px shows responsive layout without breaking
- Touch targets (buttons, controls) are ≥44px
- No hover-dependent interactions block mobile users
- Pan/zoom works on touch (already implemented, verify it still works)
- Visual appearance is clean at all breakpoints
- No layout shifts when viewport resizes

---

## Order of Execution

PRs should be merged in order:

1. **PR 1** (shaders) — independent, no blockers
2. **PR 2** (types) — independent, prepares for error boundaries
3. **PR 3** (error boundaries + vitest) — depends on PR 2 types
4. **PR 4** (mobile) — independent, can merge anytime

---

## Testing Strategy

- **PR 1:** Manual inspection of comments and doc files
- **PR 2:** `npm run build` (type checking), existing tests should pass
- **PR 3:** `npm test` runs full vitest suite
- **PR 4:** Manual testing at mobile/tablet/desktop viewports using browser preview

---

## Risk Mitigation

- All changes are non-breaking (backward-compatible)
- Existing tests remain unchanged and must pass
- Error boundaries log to console (no breaking changes to error handling)
- Mobile CSS uses media queries (no JS changes, low risk)
- Type changes are safe (stricter types, no runtime behavior change)

---

## Out of Scope

- Adding new test coverage (existing tests run, new tests can come later)
- Accessibility improvements beyond mobile responsiveness
- Performance profiling or optimization
- Refactoring unrelated code

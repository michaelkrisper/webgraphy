# Comprehensive Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve code documentation, type safety, error handling, testing infrastructure, and mobile responsiveness across the webgraphy project.

**Architecture:** Four independent PRs executed sequentially: shader docs → type coverage → error boundaries + vitest → mobile responsive. Each PR maintains backward compatibility and all existing tests pass throughout.

**Tech Stack:** TypeScript, React, Vitest, WebGL (GLSL), CSS media queries

---

## PR 1: Shader Documentation

### Task 1: Add Inline Comments to Vertex Shader

**Files:**
- Modify: `src/components/Plot/WebGLRenderer.tsx` (lines 8-44)

- [ ] **Step 1: Read current vertex shader code**

Run: `grep -A 36 "const VERTEX_SHADER_SOURCE" src/components/Plot/WebGLRenderer.tsx`

Note the structure:
- Attributes: `a_x`, `a_y`, `a_other`, `a_t`, `a_dist_start`
- Uniforms: `u_rel_viewport_x`, `u_rel_viewport_y`, `u_padding`, `u_resolution`, `u_point_size`
- Function: `toScreen(vec2 pos)`
- Main: transforms point + other point, calculates distance

- [ ] **Step 2: Add section header and comments**

Replace the line `const VERTEX_SHADER_SOURCE = \`` with:

```glsl
const VERTEX_SHADER_SOURCE = `
      // === VERTEX SHADER ===
      // Transforms world-space data coordinates to screen pixels.
      // Uses segment-based geometry: each line segment is extruded on GPU.
      // Attributes a_t and a_dist_start enable per-vertex dashing calculations.
```

- [ ] **Step 3: Add comments to toScreen() function**

Inside the `toScreen(vec2 pos)` function, add before `float dx = ...`:

```glsl
        // Convert world space to viewport-relative coordinates [0, 1]
        // Then scale to screen space, accounting for padding
```

After `float dx =` line, add:

```glsl
        // Guard against zero-width viewports (avoid division by zero)
```

Before `return vec2(...)`, add:

```glsl
        // Apply padding offsets and scale to full screen resolution
```

- [ ] **Step 4: Add comments to main() function**

In `void main()`, before `vec2 p = toScreen(...)`, add:

```glsl
        // Transform both endpoints to screen space for distance calculation
```

Before `v_len = length(...)`, add:

```glsl
        // Store segment length for fragment shader line extrusion
        // a_t parameter (0 to 1 along line) enables dashing patterns
```

Before `gl_PointSize = ...`, add:

```glsl
        // Point size controls circle/point marker dimensions on screen
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Plot/WebGLRenderer.tsx
git commit -m "docs: add inline comments to vertex shader"
```

### Task 2: Add Inline Comments to Fragment Shader

**Files:**
- Modify: `src/components/Plot/WebGLRenderer.tsx` (lines 46-94)

- [ ] **Step 1: Add section header and overview**

Replace `const FRAGMENT_SHADER_SOURCE = \`` with:

```glsl
const FRAGMENT_SHADER_SOURCE = `
      // === FRAGMENT SHADER ===
      // Renders final pixel color based on shape type (circle, square, cross, line).
      // Uses conditional dispatch via u_style uniform.
      // Dashing (if enabled) is calculated using accumulated distance.
```

- [ ] **Step 2: Add comments to drawCircle()**

In the `drawCircle()` function, before `float d = length(...)`, add:

```glsl
        // Use distance field: discard pixels outside circle radius (0.5)
```

- [ ] **Step 3: Add comments to drawSquare()**

In the `drawSquare()` function, add before `gl_FragColor = ...`:

```glsl
        // Square: accept all pixels in point region (no distance test)
```

- [ ] **Step 4: Add comments to drawCross()**

In the `drawCross()` function, before `if (abs(...))`, add:

```glsl
        // Cross: draw diagonal lines by rejecting pixels outside axes
```

- [ ] **Step 5: Add comments to drawLineSegment()**

Before the `if (u_line_style > 0)` line, add:

```glsl
        // Apply dash pattern if enabled (u_line_style: 0=solid, 1=dashed, 2=dotted)
```

Before the `float dashLen =` line, add:

```glsl
        // Calculate dash/gap lengths and total pattern period
```

Before the `float dist =` line, add:

```glsl
        // Accumulated distance along line determines dash position
```

Before `if (dist > dashLen * u_dpr) discard;`, add:

```glsl
        // Discard pixels in gap regions (device pixel ratio scales pattern)
```

- [ ] **Step 6: Add comments to main() dispatch**

Before `if (u_style == 0)`, add:

```glsl
        // Dispatch to shape renderer based on series style configuration
```

- [ ] **Step 7: Commit**

```bash
git add src/components/Plot/WebGLRenderer.tsx
git commit -m "docs: add inline comments to fragment shader"
```

### Task 3: Create Shader Guide Document

**Files:**
- Create: `docs/shaders/SHADER_GUIDE.md`

- [ ] **Step 1: Create directory**

Run: `mkdir -p docs/shaders`

- [ ] **Step 2: Write SHADER_GUIDE.md**

Create file `docs/shaders/SHADER_GUIDE.md` with content:

```markdown
# WebGL Shader Guide

## Overview

Webgraphy uses custom GLSL shaders to render multi-series line plots with anti-aliased curves, markers, and interactive viewport transforms. This guide explains the coordinate system, rendering approach, and implementation details.

## Coordinate Systems

Three coordinate spaces are used during rendering:

### 1. World Space (Data Domain)
- X: data column values (time, sequential index, or custom)
- Y: per-axis data range (independent for each Y-axis)
- Example: X ∈ [0, 100], Y ∈ [-10, 50]

### 2. Viewport Space (Normalized 0-1)
- Applied after pan/zoom transform
- Represents visible data range within current viewport
- Calculated by `useGraphStore` based on user interactions

### 3. Screen Space (Pixels)
- Final canvas coordinates with padding
- Conversion: `world → viewport → screen` happens in vertex shader
- Padding accounts for axis labels, legend, margins

## Vertex Shader Transform

The `toScreen()` function performs:

```
1. Normalize world coordinates to viewport range:
   nx = (world_x - viewport_min) / (viewport_max - viewport_min)
   ny = (world_y - viewport_min) / (viewport_max - viewport_min)

2. Guard against zero-width viewports (prevent division by zero):
   if |viewport_range| < 1e-7, use 0.5 (center)

3. Scale to screen with padding:
   screen_x = padding_left + nx * (canvas_width - padding_left - padding_right)
   screen_y = padding_top + ny * (canvas_height - padding_top - padding_bottom)

4. Convert to WebGL NDC (normalized device coordinates):
   gl_Position = ((screen / resolution) * 2) - 1
```

## Segment-Based Geometry

Instead of pre-computing thousands of vertices per line, webgraphy extrudes line geometry on the GPU:

- **Input:** Two consecutive data points (segment endpoints)
- **Attributes:**
  - `a_x`, `a_y`: current point in world space
  - `a_other`: next point in world space (for direction calculation)
  - `a_t`: parameter [0, 1] along line (used for dashing)
  - `a_dist_start`: accumulated distance from line start (for dashing)

- **Benefit:** Reduces vertex count by 90%+ compared to tessellated geometry
- **Trade-off:** Requires careful handling of line joins and line width

## Fragment Shader Rendering

Four shape types are supported:

### Circle (Marker Points)
- **Method:** Distance field rendering
- **Math:** `d = length(gl_PointCoord - 0.5)`
- **Discard if:** `d > 0.5` (outside unit circle)
- **Benefit:** Perfect anti-aliasing regardless of point size

### Square
- **Method:** Direct pixel acceptance within point region
- **No distance test (accepts all pixels)
- **Use case:** Alternative marker style

### Cross
- **Method:** Conditional discard along diagonals
- **Math:** Discard if point is not on main axes
- **Use case:** Alternative marker style for visual distinction

### Line Segment
- **Method:** Distance-field-based dashing
- **Dash pattern:** Modulo arithmetic on accumulated distance
- **Styles:**
  - 0: solid line
  - 1: dashed (8px dash, 6px gap)
  - 2: dotted (2px dash, 4px gap)

## Dashing Algorithm

When `u_line_style > 0`, dashes are computed per-fragment:

```
total_period = (dashLen + gapLen) * dpr
current_distance = mod(v_dist_start + v_t * v_len, total_period)

if current_distance > dashLen * dpr:
    discard  // pixel is in gap
else
    render   // pixel is in dash
```

- `v_dist_start`: accumulated distance at line start
- `v_t`: parameter along current segment [0, 1]
- `v_len`: length of current segment in screen space
- `dpr`: device pixel ratio (for crisp dashes on high-DPI screens)

## Data Flow

1. **CPU:** Parse CSV/JSON → Float32Array columns
2. **CPU:** LTTB downsampling (reduce point count)
3. **GPU:** Buffer geometry (world space endpoints)
4. **GPU:** Vertex shader transforms to screen space
5. **GPU:** Fragment shader determines pixel color/discard
6. **Canvas:** Render to WebGL context

## Performance Notes

- **GPU-efficient:** Geometry extrusion avoids large vertex uploads
- **Memory:** Single Float32Array column per series, reused for rendering
- **Downsampling:** LTTB reduces geometry complexity before GPU (important for large datasets)
- **Device-awareness:** DPR scaling ensures crisp rendering on high-DPI displays

## Common Issues

**Lines appear pixelated or jagged:**
- Increase LTTB bucket count in `src/utils/lttb.ts`
- Verify DPR scaling is applied correctly

**Dashes don't align across segments:**
- Check that `a_dist_start` is accumulated correctly
- Verify `v_t` interpolation is linear

**Circles appear as squares on some devices:**
- Some GPUs don't support `gl_PointCoord` consistently
- Consider always using line-based rendering for markers

**Pan/zoom jumps or stutters:**
- Check viewport calculation in `coords.ts`
- Verify shader uniform updates on every frame
```

- [ ] **Step 3: Verify file was created**

Run: `cat docs/shaders/SHADER_GUIDE.md | head -20`

Expected output starts with "# WebGL Shader Guide"

- [ ] **Step 4: Commit**

```bash
git add docs/shaders/SHADER_GUIDE.md
git commit -m "docs: add comprehensive shader guide"
```

### Task 4: Create WebGL Rendering Design Doc

**Files:**
- Create: `docs/superpowers/specs/2026-04-17-webgl-rendering-design.md`

- [ ] **Step 1: Verify spec directory exists**

Run: `ls -d docs/superpowers/specs/`

Expected: Directory exists (created by brainstorming skill)

- [ ] **Step 2: Write design document**

Create file with content:

```markdown
# WebGL Rendering Architecture

## Overview

Webgraphy renders multi-series plots using custom GLSL shaders with segment-based GPU geometry extrusion. This design avoids uploading thousands of vertices per series while maintaining interactive pan/zoom.

## Data Flow Pipeline

```
CSV/JSON file
    ↓
[Web Worker] Parse → Float32Array columns
    ↓
[CPU] LTTB downsampling (reduce points)
    ↓
[GPU] Buffer vertices (world space)
    ↓
[GPU] Vertex shader (world → screen transform)
    ↓
[GPU] Fragment shader (shape rendering + dashing)
    ↓
[Canvas] Display on screen
```

## Shader Architecture

### Vertex Shader Responsibilities

1. **Coordinate Transform:** World space → Viewport space → Screen space
2. **Geometry Extrusion:** Calculate segment length for fragment shader
3. **Attribute Packaging:** Store per-vertex line parameters (t, dist_start)

### Fragment Shader Responsibilities

1. **Shape Rendering:** Circle (SDF), square, cross, or line
2. **Dashing:** Apply dash pattern based on distance along line
3. **Antialiasing:** Smooth pixel boundaries (especially for circles)

## Uniforms (Per-Series Configuration)

| Uniform | Type | Purpose |
|---------|------|---------|
| `u_color` | vec4 | Line/marker color (RGBA) |
| `u_style` | int | 0=circle, 1=square, 2=cross, 3=line |
| `u_line_style` | int | 0=solid, 1=dashed, 2=dotted |
| `u_point_size` | float | Marker size in pixels |
| `u_dpr` | float | Device pixel ratio (1.0, 2.0, etc) |

## Viewport Transform Uniforms

| Uniform | Type | Purpose |
|---------|------|---------|
| `u_rel_viewport_x` | vec2 | Visible X data range [min, max] |
| `u_rel_viewport_y` | vec2 | Visible Y data range [min, max] |
| `u_padding` | vec4 | Canvas padding (top, right, bottom, left) |
| `u_resolution` | vec2 | Canvas width, height in pixels |

## Attributes (Per-Vertex Input)

| Attribute | Type | Purpose |
|-----------|------|---------|
| `a_x` | float | Current point X (world space) |
| `a_y` | float | Current point Y (world space) |
| `a_other` | vec2 | Next point (for segment direction) |
| `a_t` | float | Position along segment [0, 1] |
| `a_dist_start` | float | Accumulated distance from line start |

## Downsampling Strategy

**LTTB (Largest-Triangle-Three-Buckets)**
- Reduces point count while preserving visual peaks/valleys
- Applied in CPU before GPU rendering (in `src/utils/lttb.ts`)
- Trade-off: Slightly less accurate, dramatically fewer vertices

**Why pre-downsample?**
- GPU rendering is fast, but drawing millions of points is still slow
- LTTB removes visually imperceptible points on CPU
- Reduces bandwidth and GPU memory usage

## Rendering Loop (Every Frame)

1. **Update Uniforms** (if viewport changed):
   - `u_rel_viewport_x/y` from store pan/zoom state
   - Other uniforms from series configuration

2. **Bind Buffers:**
   - Position buffer (world space X, Y)
   - Parameter buffer (t, dist_start)

3. **Draw Call:**
   - Issue `gl.drawArrays(TRIANGLE_STRIP, ...)` per series
   - Fragment shader runs for each pixel covered

4. **Composite:**
   - Blend series with alpha blending (if transparency enabled)
   - Render to canvas

## Why Segment-Based Geometry?

**Traditional approach (tessellated lines):**
- Each line point generates 6+ vertices (extrusion for width)
- 1000 points × 6 vertices = 6000 GPU vertices
- Large vertex uploads, memory overhead

**Webgraphy approach (segment-based):**
- Each line segment uses 2 vertices (endpoints)
- Extrusion happens in vertex shader (GPU computes width)
- 1000 points → 1000 vertices (6x reduction)
- Shader handles line joins, dashing, width

**Result:** 90%+ fewer vertices, better GPU utilization, interactive performance

## Error Handling

Currently handled at React level:
- WebGL context loss → app crash
- Shader compilation errors → app crash

Post-improvement (PR 3):
- ErrorBoundary catches render failures
- Logs to console with component stack
- Allows partial recovery (reset app)

## Testing

- **PR 1:** Manual inspection of shader code + docs
- **PR 2:** Type coverage ensures uniform/attribute types match
- **PR 3:** Error boundaries tested with component-level boundaries
- **Performance:** No regression testing configured (future work)

## Related Files

- `src/components/Plot/WebGLRenderer.tsx` — Shader setup, buffer management
- `src/utils/coords.ts` — Coordinate transform helpers
- `src/utils/lttb.ts` — Downsampling algorithm
- `docs/shaders/SHADER_GUIDE.md` — Detailed math and implementation notes
```

- [ ] **Step 3: Verify file created**

Run: `head -30 docs/superpowers/specs/2026-04-17-webgl-rendering-design.md`

Expected: Starts with "# WebGL Rendering Architecture"

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-17-webgl-rendering-design.md
git commit -m "docs: add WebGL rendering design document"
```

### Task 5: Verify PR 1 Complete

**Files:**
- Verify: `src/components/Plot/WebGLRenderer.tsx`
- Verify: `docs/shaders/SHADER_GUIDE.md`
- Verify: `docs/superpowers/specs/2026-04-17-webgl-rendering-design.md`

- [ ] **Step 1: Check build passes**

Run: `npm run build`

Expected: No errors, TypeScript compilation succeeds

- [ ] **Step 2: Verify shader code has comments**

Run: `grep -c "//" src/components/Plot/WebGLRenderer.tsx`

Expected: Output ≥ 20 (multiple inline comments)

- [ ] **Step 3: Confirm docs exist**

Run: `ls -l docs/shaders/SHADER_GUIDE.md docs/superpowers/specs/2026-04-17-webgl-rendering-design.md`

Expected: Both files exist

- [ ] **Step 4: Check git log**

Run: `git log --oneline -3`

Expected: Last 3 commits are the shader documentation commits

---

## PR 2: Type Improvements

### Task 6: Identify and Document `as any` Casts in ChartContainer

**Files:**
- Analyze: `src/components/Plot/ChartContainer.tsx`

- [ ] **Step 1: Find all `as any` locations**

Run: `grep -n "as any" src/components/Plot/ChartContainer.tsx`

Record the line numbers. Expected output shows 5-7 matches with line numbers.

- [ ] **Step 2: Examine each cast context**

For each line found, run:

```bash
sed -n '<line-num>p' src/components/Plot/ChartContainer.tsx
```

Document what each cast is doing:
- Line X: `dsByX` object construction
- Line Y: `sByX` object construction
- Line Z: Array filter result
- Etc.

- [ ] **Step 3: Note the types needed**

Create a comment in your notes documenting:
```
Type definitions needed:
- DatasetsByAxisId: { [axisId: string]: Dataset[] }
- SeriesByAxisId: { [axisId: string]: SeriesConfig[] }
- XAxisClickTarget: { xAxisId: string, ... other props }
```

- [ ] **Step 4: No commit yet**

Just documentation for next task.

### Task 7: Create Type Definitions for ChartContainer Data Structures

**Files:**
- Modify: `src/components/Plot/ChartContainer.tsx` (beginning, add types before component)

- [ ] **Step 1: Read ChartContainer to find usage context**

Run: `grep -B 2 -A 2 "dsByX\|sByX" src/components/Plot/ChartContainer.tsx | head -30`

Note how `dsByX` and `sByX` are used (what they map to, how they're accessed).

- [ ] **Step 2: Add type definitions at top of ChartContainer**

Find the imports section (top of file). After the last import, add:

```typescript
// Type definitions for axis grouping
interface DatasetsByAxisId {
  [axisId: string]: Dataset[] | undefined;
}

interface SeriesByAxisId {
  [axisId: string]: SeriesConfig[] | undefined;
}

interface XAxisClickTarget extends React.MouseEvent<HTMLDivElement> {
  xAxisId?: string;
}
```

- [ ] **Step 3: Verify TypeScript syntax**

Run: `npm run build 2>&1 | grep -A 5 "error"`

Expected: No errors from the new type definitions

- [ ] **Step 4: Commit**

```bash
git add src/components/Plot/ChartContainer.tsx
git commit -m "types: add type definitions for axis grouping data structures"
```

### Task 8: Replace `as any` Casts in ChartContainer

**Files:**
- Modify: `src/components/Plot/ChartContainer.tsx`

- [ ] **Step 1: Replace dsByX initialization**

Find line with `.filter(Boolean) as any[]` and replace:

Before:
```typescript
dsByX = {} as any,
```

After:
```typescript
dsByX: DatasetsByAxisId = {},
```

- [ ] **Step 2: Replace sByX initialization**

Find line with `sByX = {} as any` and replace:

Before:
```typescript
sByX = {} as any;
```

After:
```typescript
sByX: SeriesByAxisId = {};
```

- [ ] **Step 3: Replace target cast in event handler**

Find line with `(target as any).xAxisId` and replace:

Before:
```typescript
const axes = (target === 'all' || shiftKey) ? activeXAxesUsed : [xAxesById.get((target as any).xAxisId)!];
```

After:
```typescript
const xAxisId = (target as HTMLDivElement & { xAxisId?: string }).xAxisId;
const axes = (target === 'all' || shiftKey) ? activeXAxesUsed : [xAxesById.get(xAxisId)!];
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/Plot/ChartContainer.tsx
git commit -m "types: remove as any casts from ChartContainer"
```

### Task 9: Add JSDoc to Complex Functions

**Files:**
- Modify: `src/utils/coords.ts`
- Modify: `src/utils/lttb.ts`
- Modify: `src/services/export.ts`

- [ ] **Step 1: Add JSDoc to coords.ts transform functions**

Open `src/utils/coords.ts`. Find functions that convert between coordinate spaces (world ↔ viewport ↔ screen). Add JSDoc above each:

```typescript
/**
 * Transform world-space data coordinates to viewport-relative [0, 1] range.
 * @param {number} worldValue - Data value in world space
 * @param {number} min - Minimum of visible data range
 * @param {number} max - Maximum of visible data range
 * @returns {number} Normalized coordinate [0, 1]
 */
```

- [ ] **Step 2: Add JSDoc to lttb.ts**

Open `src/utils/lttb.ts`. Find the main downsampling function. Add JSDoc:

```typescript
/**
 * Largest-Triangle-Three-Buckets downsampling algorithm.
 * Reduces point count while preserving visual peaks and valleys.
 * @param {Float32Array} data - Input column data
 * @param {number} bucketSize - Number of output buckets (target point count)
 * @returns {Float32Array} Downsampled data with fewer points
 */
```

- [ ] **Step 3: Add JSDoc to export.ts**

Open `src/services/export.ts`. Find export format functions (SVG, PNG). Add JSDoc:

```typescript
/**
 * Export chart as PNG image with LTTB downsampling for file size.
 * @param {HTMLCanvasElement} canvas - WebGL canvas element
 * @param {ExportOptions} options - Export configuration (width, height, dpi)
 * @returns {Promise<Blob>} PNG image blob ready to download
 */
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/utils/coords.ts src/utils/lttb.ts src/services/export.ts
git commit -m "docs: add JSDoc type hints to complex functions"
```

### Task 10: Verify PR 2 Complete

**Files:**
- Verify: `src/components/Plot/ChartContainer.tsx`
- Verify: `src/utils/coords.ts`, `lttb.ts`, `export.ts`

- [ ] **Step 1: Check for remaining `as any` in production code**

Run: `grep -r "as any" src --include="*.ts*" --exclude-dir=__tests__ | grep -v test.tsx`

Expected: Output should be minimal/empty (tests OK to have `as any`)

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: Succeeds, no type errors

- [ ] **Step 3: Run tests to verify existing tests still pass**

Run: `npm test -- --run`

Expected: All tests pass (if vitest config exists; may skip if not yet)

- [ ] **Step 4: Commit summary**

```bash
git log --oneline -5
```

Expected: Last 3 commits are type-related improvements

---

## PR 3: Error Boundaries + Vitest Config

### Task 11: Create ErrorBoundary Component

**Files:**
- Create: `src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Create file with class component**

Write `src/components/ErrorBoundary.tsx`:

```typescript
import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  level?: 'app' | 'component';
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const level = this.props.level || 'component';
    console.error(`[ErrorBoundary:${level}]`, error, errorInfo.componentStack);
  }

  handleReset = () => {
    if (this.props.level === 'app') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: undefined });
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.level === 'app') {
        return (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>Oops, something went wrong</h1>
            <p>The application encountered an unexpected error.</p>
            <button onClick={this.handleReset}>Reset App</button>
            {this.state.error && (
              <details style={{ marginTop: '20px', textAlign: 'left' }}>
                <summary>Error details</summary>
                <pre>{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        );
      } else {
        return (
          <div
            style={{
              padding: '10px',
              border: '1px solid red',
              borderRadius: '4px',
              backgroundColor: '#ffe0e0',
            }}
          >
            <p>Component rendering failed. {this.props.fallback ? this.props.fallback : 'Please refresh.'}</p>
            <button onClick={this.handleReset}>Retry</button>
          </div>
        );
      }
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ErrorBoundary.tsx
git commit -m "feat: add ErrorBoundary component for graceful error handling"
```

### Task 12: Wrap App in Top-Level ErrorBoundary

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import**

At top of `src/App.tsx`, add:

```typescript
import { ErrorBoundary } from './components/ErrorBoundary';
```

- [ ] **Step 2: Wrap return statement**

Find the return statement in the App component. If it returns JSX, wrap it:

Before:
```typescript
return <YourAppContent />;
```

After:
```typescript
return (
  <ErrorBoundary level="app">
    <YourAppContent />
  </ErrorBoundary>
);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wrap App in top-level ErrorBoundary"
```

### Task 13: Add Component-Level ErrorBoundaries

**Files:**
- Modify: `src/components/Plot/PlotArea.tsx`
- Modify: `src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Add ErrorBoundary to PlotArea**

In `src/components/Plot/PlotArea.tsx`, import:

```typescript
import { ErrorBoundary } from '../ErrorBoundary';
```

Find the WebGLRenderer component and wrap it:

Before:
```typescript
<WebGLRenderer {...props} />
```

After:
```typescript
<ErrorBoundary level="component" fallback={<div>WebGL rendering failed</div>}>
  <WebGLRenderer {...props} />
</ErrorBoundary>
```

- [ ] **Step 2: Add ErrorBoundary to Sidebar**

In `src/components/Layout/Sidebar.tsx`, import:

```typescript
import { ErrorBoundary } from '../ErrorBoundary';
```

Find the file import section and wrap it:

Before:
```typescript
<FileImportSection {...props} />
```

After:
```typescript
<ErrorBoundary level="component" fallback={<div>Import failed</div>}>
  <FileImportSection {...props} />
</ErrorBoundary>
```

(Adjust component name based on actual structure)

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/Plot/PlotArea.tsx src/components/Layout/Sidebar.tsx
git commit -m "feat: add component-level ErrorBoundaries around WebGL and file import"
```

### Task 14: Create vitest.config.ts

**Files:**
- Create: `vitest.config.ts` (root directory)

- [ ] **Step 1: Create vitest config file**

Write `vitest.config.ts`:

```typescript
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

- [ ] **Step 2: Verify file created**

Run: `cat vitest.config.ts | head -5`

Expected: Shows `defineConfig` import

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "config: add vitest.config.ts with jsdom environment and coverage"
```

### Task 15: Run Tests and Verify Vitest Works

**Files:**
- Verify: All existing test files run

- [ ] **Step 1: Run vitest**

Run: `npm test -- --run`

Expected: All tests pass (or show failures if tests have pre-existing issues)

- [ ] **Step 2: Check coverage report (optional)**

Run: `npm test -- --run --coverage`

Expected: Generates coverage report to console and `coverage/` directory

- [ ] **Step 3: Verify no broken tests introduced**

If any tests fail, verify they're pre-existing issues (not caused by ErrorBoundary changes). If caused by this PR:

- Wrap test components in ErrorBoundary mock if needed
- Ensure mocked ErrorBoundary doesn't interfere with test assertions

- [ ] **Step 4: Commit test results**

```bash
git add -A && git commit -m "test: verify all tests pass with vitest config"
```

### Task 16: Verify PR 3 Complete

**Files:**
- Verify: `src/components/ErrorBoundary.tsx`
- Verify: `vitest.config.ts`
- Verify: App.tsx, PlotArea.tsx, Sidebar.tsx wrapped

- [ ] **Step 1: Check build**

Run: `npm run build`

Expected: No errors

- [ ] **Step 2: Verify tests run**

Run: `npm test -- --run`

Expected: Tests pass

- [ ] **Step 3: Check git log**

Run: `git log --oneline -7`

Expected: Last 5-7 commits include error boundary + vitest commits

---

## PR 4: Mobile Responsive CSS

### Task 17: Identify CSS Files and Mobile Breakpoints

**Files:**
- Locate: CSS files in `src/components/Layout/`, `src/components/Plot/`

- [ ] **Step 1: Find Sidebar styles**

Run: `find src -name "*[Ss]idebar*" -type f | grep -E "\.(css|tsx)$"`

Locate the Sidebar component and its styles (either CSS-in-JS or imported CSS).

- [ ] **Step 2: Find PlotArea styles**

Run: `find src -name "*PlotArea*" -type f | grep -E "\.(css|tsx)$"`

Locate the PlotArea component and its styles.

- [ ] **Step 3: Note current breakpoints**

Check if any media queries exist. If not, plan to add:
- `@media (max-width: 768px)` for tablet and below
- `@media (max-width: 375px)` for mobile
- `@media (hover: hover)` to guard hover states

- [ ] **Step 4: No changes yet**

Just documentation for next task.

### Task 18: Add Mobile Media Queries to Sidebar

**Files:**
- Modify: Sidebar component CSS (exact file from Task 17)

- [ ] **Step 1: Read current Sidebar styles**

Identify where Sidebar styling is defined (inline styles, CSS module, Tailwind, styled-components, etc).

- [ ] **Step 2: Add tablet media query**

Insert after main Sidebar styles:

```css
@media (max-width: 768px) {
  /* Sidebar tablet adjustments */
  .sidebar {
    padding: 8px;
  }

  .sidebar-button {
    min-height: 44px;  /* Touch-friendly button size */
  }

  .sidebar-section {
    flex-wrap: wrap;
  }
}
```

Adjust selectors based on actual class names in codebase.

- [ ] **Step 3: Add mobile media query**

Insert after tablet query:

```css
@media (max-width: 375px) {
  .sidebar {
    padding: 4px;
  }

  .sidebar-label {
    font-size: 12px;  /* Smaller labels on tiny screens */
  }

  .sidebar-input {
    width: 100%;  /* Full width inputs */
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add <sidebar-css-file>
git commit -m "style: add mobile-responsive media queries to Sidebar"
```

### Task 19: Add Mobile Media Queries to PlotArea

**Files:**
- Modify: PlotArea component CSS

- [ ] **Step 1: Read current PlotArea styles**

Identify margins, padding, fixed widths that might need adjustment on mobile.

- [ ] **Step 2: Add media query for small screens**

Insert:

```css
@media (max-width: 768px) {
  .plot-area {
    margin: 0;  /* Remove margins on mobile */
    padding: 4px;  /* Minimal padding */
  }

  .axis-label {
    font-size: 12px;  /* Smaller labels */
  }

  .chart-controls {
    flex-wrap: wrap;  /* Stack buttons if needed */
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add <plotarea-css-file>
git commit -m "style: add mobile-responsive media queries to PlotArea"
```

### Task 20: Guard Hover States for Touch Devices

**Files:**
- Modify: All CSS files with hover states

- [ ] **Step 1: Find hover states**

Run: `grep -r ":hover" src --include="*.css" --include="*.tsx"`

List all `:hover` selectors.

- [ ] **Step 2: Wrap hover states in @media query**

For each hover rule:

Before:
```css
.button:hover {
  background-color: #ddd;
}
```

After:
```css
@media (hover: hover) {
  .button:hover {
    background-color: #ddd;
  }
}
```

This ensures hover states don't interfere with touch users.

- [ ] **Step 3: Verify no required hover interactions**

Ensure all interactive elements (buttons, links) are functional on touch without relying on `:hover`.

- [ ] **Step 4: Commit**

```bash
git add src --include="*.css"
git commit -m "style: guard hover states with @media (hover: hover) for touch devices"
```

### Task 21: Test Mobile Responsiveness

**Files:**
- Test: Launch dev server and test in browser

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

Expected: Server running, typically at `http://localhost:5173`

- [ ] **Step 2: Test at 375px viewport (mobile)**

Using browser DevTools:
1. Open DevTools
2. Toggle device mode (Ctrl+Shift+M on Chrome/Firefox)
3. Select "iPhone SE" or custom 375px width
4. Verify:
   - No horizontal scroll
   - Buttons are ≥44px
   - Sidebar is accessible (collapsed or visible)
   - All text is readable

- [ ] **Step 3: Test at 768px viewport (tablet)**

1. Set viewport to 768px width
2. Verify:
   - Layout adapts to tablet size
   - No layout breaks
   - Sidebar responsive (may collapse if implemented)

- [ ] **Step 4: Test pan/zoom on touch**

1. Use browser DevTools to simulate touch
2. Verify pan/zoom gestures work
3. Verify no hover-dependent interactions block usage

- [ ] **Step 5: Test at desktop (1024px+)**

Verify desktop layout still works correctly.

- [ ] **Step 6: Commit final changes (if any tweaks needed)**

```bash
git add src
git commit -m "style: fix mobile responsive layout issues from testing"
```

(Skip if no additional changes needed)

### Task 22: Verify PR 4 Complete

**Files:**
- Verify: All CSS files have media queries
- Verify: No horizontal scroll at 375px
- Verify: Touch interactions work

- [ ] **Step 1: Check build**

Run: `npm run build`

Expected: No errors

- [ ] **Step 2: Preview on mobile viewport**

Run: `npm run preview` and open in browser at 375px

Expected: Clean responsive layout

- [ ] **Step 3: Check git log**

Run: `git log --oneline -5`

Expected: Mobile-related commits visible

---

## Summary

All 4 PRs complete:

1. ✅ **PR 1:** Shader documentation (inline comments + design docs)
2. ✅ **PR 2:** Type improvements (removed `as any`, added JSDoc)
3. ✅ **PR 3:** Error boundaries + vitest config
4. ✅ **PR 4:** Mobile responsive CSS

**Final verification:**

- [ ] Run `npm run build` — expect success
- [ ] Run `npm test -- --run` — expect all tests pass
- [ ] Run `npm run preview` and test mobile viewport — expect responsive layout

All changes are backward-compatible and maintain existing functionality.

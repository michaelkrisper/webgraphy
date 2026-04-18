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

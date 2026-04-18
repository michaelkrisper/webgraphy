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

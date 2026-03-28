# High-Quality Line Drawing (SDF Capsules) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a robust WebGL line renderer using SDF capsules for perfect round joins and extreme bends.

**Architecture:** Use a single-pass shader that renders expanded quads for each segment. The fragment shader calculates the distance to the segment (SDF) to determine pixel coverage and antialiasing.

**Tech Stack:** React, TypeScript, WebGL.

---

### Task 1: Update WebGL Shaders

**Files:**
- Modify: `src/components/Plot/WebGLRenderer.tsx:30-110` (approximate shader definitions)

- [ ] **Step 1: Replace line vertex shader**
Update `vsLine` to handle segment-based expansion with `a_uv`.

```glsl
attribute vec2 a_posA;
attribute vec2 a_posB;
attribute vec2 a_uv;

uniform vec2 u_viewport_x;
uniform vec2 u_viewport_y;
uniform vec4 u_padding;
uniform vec2 u_resolution;
uniform float u_thickness;

varying vec2 v_screenA;
varying vec2 v_screenB;
varying vec2 v_screenPos;

vec2 toScreen(vec2 worldPos) {
    float xRange = max(1e-6, u_viewport_x.y - u_viewport_x.x);
    float yRange = max(1e-6, u_viewport_y.y - u_viewport_y.x);
    float nx = (worldPos.x - u_viewport_x.x) / xRange;
    float ny = (worldPos.y - u_viewport_y.x) / yRange;
    float chartWidth = max(0.0, u_resolution.x - u_padding.w - u_padding.y);
    float chartHeight = max(0.0, u_resolution.y - u_padding.x - u_padding.z);
    return vec2(u_padding.w + nx * chartWidth, u_padding.z + ny * chartHeight);
}

void main() {
    v_screenA = toScreen(a_posA);
    v_screenB = toScreen(a_posB);
    
    vec2 dir = v_screenB - v_screenA;
    float len = length(dir);
    vec2 unitDir = (len > 1e-6) ? dir / len : vec2(1.0, 0.0);
    vec2 unitNormal = vec2(-unitDir.y, unitDir.x);
    
    float radius = u_thickness * 0.5 + 1.0; // Extra pixel for AA
    
    // a_uv: x in [-1, 1] (along segment), y in [-1, 1] (across segment)
    // Map x=-1 to screenA - radius*unitDir, x=1 to screenB + radius*unitDir
    // Map y=-1 to -radius*unitNormal, y=1 to radius*unitNormal
    
    vec2 base = (a_uv.x < 0.0) ? v_screenA : v_screenB;
    vec2 pos = base + unitDir * a_uv.x * radius + unitNormal * a_uv.y * radius;
    
    v_screenPos = pos;
    gl_Position = vec4((pos / u_resolution * 2.0) - 1.0, 0, 1);
}
```

- [ ] **Step 2: Replace line fragment shader**
Update `fsSource` to implement SDF capsule math.

```glsl
precision mediump float;
uniform vec4 u_color;
uniform float u_thickness;

varying vec2 v_screenA;
varying vec2 v_screenB;
varying vec2 v_screenPos;

void main() {
    vec2 P = v_screenPos;
    vec2 A = v_screenA;
    vec2 B = v_screenB;
    
    vec2 AB = B - A;
    float lenSq = max(dot(AB, AB), 1e-6);
    float t = clamp(dot(P - A, AB) / lenSq, 0.0, 1.0);
    vec2 projection = A + AB * t;
    float d = length(P - projection);
    
    float alpha = 1.0 - smoothstep(u_thickness * 0.5 - 0.5, u_thickness * 0.5 + 0.5, d);
    if (alpha <= 0.0) discard;
    
    gl_FragColor = vec4(u_color.rgb, u_color.a * alpha);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Plot/WebGLRenderer.tsx
git commit -m "feat: implement SDF capsule shaders for high-quality lines"
```

---

### Task 2: Update Buffer Generation

**Files:**
- Modify: `src/components/Plot/WebGLRenderer.tsx:145-185` (buffer creation loop)

- [ ] **Step 1: Update buffer structure**
Change `lineData` to hold 6 vertices per segment (2 triangles) with `a_posA`, `a_posB`, and `a_uv`.

```typescript
const lineData = new Float32Array((ds.rowCount - 1) * 6 * 6); // 6 vertices * 6 floats (posA.xy, posB.xy, uv.xy)
let vIdx = 0;
for (let i = 0; i < ds.rowCount - 1; i++) {
  const ax = xData[i], ay = yData[i];
  const bx = xData[i+1], by = yData[i+1];
  
  const addVertex = (ux: number, uy: number) => {
    lineData[vIdx++] = ax; lineData[vIdx++] = ay;
    lineData[vIdx++] = bx; lineData[vIdx++] = by;
    lineData[vIdx++] = ux; lineData[vIdx++] = uy;
  };

  // Triangle 1
  addVertex(-1, -1); addVertex(1, -1); addVertex(-1, 1);
  // Triangle 2
  addVertex(-1, 1); addVertex(1, -1); addVertex(1, 1);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Plot/WebGLRenderer.tsx
git commit -m "feat: update buffer generation for quad-based SDF lines"
```

---

### Task 3: Update Render Loop and Cleanup

**Files:**
- Modify: `src/components/Plot/WebGLRenderer.tsx:200-260` (render loop)

- [ ] **Step 1: Update attribute pointers**
Configure `gl.vertexAttribPointer` for `a_posA`, `a_posB`, and `a_uv`.

```typescript
const aPosA = gl.getAttribLocation(lProg, 'a_posA');
const aPosB = gl.getAttribLocation(lProg, 'a_posB');
const aUV = gl.getAttribLocation(lProg, 'a_uv');
gl.enableVertexAttribArray(aPosA);
gl.enableVertexAttribArray(aPosB);
gl.enableVertexAttribArray(aUV);
// 6 floats * 4 bytes = 24 stride
gl.vertexAttribPointer(aPosA, 2, gl.FLOAT, false, 24, 0);
gl.vertexAttribPointer(aPosB, 2, gl.FLOAT, false, 24, 8);
gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 24, 16);
gl.drawArrays(gl.TRIANGLES, 0, (buffers.count - 1) * 6);
```

- [ ] **Step 2: Remove redundant joint drawing**
Remove the `DRAW JOINTS` section in the render loop as SDF capsules handle joins. Keep the `DRAW ACTUAL DATA POINTS` for custom markers.

- [ ] **Step 3: Commit**

```bash
git add src/components/Plot/WebGLRenderer.tsx
git commit -m "feat: update render loop to use SDF shaders and cleanup joints"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Ensure compilation and runtime**
Run the dev server and verify no WebGL errors in console.
Run: `npm run dev`

- [ ] **Step 2: Visual check**
Verify that thick lines (e.g., 20px) show perfect round joins and no artifacts at sharp angles.

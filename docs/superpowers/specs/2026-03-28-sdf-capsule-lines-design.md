# Design Spec: High-Quality Line Drawing via SDF Capsules

## Status
- **Date:** 2026-03-28
- **Topic:** WebGL Line Drawing
- **Status:** Draft

## Problem Statement
The current line drawing implementation using `TRIANGLE_STRIP` for segments and `gl.POINTS` for joints fails to handle extreme bends and very thick lines correctly. Overlaps are visible (even if opaque, it's messy geometry) and joints can become disconnected or artifact-heavy at sharp angles.

## Goals
- Support arbitrarily thin and wide lines.
- Perfect round joins and end caps.
- No artifacts at extreme bends (up to 180°).
- High performance for up to 10,000 data points.
- Built-in antialiasing.

## Architecture & Implementation

### 1. Geometry Strategy (SDF Capsules)
Each segment (from point A to B) is represented as a "Capsule" (a cylinder with hemispherical ends). In 2D, this is a rectangle with two semicircles at the ends.

We will draw a single **expanded Quad** for each segment. This quad must be large enough to contain:
- The segment itself.
- Both round end caps (radius = `thickness / 2`).
- 1 extra pixel on all sides for antialiasing.

### 2. Vertex Buffer Structure
Each segment requires 6 vertices (2 triangles).
Attributes per vertex:
- `a_posA`: `vec2` (World X, Y of start point).
- `a_posB`: `vec2` (World X, Y of end point).
- `a_uv`: `vec2` (Local coordinates defining the corner of the expanded quad, e.g., `(-1, -1)` to `(1, 1)` or custom expansion factors).

### 3. Shader Logic

#### Vertex Shader
1. Projiziere `a_posA` und `a_posB` auf den Bildschirm (Pixel-Koordinaten).
2. Berechne den Richtungsvektor `L = screenB - screenA`.
3. Berechne den Normalenvektor `N = vec2(-L.y, L.x)`.
4. Erweitere das Quad basierend auf `a_uv`:
   - In Richtung `L`: `thickness/2 + 1.0`.
   - In Richtung `N`: `thickness/2 + 1.0`.
5. Berechne die finale Bildschirm-Position und gib sie als `varying v_screenPos` weiter.
6. Gib `v_screenA` und `v_screenB` (in Pixeln) als `varying` weiter.

#### Fragment Shader
1. Berechne den Abstand `d` vom aktuellen Pixel `v_screenPos` zur Strecke `v_screenA` -> `v_screenB`.
   - Formel: `d = length(P - (A + (B - A) * clamp(dot(P - A, B - A) / dot(B - A, B - A), 0.0, 1.0)))`.
2. Berechne die Deckkraft (Alpha) für Antialiasing:
   - `float alpha = 1.0 - smoothstep(u_thickness/2.0 - 0.5, u_thickness/2.0 + 0.5, d)`.
3. Da Linien laut User opak sind, setzen wir das Ergebnis einfach:
   - `gl_FragColor = vec4(u_color.rgb, u_color.a * alpha)`. (Hinweis: Trotz "opakem" Wunsch ist Alpha für glatte Kanten nötig).

## Data Flow
- `useGraphStore`: Hält die Datensätze.
- `WebGLRenderer`:
  - Generiert den Buffer mit Segment-Quads (6 Vertices pro Segment).
  - Bindet den neuen `sdfLineProgram`.
  - Zeichnet alle Segmente in einem Pass (`gl.TRIANGLES`).

## Success Criteria
- Linien sehen bei Breite 1px bis 50px perfekt aus.
- Keine "Spikes" oder Lücken bei Zick-Zack-Mustern.
- Kanten sind glatt (Antialiasing).
- Framerate bleibt stabil bei 10k Punkten.

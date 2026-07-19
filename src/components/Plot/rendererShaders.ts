export const MAIN_VERTEX_SHADER = `#version 300 es
      // === MAIN VERTEX SHADER (points + screen-space overlay) ===
      in float a_x;
      in float a_y;
      in vec2 a_other;
      in float a_t;
      in float a_dist_start;
      uniform vec2 u_x_scale_offset; // (scale, offset)
      uniform vec2 u_y_scale_offset; // (scale, offset)
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;
      uniform float u_dpr;
      uniform bool u_is_screen_space;
      out highp float v_t;
      out highp float v_len;
      out highp float v_dist_start;

      vec2 toScreen(vec2 pos) {
        float x = pos.x * u_x_scale_offset.x + u_x_scale_offset.y;
        float y = pos.y * u_y_scale_offset.x + u_y_scale_offset.y;
        return vec2(x, y);
      }

      void main() {
        vec2 p;
        if (u_is_screen_space) {
          p = vec2(a_x, a_y); // Already scaled by dpr in the buffer
        } else {
          p = toScreen(vec2(a_x, a_y));
        }
        vec2 other;
        if (u_is_screen_space) {
          other = vec2(a_other.x, a_other.y);
        } else {
          other = toScreen(a_other);
        }
        v_t = a_t;
        v_len = length(other - p);
        v_dist_start = a_dist_start;

        // Correctly map screen pixels (0=top, res.y=bottom) to clip space (-1 to 1)
        // x: [0, res.x] -> [-1, 1]  => (x / res.x * 2.0) - 1.0
        // y: [0, res.y] -> [1, -1]  => 1.0 - (y / res.y * 2.0)
        gl_Position = vec4((p.x / u_resolution.x * 2.0) - 1.0, 1.0 - (p.y / u_resolution.y * 2.0), 0, 1);
        gl_PointSize = u_point_size;
      }
`;

export const MAIN_FRAGMENT_SHADER = `#version 300 es
      // === MAIN FRAGMENT SHADER ===
      precision highp float;
      in highp float v_t;
      in highp float v_len;
      in highp float v_dist_start;
      uniform vec4 u_color;
      uniform int u_style;
      uniform int u_line_style;
      uniform float u_dpr;
      uniform float u_point_size;
      out vec4 fragColor;

      void drawCircle() {
        vec2 p = (gl_PointCoord - 0.5) * u_point_size;
        float r = length(p);
        float halfSize = 0.5 * u_point_size;
        float dOut = r - halfSize;
        float a = 1.0 - smoothstep(-0.5, 0.5, dOut);
        if (a <= 0.0) discard;
        float alpha = u_color.a * a;
        fragColor = vec4(u_color.rgb * alpha, alpha);
      }

      void drawSquare() {
        // Work in device pixels for crisp axis-aligned AA.
        vec2 p = (gl_PointCoord - 0.5) * u_point_size;
        vec2 ap = abs(p);
        float halfSize = 0.5 * u_point_size;
        // Signed distance to outer edge (negative inside)
        float dOut = max(ap.x, ap.y) - halfSize;
        float a = 1.0 - smoothstep(-0.5, 0.5, dOut);
        if (a <= 0.0) discard;
        float alpha = u_color.a * a;
        fragColor = vec4(u_color.rgb * alpha, alpha);
      }

      void drawCross() {
        vec2 p = gl_PointCoord - 0.5;
        // Stroke half-width: at least 1px in point-coord space, scaled with size
        float t = max(0.15, 1.5 / max(u_point_size, 2.0));
        if (abs(p.x - p.y) > t && abs(p.x + p.y) > t) discard;
        fragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void drawLineSegment() {
        if (u_line_style > 0) {
          float dashLen = (u_line_style == 1) ? 8.0 : 2.0;
          float gapLen = (u_line_style == 1) ? 6.0 : 4.0;
          float total = (dashLen + gapLen) * u_dpr;
          float dist = mod(v_dist_start + mod(v_t * v_len, total), total);
          if (dist > dashLen * u_dpr) discard;
        }
        fragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void drawSolid() {
        fragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void main() {
        if (u_style == 0) {
          drawCircle();
        } else if (u_style == 1) {
          drawSquare();
        } else if (u_style == 2) {
          drawCross();
        } else if (u_style == 3) {
          drawSolid();
        } else {
          drawLineSegment();
        }
      }
`;

export const LINE_VERTEX_SHADER = `#version 300 es
      // === LINE VERTEX SHADER (instanced triangle capsules) ===
      // Per instance: one segment (p0 -> p1) in data space, expanded to a
      // screen-space quad that covers the capsule of half-width
      // u_width_px/2 plus a 1px antialiasing apron. The six vertices of the
      // two triangles are derived from gl_VertexID; no per-vertex buffer.
      precision highp float;
      in float a_x0;
      in float a_y0;
      in float a_x1;
      in float a_y1;
      in float a_dist0;
      uniform vec2 u_x_scale_offset; // (scale, offset)
      uniform vec2 u_y_scale_offset; // (scale, offset)
      uniform vec2 u_resolution;
      uniform float u_width_px;
      out vec2 v_pos;
      flat out vec2 v_p0;
      flat out vec2 v_p1;
      flat out float v_dist0;

      void main() {
        vec2 p0 = vec2(a_x0 * u_x_scale_offset.x + u_x_scale_offset.y,
                       a_y0 * u_y_scale_offset.x + u_y_scale_offset.y);
        vec2 p1 = vec2(a_x1 * u_x_scale_offset.x + u_x_scale_offset.y,
                       a_y1 * u_y_scale_offset.x + u_y_scale_offset.y);
        vec2 seg = p1 - p0;
        float len = length(seg);
        // Zero-length segments (duplicate samples) still render a round dot.
        vec2 dir = len > 1e-4 ? seg / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        float ext = u_width_px * 0.5 + 1.0;

        // Corner table for triangles (c0,c1,c2) and (c2,c1,c3) where
        // c = (end, side): c0=(0,-1) c1=(0,+1) c2=(1,-1) c3=(1,+1).
        int vid = gl_VertexID;
        float t = (vid == 2 || vid == 3 || vid == 5) ? 1.0 : 0.0;
        float side = (vid == 1 || vid == 4 || vid == 5) ? 1.0 : -1.0;

        vec2 pos = mix(p0, p1, t) + dir * ((t * 2.0 - 1.0) * ext) + nrm * (side * ext);
        v_pos = pos;
        v_p0 = p0;
        v_p1 = p1;
        v_dist0 = a_dist0;
        gl_Position = vec4(pos.x / u_resolution.x * 2.0 - 1.0,
                           1.0 - pos.y / u_resolution.y * 2.0, 0.0, 1.0);
      }
`;

export const LINE_FRAGMENT_SHADER = `#version 300 es
      // === LINE FRAGMENT SHADER ===
      // Capsule SDF: distance from the fragment to the segment [p0,p1] in
      // device px. One pixel of smoothstep at the rim antialiases the edge;
      // round caps at both ends double as round joins between consecutive
      // segments of a polyline.
      precision highp float;
      in vec2 v_pos;
      flat in vec2 v_p0;
      flat in vec2 v_p1;
      flat in float v_dist0;
      uniform vec4 u_color;
      uniform float u_width_px;
      uniform vec2 u_dash; // (dashLen, gapLen) device px; dashLen <= 0 = solid
      out vec4 fragColor;

      void main() {
        vec2 seg = v_p1 - v_p0;
        float len2 = dot(seg, seg);
        float h = len2 > 0.0 ? clamp(dot(v_pos - v_p0, seg) / len2, 0.0, 1.0) : 0.0;
        float d = distance(v_pos, v_p0 + seg * h);
        float halfW = max(u_width_px * 0.5, 0.5);
        float alpha = 1.0 - smoothstep(halfW - 0.5, halfW + 0.5, d);
        if (u_dash.x > 0.0) {
          float along = v_dist0 + h * sqrt(len2);
          float m = mod(along, u_dash.x + u_dash.y);
          alpha *= 1.0 - smoothstep(u_dash.x - 0.5, u_dash.x + 0.5, m);
        }
        if (alpha <= 0.003) discard;
        float a = u_color.a * alpha;
        fragColor = vec4(u_color.rgb * a, a);
      }
`;

export const LABEL_VERTEX_SHADER = `#version 300 es
      // === LABEL VERTEX SHADER (instanced textured quads from the atlas) ===
      // Per instance: anchor point, pre-rotation offset of the quad's
      // top-left corner from the anchor, quad size, atlas UV rect, and a
      // quarter-turn rotation (0 / ±1) applied around the anchor (y titles).
      precision highp float;
      in vec2 a_anchor;
      in vec2 a_off;
      in vec2 a_size;
      in vec4 a_uvrect; // (u0, v0, uw, vh)
      in float a_rot;
      uniform vec2 u_resolution;
      out vec2 v_uv;

      void main() {
        int vid = gl_VertexID;
        float cx = (vid == 2 || vid == 3 || vid == 5) ? 1.0 : 0.0;
        float cy = (vid == 1 || vid == 4 || vid == 5) ? 1.0 : 0.0;
        vec2 corner = a_off + vec2(cx, cy) * a_size;
        vec2 p;
        if (a_rot > 0.5) p = vec2(-corner.y, corner.x);
        else if (a_rot < -0.5) p = vec2(corner.y, -corner.x);
        else p = corner;
        p += a_anchor;
        v_uv = vec2(a_uvrect.x + cx * a_uvrect.z, a_uvrect.y + cy * a_uvrect.w);
        gl_Position = vec4(p.x / u_resolution.x * 2.0 - 1.0,
                           1.0 - p.y / u_resolution.y * 2.0, 0.0, 1.0);
      }
`;

export const LABEL_FRAGMENT_SHADER = `#version 300 es
      // === LABEL FRAGMENT SHADER ===
      // Colors are baked into the (premultiplied) atlas texture.
      precision mediump float;
      in vec2 v_uv;
      uniform sampler2D u_atlas;
      out vec4 fragColor;

      void main() {
        fragColor = texture(u_atlas, v_uv);
        if (fragColor.a <= 0.003) discard;
      }
`;
/**
 * Shared WebGL2 mock for renderer tests: every method the renderer core
 * touches as a vi.fn(), with shader/program handshakes reporting success so
 * the full draw path can run headlessly under jsdom.
 */

import { vi } from "vitest";

export function makeGl2Mock() {
	let attribLoc = 0;
	const gl = {
		VERTEX_SHADER: 35633,
		FRAGMENT_SHADER: 35632,
		COMPILE_STATUS: 35713,
		LINK_STATUS: 35714,
		BLEND: 3042,
		ONE: 1,
		ONE_MINUS_SRC_ALPHA: 771,
		ARRAY_BUFFER: 34962,
		STATIC_DRAW: 35044,
		DYNAMIC_DRAW: 35048,
		STREAM_DRAW: 35040,
		COLOR_BUFFER_BIT: 16384,
		SCISSOR_TEST: 3089,
		FLOAT: 5126,
		LINES: 1,
		LINE_STRIP: 3,
		TRIANGLES: 4,
		POINTS: 0,
		TEXTURE_2D: 3553,
		TEXTURE0: 33984,
		RGBA: 6408,
		UNSIGNED_BYTE: 5121,
		LINEAR: 9729,
		CLAMP_TO_EDGE: 33071,
		TEXTURE_MIN_FILTER: 10241,
		TEXTURE_MAG_FILTER: 10240,
		TEXTURE_WRAP_S: 10242,
		TEXTURE_WRAP_T: 10243,
		UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,

		createShader: vi.fn(() => ({})),
		shaderSource: vi.fn(),
		compileShader: vi.fn(),
		getShaderParameter: vi.fn(() => true),
		getShaderInfoLog: vi.fn(() => ""),
		createProgram: vi.fn(() => ({})),
		attachShader: vi.fn(),
		linkProgram: vi.fn(),
		getProgramParameter: vi.fn(() => true),
		getProgramInfoLog: vi.fn(() => ""),
		getUniformLocation: vi.fn(() => ({})),
		getAttribLocation: vi.fn(() => attribLoc++),
		useProgram: vi.fn(),

		enable: vi.fn(),
		disable: vi.fn(),
		blendFunc: vi.fn(),
		viewport: vi.fn(),
		scissor: vi.fn(),
		clearColor: vi.fn(),
		clear: vi.fn(),

		uniform1i: vi.fn(),
		uniform1f: vi.fn(),
		uniform2f: vi.fn(),
		uniform4f: vi.fn(),

		createBuffer: vi.fn(() => ({})),
		bindBuffer: vi.fn(),
		bufferData: vi.fn(),

		enableVertexAttribArray: vi.fn(),
		disableVertexAttribArray: vi.fn(),
		vertexAttrib1f: vi.fn(),
		vertexAttrib2f: vi.fn(),
		vertexAttribDivisor: vi.fn(),
		vertexAttribPointer: vi.fn(),

		drawArrays: vi.fn(),
		drawArraysInstanced: vi.fn(),
		lineWidth: vi.fn(),

		createTexture: vi.fn(() => ({})),
		bindTexture: vi.fn(),
		activeTexture: vi.fn(),
		texImage2D: vi.fn(),
		texSubImage2D: vi.fn(),
		texParameteri: vi.fn(),
		pixelStorei: vi.fn(),
		deleteTexture: vi.fn(),
		deleteBuffer: vi.fn(),

		deleteProgram: vi.fn(),
		deleteShader: vi.fn(),
		getExtension: vi.fn(() => null),
	};
	return gl;
}

/** Minimal canvas stand-in whose getContext returns the supplied mock. */
export function makeCanvasMock(gl: unknown) {
	return {
		width: 0,
		height: 0,
		getContext: vi.fn(() => gl),
	} as unknown as HTMLCanvasElement;
}

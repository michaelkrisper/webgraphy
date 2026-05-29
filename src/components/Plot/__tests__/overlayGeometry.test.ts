import { describe, expect, it } from "vitest";
import {
	writeBackgroundQuad,
	writeXGridLines,
	writeYGridLines,
} from "../overlayGeometry";

const pad = { left: 20, right: 10, top: 5, bottom: 30 };

describe("writeBackgroundQuad", () => {
	it("writes 12 floats and returns the advanced write index", () => {
		const buf = new Float32Array(20);
		const next = writeBackgroundQuad(buf, 0, pad, 100, 50, 1);
		expect(next).toBe(12);
	});

	it("emits two triangles covering the plot area at dpr 1", () => {
		const buf = new Float32Array(12);
		writeBackgroundQuad(buf, 0, pad, 100, 50, 1);
		// expected corners
		const x0 = 20;
		const y0 = 5;
		const x1 = 120;
		const y1 = 55;
		// Triangle 1: (x0,y0) (x1,y0) (x0,y1)
		// Triangle 2: (x1,y0) (x1,y1) (x0,y1)
		expect(Array.from(buf)).toEqual([
			x0, y0,
			x1, y0,
			x0, y1,
			x1, y0,
			x1, y1,
			x0, y1,
		]);
	});

	it("multiplies all coordinates by the device pixel ratio", () => {
		const buf = new Float32Array(12);
		writeBackgroundQuad(buf, 0, pad, 100, 50, 2);
		// All entries should be twice the dpr-1 values
		const ref = new Float32Array(12);
		writeBackgroundQuad(ref, 0, pad, 100, 50, 1);
		for (let i = 0; i < 12; i++) expect(buf[i]).toBe(ref[i] * 2);
	});

	it("appends from the supplied write index without touching earlier slots", () => {
		const buf = new Float32Array(16);
		buf[0] = 999;
		buf[1] = 888;
		buf[2] = 777;
		buf[3] = 666;
		const next = writeBackgroundQuad(buf, 4, pad, 100, 50, 1);
		expect(next).toBe(16);
		// Untouched prefix
		expect(buf[0]).toBe(999);
		expect(buf[1]).toBe(888);
		expect(buf[2]).toBe(777);
		expect(buf[3]).toBe(666);
	});
});

describe("writeXGridLines", () => {
	const axis = {
		ticks: [0, 50, 100],
		min: 0,
		max: 100,
		showGrid: true,
	};

	it("writes one vertical line per visible tick", () => {
		const buf = new Float32Array(20);
		const next = writeXGridLines(buf, 0, axis, pad, 100, 50, 1);
		// 3 ticks * 4 floats (two endpoints) = 12 floats
		expect(next).toBe(12);
	});

	it("emits no vertices when showGrid is false", () => {
		const buf = new Float32Array(20);
		const next = writeXGridLines(
			buf,
			0,
			{ ...axis, showGrid: false },
			pad,
			100,
			50,
			1,
		);
		expect(next).toBe(0);
	});

	it("emits no vertices for a zero or inverted range", () => {
		const buf = new Float32Array(20);
		expect(
			writeXGridLines(buf, 0, { ...axis, min: 5, max: 5 }, pad, 100, 50, 1),
		).toBe(0);
		expect(
			writeXGridLines(buf, 0, { ...axis, min: 100, max: 0 }, pad, 100, 50, 1),
		).toBe(0);
	});

	it("skips ticks outside the [min,max] range", () => {
		const buf = new Float32Array(20);
		const next = writeXGridLines(
			buf,
			0,
			{ ...axis, ticks: [-10, 50, 200] },
			pad,
			100,
			50,
			1,
		);
		expect(next).toBe(4); // only tick 50 inside
	});

	it("scales coordinates by dpr", () => {
		const buf1 = new Float32Array(12);
		const buf2 = new Float32Array(12);
		writeXGridLines(buf1, 0, axis, pad, 100, 50, 1);
		writeXGridLines(buf2, 0, axis, pad, 100, 50, 2);
		for (let i = 0; i < 12; i++) expect(buf2[i]).toBe(buf1[i] * 2);
	});
});

describe("writeYGridLines", () => {
	const axisA = {
		ticks: [0, 50, 100],
		min: 0,
		max: 100,
		showGrid: true,
	};
	const axisB = {
		ticks: [0, 10],
		min: 0,
		max: 10,
		showGrid: false,
	};

	it("writes one horizontal line per gridded axis tick", () => {
		const buf = new Float32Array(20);
		const next = writeYGridLines(buf, 0, [axisA], pad, 130, 50, 1);
		expect(next).toBe(12); // 3 ticks * 4 floats
	});

	it("skips axes whose showGrid is false", () => {
		const buf = new Float32Array(20);
		expect(writeYGridLines(buf, 0, [axisB], pad, 130, 50, 1)).toBe(0);
	});

	it("combines contributions across multiple gridded axes", () => {
		const buf = new Float32Array(40);
		const next = writeYGridLines(
			buf,
			0,
			[axisA, { ...axisA, ticks: [25, 75] }],
			pad,
			130,
			50,
			1,
		);
		// (3 + 2) ticks * 4 floats
		expect(next).toBe(20);
	});

	it("skips ticks outside [min,max]", () => {
		const buf = new Float32Array(20);
		const next = writeYGridLines(
			buf,
			0,
			[{ ...axisA, ticks: [-5, 50, 105] }],
			pad,
			130,
			50,
			1,
		);
		expect(next).toBe(4);
	});
});

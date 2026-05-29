import { describe, expect, it } from "vitest";
import {
	writeBackgroundQuad,
	writeFramePlotBorder,
	writeXAxisLines,
	writeXGridLines,
	writeXZeroLine,
	writeYAxisLines,
	writeYGridLines,
	writeYZeroLines,
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

describe("writeYZeroLines", () => {
	const straddling = { min: -10, max: 10, showGrid: true };
	const onlyPositive = { min: 5, max: 10, showGrid: true };

	it("emits one line per straddling, gridded, non-categorical axis", () => {
		const buf = new Float32Array(20);
		const next = writeYZeroLines(buf, 0, [straddling], pad, 130, 50, 1);
		expect(next).toBe(4);
	});

	it("skips axes that do not straddle 0", () => {
		const buf = new Float32Array(20);
		expect(writeYZeroLines(buf, 0, [onlyPositive], pad, 130, 50, 1)).toBe(0);
	});

	it("skips axes without grid", () => {
		const buf = new Float32Array(20);
		expect(
			writeYZeroLines(
				buf,
				0,
				[{ ...straddling, showGrid: false }],
				pad,
				130,
				50,
				1,
			),
		).toBe(0);
	});

	it("skips categorical axes", () => {
		const buf = new Float32Array(20);
		expect(
			writeYZeroLines(
				buf,
				0,
				[{ ...straddling, categoryLabels: ["a", "b"] }],
				pad,
				130,
				50,
				1,
			),
		).toBe(0);
	});

	it("aggregates contributions from multiple straddling axes", () => {
		const buf = new Float32Array(20);
		const next = writeYZeroLines(
			buf,
			0,
			[straddling, { ...straddling, min: -1, max: 5 }],
			pad,
			130,
			50,
			1,
		);
		expect(next).toBe(8);
	});
});

describe("writeXZeroLine", () => {
	const straddling = { min: -10, max: 10, showGrid: true };

	it("emits a single 2-vertex line when the first x-axis straddles 0", () => {
		const buf = new Float32Array(20);
		const next = writeXZeroLine(buf, 0, straddling, pad, 100, 90, 1);
		expect(next).toBe(4);
	});

	it("returns the unchanged write index when min > 0", () => {
		const buf = new Float32Array(20);
		expect(
			writeXZeroLine(buf, 7, { ...straddling, min: 1 }, pad, 100, 90, 1),
		).toBe(7);
	});

	it("returns the unchanged write index when categorical", () => {
		const buf = new Float32Array(20);
		expect(
			writeXZeroLine(
				buf,
				0,
				{ ...straddling, categoryLabels: ["A"] },
				pad,
				100,
				90,
				1,
			),
		).toBe(0);
	});

	it("returns the unchanged write index when showGrid is false", () => {
		const buf = new Float32Array(20);
		expect(
			writeXZeroLine(buf, 0, { ...straddling, showGrid: false }, pad, 100, 90, 1),
		).toBe(0);
	});
});

describe("writeFramePlotBorder", () => {
	it("writes the left/top/right spines as 6 vertices (12 floats)", () => {
		const buf = new Float32Array(20);
		const next = writeFramePlotBorder(buf, 0, pad, 130, 50, 1);
		expect(next).toBe(12);
	});

	it("produces a 'U' (top-open) frame", () => {
		const buf = new Float32Array(12);
		writeFramePlotBorder(buf, 0, pad, 130, 50, 1);
		const xL = 20;
		const xR = 120;
		const yT = 5;
		const yB = 55;
		expect(Array.from(buf)).toEqual([
			xL, yT, xL, yB, // left spine
			xL, yT, xR, yT, // top spine
			xR, yT, xR, yB, // right spine
		]);
	});

	it("scales coordinates by dpr", () => {
		const buf1 = new Float32Array(12);
		const buf2 = new Float32Array(12);
		writeFramePlotBorder(buf1, 0, pad, 130, 50, 1);
		writeFramePlotBorder(buf2, 0, pad, 130, 50, 3);
		for (let i = 0; i < 12; i++) expect(buf2[i]).toBe(buf1[i] * 3);
	});
});

describe("writeXAxisLines", () => {
	const axis = { ticks: [0, 50, 100], min: 0, max: 100 };
	const metric = { cumulativeOffset: 0 };

	it("writes the axis spine (4 floats) plus 4 floats per visible tick", () => {
		const buf = new Float32Array(40);
		const next = writeXAxisLines(
			buf,
			0,
			[axis],
			[metric],
			pad,
			130,
			90,
			100,
			1,
		);
		// 4 spine + 3 ticks * 4 = 16
		expect(next).toBe(16);
	});

	it("skips an axis when no metric is supplied at that index", () => {
		const buf = new Float32Array(20);
		const next = writeXAxisLines(buf, 0, [axis], [], pad, 130, 90, 100, 1);
		expect(next).toBe(0);
	});

	it("emits only the spine for a zero-range axis", () => {
		const buf = new Float32Array(20);
		const next = writeXAxisLines(
			buf,
			0,
			[{ ...axis, min: 5, max: 5 }],
			[metric],
			pad,
			130,
			90,
			100,
			1,
		);
		expect(next).toBe(4);
	});

	it("stacks multiple axes by their cumulativeOffset", () => {
		const buf = new Float32Array(80);
		const next = writeXAxisLines(
			buf,
			0,
			[axis, axis],
			[metric, { cumulativeOffset: 30 }],
			pad,
			130,
			90,
			100,
			1,
		);
		// 16 per axis = 32
		expect(next).toBe(32);
	});
});

describe("writeYAxisLines", () => {
	const axis = {
		id: "Y",
		ticks: [0, 50, 100],
		min: 0,
		max: 100,
		position: "left" as const,
	};
	const layout = { Y: { total: 50 } };
	const lOff = { Y: 0 };
	const rOff = {};

	it("writes the spine (4 floats) plus 4 floats per visible tick", () => {
		const buf = new Float32Array(40);
		const next = writeYAxisLines(
			buf,
			0,
			[axis],
			layout,
			lOff,
			rOff,
			pad,
			130,
			90,
			50,
			1,
		);
		// spine + 3 ticks * 4 = 16
		expect(next).toBe(16);
	});

	it("uses the default gutter width when axisLayout lacks an entry", () => {
		const buf = new Float32Array(40);
		const next = writeYAxisLines(
			buf,
			0,
			[axis],
			{},
			lOff,
			rOff,
			pad,
			130,
			90,
			50,
			1,
		);
		// Still writes 16 floats; layout fallback is internal
		expect(next).toBe(16);
	});

	it("emits only the spine for a zero-range axis", () => {
		const buf = new Float32Array(20);
		const next = writeYAxisLines(
			buf,
			0,
			[{ ...axis, min: 5, max: 5 }],
			layout,
			lOff,
			rOff,
			pad,
			130,
			90,
			50,
			1,
		);
		expect(next).toBe(4);
	});

	it("handles right-positioned axes", () => {
		const ax = { ...axis, position: "right" as const };
		const buf = new Float32Array(40);
		const next = writeYAxisLines(
			buf,
			0,
			[ax],
			layout,
			lOff,
			{ Y: 0 },
			pad,
			130,
			90,
			50,
			1,
		);
		expect(next).toBe(16);
	});
});

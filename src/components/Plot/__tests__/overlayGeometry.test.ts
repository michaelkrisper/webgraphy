import { describe, expect, it } from "vitest";
import { writeBackgroundQuad } from "../overlayGeometry";

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

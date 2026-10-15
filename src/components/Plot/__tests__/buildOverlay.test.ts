import { describe, expect, it } from "vitest";
import { buildOverlay, type OverlayInput } from "../buildOverlay";
import type { OverlayState } from "../drawOverlay";

const pad = { left: 50, right: 30, top: 20, bottom: 40 };
const W = 400;
const H = 300;

function freshState(len = 0): OverlayState {
	return { packed: new Float32Array(len), packedLen: 0, groups: [] };
}

function input(over: Partial<OverlayInput> = {}): OverlayInput {
	return {
		xAxes: [{ id: "x1", min: -5, max: 5, showGrid: true, ticks: [-5, 0, 5] }],
		yAxes: [
			{
				id: "y1",
				min: -1,
				max: 1,
				showGrid: true,
				ticks: [-1, 0, 1],
				position: "left",
			},
		],
		xAxesMetrics: [{ id: "x1", cumulativeOffset: 0 }],
		axisLayout: { y1: { total: 40, label: 20 } },
		leftOffsets: { y1: 0 },
		rightOffsets: {},
		axisColor: "#ff0000",
		zeroLineColor: "#00ff00",
		gridColor: "#0000ff",
		plotBg: "#ffffff",
		...over,
	};
}

describe("buildOverlay", () => {
	it("emits background, grid, zero lines, axis lines and arrows in draw order", () => {
		const ov = freshState();
		buildOverlay(input(), W, H, pad, 1, ov);

		expect(ov.groups.map((g) => g.topology)).toEqual([
			"TRIANGLES", // background
			"LINES", // major grid
			"LINES", // zero lines
			"LINES", // axis lines
			"TRIANGLES", // zero-line arrows
			"TRIANGLES", // axis arrows
		]);
		// Background first, opaque plot colour, one quad.
		expect(ov.groups[0]).toMatchObject({
			rgba: [1, 1, 1, 1],
			offset: 0,
			count: 6,
		});
		expect(ov.groups[1].rgba).toEqual([0, 0, 1, 1]);
		expect(ov.groups[2]).toMatchObject({ rgba: [0, 1, 0, 1], width: 1.5 });
		expect(ov.groups[3].rgba).toEqual([1, 0, 0, 1]);
	});

	it("packs groups contiguously and reports the written float length", () => {
		const ov = freshState();
		buildOverlay(input(), W, H, pad, 1, ov);
		let expected = 0;
		for (const g of ov.groups) {
			expect(g.offset).toBe(expected);
			expected += g.count;
		}
		expect(ov.packedLen).toBe(expected * 2);
		expect(ov.packed.length).toBeGreaterThanOrEqual(ov.packedLen);
	});

	it("adds a translucent minor-grid group beneath the major grid for log ticks", () => {
		const ov = freshState();
		buildOverlay(
			input({
				yAxes: [
					{
						id: "y1",
						min: 1,
						max: 100,
						showGrid: true,
						ticks: [1, 10, 100],
						minorTicks: [2, 3, 20, 30],
						log: true,
						position: "left",
					},
				],
			}),
			W,
			H,
			pad,
			1,
			ov,
		);
		const minor = ov.groups[1];
		expect(minor.topology).toBe("LINES");
		expect(minor.rgba).toEqual([0, 0, 1, 0.4]);
		// One full-width line (two vertices) per visible minor tick.
		expect(minor.count).toBe(8);
		expect(ov.groups[2].rgba).toEqual([0, 0, 1, 1]);
	});

	it("skips grid and zero-line groups when no axis shows a grid", () => {
		const ov = freshState();
		buildOverlay(
			input({
				xAxes: [{ id: "x1", min: -5, max: 5, showGrid: false, ticks: [-5, 0, 5] }],
				yAxes: [
					{
						id: "y1",
						min: -1,
						max: 1,
						showGrid: false,
						ticks: [-1, 0, 1],
						position: "right",
					},
				],
				leftOffsets: {},
				rightOffsets: { y1: 0 },
			}),
			W,
			H,
			pad,
			1,
			ov,
		);
		expect(ov.groups.map((g) => g.topology)).toEqual([
			"TRIANGLES",
			"LINES",
			"TRIANGLES",
		]);
		expect(ov.groups[1].rgba).toEqual([1, 0, 0, 1]);
		expect(ov.groups[2].rgba).toEqual([1, 0, 0, 1]);
	});

	it("still draws background and frame with no axes at all", () => {
		const ov = freshState();
		buildOverlay(
			input({
				xAxes: [],
				yAxes: [],
				xAxesMetrics: [],
				axisLayout: {},
				leftOffsets: {},
			}),
			W,
			H,
			pad,
			1,
			ov,
		);
		expect(ov.groups.map((g) => g.topology)).toEqual(["TRIANGLES", "LINES"]);
	});

	it("reuses a large enough buffer and grows a too-small one", () => {
		const big = freshState(4096);
		const before = big.packed;
		buildOverlay(input(), W, H, pad, 1, big);
		expect(big.packed).toBe(before);

		const small = freshState(4);
		buildOverlay(input(), W, H, pad, 1, small);
		expect(small.packed.length).toBeGreaterThanOrEqual(small.packedLen);
	});

	it("honours a precomputed vertex estimate when sizing the buffer", () => {
		const ov = freshState(0);
		buildOverlay(input({ estVertexCount: 10_000 }), W, H, pad, 1, ov);
		expect(ov.packed.length).toBe(10_000);
	});

	it("resets the group list on every call", () => {
		const ov = freshState();
		buildOverlay(input(), W, H, pad, 1, ov);
		const n = ov.groups.length;
		buildOverlay(input(), W, H, pad, 1, ov);
		expect(ov.groups).toHaveLength(n);
	});

	it("scales geometry by the device pixel ratio", () => {
		const a = freshState();
		const b = freshState();
		buildOverlay(input(), W, H, pad, 1, a);
		buildOverlay(input(), W, H, pad, 2, b);
		expect(b.packedLen).toBe(a.packedLen);
		// Background quad corners double.
		for (let i = 0; i < 12; i++) expect(b.packed[i]).toBe(a.packed[i] * 2);
	});
});

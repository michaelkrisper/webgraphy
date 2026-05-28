import { describe, expect, it } from "vitest";
import type { XAxisLayout, YAxisLayout } from "../chartTypes";
import {
	type OverlayXEntry,
	type OverlayYEntry,
	updateOverlayAxes,
} from "../overlayAxes";

const BASE_VERTEX_COUNT = 12 + 12 + 32;

function makeScratch(): {
	xAxes: OverlayXEntry[];
	yAxes: OverlayYEntry[];
	estVertexCount?: number;
} {
	return { xAxes: [], yAxes: [] };
}

function makeNumericX(
	id: string,
	ticks: number[],
	showGrid = false,
): XAxisLayout {
	return {
		id,
		min: 0,
		max: 100,
		showGrid,
		title: id,
		color: "#000",
		ticks: { result: ticks, step: 10, precision: 0, isXDate: false },
	};
}

function makeDateX(
	id: string,
	timestamps: number[],
	showGrid = false,
): XAxisLayout {
	return {
		id,
		min: 0,
		max: 100,
		showGrid,
		title: id,
		color: "#000",
		ticks: {
			result: timestamps.map((t) => ({ timestamp: t, label: String(t) })),
			isXDate: true,
			secondaryLabels: [],
		},
	};
}

function makeY(
	id: string,
	ticks: number[],
	position: "left" | "right" = "left",
	showGrid = false,
): YAxisLayout {
	return {
		id,
		name: id,
		min: 0,
		max: 100,
		color: "#000",
		position,
		showGrid,
		ticks,
		precision: 0,
		actualStep: 10,
	};
}

describe("updateOverlayAxes", () => {
	it("yields empty arrays and the baseline vertex count for empty input", () => {
		const scratch = makeScratch();
		updateOverlayAxes(scratch, [], []);
		expect(scratch.xAxes).toEqual([]);
		expect(scratch.yAxes).toEqual([]);
		expect(scratch.estVertexCount).toBe(BASE_VERTEX_COUNT);
	});

	it("copies numeric x ticks verbatim and accounts for them in the vertex estimate", () => {
		const scratch = makeScratch();
		const xLayout = [makeNumericX("X", [0, 10, 20])];
		updateOverlayAxes(scratch, xLayout, []);

		expect(scratch.xAxes).toHaveLength(1);
		expect(scratch.xAxes[0]).toMatchObject({
			id: "X",
			min: 0,
			max: 100,
			showGrid: false,
			ticks: [0, 10, 20],
		});
		// (3 + 1) * 4 + 6 = 22; no grid contribution
		expect(scratch.estVertexCount).toBe(BASE_VERTEX_COUNT + 22);
	});

	it("flattens date ticks to their timestamps", () => {
		const scratch = makeScratch();
		updateOverlayAxes(scratch, [makeDateX("X", [1700, 1800, 1900])], []);
		expect(scratch.xAxes[0].ticks).toEqual([1700, 1800, 1900]);
	});

	it("adds the grid contribution only for the first x-axis", () => {
		const scratch = makeScratch();
		const a = makeNumericX("A", [0, 1, 2], true); // grid contributes
		const b = makeNumericX("B", [0, 1, 2], true); // grid ignored (i !== 0)
		updateOverlayAxes(scratch, [a, b], []);
		// per axis: (3+1)*4+6 = 22; grid on first only: 3*4 = 12
		expect(scratch.estVertexCount).toBe(BASE_VERTEX_COUNT + 22 + 22 + 12);
	});

	it("copies y-axis entries including position and aliases the ticks array", () => {
		const scratch = makeScratch();
		const yTicks = [0, 50, 100];
		const yLayout = [makeY("Y", yTicks, "right")];
		updateOverlayAxes(scratch, [], yLayout);

		expect(scratch.yAxes).toHaveLength(1);
		expect(scratch.yAxes[0]).toMatchObject({
			id: "Y",
			min: 0,
			max: 100,
			showGrid: false,
			position: "right",
			ticks: [0, 50, 100],
		});
		// in-place reuse: y entry's ticks should reference the source array
		expect(scratch.yAxes[0].ticks).toBe(yTicks);
	});

	it("adds y-axis grid contribution for every gridded axis", () => {
		const scratch = makeScratch();
		const yLayout = [
			makeY("Y1", [0, 50, 100], "left", true), // grid on
			makeY("Y2", [0, 25, 50, 75, 100], "right", false), // grid off
		];
		updateOverlayAxes(scratch, [], yLayout);
		// Y1: (3+1)*4+6 + 3*4 = 22 + 12 = 34
		// Y2: (5+1)*4+6 + 0    = 30
		expect(scratch.estVertexCount).toBe(BASE_VERTEX_COUNT + 34 + 30);
	});

	it("reuses existing scratch entries in place across calls", () => {
		const scratch = makeScratch();
		updateOverlayAxes(scratch, [makeNumericX("X", [0, 10])], [makeY("Y", [0, 50])]);
		const xEntryFirstCall = scratch.xAxes[0];
		const yEntryFirstCall = scratch.yAxes[0];

		updateOverlayAxes(
			scratch,
			[makeNumericX("X", [5, 15, 25])], // new ticks
			[makeY("Y", [10, 60], "right")], // new ticks + position
		);

		// Same object identities — entries mutated, not replaced.
		expect(scratch.xAxes[0]).toBe(xEntryFirstCall);
		expect(scratch.yAxes[0]).toBe(yEntryFirstCall);
		// Fields updated in place.
		expect(scratch.xAxes[0].ticks).toEqual([5, 15, 25]);
		expect(scratch.yAxes[0].position).toBe("right");
	});

	it("shrinks scratch arrays when fewer axes are passed", () => {
		const scratch = makeScratch();
		updateOverlayAxes(
			scratch,
			[makeNumericX("A", [0]), makeNumericX("B", [0])],
			[makeY("Y1", [0]), makeY("Y2", [0])],
		);
		expect(scratch.xAxes).toHaveLength(2);
		expect(scratch.yAxes).toHaveLength(2);

		updateOverlayAxes(scratch, [makeNumericX("A", [0])], []);
		expect(scratch.xAxes).toHaveLength(1);
		expect(scratch.yAxes).toHaveLength(0);
	});
});

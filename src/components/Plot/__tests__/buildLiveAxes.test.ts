import { describe, expect, it } from "vitest";
import {
	applyAxisUpdates,
	createLiveAxesScratch,
	resetAxisTargets,
} from "../buildLiveAxes";

interface Axis {
	id: string;
	name: string;
	min: number;
	max: number;
}

const xAxis = (id: string, min: number, max: number): Axis => ({
	id,
	name: id,
	min,
	max,
});

describe("createLiveAxesScratch", () => {
	it("returns an empty scratch with mutable liveX/liveY arrays", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		expect(scratch.liveX).toEqual([]);
		expect(scratch.liveY).toEqual([]);
	});
});

describe("applyAxisUpdates", () => {
	it("returns scratch arrays sized to the input axes when no updates are given", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		const xAxes = [xAxis("X1", 0, 10), xAxis("X2", 0, 20)];
		const yAxes = [xAxis("Y1", 0, 100)];
		const { liveX, liveY } = applyAxisUpdates(scratch, xAxes, yAxes, {}, {});
		expect(liveX).toBe(scratch.liveX);
		expect(liveY).toBe(scratch.liveY);
		expect(liveX).toHaveLength(2);
		expect(liveY).toHaveLength(1);
	});

	it("references the original axis when there is no matching update", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		const x = xAxis("X1", 0, 10);
		const { liveX } = applyAxisUpdates(scratch, [x], [], {}, {});
		expect(liveX[0]).toBe(x);
	});

	it("overlays min/max from the matching update onto a clone", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		const x = xAxis("X1", 0, 10);
		const { liveX } = applyAxisUpdates(
			scratch,
			[x],
			[],
			{ X1: { min: 5, max: 15 } },
			{},
		);
		expect(liveX[0]).not.toBe(x);
		expect(liveX[0]).toMatchObject({ id: "X1", min: 5, max: 15, name: "X1" });
		// Original untouched.
		expect(x).toMatchObject({ min: 0, max: 10 });
	});

	it("applies updates per axis: only matching ids are overlaid", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		const a = xAxis("A", 0, 10);
		const b = xAxis("B", 0, 20);
		const { liveX } = applyAxisUpdates(
			scratch,
			[a, b],
			[],
			{ B: { min: 1, max: 2 } },
			{},
		);
		expect(liveX[0]).toBe(a); // unchanged
		expect(liveX[1]).not.toBe(b);
		expect(liveX[1]).toMatchObject({ id: "B", min: 1, max: 2 });
	});

	it("applies X and Y updates independently", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		const x = xAxis("X", 0, 10);
		const y = xAxis("Y", 0, 100);
		const { liveX, liveY } = applyAxisUpdates(
			scratch,
			[x],
			[y],
			{ X: { min: 1, max: 9 } },
			{ Y: { min: 50, max: 60 } },
		);
		expect(liveX[0]).toMatchObject({ min: 1, max: 9 });
		expect(liveY[0]).toMatchObject({ min: 50, max: 60 });
	});

	it("reuses the scratch arrays across calls, growing and shrinking in place", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		const liveXRef = scratch.liveX;
		const liveYRef = scratch.liveY;

		applyAxisUpdates(
			scratch,
			[xAxis("A", 0, 1), xAxis("B", 0, 2)],
			[xAxis("Y1", 0, 100), xAxis("Y2", 0, 200)],
			{},
			{},
		);
		expect(scratch.liveX).toBe(liveXRef);
		expect(scratch.liveY).toBe(liveYRef);
		expect(scratch.liveX).toHaveLength(2);
		expect(scratch.liveY).toHaveLength(2);

		applyAxisUpdates(scratch, [xAxis("A", 0, 1)], [], {}, {});
		expect(scratch.liveX).toBe(liveXRef);
		expect(scratch.liveY).toBe(liveYRef);
		expect(scratch.liveX).toHaveLength(1);
		expect(scratch.liveY).toHaveLength(0);
	});

	it("preserves extra axis fields on the clone (shallow spread)", () => {
		const scratch = createLiveAxesScratch<Axis, Axis>();
		const x = { ...xAxis("X", 0, 10), name: "X-label" };
		const { liveX } = applyAxisUpdates(
			scratch,
			[x],
			[],
			{ X: { min: 5, max: 15 } },
			{},
		);
		expect(liveX[0].name).toBe("X-label");
	});
});

describe("resetAxisTargets", () => {
	it("writes each axis' min/max into the supplied target records", () => {
		const targetX: Record<string, { min: number; max: number }> = {};
		const targetY: Record<string, { min: number; max: number }> = {};
		resetAxisTargets(
			[
				{ id: "X1", min: 0, max: 10 },
				{ id: "X2", min: -5, max: 5 },
			],
			[{ id: "Y", min: 0, max: 100 }],
			targetX,
			targetY,
		);
		expect(targetX).toEqual({
			X1: { min: 0, max: 10 },
			X2: { min: -5, max: 5 },
		});
		expect(targetY).toEqual({ Y: { min: 0, max: 100 } });
	});

	it("overwrites existing target entries", () => {
		const targetX: Record<string, { min: number; max: number }> = {
			X: { min: 99, max: 99 },
		};
		resetAxisTargets(
			[{ id: "X", min: 0, max: 10 }],
			[],
			targetX,
			{},
		);
		expect(targetX.X).toEqual({ min: 0, max: 10 });
	});

	it("leaves the target record unchanged when given empty axis arrays", () => {
		const targetX: Record<string, { min: number; max: number }> = {
			X: { min: 1, max: 2 },
		};
		resetAxisTargets([], [], targetX, {});
		expect(targetX).toEqual({ X: { min: 1, max: 2 } });
	});

	it("stores fresh objects (not references to the source axes)", () => {
		const axis = { id: "X", min: 0, max: 10 };
		const targetX: Record<string, { min: number; max: number }> = {};
		resetAxisTargets([axis], [], targetX, {});
		expect(targetX.X).not.toBe(axis);
		expect(targetX.X).toEqual({ min: 0, max: 10 });
	});
});

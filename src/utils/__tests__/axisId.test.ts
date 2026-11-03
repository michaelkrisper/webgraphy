import { describe, expect, it } from "vitest";
import { DEFAULT_X_AXIS_ID, getAxisById } from "../axisId";

const slots = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ id: `axis-${i + 1}`, n: i }));

describe("getAxisById", () => {
	it("maps canonical ids straight to their slot", () => {
		const axes = slots(9);
		expect(getAxisById(axes, "axis-1")).toBe(axes[0]);
		expect(getAxisById(axes, "axis-9")).toBe(axes[8]);
		expect(getAxisById(axes, DEFAULT_X_AXIS_ID)).toBe(axes[0]);
	});

	it("falls back to a scan when the array is out of order", () => {
		const axes = slots(3).reverse();
		expect(getAxisById(axes, "axis-1")?.n).toBe(0);
		expect(getAxisById(axes, "axis-3")?.n).toBe(2);
	});

	it("finds non-canonical ids and returns undefined for unknown ones", () => {
		const axes = [{ id: "custom" }, { id: "axis-2" }];
		expect(getAxisById(axes, "custom")).toBe(axes[0]);
		expect(getAxisById(axes, "axis-2")).toBe(axes[1]);
		expect(getAxisById(axes, "axis-0")).toBeUndefined();
		expect(getAxisById(axes, "axis-10")).toBeUndefined();
		expect(getAxisById(axes, "")).toBeUndefined();
		expect(getAxisById([], "axis-1")).toBeUndefined();
	});
});

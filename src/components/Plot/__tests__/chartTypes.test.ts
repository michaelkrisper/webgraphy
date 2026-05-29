import { describe, it, expect } from "vitest";
import { panTargetXAxisId, panTargetYAxisId } from "../chartTypes";

describe("chartTypes", () => {
	describe("panTargetXAxisId", () => {
		it("returns xAxisId if present", () => {
			expect(panTargetXAxisId({ xAxisId: "x1" })).toBe("x1");
		});

		it("returns undefined for 'all'", () => {
			expect(panTargetXAxisId("all")).toBeUndefined();
		});

		it("returns undefined if only yAxisId is present", () => {
			expect(panTargetXAxisId({ yAxisId: "y1" })).toBeUndefined();
		});
	});

	describe("panTargetYAxisId", () => {
		it("returns yAxisId if present", () => {
			expect(panTargetYAxisId({ yAxisId: "y1" })).toBe("y1");
		});

		it("returns undefined for 'all'", () => {
			expect(panTargetYAxisId("all")).toBeUndefined();
		});

		it("returns undefined if only xAxisId is present", () => {
			expect(panTargetYAxisId({ xAxisId: "x1" })).toBeUndefined();
		});
	});
});

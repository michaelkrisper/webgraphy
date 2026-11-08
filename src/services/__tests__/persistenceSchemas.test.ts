import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../persistenceSchemas";

const config = (extra: Record<string, unknown> = {}) => ({
	series: [
		{
			id: "s1",
			sourceId: "ds1",
			name: "Temp",
			yColumn: "Temp",
			yAxisId: "axis-1",
			pointStyle: "none",
			pointColor: "#123456",
			lineStyle: "solid",
			lineColor: "#123456",
			...extra,
		},
	],
	legendVisible: true,
	crosshairVisible: true,
});

const widthOf = (raw: unknown) => {
	const parsed = ConfigSchema.safeParse(raw);
	expect(parsed.success).toBe(true);
	return parsed.data?.series[0].lineWidth;
};

describe("SeriesConfigSchema lineWidth", () => {
	it("is optional: configs saved before widths existed load unchanged", () => {
		expect(widthOf(config())).toBeUndefined();
	});

	it.each([0.5, 1.5, 4, 10])("keeps %s px", (w) => {
		expect(widthOf(config({ lineWidth: w }))).toBe(w);
	});

	it.each([0.25, 10.5, Number.POSITIVE_INFINITY, Number.NaN, "2", null])(
		"drops %s instead of rejecting the whole config",
		(w) => {
			expect(widthOf(config({ lineWidth: w }))).toBeUndefined();
		},
	);
});

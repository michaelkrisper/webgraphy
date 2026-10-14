import { describe, expect, it } from "vitest";
import {
	formatAxisValue,
	parseAxisValue,
	validateAxisRange,
} from "../axisRange";

const local = (
	y: number,
	mo: number,
	d: number,
	h = 0,
	mi = 0,
	s = 0,
	ms = 0,
) => new Date(y, mo, d, h, mi, s, ms).getTime() / 1000;

describe("parseAxisValue", () => {
	it("reads plain and scientific numbers", () => {
		expect(parseAxisValue("42", false)).toBe(42);
		expect(parseAxisValue(" -1.5 ", false)).toBe(-1.5);
		expect(parseAxisValue(".5", false)).toBe(0.5);
		expect(parseAxisValue("1e-3", false)).toBe(0.001);
		expect(parseAxisValue("2.5E+6", false)).toBe(2.5e6);
	});

	it("rejects what Number() would wrongly accept", () => {
		expect(parseAxisValue("", false)).toBeNaN();
		expect(parseAxisValue("   ", false)).toBeNaN();
		expect(parseAxisValue("0x10", false)).toBeNaN();
		expect(parseAxisValue("Infinity", false)).toBeNaN();
		expect(parseAxisValue("12abc", false)).toBeNaN();
		expect(parseAxisValue("2024-03-05", false)).toBeNaN();
	});

	it("reads dates in the axis' display form as local time", () => {
		expect(parseAxisValue("05.03.2024", true)).toBe(local(2024, 2, 5));
		expect(parseAxisValue("05.03.2024, 12:30", true)).toBe(
			local(2024, 2, 5, 12, 30),
		);
		expect(parseAxisValue("05.03.2024, 12:30:15,5", true)).toBe(
			local(2024, 2, 5, 12, 30, 15, 500),
		);
		expect(parseAxisValue("5.3.2024 08:00:00", true)).toBe(
			local(2024, 2, 5, 8, 0, 0),
		);
	});

	it("reads ISO dates and keeps numbers as epoch seconds on date axes", () => {
		expect(parseAxisValue("2024-03-05", true)).toBe(local(2024, 2, 5));
		expect(parseAxisValue("2024-03-05T00:00:00Z", true)).toBe(
			Date.UTC(2024, 2, 5) / 1000,
		);
		expect(parseAxisValue("1700000000", true)).toBe(1700000000);
	});

	it("rejects impossible dates instead of rolling them over", () => {
		expect(parseAxisValue("31.02.2024", true)).toBeNaN();
		expect(parseAxisValue("05.13.2024", true)).toBeNaN();
		expect(parseAxisValue("05.03.2024, 25:00", true)).toBeNaN();
		expect(parseAxisValue("not a date", true)).toBeNaN();
	});
});

describe("formatAxisValue", () => {
	it("round-trips through parseAxisValue", () => {
		for (const v of [0, -3.25, 1e-7, 123456.789, 0.1 + 0.2]) {
			const text = formatAxisValue(v, false);
			expect(parseAxisValue(text, false)).toBeCloseTo(v, 10);
		}
		expect(formatAxisValue(0.1 + 0.2, false)).toBe("0.3");
		const t = local(2024, 2, 5, 12, 30, 15, 500);
		expect(formatAxisValue(t, true)).toBe("05.03.2024, 12:30:15,5");
		expect(parseAxisValue(formatAxisValue(t, true), true)).toBe(t);
	});
});

describe("validateAxisRange", () => {
	const lin = { isDate: false, log: false };
	it("accepts min < max", () => {
		expect(validateAxisRange("-1", "1e2", lin)).toEqual({
			ok: true,
			min: -1,
			max: 100,
		});
	});

	it("flags the offending field", () => {
		expect(validateAxisRange("x", "1", lin)).toMatchObject({
			ok: false,
			field: "min",
		});
		expect(validateAxisRange("1", "", lin)).toMatchObject({
			ok: false,
			field: "max",
		});
		expect(validateAxisRange("5", "5", lin)).toEqual({
			ok: false,
			field: "max",
			error: "Max must be greater than Min",
		});
		expect(validateAxisRange("6", "5", lin)).toMatchObject({ ok: false });
	});

	it("requires a positive min on a log axis", () => {
		const log = { isDate: false, log: true };
		expect(validateAxisRange("0", "10", log)).toEqual({
			ok: false,
			field: "min",
			error: "Min must be greater than 0 on a log axis",
		});
		expect(validateAxisRange("-1", "10", log)).toMatchObject({ field: "min" });
		expect(validateAxisRange("1e-3", "10", log)).toEqual({
			ok: true,
			min: 0.001,
			max: 10,
		});
		// Linear axes take non-positive ranges.
		expect(validateAxisRange("0", "10", lin)).toMatchObject({ ok: true });
	});

	it("takes dates on date axes", () => {
		const date = { isDate: true, log: false };
		expect(validateAxisRange("01.01.2024", "2024-02-01", date)).toEqual({
			ok: true,
			min: local(2024, 0, 1),
			max: local(2024, 1, 1),
		});
		expect(validateAxisRange("01.02.2024", "01.01.2024", date)).toMatchObject({
			ok: false,
			field: "max",
		});
		expect(validateAxisRange("soon", "01.01.2024", date)).toEqual({
			ok: false,
			field: "min",
			error: "Min must be a number or date",
		});
	});
});

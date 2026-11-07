import { afterEach, describe, expect, it, vi } from "vitest";
import {
	decimalSeparator,
	displayLocale,
	formatCount,
	formatFixed,
	formatReading,
	formatSignificant,
	lazyDateFormat,
	lazyTimeFormat,
	localizeExponential,
	setDisplayLocale,
} from "../displayFormat";

afterEach(() => {
	vi.restoreAllMocks();
	setDisplayLocale("en-US");
});

describe("display locale", () => {
	it("defaults to the runtime's (browser's) locale", () => {
		setDisplayLocale(undefined);
		expect(displayLocale()).toBe(
			new Intl.NumberFormat().resolvedOptions().locale,
		);
	});

	it("reports the resolved tag of an explicit locale", () => {
		setDisplayLocale("de-DE");
		expect(displayLocale()).toBe("de-DE");
	});

	it("rebuilds cached formatters when the locale changes", () => {
		setDisplayLocale("en-US");
		const date = lazyDateFormat({ month: "short" });
		const d = new Date(2024, 2, 5);
		expect(formatFixed(1.5, 1)).toBe("1.5");
		expect(date().format(d)).toBe("Mar");
		setDisplayLocale("de-DE");
		expect(formatFixed(1.5, 1)).toBe("1,5");
		expect(date().format(d)).toMatch(/^Mär/);
	});

	it("pads hours on a 24-hour clock only", () => {
		const time = lazyTimeFormat({ minute: "2-digit" });
		const d = new Date(2024, 2, 5, 9, 5);
		setDisplayLocale("de-DE");
		expect(time().format(d)).toBe("09:05");
		setDisplayLocale("en-GB");
		expect(time().format(d)).toBe("09:05");
		setDisplayLocale("en-US");
		expect(time().format(d).replace(/\s/g, " ")).toBe("9:05 AM");
	});

	it("builds each formatter once, not per call", () => {
		setDisplayLocale("fr-FR");
		const spy = vi.spyOn(Intl, "NumberFormat");
		for (let i = 0; i < 50; i++) {
			formatFixed(i / 3, 2);
			formatSignificant(i * 1.1, 6, { grouping: false });
			formatReading(i / 7);
			formatCount(i * 1000);
		}
		expect(spy).toHaveBeenCalledTimes(4);
	});
});

describe("number formats", () => {
	it("axis ticks: fixed decimals in the locale, never grouped", () => {
		setDisplayLocale("en-US");
		expect(formatFixed(12345.678, 2)).toBe("12345.68");
		expect(formatFixed(-0.5, 0)).toBe("-1");
		setDisplayLocale("de-DE");
		expect(formatFixed(12345.678, 2)).toBe("12345,68");
		expect(formatFixed(3, 2)).toBe("3,00");
	});

	it("significant digits, signed and grouped on request", () => {
		setDisplayLocale("de-DE");
		expect(formatSignificant(1234567.891, 6)).toBe("1.234.570");
		expect(formatSignificant(0.00123456789, 6)).toBe("0,00123457");
		expect(formatSignificant(2.5, 6, { signed: true })).toBe("+2,5");
		expect(formatSignificant(0, 6, { signed: true })).toBe("0");
		expect(formatSignificant(1234.5, 6, { grouping: false })).toBe("1234,5");
	});

	it("readings keep small values instead of rounding them to 0", () => {
		setDisplayLocale("en-US");
		expect(formatReading(0.000123)).toBe("0.000123");
		expect(formatReading(1234567.891)).toBe("1,234,568");
		expect(formatReading(0.1 + 0.2)).toBe("0.3");
		setDisplayLocale("de-DE");
		expect(formatReading(1234.5)).toBe("1.234,5");
		expect(formatReading(1.23456789, 3)).toBe("1,23");
	});

	it("counts are grouped", () => {
		setDisplayLocale("en-US");
		expect(formatCount(1234567)).toBe("1,234,567");
		setDisplayLocale("de-DE");
		expect(formatCount(1234567)).toBe("1.234.567");
	});

	it("exponent strings take the locale's decimal separator", () => {
		setDisplayLocale("en-US");
		expect(decimalSeparator()).toBe(".");
		expect(localizeExponential("1.25e+6")).toBe("1.25e+6");
		setDisplayLocale("de-DE");
		expect(decimalSeparator()).toBe(",");
		expect(localizeExponential("1.25e+6")).toBe("1,25e+6");
		expect(localizeExponential("3e-7")).toBe("3e-7");
	});
});

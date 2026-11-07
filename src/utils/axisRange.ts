// Parsing and validation for typed axis ranges (the axis range popover).

import { formatIsoLocal } from "./time";
import { parseDate } from "./value-parser";

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3})\d*)?)?`;
// German-style day-first dates: "05.03.2024, 12:30:15,5".
const DOTTED_DATE = new RegExp(
	String.raw`^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+${TIME})?$`,
);
// The prefill form (formatIsoLocal), read as local time: "2024-03-05 12:30:15.5".
const ISO_LOCAL_DATE = new RegExp(
	String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+${TIME})?$`,
);

/** null when `text` is in neither local wall-clock form. */
function parseDisplayDate(text: string): number | null {
	let m = DOTTED_DATE.exec(text);
	let day: number;
	let month: number;
	let year: number;
	if (m) [day, month, year] = [+m[1], +m[2], +m[3]];
	else {
		m = ISO_LOCAL_DATE.exec(text);
		if (!m) return null;
		[year, month, day] = [+m[1], +m[2], +m[3]];
	}
	const [hour, minute, second] = [+(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
	if (hour > 23 || minute > 59 || second > 59) return Number.NaN;
	// Local wall-clock time, like the axis labels and parseDate.
	const d = new Date(0);
	d.setFullYear(year, month - 1, day);
	d.setHours(hour, minute, second, m[7] ? +m[7].padEnd(3, "0") : 0);
	// Rejects 31.02. and month 13 instead of rolling them over.
	if (d.getMonth() !== month - 1 || d.getDate() !== day) return Number.NaN;
	return d.getTime() / 1000;
}

/**
 * Reads one typed bound. Numbers accept scientific notation; date axes
 * (values in epoch seconds) also accept local "05.03.2024, 12:30" and
 * "2024-03-05 12:30" forms and other ISO strings, and still take a plain
 * number as epoch seconds.
 */
export function parseAxisValue(text: string, isDate: boolean): number {
	const t = text.trim();
	if (t === "") return Number.NaN;
	if (NUMBER.test(t)) return Number(t);
	if (!isDate) return Number.NaN;
	// Date's own parser would read "05.13.2024" as May 13th.
	const display = parseDisplayDate(t);
	if (display !== null) return display;
	const iso = parseDate(t);
	return Number.isFinite(iso) ? iso : Number.NaN;
}

/** Prefill text: locale-independent and round-trippable for dates and numbers. */
export function formatAxisValue(value: number, isDate: boolean): string {
	if (!Number.isFinite(value)) return "";
	if (isDate) return formatIsoLocal(value);
	// 12 significant digits hide float noise (0.30000000000000004) but keep
	// what a zoom can resolve.
	return String(Number(value.toPrecision(12)));
}

export type RangeField = "min" | "max";

export type RangeResult =
	| { ok: true; min: number; max: number }
	| { ok: false; field: RangeField; error: string };

export function validateAxisRange(
	minText: string,
	maxText: string,
	opts: { isDate: boolean; log: boolean },
): RangeResult {
	const what = opts.isDate ? "a number or date" : "a number";
	const min = parseAxisValue(minText, opts.isDate);
	if (!Number.isFinite(min))
		return { ok: false, field: "min", error: `Min must be ${what}` };
	const max = parseAxisValue(maxText, opts.isDate);
	if (!Number.isFinite(max))
		return { ok: false, field: "max", error: `Max must be ${what}` };
	if (opts.log && min <= 0)
		return {
			ok: false,
			field: "min",
			error: "Min must be greater than 0 on a log axis",
		};
	if (!(min < max))
		return { ok: false, field: "max", error: "Max must be greater than Min" };
	return { ok: true, min, max };
}

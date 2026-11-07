import { lazyDateFormat, lazyTimeFormat } from "./displayFormat";

export type TimeUnit =
	| "second"
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| "year";

interface TimeStep {
	unit: TimeUnit;
	value: number;
}

export interface TimeTick {
	timestamp: number;
	label: string;
}

/** Hard caps guarding the tick/label loops against pathological time ranges. */
const MAX_TIME_TICKS = 500;
const MAX_SECONDARY_LABELS = 100;

// Tick labels are regenerated every rAF frame while panning/zooming, so each
// label shape keeps one cached formatter (displayFormat.ts) in the display
// locale: field order, separators and 12/24 h follow the browser.
const lazyFmt = (options: Intl.DateTimeFormatOptions, withHour = false) => {
	const fmt = (withHour ? lazyTimeFormat : lazyDateFormat)(options);
	return (d: Date) => fmt().format(d);
};
const formatSeconds = lazyFmt({ minute: "2-digit", second: "2-digit" }, true);
const formatMinutes = lazyFmt({ minute: "2-digit" }, true);
const formatDayMonth = lazyFmt({ day: "2-digit", month: "2-digit" });
const formatDayMonthShort = lazyFmt({ day: "numeric", month: "numeric" });
const formatMonthShort = lazyFmt({ month: "short" });
const formatDay = lazyFmt({
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});
const formatMonthYear = lazyFmt({ month: "2-digit", year: "numeric" });
const fullDateTime = lazyTimeFormat({
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	minute: "2-digit",
	second: "2-digit",
	fractionalSecondDigits: 3,
});

export const MS_PER_SECOND = 1000;

export const UNIT_SECONDS = {
	second: 1,
	minute: 60,
	hour: 3600,
	day: 86400,
	week: 604800,
	month: 2592000, // Approximate
	year: 31536000, // Approximate
};

const TIME_STEPS: TimeStep[] = [
	{ unit: "second", value: 1 },
	{ unit: "second", value: 2 },
	{ unit: "second", value: 5 },
	{ unit: "second", value: 10 },
	{ unit: "second", value: 15 },
	{ unit: "second", value: 30 },
	{ unit: "minute", value: 1 },
	{ unit: "minute", value: 2 },
	{ unit: "minute", value: 5 },
	{ unit: "minute", value: 10 },
	{ unit: "minute", value: 15 },
	{ unit: "minute", value: 30 },
	{ unit: "hour", value: 1 },
	{ unit: "hour", value: 2 },
	{ unit: "hour", value: 3 },
	{ unit: "hour", value: 4 },
	{ unit: "hour", value: 6 },
	{ unit: "hour", value: 12 },
	{ unit: "day", value: 1 },
	{ unit: "day", value: 2 },
	{ unit: "day", value: 3 },
	{ unit: "day", value: 5 },
	{ unit: "week", value: 1 },
	{ unit: "month", value: 1 },
	{ unit: "month", value: 2 },
	{ unit: "month", value: 3 },
	{ unit: "month", value: 4 },
	{ unit: "month", value: 6 },
	{ unit: "year", value: 1 },
	{ unit: "year", value: 2 },
	{ unit: "year", value: 5 },
	{ unit: "year", value: 10 },
	{ unit: "year", value: 20 },
	{ unit: "year", value: 50 },
	{ unit: "year", value: 100 },
];

export function getTimeStep(rangeSeconds: number, maxTicks: number): TimeStep {
	const idealStep = rangeSeconds / maxTicks;
	for (const step of TIME_STEPS) {
		const stepSeconds = UNIT_SECONDS[step.unit] * step.value;
		if (stepSeconds >= idealStep) return step;
	}
	return TIME_STEPS[TIME_STEPS.length - 1];
}

export function generateTimeTicks(
	min: number,
	max: number,
	step: TimeStep,
): TimeTick[] {
	const ticks: TimeTick[] = [];
	const { unit, value } = step;

	const d = new Date(min * 1000);
	if (unit === "second") {
		d.setMilliseconds(0);
		d.setSeconds(Math.floor(d.getSeconds() / value) * value);
	} else if (unit === "minute") {
		d.setSeconds(0, 0);
		d.setMinutes(Math.floor(d.getMinutes() / value) * value);
	} else if (unit === "hour") {
		d.setMinutes(0, 0, 0);
		d.setHours(Math.floor(d.getHours() / value) * value);
	} else if (unit === "day") {
		d.setHours(0, 0, 0, 0);
		// For multiple days, we align to the start of the month to be stable
		if (value > 1) {
			d.setDate(1);
		}
	} else if (unit === "week") {
		d.setHours(0, 0, 0, 0);
		const day = d.getDay();
		const diff = day === 0 ? -6 : 1 - day;
		d.setDate(d.getDate() + diff);
	} else if (unit === "month") {
		d.setHours(0, 0, 0, 0);
		d.setDate(1);
		d.setMonth(Math.floor(d.getMonth() / value) * value);
	} else if (unit === "year") {
		d.setHours(0, 0, 0, 0);
		d.setMonth(0, 1);
		d.setFullYear(Math.floor(d.getFullYear() / value) * value);
	}

	// Move back one step for margin
	if (unit === "second") d.setSeconds(d.getSeconds() - value);
	else if (unit === "minute") d.setMinutes(d.getMinutes() - value);
	else if (unit === "hour") d.setHours(d.getHours() - value);
	else if (unit === "day") d.setDate(d.getDate() - value);
	else if (unit === "week") d.setDate(d.getDate() - 7 * value);
	else if (unit === "month") d.setMonth(d.getMonth() - value);
	else if (unit === "year") d.setFullYear(d.getFullYear() - value);

	let current = d.getTime() / 1000;
	// Use a slightly larger max for margin (approx 1 step)
	const marginSeconds =
		(unit === "month"
			? 31 * 86400
			: unit === "year"
				? 366 * 86400
				: UNIT_SECONDS[unit as keyof typeof UNIT_SECONDS] || 1) * value;
	const extendedMax = max + marginSeconds;

	while (current <= extendedMax) {
		ticks.push({
			timestamp: current,
			label: formatPrimaryLabelFromDate(d, unit),
		});

		if (unit === "second") d.setSeconds(d.getSeconds() + value);
		else if (unit === "minute") d.setMinutes(d.getMinutes() + value);
		else if (unit === "hour") d.setHours(d.getHours() + value);
		else if (unit === "day") d.setDate(d.getDate() + value);
		else if (unit === "week") d.setDate(d.getDate() + 7 * value);
		else if (unit === "month") d.setMonth(d.getMonth() + value);
		else if (unit === "year") d.setFullYear(d.getFullYear() + value);

		current = d.getTime() / 1000;
		if (ticks.length > MAX_TIME_TICKS) break;
	}

	return ticks;
}

/** A date-axis tick label at the granularity of `unit`. */
export function formatPrimaryLabelFromDate(d: Date, unit: TimeUnit): string {
	switch (unit) {
		case "second":
			return formatSeconds(d);
		case "minute":
		case "hour":
			return formatMinutes(d);
		case "day":
			return formatDayMonth(d);
		case "week":
			return formatDayMonthShort(d);
		case "month":
			return formatMonthShort(d);
		case "year":
			return String(d.getFullYear());
		default:
			return "";
	}
}

export interface SecondaryLabel {
	timestamp: number;
	label: string;
}

/** Approx. width (px) reserved per "MM/YYYY" secondary label before it gets too
 * tight and we fall back to plain year labels. */
const MONTH_LABEL_MIN_PX = 64;

export function generateSecondaryLabels(
	min: number,
	max: number,
	step: TimeStep,
	chartWidth = Infinity,
): SecondaryLabel[] {
	const labels: SecondaryLabel[] = [];
	const { unit } = step;

	const d = new Date(0);

	if (unit === "second" || unit === "minute" || unit === "hour") {
		d.setTime(min * 1000);
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - 1); // margin
		let current = d.getTime() / 1000;
		while (current <= max + 86400) {
			labels.push({
				timestamp: current,
				label: formatDay(d),
			});
			d.setDate(d.getDate() + 1);
			current = d.getTime() / 1000;
			if (labels.length > MAX_SECONDARY_LABELS) break;
		}
		return labels;
	}

	// day/week: prefer month-granular "MM/YYYY" labels, but if the range spans so
	// many months they would crowd, fall back to plain year labels.
	if (unit === "day" || unit === "week") {
		const monthSpan = (max - min) / UNIT_SECONDS.month + 1;
		const fitsMonths = monthSpan * MONTH_LABEL_MIN_PX <= chartWidth;
		if (fitsMonths) {
			d.setTime(min * 1000);
			d.setHours(0, 0, 0, 0);
			d.setDate(1);
			d.setMonth(d.getMonth() - 1); // margin
			let current = d.getTime() / 1000;
			while (current <= max + UNIT_SECONDS.month) {
				labels.push({
					timestamp: current,
					label: formatMonthYear(d),
				});
				d.setMonth(d.getMonth() + 1);
				current = d.getTime() / 1000;
				if (labels.length > MAX_SECONDARY_LABELS) break;
			}
			return labels;
		}
	}

	// month/year (and crowded day/week): year labels
	d.setTime(min * 1000);
	d.setHours(0, 0, 0, 0);
	d.setMonth(0, 1);
	d.setFullYear(d.getFullYear() - 1); // margin
	let current = d.getTime() / 1000;
	while (current <= max + 31536000) {
		labels.push({
			timestamp: current,
			label: String(d.getFullYear()),
		});
		d.setFullYear(d.getFullYear() + 1);
		current = d.getTime() / 1000;
		if (labels.length > MAX_SECONDARY_LABELS) break;
	}

	return labels;
}

/**
 * Date and time to the millisecond, as the tooltip and data table show it.
 * Trailing zeros of the fraction are dropped, with its separator when none
 * remain; parts rather than a regex since the fraction need not end the
 * string ("2:30:15.5 PM").
 */
export function formatFullDate(ts: number): string {
	const parts = fullDateTime().formatToParts(new Date(ts * 1000));
	let out = "";
	for (let i = 0; i < parts.length; i++) {
		const next = parts[i + 1];
		if (next?.type === "fractionalSecond") {
			const digits = next.value.replace(/0+$/, "");
			if (digits) out += parts[i].value + digits;
			i++;
			continue;
		}
		out += parts[i].value;
	}
	return out;
}

/**
 * Local date and time as "2024-03-05 12:30:15.5": unambiguous in every
 * locale, so a typed range round-trips (axisRange.ts parses it back).
 */
export function formatIsoLocal(ts: number): string {
	const d = new Date(Math.round(ts * 1000));
	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	const ms = d.getMilliseconds();
	const frac = ms ? `.${pad(ms, 3).replace(/0+$/, "")}` : "";
	return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${frac}`;
}

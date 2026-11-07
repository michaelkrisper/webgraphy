/**
 * Display formatting in the browser's locale, for everything the user reads:
 * axis tick numbers and dates, the crosshair tooltip, the data table, the
 * measurement readout and the statistics. One locale everywhere, so a German
 * user no longer sees 1.5 on the axis and 1,5 in the tooltip.
 *
 * Machine-readable text — CSV export, session files, formula input, the
 * clipboard TSV — must not come through here; it keeps "." decimals.
 *
 * Building an Intl formatter costs ~50x a format() call and tick labels are
 * formatted per frame in the render worker, so each formatter is built once
 * per locale and reused. The worker is handed the main thread's resolved
 * locale (setDisplayLocale) so both sides draw identical labels.
 */

/** undefined: the runtime's default, i.e. the browser locale. */
let locale: string | undefined;
let generation = 0;
let resolved: string | undefined;
const fixedFormats: Intl.NumberFormat[] = [];
const significantFormats: Intl.NumberFormat[] = [];

/** Switches every formatter to `tag` (undefined: back to the browser's). */
export function setDisplayLocale(tag: string | undefined): void {
	locale = tag;
	generation++;
	resolved = undefined;
	fixedFormats.length = 0;
	significantFormats.length = 0;
}

/** The BCP 47 tag formatting actually uses, e.g. "de-DE". */
export function displayLocale(): string {
	resolved ??= new Intl.NumberFormat(locale).resolvedOptions().locale;
	return resolved;
}

/**
 * A formatter built on first use and rebuilt after a locale change. Lazy also
 * because a DateTimeFormat captures the timezone when constructed, and tests
 * set TZ after module load.
 */
function lazy<T>(make: (tag: string | undefined) => T): () => T {
	let value: T | undefined;
	let builtFor = -1;
	return () => {
		if (builtFor !== generation) {
			value = make(locale);
			builtFor = generation;
		}
		return value as T;
	};
}

export const lazyDateFormat = (
	options: Intl.DateTimeFormatOptions,
): (() => Intl.DateTimeFormat) =>
	lazy((tag) => new Intl.DateTimeFormat(tag, options));

/**
 * Like lazyDateFormat, plus the hour: zero-padded where the locale counts 24
 * hours ("09:05", as the axis always showed), unpadded on a 12-hour clock
 * ("9:05 AM"), which is how those locales write it.
 */
export const lazyTimeFormat = (
	options: Intl.DateTimeFormatOptions,
): (() => Intl.DateTimeFormat) =>
	lazy((tag) => {
		const h12 = new Intl.DateTimeFormat(tag, {
			hour: "numeric",
		}).resolvedOptions().hour12;
		return new Intl.DateTimeFormat(tag, {
			...options,
			hour: h12 ? "numeric" : "2-digit",
		});
	});

/** Exactly `digits` decimals, ungrouped to stay compact: axis tick labels. */
export function formatFixed(value: number, digits: number): string {
	let fmt = fixedFormats[digits];
	if (!fmt) {
		fmt = new Intl.NumberFormat(locale, {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
			useGrouping: false,
		});
		fixedFormats[digits] = fmt;
	}
	return fmt.format(value);
}

/**
 * At most `digits` significant digits. `signed` shows "+" on positives (a
 * delta); `grouping: false` keeps axis labels compact.
 */
export function formatSignificant(
	value: number,
	digits: number,
	{ signed = false, grouping = true } = {},
): string {
	const key = digits * 4 + (signed ? 2 : 0) + (grouping ? 1 : 0);
	let fmt = significantFormats[key];
	if (!fmt) {
		fmt = new Intl.NumberFormat(locale, {
			maximumSignificantDigits: digits,
			signDisplay: signed ? "exceptZero" : "auto",
			useGrouping: grouping,
		});
		significantFormats[key] = fmt;
	}
	return fmt.format(value);
}

const readingFormat = lazy(
	(tag) => new Intl.NumberFormat(tag, { maximumFractionDigits: 10 }),
);

/**
 * A data value as the tooltip, data table and chart description show it:
 * `precision` significant digits hide float noise, and up to ten decimals
 * keep a 0.000123 from collapsing to "0" (Intl's default stops at three).
 */
export function formatReading(value: number, precision = 7): string {
	return readingFormat().format(Number.parseFloat(value.toPrecision(precision)));
}

const countFormat = lazy((tag) => new Intl.NumberFormat(tag));

/** A count with the locale's digit grouping: "12,345" / "12.345". */
export const formatCount = (n: number): string => countFormat().format(n);

const decimal = lazy(
	(tag) =>
		new Intl.NumberFormat(tag)
			.formatToParts(1.5)
			.find((p) => p.type === "decimal")?.value ?? ".",
);

/** The locale's decimal separator. */
export const decimalSeparator = (): string => decimal();

/** A `toExponential` string with the locale's decimal separator. */
export function localizeExponential(s: string): string {
	const sep = decimal();
	return sep === "." ? s : s.replace(".", sep);
}

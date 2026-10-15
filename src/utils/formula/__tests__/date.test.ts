import { describe, expect, it } from "vitest";
import { dateKey, granularityOf, toMillis } from "../date";

describe("toMillis", () => {
	const ms = Date.UTC(2024, 5, 15, 12, 30, 45);

	it("scales seconds up", () => {
		expect(toMillis(ms / 1000)).toBe(ms);
	});

	it("passes milliseconds through", () => {
		expect(toMillis(ms)).toBe(ms);
	});

	it("scales microseconds down", () => {
		expect(toMillis(ms * 1000)).toBe(ms);
	});
});

describe("dateKey", () => {
	const a = new Date(2024, 0, 2, 3, 4, 5);
	const sameMinute = new Date(2024, 0, 2, 3, 4, 59);
	const sameHour = new Date(2024, 0, 2, 3, 59, 0);
	const sameDay = new Date(2024, 0, 2, 23, 0, 0);

	it("groups by day", () => {
		expect(dateKey(a, "day")).toBe(dateKey(sameDay, "day"));
		expect(dateKey(a, "day")).not.toBe(dateKey(new Date(2024, 0, 3), "day"));
	});

	it("groups by hour", () => {
		expect(dateKey(a, "hour")).toBe(dateKey(sameHour, "hour"));
		expect(dateKey(a, "hour")).not.toBe(dateKey(sameDay, "hour"));
	});

	it("groups by minute", () => {
		expect(dateKey(a, "minute")).toBe(dateKey(sameMinute, "minute"));
		expect(dateKey(a, "minute")).not.toBe(dateKey(sameHour, "minute"));
	});

	it("groups by second", () => {
		expect(dateKey(a, "second")).toBe(
			dateKey(new Date(2024, 0, 2, 3, 4, 5, 999), "second"),
		);
		expect(dateKey(a, "second")).not.toBe(dateKey(sameMinute, "second"));
	});

	it("does not collide across months with the same day number", () => {
		expect(dateKey(new Date(2024, 0, 12), "day")).not.toBe(
			dateKey(new Date(2024, 1, 2), "day"),
		);
	});
});

describe("granularityOf", () => {
	it("derives the granularity from the function-name suffix", () => {
		expect(granularityOf("time_avg_day")).toBe("day");
		expect(granularityOf("time_avg_hour")).toBe("hour");
		expect(granularityOf("time_sum_minute")).toBe("minute");
		expect(granularityOf("time_avg_second")).toBe("second");
		expect(granularityOf("anything_else")).toBe("second");
	});
});

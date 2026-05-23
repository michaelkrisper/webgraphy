import { describe, expect, it } from "vitest";
import { resolveLegacyName } from "../formulaFunctions";

describe("resolveLegacyName", () => {
	it("should resolve avgN patterns", () => {
		expect(resolveLegacyName("avg5")).toEqual({
			canonical: "rolling",
			constArg: 5,
		});
		expect(resolveLegacyName("avg10c")).toEqual({
			canonical: "rollingc",
			constArg: 10,
		});
		expect(resolveLegacyName("avg15l")).toEqual({
			canonical: "rolling",
			constArg: 15,
		});
		expect(resolveLegacyName("avg20r")).toEqual({
			canonical: "rollingr",
			constArg: 20,
		});
	});

	it("should resolve avgN[smhd] patterns", () => {
		// Seconds
		expect(resolveLegacyName("avg30s")).toEqual({
			canonical: "rollingtime",
			constArg: 30,
		});
		expect(resolveLegacyName("avg30sc")).toEqual({
			canonical: "rollingtimec",
			constArg: 30,
		});
		expect(resolveLegacyName("avg30sr")).toEqual({
			canonical: "rollingtimer",
			constArg: 30,
		});

		// Minutes
		expect(resolveLegacyName("avg5m")).toEqual({
			canonical: "rollingtime",
			constArg: 300,
		});
		expect(resolveLegacyName("avg5mc")).toEqual({
			canonical: "rollingtimec",
			constArg: 300,
		});

		// Hours
		expect(resolveLegacyName("avg2h")).toEqual({
			canonical: "rollingtime",
			constArg: 7200,
		});
		expect(resolveLegacyName("avg2hr")).toEqual({
			canonical: "rollingtimer",
			constArg: 7200,
		});

		// Days
		expect(resolveLegacyName("avg1d")).toEqual({
			canonical: "rollingtime",
			constArg: 86400,
		});
		expect(resolveLegacyName("avg1dc")).toEqual({
			canonical: "rollingtimec",
			constArg: 86400,
		});
	});

	it("should resolve avg/sum interval patterns and strip suffixes", () => {
		// avg
		expect(resolveLegacyName("avgday")).toEqual({ canonical: "avgday" });
		expect(resolveLegacyName("avghour")).toEqual({ canonical: "avghour" });
		expect(resolveLegacyName("avgminute")).toEqual({ canonical: "avgminute" });
		expect(resolveLegacyName("avgsecond")).toEqual({ canonical: "avgsecond" });

		// avg with alignment suffix
		expect(resolveLegacyName("avgdayc")).toEqual({ canonical: "avgday" });
		expect(resolveLegacyName("avghourr")).toEqual({ canonical: "avghour" });
		expect(resolveLegacyName("avgminutel")).toEqual({ canonical: "avgminute" });
		expect(resolveLegacyName("avgsecondc")).toEqual({ canonical: "avgsecond" });

		// sum
		expect(resolveLegacyName("sumday")).toEqual({ canonical: "sumday" });
		expect(resolveLegacyName("sumhour")).toEqual({ canonical: "sumhour" });
		expect(resolveLegacyName("summinute")).toEqual({ canonical: "summinute" });
		expect(resolveLegacyName("sumsecond")).toEqual({ canonical: "sumsecond" });

		// sum with alignment suffix
		expect(resolveLegacyName("sumdayc")).toEqual({ canonical: "sumday" });
		expect(resolveLegacyName("sumhourr")).toEqual({ canonical: "sumhour" });
		expect(resolveLegacyName("summinutel")).toEqual({ canonical: "summinute" });
		expect(resolveLegacyName("sumsecondc")).toEqual({ canonical: "sumsecond" });
	});

	it("should be case-insensitive", () => {
		expect(resolveLegacyName("AVG5")).toEqual({
			canonical: "rolling",
			constArg: 5,
		});
		expect(resolveLegacyName("Avg5C")).toEqual({
			canonical: "rollingc",
			constArg: 5,
		});
		expect(resolveLegacyName("AVG5M")).toEqual({
			canonical: "rollingtime",
			constArg: 300,
		});
		expect(resolveLegacyName("AvgDaY")).toEqual({ canonical: "avgday" });
		expect(resolveLegacyName("SUMHOURc")).toEqual({ canonical: "sumhour" });
	});

	it("should return null for unknown patterns", () => {
		expect(resolveLegacyName("unknown")).toBeNull();
		expect(resolveLegacyName("avg")).toBeNull();
		expect(resolveLegacyName("avgX")).toBeNull();
		expect(resolveLegacyName("avg5x")).toBeNull(); // invalid alignment
		expect(resolveLegacyName("avg5y")).toBeNull(); // invalid unit
		expect(resolveLegacyName("sum")).toBeNull();
		expect(resolveLegacyName("summonth")).toBeNull(); // unsupported interval
	});
});

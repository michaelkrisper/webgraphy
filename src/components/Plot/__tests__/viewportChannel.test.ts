import { describe, expect, it } from "vitest";
import {
	createViewportSnapshot,
	VIEWPORT_SAB_BYTES,
	ViewportReader,
	ViewportWriter,
} from "../viewportChannel";

// Atomics work on non-shared ArrayBuffers, so the seqlock is testable
// without crossOriginIsolated.
const makeChannel = () => {
	const buf = new ArrayBuffer(VIEWPORT_SAB_BYTES);
	return {
		writer: new ViewportWriter(buf),
		reader: new ViewportReader(buf),
	};
};

describe("viewportChannel", () => {
	it("round-trips a snapshot", () => {
		const { writer, reader } = makeChannel();
		const out = createViewportSnapshot();

		writer.write(
			3,
			true,
			[{ min: 0, max: 100 }, { min: -5, max: 5 }],
			[{ min: 10, max: 20 }],
		);
		expect(reader.read(out)).toBe(true);
		expect(out.version).toBe(3);
		expect(out.interacting).toBe(true);
		expect(out.xCount).toBe(2);
		expect(out.yCount).toBe(1);
		expect(Array.from(out.ranges.slice(0, 6))).toEqual([
			0, 100, -5, 5, 10, 20,
		]);
	});

	it("reports nothing new until the next write", () => {
		const { writer, reader } = makeChannel();
		const out = createViewportSnapshot();

		expect(reader.read(out)).toBe(false); // nothing published yet
		writer.write(1, false, [{ min: 0, max: 1 }], []);
		expect(reader.read(out)).toBe(true);
		expect(reader.read(out)).toBe(false); // same seq
		writer.write(1, false, [{ min: 0, max: 2 }], []);
		expect(reader.read(out)).toBe(true);
		expect(out.ranges[1]).toBe(2);
	});

	it("keeps the latest of multiple writes", () => {
		const { writer, reader } = makeChannel();
		const out = createViewportSnapshot();
		for (let i = 1; i <= 5; i++) writer.write(1, false, [{ min: 0, max: i }], []);
		expect(reader.read(out)).toBe(true);
		expect(out.ranges[1]).toBe(5);
	});

	it("caps the axis count at the buffer capacity", () => {
		const { writer, reader } = makeChannel();
		const out = createViewportSnapshot();
		const many = Array.from({ length: 12 }, (_, i) => ({ min: i, max: i + 1 }));
		writer.write(1, false, many, many);
		expect(reader.read(out)).toBe(true);
		expect(out.xCount).toBe(9);
		expect(out.yCount).toBe(9);
	});
});

import { describe, expect, it } from "vitest";
import { crc32, pngChunk, setPngBlobDpi, setPngDpi } from "../pngMetadata";
import { PNG_1X1, physOf, readChunks } from "./pngFixture";

describe("crc32", () => {
	it("matches the standard check value", () => {
		expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
	});

	it("reproduces the CRCs of a real PNG", () => {
		expect(readChunks(PNG_1X1).map((c) => c.type)).toEqual([
			"IHDR",
			"IDAT",
			"IEND",
		]);
	});
});

describe("pngChunk", () => {
	it("writes length, type, data and CRC", () => {
		const chunk = pngChunk("tEXt", new Uint8Array([1, 2, 3]));
		expect(Array.from(chunk.subarray(0, 11))).toEqual([
			0, 0, 0, 3, 0x74, 0x45, 0x58, 0x74, 1, 2, 3,
		]);
		expect(new DataView(chunk.buffer).getUint32(11)).toBe(
			crc32(chunk.subarray(4, 11)),
		);
	});
});

describe("setPngDpi", () => {
	it("inserts pHYs right after IHDR in pixels per metre", () => {
		const out = setPngDpi(PNG_1X1, 300);
		expect(out).not.toBeNull();
		const chunks = readChunks(out as Uint8Array);
		expect(chunks.map((c) => c.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
		expect(chunks[1].data).toHaveLength(9);
		expect(physOf(chunks[1])).toEqual({ x: 11811, y: 11811, unit: 1 });
		// Everything else is carried over byte for byte.
		expect(Array.from((out as Uint8Array).subarray(0, 33))).toEqual(
			Array.from(PNG_1X1.subarray(0, 33)),
		);
		expect(out?.length).toBe(PNG_1X1.length + 21);
	});

	it("replaces an existing pHYs instead of adding a second one", () => {
		const once = setPngDpi(PNG_1X1, 72) as Uint8Array;
		const twice = setPngDpi(once, 192) as Uint8Array;
		const phys = readChunks(twice).filter((c) => c.type === "pHYs");
		expect(phys).toHaveLength(1);
		expect(physOf(phys[0]).x).toBe(Math.round(192 / 0.0254));
	});

	it("refuses input that is not a PNG or a dpi that is not positive", () => {
		expect(setPngDpi(new TextEncoder().encode("png"), 300)).toBeNull();
		expect(setPngDpi(PNG_1X1.subarray(0, 20), 300)).toBeNull();
		expect(setPngDpi(PNG_1X1, 0)).toBeNull();
		expect(setPngDpi(PNG_1X1, Number.NaN)).toBeNull();
	});
});

describe("setPngBlobDpi", () => {
	it("tags a PNG blob", async () => {
		const out = await setPngBlobDpi(
			new Blob([PNG_1X1], { type: "image/png" }),
			96,
		);
		expect(out.type).toBe("image/png");
		const chunks = readChunks(new Uint8Array(await out.arrayBuffer()));
		expect(physOf(chunks[1])).toEqual({ x: 3780, y: 3780, unit: 1 });
	});

	it("passes anything else through untouched", async () => {
		const blob = new Blob(["png"], { type: "image/png" });
		expect(await setPngBlobDpi(blob, 300)).toBe(blob);
	});
});

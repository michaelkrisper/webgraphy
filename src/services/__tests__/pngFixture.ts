import { expect } from "vitest";
import { crc32 } from "../pngMetadata";

/** A real 1×1 RGBA PNG as a browser encoder writes it: IHDR, IDAT, IEND. */
export const PNG_1X1 = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
	),
	(c) => c.charCodeAt(0),
);

export interface Chunk {
	type: string;
	data: Uint8Array;
	crc: number;
}

export function readChunks(png: Uint8Array): Chunk[] {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const chunks: Chunk[] = [];
	for (let at = 8; at < png.length; ) {
		const length = view.getUint32(at);
		const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
		const data = png.subarray(at + 8, at + 8 + length);
		const crc = view.getUint32(at + 8 + length);
		expect(crc32(png.subarray(at + 4, at + 8 + length))).toBe(crc);
		chunks.push({ type, data, crc });
		at += 12 + length;
	}
	return chunks;
}

export const physOf = (chunk: Chunk) => {
	const view = new DataView(
		chunk.data.buffer,
		chunk.data.byteOffset,
		chunk.data.byteLength,
	);
	return {
		x: view.getUint32(0),
		y: view.getUint32(4),
		unit: chunk.data[8],
	};
};

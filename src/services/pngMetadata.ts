const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const METRES_PER_INCH = 0.0254;

let crcTable: Uint32Array | undefined;

/** CRC-32 (ISO 3309, the PNG chunk checksum). */
export function crc32(bytes: Uint8Array): number {
	if (!crcTable) {
		crcTable = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crcTable[n] = c >>> 0;
		}
	}
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++)
		c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, 4-char type, data, CRC over type + data. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

const chunkType = (png: Uint8Array, at: number) =>
	String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7]);

/**
 * Returns `png` with a pHYs chunk declaring `dpi` right after IHDR (replacing
 * any existing one), or null when `png` is not a well-formed PNG.
 */
export function setPngDpi(
	png: Uint8Array,
	dpi: number,
): Uint8Array<ArrayBuffer> | null {
	if (!(Number.isFinite(dpi) && dpi > 0) || png.length < 8) return null;
	if (PNG_SIGNATURE.some((b, i) => png[i] !== b)) return null;

	const ppm = Math.round(dpi / METRES_PER_INCH);
	const phys = new Uint8Array(9);
	const physView = new DataView(phys.buffer);
	physView.setUint32(0, ppm);
	physView.setUint32(4, ppm);
	phys[8] = 1; // unit: metre

	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	const parts: Uint8Array[] = [png.subarray(0, 8)];
	let at = 8;
	while (at < png.length) {
		if (at + 12 > png.length) return null;
		const end = at + 12 + view.getUint32(at);
		if (end > png.length) return null;
		const type = chunkType(png, at);
		if (at === 8 && type !== "IHDR") return null;
		if (type !== "pHYs") parts.push(png.subarray(at, end));
		if (type === "IHDR") parts.push(pngChunk("pHYs", phys));
		at = end;
		if (type === "IEND") break;
	}

	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

/**
 * Tags a canvas PNG with its resolution so other tools open it at its
 * physical size; browsers' encoders write no pHYs. Anything that is not a
 * readable PNG passes through untouched.
 */
export async function setPngBlobDpi(blob: Blob, dpi: number): Promise<Blob> {
	try {
		const tagged = setPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
		return tagged ? new Blob([tagged], { type: "image/png" }) : blob;
	} catch {
		return blob;
	}
}

export const hexToRgba = (hex: string): number[] => {
	if (
		!hex ||
		typeof hex !== "string" ||
		!hex.startsWith("#") ||
		hex.length !== 7
	)
		return [0, 0, 0];

	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	
	return [
		Number.isNaN(r) ? 0 : r,
		Number.isNaN(g) ? 0 : g,
		Number.isNaN(b) ? 0 : b,
	];
};

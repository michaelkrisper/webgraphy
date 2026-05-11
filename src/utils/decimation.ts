/**
 * M4 downsampling for Float32Array columns.
 * Per bucket: emit (first, last, min, max) — preserves visible extrema for line plots.
 */

/**
 * Pixel-anchored M4 decimation. Buckets are X-world intervals tied to screen pixels,
 * so bucket boundaries do not shift with slice length — eliminates sample jumping under zoom.
 *
 * Requires xData strictly monotonically increasing.
 *
 * Per bucket: emit (first, min, max, last) sorted by index.
 * Buckets fully outside [xMin, xMax) are dropped. Empty buckets produce no output.
 */
export function m4ByXFloat32(
	xData: Float32Array,
	yData: Float32Array,
	xRef: number,
	xMin: number,
	xMax: number,
	numBuckets: number,
	out?: { x: Float32Array; y: Float32Array },
): { x: Float32Array; y: Float32Array } {
	const n = xData.length;
	const maxPoints = Math.max(4, numBuckets * 4);
	let xOut = out ? out.x : new Float32Array(maxPoints);
	let yOut = out ? out.y : new Float32Array(maxPoints);
	if (xOut.length < maxPoints) {
		xOut = new Float32Array(maxPoints);
		yOut = new Float32Array(maxPoints);
	}

	if (n === 0 || numBuckets <= 0 || xMax <= xMin) {
		if (out) {
			out.x = xOut;
			out.y = yOut;
		}
		return { x: xOut.subarray(0, 0), y: yOut.subarray(0, 0) };
	}

	const bucketWidth = (xMax - xMin) / numBuckets;
	let outIdx = 0;
	const bucket = [0, 0, 0, 0];

	let i = 0;
	while (i < n && xData[i] + xRef < xMin) i++;

	// Continuity anchor: emit last point before xMin (if any, non-NaN) so the line
	// enters from the left edge instead of starting inside the viewport.
	if (i > 0) {
		let anchor = i - 1;
		while (anchor >= 0 && Number.isNaN(yData[anchor])) anchor--;
		if (anchor >= 0) {
			xOut[outIdx] = xData[anchor];
			yOut[outIdx] = yData[anchor];
			outIdx++;
		}
	}

	for (let b = 0; b < numBuckets; b++) {
		const bEnd = xMin + (b + 1) * bucketWidth;
		const firstIdx = i;
		let lastIdx = -1;
		let minIdx = -1;
		let maxIdx = -1;

		while (i < n && xData[i] + xRef < bEnd) {
			const y = yData[i];
			if (!Number.isNaN(y)) {
				if (minIdx === -1 || y < yData[minIdx]) minIdx = i;
				if (maxIdx === -1 || y > yData[maxIdx]) maxIdx = i;
				lastIdx = i;
			}
			i++;
		}

		if (minIdx === -1) continue;

		const start =
			firstIdx < n && !Number.isNaN(yData[firstIdx]) ? firstIdx : minIdx;
		const end = lastIdx;

		let len = 0;
		bucket[len++] = start;
		if (end !== start) bucket[len++] = end;
		if (minIdx !== start && minIdx !== end) bucket[len++] = minIdx;
		if (maxIdx !== start && maxIdx !== end && maxIdx !== minIdx)
			bucket[len++] = maxIdx;

		for (let k = 1; k < len; k++) {
			const key = bucket[k];
			let j = k - 1;
			while (j >= 0 && bucket[j] > key) {
				bucket[j + 1] = bucket[j];
				j--;
			}
			bucket[j + 1] = key;
		}

		for (let k = 0; k < len; k++) {
			const idx = bucket[k];
			if (outIdx >= xOut.length) {
				const grown = new Float32Array(xOut.length * 2);
				const grownY = new Float32Array(yOut.length * 2);
				grown.set(xOut);
				grownY.set(yOut);
				xOut = grown;
				yOut = grownY;
			}
			xOut[outIdx] = xData[idx];
			yOut[outIdx] = yData[idx];
			outIdx++;
		}
	}

	// Trailing continuity anchor: first non-NaN point at/after xMax so the line
	// exits through the right edge.
	if (i < n) {
		let anchor = i;
		while (anchor < n && Number.isNaN(yData[anchor])) anchor++;
		if (anchor < n) {
			if (outIdx >= xOut.length) {
				const grown = new Float32Array(xOut.length * 2 || 4);
				const grownY = new Float32Array(yOut.length * 2 || 4);
				grown.set(xOut);
				grownY.set(yOut);
				xOut = grown;
				yOut = grownY;
			}
			xOut[outIdx] = xData[anchor];
			yOut[outIdx] = yData[anchor];
			outIdx++;
		}
	}

	if (out) {
		out.x = xOut;
		out.y = yOut;
	}
	return { x: xOut.subarray(0, outIdx), y: yOut.subarray(0, outIdx) };
}

export function m4Float32(
	xData: Float32Array,
	yData: Float32Array,
	threshold: number, // output size; actual buckets = threshold / 4
	out?: { x: Float32Array; y: Float32Array },
): { x: Float32Array; y: Float32Array } {
	const n = xData.length;
	if (n <= threshold) {
		if (out) {
			if (out.x.length < n) {
				out.x = new Float32Array(n);
				out.y = new Float32Array(n);
			}
			out.x.set(xData);
			out.y.set(yData);
			return { x: out.x.subarray(0, n), y: out.y.subarray(0, n) };
		}
		return { x: xData, y: yData };
	}

	const numBuckets = Math.max(1, Math.floor(threshold / 4));
	const bucketSize = n / numBuckets;

	const maxPoints = numBuckets * 5;
	let xOut = out ? out.x : new Float32Array(maxPoints);
	let yOut = out ? out.y : new Float32Array(maxPoints);
	if (xOut.length < maxPoints) {
		xOut = new Float32Array(maxPoints);
		yOut = new Float32Array(maxPoints);
	}

	let outIdx = 0;
	// Use a simple array instead of TypedArray for fast local access
	const bucket = [0, 0, 0, 0, 0];

	for (let b = 0; b < numBuckets; b++) {
		const start = Math.floor(b * bucketSize);
		const end = Math.min(n - 1, Math.floor((b + 1) * bucketSize) - 1);
		if (start > end) continue;

		let minIdx = -1,
			maxIdx = -1,
			nanIdx = -1;
		for (let i = start; i <= end; i++) {
			if (Number.isNaN(yData[i]) || Number.isNaN(xData[i])) {
				if (nanIdx === -1) nanIdx = i;
			} else {
				if (minIdx === -1 || yData[i] < yData[minIdx]) minIdx = i;
				if (maxIdx === -1 || yData[i] > yData[maxIdx]) maxIdx = i;
			}
		}

		let len = 0;
		bucket[len++] = start;
		if (end !== start) bucket[len++] = end;
		if (minIdx !== -1 && minIdx !== start && minIdx !== end)
			bucket[len++] = minIdx;
		if (
			maxIdx !== -1 &&
			maxIdx !== start &&
			maxIdx !== end &&
			maxIdx !== minIdx
		)
			bucket[len++] = maxIdx;
		if (
			nanIdx !== -1 &&
			nanIdx !== start &&
			nanIdx !== end &&
			nanIdx !== minIdx &&
			nanIdx !== maxIdx
		)
			bucket[len++] = nanIdx;

		for (let i = 1; i < len; i++) {
			const key = bucket[i];
			let j = i - 1;
			while (j >= 0 && bucket[j] > key) {
				bucket[j + 1] = bucket[j];
				j = j - 1;
			}
			bucket[j + 1] = key;
		}

		for (let i = 0; i < len; i++) {
			const idx = bucket[i];
			xOut[outIdx] = xData[idx];
			yOut[outIdx] = yData[idx];
			outIdx++;
		}
	}

	if (out) {
		out.x = xOut;
		out.y = yOut;
	}
	return { x: xOut.subarray(0, outIdx), y: yOut.subarray(0, outIdx) };
}

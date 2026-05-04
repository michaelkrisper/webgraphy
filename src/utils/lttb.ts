/**
 * M4 downsampling for Float32Array columns.
 * Per bucket: emit (first, last, min, max) — preserves visible extrema for line plots.
 */

export function m4Float32(
  xData: Float32Array,
  yData: Float32Array,
  threshold: number  // output size; actual buckets = threshold / 4
): { x: Float32Array; y: Float32Array } {
  const n = xData.length;
  if (n <= threshold) {
    // pass-through
    return { x: xData, y: yData };
  }

  const numBuckets = Math.max(1, Math.floor(threshold / 4));
  const bucketSize = n / numBuckets;

  // Collect indices (up to 4 per bucket), deduplicated, sorted
  const indices: number[] = [];
  for (let b = 0; b < numBuckets; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(n - 1, Math.floor((b + 1) * bucketSize) - 1);
    if (start > end) continue;

    let minIdx = start, maxIdx = start;
    for (let i = start + 1; i <= end; i++) {
      if (yData[i] < yData[minIdx]) minIdx = i;
      if (yData[i] > yData[maxIdx]) maxIdx = i;
    }

    // collect: first, last, min, max — deduplicated, in position order
    const bucket = Array.from(new Set([start, end, minIdx, maxIdx]));
    bucket.sort((a, b) => a - b);
    for (const idx of bucket) indices.push(idx);
  }

  const m = indices.length;
  const xOut = new Float32Array(m);
  const yOut = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    xOut[i] = xData[indices[i]];
    yOut[i] = yData[indices[i]];
  }
  return { x: xOut, y: yOut };
}

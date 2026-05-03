/**
 * Largest-Triangle-Three-Buckets (LTTB) algorithm
 * Based on the work of Sveinn Steinarsson
 */

export type Point = { x: number; y: number };

function calculateBucketAverage(data: Point[], bucketIndex: number, bucketSize: number, dataLength: number): Point {
  let avgX = 0, avgY = 0;
  let avgRangeStart = Math.floor((bucketIndex + 1) * bucketSize) + 1;
  let avgRangeEnd = Math.floor((bucketIndex + 2) * bucketSize) + 1;
  avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;
  const avgRangeLength = avgRangeEnd - avgRangeStart;
  for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
    avgX += data[avgRangeStart].x;
    avgY += data[avgRangeStart].y;
  }
  return { x: avgX / avgRangeLength, y: avgY / avgRangeLength };
}

function findMaxAreaPoint(
  data: Point[], bucketIndex: number, bucketSize: number,
  pointAX: number, pointAY: number, avgX: number, avgY: number
): { maxAreaPoint: Point; nextA: number } {
  let rangeOffs = Math.floor(bucketIndex * bucketSize) + 1;
  const rangeTo = Math.floor((bucketIndex + 1) * bucketSize) + 1;
  let maxArea = -1, maxAreaPoint: Point = data[rangeOffs], nextA = rangeOffs;
  for (; rangeOffs < rangeTo; rangeOffs++) {
    const area = Math.abs(
      (pointAX - avgX) * (data[rangeOffs].y - pointAY) -
      (pointAX - data[rangeOffs].x) * (avgY - pointAY)
    ) * 0.5;
    if (area > maxArea) { maxArea = area; maxAreaPoint = data[rangeOffs]; nextA = rangeOffs; }
  }
  return { maxAreaPoint, nextA };
}

export function m4Float32(
  xData: Float32Array, xRef: number,
  yData: Float32Array, yRef: number,
  threshold: number  // output size; actual buckets = threshold / 4
): { x: Float32Array; y: Float32Array } {
  const n = xData.length;
  if (n <= threshold) {
    // pass-through: copy to absolute values
    const xOut = new Float32Array(n);
    const yOut = new Float32Array(n);
    for (let i = 0; i < n; i++) { xOut[i] = xData[i] + xRef; yOut[i] = yData[i] + yRef; }
    return { x: xOut, y: yOut };
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
    xOut[i] = xData[indices[i]] + xRef;
    yOut[i] = yData[indices[i]] + yRef;
  }
  return { x: xOut, y: yOut };
}

export function lttb(data: Point[], threshold: number): Point[] {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold <= 0) return data;
  const sampled: Point[] = [];
  let sampledIndex = 0;
  const bucketSize = (dataLength - 2) / (threshold - 2);
  let a = 0;
  sampled[sampledIndex++] = data[a];
  for (let i = 0; i < threshold - 2; i++) {
    const avg = calculateBucketAverage(data, i, bucketSize, dataLength);
    const { maxAreaPoint, nextA } = findMaxAreaPoint(data, i, bucketSize, data[a].x, data[a].y, avg.x, avg.y);
    sampled[sampledIndex++] = maxAreaPoint;
    a = nextA;
  }
  sampled[sampledIndex++] = data[dataLength - 1];
  return sampled;
}

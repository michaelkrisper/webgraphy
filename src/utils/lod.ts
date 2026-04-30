export const MIN_LOD_POINTS = 512;
const COARSEST_POINTS = 256;

/**
 * Build LTTB mipmap levels for a Y column paired with its X column.
 * Returns levels coarsest-first. Each level is an interleaved Float32Array
 * [x0,y0, x1,y1, ...] of length 2*pointCount.
 * Returns [] when rawX.length < MIN_LOD_POINTS (no downsampling needed).
 */
export function buildLodLevels(rawX: Float32Array, rawY: Float32Array): Float32Array[] {
  const n = rawX.length;
  if (n < MIN_LOD_POINTS) return [];

  const levels: Float32Array[] = [];
  let targetPoints = COARSEST_POINTS;

  const targets: number[] = [];
  while (targetPoints < n / 2) {
    targets.push(targetPoints);
    targetPoints *= 2;
  }

  for (const target of targets) {
    levels.push(lttbInterleaved(rawX, rawY, 0, n - 1, target));
  }

  return levels; // coarsest first
}

/**
 * Select the finest LOD level that still has >= threshold points,
 * or the coarsest level if all levels are below threshold.
 * Returns null if levels is empty or undefined.
 */
export function selectLodLevel(
  levels: Float32Array[] | undefined,
  threshold: number,
  _startIdx: number,
  _endIdx: number
): Float32Array | null {
  if (!levels || levels.length === 0) return null;

  // Find the coarsest level that still has >= threshold points.
  // Levels are ordered coarsest-first, so iterate forward and stop at first match.
  for (let i = 0; i < levels.length; i++) {
    const pts = levels[i].length / 2;
    if (pts >= threshold) {
      return levels[i];
    }
  }
  // All levels below threshold — return coarsest as fallback.
  return levels[0];
}

function lttbInterleaved(
  xData: Float32Array,
  yData: Float32Array,
  startIdx: number,
  endIdx: number,
  threshold: number
): Float32Array {
  const numPoints = endIdx - startIdx + 1;
  const out = new Float32Array(threshold * 2);

  out[0] = xData[startIdx];
  out[1] = yData[startIdx];

  if (threshold <= 2 || threshold >= numPoints) {
    out[(threshold - 1) * 2] = xData[endIdx];
    out[(threshold - 1) * 2 + 1] = yData[endIdx];
    return out;
  }

  const bucketSize = (numPoints - 2) / (threshold - 2);
  let a = startIdx;

  for (let i = 0; i < threshold - 2; i++) {
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1 + startIdx;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1 + startIdx, endIdx + 1);
    let avgX = 0, avgY = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += xData[j];
      avgY += yData[j];
    }
    const avgLen = nextBucketEnd - nextBucketStart;
    avgX /= avgLen;
    avgY /= avgLen;

    const bucketStart = Math.floor(i * bucketSize) + 1 + startIdx;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1 + startIdx, endIdx + 1);
    const ax = xData[a], ay = yData[a];
    let maxArea = -1, maxIdx = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs((ax - avgX) * (yData[j] - ay) - (ax - xData[j]) * (avgY - ay)) * 0.5;
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    out[(i + 1) * 2] = xData[maxIdx];
    out[(i + 1) * 2 + 1] = yData[maxIdx];
    a = maxIdx;
  }

  out[(threshold - 1) * 2] = xData[endIdx];
  out[(threshold - 1) * 2 + 1] = yData[endIdx];
  return out;
}

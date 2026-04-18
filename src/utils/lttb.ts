/**
 * Largest-Triangle-Three-Buckets (LTTB) algorithm
 * Based on the work of Sveinn Steinarsson
 */

export type Point = { x: number; y: number };

/**
 * Calculates the average point of a given bucket range.
 * @param {Point[]} data - Array of data points
 * @param {number} bucketIndex - Index of the current bucket
 * @param {number} bucketSize - Number of points per bucket
 * @param {number} dataLength - Total length of the data array
 * @returns {Point} Average point (x, y) for the bucket range
 */
function calculateBucketAverage(
  data: Point[],
  bucketIndex: number,
  bucketSize: number,
  dataLength: number
): Point {
  let avgX = 0;
  let avgY = 0;
  let avgRangeStart = Math.floor((bucketIndex + 1) * bucketSize) + 1;
  let avgRangeEnd = Math.floor((bucketIndex + 2) * bucketSize) + 1;
  avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;

  const avgRangeLength = avgRangeEnd - avgRangeStart;

  for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
    avgX += data[avgRangeStart].x;
    avgY += data[avgRangeStart].y;
  }

  return {
    x: avgX / avgRangeLength,
    y: avgY / avgRangeLength
  };
}

/**
 * Finds the point in a bucket with maximum triangle area to the average of the next bucket.
 * Core LTTB algorithm: selects the most visually significant point per bucket.
 * @param {Point[]} data - Array of data points
 * @param {number} bucketIndex - Index of the current bucket
 * @param {number} bucketSize - Number of points per bucket
 * @param {number} pointAX - X-coordinate of the previous selected point (vertex A)
 * @param {number} pointAY - Y-coordinate of the previous selected point (vertex A)
 * @param {number} avgX - Average X of the next bucket (vertex C)
 * @param {number} avgY - Average Y of the next bucket (vertex C)
 * @returns {{maxAreaPoint: Point, nextA: number}} Selected point and its index for the next iteration
 */
function findMaxAreaPoint(
  data: Point[],
  bucketIndex: number,
  bucketSize: number,
  pointAX: number,
  pointAY: number,
  avgX: number,
  avgY: number
): { maxAreaPoint: Point; nextA: number } {
  let rangeOffs = Math.floor(bucketIndex * bucketSize) + 1;
  const rangeTo = Math.floor((bucketIndex + 1) * bucketSize) + 1;

  let maxArea = -1;
  let maxAreaPoint: Point = data[rangeOffs];
  let nextA = rangeOffs;

  for (; rangeOffs < rangeTo; rangeOffs++) {
    // Calculate triangle area over three buckets
    const area = Math.abs(
      (pointAX - avgX) * (data[rangeOffs].y - pointAY) -
      (pointAX - data[rangeOffs].x) * (avgY - pointAY)
    ) * 0.5;

    if (area > maxArea) {
      maxArea = area;
      maxAreaPoint = data[rangeOffs];
      nextA = rangeOffs; // Next a is this b
    }
  }

  return { maxAreaPoint, nextA };
}

/**
 * Largest-Triangle-Three-Buckets: downsamples large datasets while preserving visual shape.
 * Reduces point count to improve rendering performance without distorting chart appearance.
 * @param {Point[]} data - Array of original data points sorted by X-axis
 * @param {number} threshold - Target number of points after downsampling
 * @returns {Point[]} Downsampled array; returns original if threshold >= data length
 */
export function lttb(data: Point[], threshold: number): Point[] {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold <= 0) {
    return data; // No need to downsample
  }

  const sampled: Point[] = [];
  let sampledIndex = 0;

  // Bucket size. Leave room for start and end data points
  const bucketSize = (dataLength - 2) / (threshold - 2);

  let a = 0; // Initially a is the first point in the triangle

  sampled[sampledIndex++] = data[a]; // Always add the first point

  for (let i = 0; i < threshold - 2; i++) {
    const avg = calculateBucketAverage(data, i, bucketSize, dataLength);

    const { maxAreaPoint, nextA } = findMaxAreaPoint(
      data,
      i,
      bucketSize,
      data[a].x,
      data[a].y,
      avg.x,
      avg.y
    );

    sampled[sampledIndex++] = maxAreaPoint; // Pick this point from the bucket
    a = nextA; // This a is the next a (point b becomes a)
  }

  sampled[sampledIndex++] = data[dataLength - 1]; // Always add last

  return sampled;
}

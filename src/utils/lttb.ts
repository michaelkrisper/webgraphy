/**
 * Largest-Triangle-Three-Buckets (LTTB) algorithm
 * Based on the work of Sveinn Steinarsson
 */

export function lttb(data: { x: number, y: number }[], threshold: number): { x: number, y: number }[] {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold <= 0) {
    return data; // No need to downsample
  }

  const sampled: { x: number, y: number }[] = [];
  let sampledIndex = 0;

  // Bucket size. Leave room for start and end data points
  const bucketSize = (dataLength - 2) / (threshold - 2);

  let a = 0; // Initially a is the first point in the triangle
  let maxAreaPoint: { x: number, y: number } = data[0];
  let maxArea = -1;
  let area = -1;
  let nextA = 0;

  sampled[sampledIndex++] = data[a]; // Always add the first point

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate point average for next bucket (containing c)
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    let avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;

    const avgRangeLength = avgRangeEnd - avgRangeStart;

    for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
      avgX += data[avgRangeStart].x;
      avgY += data[avgRangeStart].y;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    // Get the range for this bucket
    let rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    // Point a
    const pointAX = data[a].x;
    const pointAY = data[a].y;

    maxArea = area = -1;

    for (; rangeOffs < rangeTo; rangeOffs++) {
      // Calculate triangle area over three buckets
      area = Math.abs(
        (pointAX - avgX) * (data[rangeOffs].y - pointAY) -
        (pointAX - data[rangeOffs].x) * (avgY - pointAY)
      ) * 0.5;
      
      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[rangeOffs];
        nextA = rangeOffs; // Next a is this b
      }
    }

    sampled[sampledIndex++] = maxAreaPoint; // Pick this point from the bucket
    a = nextA; // This a is the next a (point b becomes a)
  }

  sampled[sampledIndex++] = data[dataLength - 1]; // Always add last

  return sampled;
}

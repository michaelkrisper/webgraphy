const TREE_BRANCHING_FACTOR = 64;

export function buildMinMaxTrees(data: Float32Array): { minTree: Uint32Array[], maxTree: Uint32Array[] } {
  const minTree: Uint32Array[] = [];
  const maxTree: Uint32Array[] = [];
  let currentMinIndices = new Uint32Array(data.length);
  let currentMaxIndices = new Uint32Array(data.length);
  for (let i = 0; i < data.length; i++) { currentMinIndices[i] = i; currentMaxIndices[i] = i; }
  let currentLen = data.length;
  while (currentLen > TREE_BRANCHING_FACTOR) {
    const nextLen = Math.ceil(currentLen / TREE_BRANCHING_FACTOR);
    const nextMinIndices = new Uint32Array(nextLen);
    const nextMaxIndices = new Uint32Array(nextLen);
    for (let i = 0; i < nextLen; i++) {
      const start = i * TREE_BRANCHING_FACTOR, end = Math.min(start + TREE_BRANCHING_FACTOR, currentLen);
      let minIdx = currentMinIndices[start], maxIdx = currentMaxIndices[start];
      let minVal = data[minIdx], maxVal = data[maxIdx];
      for (let j = start + 1; j < end; j++) {
        const idxMin = currentMinIndices[j], valMin = data[idxMin];
        if (valMin < minVal) { minVal = valMin; minIdx = idxMin; }
        const idxMax = currentMaxIndices[j], valMax = data[idxMax];
        if (valMax > maxVal) { maxVal = valMax; maxIdx = idxMax; }
      }
      nextMinIndices[i] = minIdx; nextMaxIndices[i] = maxIdx;
    }
    minTree.push(nextMinIndices); maxTree.push(nextMaxIndices);
    currentMinIndices = nextMinIndices; currentMaxIndices = nextMaxIndices;
    currentLen = nextLen;
  }
  return { minTree, maxTree };
}

/**
 * Fast Min-Max downsampling using pre-built Min-Max trees.
 * For each bucket, it finds the first, last, min, and max points.
 */
export function downsampleMinMax(
  data: Float32Array,
  minTree: Uint32Array[],
  maxTree: Uint32Array[],
  startIndex: number,
  endIndex: number,
  targetBuckets: number
): Uint32Array {
  const rowCount = endIndex - startIndex + 1;
  if (rowCount <= targetBuckets * 4) {
    const result = new Uint32Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      result[i] = startIndex + i;
    }
    return result;
  }

  const bucketSize = rowCount / targetBuckets;
  const rawResult = new Uint32Array(targetBuckets * 4);
  let resultCount = 0;

  for (let i = 0; i < targetBuckets; i++) {
    const bucketStart = Math.floor(startIndex + i * bucketSize);
    const bucketEnd = Math.floor(startIndex + (i + 1) * bucketSize) - 1;

    if (bucketStart > bucketEnd) continue;

    // 1. Add first and last of bucket
    rawResult[resultCount++] = bucketStart;
    rawResult[resultCount++] = bucketEnd;

    // 2. Find min and max in bucket using trees
    const minIdx = findMinIndex(data, minTree, bucketStart, bucketEnd);
    const maxIdx = findMaxIndex(data, maxTree, bucketStart, bucketEnd);

    rawResult[resultCount++] = minIdx;
    rawResult[resultCount++] = maxIdx;
  }

  const validResult = rawResult.subarray(0, resultCount);
  validResult.sort();

  let uniqueCount = 0;
  if (resultCount > 0) {
    uniqueCount = 1;
    for (let i = 1; i < resultCount; i++) {
      if (validResult[i] !== validResult[i - 1]) {
        validResult[uniqueCount++] = validResult[i];
      }
    }
  }

  return validResult.slice(0, uniqueCount);
}

function findMinIndex(data: Float32Array, tree: Uint32Array[], start: number, end: number): number {
  return findInTree(data, tree, start, end, true);
}

function findMaxIndex(data: Float32Array, tree: Uint32Array[], start: number, end: number): number {
  return findInTree(data, tree, start, end, false);
}

const BRANCHING_FACTOR = 64;

function findInTree(data: Float32Array, tree: Uint32Array[], start: number, end: number, isMin: boolean): number {
  if (tree.length === 0 || (end - start) < BRANCHING_FACTOR) {
    return scanRaw(data, start, end, isMin);
  }

  // Find the highest level that is fully contained within [start, end]
  let bestIdx = -1;
  let bestVal = isMin ? Infinity : -Infinity;

  // This is a simplified version of range query.
  // For a truly optimal one, we'd traverse the tree.
  // Given the bucket approach, we can just scan the range.
  // But to be fast, we use the trees to skip chunks.

  for (let i = start; i <= end; ) {
    let level = -1;
    let factor = 1;

    // Check how large a chunk we can skip using trees
    for (let l = 0; l < tree.length; l++) {
      const f = Math.pow(BRANCHING_FACTOR, l + 1);
      if (i % f === 0 && i + f - 1 <= end) {
        level = l;
        factor = f;
      } else {
        break;
      }
    }

    if (level !== -1) {
      const treeIdx = i / factor;
      const valIdx = tree[level][treeIdx];
      const val = data[valIdx];
      if (isMin) {
        if (val < bestVal) { bestVal = val; bestIdx = valIdx; }
      } else {
        if (val > bestVal) { bestVal = val; bestIdx = valIdx; }
      }
      i += factor;
    } else {
      // Fallback to lower level or raw
      const val = data[i];
      if (isMin) {
        if (val < bestVal) { bestVal = val; bestIdx = i; }
      } else {
        if (val > bestVal) { bestVal = val; bestIdx = i; }
      }
      i++;
    }
  }

  return bestIdx;
}

function scanRaw(data: Float32Array, start: number, end: number, isMin: boolean): number {
  let bestIdx = start;
  let bestVal = data[start];
  for (let i = start + 1; i <= end; i++) {
    const val = data[i];
    if (isMin) {
      if (val < bestVal) { bestVal = val; bestIdx = i; }
    } else {
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
  }
  return bestIdx;
}

import { describe, it, expect } from 'vitest';

// We'll re-implement the logic here for testing since it's not exported from the worker
function generateSynchronizedLOD(relativeData: { data: Float32Array, refPoint: number }[], rowCount: number): Float32Array[][] {
  const numCols = relativeData.length;
  const levels: Float32Array[][] = relativeData.map(col => [col.data]);

  const factor = 8;
  let currentIndices = new Uint32Array(rowCount);
  for (let i = 0; i < rowCount; i++) currentIndices[i] = i;

  while (levels[0].length < 8 && currentIndices.length > factor * 2) {
    const nextIndicesSet = new Set<number>();

    // Explicitly include global first and last indices for visual consistency
    nextIndicesSet.add(0);
    nextIndicesSet.add(rowCount - 1);

    for (let i = 0; i < currentIndices.length; i += factor) {
      const end = Math.min(i + factor, currentIndices.length);

      // Always include first and last of chunk
      nextIndicesSet.add(currentIndices[i]);
      nextIndicesSet.add(currentIndices[end - 1]);

      // For each column, find min and max in this chunk
      for (let j = 0; j < numCols; j++) {
        const colData = relativeData[j].data;
        let minVal = Infinity, maxVal = -Infinity;
        let minIdx = currentIndices[i], maxIdx = currentIndices[i];

        for (let k = i; k < end; k++) {
          const idx = currentIndices[k];
          const val = colData[idx];
          if (val < minVal) { minVal = val; minIdx = idx; }
          if (val > maxVal) { maxVal = val; maxIdx = idx; }
        }
        nextIndicesSet.add(minIdx);
        nextIndicesSet.add(maxIdx);
      }
    }

    const sortedIndices = Array.from(nextIndicesSet).sort((a, b) => a - b);
    const nextIdxArray = new Uint32Array(sortedIndices);

    // Create new data arrays for this level
    for (let j = 0; j < numCols; j++) {
      const colData = relativeData[j].data;
      const levelData = new Float32Array(nextIdxArray.length);
      for (let k = 0; k < nextIdxArray.length; k++) {
        levelData[k] = colData[nextIdxArray[k]];
      }
      levels[j].push(levelData);
    }

    const prevLength = currentIndices.length;
    currentIndices = nextIdxArray;

    if (currentIndices.length >= prevLength * 0.8 && currentIndices.length > 2000) {
      break;
    }
  }

  return levels;
}

describe('LOD Generation', () => {
  it('should preserve the first and last points in every level', () => {
    const rowCount = 2000;
    const numCols = 3;
    const relativeData = [];
    for(let j=0; j<numCols; j++) {
      const data = new Float32Array(rowCount);
      for(let i=0; i<rowCount; i++) data[i] = Math.random() * 1000;
      relativeData.push({ data, refPoint: 0 });
    }

    const levels = generateSynchronizedLOD(relativeData, rowCount);

    expect(levels[0].length).toBeGreaterThan(1);

    for(let j=0; j<numCols; j++) {
      const original = levels[j][0];
      const firstVal = original[0];
      const lastVal = original[rowCount - 1];

      for(let l=1; l<levels[j].length; l++) {
        const lod = levels[j][l];
        expect(lod[0]).toBe(firstVal);
        expect(lod[lod.length - 1]).toBe(lastVal);
      }
    }
  });

  it('should generate multiple levels for large datasets', () => {
    const rowCount = 5000;
    const relativeData = [{ data: new Float32Array(rowCount), refPoint: 0 }];
    const levels = generateSynchronizedLOD(relativeData, rowCount);
    expect(levels[0].length).toBeGreaterThan(3);
  });
});

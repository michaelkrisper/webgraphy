import { describe, it, expect } from 'vitest';

/**
 * Builds multi-level Min-Max trees (storing indices) for a given data column.
 * Branching factor is 64.
 */
function buildMinMaxTrees(data: Float32Array): { minTree: Uint32Array[], maxTree: Uint32Array[] } {
  const minTree: Uint32Array[] = [];
  const maxTree: Uint32Array[] = [];
  const branchingFactor = 64;

  let currentMinIndices = new Uint32Array(data.length);
  let currentMaxIndices = new Uint32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    currentMinIndices[i] = i;
    currentMaxIndices[i] = i;
  }

  let currentLen = data.length;
  while (currentLen > branchingFactor) {
    const nextLen = Math.ceil(currentLen / branchingFactor);
    const nextMinIndices = new Uint32Array(nextLen);
    const nextMaxIndices = new Uint32Array(nextLen);

    for (let i = 0; i < nextLen; i++) {
      const start = i * branchingFactor;
      const end = Math.min(start + branchingFactor, currentLen);

      let minIdx = currentMinIndices[start];
      let maxIdx = currentMaxIndices[start];
      let minVal = data[minIdx];
      let maxVal = data[maxIdx];

      for (let j = start + 1; j < end; j++) {
        const idxMin = currentMinIndices[j];
        const valMin = data[idxMin];
        if (valMin < minVal) {
          minVal = valMin;
          minIdx = idxMin;
        }

        const idxMax = currentMaxIndices[j];
        const valMax = data[idxMax];
        if (valMax > maxVal) {
          maxVal = valMax;
          maxIdx = idxMax;
        }
      }
      nextMinIndices[i] = minIdx;
      nextMaxIndices[i] = maxIdx;
    }
    minTree.push(nextMinIndices);
    maxTree.push(nextMaxIndices);
    currentMinIndices = nextMinIndices;
    currentMaxIndices = nextMaxIndices;
    currentLen = nextLen;
  }

  return { minTree, maxTree };
}

describe('Min-Max Tree Generation', () => {
  it('should correctly identify min and max indices in levels', () => {
    const data = new Float32Array(200);
    for (let i = 0; i < 200; i++) data[i] = i;
    // Inject some extremes
    data[50] = -100;
    data[150] = 500;

    const { minTree, maxTree } = buildMinMaxTrees(data);

    // 200 / 64 = 3.125 -> 4 chunks in level 0
    // 4 / 64 = 0.0625 -> Loop terminates because currentLen (4) <= branchingFactor (64)
    expect(minTree.length).toBe(1);
    expect(minTree[0].length).toBe(4);

    // Check if -100 is captured in the first level
    let foundMin = false;
    for (let i = 0; i < minTree[0].length; i++) {
      if (data[minTree[0][i]] === -100) foundMin = true;
    }
    expect(foundMin).toBe(true);

    // Check if 500 is captured in the first level
    let foundMax = false;
    for (let i = 0; i < maxTree[0].length; i++) {
      if (data[maxTree[0][i]] === 500) foundMax = true;
    }
    expect(foundMax).toBe(true);
  });

  it('should handle small datasets', () => {
    const data = new Float32Array(10);
    const { minTree, maxTree } = buildMinMaxTrees(data);
    expect(minTree.length).toBe(0);
    expect(maxTree.length).toBe(0);
  });
});

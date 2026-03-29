// Data Parser Web Worker (v0.3.3 - Interleaved WebGL Buffers & Robust LOD)

self.onmessage = async (event) => {
  const { file, type } = event.data;

  try {
    const text = await file.text();
    let result;
    if (type === 'csv') result = parseCSV(text);
    else if (type === 'json') result = parseJSON(text);
    else throw new Error(`Unsupported file type: ${type}`);

    const rowCount = result.rowCount;
    const columns = result.columns;
    
    // 1. Calculate absolute bounds for all columns first
    const colBounds = columns.map((_, colIdx) => {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < rowCount; i++) {
        const val = result.data[i][colIdx];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      return { min, max };
    });

    // 2. Prepare datasets with synchronized LOD
    const relativeData = columns.map((_, colIdx) => {
      const refPoint = rowCount > 0 ? result.data[0][colIdx] : 0;
      const data = new Float32Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        data[i] = result.data[i][colIdx] - refPoint;
      }
      return { data, refPoint };
    });

    const lodLevels = generateSynchronizedLOD(relativeData, rowCount);

    const dataset = {
      id: crypto.randomUUID(),
      name: file.name,
      columns: columns,
      rowCount: rowCount,
      data: columns.map((colName, colIdx) => {
        const isPotentialX = colIdx === 0 || colName.toLowerCase().includes('time') || colName.toLowerCase().includes('date');
        return {
          isFloat64: isPotentialX,
          refPoint: relativeData[colIdx].refPoint,
          bounds: colBounds[colIdx],
          levels: lodLevels[colIdx]
        };
      })
    };

    const transferList: ArrayBuffer[] = [];
    dataset.data.forEach(col => {
      col.levels.forEach(level => transferList.push(level.buffer as ArrayBuffer));
    });

    (self as any).postMessage({ type: 'success', dataset }, transferList);
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
};

/**
 * Generates LOD levels where all columns use the same sampled row indices.
 * This preserves X-Y pairing and ensures visual integrity.
 */
function generateSynchronizedLOD(relativeData: { data: Float32Array, refPoint: number }[], rowCount: number): Float32Array[][] {
  const numCols = relativeData.length;
  const levels: Float32Array[][] = relativeData.map(col => [col.data]);
  
  const factor = 8;
  let currentIndices = new Uint32Array(rowCount);
  for (let i = 0; i < rowCount; i++) currentIndices[i] = i;

  while (levels[0].length < 5 && currentIndices.length > factor * 2) {
    const nextIndices: number[] = [];
    
    for (let i = 0; i < currentIndices.length; i += factor) {
      const end = Math.min(i + factor, currentIndices.length);
      const chunkIndices = new Set<number>();
      
      // Always include first and last of chunk
      chunkIndices.add(currentIndices[i]);
      chunkIndices.add(currentIndices[end - 1]);
      
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
        chunkIndices.add(minIdx);
        chunkIndices.add(maxIdx);
      }
      
      // Add sorted unique indices from this chunk
      const sorted = Array.from(chunkIndices).sort((a, b) => a - b);
      nextIndices.push(...sorted);
    }
    
    const nextIdxArray = new Uint32Array(nextIndices);
    // Create new data arrays for this level
    for (let j = 0; j < numCols; j++) {
      const colData = relativeData[j].data;
      const levelData = new Float32Array(nextIdxArray.length);
      for (let k = 0; k < nextIdxArray.length; k++) {
        levelData[k] = colData[nextIdxArray[k]];
      }
      levels[j].push(levelData);
    }
    
    currentIndices = nextIdxArray;
    if (nextIndices.length >= currentIndices.length / 2 && nextIndices.length > 2000) {
      // If reduction is not significant, stop to prevent too many levels
      // (This can happen if there are many columns with different peaks)
    }
  }
  
  return levels;
}

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) throw new Error('Empty CSV file');
  const headers = lines[0].split(',').map(h => h.trim());
  const data: number[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',').map(v => {
      const p = parseFloat(v.trim());
      return isNaN(p) ? 0 : p;
    });
    data.push(values);
  }
  return { columns: headers, rowCount: data.length, data: data };
}

function parseJSON(text: string) {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format');
  const headers = Object.keys(raw[0]);
  const data = raw.map((row: any) => headers.map(h => {
    const p = parseFloat(row[h]);
    return isNaN(p) ? 0 : p;
  }));
  return { columns: headers, rowCount: data.length, data: data };
}

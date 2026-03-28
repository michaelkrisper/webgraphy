// Data Parser Web Worker
// Handles high-speed CSV/JSON parsing in the background

self.onmessage = async (event) => {
  const { file, type } = event.data;

  try {
    const text = await file.text();
    let result;

    if (type === 'csv') {
      result = parseCSV(text);
    } else if (type === 'json') {
      result = parseJSON(text);
    } else {
      throw new Error(`Unsupported file type: ${type}`);
    }

    // Convert columns to Float32Arrays for performance
    const dataset = {
      id: crypto.randomUUID(),
      name: file.name,
      columns: result.columns,
      rowCount: result.rowCount,
      data: result.columns.map((_, colIdx) => {
        const arr = new Float32Array(result.rowCount);
        for (let i = 0; i < result.rowCount; i++) {
          arr[i] = result.data[i][colIdx];
        }
        return arr;
      })
    };

    // Use Transferable objects for performance
    const transferList = dataset.data.map(arr => arr.buffer);
    (self as any).postMessage({ type: 'success', dataset }, transferList);
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
};

function parseCSV(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) throw new Error('Empty CSV file');

  const headers = lines[0].split(',').map(h => h.trim());
  const data: number[][] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(',').map(v => parseFloat(v.trim()));
    data.push(values);
  }

  return {
    columns: headers,
    rowCount: data.length,
    data: data
  };
}

function parseJSON(text: string) {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format (expected array of objects)');

  const headers = Object.keys(raw[0]);
  const data = raw.map((row: any) => headers.map(h => parseFloat(row[h])));

  return {
    columns: headers,
    rowCount: data.length,
    data: data
  };
}

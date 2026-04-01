const fs = require('fs');
const { performance } = require('perf_hooks');

// Generate large JSON data
const rows = 100000;
const cols = 20;
const data = [];
for (let i = 0; i < rows; i++) {
  const row = {};
  for (let j = 0; j < cols; j++) {
    row[`col_${j}`] = Math.random().toString();
  }
  data.push(row);
}
const text = JSON.stringify(data);

function parseJSON_Original(text) {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format');
  const headers = Object.keys(raw[0]);
  const data = raw.map((row) => headers.map(h => {
    const p = parseFloat(row[h]);
    return isNaN(p) ? NaN : p;
  }));
  return { columns: headers, rowCount: data.length, data: data };
}

function parseJSON_Optimized(text) {
  const raw = JSON.parse(text);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format');
  const headers = Object.keys(raw[0]);
  const rowCount = raw.length;
  const colCount = headers.length;

  const data = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const row = raw[i];
    const rowData = new Array(colCount);
    for (let j = 0; j < colCount; j++) {
      const p = parseFloat(row[headers[j]]);
      rowData[j] = isNaN(p) ? NaN : p;
    }
    data[i] = rowData;
  }
  return { columns: headers, rowCount: data.length, data: data };
}

// Warmup
for (let i = 0; i < 5; i++) {
  parseJSON_Original(text);
  parseJSON_Optimized(text);
}

// Benchmark
let start = performance.now();
for (let i = 0; i < 10; i++) {
  parseJSON_Original(text);
}
const originalTime = performance.now() - start;

start = performance.now();
for (let i = 0; i < 10; i++) {
  parseJSON_Optimized(text);
}
const optimizedTime = performance.now() - start;

console.log(`Original: ${(originalTime / 10).toFixed(2)} ms`);
console.log(`Optimized: ${(optimizedTime / 10).toFixed(2)} ms`);
console.log(`Improvement: ${((originalTime - optimizedTime) / originalTime * 100).toFixed(2)}%`);

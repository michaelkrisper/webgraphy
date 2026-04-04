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

function testAllocation(iterations, numPoints) {
  const start = performance.now();
  let dummySum = 0;
  for (let iter = 0; iter < iterations; iter++) {
    const segData = new Float32Array((numPoints - 1) * 10);
    for (let i = 0; i < numPoints - 1; i++) {
      const ax = i, ay = i * 2;
      const bx = i + 1, by = (i + 1) * 2;
      const off = i * 10;
      segData[off] = ax; segData[off + 1] = ay; segData[off + 2] = bx; segData[off + 3] = by; segData[off + 4] = 0;
      segData[off + 5] = bx; segData[off + 6] = by; segData[off + 7] = ax; segData[off + 8] = ay; segData[off + 9] = 1;
    }
    dummySum += segData[0];
  }
  const end = performance.now();
  return { time: end - start, sum: dummySum };
}

let sharedBuffer = new Float32Array(0);
function getSharedBuffer(size) {
  if (sharedBuffer.length < size) {
    let newSize = sharedBuffer.length > 0 ? sharedBuffer.length : 1024;
    while (newSize < size) newSize *= 2;
    sharedBuffer = new Float32Array(newSize);
  }
  return sharedBuffer;
}

function testReusable(iterations, numPoints) {
  const start = performance.now();
  let dummySum = 0;
  for (let iter = 0; iter < iterations; iter++) {
    const size = (numPoints - 1) * 10;
    const segData = getSharedBuffer(size);
    for (let i = 0; i < numPoints - 1; i++) {
      const ax = i, ay = i * 2;
      const bx = i + 1, by = (i + 1) * 2;
      const off = i * 10;
      segData[off] = ax; segData[off + 1] = ay; segData[off + 2] = bx; segData[off + 3] = by; segData[off + 4] = 0;
      segData[off + 5] = bx; segData[off + 6] = by; segData[off + 7] = ax; segData[off + 8] = ay; segData[off + 9] = 1;
    }
    const subarray = segData.subarray(0, size);
    dummySum += subarray[0];
  }
  const end = performance.now();
  return { time: end - start, sum: dummySum };
}

const numPoints = 100000;
const iterations = 1000;

console.log("Warming up...");
testAllocation(100, numPoints);
testReusable(100, numPoints);

console.log("Running Allocation benchmark...");
const allocRes = testAllocation(iterations, numPoints);
console.log(`Allocation took: ${allocRes.time.toFixed(2)}ms`);

console.log("Running Reusable benchmark...");
const reuseRes = testReusable(iterations, numPoints);
console.log(`Reusable took: ${reuseRes.time.toFixed(2)}ms`);

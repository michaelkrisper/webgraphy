const { performance } = require('perf_hooks');

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

let sharedBuffer = new Float32Array(1024);
function getSharedBuffer(size) {
  if (sharedBuffer.length < size) {
    let newSize = sharedBuffer.length;
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

console.log(`Improvement: ${((allocRes.time - reuseRes.time) / allocRes.time * 100).toFixed(2)}%`);

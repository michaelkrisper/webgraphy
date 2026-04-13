const { performance } = require('perf_hooks');

const datasets = Array.from({ length: 100 }, (_, i) => ({ id: `ds-${i}`, data: [] }));

function withMapCreation() {
  const map = new Map();
  datasets.forEach(d => map.set(d.id, d));
  return map.get('ds-50');
}

const precomputedMap = new Map();
datasets.forEach(d => precomputedMap.set(d.id, d));

function withPrecomputed() {
  return precomputedMap.get('ds-50');
}

const ITERATIONS = 100000;

let start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  withMapCreation();
}
const timeCreation = performance.now() - start;

start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  withPrecomputed();
}
const timePrecomputed = performance.now() - start;

console.log(`With creation: ${timeCreation.toFixed(2)}ms`);
console.log(`Precomputed: ${timePrecomputed.toFixed(2)}ms`);

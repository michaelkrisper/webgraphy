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

const datasetsMapCache = new WeakMap();
function getDatasetsMap(arr) {
  let map = datasetsMapCache.get(arr);
  if (!map) {
    map = new Map();
    arr.forEach(d => map.set(d.id, d));
    datasetsMapCache.set(arr, map);
  }
  return map;
}

function withWeakMap() {
  return getDatasetsMap(datasets).get('ds-50');
}

const ITERATIONS = 10000;

let start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  withMapCreation();
}
const timeCreation = performance.now() - start;

start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  withWeakMap();
}
const timeWeakMap = performance.now() - start;

console.log(`With creation: ${timeCreation.toFixed(2)}ms`);
console.log(`With WeakMap cache: ${timeWeakMap.toFixed(2)}ms`);

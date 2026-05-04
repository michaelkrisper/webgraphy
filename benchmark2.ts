import { performance } from 'perf_hooks';

// Simulate the function to benchmark
function kdeSmoothingOriginal(x: Float64Array, y: Float64Array, bandwidth?: number): Float64Array {
  const n = x.length;

  let h = bandwidth;
  if (!h) {
    let sumX = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) { sumX += x[i]; sumX2 += x[i] * x[i]; }
    const meanX = sumX / n;
    const stdX = Math.sqrt(sumX2 / n - meanX * meanX);
    h = 1.06 * stdX * Math.pow(n, -0.2);
    if (h < 1e-12) h = (x[n - 1] - x[0]) / (n * 0.1);
  }

  const result = new Float64Array(n);
  const h2 = 2 * h * h;

  for (let i = 0; i < n; i++) {
    let weightedSum = 0, weightSum = 0;
    const xi = x[i];
    let lo = 0, hi = n - 1;
    const windowMin = xi - 3 * h;
    const windowMax = xi + 3 * h;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (x[mid] < windowMin) lo = mid + 1; else hi = mid;
    }

    for (let j = lo; j < n && x[j] <= windowMax; j++) {
      const dx = xi - x[j];
      const w = Math.exp(-(dx * dx) / h2);
      weightedSum += w * y[j];
      weightSum += w;
    }
    result[i] = weightSum > 0 ? weightedSum / weightSum : y[i];
  }

  return result;
}

function kdeSmoothingOptimized(x: Float64Array, y: Float64Array, bandwidth?: number): Float64Array {
  const n = x.length;

  let h = bandwidth;
  if (!h) {
    let sumX = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) { sumX += x[i]; sumX2 += x[i] * x[i]; }
    const meanX = sumX / n;
    const stdX = Math.sqrt(sumX2 / n - meanX * meanX);
    h = 1.06 * stdX * Math.pow(n, -0.2);
    if (h < 1e-12) h = (x[n - 1] - x[0]) / (n * 0.1);
  }

  const result = new Float64Array(n);
  const weightSum = new Float64Array(n);
  const h2 = 2 * h * h;

  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const windowMax = xi + 3 * h;

    // Self weight is 1.0 since dx = 0
    result[i] += y[i];
    weightSum[i] += 1;

    for (let j = i + 1; j < n && x[j] <= windowMax; j++) {
      const dx = xi - x[j];
      const w = Math.exp(-(dx * dx) / h2);

      result[i] += w * y[j];
      weightSum[i] += w;

      result[j] += w * y[i];
      weightSum[j] += w;
    }
  }

  for (let i = 0; i < n; i++) {
    result[i] = weightSum[i] > 0 ? result[i] / weightSum[i] : y[i];
  }

  return result;
}

// Generate test data
const n = 20000;
const x = new Float64Array(n);
const y = new Float64Array(n);
for (let i = 0; i < n; i++) {
  x[i] = i * 0.1;
  y[i] = Math.sin(x[i]) + Math.random() * 0.1;
}

// Warmup
kdeSmoothingOriginal(x, y);
kdeSmoothingOptimized(x, y);

const startOriginal = performance.now();
for (let i = 0; i < 10; i++) kdeSmoothingOriginal(x, y);
const endOriginal = performance.now();

const startOptimized = performance.now();
for (let i = 0; i < 10; i++) kdeSmoothingOptimized(x, y);
const endOptimized = performance.now();

console.log(`Original: ${(endOriginal - startOriginal).toFixed(2)} ms`);
console.log(`Optimized: ${(endOptimized - startOptimized).toFixed(2)} ms`);

// Verify correctness
const resOriginal = kdeSmoothingOriginal(x, y);
const resOptimized = kdeSmoothingOptimized(x, y);
let maxDiff = 0;
for (let i = 0; i < n; i++) {
  maxDiff = Math.max(maxDiff, Math.abs(resOriginal[i] - resOptimized[i]));
}
console.log(`Max difference: ${maxDiff}`);

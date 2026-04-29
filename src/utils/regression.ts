/**
 * Regression and curve fitting utilities.
 * All functions take x,y arrays and return fitted y values.
 */

/** Linear regression: y = ax + b */
export function linearRegression(x: Float64Array, y: Float64Array): Float64Array {
  const n = x.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i]; sxy += x[i] * y[i]; sxx += x[i] * x[i];
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-30) return new Float64Array(n);
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) result[i] = a * x[i] + b;
  return result;
}

/** Polynomial regression of degree d: y = c0 + c1*x + c2*x^2 + ... */
export function polynomialRegression(x: Float64Array, y: Float64Array, degree: number): Float64Array {
  const n = x.length;
  const d = Math.min(degree, Math.min(n - 1, 10)); // Cap at 10 for stability

  // Build Vandermonde matrix and solve via normal equations
  const m = d + 1;
  // Compute X^T * X and X^T * y
  const XtX = new Float64Array(m * m);
  const Xty = new Float64Array(m);

  for (let i = 0; i < n; i++) {
    let xpow = 1;
    for (let j = 0; j < m; j++) {
      Xty[j] += xpow * y[i];
      let xpow2 = 1;
      for (let k = 0; k < m; k++) {
        XtX[j * m + k] += xpow * xpow2;
        xpow2 *= x[i];
      }
      xpow *= x[i];
    }
  }

  // Solve via Gaussian elimination with partial pivoting
  const coeffs = solveLinearSystem(XtX, Xty, m);

  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let val = 0, xpow = 1;
    for (let j = 0; j < m; j++) {
      val += coeffs[j] * xpow;
      xpow *= x[i];
    }
    result[i] = val;
  }
  return result;
}

function solveLinearSystem(A: Float64Array, b: Float64Array, n: number): Float64Array {
  // Augmented matrix
  const aug = new Float64Array(n * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i * (n + 1) + j] = A[i * n + j];
    aug[i * (n + 1) + n] = b[i];
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let maxRow = col, maxVal = Math.abs(aug[col * (n + 1) + col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row * (n + 1) + col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxRow !== col) {
      for (let j = 0; j <= n; j++) {
        const tmp = aug[col * (n + 1) + j];
        aug[col * (n + 1) + j] = aug[maxRow * (n + 1) + j];
        aug[maxRow * (n + 1) + j] = tmp;
      }
    }
    const pivot = aug[col * (n + 1) + col];
    if (Math.abs(pivot) < 1e-30) continue;
    for (let row = col + 1; row < n; row++) {
      const factor = aug[row * (n + 1) + col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row * (n + 1) + j] -= factor * aug[col * (n + 1) + j];
      }
    }
  }

  // Back substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i * (n + 1) + n];
    for (let j = i + 1; j < n; j++) sum -= aug[i * (n + 1) + j] * x[j];
    const diag = aug[i * (n + 1) + i];
    x[i] = Math.abs(diag) > 1e-30 ? sum / diag : 0;
  }
  return x;
}

/** Exponential regression: y = a * e^(b*x) — via log-linear fit */
export function exponentialRegression(x: Float64Array, y: Float64Array): Float64Array {
  const n = x.length;
  // Filter positive y values for log transform
  const logY = new Float64Array(n);
  let allPositive = true;
  for (let i = 0; i < n; i++) {
    if (y[i] <= 0) { allPositive = false; break; }
    logY[i] = Math.log(y[i]);
  }

  if (!allPositive) {
    // Shift y to make all positive
    let minY = Infinity;
    for (let i = 0; i < n; i++) if (y[i] < minY) minY = y[i];
    const shift = Math.abs(minY) + 1;
    for (let i = 0; i < n; i++) logY[i] = Math.log(y[i] + shift);
    const fitted = linearRegression(x, logY);
    const result = new Float64Array(n);
    for (let i = 0; i < n; i++) result[i] = Math.exp(fitted[i]) - shift;
    return result;
  }

  const fitted = linearRegression(x, logY);
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) result[i] = Math.exp(fitted[i]);
  return result;
}

/** Logistic regression: y = L / (1 + e^(-k*(x-x0))) */
export function logisticRegression(x: Float64Array, y: Float64Array): Float64Array {
  const n = x.length;

  // Estimate parameters
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (y[i] < yMin) yMin = y[i];
    if (y[i] > yMax) yMax = y[i];
  }
  const L = yMax * 1.05; // Upper asymptote
  const yRange = L - yMin;
  if (yRange < 1e-10) return new Float64Array(n);

  // Find midpoint (where y ≈ L/2)
  const halfL = (yMin + L) / 2;
  let x0Idx = 0, minDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const diff = Math.abs(y[i] - halfL);
    if (diff < minDiff) { minDiff = diff; x0Idx = i; }
  }
  let x0 = x[x0Idx];

  // Estimate k from slope at midpoint
  const windowK = Math.max(1, Math.floor(n / 20));
  const i1 = Math.max(0, x0Idx - windowK);
  const i2 = Math.min(n - 1, x0Idx + windowK);
  const dx = x[i2] - x[i1];
  const dy = y[i2] - y[i1];
  let k = dx !== 0 ? (4 * dy / (L * dx)) : 1;

  // Simple gradient descent refinement (few iterations)
  for (let iter = 0; iter < 50; iter++) {
    let gradK = 0, gradX0 = 0;
    for (let i = 0; i < n; i++) {
      const z = -k * (x[i] - x0);
      const ez = Math.exp(Math.max(-50, Math.min(50, z)));
      const pred = yMin + yRange / (1 + ez);
      const err = pred - y[i];
      const denom = (1 + ez) * (1 + ez);
      const dSigma = yRange * ez / denom;
      gradK += err * dSigma * (-(x[i] - x0));
      gradX0 += err * dSigma * k;
    }
    const lr = 0.001 / n;
    k -= lr * gradK;
    x0 -= lr * gradX0;
  }

  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const z = -k * (x[i] - x0);
    const ez = Math.exp(Math.max(-50, Math.min(50, z)));
    result[i] = yMin + yRange / (1 + ez);
  }
  return result;
}

/** KDE (Kernel Density Estimation) smoothing with Gaussian kernel */
export function kdeSmoothing(x: Float64Array, y: Float64Array, bandwidth?: number): Float64Array {
  const n = x.length;

  // Auto bandwidth using Silverman's rule on x spacing
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

  // For performance, limit kernel evaluation to ±3σ
  for (let i = 0; i < n; i++) {
    let weightedSum = 0, weightSum = 0;
    const xi = x[i];
    // Binary search for start of window
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

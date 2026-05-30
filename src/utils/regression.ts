/**
 * Regression and curve fitting utilities.
 * All functions take x,y arrays and return fitted y values.
 */

/** Linear regression: y = ax + b */
export function linearRegression(
  x: Float64Array,
  y: Float64Array,
): Float64Array {
  const n = x.length;
  let sx = 0,
    sy = 0,
    sxy = 0,
    sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxy += x[i] * y[i];
    sxx += x[i] * x[i];
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
export function polynomialRegression(
  x: Float64Array,
  y: Float64Array,
  degree: number,
): Float64Array {
  const n = x.length;
  const d = Math.min(degree, Math.min(n - 1, 10)); // Cap at 10 for stability
  const m = d + 1;

  // Center and scale x before building the normal equations. Raw values such
  // as epoch timestamps raised to high powers wreck the conditioning of X^T X;
  // fitting in normalized space and evaluating at the same points leaves the
  // fitted y values unchanged but keeps the solve numerically stable.
  let meanX = 0;
  for (let i = 0; i < n; i++) meanX += x[i];
  meanX /= n;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    const dxv = x[i] - meanX;
    varX += dxv * dxv;
  }
  const scaleX = Math.sqrt(varX / n) || 1;
  const xs = new Float64Array(n);
  for (let i = 0; i < n; i++) xs[i] = (x[i] - meanX) / scaleX;

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
        xpow2 *= xs[i];
      }
      xpow *= xs[i];
    }
  }

  // Solve via Gaussian elimination with partial pivoting
  const coeffs = solveLinearSystem(XtX, Xty, m);

  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let val = 0,
      xpow = 1;
    for (let j = 0; j < m; j++) {
      val += coeffs[j] * xpow;
      xpow *= xs[i];
    }
    result[i] = val;
  }
  return result;
}

function solveLinearSystem(
  A: Float64Array,
  b: Float64Array,
  n: number,
): Float64Array {
  // Augmented matrix
  const aug = new Float64Array(n * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i * (n + 1) + j] = A[i * n + j];
    aug[i * (n + 1) + n] = b[i];
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let maxRow = col,
      maxVal = Math.abs(aug[col * (n + 1) + col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(aug[row * (n + 1) + col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = row;
      }
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
export function exponentialRegression(
  x: Float64Array,
  y: Float64Array,
): Float64Array {
  const n = x.length;
  // Filter positive y values for log transform
  const logY = new Float64Array(n);
  let allPositive = true;
  for (let i = 0; i < n; i++) {
    if (y[i] <= 0) {
      allPositive = false;
      break;
    }
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
export function logisticRegression(
  x: Float64Array,
  y: Float64Array,
): Float64Array {
  const n = x.length;

  // Estimate parameters
  let yMin = Infinity,
    yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (y[i] < yMin) yMin = y[i];
    if (y[i] > yMax) yMax = y[i];
  }
  const L = yMax + 0.05 * (yMax - yMin); // Upper asymptote, 5% above the range
  const yRange = L - yMin;
  if (yRange < 1e-10) return new Float64Array(n);

  // Find midpoint (where y ≈ L/2)
  const halfL = (yMin + L) / 2;
  let x0Idx = 0,
    minDiff = Infinity;
  for (let i = 0; i < n; i++) {
    const diff = Math.abs(y[i] - halfL);
    if (diff < minDiff) {
      minDiff = diff;
      x0Idx = i;
    }
  }
  let x0 = x[x0Idx];

  // Estimate k from slope at midpoint
  const windowK = Math.max(1, Math.floor(n / 20));
  const i1 = Math.max(0, x0Idx - windowK);
  const i2 = Math.min(n - 1, x0Idx + windowK);
  const dx = x[i2] - x[i1];
  const dy = y[i2] - y[i1];
  let k = dx !== 0 ? (4 * dy) / (L * dx) : 1;

  // Simple gradient descent refinement (few iterations)
  for (let iter = 0; iter < 50; iter++) {
    let gradK = 0,
      gradX0 = 0;
    for (let i = 0; i < n; i++) {
      const z = -k * (x[i] - x0);
      const ez = Math.exp(Math.max(-50, Math.min(50, z)));
      const pred = yMin + yRange / (1 + ez);
      const err = pred - y[i];
      const denom = (1 + ez) * (1 + ez);
      const dSigma = (yRange * ez) / denom;
      gradK += err * dSigma * -(x[i] - x0);
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
export function kdeSmoothing(
  x: Float64Array,
  y: Float64Array,
  bandwidth?: number,
): Float64Array {
  const n = x.length;

  // Auto bandwidth using Silverman's rule on x spacing
  let h = bandwidth;
  if (!h) {
    let sumX = 0,
      sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumX2 += x[i] * x[i];
    }
    const meanX = sumX / n;
    const stdX = Math.sqrt(sumX2 / n - meanX * meanX);
    h = 1.06 * stdX * n ** -0.2;
    if (h < 1e-12) h = (x[n - 1] - x[0]) / (n * 0.1);
  }

  const result = new Float64Array(n);

  // For N <= 256, exact O(N^2) evaluation is fast enough and avoids grid allocation overhead
  if (n <= 256) {
    const weightSum = new Float64Array(n);
    const h2 = 2 * h * h;

    // Limit kernel evaluation to ±3σ and use symmetry
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

  // For N > 256, use O(N) Grid-Based Fast Binning
  const range = x[n - 1] - x[0];

  // Handle edge case where points are practically identical
  if (range < 1e-12) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += y[i];
    const avg = sum / n;
    for (let i = 0; i < n; i++) result[i] = avg;
    return result;
  }

  const desiredSpacing = h / 4;
  let numBins = Math.ceil(range / desiredSpacing);
  numBins = Math.max(512, Math.min(8192, numBins));

  const gridY = new Float64Array(numBins);
  const gridW = new Float64Array(numBins);
  const minX = x[0];
  const binWidth = range / (numBins - 1);

  // Linear binning
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const binFloat = (xi - minX) / binWidth;
    const binIdx = Math.floor(binFloat);
    const frac = binFloat - binIdx;

    if (binIdx >= 0 && binIdx < numBins - 1) {
      gridY[binIdx] += y[i] * (1 - frac);
      gridW[binIdx] += 1 - frac;
      gridY[binIdx + 1] += y[i] * frac;
      gridW[binIdx + 1] += frac;
    } else if (binIdx === numBins - 1) {
      gridY[binIdx] += y[i];
      gridW[binIdx] += 1;
    } else if (binIdx >= numBins) {
      gridY[numBins - 1] += y[i];
      gridW[numBins - 1] += 1;
    } else {
      gridY[0] += y[i];
      gridW[0] += 1;
    }
  }

  const smoothedY = new Float64Array(numBins);
  const smoothedW = new Float64Array(numBins);
  const h2 = 2 * h * h;
  const windowBins = Math.ceil((3 * h) / binWidth);

  const expWeights = new Float64Array(windowBins + 1);
  for (let j = 0; j <= windowBins; j++) {
    const dx = j * binWidth;
    expWeights[j] = Math.exp(-(dx * dx) / h2);
  }

  // Convolve over the grid
  for (let i = 0; i < numBins; i++) {
    let sumY = 0;
    let sumW = 0;
    const start = Math.max(0, i - windowBins);
    const end = Math.min(numBins - 1, i + windowBins);

    for (let j = start; j <= end; j++) {
      if (gridW[j] === 0) continue;
      const w = expWeights[Math.abs(i - j)];
      sumY += w * gridY[j];
      sumW += w * gridW[j];
    }
    smoothedY[i] = sumY;
    smoothedW[i] = sumW;
  }

  // Interpolate back to original points
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const binFloat = (xi - minX) / binWidth;
    const binIdx = Math.floor(binFloat);

    if (binIdx < 0) {
      result[i] = smoothedW[0] > 0 ? smoothedY[0] / smoothedW[0] : y[i];
      continue;
    }
    if (binIdx >= numBins - 1) {
      const last = numBins - 1;
      result[i] =
        smoothedW[last] > 0 ? smoothedY[last] / smoothedW[last] : y[i];
      continue;
    }

    const frac = binFloat - binIdx;
    const w0 = smoothedW[binIdx];
    const w1 = smoothedW[binIdx + 1];

    const y0 = w0 > 0 ? smoothedY[binIdx] / w0 : y[i];
    const y1 = w1 > 0 ? smoothedY[binIdx + 1] / w1 : y[i];

    result[i] = y0 * (1 - frac) + y1 * frac;
  }
  return result;
}

import { describe, it, expect } from 'vitest';
import { buildLodLevels, MIN_LOD_POINTS, selectLodLevel } from '../lod';

describe('buildLodLevels', () => {
  it('returns empty array when points below MIN_LOD_POINTS', () => {
    const n = MIN_LOD_POINTS - 1;
    const x = new Float32Array(n).map((_, i) => i);
    const y = new Float32Array(n).map((_, i) => Math.sin(i));
    expect(buildLodLevels(x, y).length).toBe(0);
  });

  it('produces levels in ascending point count, coarsest first', () => {
    const n = 10000;
    const x = new Float32Array(n).map((_, i) => i);
    const y = new Float32Array(n).map((_, i) => Math.sin(i * 0.01));
    const levels = buildLodLevels(x, y);
    expect(levels.length).toBeGreaterThan(0);
    for (let i = 0; i < levels.length - 1; i++) {
      expect(levels[i].length).toBeLessThan(levels[i + 1].length);
    }
    expect(levels[0].length).toBeLessThanOrEqual(514);
  });

  it('interleaves x and y correctly', () => {
    const n = MIN_LOD_POINTS + 100;
    const x = new Float32Array(n).map((_, i) => i);
    const y = new Float32Array(n).map((_, i) => i * 2);
    const levels = buildLodLevels(x, y);
    if (levels.length === 0) return;
    const level = levels[levels.length - 1];
    for (let i = 0; i < level.length - 1; i += 2) {
      expect(level[i + 1]).toBeCloseTo(level[i] * 2, 3);
    }
  });

  it('first and last points of each level match input first/last', () => {
    const n = 5000;
    const x = new Float32Array(n).map((_, i) => i * 0.1);
    const y = new Float32Array(n).map((_, i) => Math.cos(i * 0.01));
    const levels = buildLodLevels(x, y);
    for (const level of levels) {
      expect(level[0]).toBeCloseTo(x[0], 4);
      expect(level[1]).toBeCloseTo(y[0], 4);
      expect(level[level.length - 2]).toBeCloseTo(x[n - 1], 4);
      expect(level[level.length - 1]).toBeCloseTo(y[n - 1], 4);
    }
  });
});

describe('selectLodLevel', () => {
  it('returns null when no lod levels', () => {
    expect(selectLodLevel(undefined, 100, 1000, 10000)).toBeNull();
    expect(selectLodLevel([], 100, 1000, 10000)).toBeNull();
  });

  it('returns null when estimated visible pts below pixelBudget for all levels', () => {
    const makeLevel = (n: number) => new Float32Array(n * 2);
    const levels = [makeLevel(256), makeLevel(512)];
    // fraction=100/10000=0.01, snapped~0.0078; 512*0.0078≈4 < budget=300 → null
    expect(selectLodLevel(levels, 300, 100, 10000)).toBeNull();
  });

  it('returns finest level where estimated visible pts >= pixelBudget', () => {
    const makeLevel = (n: number) => new Float32Array(n * 2);
    const levels = [makeLevel(256), makeLevel(512), makeLevel(4096)];
    // fraction=5000/10000=0.5, snapped=0.5; 4096*0.5=2048 >= 300 → finest=4096
    const result = selectLodLevel(levels, 300, 5000, 10000);
    expect(result).toBe(levels[2]);
  });

  it('does not switch levels for small zoom changes near boundary', () => {
    const makeLevel = (n: number) => new Float32Array(n * 2);
    const levels = [makeLevel(256), makeLevel(512), makeLevel(1024)];
    // Both visible counts have same snapped fraction → same level
    const r1 = selectLodLevel(levels, 50, 1100, 10000);
    const r2 = selectLodLevel(levels, 50, 1900, 10000);
    expect(r1).toBe(r2);
  });
});

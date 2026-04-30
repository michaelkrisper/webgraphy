import { describe, it, expect } from 'vitest';
import { buildSeriesConfig } from '../series';
import { COLOR_PALETTE } from '../../themes';

describe('buildSeriesConfig', () => {
  it('returns a SeriesConfig with correct fields', () => {
    const s = buildSeriesConfig('A: Temperature', 'ds-1', 0);
    expect(s.sourceId).toBe('ds-1');
    expect(s.yColumn).toBe('A: Temperature');
    expect(s.name).toBe('A: Temperature');
    expect(s.yAxisId).toBe('axis-1');
    expect(s.lineColor).toBe(COLOR_PALETTE[0]);
    expect(s.pointColor).toBe(COLOR_PALETTE[0]);
    expect(s.lineStyle).toBe('solid');
    expect(s.pointStyle).toBe('circle');
    expect(s.hidden).toBe(false);
    expect(typeof s.id).toBe('string');
    expect(s.id.length).toBeGreaterThan(0);
  });

  it('cycles color palette by existingSeriesCount', () => {
    const s0 = buildSeriesConfig('Col', 'ds-1', 0);
    const s1 = buildSeriesConfig('Col', 'ds-1', 1);
    expect(s0.lineColor).toBe(COLOR_PALETTE[0]);
    expect(s1.lineColor).toBe(COLOR_PALETTE[1]);
  });

  it('assigns axis-1 for count 0, axis-2 for count 1', () => {
    const s0 = buildSeriesConfig('Col', 'ds-1', 0);
    const s1 = buildSeriesConfig('Col', 'ds-1', 1);
    expect(s0.yAxisId).toBe('axis-1');
    expect(s1.yAxisId).toBe('axis-2');
  });

  it('wraps axis assignment at 9', () => {
    const s9 = buildSeriesConfig('Col', 'ds-1', 9);
    expect(s9.yAxisId).toBe('axis-1');
  });
});

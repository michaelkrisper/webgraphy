import { describe, it, expect } from 'vitest';
import { applyKeyboardPan, applyKeyboardZoom } from '../keyboard';
import { useGraphStore } from '../../store/useGraphStore';

const mockState = {
  xAxes: [{ id: 'x1', min: 0, max: 100 }],
  yAxes: [{ id: 'y1', min: 0, max: 100 }]
} as ReturnType<typeof useGraphStore.getState>;

describe('keyboard utils', () => {
  describe('applyKeyboardPan', () => {
    it('should return false when no arrow keys are present', () => {
      const keys = new Set(['a', 'b', 'Enter']);
      const targetXAxes = {};
      const targetYs = {};
      expect(applyKeyboardPan(mockState, keys, targetXAxes, targetYs)).toBe(false);
      expect(targetXAxes).toEqual({});
      expect(targetYs).toEqual({});
    });

    it('should pan right when ArrowRight is pressed', () => {
      const keys = new Set(['ArrowRight']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardPan(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetXAxes['x1']).toEqual({ min: 5, max: 105 });
      expect(targetYs).toEqual({});
    });

    it('should pan left when ArrowLeft is pressed', () => {
      const keys = new Set(['ArrowLeft']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardPan(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetXAxes['x1']).toEqual({ min: -5, max: 95 });
      expect(targetYs).toEqual({});
    });

    it('should pan up when ArrowUp is pressed', () => {
      const keys = new Set(['ArrowUp']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardPan(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetYs['y1']).toEqual({ min: 5, max: 105 });
      expect(targetXAxes).toEqual({});
    });

    it('should pan down when ArrowDown is pressed', () => {
      const keys = new Set(['ArrowDown']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardPan(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetYs['y1']).toEqual({ min: -5, max: 95 });
      expect(targetXAxes).toEqual({});
    });

    it('should pan diagonally when both horizontal and vertical keys are pressed', () => {
      const keys = new Set(['ArrowRight', 'ArrowUp']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardPan(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetXAxes['x1']).toEqual({ min: 5, max: 105 });
      expect(targetYs['y1']).toEqual({ min: 5, max: 105 });
    });

    it('should use existing bounds from targets if already populated', () => {
      const keys = new Set(['ArrowRight', 'ArrowUp']);
      const targetXAxes = { 'x1': { min: 10, max: 110 } };
      const targetYs = { 'y1': { min: -10, max: 40 } };

      expect(applyKeyboardPan(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetXAxes['x1']).toEqual({ min: 15, max: 115 });
      expect(targetYs['y1']).toEqual({ min: -7.5, max: 42.5 });
    });
  });

  describe('applyKeyboardZoom', () => {
    it('should return false when no zoom keys are present', () => {
      const keys = new Set(['a', 'b', 'Enter']);
      const targetXAxes = {};
      const targetYs = {};
      expect(applyKeyboardZoom(mockState, keys, targetXAxes, targetYs)).toBe(false);
      expect(targetXAxes).toEqual({});
      expect(targetYs).toEqual({});
    });

    it('should zoom in on both axes when + is pressed', () => {
      const keys = new Set(['+']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardZoom(mockState, keys, targetXAxes, targetYs)).toBe(true);
      // range = 100. zoomFactor = 0.85
      // newRange = 85. offset = (100 - 85) / 2 = 7.5
      // new min = 0 + 7.5 = 7.5. new max = 100 - 7.5 = 92.5
      expect(targetXAxes['x1'].min).toBeCloseTo(7.5);
      expect(targetXAxes['x1'].max).toBeCloseTo(92.5);
      expect(targetYs['y1'].min).toBeCloseTo(7.5);
      expect(targetYs['y1'].max).toBeCloseTo(92.5);
    });

    it('should zoom in on both axes when = is pressed', () => {
      const keys = new Set(['=']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardZoom(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetXAxes['x1'].min).toBeCloseTo(7.5);
      expect(targetXAxes['x1'].max).toBeCloseTo(92.5);
      expect(targetYs['y1'].min).toBeCloseTo(7.5);
      expect(targetYs['y1'].max).toBeCloseTo(92.5);
    });

    it('should zoom out on both axes when - is pressed', () => {
      const keys = new Set(['-']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardZoom(mockState, keys, targetXAxes, targetYs)).toBe(true);
      // range = 100. zoomFactor = 1.15
      // newRange = 115. offset = (100 - 115) / 2 = -7.5
      // new min = 0 - (-7.5) = -7.5. new max = 100 - (-7.5) = 107.5
      expect(targetXAxes['x1'].min).toBeCloseTo(-7.5);
      expect(targetXAxes['x1'].max).toBeCloseTo(107.5);
      expect(targetYs['y1'].min).toBeCloseTo(-7.5);
      expect(targetYs['y1'].max).toBeCloseTo(107.5);
    });

    it('should zoom out on both axes when _ is pressed', () => {
      const keys = new Set(['_']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardZoom(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetXAxes['x1'].min).toBeCloseTo(-7.5);
      expect(targetXAxes['x1'].max).toBeCloseTo(107.5);
      expect(targetYs['y1'].min).toBeCloseTo(-7.5);
      expect(targetYs['y1'].max).toBeCloseTo(107.5);
    });

    it('should only zoom X axes when Control is pressed', () => {
      const keys = new Set(['+', 'Control']);
      const targetXAxes: Record<string, { min: number, max: number }> = {};
      const targetYs: Record<string, { min: number, max: number }> = {};

      expect(applyKeyboardZoom(mockState, keys, targetXAxes, targetYs)).toBe(true);
      expect(targetXAxes['x1'].min).toBeCloseTo(7.5);
      expect(targetXAxes['x1'].max).toBeCloseTo(92.5);
      expect(targetYs).toEqual({});
    });

    it('should use existing bounds from targets if already populated', () => {
      const keys = new Set(['+']);
      const targetXAxes = { 'x1': { min: 10, max: 110 } }; // range = 100
      const targetYs = { 'y1': { min: -10, max: 40 } }; // range = 50

      expect(applyKeyboardZoom(mockState, keys, targetXAxes, targetYs)).toBe(true);
      // X offset = (100 - 85) / 2 = 7.5. new X = 17.5 to 102.5
      // Y offset = (50 - 42.5) / 2 = 3.75. new Y = -6.25 to 36.25
      expect(targetXAxes['x1'].min).toBeCloseTo(17.5);
      expect(targetXAxes['x1'].max).toBeCloseTo(102.5);
      expect(targetYs['y1'].min).toBeCloseTo(-6.25);
      expect(targetYs['y1'].max).toBeCloseTo(36.25);
    });
  });
});

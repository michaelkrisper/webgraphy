import { describe, it, expect } from 'vitest';
import { worldToScreen, screenToWorld, type Viewport } from './coords';

describe('Coordinate Conversions', () => {
  describe('worldToScreen', () => {
    it('converts correctly without padding', () => {
      const view: Viewport = {
        xMin: 0, xMax: 100,
        yMin: 0, yMax: 100,
        width: 1000, height: 500,
      };

      // Bottom-left (y is inverted on screen)
      expect(worldToScreen(0, 0, view)).toEqual({ x: 0, y: 500 });
      // Top-right
      expect(worldToScreen(100, 100, view)).toEqual({ x: 1000, y: 0 });
      // Middle
      expect(worldToScreen(50, 50, view)).toEqual({ x: 500, y: 250 });
      // Out of bounds
      expect(worldToScreen(-10, 110, view)).toEqual({ x: -100, y: -50 });
    });

    it('converts correctly with padding', () => {
      const view: Viewport = {
        xMin: 0, xMax: 100,
        yMin: 0, yMax: 100,
        width: 1000, height: 500,
        padding: { top: 10, right: 20, bottom: 30, left: 40 }
      };

      // Bottom-left: (x: 0, y: 0)
      expect(worldToScreen(0, 0, view)).toEqual({ x: 40, y: 470 });

      // Top-right: (x: 100, y: 100)
      expect(worldToScreen(100, 100, view)).toEqual({ x: 980, y: 10 });

      // Middle: (x: 50, y: 50)
      expect(worldToScreen(50, 50, view)).toEqual({ x: 510, y: 240 });
    });
  });

  describe('screenToWorld', () => {
    it('converts correctly without padding', () => {
      const view: Viewport = {
        xMin: 0, xMax: 100,
        yMin: 0, yMax: 100,
        width: 1000, height: 500,
      };

      // Bottom-left
      expect(screenToWorld(0, 500, view)).toEqual({ x: 0, y: 0 });
      // Top-right
      expect(screenToWorld(1000, 0, view)).toEqual({ x: 100, y: 100 });
      // Middle
      expect(screenToWorld(500, 250, view)).toEqual({ x: 50, y: 50 });
    });

    it('converts correctly with padding', () => {
      const view: Viewport = {
        xMin: 0, xMax: 100,
        yMin: 0, yMax: 100,
        width: 1000, height: 500,
        padding: { top: 10, right: 20, bottom: 30, left: 40 }
      };

      // From previous test values
      expect(screenToWorld(40, 470, view)).toEqual({ x: 0, y: 0 });
      expect(screenToWorld(980, 10, view)).toEqual({ x: 100, y: 100 });
      expect(screenToWorld(510, 240, view)).toEqual({ x: 50, y: 50 });
    });
  });

describe('reversibility', () => {
    it('worldToScreen -> screenToWorld', () => {
      const view: Viewport = {
        xMin: -50, xMax: 150,
        yMin: -10, yMax: 20,
        width: 800, height: 600,
        padding: { top: 15, right: 25, bottom: 35, left: 45 }
      };

      const points = [
        { x: 0, y: 0 },
        { x: -50, y: -10 },
        { x: 150, y: 20 },
        { x: 50, y: 5 },
        { x: 200, y: 50 } // out of bounds
      ];

      for (const p of points) {
        const screen = worldToScreen(p.x, p.y, view);
        const world = screenToWorld(screen.x, screen.y, view);

        expect(world.x).toBeCloseTo(p.x);
        expect(world.y).toBeCloseTo(p.y);
      }
    });

    it('screenToWorld -> worldToScreen', () => {
      const view: Viewport = {
        xMin: -50, xMax: 150,
        yMin: -10, yMax: 20,
        width: 800, height: 600,
        padding: { top: 15, right: 25, bottom: 35, left: 45 }
      };

      const points = [
        { x: 0, y: 0 },
        { x: 45, y: 565 },
        { x: 775, y: 15 },
        { x: 400, y: 300 },
        { x: -100, y: 800 } // out of bounds
      ];

      for (const p of points) {
        const world = screenToWorld(p.x, p.y, view);
        const screen = worldToScreen(world.x, world.y, view);

        expect(screen.x).toBeCloseTo(p.x);
        expect(screen.y).toBeCloseTo(p.y);
      }
    });
  });

  describe('degenerate dimensions', () => {
    it('handles zero chart width safely', () => {
      const view: Viewport = {
        xMin: 0, xMax: 100,
        yMin: 0, yMax: 100,
        width: 10, height: 500,
        padding: { top: 0, right: 5, bottom: 0, left: 5 } // width = 10 - 5 - 5 = 0
      };

      const result = screenToWorld(5, 250, view);
      expect(result.x).toBeNaN(); // or Infinity/0 depending on exact logic, but we test it doesn't crash
      // Since chartWidth is 0, (sx - p.left) / chartWidth is 0 / 0 which is NaN
    });

    it('handles zero chart height safely', () => {
      const view: Viewport = {
        xMin: 0, xMax: 100,
        yMin: 0, yMax: 100,
        width: 1000, height: 20,
        padding: { top: 10, right: 0, bottom: 10, left: 0 } // height = 20 - 10 - 10 = 0
      };

      const result = screenToWorld(500, 10, view);
      expect(result.y).toBeNaN(); // (view.height - p.bottom - sy) is 20 - 10 - 10 = 0. 0 / 0 is NaN
    });
  });
});

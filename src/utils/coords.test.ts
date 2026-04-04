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
    it('should be perfectly reversible', () => {
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
  });
});

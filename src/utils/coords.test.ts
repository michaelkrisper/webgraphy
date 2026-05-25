import { describe, expect, it } from "vitest";
import { screenToWorld, type Viewport, worldToScreen } from "./coords";

describe("Coordinate Conversions", () => {
	describe("worldToScreen", () => {
		it("defaults to zero padding if not provided", () => {
			const viewWithoutPadding: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
			};

			const viewWithZeroPadding: Viewport = {
				...viewWithoutPadding,
				padding: { top: 0, right: 0, bottom: 0, left: 0 },
			};

			expect(worldToScreen(50, 50, viewWithoutPadding)).toEqual(
				worldToScreen(50, 50, viewWithZeroPadding),
			);
		});

		it("converts correctly without padding", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
			};

			expect(worldToScreen(0, 0, view)).toEqual({ x: 0, y: 500 });
			expect(worldToScreen(100, 100, view)).toEqual({ x: 1000, y: 0 });
			expect(worldToScreen(50, 50, view)).toEqual({ x: 500, y: 250 });
			expect(worldToScreen(-10, 110, view)).toEqual({ x: -100, y: -50 });
		});

		it("handles division by zero when min and max bounds are equal", () => {
			const view: Viewport = {
				xMin: 100,
				xMax: 100,
				yMin: 50,
				yMax: 50,
				width: 1000,
				height: 500,
			};

			const result = worldToScreen(100, 50, view);

			// Degenerate (zero-width) range centers the point instead of NaN.
			expect(result).toEqual({ x: 500, y: 250 });
		});

		it("handles negative coordinates correctly", () => {
			const view: Viewport = {
				xMin: -100,
				xMax: 100,
				yMin: -100,
				yMax: 100,
				width: 1000,
				height: 500,
			};

			expect(worldToScreen(-50, -50, view)).toEqual({ x: 250, y: 375 });
		});

		it("handles zero width and height views correctly", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 0,
				height: 0,
				padding: { top: 0, right: 0, bottom: 0, left: 0 },
			};

			expect(worldToScreen(50, 50, view)).toEqual({ x: 0, y: 0 });
		});

		it("handles negative padding values correctly", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
				padding: { top: -10, right: -20, bottom: -30, left: -40 },
			};

			expect(worldToScreen(50, 50, view)).toEqual({ x: 490, y: 260 });
		});

		it("handles negative screen coordinates correctly", () => {
			const view: Viewport = {
				xMin: -100,
				xMax: 100,
				yMin: -100,
				yMax: 100,
				width: 1000,
				height: 500,
			};

			expect(screenToWorld(-250, -125, view)).toEqual({ x: -150, y: 150 });
		});

		it("handles negative padding values correctly", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
				padding: { top: -10, right: -20, bottom: -30, left: -40 },
			};

			expect(screenToWorld(490, 260, view)).toEqual({ x: 50, y: 50 });
		});

		it("handles zero width and height views correctly", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 0,
				height: 0,
				padding: { top: 0, right: 0, bottom: 0, left: 0 },
			};

			const result = screenToWorld(50, 50, view);
			expect(result.x).toBe(Infinity);
			expect(result.y).toBe(-Infinity);
		});

		it("converts correctly with padding", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
				padding: { top: 10, right: 20, bottom: 30, left: 40 },
			};

			expect(worldToScreen(0, 0, view)).toEqual({ x: 40, y: 470 });

			expect(worldToScreen(100, 100, view)).toEqual({ x: 980, y: 10 });

			expect(worldToScreen(50, 50, view)).toEqual({ x: 510, y: 240 });
		});

		it("handles negative coordinate ranges", () => {
			const view: Viewport = {
				xMin: -100,
				xMax: -50,
				yMin: -100,
				yMax: -50,
				width: 1000,
				height: 500,
			};

			expect(worldToScreen(-100, -100, view)).toEqual({ x: 0, y: 500 });
			expect(worldToScreen(-50, -50, view)).toEqual({ x: 1000, y: 0 });
			expect(worldToScreen(-75, -75, view)).toEqual({ x: 500, y: 250 });
		});

		it("handles inverted ranges (max < min)", () => {
			const view: Viewport = {
				xMin: 100,
				xMax: 0,
				yMin: 100,
				yMax: 0,
				width: 1000,
				height: 500,
			};

			expect(worldToScreen(100, 100, view)).toEqual({ x: 0, y: 500 });
			expect(worldToScreen(0, 0, view)).toEqual({ x: 1000, y: 0 });
		});

		it("handles zero range (min === max)", () => {
			const view: Viewport = {
				xMin: 50,
				xMax: 50,
				yMin: 50,
				yMax: 50,
				width: 1000,
				height: 500,
			};

			const result = worldToScreen(50, 50, view);
			// Degenerate (zero-width) range centers the point instead of NaN.
			expect(result).toEqual({ x: 500, y: 250 });
		});

		it("handles extreme padding (collapsed chart area)", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 100,
				height: 100,
				padding: { top: 50, right: 50, bottom: 50, left: 50 },
			};

			expect(worldToScreen(0, 0, view)).toEqual({ x: 50, y: 50 });
			expect(worldToScreen(100, 100, view)).toEqual({ x: 50, y: 50 });
		});

		it("handles NaN and Infinity inputs", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
			};

			expect(worldToScreen(NaN, 50, view)).toEqual({ x: NaN, y: 250 });
			expect(worldToScreen(50, NaN, view)).toEqual({ x: 500, y: NaN });

			expect(worldToScreen(Infinity, 50, view)).toEqual({
				x: Infinity,
				y: 250,
			});
			expect(worldToScreen(50, -Infinity, view)).toEqual({
				x: 500,
				y: Infinity,
			});
		});
	});

	describe("screenToWorld", () => {
		it("converts correctly without padding", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
			};

			expect(screenToWorld(0, 500, view)).toEqual({ x: 0, y: 0 });
			expect(screenToWorld(1000, 0, view)).toEqual({ x: 100, y: 100 });
			expect(screenToWorld(500, 250, view)).toEqual({ x: 50, y: 50 });
		});

		it("converts correctly with padding", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
				padding: { top: 10, right: 20, bottom: 30, left: 40 },
			};

			expect(screenToWorld(40, 470, view)).toEqual({ x: 0, y: 0 });
			expect(screenToWorld(980, 10, view)).toEqual({ x: 100, y: 100 });
			expect(screenToWorld(510, 240, view)).toEqual({ x: 50, y: 50 });
		});

		it("handles negative coordinate ranges", () => {
			const view: Viewport = {
				xMin: -100,
				xMax: -50,
				yMin: -100,
				yMax: -50,
				width: 1000,
				height: 500,
			};

			expect(screenToWorld(0, 500, view)).toEqual({ x: -100, y: -100 });
			expect(screenToWorld(1000, 0, view)).toEqual({ x: -50, y: -50 });
			expect(screenToWorld(500, 250, view)).toEqual({ x: -75, y: -75 });
		});

		it("handles inverted ranges (max < min)", () => {
			const view: Viewport = {
				xMin: 100,
				xMax: 0,
				yMin: 100,
				yMax: 0,
				width: 1000,
				height: 500,
			};

			expect(screenToWorld(0, 500, view)).toEqual({ x: 100, y: 100 });
			expect(screenToWorld(1000, 0, view)).toEqual({ x: 0, y: 0 });
		});

		it("handles zero range (min === max)", () => {
			const view: Viewport = {
				xMin: 50,
				xMax: 50,
				yMin: 50,
				yMax: 50,
				width: 1000,
				height: 500,
			};

			const result = screenToWorld(500, 250, view);
			expect(result.x).toBe(50);
			expect(result.y).toBe(50);
		});

		it("handles extreme padding (collapsed chart area)", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 100,
				height: 100,
				padding: { top: 50, right: 50, bottom: 50, left: 50 },
			};

			const result = screenToWorld(50, 50, view);
			expect(Number.isNaN(result.x)).toBe(true);
			expect(Number.isNaN(result.y)).toBe(true);
		});

		it("handles NaN and Infinity inputs", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 500,
			};

			expect(screenToWorld(NaN, 250, view)).toEqual({ x: NaN, y: 50 });
			expect(screenToWorld(500, NaN, view)).toEqual({ x: 50, y: NaN });

			expect(screenToWorld(Infinity, 250, view)).toEqual({
				x: Infinity,
				y: 50,
			});
			expect(screenToWorld(500, -Infinity, view)).toEqual({
				x: 50,
				y: Infinity,
			});
		});
	});

	describe("reversibility", () => {
		it("worldToScreen -> screenToWorld", () => {
			const view: Viewport = {
				xMin: -50,
				xMax: 150,
				yMin: -10,
				yMax: 20,
				width: 800,
				height: 600,
				padding: { top: 15, right: 25, bottom: 35, left: 45 },
			};

			const points = [
				{ x: 0, y: 0 },
				{ x: -50, y: -10 },
				{ x: 150, y: 20 },
				{ x: 50, y: 5 },
				{ x: 200, y: 50 },
			];

			for (const p of points) {
				const screen = worldToScreen(p.x, p.y, view);
				const world = screenToWorld(screen.x, screen.y, view);

				expect(world.x).toBeCloseTo(p.x);
				expect(world.y).toBeCloseTo(p.y);
			}
		});

		it("screenToWorld -> worldToScreen", () => {
			const view: Viewport = {
				xMin: -50,
				xMax: 150,
				yMin: -10,
				yMax: 20,
				width: 800,
				height: 600,
				padding: { top: 15, right: 25, bottom: 35, left: 45 },
			};

			const points = [
				{ x: 0, y: 0 },
				{ x: 45, y: 565 },
				{ x: 775, y: 15 },
				{ x: 400, y: 300 },
				{ x: -100, y: 800 },
			];

			for (const p of points) {
				const world = screenToWorld(p.x, p.y, view);
				const screen = worldToScreen(world.x, world.y, view);

				expect(screen.x).toBeCloseTo(p.x);
				expect(screen.y).toBeCloseTo(p.y);
			}
		});
	});

	describe("degenerate dimensions", () => {
		it("worldToScreen handles zero chart width safely", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 10,
				height: 500,
				padding: { top: 0, right: 5, bottom: 0, left: 5 },
			};

			const result = worldToScreen(50, 50, view);
			expect(result.x).toBe(5);
			expect(result.y).toBe(250);
		});

		it("worldToScreen handles zero chart height safely", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 20,
				padding: { top: 10, right: 0, bottom: 10, left: 0 },
			};

			const result = worldToScreen(50, 50, view);
			expect(result.x).toBe(500);
			expect(result.y).toBe(10);
		});

		it("handles zero chart width safely", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 10,
				height: 500,
				padding: { top: 0, right: 5, bottom: 0, left: 5 },
			};

			const result = screenToWorld(5, 250, view);
			expect(result.x).toBeNaN();
		});

		it("handles zero chart height safely", () => {
			const view: Viewport = {
				xMin: 0,
				xMax: 100,
				yMin: 0,
				yMax: 100,
				width: 1000,
				height: 20,
				padding: { top: 10, right: 0, bottom: 10, left: 0 },
			};

			const result = screenToWorld(500, 10, view);
			expect(result.y).toBeNaN();
		});
	});
});

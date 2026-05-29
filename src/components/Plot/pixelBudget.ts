// Adaptive decimation budget for WebGLRenderer.
//
// The decimation pixel budget controls how many M4-aggregated points the
// renderer hands to the line shader per frame. Larger = sharper but slower.
// The renderer measures the previous frame's draw time and nudges the
// budget multiplier between MIN and MAX so pan/zoom stays interactive.

export const MIN_PIXEL_BUDGET_MULT = 32;
export const MAX_PIXEL_BUDGET_MULT = 64;

const TARGET_MS = 20;
const BUDGET_UPDATE_INTERVAL = 33;

/**
 * Adjust the pixel-budget multiplier in place based on the last frame time.
 *
 * - If the frame missed the target by a wide margin, scale the budget down
 *   by 20% (clamped at MIN_PIXEL_BUDGET_MULT).
 * - If the frame ran in under half the target, scale up by 20% (clamped at
 *   MAX_PIXEL_BUDGET_MULT).
 * - Otherwise leave the budget untouched.
 *
 * Rate-limited: at most one adjustment per BUDGET_UPDATE_INTERVAL ms.
 */
export function updatePixelBudget(
	frameTime: number,
	now: number,
	lastBudgetUpdateRef: { current: number },
	pixelBudgetMultRef: { current: number },
): void {
	if (now - lastBudgetUpdateRef.current < BUDGET_UPDATE_INTERVAL) return;
	lastBudgetUpdateRef.current = now;
	if (frameTime > TARGET_MS) {
		pixelBudgetMultRef.current = Math.max(
			MIN_PIXEL_BUDGET_MULT,
			pixelBudgetMultRef.current * 0.8,
		);
	} else if (frameTime < TARGET_MS * 0.5) {
		pixelBudgetMultRef.current = Math.min(
			MAX_PIXEL_BUDGET_MULT,
			pixelBudgetMultRef.current * 1.2,
		);
	}
}

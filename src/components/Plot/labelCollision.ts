/**
 * Horizontal collision culling for label rows whose texts can crowd each
 * other (the date-axis period row). Text widths are only known where the
 * labels are rasterized (labelAtlas.ts), so buildLabels tags such a row with
 * a `cullGroup` and the renderer feeds every label through a LabelCuller as
 * it measures it. List order is priority: within a group, a label is dropped
 * when its extent comes within MIN_GAP of an already accepted one.
 */

import type { RenderLabel } from "./rendererCore";

/** Minimum free space (CSS px) between two labels of one group. */
export const LABEL_MIN_GAP = 4;

/** Horizontal [left, right] extent of a label incl. its bg/separator chrome. */
export function labelExtent(
	l: Pick<RenderLabel, "x" | "align" | "bg" | "tick">,
	width: number,
): [number, number] {
	let left =
		l.align === "center"
			? l.x - width / 2
			: l.align === "right"
				? l.x - width
				: l.x;
	let right = left + width;
	// Mirrors the chrome quads drawn by rendererCore.drawLabels.
	if (l.bg) {
		left -= 2;
		right += 2;
	}
	if (l.tick) {
		left = Math.min(left, l.tick.x - 1);
		right = Math.max(right, l.tick.x + 1);
	}
	return [left, right];
}

export class LabelCuller {
	private readonly kept = new Map<string, number[]>();

	reset(): void {
		for (const spans of this.kept.values()) spans.length = 0;
	}

	/** Whether `l` (text `width` CSS px wide) should be drawn. */
	accept(l: RenderLabel, width: number): boolean {
		if (l.cullGroup === undefined) return true;
		const [a, b] = labelExtent(l, width);
		let spans = this.kept.get(l.cullGroup);
		if (!spans) {
			spans = [];
			this.kept.set(l.cullGroup, spans);
		}
		for (let i = 0; i < spans.length; i += 2) {
			if (a < spans[i + 1] + LABEL_MIN_GAP && b + LABEL_MIN_GAP > spans[i]) {
				return false;
			}
		}
		spans.push(a, b);
		return true;
	}
}

/** Labels that survive culling, given a text-width measure. */
export function cullLabels(
	labels: readonly RenderLabel[],
	measure: (l: RenderLabel) => number,
): RenderLabel[] {
	const culler = new LabelCuller();
	return labels.filter((l) => culler.accept(l, measure(l)));
}

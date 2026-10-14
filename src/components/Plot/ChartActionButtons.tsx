// Floating "Fit All" and "Stacked Fit" buttons docked in the plot's bottom-
// left corner. Extracted from ChartContainer to keep the render block focused
// on layout rather than per-button styling.

import { ChartGantt, Expand } from "lucide-react";
import { SHORTCUTS, shortcutHint } from "../../utils/shortcuts";

interface Padding {
	bottom: number;
	left: number;
}

interface Theme {
	textMuted: string;
}

interface Props {
	padding: Padding;
	themeColors: Theme;
	onStackedFit: () => void;
	onFitAll: () => void;
}

const buttonStyle = (extraLeft: number, pad: Padding, color: string) =>
	({
		position: "absolute",
		bottom: pad.bottom - 29,
		left: pad.left - 29 - extraLeft,
		zIndex: 100,
		color,
	}) as const;

const fitAllHint = shortcutHint(SHORTCUTS.fitAll);
const stackedHint = shortcutHint(SHORTCUTS.stackedFit);

export function ChartActionButtons({
	padding,
	themeColors,
	onStackedFit,
	onFitAll,
}: Props) {
	return (
		<>
			<button
				onClick={onStackedFit}
				type="button"
				title={`Stacked Fit — each Y-axis fitted to its own slice (${stackedHint})`}
				aria-label="Stacked Fit"
				aria-keyshortcuts={stackedHint}
				className="chart-action-btn"
				style={buttonStyle(28, padding, themeColors.textMuted)}
			>
				<ChartGantt size={18} />
			</button>
			<button
				onClick={onFitAll}
				type="button"
				title={`Fit All (${fitAllHint})`}
				aria-label="Fit All"
				aria-keyshortcuts={fitAllHint}
				className="chart-action-btn"
				style={buttonStyle(0, padding, themeColors.textMuted)}
			>
				<Expand size={18} />
			</button>
		</>
	);
}

// Floating "Fit All" and "Stacked Fit" buttons docked in the plot's bottom-
// left corner. Extracted from ChartContainer to keep the render block focused
// on layout rather than per-button styling.

import { ChartGantt, Expand } from "lucide-react";

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
		backgroundColor: "transparent",
		border: "none",
		borderRadius: "4px",
		color,
		padding: "4px",
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		opacity: 0.6,
		transition: "opacity 0.2s",
	}) as const;

const handleEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
	e.currentTarget.style.opacity = "1";
};
const handleLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
	e.currentTarget.style.opacity = "0.6";
};

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
				title="Stacked Fit — each Y-axis fitted to its own slice"
				style={buttonStyle(28, padding, themeColors.textMuted)}
				onMouseEnter={handleEnter}
				onMouseLeave={handleLeave}
			>
				<ChartGantt size={18} />
			</button>
			<button
				onClick={onFitAll}
				type="button"
				title="Fit All"
				style={buttonStyle(0, padding, themeColors.textMuted)}
				onMouseEnter={handleEnter}
				onMouseLeave={handleLeave}
			>
				<Expand size={18} />
			</button>
		</>
	);
}

import type React from "react";
import { useCallback, useRef } from "react";
import type { SeriesConfig } from "../../services/persistence";

interface ChartLegendProps {
	series: SeriesConfig[];
	onToggleVisibility: (id: string, hidden: boolean) => void;
	onHighlight: (id: string | null) => void;
	padding?: { top: number; right: number; bottom: number; left: number };
}

export const ChartLegend: React.FC<ChartLegendProps> = ({
	series,
	onToggleVisibility,
	onHighlight,
	padding,
}) => {
	const positionRef = useRef<{ x: number; y: number } | null>(null);
	const dragRef = useRef<{
		startX: number;
		startY: number;
		origX: number;
		origY: number;
	} | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const applyPosition = useCallback((x: number, y: number) => {
		const el = containerRef.current;
		if (!el) return;
		el.style.left = `${x}px`;
		el.style.top = `${y}px`;
		el.style.right = "auto";
	}, []);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if ((e.target as HTMLElement).closest("[data-legend-item]")) return;
			e.preventDefault();
			e.stopPropagation();
			const el = containerRef.current;
			const cur = positionRef.current ?? {
				x: el
					? el.getBoundingClientRect().left -
						(el.offsetParent as HTMLElement)?.getBoundingClientRect().left
					: 20,
				y: 20,
			};
			dragRef.current = {
				startX: e.clientX,
				startY: e.clientY,
				origX: cur.x,
				origY: cur.y,
			};
			const handleMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				const nx = Math.max(
					0,
					dragRef.current.origX + (ev.clientX - dragRef.current.startX),
				);
				const ny = Math.max(
					0,
					dragRef.current.origY + (ev.clientY - dragRef.current.startY),
				);
				positionRef.current = { x: nx, y: ny };
				applyPosition(nx, ny);
			};
			const handleUp = () => {
				dragRef.current = null;
				window.removeEventListener("mousemove", handleMove);
				window.removeEventListener("mouseup", handleUp);
			};
			window.addEventListener("mousemove", handleMove);
			window.addEventListener("mouseup", handleUp);
		},
		[applyPosition],
	);

	const visibleSeries = series.filter(
		(s) => s.lineStyle !== "none" || s.pointStyle !== "none",
	);
	if (visibleSeries.length === 0) return null;

	const lineStyleDash = (style: string) => {
		if (style === "dashed") return "6,4";
		if (style === "dotted") return "2,3";
		return "none";
	};

	const pos = positionRef.current;

	return (
		<section
			ref={containerRef}
			onMouseDown={handleMouseDown}
			className="legend-container"
			aria-label="Chart Legend"
			style={
				pos
					? { left: pos.x, top: pos.y }
					: {
							right: (padding?.right ?? 0) + 10,
							top: (padding?.top ?? 0) + 10,
						}
			}
		>
			{visibleSeries.map((s) => (
				<button
					type="button"
					key={s.id}
					data-legend-item
					onClick={(e) => {
						e.stopPropagation();
						onToggleVisibility(s.id, !s.hidden);
					}}
					onMouseEnter={() => onHighlight(s.id)}
					onMouseLeave={() => onHighlight(null)}
					className="legend-item"
					style={{ opacity: s.hidden ? 0.35 : 1, transition: "opacity 0.15s" }}
					aria-label={`Toggle visibility for ${s.name}`}
				>
					<svg width="20" height="10" className="legend-line-icon">
						<title>{s.name} line icon</title>
						{s.lineStyle !== "none" && (
							<line
								x1="0"
								y1="5"
								x2="20"
								y2="5"
								stroke={s.lineColor}
								strokeWidth={1}
								strokeDasharray={lineStyleDash(s.lineStyle)}
							/>
						)}
						{s.pointStyle === "circle" && (
							<circle
								cx="10"
								cy="5"
								r="2.5"
								fill={s.pointColor}
								stroke="white"
								strokeWidth="0.75"
								paintOrder="stroke fill"
							/>
						)}
						{s.pointStyle === "square" && (
							<rect
								x="7.5"
								y="2.5"
								width="5"
								height="5"
								fill={s.pointColor}
								stroke="white"
								strokeWidth="0.75"
								paintOrder="stroke fill"
							/>
						)}
						{s.pointStyle === "cross" && (
							<path
								d="M7.5 2.5 L12.5 7.5 M12.5 2.5 L7.5 7.5"
								stroke={s.pointColor}
								strokeWidth="1.5"
							/>
						)}
					</svg>
					<span
						className={`legend-label${s.hidden ? " legend-label--hidden" : ""}`}
					>
						{s.name}
					</span>
				</button>
			))}
		</section>
	);
};

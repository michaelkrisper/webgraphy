// Small JSX overlays the plot area shows on top of the WebGL canvas:
// a "drop to import" curtain while a file is being dragged in, and the
// blue SVG zoom-box that follows a ctrl-drag selection. Both are
// presentational so they're trivial to test by render.

interface DragOverlayProps {
	visible: boolean;
}

export function PlotDragOverlay({ visible }: DragOverlayProps) {
	if (!visible) return null;
	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 100,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				backgroundColor: "rgba(0,0,0,0.35)",
				pointerEvents: "none",
			}}
		>
			<span
				style={{
					color: "#fff",
					fontSize: "1.4rem",
					fontWeight: 600,
					letterSpacing: "0.02em",
				}}
			>
				Drop to import
			</span>
		</div>
	);
}

interface ZoomBoxOverlayProps {
	visible: boolean;
	svgRef: React.RefObject<SVGSVGElement | null>;
	rectRef: React.RefObject<SVGRectElement | null>;
}

export function ZoomBoxOverlay({ visible, svgRef, rectRef }: ZoomBoxOverlayProps) {
	if (!visible) return null;
	return (
		<svg
			ref={svgRef}
			width="100%"
			height="100%"
			className="chart-abs-fill"
			style={{ zIndex: 30 }}
		>
			<title>Zoom Selection Box</title>
			<rect
				ref={rectRef}
				x={0}
				y={0}
				width={0}
				height={0}
				fill="rgba(0, 123, 255, 0.2)"
				stroke="#007bff"
				strokeWidth="1"
			/>
		</svg>
	);
}

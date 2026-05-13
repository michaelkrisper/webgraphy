import {
	ArrowUpDown,
	ChevronDown,
	ChevronRight,
	Circle,
	Hash,
	Minus,
	MoveHorizontal,
	Palette,
	Rows3,
} from "lucide-react";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import type { SeriesConfig } from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import { SeriesConfigUI } from "./SeriesConfig";

interface DataSeriesSectionProps {
	open: boolean;
	onToggle: () => void;
}

export const DataSeriesSection: React.FC<DataSeriesSectionProps> = ({
	open,
	onToggle,
}) => {
	const series = useGraphStore((s) => s.series);
	const datasets = useGraphStore((s) => s.datasets);
	const setHighlightedSeries = useGraphStore((s) => s.setHighlightedSeries);
	const reorderSeries = useGraphStore((s) => s.reorderSeries);

	const [dragId, setDragId] = useState<string | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const seriesListRef = useRef<HTMLDivElement>(null);
	const rowRectsRef = useRef<{ top: number; height: number; id: string }[]>([]);

	const startDrag = useCallback(
		(seriesId: string, startEvent: React.MouseEvent) => {
			if (!seriesListRef.current) return;
			const rows = Array.from(
				seriesListRef.current.querySelectorAll<HTMLElement>("[data-series-id]"),
			);
			rowRectsRef.current = rows.map((r) => {
				const rect = r.getBoundingClientRect();
				return {
					top: rect.top,
					height: rect.height,
					id: r.dataset.seriesId ?? "",
				};
			});
			const startY = startEvent.clientY;
			let hasMoved = false;

			const onMouseMove = (e: MouseEvent) => {
				if (!hasMoved && Math.abs(e.clientY - startY) > 5) {
					hasMoved = true;
					setDragId(seriesId);
					const origIdx = rowRectsRef.current.findIndex(
						(r) => r.id === seriesId,
					);
					setDropIndex(origIdx);
				}

				if (hasMoved) {
					const rects = rowRectsRef.current.filter((r) => r.id !== seriesId);
					let newIdx = rects.length;
					for (let i = 0; i < rects.length; i++) {
						if (e.clientY < rects[i].top + rects[i].height / 2) {
							newIdx = i;
							break;
						}
					}
					setDropIndex(newIdx);
				}
			};
			const onMouseUp = () => {
				window.removeEventListener("mousemove", onMouseMove);
				window.removeEventListener("mouseup", onMouseUp);
				if (hasMoved) {
					setDropIndex((prevDrop) => {
						setDragId((prevDrag) => {
							if (prevDrag) reorderSeries(prevDrag, prevDrop ?? 0);
							return null;
						});
						return null;
					});
				} else {
					setDragId(null);
					setDropIndex(null);
				}
			};
			window.addEventListener("mousemove", onMouseMove);
			window.addEventListener("mouseup", onMouseUp);
		},
		[reorderSeries],
	);

	return (
		<section className="sb-section">
			<div className="sb-section-header">
				<button type="button" onClick={onToggle} className="sb-section-toggle">
					<h2 className="sb-section-title">Data Series</h2>
					{open ? (
						<ChevronDown size={16} color="var(--text-muted-color)" />
					) : (
						<ChevronRight size={16} color="var(--text-muted-color)" />
					)}
				</button>
			</div>

			{open && (
				<div className="sb-series-list">
					{series.length === 0 ? (
						<p
							style={{
								margin: 0,
								fontSize: "0.85rem",
								color: "var(--text-light)",
								textAlign: "center",
								fontStyle: "italic",
							}}
						>
							Add columns from data sources
						</p>
					) : (
						<div
							ref={seriesListRef}
							style={{ display: "flex", flexDirection: "column" }}
							className={dragId ? "sb-series-list--dragging" : undefined}
						>
							<div className="sb-series-header">
								<div
									title="Drag to reorder or click to toggle visibility"
									className="sb-series-header-cell"
									style={{ width: "24px" }}
								>
									<ArrowUpDown size={12} />
								</div>
								<div title="Y-Axis #" className="sb-series-header-cell">
									<Hash size={12} />
								</div>
								<div title="Side (L/R)" className="sb-series-header-cell">
									<MoveHorizontal size={12} />
								</div>
								<div title="Grid" className="sb-series-header-cell">
									<Rows3 size={12} />
								</div>
								<div title="Line Style" className="sb-series-header-cell">
									<Minus size={12} />
								</div>
								<div title="Point Style" className="sb-series-header-cell">
									<Circle size={10} />
								</div>
								<div title="Color" className="sb-series-header-cell">
									<Palette size={12} />
								</div>
								<div
									title="Data Column"
									className="sb-series-header-cell--text"
								>
									Column
								</div>
								<div />
							</div>
							<ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
								{(() => {
									const dragSeries = dragId
										? series.find((s) => s.id === dragId)
										: null;
									const withoutDrag = series.filter((s) => s.id !== dragId);
									const previewList: Array<{
										s: SeriesConfig;
										isGhost: boolean;
									}> = withoutDrag.map((s) => ({ s, isGhost: false }));
									if (dragSeries && dropIndex !== null) {
										const clampedDrop = Math.min(dropIndex, withoutDrag.length);
										previewList.splice(clampedDrop, 0, {
											s: dragSeries,
											isGhost: true,
										});
									}

									return previewList.map(({ s, isGhost }) => (
										<li
											key={isGhost ? `ghost-${s.id}` : s.id}
											{...(!isGhost ? { "data-series-id": s.id } : {})}
											onMouseEnter={() =>
												!isGhost && setHighlightedSeries(s.id)
											}
											onMouseLeave={() =>
												!isGhost && setHighlightedSeries(null)
											}
											className={`sb-series-row${
												!isGhost && dragId === s.id
													? " sb-series-row--dragging"
													: ""
											}${isGhost ? " sb-series-row--ghost" : ""}`}
										>
											<SeriesConfigUI
												series={s}
												datasets={datasets}
												onHandleMouseDown={
													!isGhost ? (e) => startDrag(s.id, e) : undefined
												}
											/>
										</li>
									));
								})()}
							</ul>
						</div>
					)}
				</div>
			)}
		</section>
	);
};

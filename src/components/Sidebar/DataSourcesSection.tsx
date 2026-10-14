import { ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";
import { lazy, Suspense, useMemo, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES } from "../../themes";
import { IMPORT_ACCEPT } from "../../utils/importFile";
import ErrorBoundary from "../ErrorBoundary";
import { DatasetItem } from "./DatasetItem";
import { LoadDemoDataButton } from "./LoadDemoDataButton";

// Pulls in the formula editor + function reference; only needed once the user
// actually adds a calculated column, so it stays out of the entry chunk.
const CalculatedColumnModal = lazy(() =>
	import("../Layout/CalculatedColumnModal").then((m) => ({
		default: m.CalculatedColumnModal,
	})),
);

interface DataSourcesSectionProps {
	open: boolean;
	onToggle: () => void;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	importFiles: (files: ArrayLike<File>) => void;
}

export const DataSourcesSection: React.FC<DataSourcesSectionProps> = ({
	open,
	onToggle,
	fileInputRef,
	importFiles,
}) => {
	const datasets = useGraphStore((s) => s.datasets);

	const [themeName] = useTheme();
	const t = THEMES[themeName];

	const [calculatingDatasetId, setCalculatingDatasetId] = useState<
		string | null
	>(null);
	const [editingColumn, setEditingColumn] = useState<{
		datasetId: string;
		name: string;
		formula: string;
	} | null>(null);

	const selectedDatasetForCalc = useMemo(() => {
		return datasets.find((d) => d.id === calculatingDatasetId);
	}, [datasets, calculatingDatasetId]);

	return (
		<ErrorBoundary level="component">
			<section className="sb-section">
				<div className="sb-section-header">
					<button type="button" onClick={onToggle} className="sb-section-toggle">
						<h2 className="sb-section-title">Data Sources</h2>
						{open ? (
							<ChevronDown size={16} color="var(--text-muted-color)" />
						) : (
							<ChevronRight size={16} color="var(--text-muted-color)" />
						)}
					</button>
					<LoadDemoDataButton />
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept={IMPORT_ACCEPT}
					multiple
					onChange={(e) => {
						if (e.target.files) importFiles(e.target.files);
						e.target.value = "";
					}}
					style={{ display: "none" }}
				/>

				{open && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "12px",
						}}
					>
						{datasets.length === 0 && (
							<div
								style={{
									padding: "12px 16px",
									color: t.textLight,
									fontSize: "0.85rem",
									lineHeight: "1.4",
									textAlign: "center",
									fontStyle: "italic",
								}}
							>
								Add datasources by importing or drag and drop on the graph surface
							</div>
						)}

						{datasets.map((ds) => (
							<DatasetItem
								key={ds.id}
								dataset={ds}
								setCalculatingDatasetId={setCalculatingDatasetId}
								setEditingColumn={setEditingColumn}
							/>
						))}
					</div>
				)}
			</section>

			<Suspense fallback={null}>
				{selectedDatasetForCalc && (
					<CalculatedColumnModal
						dataset={selectedDatasetForCalc}
						onClose={() => setCalculatingDatasetId(null)}
					/>
				)}
				{editingColumn &&
					(() => {
						const ds = datasets.find((d) => d.id === editingColumn.datasetId);
						return ds ? (
							<CalculatedColumnModal
								dataset={ds}
								initialName={editingColumn.name}
								initialFormula={editingColumn.formula}
								onClose={() => setEditingColumn(null)}
							/>
						) : null;
					})()}
			</Suspense>
		</ErrorBoundary>
	);
};

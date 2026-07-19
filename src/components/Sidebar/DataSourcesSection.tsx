import {
	ChevronDown,
	ChevronRight,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES } from "../../themes";
import ErrorBoundary from "../ErrorBoundary";
import { CalculatedColumnModal } from "../Layout/CalculatedColumnModal";
import { DatasetItem } from "./DatasetItem";

interface DataSourcesSectionProps {
	open: boolean;
	onToggle: () => void;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	importFile: (file: File) => void;
}

export const DataSourcesSection: React.FC<DataSourcesSectionProps> = ({
	open,
	onToggle,
	fileInputRef,
	importFile,
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
			<section style={{ marginBottom: "24px" }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<button
						type="button"
						onClick={onToggle}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "6px",
							cursor: "pointer",
							flex: 1,
							background: "none",
							border: "none",
							padding: 0,
						}}
					>
						<h2 className="sb-section-title">Data Sources</h2>
						{open ? (
							<ChevronDown size={16} color={t.textMuted} />
						) : (
							<ChevronRight size={16} color={t.textMuted} />
						)}
					</button>{" "}
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept=".csv,.json,.xlsx,.xls"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) importFile(f);
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
								Add datasources by importing or drag and drop on the graph
								surface
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
		</ErrorBoundary>
	);
};

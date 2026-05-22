import type React from "react";
import { useRef, useState } from "react";
import { useDataImport } from "../../hooks/useDataImport";
import { useTheme } from "../../hooks/useTheme";
import { downloadFile, exportToPNG, exportToSVG } from "../../services/export";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES } from "../../themes";
import { DataSeriesSection } from "../Sidebar/DataSeriesSection";
import { DataSourcesSection } from "../Sidebar/DataSourcesSection";
import { CollapsedMenuButton } from "./CollapsedMenuButton";
import { ImportSettingsDialog } from "./ImportSettingsDialog";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";

/**
 * Sidebar Component
 */
export const Sidebar: React.FC = () => {
	const datasets = useGraphStore((s) => s.datasets);
	const series = useGraphStore((s) => s.series);
	const xAxes = useGraphStore((s) => s.xAxes);
	const yAxes = useGraphStore((s) => s.yAxes);
	const axisTitles = useGraphStore((s) => s.axisTitles);
	const [themeName] = useTheme();
	const t = THEMES[themeName];

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleImport = () => {
		fileInputRef.current?.click();
	};

	const [isCollapsed, setIsCollapsed] = useState(false);
	const [openSections, setOpenSections] = useState({
		sources: true,
		series: true,
	});

	const toggleSection = (key: keyof typeof openSections) =>
		setOpenSections((s) => ({ ...s, [key]: !s[key] }));

	const { importFile, confirmImport, cancelImport, changeSheet, pendingFile } =
		useDataImport();

	const handleExportSVG = () => {
		const plotContainer = document.querySelector(".plot-area") as HTMLElement;
		if (!plotContainer) return;

		const svgContent = exportToSVG(
			datasets,
			series,
			xAxes,
			yAxes,
			axisTitles,
			plotContainer.clientWidth,
			plotContainer.clientHeight,
			t,
		);
		downloadFile(svgContent, "webgraphy-export.svg", "image/svg+xml");
	};

	const handleExportPNG = async () => {
		const plotContainer = document.querySelector(".plot-area") as HTMLElement;
		if (!plotContainer) return;

		const pngData = await exportToPNG(
			datasets,
			series,
			xAxes,
			yAxes,
			axisTitles,
			plotContainer.clientWidth,
			plotContainer.clientHeight,
			t,
		);
		downloadFile(pngData, "webgraphy-export.png", "image/png");
	};

	if (isCollapsed) {
		return (
			<CollapsedMenuButton
				onClick={() => setIsCollapsed(false)}
				onExportSVG={handleExportSVG}
				theme={t}
			/>
		);
	}

	return (
		<>
			<aside className="sidebar">
				{/* Header */}
				<SidebarHeader
					onCollapse={() => setIsCollapsed(true)}
					onImport={handleImport}
					onExportSVG={handleExportSVG}
					onExportPNG={handleExportPNG}
				/>

				{/* Content */}
				<div className="sb-body">
					<DataSourcesSection
						open={openSections.sources}
						onToggle={() => toggleSection("sources")}
						fileInputRef={fileInputRef}
						importFile={importFile}
					/>
					<DataSeriesSection
						open={openSections.series}
						onToggle={() => toggleSection("series")}
					/>
				</div>

				<SidebarFooter />
			</aside>

			{/* Modals */}
			{pendingFile && (
				<ImportSettingsDialog
					fileName={pendingFile.file.name}
					fileContent={pendingFile.preview}
					fileType={pendingFile.type}
					sheets={pendingFile.sheets}
					selectedSheet={pendingFile.selectedSheet}
					onSheetChange={changeSheet}
					onConfirm={confirmImport}
					onCancel={cancelImport}
				/>
			)}
		</>
	);
};

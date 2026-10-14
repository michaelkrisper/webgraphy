import type React from "react";
import { Suspense, useRef, useState } from "react";
import { useDataImport } from "../../hooks/useDataImport";
import { useTheme } from "../../hooks/useTheme";
import { useGraphStore } from "../../store/useGraphStore";
import { dismissNotification, notify } from "../../store/useNotificationStore";
import { THEMES } from "../../themes";
import { SESSION_EXTENSION } from "../../utils/importFile";
import { DataSeriesSection } from "../Sidebar/DataSeriesSection";
import { DataSourcesSection } from "../Sidebar/DataSourcesSection";
import { CollapsedMenuButton } from "./CollapsedMenuButton";
import { ImportSettingsDialogLazy } from "./importSettingsDialogLazy";
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
	const [themeName] = useTheme();
	const t = THEMES[themeName];

	const fileInputRef = useRef<HTMLInputElement>(null);
	const sessionInputRef = useRef<HTMLInputElement>(null);

	const handleImport = () => {
		fileInputRef.current?.click();
	};

	const handleSaveSession = async () => {
		const { saveSession } = await import("../../services/session");
		await saveSession();
	};

	const [isCollapsed, setIsCollapsed] = useState(false);
	const [openSections, setOpenSections] = useState({
		sources: true,
		series: true,
	});

	const toggleSection = (key: keyof typeof openSections) =>
		setOpenSections((s) => ({ ...s, [key]: !s[key] }));

	const {
		importFiles,
		confirmImport,
		cancelImport,
		changeSheet,
		pendingFile,
		isImporting,
	} = useDataImport();

	// `services/export` carries the whole standalone SVG renderer; loading it on
	// demand keeps it out of the entry chunk (see size-budget.json).
	const handleExportSVG = async () => {
		const plotContainer = document.querySelector(".plot-area") as HTMLElement;
		if (!plotContainer) return;

		const { downloadFile, exportToSVG } = await import("../../services/export");
		const svgContent = exportToSVG(
			datasets,
			series,
			xAxes,
			yAxes,
			plotContainer.clientWidth,
			plotContainer.clientHeight,
			t,
		);
		downloadFile(svgContent, "webgraphy-export.svg", "image/svg+xml");
	};

	const handleExportPNG = async () => {
		const plotContainer = document.querySelector(".plot-area") as HTMLElement;
		if (!plotContainer) return;

		const { downloadFile, exportToPNG } = await import("../../services/export");
		const pngData = await exportToPNG(
			datasets,
			series,
			xAxes,
			yAxes,
			plotContainer.clientWidth,
			plotContainer.clientHeight,
			t,
		);
		downloadFile(pngData, "webgraphy-export.png", "image/png");
	};

	const handleExportCSV = async () => {
		const { exportVisibleCsv } = await import("../../services/csvExport");
		await exportVisibleCsv(
			{ series, datasets, xAxes },
			{ notify, dismiss: dismissNotification },
		);
	};

	if (isCollapsed) {
		return (
			<CollapsedMenuButton
				onClick={() => setIsCollapsed(false)}
				onExportSVG={handleExportSVG}
				onExportPNG={handleExportPNG}
				onExportCSV={handleExportCSV}
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
					onExportCSV={handleExportCSV}
					onOpenSession={() => sessionInputRef.current?.click()}
					onSaveSession={handleSaveSession}
				/>
				{/* Sessions take the import queue, which routes them by extension. */}
				<input
					ref={sessionInputRef}
					type="file"
					accept={`.${SESSION_EXTENSION}`}
					aria-label="Open session file"
					onChange={(e) => {
						if (e.target.files) importFiles(e.target.files);
						e.target.value = "";
					}}
					style={{ display: "none" }}
				/>

				{/* Content */}
				<div className="sb-body">
					<DataSourcesSection
						open={openSections.sources}
						onToggle={() => toggleSection("sources")}
						fileInputRef={fileInputRef}
						importFiles={importFiles}
					/>
					<DataSeriesSection
						open={openSections.series}
						onToggle={() => toggleSection("series")}
					/>
				</div>

				<SidebarFooter />
			</aside>

			{/* Modals */}
			<Suspense fallback={null}>
				{pendingFile && (
					<ImportSettingsDialogLazy
						key={pendingFile.id}
						fileName={pendingFile.file.name}
						fileContent={pendingFile.preview}
						previewTruncated={pendingFile.previewTruncated}
						fileType={pendingFile.type}
						defaultDelimiter={pendingFile.defaultDelimiter}
						isImporting={isImporting}
						sheets={pendingFile.sheets}
						selectedSheet={pendingFile.selectedSheet}
						onSheetChange={changeSheet}
						onConfirm={confirmImport}
						onCancel={cancelImport}
					/>
				)}
			</Suspense>
		</>
	);
};

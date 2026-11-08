import type React from "react";
import { Suspense, useRef, useState } from "react";
import { useDataImport } from "../../hooks/useDataImport";
import { useFileShortcuts } from "../../hooks/useFileShortcuts";
import { useSidebarWidth } from "../../hooks/useSidebarWidth";
import { loadThemeFonts, useTheme } from "../../hooks/useTheme";
import type { ImageExportRequest } from "../../services/export";
import type {
	ExportTheme,
	ImageExportOptions,
} from "../../services/exportOptions";
import { useGraphStore } from "../../store/useGraphStore";
import { dismissNotification, notify } from "../../store/useNotificationStore";
import { THEMES } from "../../themes";
import { copyImageToClipboard } from "../../utils/copyImage";
import { SESSION_EXTENSION } from "../../utils/importFile";
import { DataSeriesSection } from "../Sidebar/DataSeriesSection";
import { DataSourcesSection } from "../Sidebar/DataSourcesSection";
import { CollapsedMenuButton } from "./CollapsedMenuButton";
import { ExportImageDialogLazy } from "./exportImageDialogLazy";
import { ImportSettingsDialogLazy } from "./importSettingsDialogLazy";
import { SidebarFooter } from "./SidebarFooter";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarResizer } from "./SidebarResizer";

/**
 * Sidebar Component
 */
export const Sidebar: React.FC = () => {
	const datasets = useGraphStore((s) => s.datasets);
	const series = useGraphStore((s) => s.series);
	const xAxes = useGraphStore((s) => s.xAxes);
	const yAxes = useGraphStore((s) => s.yAxes);
	const legendVisible = useGraphStore((s) => s.legendVisible);
	const [themeName] = useTheme();
	const t = THEMES[themeName];
	const sidebarWidth = useSidebarWidth();

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

	// Ctrl+O: the open picker, routed into the same import queue as the
	// header's open actions (sessions included).
	const handleOpenFile = async () => {
		try {
			const { chooseImportFiles } = await import("../../utils/fileAccess");
			const files = await chooseImportFiles();
			if (files?.length) void importFiles(files);
		} catch (err) {
			notify({
				kind: "error",
				message: `Could not open the file: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	};
	useFileShortcuts(handleSaveSession, handleOpenFile);

	const [imageDialogView, setImageDialogView] = useState<{
		width: number;
		height: number;
	} | null>(null);

	const plotViewSize = () => {
		const plot = document.querySelector<HTMLElement>(".plot-area");
		return plot ? { width: plot.clientWidth, height: plot.clientHeight } : null;
	};

	// `services/export` carries the whole standalone SVG renderer; loading it on
	// demand keeps it out of the entry chunk (see size-budget.json). Without a
	// theme choice the saved export preference applies (Light by default).
	const loadExporter = async (themeChoice?: ExportTheme) => {
		const [exporter, { exportThemeName, loadExportOptions }] = await Promise.all([
			import("../../services/export"),
			import("../../services/exportOptions"),
		]);
		const name = exportThemeName(
			themeChoice ?? loadExportOptions().theme,
			themeName,
		);
		// Measuring and embedding need the export theme's faces, which are not
		// loaded yet when it is not the one on screen.
		return {
			exporter,
			theme: THEMES[name],
			loadFonts: () => loadThemeFonts(name),
		};
	};
	const plot = { datasets, series, xAxes, yAxes };

	const runImageExport = async (
		request: ImageExportRequest,
		themeChoice?: ExportTheme,
	) => {
		try {
			const { exporter, theme, loadFonts } = await loadExporter(themeChoice);
			await exporter.exportImage(plot, request, theme, loadFonts);
		} catch (e) {
			const tooLarge = e instanceof Error && e.name === "CanvasSizeError";
			notify({
				kind: "error",
				message: tooLarge
					? e.message
					: `Image export failed: ${e instanceof Error ? e.message : String(e)}`,
			});
		}
	};

	// One-click exports: the plot at its on-screen size, legend included when
	// shown.
	const quickRequest = (format: "svg" | "png"): ImageExportRequest | null => {
		const view = plotViewSize();
		return (
			view && {
				format,
				...view,
				pixelRatio: window.devicePixelRatio || 1,
				legend: legendVisible ? "auto" : null,
			}
		);
	};
	const quickExport = (format: "svg" | "png") => {
		const request = quickRequest(format);
		return request ? runImageExport(request) : undefined;
	};
	const handleExportSVG = () => quickExport("svg");
	const handleExportPNG = () => quickExport("png");

	// Synchronous up to the clipboard write, which must happen inside the click;
	// the loading and drawing ride along as the item's pending promise.
	const handleCopyImage = () => {
		const request = quickRequest("png");
		if (!request) return;
		void copyImageToClipboard(async () => {
			const { exporter, theme, loadFonts } = await loadExporter();
			await loadFonts();
			return exporter.renderImage(plot, request, theme);
		});
	};

	const handleOpenImageDialog = () =>
		setImageDialogView(plotViewSize() ?? { width: 1200, height: 800 });

	const handleDialogExport = async (options: ImageExportOptions) => {
		if (!imageDialogView) return;
		const { buildExportRequest } = await import("../../services/exportOptions");
		await runImageExport(
			buildExportRequest(options, imageDialogView),
			options.theme,
		);
	};

	const imageDialog = imageDialogView && (
		<Suspense fallback={null}>
			<ExportImageDialogLazy
				viewSize={imageDialogView}
				onExport={handleDialogExport}
				onClose={() => setImageDialogView(null)}
			/>
		</Suspense>
	);

	const handleExportCSV = async () => {
		const { exportVisibleCsv } = await import("../../services/csvExport");
		await exportVisibleCsv(
			{ series, datasets, xAxes },
			{ notify, dismiss: dismissNotification },
		);
	};

	if (isCollapsed) {
		return (
			<>
				<CollapsedMenuButton
					onClick={() => setIsCollapsed(false)}
					onExportImage={handleOpenImageDialog}
					onExportSVG={handleExportSVG}
					onExportPNG={handleExportPNG}
					onCopyImage={handleCopyImage}
					onExportCSV={handleExportCSV}
					theme={t}
				/>
				{imageDialog}
			</>
		);
	}

	return (
		<>
			<aside className="sidebar" style={{ width: sidebarWidth.width }}>
				<SidebarResizer
					width={sidebarWidth.width}
					maxWidth={sidebarWidth.maxWidth}
					onResize={sidebarWidth.setWidth}
					onCommit={sidebarWidth.commit}
				/>
				{/* Header */}
				<SidebarHeader
					onCollapse={() => setIsCollapsed(true)}
					onImport={handleImport}
					onExportImage={handleOpenImageDialog}
					onExportSVG={handleExportSVG}
					onExportPNG={handleExportPNG}
					onCopyImage={handleCopyImage}
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
			{imageDialog}
		</>
	);
};

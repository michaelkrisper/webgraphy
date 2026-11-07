import { Suspense, useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ImportSettingsDialogLazy } from "./components/Layout/importSettingsDialogLazy";
import { SessionPromptHost } from "./components/Layout/SessionPromptHost";
import { Sidebar } from "./components/Layout/Sidebar";
import { ShortcutsHelpHost } from "./components/Layout/ShortcutsHelpHost";
import { Toaster } from "./components/Layout/Toaster";
import ChartContainer from "./components/Plot/ChartContainer";
import { PlotDragOverlay } from "./components/Plot/PlotOverlays";
import { useDataImport } from "./hooks/useDataImport";
import { useUndoRedoShortcuts } from "./hooks/useUndoRedoShortcuts";
import { useWindowFileDrop } from "./hooks/useWindowFileDrop";
import { useGraphStore } from "./store/useGraphStore";
import "./index.css";

export default function App() {
	const loadPersistedState = useGraphStore((s) => s.loadPersistedState);
	useUndoRedoShortcuts();
	const {
		importFiles,
		confirmImport,
		cancelImport,
		changeSheet,
		pendingFile,
		isImporting,
	} = useDataImport();
	const draggingFile = useWindowFileDrop(importFiles);

	useEffect(() => {
		loadPersistedState();
	}, [loadPersistedState]);

	return (
		<ErrorBoundary level="top">
			<div className="app-container">
				<ChartContainer />
				<Sidebar />
			</div>
			{draggingFile && (
				<div
					style={{ position: "fixed", inset: 0, zIndex: 9000, pointerEvents: "none" }}
				>
					<PlotDragOverlay visible />
				</div>
			)}
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
			<SessionPromptHost />
			<Toaster />
			<ShortcutsHelpHost />
		</ErrorBoundary>
	);
}

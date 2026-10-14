import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { Sidebar } from "./components/Layout/Sidebar";
import { ShortcutsHelpHost } from "./components/Layout/ShortcutsHelpHost";
import { Toaster } from "./components/Layout/Toaster";
import ChartContainer from "./components/Plot/ChartContainer";
import { useGraphStore } from "./store/useGraphStore";
import "./index.css";

export default function App() {
	const loadPersistedState = useGraphStore((s) => s.loadPersistedState);

	useEffect(() => {
		loadPersistedState();
	}, [loadPersistedState]);

	return (
		<ErrorBoundary level="top">
			<div className="app-container">
				<ChartContainer />
				<Sidebar />
			</div>
			<Toaster />
			<ShortcutsHelpHost />
		</ErrorBoundary>
	);
}

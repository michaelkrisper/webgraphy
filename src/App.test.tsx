import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import App from "./App";
import { useGraphStore } from "./store/useGraphStore";

// Mock child components to avoid testing their implementation details and simplify the tree
vi.mock("./components/ErrorBoundary", () => ({
	default: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="error-boundary">{children}</div>
	),
}));

vi.mock("./components/Plot/ChartContainer", () => ({
	default: () => <div data-testid="chart-container">Chart Container</div>,
}));

vi.mock("./components/Layout/Sidebar", () => ({
	Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

const mockImportFiles = vi.fn();
vi.mock("./hooks/useDataImport", () => ({
	useDataImport: () => ({
		importFiles: mockImportFiles,
		confirmImport: vi.fn(),
		cancelImport: vi.fn(),
		changeSheet: vi.fn(),
		pendingFile: null,
		isImporting: false,
	}),
}));

// Mock the graph store
vi.mock("./store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
}));

describe("App Component", () => {
	const mockLoadPersistedState = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		// Set up default store mock
		(useGraphStore as unknown as Mock).mockImplementation((selector) => {
			return selector({ loadPersistedState: mockLoadPersistedState });
		});
	});

	it("renders layout correctly with ChartContainer and Sidebar", () => {
		render(<App />);

		expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
		expect(screen.getByTestId("chart-container")).toBeInTheDocument();
		expect(screen.getByTestId("sidebar")).toBeInTheDocument();
	});

	it("mounts the toast region once", () => {
		render(<App />);

		expect(screen.getAllByRole("region", { name: "Notifications" })).toHaveLength(
			1,
		);
	});

	it("calls loadPersistedState on mount", () => {
		render(<App />);

		expect(mockLoadPersistedState).toHaveBeenCalledTimes(1);
	});

	it("imports files dropped anywhere in the window, with a highlight while dragging", () => {
		render(<App />);
		const files = [new File(["a"], "a.csv")];
		const fileDrag = (type: string) => {
			const ev = new Event(type, { bubbles: true, cancelable: true });
			Object.defineProperty(ev, "dataTransfer", {
				value: { types: ["Files"], files, dropEffect: "none" },
			});
			act(() => {
				screen.getByTestId("sidebar").dispatchEvent(ev);
			});
		};

		fileDrag("dragenter");
		expect(screen.getByText("Drop to import")).toBeInTheDocument();
		fileDrag("drop");
		expect(screen.queryByText("Drop to import")).not.toBeInTheDocument();
		expect(mockImportFiles).toHaveBeenCalledWith(files);
	});
});

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
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

	it("calls loadPersistedState on mount", () => {
		render(<App />);

		expect(mockLoadPersistedState).toHaveBeenCalledTimes(1);
	});
});

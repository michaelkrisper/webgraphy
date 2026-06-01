import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../ErrorBoundary";

// Normal component
const NormalComponent = () => <div>Normal Content</div>;

// Component that throws on render to drive the boundary's catch path.
const Boom = () => {
	throw new Error("Kaboom");
};

describe("ErrorBoundary", () => {
	beforeEach(() => {
		// React logs the caught error to the console; silence it for clean output.
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders children when no error occurs", () => {
		render(
			<ErrorBoundary>
				<NormalComponent />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Normal Content")).toBeTruthy();
	});

	it("renders the top-level fallback and reloads on reset", () => {
		const reload = vi.fn();
		vi.stubGlobal("location", { reload });

		render(
			<ErrorBoundary level="top">
				<Boom />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Application Error")).toBeTruthy();
		expect(screen.getByText("Kaboom")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Reset App" }));
		expect(reload).toHaveBeenCalled();
	});

	it("renders the component-level fallback and recovers on retry", () => {
		const { rerender } = render(
			<ErrorBoundary level="component">
				<Boom />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Rendering failed")).toBeTruthy();

		// Swap in healthy children first (the boundary still shows the fallback
		// because hasError is sticky), then Retry clears the error and re-renders.
		rerender(
			<ErrorBoundary level="component">
				<NormalComponent />
			</ErrorBoundary>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(screen.getByText("Normal Content")).toBeTruthy();
	});
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../ErrorBoundary";

const resetAll = vi.hoisted(() => vi.fn());
vi.mock("../../services/persistence", () => ({
	persistence: { resetAll },
}));

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
		vi.unstubAllGlobals();
		resetAll.mockReset();
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

		fireEvent.click(screen.getByRole("button", { name: "Reload" }));
		expect(reload).toHaveBeenCalled();
		expect(resetAll).not.toHaveBeenCalled();
	});

	describe("Reset workspace", () => {
		function crashTop() {
			const reload = vi.fn();
			vi.stubGlobal("location", { reload });
			render(
				<ErrorBoundary level="top">
					<Boom />
				</ErrorBoundary>,
			);
			fireEvent.click(screen.getByRole("button", { name: "Reset workspace…" }));
			return reload;
		}

		it("warns and asks before deleting anything", () => {
			crashTop();
			const dialog = screen.getByRole("alertdialog", { name: "Reset workspace?" });
			expect(dialog.textContent).toContain(
				"deletes all datasets, series and settings",
			);
			expect(dialog.textContent).toContain("cannot be undone");
			expect(dialog.textContent).toContain("save a session first");
			// The safe answer has focus; nothing is deleted yet.
			expect(document.activeElement).toBe(
				screen.getByRole("button", { name: "Cancel" }),
			);
			expect(resetAll).not.toHaveBeenCalled();
		});

		it("goes back without deleting on Cancel", () => {
			crashTop();
			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
			expect(screen.queryByRole("alertdialog")).toBeNull();
			expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
			expect(resetAll).not.toHaveBeenCalled();
		});

		it("deletes the browser data and reloads once confirmed", async () => {
			resetAll.mockResolvedValue(undefined);
			const reload = crashTop();
			fireEvent.click(
				screen.getByRole("button", { name: "Delete all data and reload" }),
			);
			expect(resetAll).toHaveBeenCalledTimes(1);
			await waitFor(() => expect(reload).toHaveBeenCalled());
		});

		it("asks to close other tabs while they block the deletion", async () => {
			let finish = () => {};
			resetAll.mockImplementation(
				(onBlocked: () => void) =>
					new Promise<void>((resolve) => {
						onBlocked();
						finish = resolve;
					}),
			);
			const reload = crashTop();
			fireEvent.click(
				screen.getByRole("button", { name: "Delete all data and reload" }),
			);
			expect((await screen.findByRole("status")).textContent).toContain(
				"close them to finish the reset",
			);
			expect(
				screen.getByRole("button", { name: "Delete all data and reload" }),
			).toHaveProperty("disabled", true);
			finish();
			await waitFor(() => expect(reload).toHaveBeenCalled());
		});

		it("says so when the data could not be deleted, without reloading", async () => {
			resetAll.mockRejectedValue(new Error("nope"));
			const reload = crashTop();
			fireEvent.click(
				screen.getByRole("button", { name: "Delete all data and reload" }),
			);
			expect((await screen.findByRole("alert")).textContent).toContain(
				"could not be deleted",
			);
			expect(reload).not.toHaveBeenCalled();
		});
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

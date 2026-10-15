import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import {
	dismissNotification,
	notify,
	useNotificationStore,
} from "../../../store/useNotificationStore";
import { Toaster } from "../Toaster";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

describe("Toaster", () => {
	afterEach(() => {
		act(() => {
			for (const n of useNotificationStore.getState().notifications) {
				dismissNotification(n.id);
			}
		});
	});

	it("renders info/success as polite status and errors as alerts", () => {
		render(<Toaster />);
		act(() => {
			notify({ kind: "info", message: "Imported 3 columns" });
			notify({ kind: "error", message: "Storage is full" });
		});
		const status = screen.getByRole("status");
		expect(status).toHaveTextContent("Imported 3 columns");
		expect(status).toHaveAttribute("aria-live", "polite");
		expect(screen.getByRole("alert")).toHaveTextContent("Storage is full");
	});

	it("runs the action callback and dismisses", () => {
		const onAction = vi.fn();
		render(<Toaster />);
		act(() => {
			notify({
				kind: "info",
				message: "Series deleted",
				action: { label: "Undo", onAction },
			});
		});
		fireEvent.click(screen.getByRole("button", { name: "Undo" }));
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(screen.queryByText("Series deleted")).not.toBeInTheDocument();
	});

	it("dismisses via the close button and via Escape", () => {
		render(<Toaster />);
		act(() => {
			notify({ kind: "error", message: "first" });
			notify({ kind: "error", message: "second" });
		});
		fireEvent.click(
			screen.getAllByRole("button", { name: "Dismiss notification" })[0],
		);
		expect(screen.queryByText("first")).not.toBeInTheDocument();

		const close = screen.getByRole("button", { name: "Dismiss notification" });
		close.focus();
		fireEvent.keyDown(close, { key: "Escape" });
		expect(screen.queryByText("second")).not.toBeInTheDocument();
	});

	it(
		"has no axe violations",
		async () => {
			const { container } = render(<Toaster />);
			act(() => {
				notify({ kind: "success", message: "Copied" });
				notify({
					kind: "error",
					message: "Save failed",
					action: { label: "Retry", onAction: () => {} },
				});
			});
			expect(await axe(container)).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);
});

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { SidebarFooter } from "../SidebarFooter";
import { useShortcutsHelp } from "../shortcutsHelp";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

vi.mock("../HelpModal", () => ({
	HelpModal: ({ onClose }: { onClose: () => void }) => (
		<div data-testid="help-modal">
			Help Modal{" "}
			<button type="button" onClick={onClose} data-testid="close-help">
				Close
			</button>
		</div>
	),
}));

vi.mock("../ImprintModal", () => ({
	ImprintModal: ({ onClose }: { onClose: () => void }) => (
		<div data-testid="imprint-modal">
			Imprint Modal{" "}
			<button type="button" onClick={onClose} data-testid="close-imprint">
				Close
			</button>
		</div>
	),
}));

vi.mock("../LicenseModal", () => ({
	LicenseModal: ({ onClose }: { onClose: () => void }) => (
		<div data-testid="license-modal">
			License Modal{" "}
			<button type="button" onClick={onClose} data-testid="close-license">
				Close
			</button>
		</div>
	),
}));

vi.mock("../StorageReadout", () => ({
	StorageReadout: () => <div data-testid="storage-readout" />,
}));

describe("SidebarFooter", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	const openMore = () =>
		fireEvent.click(screen.getByRole("button", { name: "More" }));

	it("renders version, author, Help and the overflow button", () => {
		render(<SidebarFooter />);

		expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
		expect(screen.getByText("© Michael Krisper")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
		// Secondary links stay out of the row until the overflow is opened.
		expect(screen.queryByRole("button", { name: "License" })).toBeNull();
		const more = screen.getByRole("button", { name: "More" });
		expect(more).toHaveAttribute("aria-expanded", "false");
		openMore();
		expect(more).toHaveAttribute("aria-expanded", "true");
		for (const name of [
			"Keyboard shortcuts (?)",
			"Storage usage",
			"License",
			"Imprint",
		]) {
			expect(screen.getByRole("button", { name })).toBeInTheDocument();
		}
	});

	it("opens and closes the Help modal", async () => {
		render(<SidebarFooter />);

		expect(screen.queryByTestId("help-modal")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Help" }));
		expect(await screen.findByTestId("help-modal")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("close-help"));
		expect(screen.queryByTestId("help-modal")).not.toBeInTheDocument();
	});

	it("opens the keyboard shortcuts dialog", () => {
		render(<SidebarFooter />);
		openMore();
		fireEvent.click(
			screen.getByRole("button", { name: "Keyboard shortcuts (?)" }),
		);
		expect(useShortcutsHelp.getState().open).toBe(true);
		useShortcutsHelp.getState().setOpen(false);
	});

	it("opens and closes the License modal", async () => {
		render(<SidebarFooter />);

		expect(screen.queryByTestId("license-modal")).not.toBeInTheDocument();

		openMore();
		fireEvent.click(screen.getByRole("button", { name: "License" }));
		expect(await screen.findByTestId("license-modal")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("close-license"));
		expect(screen.queryByTestId("license-modal")).not.toBeInTheDocument();
	});

	it("opens and closes the Imprint modal", async () => {
		render(<SidebarFooter />);

		expect(screen.queryByTestId("imprint-modal")).not.toBeInTheDocument();

		openMore();
		fireEvent.click(screen.getByRole("button", { name: "Imprint" }));
		expect(await screen.findByTestId("imprint-modal")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("close-imprint"));
		expect(screen.queryByTestId("imprint-modal")).not.toBeInTheDocument();
	});

	it("toggles the lazily loaded storage readout", async () => {
		render(<SidebarFooter />);

		openMore();
		fireEvent.click(screen.getByRole("button", { name: "Storage usage" }));
		expect(await screen.findByTestId("storage-readout")).toBeInTheDocument();

		openMore();
		fireEvent.click(screen.getByRole("button", { name: "Hide storage usage" }));
		expect(screen.queryByTestId("storage-readout")).not.toBeInTheDocument();
	});

	it(
		"has no axe violations",
		async () => {
			const { container } = render(<SidebarFooter />);
			expect(await axe(container)).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);
});

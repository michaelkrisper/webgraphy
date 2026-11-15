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

		// The release number only; the full git-describe string is the tooltip.
		const version = screen.getByTitle(`v${__APP_VERSION__}`);
		expect(version.textContent).toMatch(/^v\d+\.\d+\.\d+$/);
		expect(__APP_VERSION__.startsWith(version.textContent?.slice(1) ?? "-")).toBe(
			true,
		);
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
			"Source code",
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

	it("links the central legal pages in a new tab", () => {
		render(<SidebarFooter />);

		const links = {
			Imprint: "https://krisperapps.de/impressum",
			Privacy: "https://krisperapps.de/datenschutz#webgraphy",
			Terms: "https://krisperapps.de/nutzung",
		};
		for (const [name, href] of Object.entries(links)) {
			const link = screen.getByRole("link", { name });
			expect(link).toHaveAttribute("href", href);
			expect(link).toHaveAttribute("target", "_blank");
			expect(link).toHaveAttribute("rel", "noopener");
		}
	});

	it("opens the source code repository in a new tab", () => {
		const open = vi.fn();
		vi.stubGlobal("open", open);
		render(<SidebarFooter />);

		openMore();
		fireEvent.click(screen.getByRole("button", { name: "Source code" }));
		expect(open).toHaveBeenCalledWith(
			"https://github.com/michaelkrisper/webgraphy",
			"_blank",
			"noopener",
		);
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

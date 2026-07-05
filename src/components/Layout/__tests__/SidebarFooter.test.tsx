import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarFooter } from "../SidebarFooter";

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

describe("SidebarFooter", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders version, author, and buttons", () => {
		render(<SidebarFooter />);

		expect(screen.getByText(`v${__APP_VERSION__}`)).toBeInTheDocument();
		expect(screen.getByText("© Michael Krisper")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "License" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Imprint" })).toBeInTheDocument();
	});

	it("opens and closes the Help modal", () => {
		render(<SidebarFooter />);

		expect(screen.queryByTestId("help-modal")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Help" }));
		expect(screen.getByTestId("help-modal")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("close-help"));
		expect(screen.queryByTestId("help-modal")).not.toBeInTheDocument();
	});

	it("opens and closes the License modal", () => {
		render(<SidebarFooter />);

		expect(screen.queryByTestId("license-modal")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "License" }));
		expect(screen.getByTestId("license-modal")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("close-license"));
		expect(screen.queryByTestId("license-modal")).not.toBeInTheDocument();
	});

	it("opens and closes the Imprint modal", () => {
		render(<SidebarFooter />);

		expect(screen.queryByTestId("imprint-modal")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Imprint" }));
		expect(screen.getByTestId("imprint-modal")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("close-imprint"));
		expect(screen.queryByTestId("imprint-modal")).not.toBeInTheDocument();
	});
});

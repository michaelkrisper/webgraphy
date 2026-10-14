import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import {
	DEFAULT_EXPORT_OPTIONS,
	loadExportOptions,
	saveExportOptions,
} from "../../../services/exportOptions";
import { ExportImageDialog } from "../ExportImageDialog";

const view = { width: 900, height: 600 };

const renderDialog = () => {
	const onExport = vi.fn();
	const onClose = vi.fn();
	const utils = render(
		<ExportImageDialog viewSize={view} onExport={onExport} onClose={onClose} />,
	);
	return { ...utils, onExport, onClose };
};

afterEach(() => localStorage.removeItem("webgraphy-export-options"));

describe("ExportImageDialog", () => {
	it("follows the dialog conventions: title, close, actions, first-field focus", () => {
		renderDialog();
		expect(
			screen.getByRole("dialog", { name: "Export Image" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Close dialog" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "PNG (pixel)" })).toHaveFocus();
	});

	it("shows the current view size and the PNG output size", () => {
		renderDialog();
		expect(
			screen.getByRole("option", { name: "Current view (900 × 600 px)" }),
		).toBeInTheDocument();
		// Defaults: PNG, current view, 2×.
		expect(screen.getByText("1800 × 1200 px")).toBeInTheDocument();
	});

	it("offers dpi for millimetre sizes and the scale for pixel sizes", () => {
		renderDialog();
		expect(screen.getByLabelText("Scale")).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("Size"), {
			target: { value: "journal-single" },
		});
		expect(screen.queryByLabelText("Scale")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Resolution")).toHaveValue(300);
		expect(screen.getByText("1004 × 756 px at 300 dpi")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("radio", { name: "SVG (vector)" }));
		expect(screen.queryByLabelText("Resolution")).not.toBeInTheDocument();
		expect(screen.getByText("85 × 64 mm, vector")).toBeInTheDocument();
	});

	it("exports, remembers the options and closes", () => {
		const { onExport, onClose } = renderDialog();
		fireEvent.change(screen.getByLabelText("Size"), {
			target: { value: "custom" },
		});
		fireEvent.change(screen.getByLabelText("Width"), {
			target: { value: "1000" },
		});
		fireEvent.change(screen.getByLabelText("Height"), {
			target: { value: "500" },
		});
		fireEvent.change(screen.getByLabelText("Legend position"), {
			target: { value: "outside-right" },
		});
		fireEvent.change(screen.getByLabelText("Title"), {
			target: { value: "Run 7" },
		});
		fireEvent.click(screen.getByLabelText("Transparent background"));
		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		const expected = {
			...DEFAULT_EXPORT_OPTIONS,
			preset: "custom",
			customWidth: 1000,
			customHeight: 500,
			legendPosition: "outside-right",
			title: "Run 7",
			transparent: true,
		};
		expect(onExport).toHaveBeenCalledWith(expected);
		expect(onClose).toHaveBeenCalled();
		expect(loadExportOptions()).toEqual(expected);
	});

	it("starts from the last used options", () => {
		saveExportOptions({
			...DEFAULT_EXPORT_OPTIONS,
			format: "svg",
			legend: false,
			title: "Again",
		});
		renderDialog();
		expect(screen.getByRole("radio", { name: "SVG (vector)" })).toBeChecked();
		expect(screen.getByLabelText("Include legend")).not.toBeChecked();
		expect(screen.getByLabelText("Legend position")).toBeDisabled();
		expect(screen.getByLabelText("Title")).toHaveValue("Again");
	});

	it("blocks an image beyond the canvas limit with a clear message", () => {
		const { onExport } = renderDialog();
		fireEvent.change(screen.getByLabelText("Size"), {
			target: { value: "custom" },
		});
		fireEvent.change(screen.getByLabelText("Width"), {
			target: { value: "9000" },
		});
		fireEvent.change(screen.getByLabelText("Scale"), { target: { value: "3" } });
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Image too large: 27000 × 2400 px exceeds the browser limit of 16384 px per side.",
		);
		const exportButton = screen.getByRole("button", { name: "Export" });
		expect(exportButton).toBeDisabled();
		fireEvent.submit(
			exportButton
				.closest(".modal-card")
				?.querySelector("form") as HTMLFormElement,
		);
		expect(onExport).not.toHaveBeenCalled();
	});

	it("cancels without exporting or saving", () => {
		const { onExport, onClose } = renderDialog();
		fireEvent.change(screen.getByLabelText("Title"), { target: { value: "x" } });
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onClose).toHaveBeenCalled();
		expect(onExport).not.toHaveBeenCalled();
		expect(loadExportOptions().title).toBe("");
	});

	it("has no axe violations", async () => {
		const { container } = renderDialog();
		fireEvent.change(screen.getByLabelText("Size"), {
			target: { value: "custom" },
		});
		expect(await axe(container)).toHaveNoViolations();
	});
});

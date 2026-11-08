import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportMenu } from "../ExportMenu";

const handlers = () => ({
	onExportImage: vi.fn(),
	onExportSVG: vi.fn(),
	onExportPNG: vi.fn(),
	onCopyImage: vi.fn(),
	onExportCSV: vi.fn(),
	onOpenSession: vi.fn(),
	onSaveSession: vi.fn(),
});

const openMenu = (name: string) => {
	fireEvent.click(screen.getByRole("button", { name }));
	return screen.getByRole("dialog", { name });
};

describe("ExportMenu", () => {
	it("offers copying right after the PNG export and routes it", () => {
		const h = handlers();
		render(<ExportMenu {...h} className="btn" iconSize={16} />);
		const menu = openMenu("Session & Export");
		const labels = within(menu)
			.getAllByRole("button")
			.map((b) => b.querySelector(".popup-picker-label")?.textContent);
		expect(labels.indexOf("Copy chart as image")).toBe(
			labels.indexOf("Export as PNG (pixel)") + 1,
		);

		const copy = within(menu).getByRole("button", {
			name: "Copy chart as image",
		});
		expect(copy).toHaveAccessibleDescription(/clipboard as a PNG/);
		fireEvent.click(copy);
		expect(h.onCopyImage).toHaveBeenCalledTimes(1);
		expect(h.onExportPNG).not.toHaveBeenCalled();
	});

	it("shows the session shortcuts without changing the item names", () => {
		const h = handlers();
		render(<ExportMenu {...h} className="btn" iconSize={16} />);
		const menu = openMenu("Session & Export");
		const save = within(menu).getByRole("button", { name: "Save session…" });
		expect(save).toHaveTextContent("Ctrl+S");
		expect(save).toHaveAccessibleDescription(/\(Ctrl\+S\)/);
		const open = within(menu).getByRole("button", { name: "Open session…" });
		expect(open).toHaveTextContent("Ctrl+O");
		expect(open).toHaveAccessibleDescription(/Ctrl\+O also opens data files/);

		fireEvent.click(save);
		expect(h.onSaveSession).toHaveBeenCalledTimes(1);
	});

	it("leaves the copy entry out without a handler", () => {
		const h = { ...handlers(), onCopyImage: undefined };
		render(<ExportMenu {...h} className="btn" iconSize={16} />);
		const menu = openMenu("Session & Export");
		expect(
			within(menu).queryByRole("button", { name: "Copy chart as image" }),
		).not.toBeInTheDocument();
	});
});

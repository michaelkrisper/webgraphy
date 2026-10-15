import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { THEMES } from "../../../themes";
import { CollapsedMenuButton } from "../CollapsedMenuButton";

describe("CollapsedMenuButton", () => {
	const mockTheme = THEMES.dark;

	it("renders correctly with aria-label and logo image", () => {
		render(
			<CollapsedMenuButton
				onClick={() => {}}
				onExportSVG={() => {}}
				onExportPNG={() => {}}
				theme={mockTheme}
			/>,
		);

		const button = screen.getByRole("button", { name: /open menu/i });
		expect(button).toBeTruthy();
		expect(button.getAttribute("aria-label")).toBe("Open Menu");
		expect(button.getAttribute("title")).toBe("Open Menu");

		const img = screen.getByAltText("webgraphy logo");
		expect(img).toBeTruthy();
		expect(img.getAttribute("src")).toBe("./favicon.svg");
	});

	it("calls onClick handler when clicked", () => {
		const handleClick = vi.fn();
		render(
			<CollapsedMenuButton
				onClick={handleClick}
				onExportSVG={() => {}}
				onExportPNG={() => {}}
				theme={mockTheme}
			/>,
		);

		const button = screen.getByRole("button", { name: /open menu/i });
		fireEvent.click(button);

		expect(handleClick).toHaveBeenCalledTimes(1);
	});

	it("offers SVG, PNG and CSV export, like the expanded menu", () => {
		const onExportSVG = vi.fn();
		const onExportPNG = vi.fn();
		const onExportCSV = vi.fn();
		render(
			<CollapsedMenuButton
				onClick={() => {}}
				onExportSVG={onExportSVG}
				onExportPNG={onExportPNG}
				onExportCSV={onExportCSV}
				theme={mockTheme}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Export Image or Data" });
		fireEvent.click(trigger);
		fireEvent.click(
			screen.getByRole("button", { name: "Export as SVG (vector)" }),
		);
		expect(onExportSVG).toHaveBeenCalledTimes(1);
		fireEvent.click(trigger);
		fireEvent.click(
			screen.getByRole("button", { name: "Export as PNG (pixel)" }),
		);
		expect(onExportPNG).toHaveBeenCalledTimes(1);
		expect(onExportSVG).toHaveBeenCalledTimes(1);
		fireEvent.click(trigger);
		fireEvent.click(
			screen.getByRole("button", { name: "Export visible data as CSV" }),
		);
		expect(onExportCSV).toHaveBeenCalledTimes(1);
	});

	it("opens the export options dialog from “Export image…”", () => {
		const onExportImage = vi.fn();
		const onExportSVG = vi.fn();
		render(
			<CollapsedMenuButton
				onClick={() => {}}
				onExportImage={onExportImage}
				onExportSVG={onExportSVG}
				onExportPNG={() => {}}
				onExportCSV={() => {}}
				theme={mockTheme}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Export Image or Data" }));
		fireEvent.click(screen.getByRole("button", { name: "Export image…" }));
		expect(onExportImage).toHaveBeenCalledTimes(1);
		expect(onExportSVG).not.toHaveBeenCalled();
	});

	it("has correct positioning and styling", () => {
		render(
			<CollapsedMenuButton
				onClick={() => {}}
				onExportSVG={() => {}}
				onExportPNG={() => {}}
				theme={mockTheme}
			/>,
		);
		const button = screen.getByRole("button", { name: /open menu/i });

		expect(button.className).toContain("collapsed-menu-btn");
	});
});

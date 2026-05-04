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
				theme={mockTheme}
			/>,
		);

		const button = screen.getByRole("button", { name: /open menu/i });
		fireEvent.click(button);

		expect(handleClick).toHaveBeenCalledTimes(1);
	});

	it("has correct positioning and styling", () => {
		render(
			<CollapsedMenuButton
				onClick={() => {}}
				onExportSVG={() => {}}
				theme={mockTheme}
			/>,
		);
		const button = screen.getByRole("button", { name: /open menu/i });

		expect(button.className).toContain("collapsed-menu-btn");
	});
});

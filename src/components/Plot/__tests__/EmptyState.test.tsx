import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { IMPORT_ACCEPT } from "../../../utils/importFile";
import { EmptyState } from "../EmptyState";

const layout = {
	width: 600,
	height: 400,
	padding: { top: 10, right: 10, bottom: 40, left: 50 },
};

describe("EmptyState", () => {
	it("offers import, demo data and the drop hint", () => {
		render(
			<EmptyState {...layout} onImportFiles={vi.fn()} onLoadDemo={vi.fn()} />,
		);
		expect(
			screen.getByRole("button", { name: "Import file…" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Load demo data" }),
		).toBeInTheDocument();
		expect(screen.getByText("or drop a file anywhere")).toBeInTheDocument();
	});

	it("opens a file picker with the sidebar's file types and imports the pick", () => {
		const onImportFiles = vi.fn();
		const { container } = render(
			<EmptyState {...layout} onImportFiles={onImportFiles} />,
		);
		const input = container.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		expect(input).toHaveAttribute("accept", IMPORT_ACCEPT);
		const click = vi.spyOn(input, "click");
		fireEvent.click(screen.getByRole("button", { name: "Import file…" }));
		expect(click).toHaveBeenCalled();

		const file = new File(["a,b\n1,2"], "data.csv", { type: "text/csv" });
		fireEvent.change(input, { target: { files: [file] } });
		expect(onImportFiles).toHaveBeenCalledWith([file]);
		expect(input).toHaveAttribute("multiple");
	});

	it("loads the demo data", () => {
		const onLoadDemo = vi.fn();
		render(<EmptyState {...layout} onLoadDemo={onLoadDemo} />);
		fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));
		expect(onLoadDemo).toHaveBeenCalledTimes(1);
	});

	it("shows no actions when no handlers are given", () => {
		render(<EmptyState {...layout} />);
		expect(screen.queryByRole("button")).toBeNull();
	});
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { THEMES } from "../../../themes";
import { ImportSettingsDialog } from "../ImportSettingsDialog";

const theme = THEMES.light;

describe("ImportSettingsDialog", () => {
	it("handles invalid JSON gracefully", () => {
		const invalidJson = '{"broken": json';
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		// Mock console.error if needed, though secureJSONParse might throw directly handled by catch block.
		// ImportSettingsDialog's catch block doesn't log to console based on my investigation, it just returns empty arrays.

		render(
			<ImportSettingsDialog
				fileName="test.json"
				fileContent={invalidJson}
				fileType="json"
				onConfirm={onConfirm}
				onCancel={onCancel}
				theme={theme}
			/>,
		);

		// Verify it renders the base dialog title
		expect(screen.getByText("Import Settings: test.json")).toBeDefined();

		// Verify it doesn't crash and renders the fallback empty table headers
		// When error occurs, previewData.headers is [] and previewData.rows is []
		// so no column configurations are rendered (no inputs with role column header)
		const inputs = screen.queryAllByRole("textbox", {
			name: /Column .* name/i,
		});
		expect(inputs).toHaveLength(0);
	});

	it("updates headers and preview when startRow changes", () => {
		const csvContent = "Comment Line\nHeader1,Header2\nData1,Data2";
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ImportSettingsDialog
				fileName="test.csv"
				fileContent={csvContent}
				fileType="csv"
				onConfirm={onConfirm}
				onCancel={onCancel}
				theme={theme}
			/>,
		);

		// Initial state: startRow=1, headers: "Comment Line"
		expect(screen.getByLabelText(/Column 1 name/i)).toHaveValue("Comment Line");

		// Change startRow to 2
		const startRowInput = screen.getByLabelText(/Start Row/i);
		fireEvent.change(startRowInput, { target: { value: "2" } });

		// New state: startRow=2, headers: lines[1] split by "," -> ["Header1", "Header2"]
		expect(screen.getByLabelText(/Column 1 name/i)).toHaveValue("Header1");
		expect(screen.getByLabelText(/Column 2 name/i)).toHaveValue("Header2");
		expect(screen.getByText("Data1")).toBeInTheDocument();
		expect(screen.getByText("Data2")).toBeInTheDocument();
	});

	it("auto-detects semicolon delimiter and comma decimal point", () => {
		const csvContent = "Header1;Header2\n1,2;3,4\n5,6;7,8";
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ImportSettingsDialog
				fileName="test.csv"
				fileContent={csvContent}
				fileType="csv"
				onConfirm={onConfirm}
				onCancel={onCancel}
				theme={theme}
			/>,
		);

		// Delimiter should be detected as ";"
		const delimiterSelect = screen.getByLabelText(/Delimiter/i);
		expect(delimiterSelect).toHaveValue(";");

		// Decimal point should be detected as ","
		const decimalSelect = screen.getByLabelText(/Decimal Point/i);
		expect(decimalSelect).toHaveValue(",");
	});

	it("auto-detects tab delimiter and dot decimal point", () => {
		const csvContent = "Header1\tHeader2\n1.2\t3.4\n5.6\t7.8";
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ImportSettingsDialog
				fileName="test.csv"
				fileContent={csvContent}
				fileType="csv"
				onConfirm={onConfirm}
				onCancel={onCancel}
				theme={theme}
			/>,
		);

		// Delimiter should be detected as "\t"
		const delimiterSelect = screen.getByLabelText(/Delimiter/i);
		expect(delimiterSelect).toHaveValue("\t");

		// Decimal point should be detected as "."
		const decimalSelect = screen.getByLabelText(/Decimal Point/i);
		expect(decimalSelect).toHaveValue(".");
	});
});

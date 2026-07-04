import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImprintModal } from "../ImprintModal";

describe("ImprintModal", () => {
	it("renders the imprint heading, text and link", () => {
		const onClose = vi.fn();
		render(<ImprintModal onClose={onClose} />);

		expect(
			screen.getByRole("heading", { name: "Imprint" }),
		).toBeInTheDocument();
		expect(screen.getByText("Michael Krisper")).toBeInTheDocument();
		expect(
			screen.getByRole("link", {
				name: "https://github.com/michaelkrisper/webgraphy",
			}),
		).toHaveAttribute("href", "https://github.com/michaelkrisper/webgraphy");
		expect(
			screen.getByText(/This open-source project provides high-performance/i),
		).toBeInTheDocument();
	});

	it("calls onClose when the close button is clicked", () => {
		const onClose = vi.fn();
		render(<ImprintModal onClose={onClose} />);

		const closeButton = screen.getByLabelText("Close Imprint");
		fireEvent.click(closeButton);

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LicenseModal } from "../LicenseModal";

describe("LicenseModal", () => {
	it("renders the license heading and text", () => {
		const onClose = vi.fn();
		render(<LicenseModal onClose={onClose} />);

		expect(
			screen.getByRole("heading", { name: "License" }),
		).toBeInTheDocument();
		expect(screen.getByText(/MIT License/i)).toBeInTheDocument();
	});

	it("calls onClose when the close button is clicked", () => {
		const onClose = vi.fn();
		render(<LicenseModal onClose={onClose} />);

		const closeButton = screen.getByLabelText("Close License");
		fireEvent.click(closeButton);

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../Modal";

describe("Modal", () => {
	it("renders title as string and children", () => {
		const onClose = vi.fn();
		render(
			<Modal onClose={onClose} title="Test Title">
				<div>Test Content</div>
			</Modal>,
		);

		expect(
			screen.getByRole("heading", { name: "Test Title" }),
		).toBeInTheDocument();
		expect(screen.getByText("Test Content")).toBeInTheDocument();
	});

	it("renders title as ReactNode", () => {
		const onClose = vi.fn();
		render(
			<Modal
				onClose={onClose}
				title={<div data-testid="custom-title">Custom Node Title</div>}
			>
				<div>Test Content</div>
			</Modal>,
		);

		expect(screen.getByTestId("custom-title")).toBeInTheDocument();
		expect(screen.getByText("Custom Node Title")).toBeInTheDocument();
	});

	it("renders footer when provided", () => {
		const onClose = vi.fn();
		render(
			<Modal
				onClose={onClose}
				title="Test Title"
				footer={<div data-testid="modal-footer">Footer Content</div>}
			>
				<div>Test Content</div>
			</Modal>,
		);

		expect(screen.getByTestId("modal-footer")).toBeInTheDocument();
		expect(screen.getByText("Footer Content")).toBeInTheDocument();
	});

	it("renders headerActions when provided", () => {
		const onClose = vi.fn();
		render(
			<Modal
				onClose={onClose}
				title="Test Title"
				headerActions={<button type="button">Extra Action</button>}
			>
				<div>Test Content</div>
			</Modal>,
		);

		expect(
			screen.getByRole("button", { name: "Extra Action" }),
		).toBeInTheDocument();
	});

	it("calls onClose when the close button is clicked", () => {
		const onClose = vi.fn();
		render(
			<Modal onClose={onClose} title="Test Title">
				<div>Test Content</div>
			</Modal>,
		);

		const closeButton = screen.getByRole("button", { name: "Close dialog" });
		fireEvent.click(closeButton);

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("uses custom ariaLabel for close button", () => {
		const onClose = vi.fn();
		render(
			<Modal onClose={onClose} title="Test Title" ariaLabel="Custom Close">
				<div>Test Content</div>
			</Modal>,
		);

		expect(
			screen.getByRole("button", { name: "Custom Close" }),
		).toBeInTheDocument();
	});

	it("hides header when hideHeader is true", () => {
		const onClose = vi.fn();
		render(
			<Modal onClose={onClose} title="Test Title" hideHeader={true}>
				<div>Test Content</div>
			</Modal>,
		);

		expect(
			screen.queryByRole("heading", { name: "Test Title" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Close dialog" }),
		).not.toBeInTheDocument();
		// Content should still render
		expect(screen.getByText("Test Content")).toBeInTheDocument();
	});

	it("applies custom styles to the modal card", () => {
		const onClose = vi.fn();
		const { container } = render(
			<Modal
				onClose={onClose}
				title="Test Title"
				padding="10px"
				borderRadius="5px"
				maxWidth="500px"
				width="80%"
				height="400px"
				maxHeight="80vh"
			>
				<div>Test Content</div>
			</Modal>,
		);

		const modalCard = container.querySelector(".modal-card");
		expect(modalCard).toHaveStyle({
			padding: "10px",
			borderRadius: "5px",
			maxWidth: "500px",
			width: "80%",
			height: "400px",
			maxHeight: "80vh",
		});
	});
});

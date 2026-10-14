import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it } from "vitest";
import {
	confirmReplaceWorkspace,
	useSessionPrompt,
} from "../../../store/useSessionPrompt";
import { SessionPromptHost } from "../SessionPromptHost";

describe("SessionPromptHost", () => {
	beforeEach(() => {
		useSessionPrompt.setState({ prompt: null });
	});

	const ask = () => {
		let answer: Promise<boolean> = Promise.resolve(false);
		act(() => {
			answer = confirmReplaceWorkspace("work.webgraphy", "2 datasets, 3 series");
		});
		return answer;
	};

	it("renders nothing without a pending question", () => {
		const { container } = render(<SessionPromptHost />);
		expect(container).toBeEmptyDOMElement();
	});

	it("asks, and resolves true on Replace", async () => {
		render(<SessionPromptHost />);
		const answer = ask();
		const dialog = await screen.findByRole("dialog", { name: "Open session?" });
		expect(dialog).toHaveTextContent("work.webgraphy");
		expect(dialog).toHaveTextContent("2 datasets, 3 series");
		expect(await axe(dialog)).toHaveNoViolations();

		fireEvent.click(screen.getByRole("button", { name: "Replace workspace" }));
		expect(await answer).toBe(true);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("resolves false on Cancel and on Escape", async () => {
		render(<SessionPromptHost />);
		const first = ask();
		fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
		expect(await first).toBe(false);

		const second = ask();
		await screen.findByRole("dialog");
		fireEvent.keyDown(document, { key: "Escape" });
		expect(await second).toBe(false);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("declines a superseded question", async () => {
		const first = confirmReplaceWorkspace("a.webgraphy", "");
		const second = confirmReplaceWorkspace("b.webgraphy", "");
		expect(await first).toBe(false);
		expect(useSessionPrompt.getState().prompt?.fileName).toBe("b.webgraphy");
		useSessionPrompt.getState().prompt?.resolve(true);
		expect(await second).toBe(true);
	});
});

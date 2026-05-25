import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type Suggestion,
	signatureContext,
	useFormulaEditor,
} from "../useFormulaEditor";

const originalRequestAnimationFrame = global.requestAnimationFrame;

beforeEach(() => {
	global.requestAnimationFrame = vi.fn((cb) => {
		cb(0);
		return 0;
	});
});

afterEach(() => {
	global.requestAnimationFrame = originalRequestAnimationFrame;
	vi.clearAllMocks();
});

const createMockTextarea = () => {
	const mockTextarea = {
		value: "",
		selectionStart: 0,
		selectionEnd: 0,
		focus: vi.fn(),
	} as unknown as HTMLTextAreaElement;

	const textareaRef = {
		current: mockTextarea,
	} as React.RefObject<HTMLTextAreaElement | null>;

	return { mockTextarea, textareaRef };
};

const fnSuggestion = (label: string, insert: string): Suggestion => ({
	kind: "function",
	label,
	insert,
	signature: `${label}(…)`,
	detail: "",
});

const colSuggestion = (label: string, insert: string): Suggestion => ({
	kind: "column",
	label,
	insert,
	detail: "",
});

describe("useFormulaEditor", () => {

	it("suggests constants and returns empty on non-identifiers", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.handleFormulaChange({
				target: { value: "p", selectionStart: 1 },
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});

		const labels = result.current.suggestions.map((s) => s.label);
		expect(labels).toContain("pi");

		act(() => {
			result.current.handleFormulaChange({
				target: { value: "123", selectionStart: 3 },
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});

		expect(result.current.suggestions).toEqual([]);
	});

	it("handles formula click or select", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.handleFormulaClickOrSelect({
				currentTarget: { selectionStart: 5 },
			} as React.SyntheticEvent<HTMLTextAreaElement>);
		});

		expect(result.current.cursorPos).toBe(5);
	});

	it("inserts text correctly when textareaRef is empty", () => {
		const { result } = renderHook(() =>
			useFormulaEditor({ initialFormula: "a + ", columns, textareaRef: { current: null } }),
		);

		act(() => {
			result.current.insertText("b");
		});

		expect(result.current.formula).toBe("a + b");
	});

	const columns = ["Column A", "Column B", "Another"];

	it("initializes with initialFormula", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ initialFormula: "sin(x)", columns, textareaRef }),
		);
		expect(result.current.formula).toBe("sin(x)");
	});

	it("initializes empty by default", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);
		expect(result.current.formula).toBe("");
	});

	it("inserts plain text correctly", () => {
		const { mockTextarea, textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ initialFormula: "a + ", columns, textareaRef }),
		);

		mockTextarea.value = "a + ";
		mockTextarea.selectionEnd = 4;

		act(() => {
			result.current.insertText("b");
		});

		expect(result.current.formula).toBe("a + b");
		expect(mockTextarea.selectionStart).toBe(5);
		expect(mockTextarea.selectionEnd).toBe(5);
		expect(mockTextarea.focus).toHaveBeenCalled();
	});

	it("inserts operator correctly and appends a parenthesis", () => {
		const { mockTextarea, textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ initialFormula: "", columns, textareaRef }),
		);

		mockTextarea.value = "";
		mockTextarea.selectionEnd = 0;

		act(() => {
			result.current.insertText("sin(", true);
		});

		expect(result.current.formula).toBe("sin()");
		expect(mockTextarea.selectionStart).toBe(4);
		expect(mockTextarea.selectionEnd).toBe(4);
		expect(mockTextarea.focus).toHaveBeenCalled();
	});

	it("function suggestions on partial identifier", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.handleFormulaChange({
				target: { value: "si", selectionStart: 2 },
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});

		expect(result.current.formula).toBe("si");
		const labels = result.current.suggestions.map((s) => s.label);
		expect(labels).toContain("sin");
		expect(labels).toContain("sinh");
		expect(labels).toContain("sign");
		expect(result.current.selectedSuggestion).toBe(0);
	});

	it("column suggestions inside a bracket", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.handleFormulaChange({
				target: { value: "[c", selectionStart: 2 },
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});

		expect(result.current.formula).toBe("[c");
		const labels = result.current.suggestions.map((s) => s.label);
		expect(labels).toContain("Column A");
		expect(labels).toContain("Column B");
		for (const s of result.current.suggestions) {
			expect(s.kind).toBe("column");
		}
	});

	it("applies a function suggestion and auto-closes the paren", () => {
		const { mockTextarea, textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.applySuggestion(fnSuggestion("sin", "sin("), "si", 2);
		});

		expect(result.current.formula).toBe("sin()");
		expect(result.current.suggestions).toEqual([]);
		expect(mockTextarea.selectionStart).toBe(4);
		expect(mockTextarea.selectionEnd).toBe(4);
		expect(mockTextarea.focus).toHaveBeenCalled();
	});

	it("applies a column suggestion correctly", () => {
		const { mockTextarea, textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.applySuggestion(
				colSuggestion("Column A", "Column A]"),
				"1 + [c",
				6,
			);
		});

		expect(result.current.formula).toBe("1 + [Column A]");
		expect(result.current.suggestions).toEqual([]);
		expect(mockTextarea.selectionStart).toBe(14);
		expect(mockTextarea.selectionEnd).toBe(14);
		expect(mockTextarea.focus).toHaveBeenCalled();
	});

	it("auto-pairs ( on keydown", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		const mockEvent = {
			key: "(",
			currentTarget: {
				value: "sin",
				selectionStart: 3,
				selectionEnd: 3,
			},
			preventDefault: vi.fn(),
		} as unknown as React.KeyboardEvent<HTMLTextAreaElement>;

		act(() => {
			result.current.handleFormulaKeyDown(mockEvent);
		});

		expect(mockEvent.preventDefault).toHaveBeenCalled();
		expect(result.current.formula).toBe("sin()");
		expect(mockEvent.currentTarget.selectionStart).toBe(4);
	});

	it("skips a duplicate closing bracket on keydown", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ initialFormula: "sin()", columns, textareaRef }),
		);

		const mockEvent = {
			key: ")",
			currentTarget: {
				value: "sin()",
				selectionStart: 4,
				selectionEnd: 4,
			},
			preventDefault: vi.fn(),
		} as unknown as React.KeyboardEvent<HTMLTextAreaElement>;

		act(() => {
			result.current.handleFormulaKeyDown(mockEvent);
		});

		expect(mockEvent.preventDefault).toHaveBeenCalled();
		expect(mockEvent.currentTarget.selectionStart).toBe(5);
	});

	it("navigates suggestions and escapes them", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.handleFormulaChange({
				target: { value: "av", selectionStart: 2 },
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});

		expect(result.current.suggestions.length).toBeGreaterThan(1);

		act(() => {
			result.current.handleFormulaKeyDown({
				key: "ArrowDown",
				currentTarget: { value: "av", selectionStart: 2, selectionEnd: 2 },
				preventDefault: vi.fn(),
			} as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
		});

		expect(result.current.selectedSuggestion).toBe(1);

		act(() => {
			result.current.handleFormulaKeyDown({
				key: "ArrowUp",
				currentTarget: { value: "av", selectionStart: 2, selectionEnd: 2 },
				preventDefault: vi.fn(),
			} as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
		});

		expect(result.current.selectedSuggestion).toBe(0);

		act(() => {
			result.current.handleFormulaKeyDown({
				key: "Escape",
				currentTarget: { value: "av", selectionStart: 2, selectionEnd: 2 },
				preventDefault: vi.fn(),
			} as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
		});

		expect(result.current.suggestions).toEqual([]);
	});

	it("applies the selected suggestion via Enter", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.handleFormulaChange({
				target: { value: "sin", selectionStart: 3 },
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});

		act(() => {
			result.current.handleFormulaKeyDown({
				key: "Enter",
				currentTarget: { value: "sin", selectionStart: 3, selectionEnd: 3 },
				preventDefault: vi.fn(),
			} as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
		});

		// The first matching suggestion is "sin"; auto-closes paren.
		expect(result.current.formula).toBe("sin()");
	});
});

describe("signatureContext", () => {

	it("resolves legacy suffix root aliases", () => {
		const ctx = signatureContext("sumhourl([t])", 9);
		expect(ctx?.fn.name).toBe("sumhour");
	});


	it("returns null when function name cannot be extracted", () => {
		const ctx = signatureContext("([t])", 1);
		expect(ctx).toBeNull();
	});

	it("returns null for unknown functions", () => {
		const ctx = signatureContext("unknown([t])", 8);
		expect(ctx).toBeNull();
	});

	it("resolves rollingtime legacy aliases", () => {
		const ctx = signatureContext("avg5s([t])", 6);
		expect(ctx?.fn.name).toBe("rollingtime");
	});

	it("resolves root legacy aliases", () => {
		const ctx = signatureContext("avgday([t])", 7);
		expect(ctx?.fn.name).toBe("avgday");
	});

	it("identifies the function the cursor is inside", () => {
		const ctx = signatureContext("if([t] > 100, 1, 0)", 13);
		expect(ctx?.fn.name).toBe("if");
		expect(ctx?.argIndex).toBe(1);
	});

	it("returns null outside any function", () => {
		expect(signatureContext("[t] + 1", 5)).toBeNull();
	});

	it("resolves legacy alias names back to canonical metadata", () => {
		const ctx = signatureContext("avg5([t])", 5);
		expect(ctx?.fn.name).toBe("rolling");
	});

	it("counts argument index across nested calls correctly", () => {
		// Cursor at position 20 (sitting on the final "0") — third argument
		// of the outer if(); commas inside the nested sin() must be ignored.
		const ctx = signatureContext("if(sin([t]) > 0, 1, 0)", 20);
		expect(ctx?.fn.name).toBe("if");
		expect(ctx?.argIndex).toBe(2);
	});
});

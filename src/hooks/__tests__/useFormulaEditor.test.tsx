import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFormulaEditor } from "../useFormulaEditor";

// Mock requestAnimationFrame to execute synchronously
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

describe("useFormulaEditor", () => {
	const columns = ["Dataset: Column A", "Column B", "Dataset: Another"];

	it("initializes with initialFormula", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ initialFormula: "sin(x)", columns, textareaRef }),
		);
		expect(result.current.formula).toBe("sin(x)");
	});


	it("initializes with empty string if no initialFormula", () => {
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

	it("updates formula and suggestions on change for functions", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		const mockEvent = {
			target: {
				value: "si",
				selectionStart: 2,
			},
		} as React.ChangeEvent<HTMLTextAreaElement>;

		act(() => {
			result.current.handleFormulaChange(mockEvent);
		});


		expect(result.current.formula).toBe("si");
		expect(result.current.suggestions).toEqual(["sin("]);
		expect(result.current.selectedSuggestion).toBe(0);
	});


	it("updates formula and suggestions on change for columns", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		const mockEvent = {
			target: {
				value: "[c",
				selectionStart: 2,
			},
		} as React.ChangeEvent<HTMLTextAreaElement>;

		act(() => {
			result.current.handleFormulaChange(mockEvent);
		});


		expect(result.current.formula).toBe("[c");
		expect(result.current.suggestions).toEqual(["Column A]", "Column B]"]);
		expect(result.current.selectedSuggestion).toBe(0);
	});


	it("returns empty suggestions if function partial is less than 2 characters", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		const mockEvent = {
			target: {
				value: "s",
				selectionStart: 1,
			},
		} as React.ChangeEvent<HTMLTextAreaElement>;

		act(() => {
			result.current.handleFormulaChange(mockEvent);
		});


		expect(result.current.suggestions).toEqual([]);
	});


	it("applies suggestion for functions correctly", () => {
		const { mockTextarea, textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.applySuggestion("sin(", "si", 2);
		});


		expect(result.current.formula).toBe("sin(");
		expect(result.current.suggestions).toEqual([]);
		expect(mockTextarea.selectionStart).toBe(4);
		expect(mockTextarea.selectionEnd).toBe(4);
		expect(mockTextarea.focus).toHaveBeenCalled();
	});


	it("applies suggestion for columns correctly", () => {
		const { mockTextarea, textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.applySuggestion("Column A]", "1 + [c", 6);
		});


		expect(result.current.formula).toBe("1 + [Column A]");
		expect(result.current.suggestions).toEqual([]);
		expect(mockTextarea.selectionStart).toBe(14);
		expect(mockTextarea.selectionEnd).toBe(14);
		expect(mockTextarea.focus).toHaveBeenCalled();
	});


	it("handles auto-pairing brackets on keydown", () => {
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


	it("skips closing bracket if it already exists", () => {
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


	it("navigates suggestions via arrow keys and escape", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		// First, populate suggestions
		act(() => {
			result.current.handleFormulaChange({
				target: { value: "s", selectionStart: 1 }
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});


		act(() => {
			result.current.handleFormulaChange({
				target: { value: "si", selectionStart: 2 }
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});


		// By default it selects index 0. We expect "sin(". Let's verify we got suggestions
		expect(result.current.suggestions.length).toBeGreaterThan(0);

		// Press arrow down
		act(() => {
			result.current.handleFormulaKeyDown({
				key: "ArrowDown",
				currentTarget: { value: "si", selectionStart: 2, selectionEnd: 2 },
				preventDefault: vi.fn(),
			} as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
		});


		act(() => {
			result.current.handleFormulaChange({
				target: { value: "av", selectionStart: 2 }
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


	it("applies suggestion via enter/tab key", () => {
		const { textareaRef } = createMockTextarea();
		const { result } = renderHook(() =>
			useFormulaEditor({ columns, textareaRef }),
		);

		act(() => {
			result.current.handleFormulaChange({
				target: { value: "si", selectionStart: 2 }
			} as React.ChangeEvent<HTMLTextAreaElement>);
		});


		act(() => {
			result.current.handleFormulaKeyDown({
				key: "Enter",
				currentTarget: { value: "si", selectionStart: 2, selectionEnd: 2 },
				preventDefault: vi.fn(),
			} as unknown as React.KeyboardEvent<HTMLTextAreaElement>);
		});


		expect(result.current.formula).toBe("sin(");
	});

});

import { useCallback, useState } from "react";
import {
	CONSTANTS,
	FUNCTIONS,
	type FormulaFunctionMeta,
} from "../utils/formulaFunctions";

const BRACKET_PAIRS: Record<string, string> = { "(": ")", "[": "]" };
const CLOSING_BRACKETS = new Set([")", "]"]);

export type Suggestion =
	| {
			kind: "column";
			label: string;
			insert: string;
			detail: string;
	  }
	| {
			kind: "function";
			label: string;
			insert: string;
			signature: string;
			detail: string;
	  }
	| {
			kind: "constant";
			label: string;
			insert: string;
			detail: string;
	  };

/** Display-friendly insertion strings for the user-typed function names. */
const FUNCTION_DISPLAY_NAMES: Record<string, string> = {
	rolling: "rolling",
	rollingc: "rollingC",
	rollingr: "rollingR",
	rollingtime: "rollingTime",
	rollingtimec: "rollingTimeC",
	rollingtimer: "rollingTimeR",
	rollingmed: "rollingMed",
	rollingstd: "rollingStd",
	rollingmin: "rollingMin",
	rollingmax: "rollingMax",
	avgday: "avgDay",
	avghour: "avgHour",
	avgminute: "avgMinute",
	avgsecond: "avgSecond",
	sumday: "sumDay",
	sumhour: "sumHour",
	summinute: "sumMinute",
	sumsecond: "sumSecond",
};

function displayName(meta: FormulaFunctionMeta): string {
	return FUNCTION_DISPLAY_NAMES[meta.name] ?? meta.name;
}

interface UseFormulaEditorProps {
	initialFormula?: string;
	columns: string[];
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Returns the function name and argument index the cursor is currently
 * inside, by walking left through matched bracket pairs. Powers the
 * Excel-style signature hint that floats below the cursor.
 */
export function signatureContext(
	text: string,
	cursorPos: number,
): { fn: FormulaFunctionMeta; argIndex: number } | null {
	let depth = 0;
	let argIndex = 0;
	for (let i = cursorPos - 1; i >= 0; i--) {
		const c = text[i];
		if (c === ")") depth++;
		else if (c === "(") {
			if (depth === 0) {
				// Identifier ending at i — walk left to extract it.
				let j = i - 1;
				while (j >= 0 && /[a-zA-Z0-9_]/.test(text[j])) j--;
				const name = text.substring(j + 1, i).toLowerCase();
				if (!name) return null;
				const meta =
					FUNCTIONS.find((f) => f.name === name) ?? lookupLegacy(name);
				if (!meta) return null;
				return { fn: meta, argIndex };
			}
			depth--;
		} else if (c === "," && depth === 0) {
			argIndex++;
		} else if (c === "[") {
			// Skip column references entirely (no nested logic inside them).
		}
	}
	return null;
}

/** Best-effort metadata lookup for legacy short forms (avgN, avg5s, …). */
function lookupLegacy(name: string): FormulaFunctionMeta | null {
	if (/^avg\d+[lcr]?$/.test(name)) {
		return FUNCTIONS.find((f) => f.name === "rolling") ?? null;
	}
	if (/^avg\d+[smhd][lcr]?$/.test(name)) {
		return FUNCTIONS.find((f) => f.name === "rollingtime") ?? null;
	}
	if (/^(avg|sum)(day|hour|minute|second)[lcr]?$/.test(name)) {
		const root = name.replace(/[lcr]$/, "");
		return FUNCTIONS.find((f) => f.name === root) ?? null;
	}
	return null;
}

export function useFormulaEditor({
	initialFormula,
	columns,
	textareaRef,
}: UseFormulaEditorProps) {
	const [formula, setFormula] = useState(initialFormula ?? "");
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [selectedSuggestion, setSelectedSuggestion] = useState(0);
	const [cursorPos, setCursorPos] = useState(0);

	const getCompletions = useCallback(
		(text: string, pos: number): Suggestion[] => {
			const beforeCursor = text.slice(0, pos);

			// Inside [Foo — complete column names.
			const bracketMatch = beforeCursor.match(/\[([^\]]*)$/);
			if (bracketMatch) {
				const partial = bracketMatch[1].toLowerCase();
				return columns
					.filter((c) => {
						const short = c.includes(": ") ? c.split(": ")[1] : c;
						return (
							short.toLowerCase().startsWith(partial) ||
							c.toLowerCase().startsWith(partial)
						);
					})
					.slice(0, 8)
					.map((c) => {
						const short = c.includes(": ") ? c.split(": ")[1] : c;
						return {
							kind: "column" as const,
							label: short,
							insert: `${short}]`,
							detail: c !== short ? `from ${c.split(": ")[0]}` : "column",
						};
					});
			}

			// Otherwise — function or constant name.
			const idMatch = beforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
			if (idMatch) {
				const partial = idMatch[1].toLowerCase();
				if (partial.length < 1) return [];
				const out: Suggestion[] = [];

				for (const c of CONSTANTS) {
					if (c.name.toLowerCase().startsWith(partial)) {
						out.push({
							kind: "constant",
							label: c.name,
							insert: c.name,
							detail: c.description,
						});
					}
				}
				for (const f of FUNCTIONS) {
					const display = displayName(f);
					if (display.toLowerCase().startsWith(partial)) {
						out.push({
							kind: "function",
							label: display,
							insert: `${display}(`,
							signature: f.signature,
							detail: f.description,
						});
					}
				}

				return out.slice(0, 10);
			}

			return [];
		},
		[columns],
	);

	const applySuggestion = useCallback(
		(suggestion: Suggestion, currentValue: string, pos: number) => {
			const before = currentValue.slice(0, pos);
			const after = currentValue.slice(pos);
			const bracketMatch = before.match(/\[([^\]]*)$/);
			const idMatch = before.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
			let replaceStart = pos;
			if (bracketMatch) replaceStart = pos - bracketMatch[1].length;
			else if (idMatch) replaceStart = pos - idMatch[1].length;

			// Auto-close the function paren if there isn't one already.
			let insert = suggestion.insert;
			let cursorOffset = insert.length;
			if (suggestion.kind === "function" && after[0] !== ")") {
				insert = `${insert})`;
				cursorOffset = suggestion.insert.length; // place cursor inside (
			}

			const newFormula = before.slice(0, replaceStart) + insert + after;
			setFormula(newFormula);
			setSuggestions([]);
			const newPos = replaceStart + cursorOffset;
			requestAnimationFrame(() => {
				if (textareaRef.current) {
					textareaRef.current.selectionStart =
						textareaRef.current.selectionEnd = newPos;
					textareaRef.current.focus();
					setCursorPos(newPos);
				}
			});
		},
		[textareaRef],
	);

	const handleFormulaKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			const ta = e.currentTarget;
			const { selectionStart, selectionEnd, value } = ta;

			if (BRACKET_PAIRS[e.key]) {
				e.preventDefault();
				const closing = BRACKET_PAIRS[e.key];
				const before = value.slice(0, selectionStart);
				const selected = value.slice(selectionStart, selectionEnd);
				const after = value.slice(selectionEnd);
				const newFormula = before + e.key + selected + closing + after;
				setFormula(newFormula);
				requestAnimationFrame(() => {
					ta.selectionStart = ta.selectionEnd =
						selectionStart + 1 + selected.length;
					setCursorPos(selectionStart + 1 + selected.length);
				});
				return;
			}

			if (CLOSING_BRACKETS.has(e.key) && value[selectionStart] === e.key) {
				e.preventDefault();
				requestAnimationFrame(() => {
					ta.selectionStart = ta.selectionEnd = selectionStart + 1;
					setCursorPos(selectionStart + 1);
				});
				return;
			}

			if (suggestions.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSelectedSuggestion((s) => Math.min(s + 1, suggestions.length - 1));
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setSelectedSuggestion((s) => Math.max(s - 1, 0));
					return;
				}
				if (e.key === "Tab" || e.key === "Enter") {
					if (suggestions[selectedSuggestion]) {
						e.preventDefault();
						applySuggestion(
							suggestions[selectedSuggestion],
							value,
							selectionStart,
						);
						return;
					}
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setSuggestions([]);
					return;
				}
			}
		},
		[suggestions, selectedSuggestion, applySuggestion],
	);

	const handleFormulaChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newValue = e.target.value;
			setFormula(newValue);
			const pos = e.target.selectionStart;
			setCursorPos(pos);
			const completions = getCompletions(newValue, pos);
			setSuggestions(completions);
			setSelectedSuggestion(0);
		},
		[getCompletions],
	);

	const handleFormulaClickOrSelect = useCallback(
		(e: React.SyntheticEvent<HTMLTextAreaElement>) => {
			setCursorPos(e.currentTarget.selectionStart);
		},
		[],
	);

	const insertText = useCallback(
		(text: string, isOperator: boolean = false) => {
			const ta = textareaRef.current;
			const pos = ta ? ta.selectionEnd : -1;
			const endsWithParen = isOperator && text.endsWith("(");
			const insertion = endsWithParen ? `${text})` : text;
			const cursorOffset = endsWithParen ? text.length : insertion.length;

			setFormula((prev) => {
				if (ta && pos >= 0)
					return prev.slice(0, pos) + insertion + prev.slice(pos);
				return prev + insertion;
			});

			requestAnimationFrame(() => {
				if (ta) {
					const newPos =
						(pos >= 0 ? pos : ta.value.length - insertion.length) +
						cursorOffset;
					ta.selectionStart = ta.selectionEnd = newPos;
					ta.focus();
					setCursorPos(newPos);
				}
			});
		},
		[textareaRef],
	);

	return {
		formula,
		setFormula,
		suggestions,
		selectedSuggestion,
		cursorPos,
		handleFormulaKeyDown,
		handleFormulaChange,
		handleFormulaClickOrSelect,
		applySuggestion,
		insertText,
	};
}

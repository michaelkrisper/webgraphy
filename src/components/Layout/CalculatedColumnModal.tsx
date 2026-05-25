import { AlertCircle, Check } from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import {
	signatureContext,
	useFormulaEditor,
} from "../../hooks/useFormulaEditor";
import type { Dataset } from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import { compileFormula } from "../../utils/formula";
import { FormulaReference } from "./FormulaReference";
import { Modal } from "./Modal";

interface CalculatedColumnModalProps {
	dataset: Dataset;
	onClose: () => void;
	initialName?: string;
	initialFormula?: string;
}

export const CalculatedColumnModal: React.FC<CalculatedColumnModalProps> = ({
	dataset,
	onClose,
	initialName,
	initialFormula,
}) => {
	const addCalculatedColumn = useGraphStore((s) => s.addCalculatedColumn);
	const removeCalculatedColumn = useGraphStore((s) => s.removeCalculatedColumn);
	const isEditing = !!initialName;
	const [manualName, setManualName] = useState(initialName ?? "");
	const [nameUserEdited, setNameUserEdited] = useState(isEditing);
	const [error, setError] = useState<string | null>(null);
	const [isCalculating, setIsCalculating] = useState(false);
	const [showReference, setShowReference] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const {
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
	} = useFormulaEditor({
		initialFormula,
		columns: dataset.columns,
		textareaRef,
	});

	const currentName = nameUserEdited ? manualName : formula;

	// Live validation with positional info.
	const validation = useMemo(() => {
		if (!formula.trim()) return { msg: null as string | null, pos: -1 };
		const isRegression = /^(?:linreg|polyreg|expreg|logreg|kde)\s*\(/i.test(
			formula.trim(),
		);
		if (isRegression) {
			const colMatch = formula.match(/\[([^\]]+)\]/);
			if (colMatch) {
				const colName = colMatch[1];
				const found = dataset.columns.some(
					(c) => c === colName || c.endsWith(`: ${colName}`),
				);
				return found
					? { msg: null, pos: -1 }
					: { msg: `Column not found: ${colName}`, pos: -1 };
			}
			return { msg: "Expected: function([column])", pos: -1 };
		}
		const result = compileFormula(formula, dataset.columns);
		return { msg: result.error || null, pos: result.errorPos ?? -1 };
	}, [formula, dataset.columns]);

	// Signature hint following the cursor.
	const hint = useMemo(() => {
		if (!formula) return null;
		return signatureContext(formula, cursorPos);
	}, [formula, cursorPos]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		const nameToSubmit = currentName.trim();

		if (!nameToSubmit) {
			setError("Please enter a column name.");
			return;
		}

		if (!formula.trim()) {
			setError("Please enter a formula.");
			return;
		}

		// Auto-close trailing missing brackets.
		const autoCloseFormula = (f: string): string => {
			const stack: string[] = [];
			const pairs: Record<string, string> = { "(": ")", "[": "]" };
			const closing = new Set([")", "]"]);
			for (const ch of f) {
				if (pairs[ch]) stack.push(pairs[ch]);
				else if (closing.has(ch)) stack.pop();
			}
			return f + stack.reverse().join("");
		};
		const closedFormula = autoCloseFormula(formula.trim());
		if (closedFormula !== formula.trim()) setFormula(closedFormula);

		setIsCalculating(true);
		try {
			if (isEditing && initialName)
				removeCalculatedColumn(dataset.id, initialName);
			const result = await addCalculatedColumn(
				dataset.id,
				nameToSubmit,
				closedFormula,
			);
			if (result.success) {
				onClose();
			} else {
				setError(result.error || "Calculation failed");
			}
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "An unexpected error occurred",
			);
		} finally {
			setIsCalculating(false);
		}
	};

	const insertColumn = (col: string) => {
		insertText(`[${col}]`);
	};

	const title = (
		<div className="modal-title-content">
			<h2 className="modal-title">
				{isEditing ? "Edit Calculated Series" : "Add Calculated Series"}
			</h2>
		</div>
	);

	const renderSuggestionContent = (s: (typeof suggestions)[number]) => (
		<>
			<span className="calc-suggestion-label">{s.label}</span>
			{s.kind === "function" && (
				<span className="calc-suggestion-sig">{s.signature}</span>
			)}
			<span className="calc-suggestion-detail">{s.detail}</span>
		</>
	);

	return (
		<Modal onClose={onClose} title={title} maxWidth="760px" padding="0">
			<form onSubmit={handleSubmit} className="calc-form">
				<div className="calc-field">
					<label htmlFor="col-name" className="calc-label">
						Column Name
					</label>
					<input
						id="col-name"
						type="text"
						className="calc-input"
						value={currentName}
						onChange={(e) => {
							setManualName(e.target.value);
							setNameUserEdited(true);
						}}
						placeholder="e.g. Adjusted Temperature"
						maxLength={50}
					/>
				</div>

				<div className="calc-formula-wrapper">
					<div className="calc-formula-header">
						<label htmlFor="formula" className="calc-label">
							Formula
						</label>
						<button
							type="button"
							onClick={() => setShowReference((v) => !v)}
							className="calc-ref-toggle"
							aria-expanded={showReference}
						>
							{showReference ? "Hide reference" : "Function reference"}
						</button>
					</div>
					<textarea
						ref={textareaRef}
						id="formula"
						value={formula}
						onChange={handleFormulaChange}
						onKeyDown={handleFormulaKeyDown}
						onClick={handleFormulaClickOrSelect}
						onSelect={handleFormulaClickOrSelect}
						placeholder="e.g. if([Temperature] > 100, [Temperature] - 273.15, 0)"
						className={`calc-formula-input ${
							validation.msg
								? "calc-formula-input--error"
								: formula.trim()
									? "calc-formula-input--ok"
									: ""
						}`}
					/>

					{hint && !validation.msg && (
						<div className="calc-sig-hint">
							<code className="calc-sig-hint-sig">{hint.fn.signature}</code>
							<span className="calc-sig-hint-desc">{hint.fn.description}</span>
						</div>
					)}

					{validation.msg && (
						<div className="calc-formula-msg calc-formula-msg--error">
							{validation.pos >= 0 && (
								<span className="calc-formula-msg-pos">
									col {validation.pos + 1}:
								</span>
							)}{" "}
							{validation.msg}
						</div>
					)}
					{!validation.msg && formula.trim() && (
						<div className="calc-formula-msg calc-formula-msg--ok">
							✓ Valid formula
						</div>
					)}

					{suggestions.length > 0 && (
						<div className="calc-suggestions" role="listbox">
							{suggestions.map((s, i) => (
								<button
									key={`${s.kind}-${s.label}`}
									type="button"
									onMouseDown={(e) => {
										e.preventDefault();
										if (textareaRef.current) {
											applySuggestion(
												s,
												formula,
												textareaRef.current.selectionStart,
											);
										}
									}}
									className={`calc-suggestion-item calc-suggestion-item--${s.kind} ${
										i === selectedSuggestion
											? "calc-suggestion-item--active"
											: ""
									}`}
									role="option"
									aria-selected={i === selectedSuggestion}
									tabIndex={-1}
								>
									{renderSuggestionContent(s)}
								</button>
							))}
						</div>
					)}
				</div>

				<div className="calc-field">
					<div className="calc-shortcuts-label">
						Available Columns (click to insert)
					</div>
					<div className="calc-col-list">
						{dataset.columns.map((col) => (
							<button
								key={col}
								type="button"
								onClick={() => insertColumn(col)}
								className="calc-col-btn"
								title={col}
							>
								{col}
							</button>
						))}
					</div>
				</div>

				{showReference && (
					<FormulaReference
						onInsert={(text, isFunction) => insertText(text, isFunction)}
					/>
				)}

				{error && (
					<div className="calc-error">
						<AlertCircle size={16} />
						<span>{error}</span>
					</div>
				)}

				<div className="calc-actions">
					<button
						type="button"
						onClick={onClose}
						disabled={isCalculating}
						className="calc-btn-cancel"
						style={{
							cursor: isCalculating ? "not-allowed" : "pointer",
							opacity: isCalculating ? 0.6 : 1,
						}}
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isCalculating || !!validation.msg}
						className="calc-btn-submit"
						style={{
							cursor:
								isCalculating || validation.msg ? "not-allowed" : "pointer",
							opacity: isCalculating ? 0.8 : validation.msg ? 0.6 : 1,
						}}
					>
						{isCalculating ? (
							<>
								<div className="calc-spinner" />
								<span>Calculating...</span>
							</>
						) : (
							<>
								<Check size={18} /> <span>Create Series</span>
							</>
						)}
					</button>
				</div>
			</form>
		</Modal>
	);
};

import React, { useState, useRef, useEffect } from 'react';
import { Check, Calculator, AlertCircle } from 'lucide-react';
import { useGraphStore } from '../../store/useGraphStore';
import { type Dataset } from '../../services/persistence';
import { compileFormula } from '../../utils/formula';
import { Modal } from './Modal';
import { FormulaShortcuts } from './FormulaShortcuts';
import { useFormulaEditor } from '../../hooks/useFormulaEditor';

interface CalculatedColumnModalProps {
  dataset: Dataset;
  onClose: () => void;
  initialName?: string;
  initialFormula?: string;
}

export const CalculatedColumnModal: React.FC<CalculatedColumnModalProps> = ({ dataset, onClose, initialName, initialFormula }) => {
  const { addCalculatedColumn, removeCalculatedColumn } = useGraphStore();
  const isEditing = !!initialName;
  const [name, setName] = useState(initialName ?? '');
  const [nameUserEdited, setNameUserEdited] = useState(isEditing);
  const [error, setError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    formula,
    setFormula,
    suggestions,
    selectedSuggestion,
    handleFormulaKeyDown,
    handleFormulaChange,
    applySuggestion,
    insertText,
  } = useFormulaEditor({
    initialFormula,
    columns: dataset.columns,
    textareaRef,
  });

  // Sync name to formula when user hasn't manually set a name
  useEffect(() => {
    if (!nameUserEdited) setName(formula);
  }, [formula, nameUserEdited]);

  // Live validation
  useEffect(() => {
    if (!formula.trim()) { setValidationMsg(null); return; }
    // Skip validation for regression formulas (handled by worker)
    const isRegression = /^(?:linreg|polyreg|expreg|logreg|kde)\s*\(/i.test(formula.trim());
    if (isRegression) {
      const colMatch = formula.match(/\[([^\]]+)\]/);
      if (colMatch) {
        const colName = colMatch[1];
        const found = dataset.columns.some(c => c === colName || c.endsWith(`: ${colName}`));
        setValidationMsg(found ? null : `Column not found: ${colName}`);
      } else {
        setValidationMsg('Expected: function([column])');
      }
      return;
    }
    const result = compileFormula(formula, dataset.columns);
    if (result.error) setValidationMsg(result.error);
    else setValidationMsg(null);
  }, [formula, dataset.columns]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter a column name.');
      return;
    }

    if (!formula.trim()) {
      setError('Please enter a formula.');
      return;
    }

    // Auto-close trailing missing brackets
    const autoCloseFormula = (f: string): string => {
      const stack: string[] = [];
      const pairs: Record<string, string> = { '(': ')', '[': ']' };
      const closing = new Set([')', ']']);
      for (const ch of f) {
        if (pairs[ch]) stack.push(pairs[ch]);
        else if (closing.has(ch)) stack.pop();
      }
      return f + stack.reverse().join('');
    };
    const closedFormula = autoCloseFormula(formula.trim());
    if (closedFormula !== formula.trim()) setFormula(closedFormula);

    setIsCalculating(true);
    try {
      if (isEditing && initialName) removeCalculatedColumn(dataset.id, initialName);
      const result = await addCalculatedColumn(dataset.id, name.trim(), closedFormula);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Failed to create calculated column.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsCalculating(false);
    }
  };

  const insertColumn = (colName: string) => {
    const displayName = colName.includes(': ') ? colName.split(': ')[1] : colName;
    insertText(`[${displayName}]`, false);
  };

  const title = (
    <div className="calc-modal-title-row">
      <Calculator size={20} color="var(--accent)" />
      <h2 className="modal-title">{isEditing ? 'Edit Calculated Series' : 'Add Calculated Series'}</h2>
    </div>
  );

  return (
    <Modal
      onClose={onClose}
      title={title}
      maxWidth="700px" // Adjusted to roughly match the original card size, maybe needs tweaking
      padding="0" // Reset padding as original uses specific padding in inner elements
    >
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <div className="calc-field">
            <label htmlFor="col-name" className="calc-label">Column Name</label>
            <input
              id="col-name"
              type="text"
              className="calc-input"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameUserEdited(true); }}
              placeholder="e.g. Adjusted Temperature"
              maxLength={50}
            />
          </div>

          <div className="calc-formula-wrapper">
            <label htmlFor="formula" className="calc-label">Formula</label>
            <textarea
              ref={textareaRef}
              id="formula"
              value={formula}
              onChange={handleFormulaChange}
              onKeyDown={handleFormulaKeyDown}
              placeholder="e.g. [Temperature] * -1 + 273.15"
              style={{
                width: '100%', height: '80px', padding: '8px', borderRadius: '0',
                border: `1px solid ${validationMsg ? '#ef4444' : formula.trim() && !validationMsg ? '#22c55e' : 'var(--border-color)'}`,
                fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', transition: 'border-color 0.2s'
              }}
            />
            {validationMsg && <div className="calc-formula-msg calc-formula-msg--error">{validationMsg}</div>}
            {!validationMsg && formula.trim() && <div className="calc-formula-msg calc-formula-msg--ok">✓ Valid formula</div>}
            {suggestions.length > 0 && (
              <div className="calc-suggestions">
                {suggestions.map((s, i) => (
                  <div
                    key={s}
                    onMouseDown={() => {
                      if (textareaRef.current) {
                        applySuggestion(s, formula, textareaRef.current.selectionStart);
                      }
                    }}
                    className="calc-suggestion-item"
                    style={{ background: i === selectedSuggestion ? '#e0f2fe' : 'var(--bg)' }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="calc-field">
            <div className="calc-shortcuts-label">Available Columns (click to insert)</div>
            <div className="calc-col-list">
              {dataset.columns.map(col => (
                <button
                  key={col}
                  type="button"
                  onClick={() => insertColumn(col)}
                  className="calc-col-btn"
                >
                  {col.includes(': ') ? col.split(': ')[1] : col}
                </button>
              ))}
            </div>
          </div>

          <FormulaShortcuts onInsertOperator={(op) => insertText(op, true)} />

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
              style={{ cursor: isCalculating ? 'not-allowed' : 'pointer', opacity: isCalculating ? 0.6 : 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCalculating}
              className="calc-btn-submit"
              style={{ cursor: isCalculating ? 'not-allowed' : 'pointer', opacity: isCalculating ? 0.8 : 1 }}
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

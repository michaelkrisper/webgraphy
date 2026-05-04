import { useState, useCallback } from 'react';

const BRACKET_PAIRS: Record<string, string> = { '(': ')', '[': ']' };
const CLOSING_BRACKETS = new Set([')', ']']);

const ALL_FUNCTIONS = [
  'sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(',
  'sqrt(', 'abs(', 'exp(', 'log(', 'ln(', 'round(', 'floor(', 'ceil(',
  'min(', 'max(', 'avg(', 'sum(',
  'avg5(', 'avg5c(', 'avg5l(', 'avg5r(', 'avg10(', 'avg50(', 'avg100(',
  'avg5s(', 'avg5sc(', 'avg5sl(', 'avg5sr(', 'avg5m(', 'avg1h(', 'avg1hc(', 'avg1hl(', 'avg1hr(', 'avg1d(',
  'avgDay(', 'avgDayc(', 'avgDayl(', 'avgDayr(',
  'avgHour(', 'avgHourc(', 'avgHourl(', 'avgHourr(',
  'avgMinute(', 'avgMinutec(', 'avgMinutel(', 'avgMinuter(',
  'avgSecond(', 'avgSecondc(', 'avgSecondl(', 'avgSecondr(',
  'sumDay(', 'sumHour(', 'sumMinute(', 'sumSecond(',
  'filter(',
  'linreg(', 'polyreg(', 'expreg(', 'logreg(', 'kde(',
];

interface UseFormulaEditorProps {
  initialFormula?: string;
  columns: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useFormulaEditor({ initialFormula, columns, textareaRef }: UseFormulaEditorProps) {
  const [formula, setFormula] = useState(initialFormula ?? '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const getCompletions = useCallback((text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const bracketMatch = beforeCursor.match(/\[([^\]]*)$/);
    if (bracketMatch) {
      const partial = bracketMatch[1].toLowerCase();
      const cols = columns
        .map(c => c.includes(': ') ? c.split(': ')[1] : c)
        .filter(c => c.toLowerCase().startsWith(partial))
        .slice(0, 8);
      return cols.map(c => `${c}]`);
    }
    const funcMatch = beforeCursor.match(/([a-zA-Z]\w*)$/);
    if (funcMatch) {
      const partial = funcMatch[1].toLowerCase();
      if (partial.length < 2) return [];
      return ALL_FUNCTIONS
        .filter(f => f.toLowerCase().startsWith(partial))
        .slice(0, 8);
    }
    return [];
  }, [columns]);

  const applySuggestion = useCallback((suggestion: string, currentValue: string, cursorPos: number) => {
    const before = currentValue.slice(0, cursorPos);
    const after = currentValue.slice(cursorPos);
    const bracketMatch = before.match(/\[([^\]]*)$/);
    const funcMatch = before.match(/([a-zA-Z]\w*)$/);
    let replaceStart = cursorPos;

    if (bracketMatch) replaceStart = cursorPos - bracketMatch[1].length;
    else if (funcMatch) replaceStart = cursorPos - funcMatch[1].length;
    const newFormula = before.slice(0, replaceStart) + suggestion + after;
    setFormula(newFormula);
    setSuggestions([]);
    const newPos = replaceStart + suggestion.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
      }
    });
  }, [textareaRef]);

  const handleFormulaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        ta.selectionStart = ta.selectionEnd = selectionStart + 1 + selected.length;
      });
      return;
    }

    if (CLOSING_BRACKETS.has(e.key) && value[selectionStart] === e.key) {
      e.preventDefault();
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 1;
      });
      return;
    }

    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(s => Math.min(s + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(s => Math.max(s - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (suggestions[selectedSuggestion]) {
          e.preventDefault();
          applySuggestion(suggestions[selectedSuggestion], value, selectionStart);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggestions([]);
        return;
      }
    }
  }, [suggestions, selectedSuggestion, applySuggestion]);

  const handleFormulaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setFormula(newValue);
    const completions = getCompletions(newValue, e.target.selectionStart);
    setSuggestions(completions);
    setSelectedSuggestion(0);
  }, [getCompletions]);

  const insertText = useCallback((text: string, isOperator: boolean = false) => {
    const ta = textareaRef.current;
    const pos = ta ? ta.selectionEnd : -1;
    const endsWithParen = isOperator && text.endsWith('(');
    const insertion = endsWithParen ? text + ')' : text;
    const cursorOffset = endsWithParen ? text.length : insertion.length;

    setFormula(prev => {
      if (ta && pos >= 0) return prev.slice(0, pos) + insertion + prev.slice(pos);
      return prev + insertion;
    });

    requestAnimationFrame(() => {
      if (ta) {
        const newPos = (pos >= 0 ? pos : ta.value.length - insertion.length) + cursorOffset;
        ta.selectionStart = ta.selectionEnd = newPos;
        ta.focus();
      }
    });
  }, [textareaRef]);

  return {
    formula,
    setFormula,
    suggestions,
    selectedSuggestion,
    handleFormulaKeyDown,
    handleFormulaChange,
    applySuggestion,
    insertText,
  };
}

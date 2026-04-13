
/**
 * Formula utility for evaluating mathematical expressions on dataset columns.
 * Supports +, -, *, /, ^, log (base 10), pi, e, and brackets.
 * Column names should be enclosed in square brackets, e.g., [Column Name].
 *
 * Implements a Shunting-yard algorithm to evaluate expressions without using eval() or new Function().
 */

export interface FormulaResult {
  evaluate: (rowValues: number[]) => number;
  usedColumnIndices: number[];
  error?: string;
}

type Token =
  | { type: 'NUMBER', value: number }
  | { type: 'VAR', index: number }
  | { type: 'OP', value: string, prec: number, assoc: 'L' | 'R', unary?: boolean }
  | { type: 'FUNC', value: string }
  | { type: 'CONST', value: number }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' };

export function compileFormula(formula: string, availableColumns: string[]): FormulaResult {
  try {
    const usedColumnIndices: number[] = [];
    const columnMap = new Map<string, number>();

    // 1. Identify and extract column names in brackets
    const columnRegex = /\[([^\]]+)\]/g;
    let match;
    while ((match = columnRegex.exec(formula)) !== null) {
      const fullMatch = match[0];
      const colName = match[1];

      if (!columnMap.has(fullMatch)) {
        let colIndex = availableColumns.indexOf(colName);
        if (colIndex === -1) {
          colIndex = availableColumns.findIndex(c => c.endsWith(`: ${colName}`) || c === colName);
        }

        if (colIndex === -1) {
          return { evaluate: () => NaN, usedColumnIndices: [], error: `Column not found: ${colName}` };
        }
        columnMap.set(fullMatch, usedColumnIndices.length);
        usedColumnIndices.push(colIndex);
      }
    }

    // 2. Tokenize the formula
    const tokens: Token[] = [];
    let i = 0;
    while (i < formula.length) {
      const char = formula[i];
      const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;

      if (/\s/.test(char)) { i++; continue; }

      if (char === '[') {
        const end = formula.indexOf(']', i);
        if (end === -1) throw new Error('Missing closing bracket ]');
        const fullMatch = formula.substring(i, end + 1);
        const varIdx = columnMap.get(fullMatch);
        if (varIdx === undefined) throw new Error(`Unknown column: ${fullMatch}`);
        tokens.push({ type: 'VAR', index: varIdx });
        i = end + 1;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        let numStr = '';
        while (i < formula.length && /[0-9.]/.test(formula[i])) {
          numStr += formula[i++];
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      if (/[a-zA-Z]/.test(char)) {
        let name = '';
        while (i < formula.length && /[a-zA-Z0-9]/.test(formula[i])) {
          name += formula[i++];
        }
        name = name.toLowerCase();
        if (name === 'pi') tokens.push({ type: 'CONST', value: Math.PI });
        else if (name === 'e') tokens.push({ type: 'CONST', value: Math.E });
        else if (name === 'log') tokens.push({ type: 'FUNC', value: 'log' });
        else throw new Error(`Unknown function or constant: ${name}`);
        continue;
      }

      if (char === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
      if (char === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }

      const opMap: Record<string, { prec: number, assoc: 'L' | 'R' }> = {
        '+': { prec: 2, assoc: 'L' },
        '-': { prec: 2, assoc: 'L' },
        '*': { prec: 3, assoc: 'L' },
        '/': { prec: 3, assoc: 'L' },
        '^': { prec: 4, assoc: 'R' }
      };

      if (opMap[char]) {
        // Handle unary minus
        if (char === '-' && (!prevToken || prevToken.type === 'OP' || prevToken.type === 'LPAREN' || prevToken.type === 'FUNC')) {
          tokens.push({ type: 'OP', value: 'u-', prec: 5, assoc: 'R', unary: true });
        } else {
          tokens.push({ type: 'OP', value: char, ...opMap[char] });
        }
        i++;
        continue;
      }

      throw new Error(`Unexpected character: ${char}`);
    }

    // 3. Convert to RPN (Reverse Polish Notation) using Shunting-yard
    const outputQueue: Token[] = [];
    const operatorStack: Token[] = [];

    for (const token of tokens) {
      if (token.type === 'NUMBER' || token.type === 'VAR' || token.type === 'CONST') {
        outputQueue.push(token);
      } else if (token.type === 'FUNC') {
        operatorStack.push(token);
      } else if (token.type === 'OP') {
        while (operatorStack.length > 0) {
          const top = operatorStack[operatorStack.length - 1];
          if (top.type === 'OP' && (
            (token.assoc === 'L' && token.prec <= top.prec) ||
            (token.assoc === 'R' && token.prec < top.prec)
          )) {
            outputQueue.push(operatorStack.pop()!);
          } else {
            break;
          }
        }
        operatorStack.push(token);
      } else if (token.type === 'LPAREN') {
        operatorStack.push(token);
      } else if (token.type === 'RPAREN') {
        while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LPAREN') {
          outputQueue.push(operatorStack.pop()!);
        }
        if (operatorStack.length === 0) throw new Error('Mismatched parentheses');
        operatorStack.pop(); // remove LPAREN
        if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === 'FUNC') {
          outputQueue.push(operatorStack.pop()!);
        }
      }
    }
    while (operatorStack.length > 0) {
      const top = operatorStack.pop()!;
      if (top.type === 'LPAREN') throw new Error('Mismatched parentheses');
      outputQueue.push(top);
    }

    // 4. Create Evaluator (using an optimized RPN interpreter instead of new Function())
    const bytecode: number[] = [];
    for (const token of outputQueue) {
      if (token.type === 'NUMBER') {
        bytecode.push(0, token.value);
      } else if (token.type === 'VAR') {
        bytecode.push(1, token.index);
      } else if (token.type === 'CONST') {
        bytecode.push(2, token.value);
      } else if (token.type === 'FUNC') {
        if (token.value === 'log') bytecode.push(9);
      } else if (token.type === 'OP') {
        if (token.unary) {
          if (token.value === 'u-') bytecode.push(8);
        } else {
          if (token.value === '+') bytecode.push(3);
          else if (token.value === '-') bytecode.push(4);
          else if (token.value === '*') bytecode.push(5);
          else if (token.value === '/') bytecode.push(6);
          else if (token.value === '^') bytecode.push(7);
        }
      }
    }

    const stack = new Float64Array(256);

    return {
      usedColumnIndices,
      evaluate: (rowValues: number[]) => {
        let sp = 0;
        for (let i = 0; i < bytecode.length; ) {
          const op = bytecode[i++];
          switch (op) {
            case 0: // NUMBER
              stack[sp++] = bytecode[i++];
              break;
            case 1: // VAR
              stack[sp++] = rowValues[bytecode[i++]];
              break;
            case 2: // CONST
              stack[sp++] = bytecode[i++];
              break;
            case 3: { // ADD
              const b = stack[--sp];
              const a = stack[--sp];
              stack[sp++] = a + b;
              break;
            }
            case 4: { // SUB
              const b = stack[--sp];
              const a = stack[--sp];
              stack[sp++] = a - b;
              break;
            }
            case 5: { // MUL
              const b = stack[--sp];
              const a = stack[--sp];
              stack[sp++] = a * b;
              break;
            }
            case 6: { // DIV
              const b = stack[--sp];
              const a = stack[--sp];
              stack[sp++] = a / b;
              break;
            }
            case 7: { // POW
              const b = stack[--sp];
              const a = stack[--sp];
              stack[sp++] = Math.pow(a, b);
              break;
            }
            case 8: // NEG
              stack[sp - 1] = -stack[sp - 1];
              break;
            case 9: // LOG
              stack[sp - 1] = Math.log10(stack[sp - 1]);
              break;
          }
        }
        return stack[0];
      }
    };
  } catch (err) {
    return { evaluate: () => NaN, usedColumnIndices: [], error: err instanceof Error ? err.message : String(err) };
  }
}

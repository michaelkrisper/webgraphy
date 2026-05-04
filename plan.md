1. **Analyze `CalculatedColumnModal.tsx`**: The file is quite large (442 lines) and mixes state management, formula logic, and UI layout.
2. **Refactoring Strategy**:
    *   Change the file structure so that `CalculatedColumnModal` uses the `Modal` component from `src/components/Layout/Modal.tsx` instead of recreating the modal overlay and header/footer manually. This is a simple but highly effective way to reduce code and complexity, maintaining consistency with other modals (like `HelpModal`, `ImprintModal`, `LicenseModal`).
    *   Extract the core formula editing logic (autocomplete, bracket pairing, suggestions) into a separate hook: `useFormulaEditor`.
    *   *(Optional)* Extract the shortcut buttons into a separate component, `ShortcutList` or similar. Let's see if we can do this within the same directory.
3. **Execution Steps**:
    *   Create a new file `src/hooks/useFormulaEditor.ts` to hold the extracted formula state and logic.
    *   Update `src/components/Layout/CalculatedColumnModal.tsx` to use the `useFormulaEditor` hook and the `Modal` component.
    *   Run tests and linting to ensure no regressions.
4. **Pre-commit**: Run the required pre-commit steps.
5. **Submit**: Create PR.

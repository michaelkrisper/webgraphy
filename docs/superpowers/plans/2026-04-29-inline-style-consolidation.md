# Inline Style Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 233 inline `style={}` occurrences with CSS classes backed by expanded CSS custom properties, while simplifying redundant values.

**Architecture:** Expand `useTheme.ts` to write all theme tokens as CSS variables; add global button reset to `index.css`; create `src/components/components.css` (imported in `main.tsx`) with one section per component; update each TSX to use `className` instead of `style={}`, keeping only truly dynamic values inline.

**Tech Stack:** React, TypeScript, plain CSS (no modules), Vite

---

## File Map

| Action | File |
|---|---|
| Modify | `src/hooks/useTheme.ts` — add ~22 `setProperty` calls |
| Modify | `src/index.css` — add global button reset |
| Create | `src/components/components.css` — all component CSS classes |
| Modify | `src/main.tsx` — import `components.css` |
| Modify | `src/components/Layout/Modal.tsx` |
| Modify | `src/components/Layout/CalculatedColumnModal.tsx` |
| Modify | `src/components/Layout/HelpModal.tsx` |
| Modify | `src/components/Layout/LicenseModal.tsx` |
| Modify | `src/components/Layout/ImprintModal.tsx` |
| Modify | `src/components/ErrorBoundary.tsx` |
| Modify | `src/components/Layout/CollapsedMenuButton.tsx` |
| Modify | `src/components/Sidebar/ColorPicker.tsx` |
| Modify | `src/components/Sidebar/SeriesConfig.tsx` |
| Modify | `src/components/Layout/DataViewModal.tsx` |
| Modify | `src/components/Plot/ChartLegend.tsx` |
| Modify | `src/components/Layout/ImportSettingsDialog.tsx` |
| Modify | `src/components/Plot/ChartContainer.tsx` |
| Modify | `src/components/Layout/Sidebar.tsx` |

---

## Task 1: Foundation — CSS variables, button reset, new CSS file

**Files:**
- Modify: `src/hooks/useTheme.ts`
- Modify: `src/index.css`
- Create: `src/components/components.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Expand CSS variables in `useTheme.ts`**

In `applyTheme`, after the existing 6 `setProperty` calls (line 51), add:

```typescript
  s.setProperty('--bg', theme.bg);
  s.setProperty('--bg2', theme.bg2);
  s.setProperty('--bg3', theme.bg3);
  s.setProperty('--border2', theme.border2);
  s.setProperty('--accent', theme.accent);
  s.setProperty('--danger', theme.danger);
  s.setProperty('--shadow', theme.shadow);
  s.setProperty('--text-mid', theme.textMid);
  s.setProperty('--text-light', theme.textLight);
  s.setProperty('--select-bg', theme.selectBg);
  s.setProperty('--select-color', theme.selectColor);
  s.setProperty('--btn-border', theme.btnBorder);
  s.setProperty('--btn-color', theme.btnColor);
  s.setProperty('--card-border', theme.cardBorder);
  s.setProperty('--section-header-bg', theme.sectionHeaderBg);
  s.setProperty('--axis-color', theme.axisColor);
  s.setProperty('--tooltip-bg', theme.tooltipBg);
  s.setProperty('--tooltip-color', theme.tooltipColor);
  s.setProperty('--tooltip-border', theme.tooltipBorder);
  s.setProperty('--snap-line-color', theme.snapLineColor);
  s.setProperty('--tooltip-divider-color', theme.tooltipDividerColor);
  s.setProperty('--tooltip-sub-color', theme.tooltipSubColor);
  s.setProperty('--no-data-color', theme.noDataColor);
```

- [ ] **Step 2: Add global button reset to `src/index.css`**

Append at the end of the file:

```css
button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font: inherit;
  color: inherit;
}
```

- [ ] **Step 3: Create `src/components/components.css`**

```css
/* Component CSS — one section per component. Do not put theme definitions here. */
```

- [ ] **Step 4: Import `components.css` in `src/main.tsx`**

Add after the existing `import './index.css'` line:

```typescript
import './components/components.css'
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTheme.ts src/index.css src/components/components.css src/main.tsx
git commit -m "feat: expose all theme tokens as CSS variables, add button reset"
```

---

## Task 2: Modal.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Layout/Modal.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── Modal ─────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}
.modal-card {
  background: var(--bg);
  position: relative;
  box-shadow: 0 4px 20px var(--shadow);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.modal-title {
  margin: 0;
  font-size: 1.2rem;
}
.modal-close {
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--touch-target-size);
  min-height: var(--touch-target-size);
}
.modal-body { flex: 1; }
.modal-footer { margin-top: 20px; flex-shrink: 0; }
```

- [ ] **Step 2: Rewrite `Modal.tsx` JSX**

Replace the return statement with:

```tsx
  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ padding, borderRadius, maxWidth, width, height, maxHeight }}>
        <div className="modal-header">
          {typeof title === 'string' ? (
            <h2 className="modal-title">{title}</h2>
          ) : (
            title
          )}
          <button onClick={onClose} aria-label={ariaLabel || "Close dialog"} className="modal-close">
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Layout/Modal.tsx
git commit -m "refactor: Modal — inline styles → CSS classes"
```

---

## Task 3: CalculatedColumnModal.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Layout/CalculatedColumnModal.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── CalculatedColumnModal ─────────────────────────── */
.calc-modal-card {
  background: var(--bg);
  padding: 20px;
  border-radius: 8px;
  max-width: 500px;
  width: 95%;
  box-shadow: 0 4px 20px var(--shadow);
}
.calc-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.calc-modal-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.calc-field { margin-bottom: 16px; }
.calc-label {
  display: block;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 6px;
}
.calc-input {
  width: 100%;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  font-size: 14px;
  background: var(--bg);
  color: var(--text-color);
}
.calc-formula-wrapper { position: relative; margin-bottom: 16px; }
.calc-formula-msg { font-size: 11px; margin-top: 2px; }
.calc-formula-msg--error { color: var(--danger); }
.calc-formula-msg--ok { color: #22c55e; }
.calc-suggestions {
  position: absolute;
  left: 8px;
  right: 8px;
  top: 100%;
  margin-top: 2px;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  z-index: 100;
  overflow: hidden;
}
.calc-suggestion-item {
  padding: 6px 10px;
  font-size: 13px;
  font-family: monospace;
  cursor: pointer;
}
.calc-col-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 100px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.calc-col-btn {
  font-size: 11px;
  padding: 4px 8px;
  background: var(--bg2);
  border: 1px solid var(--btn-border);
  border-radius: 4px;
}
.calc-shortcuts { margin-bottom: 20px; }
.calc-shortcuts-label {
  font-size: 12px;
  font-weight: bold;
  color: var(--text-muted-color);
  margin-bottom: 8px;
}
.calc-shortcut-group { margin-bottom: 8px; }
.calc-shortcut-group-label {
  font-size: 10px;
  color: var(--text-light);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}
.calc-shortcut-btns { display: flex; flex-wrap: wrap; gap: 4px; }
.calc-shortcut-btn {
  font-size: 12px;
  padding: 4px 10px;
  background: var(--bg2);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-weight: bold;
}
.calc-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--danger);
  font-size: 14px;
  margin-bottom: 16px;
  padding: 8px;
  background: #fef2f2;
  border-radius: 4px;
}
.calc-actions { display: flex; justify-content: flex-end; gap: 12px; }
.calc-btn-cancel {
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg);
}
.calc-btn-submit {
  padding: 8px 16px;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}
.calc-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: calc-spin 1s linear infinite;
}
@keyframes calc-spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 2: Rewrite `CalculatedColumnModal.tsx` JSX**

Replace the return statement. The overlay reuses `.modal-overlay` from Task 2. Inline stays only for formula textarea border (3-way validity) and disabled-state `opacity`/`cursor`:

```tsx
  return (
    <div className="modal-overlay">
      <div className="calc-modal-card">
        <div className="calc-modal-header">
          <div className="calc-modal-title-row">
            <Calculator size={20} color="var(--accent)" />
            <h2 className="modal-title">Add Calculated Series</h2>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Close">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="calc-field">
            <label htmlFor="col-name" className="calc-label">Column Name</label>
            <input
              id="col-name"
              className="calc-input"
              value={columnName}
              onChange={e => setColumnName(e.target.value)}
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
              onChange={e => setFormula(e.target.value)}
              onKeyDown={handleFormulaKeyDown}
              placeholder="e.g. [Temperature] * -1 + 273.15"
              style={{
                width: '100%', height: '80px', padding: '8px', borderRadius: '4px',
                border: `1px solid ${validationMsg ? '#ef4444' : formula.trim() && !validationMsg ? '#22c55e' : 'var(--border-color)'}`,
                fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', transition: 'border-color 0.2s'
              }}
            />
            {validationMsg && <div className="calc-formula-msg calc-formula-msg--error">{validationMsg}</div>}
            {!validationMsg && formula.trim() && <div className="calc-formula-msg calc-formula-msg--ok">✓ Valid formula</div>}
            {suggestions.length > 0 && (
              <div className="calc-suggestions">
                {suggestions.map((s, i) => (
                  <div
                    key={s}
                    onMouseDown={() => { applySuggestion(s); }}
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
                <button key={col} type="button" onClick={() => insertColumn(col)} className="calc-col-btn">
                  {col.includes(': ') ? col.split(': ')[1] : col}
                </button>
              ))}
            </div>
          </div>

          <div className="calc-shortcuts">
            <div className="calc-shortcuts-label">Shortcuts</div>
            {[
              {
                label: 'Arithmetic',
                items: [
                  { label: '+', insert: ' + ', title: 'Add' },
                  { label: '−', insert: ' - ', title: 'Subtract' },
                  { label: '×', insert: ' * ', title: 'Multiply' },
                  { label: '÷', insert: ' / ', title: 'Divide' },
                  { label: '^', insert: ' ^ ', title: 'Power' },
                  { label: '%', insert: ' % ', title: 'Modulo' },
                ],
              },
              {
                label: 'Math Functions',
                items: [
                  { label: 'abs()', insert: 'abs(', title: 'Absolute value' },
                  { label: 'sqrt()', insert: 'sqrt(', title: 'Square root' },
                  { label: 'log()', insert: 'log(', title: 'Natural log' },
                  { label: 'exp()', insert: 'exp(', title: 'Exponential' },
                  { label: 'sin()', insert: 'sin(', title: 'Sine (radians)' },
                  { label: 'cos()', insert: 'cos(', title: 'Cosine (radians)' },
                  { label: 'round()', insert: 'round(', title: 'Round to nearest integer' },
                  { label: 'floor()', insert: 'floor(', title: 'Floor' },
                  { label: 'ceil()', insert: 'ceil(', title: 'Ceil' },
                  { label: 'min()', insert: 'min(', title: 'Minimum of two values' },
                  { label: 'max()', insert: 'max(', title: 'Maximum of two values' },
                  { label: 'clamp()', insert: 'clamp(', title: 'Clamp(value, min, max)' },
                ],
              },
              {
                label: 'Smoothing / Regression',
                items: [
                  { label: 'avgN()', insert: 'avgN(', title: 'Moving average over N points: avgN([col], N)' },
                  { label: 'avgTime()', insert: 'avgTime(', title: 'Time-window average: avgTime([col], seconds)' },
                  { label: 'avgGroup()', insert: 'avgGroup(', title: 'Group average: avgGroup([col], [groupCol])' },
                  { label: 'filter()', insert: 'filter(', title: 'Kalman filter: filter([col])' },
                  { label: 'linreg()', insert: 'linreg(', title: 'Linear regression fit: linreg([x], [y])' },
                  { label: 'polyreg()', insert: 'polyreg(', title: 'Polynomial regression: polyreg([x], [y], degree)' },
                  { label: 'expreg()', insert: 'expreg(', title: 'Exponential regression: expreg([x], [y])' },
                  { label: 'logreg()', insert: 'logreg(', title: 'Logarithmic regression: logreg([x], [y])' },
                  { label: 'kde()', insert: 'kde(', title: 'Kernel density estimate: kde([col], bandwidth)' },
                ],
              },
            ].map(group => (
              <div key={group.label} className="calc-shortcut-group">
                <div className="calc-shortcut-group-label">{group.label}</div>
                <div className="calc-shortcut-btns">
                  {group.items.map(item => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => insertOperator(item.insert)}
                      title={item.title}
                      className="calc-shortcut-btn"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="calc-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="calc-actions">
            <button type="button" onClick={onClose} disabled={isCalculating} className="calc-btn-cancel"
              style={{ cursor: isCalculating ? 'not-allowed' : 'pointer', opacity: isCalculating ? 0.6 : 1 }}>
              Cancel
            </button>
            <button type="submit" disabled={isCalculating} className="calc-btn-submit"
              style={{ cursor: isCalculating ? 'not-allowed' : 'pointer', opacity: isCalculating ? 0.8 : 1 }}>
              {isCalculating ? (
                <><div className="calc-spinner" /><span>Calculating...</span></>
              ) : (
                <><Check size={16} /><span>Add Column</span></>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
```

Note: the shortcut group data above must match the existing data in the file exactly — copy from the original if the items differ.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Layout/CalculatedColumnModal.tsx
git commit -m "refactor: CalculatedColumnModal — inline styles → CSS classes"
```

---

## Task 4: HelpModal, LicenseModal, ImprintModal

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Layout/HelpModal.tsx`
- Modify: `src/components/Layout/LicenseModal.tsx`
- Modify: `src/components/Layout/ImprintModal.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── HelpModal ──────────────────────────────────────── */
.help-section {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 0 24px;
  margin-bottom: 20px;
}
.help-section-divider {
  grid-column: 1 / -1;
  border-top: 1px solid var(--border-color);
  margin: 0 20px 16px;
}
.help-section-title { font-size: 1em; font-weight: 600; padding-top: 2px; }
.help-section-list { margin: 0; padding-left: 18px; line-height: 1.6; }

/* ── LicenseModal ───────────────────────────────────── */
.license-text {
  font-size: 0.9rem;
  line-height: 1.6;
  white-space: pre-wrap;
  font-family: monospace;
  background: var(--bg2);
  padding: 15px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}
.license-note { font-size: 0.85em; color: var(--text-muted-color); margin-top: 20px; line-height: 1.5; }

/* ── ImprintModal ───────────────────────────────────── */
.imprint-text { line-height: 1.6; }
.imprint-link { color: var(--accent); }
.imprint-note { font-size: 0.85em; color: var(--text-muted-color); margin-top: 30px; line-height: 1.5; }
```

- [ ] **Step 2: Update `HelpModal.tsx`**

The `Section` component currently uses 4 inline styles. Replace with classes:

```tsx
const Section: React.FC<{ title: string; children: React.ReactNode; first?: boolean }> = ({ title, children, first }) => (
  <div className="help-section">
    {!first && <div className="help-section-divider" />}
    <div className="help-section-title">{title}</div>
    <ul className="help-section-list">
      {children}
    </ul>
  </div>
);
```

- [ ] **Step 3: Update `LicenseModal.tsx`**

Replace:
- `style={{ fontSize: '0.9rem', lineHeight: '1.6', ... }}` on the license text div → `className="license-text"`
- `style={{ fontSize: '0.85em', color: '#666', ... }}` on the note `<p>` → `className="license-note"`

- [ ] **Step 4: Update `ImprintModal.tsx`**

Replace:
- `style={{ lineHeight: '1.6', color: '#444' }}` on first `<p>` → `className="imprint-text"`
- `style={{ color: '#007bff' }}` on `<a>` → `className="imprint-link"`
- `style={{ fontSize: '0.85em', color: '#666', marginTop: '30px', lineHeight: '1.5' }}` on second `<p>` → `className="imprint-note"`

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/components.css src/components/Layout/HelpModal.tsx src/components/Layout/LicenseModal.tsx src/components/Layout/ImprintModal.tsx
git commit -m "refactor: HelpModal/LicenseModal/ImprintModal — inline styles → CSS classes"
```

---

## Task 5: ErrorBoundary.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── ErrorBoundary ──────────────────────────────────── */
.error-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
}
.error-page h1 { color: var(--danger); margin-bottom: 20px; }
.error-page > p { color: var(--text-muted-color); margin-bottom: 10px; }
.error-page pre {
  background: var(--bg2);
  padding: 10px;
  border-radius: 4px;
  overflow: auto;
  max-width: 100%;
  margin-bottom: 20px;
  text-align: left;
  font-size: 12px;
}
.error-page-reset {
  padding: 10px 20px;
  background: var(--accent);
  color: #fff;
  border-radius: 4px;
}
.error-component {
  padding: 20px;
  border: 1px solid var(--danger);
  border-radius: 4px;
  color: var(--danger);
}
.error-component-reset {
  padding: 8px 16px;
  background: var(--danger);
  color: #fff;
  border-radius: 4px;
  margin-top: 8px;
}
```

- [ ] **Step 2: Update `ErrorBoundary.tsx`**

For the app-level error render (the `<div>` containing `<h1>Application Error</h1>`):
- Outer div: `className="error-page"` (remove all inline styles)
- `<h1>`: remove `style` (`.error-page h1` targets it)
- `<p>` (message): remove `style`
- `<pre>`: remove `style`
- Reset button: `className="error-page-reset"` (remove inline style)

For the component-level error render (the `<div>` containing `<h3>Rendering failed</h3>`):
- Outer div: `className="error-component"` (remove inline style)
- `<h3>`: remove `style={{ marginTop: 0 }}` (no browser default top margin on h3 inside this div)
- `<p>`: remove `style`
- Reset button: `className="error-component-reset"` (remove inline style)

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/ErrorBoundary.tsx
git commit -m "refactor: ErrorBoundary — inline styles → CSS classes"
```

---

## Task 6: CollapsedMenuButton.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Layout/CollapsedMenuButton.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── CollapsedMenuButton ────────────────────────────── */
.collapsed-menu-btn {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2000;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
}
.collapsed-menu-btn img { width: 22px; height: 22px; }
```

- [ ] **Step 2: Update `CollapsedMenuButton.tsx`**

Replace both `style={}` occurrences:
- Button element: `className="collapsed-menu-btn"` (remove `style`)
- `<img>`: remove `style={{ width: 22, height: 22 }}` (covered by `.collapsed-menu-btn img`)

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Layout/CollapsedMenuButton.tsx
git commit -m "refactor: CollapsedMenuButton — inline styles → CSS classes"
```

---

## Task 7: ColorPicker.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Sidebar/ColorPicker.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── ColorPicker ────────────────────────────────────── */
.color-picker-wrapper {
  position: relative;
  width: var(--touch-target-size);
  height: var(--touch-target-size);
  flex-shrink: 0;
}
.color-picker-btn {
  width: 100%;
  height: 100%;
  border-right: 1px solid var(--border2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.color-picker-swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
}
.color-picker-popover {
  position: absolute;
  z-index: 10001;
  background: var(--bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px var(--shadow);
  padding: 8px;
  width: 120px;
}
.color-picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}
.color-picker-palette-btn {
  width: 20px;
  height: 20px;
  border-radius: 2px;
}
.color-picker-custom-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px;
  font-size: 0.75rem;
  background: var(--bg2);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.color-picker-native-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
```

- [ ] **Step 2: Update `ColorPicker.tsx`**

```tsx
  return (
    <div ref={containerRef} className="color-picker-wrapper">
      <button
        onClick={toggleOpen}
        title="Select Color"
        aria-label={ariaLabel || "Select Color"}
        className="color-picker-btn"
        style={{ backgroundColor: color }}
      >
        <div className="color-picker-swatch" />
      </button>

      {isOpen && createPortal(
        <div
          id="color-picker-popover"
          className="color-picker-popover"
          style={{ top: popoverCoords.top + 4, left: popoverCoords.left }}
        >
          <div className="color-picker-grid">
            {COLOR_PALETTE.map((paletteColor) => (
              <button
                key={paletteColor}
                onClick={() => handleSelectTemplate(paletteColor)}
                className="color-picker-palette-btn"
                style={{
                  backgroundColor: paletteColor,
                  border: color === paletteColor ? `2px solid var(--text-color)` : `1px solid var(--border-color)`
                }}
                title={paletteColor}
              />
            ))}
          </div>
          <button onClick={triggerNativePicker} className="color-picker-custom-btn">
            <Palette size={12} />
            <span>Custom</span>
          </button>
        </div>,
        document.body
      )}

      <input
        ref={nativePickerRef}
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="color-picker-native-input"
      />
    </div>
  );
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Sidebar/ColorPicker.tsx
git commit -m "refactor: ColorPicker — inline styles → CSS classes"
```

---

## Task 8: SeriesConfig.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Sidebar/SeriesConfig.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── SeriesConfig ───────────────────────────────────── */
.sc-row {
  border: 1px solid var(--border2);
  border-radius: 3px;
  margin-bottom: 3px;
  font-size: var(--mobile-font-size);
  display: grid;
  grid-template-columns: var(--touch-target-size) var(--touch-target-size) repeat(6, var(--touch-target-size)) 100px 1fr var(--touch-target-size);
  align-items: center;
  overflow: hidden;
}
.sc-row--hidden { opacity: 0.5; }
.sc-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-target-size);
  height: var(--touch-target-size);
  flex-shrink: 0;
  background: var(--bg2);
  border-right: 1px solid var(--border2);
  font-size: var(--mobile-font-size);
  color: var(--text-muted-color);
}
.sc-btn--plain { background: none; }
.sc-reorder {
  display: flex;
  flex-direction: column;
  background: var(--bg3);
  border-right: 1px solid var(--border2);
  height: var(--touch-target-size);
}
.sc-reorder-half {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-target-size);
  height: 50%;
  background: none;
}
.sc-reorder-half--top { border-bottom: 1px solid var(--border2); }
.sc-cell-placeholder {
  border-right: 1px solid var(--border2);
  width: var(--touch-target-size);
  height: var(--touch-target-size);
}
.sc-select {
  width: 100px;
  font-size: var(--mobile-font-size);
  padding: 2px;
  height: var(--touch-target-size);
  min-width: 0;
  flex-shrink: 1;
  border: none;
  border-right: 1px solid var(--border2);
  color: var(--text-muted-color);
  background: var(--bg2);
}
.sc-title-cell {
  min-width: 40px;
  display: flex;
  align-items: center;
  overflow: hidden;
  border-right: 1px solid var(--border2);
  height: var(--touch-target-size);
  padding-left: 4px;
}
.sc-title-input {
  width: 100%;
  font-size: var(--mobile-font-size);
  padding: 2px 4px;
  height: 100%;
  background: var(--bg2);
  border: none;
  outline: none;
  color: var(--text-muted-color);
}
.sc-title-span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: bold;
  font-size: var(--mobile-font-size);
  cursor: text;
  width: 100%;
}
.sc-line-icon { display: block; }
```

- [ ] **Step 2: Update `SeriesConfig.tsx`**

Remove the `btnBase`, `sep`, `bg`, `bg2`, `border`, `color` variables. Replace all inline `style={}` usage:

```tsx
  return (
    <div className={`sc-row${series.hidden ? ' sc-row--hidden' : ''}`}>

      {/* Visibility */}
      <button
        onClick={toggleVisibility}
        className={`sc-btn sc-btn--plain`}
        style={{ color: series.hidden ? '#94a3b8' : 'var(--accent)' }}
        title={series.hidden ? "Show Series" : "Hide Series"}
      >
        {series.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>

      {/* Reorder */}
      <div className="sc-reorder">
        <button
          onClick={() => !isFirst && onMove?.(-1)}
          disabled={isFirst}
          className="sc-reorder-half sc-reorder-half--top"
          style={{ opacity: isFirst ? 0.3 : 1, cursor: isFirst ? 'default' : 'pointer' }}
          title="Move Up" aria-label="Move Up"
        >
          <ChevronUp size={10} />
        </button>
        <button
          onClick={() => !isLast && onMove?.(1)}
          disabled={isLast}
          className="sc-reorder-half"
          style={{ opacity: isLast ? 0.3 : 1, cursor: isLast ? 'default' : 'pointer' }}
          title="Move Down" aria-label="Move Down"
        >
          <ChevronDown size={10} />
        </button>
      </div>

      {/* Y-Axis cycle */}
      <button onClick={cycleYAxis} className="sc-btn" style={{ fontWeight: 'bold' }}
        title="Cycle Y-Axis (1-9)" aria-label="Cycle Y-Axis">
        {currentYAxisIndex}
      </button>

      {/* Y-Axis side */}
      {currentYAxis ? (
        <button
          onClick={() => updateYAxis(currentYAxis.id, { position: currentYAxis.position === 'left' ? 'right' : 'left' })}
          className="sc-btn"
          title={currentYAxis.position === 'left' ? "Left Axis" : "Right Axis"}
          aria-label="Toggle Axis Side"
        >
          {currentYAxis.position === 'left' ? 'L' : 'R'}
        </button>
      ) : <div className="sc-cell-placeholder" />}

      {/* Grid toggle */}
      {currentYAxis ? (
        <button
          onClick={() => updateYAxis(currentYAxis.id, { showGrid: !currentYAxis.showGrid })}
          className={`sc-btn${currentYAxis.showGrid ? '' : ' sc-btn--plain'}`}
          title="Toggle Grid" aria-label="Toggle Grid"
        >
          <Rows size={12} />
        </button>
      ) : <div className="sc-cell-placeholder" />}

      {/* Line style */}
      <button
        onClick={() => {
          const styles = ['solid', 'dashed', 'dotted', 'none'] as const;
          const next = styles[(styles.indexOf(series.lineStyle) + 1) % styles.length];
          handleUpdate({ lineStyle: next });
        }}
        className="sc-btn"
        title={`Line Style: ${series.lineStyle}`} aria-label="Cycle Line Style"
      >
        {renderLineStyleIcon()}
      </button>

      {/* Point style */}
      <button
        onClick={() => {
          const styles = ['none', 'circle', 'square', 'cross'] as const;
          const next = styles[(styles.indexOf(series.pointStyle ?? 'none') + 1) % styles.length];
          handleUpdate({ pointStyle: next, pointColor: series.lineColor });
        }}
        className="sc-btn"
        title="Point Style" aria-label="Cycle Point Style"
      >
        {renderPointStyleIcon()}
      </button>

      {/* Color picker */}
      <ColorPicker color={series.lineColor} onChange={(c) => handleUpdate({ lineColor: c, pointColor: c })} themeName={themeName} ariaLabel="Series Color" />

      {/* Y Column select */}
      <select
        value={series.yColumn}
        onChange={(e) => handleUpdate({ yColumn: e.target.value })}
        className="sc-select"
        title="Y Column"
      >
        {dataset?.columns.map(col => (
          <option key={col} value={col}>{col.includes(': ') ? col.split(': ')[1] : col}</option>
        ))}
      </select>

      {/* Editable title */}
      <div className="sc-title-cell">
        {isEditingTitle ? (
          <input
            autoFocus
            value={series.name ?? series.yColumn}
            onChange={e => handleUpdate({ name: e.target.value })}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={e => { if (e.key === 'Enter') setIsEditingTitle(false); }}
            className="sc-title-input"
          />
        ) : (
          <span
            onClick={() => setIsEditingTitle(true)}
            className="sc-title-span"
            style={{ color: series.lineColor }}
            title="Click to rename"
          >
            {series.name || series.yColumn}
          </span>
        )}
      </div>

      {/* Delete */}
      <button onClick={() => removeSeries(series.id)} className="sc-btn sc-btn--plain"
        style={{ color: 'var(--danger)', borderRight: 'none' }}
        title="Delete" aria-label="Delete Series">
        <Trash2 size={16} />
      </button>
    </div>
  );
```

Also update `renderLineStyleIcon` to use `className` instead of `style`:

```tsx
  const renderLineStyleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" className="sc-line-icon">
      {/* keep existing SVG children unchanged */}
    </svg>
  );
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors. Fix any type errors if column access differs.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Sidebar/SeriesConfig.tsx
git commit -m "refactor: SeriesConfig — inline styles → CSS classes, remove btnBase variable"
```

---

## Task 9: DataViewModal.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Layout/DataViewModal.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── DataViewModal ──────────────────────────────────── */
.dv-meta { margin-bottom: 12px; font-size: 0.9rem; color: var(--text-muted-color); }
.dv-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
}
.dv-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dv-thead tr { background: var(--bg2); border-bottom: 2px solid var(--border-color); }
.dv-th {
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  text-align: left;
  white-space: nowrap;
  color: var(--text-mid);
}
.dv-tr-even { background: var(--bg); }
.dv-tr-odd  { background: var(--bg2); }
.dv-td {
  border: 1px solid var(--border-color);
  padding: 4px 8px;
}
.dv-footer { display: flex; justify-content: flex-end; }
.dv-close-btn {
  padding: 8px 24px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg);
  font-weight: bold;
  min-height: 36px;
  font-size: 0.9rem;
}
```

- [ ] **Step 2: Update `DataViewModal.tsx`**

Replace all inline `style={}` with the new classes:
- Meta info `<div>` → `className="dv-meta"`
- Table wrap `<div>` → `className="dv-table-wrap"`
- `<table>` → `className="dv-table"`
- `<thead><tr>` → `className` on `<tr>` (use `.dv-thead` + put style on `thead` selector, or add class to tr: `className="dv-thead-tr"`)
- `<th>` → `className="dv-th"`
- Alternating `<tr>` in tbody → `className={rowIndex % 2 === 0 ? 'dv-tr-even' : 'dv-tr-odd'}`
- `<td>` → `className="dv-td"`
- Footer `<div>` → `className="dv-footer"`
- Close button → `className="dv-close-btn"`

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Layout/DataViewModal.tsx
git commit -m "refactor: DataViewModal — inline styles → CSS classes"
```

---

## Task 10: ChartLegend.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Plot/ChartLegend.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

From the grep results, the 4 inline styles are:
1. Container `<div>` — `position: absolute`, draggable position (top/left from state), z-index, background, border, etc.
2. Each legend item `<div>` — flex, padding, cursor, etc.
3. Line preview `<svg>` — `flexShrink: 0`
4. Series name `<span>` — overflow, text-decoration

```css
/* ── ChartLegend ────────────────────────────────────── */
.legend-container {
  position: absolute;
  z-index: 10;
  background: var(--tooltip-bg);
  border: 1px solid var(--tooltip-border);
  border-radius: 4px;
  padding: 4px 0;
  font-size: 11px;
  max-width: 200px;
  box-shadow: 0 2px 8px var(--shadow);
  cursor: move;
  user-select: none;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  cursor: pointer;
}
.legend-item:hover { background: var(--bg2); }
.legend-line-icon { flex-shrink: 0; }
.legend-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legend-label--hidden { text-decoration: line-through; }
```

- [ ] **Step 3: Update `ChartLegend.tsx`**

- Container `<div>`: `className="legend-container"` + keep `style={{ left: position.x, top: position.y }}` (computed drag position)
- Each item `<div>`: `className="legend-item"`
- `<svg>`: `className="legend-line-icon"` (remove `style={{ flexShrink: 0 }}`)
- `<span>`: `className={`legend-label${s.hidden ? ' legend-label--hidden' : ''}`}` (remove inline style)

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/components.css src/components/Plot/ChartLegend.tsx
git commit -m "refactor: ChartLegend — inline styles → CSS classes"
```

---

## Task 11: ImportSettingsDialog.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Layout/ImportSettingsDialog.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── ImportSettingsDialog ───────────────────────────── */
.isd-body { padding: 20px; background: var(--bg); }
.isd-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.isd-section-title {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.isd-general-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 20px;
  margin-bottom: 30px;
  padding: 20px;
  background: var(--bg2);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}
.isd-field-group-sm { flex: 1 1 100px; }
.isd-field-group-md { flex: 1 1 150px; }
.isd-field-group-lg { flex: 2 1 200px; }
.isd-field-label {
  display: block;
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 8px;
  color: var(--text-mid);
}
.isd-field-label-row { display: flex; align-items: center; gap: 4px; }
.isd-select, .isd-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg);
  color: var(--text-color);
  height: 40px;
  font-size: 14px;
}
.isd-table-wrap {
  position: relative;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.isd-table-scroll { overflow-x: auto; max-height: 500px; }
.isd-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.isd-col-header {
  position: sticky;
  top: 0;
  background: var(--bg2);
  padding: 8px;
  border-bottom: 2px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  vertical-align: top;
  min-width: 80px;
}
.isd-col-name-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.isd-col-name-input {
  flex: 1;
  font-weight: bold;
  font-size: 12px;
  padding: 2px 4px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg);
  color: var(--text-color);
}
.isd-type-btns { display: flex; gap: 2px; }
.isd-type-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  border-radius: 3px;
  font-size: 11px;
  border: 1px solid var(--border-color);
}
.isd-type-btn--active { background: var(--accent); color: #fff; border-color: var(--accent); }
.isd-type-btn--inactive { background: var(--bg); color: var(--text-muted-color); }
.isd-date-input {
  width: 100%;
  font-size: 11px;
  padding: 4px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text-color);
  margin-top: 4px;
}
.isd-data-row-even { background: var(--bg); }
.isd-data-row-odd  { background: var(--bg2); }
.isd-td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
}
.isd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg2);
}
.isd-btn-cancel {
  padding: 10px 24px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg);
  font-size: 0.9rem;
  font-weight: 600;
}
.isd-btn-confirm {
  padding: 10px 24px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: bold;
  box-shadow: 0 2px 4px var(--shadow);
}
.isd-title-row { display: flex; align-items: center; gap: 10px; }
```

- [ ] **Step 2: Update `ImportSettingsDialog.tsx`**

Replace all 35 inline `style={}` occurrences using the classes above. Key mappings:

- Modal `title` prop JSX: wrap with `className="isd-title-row"`, `<h2 className="modal-title">`
- Modal `footer` prop JSX: `className="isd-footer"`, cancel → `.isd-btn-cancel`, confirm → `.isd-btn-confirm`
- Body `<div>`: `className="isd-body"`
- General settings header: `className="isd-section-header"`, `<h3 className="isd-section-title">`
- Fields row: `className="isd-general-fields"`
- `flex: '1 1 100px'` groups → `className="isd-field-group-sm"`, `"isd-field-group-md"`, `"isd-field-group-lg"`
- `<label>`: `className="isd-field-label"`, label-with-icon: `className="isd-field-label-row"`
- `<select>`: `className="isd-select"`, `<input>`: `className="isd-input"`
- Column config header: `className="isd-section-header"`, `<h3 className="isd-section-title">`
- Table wrap: `className="isd-table-wrap"`, scroll div: `className="isd-table-scroll"`, `<table>`: `className="isd-table"`
- `<th>`: `className="isd-col-header"` (no inline needed — sticky/bg covered)
- Col name row div: `className="isd-col-name-row"`, name input: `className="isd-col-name-input"`
- Type buttons row: `className="isd-type-btns"`, each button: `className={config.type === opt.type ? 'isd-type-btn isd-type-btn--active' : 'isd-type-btn isd-type-btn--inactive'}`
- Date format input: `className="isd-date-input"`
- Alternating tbody rows: `className={rowIndex % 2 === 0 ? 'isd-data-row-even' : 'isd-data-row-odd'}`
- `<td>`: `className="isd-td"` (keep `borderRight: 'none'` inline on last column)

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Layout/ImportSettingsDialog.tsx
git commit -m "refactor: ImportSettingsDialog — inline styles → CSS classes"
```

---

## Task 12: ChartContainer.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Plot/ChartContainer.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── ChartContainer ─────────────────────────────────── */
.chart-abs-fill {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.chart-webgl-layer { position: absolute; inset: 0; z-index: 1; }
.chart-no-data {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: none;
  color: var(--no-data-color);
  font-size: 2rem;
  font-weight: bold;
  text-transform: uppercase;
}
.chart-tooltip {
  position: absolute;
  font-size: 11px;
  background: var(--tooltip-bg);
  border: 1px solid var(--tooltip-border);
  border-radius: 4px;
  padding: 6px 8px;
  pointer-events: none;
  z-index: 20;
  max-width: 300px;
  color: var(--tooltip-color);
}
.chart-tooltip-x-label { font-weight: bold; font-size: 10px; }
.chart-tooltip-value { font-weight: bold; }
.chart-tooltip-item { display: flex; justify-content: space-between; gap: 12px; }
.chart-fit-btns { position: absolute; z-index: 25; display: flex; gap: 4px; }
.chart-fit-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--tooltip-bg);
  border: 1px solid var(--tooltip-border);
  border-radius: 4px;
}
```

- [ ] **Step 2: Update `ChartContainer.tsx` — layer SVGs and divs**

The following `style={}` occurrences can use classes. Keep inline only the values that depend on JS computation (pixel positions, dynamic cursor, zIndex that varies, `borderLeft` conditional):

| Element | Old inline | New |
|---|---|---|
| `<GridLines>` SVG | `position:absolute,inset:0,pointerEvents:none,zIndex:0` | `className="chart-abs-fill"` + `zIndex={0}` stays as SVG `style` prop or just remove if SVG is already positioned |
| Crosshair SVG | `position:absolute,inset:0,pointerEvents:none,zIndex:15` | `className="chart-abs-fill"` + `style={{ zIndex: 15 }}` |
| AxesLayer div | `position:absolute,inset:0,pointerEvents:none,zIndex:7` | `className="chart-abs-fill"` + `style={{ zIndex: 7 }}` |
| WebGL wrapper div | `position:absolute,inset:0,zIndex:1` | `className="chart-webgl-layer"` |
| ZoomBox SVG | `position:absolute,inset:0,pointerEvents:none,zIndex:30` | `className="chart-abs-fill"` + `style={{ zIndex: 30 }}` |
| No-data div | all static | `className="chart-no-data"` |
| Tooltip container | left/top dynamic | `className="chart-tooltip"` + `style={{ left: ..., top: ... }}` |
| Tooltip item div | static flex | `className="chart-tooltip-item"` |
| Tooltip x label span | fontWeight/size | `className="chart-tooltip-x-label"` |
| Tooltip value span | fontWeight | `className="chart-tooltip-value"` |
| Fit buttons div | bottom/right dynamic | `className="chart-fit-btns"` + `style={{ bottom: ..., right: ... }}` |
| Fit button | mostly static | `className="chart-fit-btn"` |
| Main `<main>` | cursor, plotBg dynamic | keep `style={{ cursor: ..., backgroundColor: ... }}` (these are always dynamic) |

For `style={{ color: s.lineColor }}` on `<span>` in axis label → stays inline (per-series user color).
For `style={{ color: axis.color }}` on axis labels → stays inline (per-axis user color).
For secondary label div with `borderLeft: currentX > padding.left ? ... : 'none'` → stays inline.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Plot/ChartContainer.tsx
git commit -m "refactor: ChartContainer — extractable inline styles → CSS classes"
```

---

## Task 13: Sidebar.tsx

**Files:**
- Modify: `src/components/components.css`
- Modify: `src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Add CSS to `components.css`**

```css
/* ── Sidebar ────────────────────────────────────────── */
.sb-header {
  padding: 6px 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
  flex-shrink: 0;
}
.sb-logo { width: 24px; height: 24px; flex-shrink: 0; margin-right: 4px; }
.sb-hdr-btns { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; flex: 1; }
.sb-hdr-btn {
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  color: var(--text-muted-color);
}
.sb-hdr-sep { width: 1px; height: 16px; background: var(--border-color); margin: 0 2px; }
.sb-spacer { flex: 1; }
.sb-body { flex: 1; overflow-y: auto; padding: 16px; }
.sb-section { margin-bottom: 24px; }
.sb-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sb-section-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; flex: 1; }
.sb-section-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.sb-icon-btn { padding: 4px; color: var(--accent); }
.sb-hdr-btns-row { display: flex; gap: 2px; }
.sb-sources-list { display: flex; flex-direction: column; gap: 12px; }
.sb-empty-state {
  text-align: center;
  padding: 24px 16px;
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-light);
}
.sb-empty-state p { margin: 0 0 12px; font-size: 0.9rem; }
.sb-empty-state-btn {
  border: 1px solid var(--border2);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text-muted-color);
}
.sb-dataset-card {
  background: var(--bg);
  border-radius: 10px;
  border: 1px solid var(--card-border);
  overflow: hidden;
  box-shadow: 0 1px 3px var(--shadow);
}
.sb-dataset-header {
  padding: 6px 10px;
  border-bottom: 1px solid var(--bg3);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sb-dataset-name {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.sb-dataset-actions { display: flex; gap: 4px; }
.sb-dataset-btn { padding: 4px; color: var(--text-muted-color); }
.sb-dataset-btn--danger { padding: 4px; color: var(--danger); }
.sb-dataset-body { padding: 6px 10px; }
.sb-xaxis-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sb-xaxis-label { font-size: 0.75rem; font-weight: bold; color: var(--text-light); }
.sb-xaxis-controls { display: flex; gap: 4px; align-items: center; }
.sb-axis-cycle-btn {
  padding: 0 6px;
  height: 20px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: bold;
}
.sb-axis-mode-btn {
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sb-xaxis-select {
  font-size: 0.75rem;
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--select-bg);
  color: var(--select-color);
  max-width: 100px;
}
.sb-col-label { font-size: 0.75rem; font-weight: bold; color: var(--text-light); margin-bottom: 6px; }
.sb-col-chips { display: flex; flex-wrap: wrap; }
.sb-series-list { display: flex; flex-direction: column; }
.sb-series-header {
  display: grid;
  grid-template-columns: var(--touch-target-size) var(--touch-target-size) repeat(7, var(--touch-target-size)) 100px 1fr var(--touch-target-size);
  padding: 4px 0;
  color: var(--text-light);
  align-items: center;
  position: sticky;
  top: 0;
  background: var(--section-header-bg);
  z-index: 1;
}
.sb-series-header-cell { display: flex; justify-content: center; }
.sb-series-header-cell--text {
  padding-left: 4px;
  font-size: 10px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-series-row { transition: background 0.2s; border-radius: 6px; }
.sb-views-list { display: flex; flex-direction: column; gap: 8px; }
.sb-view-list-wrap { border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.sb-view-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg);
}
.sb-view-item + .sb-view-item { border-top: 1px solid var(--border-color); }
.sb-view-name-input {
  flex: 1;
  font-size: 0.85rem;
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 2px 4px;
  background: var(--bg);
  color: var(--text-color);
}
.sb-view-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-mid);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-view-btn { padding: 4px; color: var(--accent); }
.sb-view-btn--danger { padding: 4px; color: var(--danger); }
.sb-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-shrink: 0;
}
.sb-footer-btn { font-size: 0.75rem; display: flex; align-items: center; gap: 4px; }
```

- [ ] **Step 2: Update `Sidebar.tsx`**

Delete the `sectionHeadingStyle` and `iconBtnStyle` variables. Update `hdrBtn` helper:

```tsx
  const hdrBtn = (onClick: () => void, icon: React.ReactNode, title: string, color?: string) => (
    <button onClick={onClick} title={title} className="sb-hdr-btn" style={color ? { color } : undefined}>
      {icon}
    </button>
  );
  const hdrSep = <span className="sb-hdr-sep" />;
```

Replace the `<aside>` and all its children using the classes above. Keep only these inline:
- `<aside style={{ width }}>`  — drag-resized width
- Resize handle div: `style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 10 }}` — precise sizing stays
- Column chip buttons: `style={{ fontSize: '0.7rem', padding: '3px 8px', ... border: `1px solid ${t.accent}` ... }}` — keep border color inline or add `.sb-col-chip`/`.sb-col-chip--used`

For the column chips, add to CSS:

```css
.sb-col-chip {
  font-size: 0.7rem;
  padding: 3px 8px;
  border-radius: 0;
  border: 1px solid var(--accent);
}
```

Then chips just need `className="sb-col-chip"` with `style={{ color, background }}` for the active/inactive color toggle (which is dynamic).

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no errors. Fix any references to deleted variables (`sectionHeadingStyle`, `iconBtnStyle`, `bg`, `bg2`, etc.).

- [ ] **Step 4: Commit**

```bash
git add src/components/components.css src/components/Layout/Sidebar.tsx
git commit -m "refactor: Sidebar — inline styles → CSS classes, remove sectionHeadingStyle/iconBtnStyle"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Full build + lint**

```bash
npm run build && npm run lint
```

Expected: no errors, no warnings.

- [ ] **Step 2: Count remaining inline styles**

```bash
grep -r "style={" src/components src/hooks --include="*.tsx" | wc -l
```

Expected: ≤ 30 (only intentionally dynamic values remain).

- [ ] **Step 3: Spot-check each theme visually**

Start dev server and cycle through all 4 themes (light → dark → matrix → unicorn) checking:
- Sidebar renders correctly
- Series config row colors match theme
- Modal dialogs look right
- Color picker popover positions correctly
- ChartLegend draggable and styled

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "refactor: complete inline style consolidation — 233 occurrences → CSS classes"
```

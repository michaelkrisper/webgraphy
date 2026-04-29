# Inline Style Consolidation Design

**Date:** 2026-04-29  
**Scope:** 233 `style={}` occurrences across 15 TSX files → CSS classes + CSS variables

---

## 1. Theme CSS Variable Expansion

`src/hooks/useTheme.ts` — add `setProperty` calls for every `Theme` property not yet exposed.

New CSS variables (kebab-case of TS property name):

| TS property | CSS variable |
|---|---|
| `bg` | `--bg` |
| `bg2` | `--bg2` |
| `bg3` | `--bg3` |
| `border2` | `--border2` |
| `accent` | `--accent` |
| `danger` | `--danger` |
| `shadow` | `--shadow` |
| `textMid` | `--text-mid` |
| `textLight` | `--text-light` |
| `selectBg` | `--select-bg` |
| `selectColor` | `--select-color` |
| `btnBorder` | `--btn-border` |
| `btnColor` | `--btn-color` |
| `cardBorder` | `--card-border` |
| `sectionHeaderBg` | `--section-header-bg` |
| `plotBg` | `--plot-bg` (already exists) |
| `axisColor` | `--axis-color` |
| `tooltipBg` | `--tooltip-bg` |
| `tooltipColor` | `--tooltip-color` |
| `tooltipBorder` | `--tooltip-border` |

Existing 6 vars (`--font-family`, `--text-color`, `--text-muted-color`, `--plot-bg`, `--sidebar-bg`, `--border-color`) are unchanged.

---

## 2. CSS File Strategy

New file: **`src/components/components.css`** — imported once in `src/main.tsx`.

Plain CSS classes (no CSS modules), matching the existing `index.css` convention.  
Organised in sections per component.

---

## 3. Global Button Reset

Add to `index.css`:

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

This eliminates the most common repetitive inline reset across all components.

---

## 4. What Stays Inline (intentionally dynamic)

| Inline value | Reason |
|---|---|
| Sidebar `width` | Drag-resized from state |
| `opacity: isFirst ? 0.3 : 1` | Boolean state |
| `series.lineColor` | Per-series user-chosen color |
| Formula textarea border (valid/invalid/neutral) | 3-way conditional color |
| `borderTop: idx > 0 ? ... : 'none'` | List separator logic |

---

## 5. Component-by-Component Plan

### Sidebar.tsx (76 occurrences)
- Extract: header layout, section wrappers, dataset cards, view list items, footer
- Keep inline: sidebar `width` only
- Note: `sectionHeadingStyle` variable → delete, use class

### ImportSettingsDialog.tsx (35 occurrences)
- Extract: form layout, table, column config header cells, footer buttons
- Keep inline: none

### CalculatedColumnModal.tsx (31 occurrences)
- Extract: overlay, modal card, form fields, suggestion dropdown, shortcut buttons
- Replace hardcoded hex colors with CSS vars or theme-mapped values
- Keep inline: formula textarea border (3-way validity color)

### SeriesConfig.tsx (18 occurrences)
- Extract: row grid, cell placeholders, reorder buttons, title cell
- Series-config header row: **no `borderBottom`** (explicit design decision)
- Keep inline: `opacity` (disabled state), `lineColor` (user color)

### Modal.tsx (7 occurrences)
- Extract: overlay, dialog card, header, close button, footer
- Replace hardcoded `#fff` / `#333` with CSS vars

### DataViewModal.tsx (9 occurrences)
- Extract: table layout, cell styles

### ChartContainer.tsx (24 occurrences)
- Extract: layout wrappers, crosshair, tooltip container
- Keep inline: pixel-precise positioning (computed from render)

### ChartLegend.tsx (4 occurrences)
- Extract: legend container and item layout

### ColorPicker.tsx (8 occurrences)
- Extract: swatch grid, input row

### HelpModal.tsx, LicenseModal.tsx, ImprintModal.tsx (≤4 each)
- Extract all; no dynamic values

### ErrorBoundary.tsx (9 occurrences)
- Extract: error card layout

### CollapsedMenuButton.tsx (2 occurrences)
- Extract both

---

## 6. Simplification Rules

- Drop `background: none` / `border: none` / `cursor: pointer` on `<button>` (covered by reset)
- Drop `box-sizing: border-box` (set globally in `index.css`)
- Drop `margin: 0` where element has no browser default
- Use `color: inherit` / `font-size: inherit` where parent sets the value
- Omit `display: block` (default for div)
- Combine related structural classes where one class covers flex + gap + padding together

---

## 7. Acceptance Criteria

- `npm run build` passes (no TS errors)
- `npm run lint` passes
- All 4 themes render correctly
- Remaining `style={}` occurrences are all in the "stays inline" category
- No visual regressions

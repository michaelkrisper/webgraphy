import React, { useState, useMemo } from 'react';
import { Check, Settings2, Table, Columns, FileType, ArrowRight } from 'lucide-react';
import { secureJSONParse } from '../../utils/json';
import type { ImportSettings, ColumnConfig, ColumnType } from '../../types/import';
import { Modal } from './Modal';
import { type Theme } from '../../themes';

interface ImportSettingsDialogProps {
  fileName: string;
  fileContent: string; // Preview content
  fileType: 'csv' | 'json';
  onConfirm: (settings: ImportSettings) => void | Promise<void>;
  onCancel: () => void;
  theme: Theme;
}

function detectDelimiter(fileContent: string, fileType: 'csv' | 'json'): string {
  if (fileType !== 'csv') return ',';
  const firstLine = fileContent.split('\n')[0];
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let maxCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length;
    if (count > maxCount) { maxCount = count; best = d; }
  }
  return best;
}


function detectColumnTypeAndFormat(firstVal: string | undefined, decimalPoint: string): { type: ColumnType; dateFormat?: string } {
  let type: ColumnType = 'numeric';
  let dateFormat: string | undefined;

  if (firstVal) {
    const normalized = firstVal.replace(decimalPoint, '.');
    if (isNaN(Number(normalized)) || normalized.split('.').length > 2) {
      if (firstVal.includes('-') || firstVal.includes('.') || firstVal.includes('/')) {
        type = 'date';
        if (firstVal.match(/^\d{4}-\d{2}-\d{2}$/)) dateFormat = 'YYYY-MM-DD';
        else if (firstVal.match(/^\d{2}\.\d{2}\.\d{4}$/)) dateFormat = 'DD.MM.YYYY';
        else if (firstVal.match(/^\d{2}\/\d{2}\/\d{4}$/)) dateFormat = 'DD/MM/YYYY';
      } else {
        type = 'categorical';
      }
    }
  }
  return { type, dateFormat };
}

export const ImportSettingsDialog: React.FC<ImportSettingsDialogProps> = ({
  fileName,
  fileContent,
  fileType,
  onConfirm,
  onCancel,
  theme: t
}) => {
  const [delimiter, setDelimiter] = useState<string>(() => detectDelimiter(fileContent, fileType));
  const [decimalPoint, setDecimalPoint] = useState<string>('.');
  const [startRow, setStartRow] = useState<number>(1);
  // Stores per-column user overrides, keyed by column name
  const [columnOverrides, setColumnOverrides] = useState<Record<string, Partial<ColumnConfig>>>({});
  // null = auto-select best X axis column
  const [xAxisColumnOverride, setXAxisColumnOverride] = useState<string | null>(null);

  const previewData = useMemo(() => {
    if (fileType === 'json') {
      try {
        const parsed = secureJSONParse(fileContent) as unknown;
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const headers = Object.keys((rows[0] as Record<string, unknown>) || {});
        return { headers, rows: (rows as Record<string, string>[]).slice(0, 10) };
      } catch {
        return { headers: [], rows: [] as Record<string, string>[] };
      }
    }

    const lines = fileContent.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] as string[][] };

    const headerRowIndex = Math.max(0, startRow - 1);
    const headerLine = lines[headerRowIndex] || '';
    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(headerRowIndex + 1, headerRowIndex + 11).map(line =>
      line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''))
    );
    return { headers, rows };
  }, [fileContent, fileType, delimiter, startRow]);

  // Derived column configs: auto-detected type + user overrides (keyed by column name)
  const columnConfigs = useMemo<ColumnConfig[]>(() => {
    return previewData.headers.map((name, index) => {
      const override = columnOverrides[name];

      const firstVal = fileType === 'json'
        ? (previewData.rows as Record<string, string>[]).find(row => row[name])?.[name]
        : (previewData.rows as string[][])[0]?.[index];

      const { type: autoType, dateFormat: autoFormat } = detectColumnTypeAndFormat(firstVal, decimalPoint);

      if (override) {
        return {
          index,
          name,
          type: override.type || autoType,
          dateFormat: override.dateFormat || autoFormat,
          ...override
        };
      }

      return { index, name, type: autoType, dateFormat: autoFormat };
    });
  }, [previewData, columnOverrides, decimalPoint, fileType]);

  // Derived X axis column: user override if still valid, otherwise auto-select date col or first col
  const xAxisColumn = useMemo(() => {
    const nonIgnored = columnConfigs.filter(c => c.type !== 'ignore');
    if (xAxisColumnOverride && nonIgnored.find(c => c.name === xAxisColumnOverride)) {
      return xAxisColumnOverride;
    }
    return nonIgnored.find(c => c.type === 'date')?.name || nonIgnored[0]?.name || '';
  }, [columnConfigs, xAxisColumnOverride]);

  const handleUpdateColumn = (index: number, updates: Partial<ColumnConfig>) => {
    const name = columnConfigs[index].name;
    setColumnOverrides(prev => ({ ...prev, [name]: { ...prev[name], ...updates } }));
  };

  return (
    <Modal
      onClose={onCancel}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FileType size={24} color={t.accent} />
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: t.text }}>Import Settings: {fileName}</h2>
        </div>
      }
      maxWidth="100%"
      width="100%"
      height="100%"
      maxHeight="100vh"
      borderRadius="0"
      padding="0"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px', borderTop: `1px solid ${t.border}`, backgroundColor: t.bg2 }}>
          <button
            onClick={onCancel}
            style={{ padding: '10px 24px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ delimiter, decimalPoint, startRow, columnConfigs, xAxisColumn })}
            style={{ padding: '10px 24px', borderRadius: '6px', border: 'none', background: t.accent, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 'bold', boxShadow: `0 2px 4px ${t.shadow}` }}
          >
            <Check size={18} /> Import Data
          </button>
        </div>
      }
    >
      <div style={{ padding: '20px', backgroundColor: t.bg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Settings2 size={18} color={t.textMuted} />
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>General Settings</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '20px', marginBottom: '30px', padding: '20px', backgroundColor: t.bg2, borderRadius: '8px', border: `1px solid ${t.border}` }}>
          {fileType === 'csv' && (
            <div style={{ flex: '1 1 150px' }}>
              <label htmlFor="import-delimiter" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: t.textMid }}>Delimiter</label>
              <select
                id="import-delimiter"
                value={delimiter}
                onChange={e => setDelimiter(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, height: '40px', fontSize: '14px' }}
              >
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="\t">Tab</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>
          )}
          <div style={{ flex: '1 1 150px' }}>
            <label htmlFor="import-decimal" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: t.textMid }}>Decimal Point</label>
            <select
              id="import-decimal"
              value={decimalPoint}
              onChange={e => setDecimalPoint(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, height: '40px', fontSize: '14px' }}
            >
              <option value=".">Dot (.)</option>
              <option value=",">Comma (,)</option>
            </select>
          </div>
          {fileType === 'csv' && (
            <div style={{ flex: '1 1 100px' }}>
              <label htmlFor="import-start-row" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: t.textMid }}>Start Row</label>
              <input
                id="import-start-row"
                type="number"
                min="1"
                value={startRow}
                onChange={e => setStartRow(parseInt(e.target.value) || 1)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, height: '40px', fontSize: '14px' }}
              />
            </div>
          )}
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="import-x-axis" style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: t.textMid }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                X-Axis Column <ArrowRight size={14} />
              </div>
            </label>
            <select
              id="import-x-axis"
              value={xAxisColumn}
              onChange={e => setXAxisColumnOverride(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, height: '40px', fontSize: '14px' }}
            >
              {columnConfigs.filter(c => c.type !== 'ignore').map(c => (
                <option key={c.index} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Table size={18} color={t.textMuted} />
          <h3 style={{ margin: 0, fontSize: '0.9rem', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Column Configuration & Preview</h3>
        </div>

        <div style={{ position: 'relative', border: `1px solid ${t.border}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '14px' }}>
              <thead>
                <tr>
                  {columnConfigs.map((config, i) => (
                    <th key={i} style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 10,
                      backgroundColor: t.bg2,
                      borderBottom: `2px solid ${t.border}`,
                      borderRight: i < columnConfigs.length - 1 ? `1px solid ${t.border}` : 'none',
                      padding: '16px',
                      textAlign: 'left',
                      minWidth: '120px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                        <Columns size={14} color={t.accent} />
                        <input
                          type="text"
                          maxLength={100}
                          value={config.name}
                          aria-label={`Column ${i + 1} name`}
                          onChange={e => handleUpdateColumn(i, { name: e.target.value })}
                          style={{
                            flex: 1,
                            fontWeight: 'bold',
                            border: 'none',
                            background: 'transparent',
                            padding: '4px',
                            fontSize: '14px',
                            color: t.text,
                            outline: 'none',
                            borderBottom: `1px dashed ${t.border2}`
                          }}
                        />
                      </div>
                      <select
                        value={config.type}
                        aria-label={`Column ${i + 1} data type`}
                        onChange={e => handleUpdateColumn(i, { type: e.target.value as ColumnType })}
                        style={{ width: '100%', fontSize: '13px', marginBottom: config.type === 'date' ? '8px' : 0, height: '32px', borderRadius: '4px', background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
                      >
                        <option value="numeric">Numeric</option>
                        <option value="date">Date/Time</option>
                        <option value="categorical">Categorical</option>
                        <option value="ignore">Ignore</option>
                      </select>
                      {config.type === 'date' && (
                        <input
                          type="text"
                          placeholder="Format (e.g. YYYY-MM-DD)"
                          maxLength={50}
                          aria-label={`Column ${i + 1} date format`}
                          value={config.dateFormat || ''}
                          onChange={e => handleUpdateColumn(i, { dateFormat: e.target.value })}
                          style={{ width: '100%', fontSize: '12px', padding: '6px 8px', border: `1px solid ${t.border}`, borderRadius: '4px', background: t.bg, color: t.text }}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ backgroundColor: rowIndex % 2 === 0 ? t.bg : t.bg2 }}>
                    {columnConfigs.map((config, colIndex) => (
                      <td key={colIndex} style={{
                        borderBottom: `1px solid ${t.border}`,
                        borderRight: colIndex < columnConfigs.length - 1 ? `1px solid ${t.border}` : 'none',
                        padding: '12px 16px',
                        color: config.type === 'ignore' ? t.textLight : t.text,
                        backgroundColor: config.type === 'ignore' ? t.bg3 : 'transparent',
                        opacity: config.type === 'ignore' ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '200px'
                      }}>
                        {fileType === 'json'
                          ? (row as Record<string, string>)[previewData.headers[colIndex]]
                          : (row as string[])[colIndex]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
};

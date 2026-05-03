import React, { useState, useMemo } from 'react';
import { Check, FileType, Hash, Clock, Type, EyeOff } from 'lucide-react';
import { secureJSONParse } from '../../utils/json';
import type { ImportSettings, ColumnConfig, ColumnType } from '../../types/import';
import { Modal } from './Modal';

interface ImportSettingsDialogProps {
  fileName: string;
  fileContent: string; // Preview content
  fileType: 'csv' | 'json';
  onConfirm: (settings: ImportSettings) => void | Promise<void>;
  onCancel: () => void;
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
  if (!firstVal || firstVal.trim() === '') {
    return { type: 'ignore' };
  }

  let type: ColumnType = 'numeric';
  let dateFormat: string | undefined;

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
  return { type, dateFormat };
}

export const ImportSettingsDialog: React.FC<ImportSettingsDialogProps> = ({
  fileName,
  fileContent,
  fileType,
  onConfirm,
  onCancel
}) => {
  const [delimiter, setDelimiter] = useState<string>(() => detectDelimiter(fileContent, fileType));
  const [decimalPoint, setDecimalPoint] = useState<string>('.');
  const [startRow, setStartRow] = useState<number>(1);
  const [commentChar, setCommentChar] = useState<string>('#');
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
        return { headers, rows: (rows as Record<string, string>[]).slice(0, 50), skippedLines: [] as string[] };
      } catch {
        return { headers: [], rows: [] as Record<string, string>[], skippedLines: [] as string[] };
      }
    }

    const allLines = fileContent.split(/\r?\n/).filter(l => l.trim());
    const lines = allLines.filter(l => {
      const trimmed = l.trim();
      return commentChar ? !trimmed.startsWith(commentChar) : true;
    });
    if (lines.length === 0) return { headers: [], rows: [] as string[][], skippedLines: [] as string[] };

    const headerRowIndex = Math.max(0, startRow - 1);
    const skippedLines = lines.slice(0, headerRowIndex);
    const headerLine = lines[headerRowIndex] || '';
    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(headerRowIndex + 1, headerRowIndex + 51).map(line =>
      line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''))
    );
    return { headers, rows, skippedLines };
  }, [fileContent, fileType, delimiter, startRow, commentChar]);

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
        <div className="isd-title-row">
          <FileType size={24} color="var(--accent)" />
          <h2 className="modal-title">Import Settings: {fileName}</h2>
        </div>
      }
      headerActions={null}
      maxWidth="100%"
      width="100%"
      height="100%"
      maxHeight="100vh"
      borderRadius="0"
      padding="0"
    >
      <div className="isd-body">
        <div className="isd-general-fields">
          {fileType === 'csv' && (
            <div className="isd-field-group-md">
              <label htmlFor="import-delimiter" className="isd-field-label">Delimiter:</label>
              <select
                id="import-delimiter"
                value={delimiter}
                onChange={e => setDelimiter(e.target.value)}
                className="isd-select"
              >
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="\t">Tab</option>
                <option value="|">Pipe (|)</option>
              </select>
            </div>
          )}
          <div className="isd-field-group-md">
            <label htmlFor="import-decimal" className="isd-field-label">Decimal Point:</label>
            <select
              id="import-decimal"
              value={decimalPoint}
              onChange={e => setDecimalPoint(e.target.value)}
              className="isd-select"
            >
              <option value=".">Dot (.)</option>
              <option value=",">Comma (,)</option>
            </select>
          </div>
          {fileType === 'csv' && (
            <>
              <div className="isd-field-group-sm">
                <label htmlFor="import-start-row" className="isd-field-label">Start Row:</label>
                <input
                  id="import-start-row"
                  type="number"
                  min="1"
                  value={startRow}
                  onChange={e => setStartRow(parseInt(e.target.value) || 1)}
                  className="isd-input"
                />
              </div>
              <div className="isd-field-group-sm">
                <label htmlFor="import-comment-char" className="isd-field-label">Comment:</label>
                <input
                  id="import-comment-char"
                  type="text"
                  maxLength={1}
                  value={commentChar}
                  onChange={e => setCommentChar(e.target.value)}
                  className="isd-input"
                  placeholder="#"
                />
              </div>
            </>
          )}
          <button onClick={() => onConfirm({ delimiter, decimalPoint, startRow, commentChar, columnConfigs, xAxisColumn })} className="isd-btn-confirm" style={{ marginLeft: 'auto' }}>
            <Check size={16} /> Import Data
          </button>
        </div>

        {previewData.skippedLines.length > 0 && (
          <div className="isd-skipped-lines">
            {previewData.skippedLines.map((line, i) => (
              <div key={i} className="isd-skipped-line">
                <span className="isd-skipped-line-num">{i + 1}</span>
                <span className="isd-skipped-line-text">{line}</span>
              </div>
            ))}
          </div>
        )}
        <div className="isd-table-wrap">
          <div className="isd-table-scroll">
            <table className="isd-table">
              <thead>
                <tr>
                  {columnConfigs.map((config, i) => (
                    <th key={i} className={`isd-col-header${xAxisColumn === config.name ? ' isd-col-header--xaxis' : ''}`} style={{ borderRight: i < columnConfigs.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                      <div className="isd-col-name-row">
                        <input
                          type="text"
                          maxLength={100}
                          value={config.name}
                          aria-label={`Column ${i + 1} name`}
                          onChange={e => handleUpdateColumn(i, { name: e.target.value })}
                          className="isd-col-name-input"
                        />
                        <input
                          type="radio"
                          name="xaxis-col"
                          title="Set as X-Axis"
                          checked={xAxisColumn === config.name}
                          onChange={() => setXAxisColumnOverride(config.name)}
                          className="isd-xaxis-radio"
                        />
                      </div>
                      <div className="isd-type-btns">
                        {[
                          { type: 'numeric', icon: Hash, label: 'Numeric' },
                          { type: 'date', icon: Clock, label: 'Date/Time' },
                          { type: 'categorical', icon: Type, label: 'Categorical' },
                          { type: 'ignore', icon: EyeOff, label: 'Ignore' }
                        ].map(opt => (
                          <button
                            key={opt.type}
                            title={`Type: ${opt.label}`}
                            onClick={() => handleUpdateColumn(i, { type: opt.type as ColumnType })}
                            className={config.type === opt.type ? 'isd-type-btn isd-type-btn--active' : 'isd-type-btn isd-type-btn--inactive'}
                          >
                            <opt.icon size={12} />
                          </button>
                        ))}
                      </div>
                      {config.type === 'date' && (
                        <input
                          type="text"
                          placeholder="YYYY-MM-DD"
                          maxLength={50}
                          aria-label={`Column ${i + 1} date format`}
                          value={config.dateFormat || ''}
                          onChange={e => handleUpdateColumn(i, { dateFormat: e.target.value })}
                          className="isd-date-input"
                        />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'isd-data-row-even' : 'isd-data-row-odd'}>
                    {columnConfigs.map((config, colIndex) => (
                      <td key={colIndex} className={`isd-td${xAxisColumn === config.name ? ' isd-td--xaxis' : ''}`} style={{
                        borderRight: colIndex < columnConfigs.length - 1 ? '1px solid var(--border-color)' : 'none',
                        color: config.type === 'ignore' ? 'var(--text-light)' : 'var(--text-color)',
                        backgroundColor: config.type === 'ignore' ? 'var(--bg3)' : undefined,
                        opacity: config.type === 'ignore' ? 0.6 : 1,
                        maxWidth: '120px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {fileType === 'json'
                          ? (row as Record<string, string>)[previewData.headers[colIndex]]
                          : (row as string[])[colIndex]}
                      </td>
                    ))}
                  </tr>
                ))}
                {previewData.rows.length >= 50 && (
                  <tr>
                    {columnConfigs.map((_, i) => (
                      <td key={i} className="isd-td isd-td--more" style={{ borderRight: i < columnConfigs.length - 1 ? '1px solid var(--border-color)' : 'none' }}>…</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
};

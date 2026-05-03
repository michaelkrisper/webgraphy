import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { useDataImport } from '../../hooks/useDataImport';
import { useTheme } from '../../hooks/useTheme';
import { THEMES, type ThemeName } from '../../themes';
import { buildSeriesConfig } from '../../utils/series';
import { SeriesConfigUI } from '../Sidebar/SeriesConfig';
import ErrorBoundary from '../ErrorBoundary';
import { FilePlus, Trash2, ChevronRight, ChevronDown, HelpCircle, X, Eye, FileImage, Image, Calculator, ArrowUpDown, Hash, MoveHorizontal, Rows, Minus, Circle, Palette, Sun, Moon, Terminal, Sparkles, List, FlaskConical, RotateCcw, Save, FolderOpen, Clock } from 'lucide-react';
import { ImportSettingsDialog } from './ImportSettingsDialog';
import { CalculatedColumnModal } from './CalculatedColumnModal';

import { exportToSVG, exportToPNG, downloadFile } from '../../services/export';
import { exportSession, importSession } from '../../services/session';
import { ImprintModal } from './ImprintModal';
import { HelpModal } from './HelpModal';
import { LicenseModal } from './LicenseModal';
import { CollapsedMenuButton } from './CollapsedMenuButton';

const THEME_ICONS: Record<ThemeName, React.ReactNode> = {
  light: <Sun size={18} />,
  dark: <Moon size={18} />,
  matrix: <Terminal size={18} />,
  unicorn: <Sparkles size={18} />,
};

const THEME_LABELS: Record<ThemeName, string> = {
  light: 'Light Mode',
  dark: 'Dark Mode',
  matrix: 'Matrix Mode',
  unicorn: 'Unicorn Kitty Mode',
};


/**
 * Sidebar Component
 */
export const Sidebar: React.FC = () => {
  const datasets = useGraphStore(s => s.datasets);
  const series = useGraphStore(s => s.series);
  const xAxes = useGraphStore(s => s.xAxes);
  const yAxes = useGraphStore(s => s.yAxes);
  const axisTitles = useGraphStore(s => s.axisTitles);
  const removeDataset = useGraphStore(s => s.removeDataset);
  const updateDataset = useGraphStore(s => s.updateDataset);
  const updateXAxis = useGraphStore(s => s.updateXAxis);
  const moveSeries = useGraphStore(s => s.moveSeries);
  const loadDemoData = useGraphStore(s => s.loadDemoData);
  const setHighlightedSeries = useGraphStore(s => s.setHighlightedSeries);
  const addSeries = useGraphStore(s => s.addSeries);
  const legendVisible = useGraphStore(s => s.legendVisible);
  const setLegendVisible = useGraphStore(s => s.setLegendVisible);

  const [themeName, cycleTheme] = useTheme();
  const t = THEMES[themeName];

  const [showImprint, setShowImprint] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const removeCalculatedColumn = useGraphStore(s => s.removeCalculatedColumn);
  const [calculatingDatasetId, setCalculatingDatasetId] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<{ datasetId: string; name: string; formula: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);

  const [width, setWidth] = useState(() => Math.min(600, window.innerWidth * 0.35));
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 768 || window.innerHeight < 500);
  const [isResizing, setIsResizing] = useState(false);
  const [openSections, setOpenSections] = useState({ sources: true, series: true });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections(s => ({ ...s, [key]: !s[key] }));
  const { importFile, confirmImport, cancelImport, pendingFile } = useDataImport();

  const selectedDatasetForCalc = useMemo(() => {
    return datasets.find(d => d.id === calculatingDatasetId);
  }, [datasets, calculatingDatasetId]);

  const datasetsById = useMemo(() => {
    const map = new Map();
    for (const d of datasets) {
      map.set(d.id, d);
    }
    return map;
  }, [datasets]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(800, window.innerWidth - e.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const handleResize = () => {
      setWidth(prev => Math.min(prev, window.innerWidth * 0.9));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleExportSVG = () => {
    const plotContainer = document.querySelector('.plot-area') as HTMLElement;
    if (!plotContainer) return;

    const svgContent = exportToSVG(
      datasets,
      series,
      xAxes,
      yAxes,
      axisTitles,
      plotContainer.clientWidth,
      plotContainer.clientHeight,
      t
    );
    downloadFile(svgContent, 'webgraphy-export.svg', 'image/svg+xml');
  };

  const handleExportPNG = async () => {
    const plotContainer = document.querySelector('.plot-area') as HTMLElement;
    if (!plotContainer) return;

    const pngData = await exportToPNG(
      datasets,
      series,
      xAxes,
      yAxes,
      axisTitles,
      plotContainer.clientWidth,
      plotContainer.clientHeight,
      t
    );
    downloadFile(pngData, 'webgraphy-export.png', 'image/png');
  };

  const handleExportSession = async () => {
    const json = await exportSession();
    downloadFile(json, 'webgraphy-session.json', 'application/json');
  };

  const handleLoadSession = useCallback(() => { sessionInputRef.current?.click(); }, []);

  const handleImportSession = async (file: File) => {
    try {
      const text = await file.text();
      const { appState, datasets: importedDatasets } = await importSession(text);
      useGraphStore.setState({
        ...appState,
        datasets: importedDatasets,
        isLoaded: true,
      });
      // Trigger re-save
      importedDatasets.forEach(() => {});
    } catch (err) {
      alert('Failed to import session: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const createSeries = (datasetId: string, columnName: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;

    addSeries(buildSeriesConfig(columnName, datasetId, series.length));
  };

  if (isCollapsed) {
    return <CollapsedMenuButton onClick={() => setIsCollapsed(false)} onExportSVG={handleExportSVG} theme={t} />;
  }

  const hdrBtn = (onClick: () => void, icon: React.ReactNode, title: string, color?: string) => (
    <button onClick={onClick} title={title} className="sb-hdr-btn" style={color ? { color } : undefined}>
      {icon}
    </button>
  );
  const hdrSep = <span className="sb-hdr-sep" />;

  return (
    <>
      <aside className="sidebar" style={{ width, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg2)', borderLeft: '1px solid var(--border-color)', boxShadow: '-2px 0 10px var(--shadow)', flexShrink: 0, zIndex: 1000 }}>
        {/* Resize Handle */}
        <div
          onMouseDown={() => setIsResizing(true)}
          style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 10 }}
        />

        {/* Header */}
        <header className="sb-header">
          <img src="./favicon.svg" className="sb-logo" alt="webgraphy logo" style={{ cursor: 'pointer' }} onClick={() => setIsCollapsed(true)} />
          <div className="sb-hdr-btns">
            {hdrBtn(loadDemoData, <FlaskConical size={16} />, 'Load Demo Data')}
            {hdrBtn(() => { if (confirm('Reset all data?')) datasets.forEach(d => removeDataset(d.id)); }, <RotateCcw size={16} />, 'Reset', 'var(--danger)')}
            {hdrSep}
            {hdrBtn(handleExportSVG, <FileImage size={16} />, 'Export SVG')}
            {hdrBtn(handleExportPNG, <Image size={16} />, 'Export PNG')}
            {hdrSep}
            {hdrBtn(handleExportSession, <Save size={16} />, 'Save Session')}
            {/* eslint-disable-next-line react-hooks/refs */}
            {hdrBtn(handleLoadSession, <FolderOpen size={16} />, 'Load Session')}
            {hdrSep}
            <span className="sb-spacer" />
            {hdrBtn(() => setLegendVisible(!legendVisible), <List size={16} />, legendVisible ? 'Hide Legend' : 'Show Legend', legendVisible ? 'var(--accent)' : undefined)}
            {hdrBtn(cycleTheme, THEME_ICONS[themeName] as React.ReactElement, THEME_LABELS[themeName])}
            {hdrSep}
            {hdrBtn(() => setShowHelp(true), <HelpCircle size={16} />, 'Help')}
            {hdrBtn(() => setIsCollapsed(true), <X size={16} />, 'Collapse Sidebar')}
          </div>
        </header>

        {/* Content */}
        <div className="sb-body">

          {/* Data Sources Section */}
          <ErrorBoundary level="component">
            <section style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div onClick={() => toggleSection('sources')} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1 }}>
                  <h2 className="sb-section-title">Data Sources</h2>
                  {openSections.sources ? <ChevronDown size={16} color={t.textMuted} /> : <ChevronRight size={16} color={t.textMuted} />}
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="sb-icon-btn" title="Import File (CSV/JSON)"><FilePlus size={16} /></button>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} style={{ display: 'none' }} />

              {openSections.sources && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {datasets.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 16px', border: `2px dashed ${t.border}`, borderRadius: '0', color: t.textLight }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>No data loaded</p>
                      <button onClick={loadDemoData} style={{ background: 'none', border: `1px solid ${t.border2}`, padding: '6px 12px', borderRadius: '0', fontSize: '0.8rem', color: t.textMuted, cursor: 'pointer' }}>Load Demo Data</button>
                    </div>
                  )}

                  {datasets.map((ds) => (
                    <div key={ds.id} style={{ backgroundColor: t.bg, borderRadius: '0', border: `1px solid ${t.cardBorder}`, overflow: 'hidden', boxShadow: `0 1px 3px ${t.shadow}` }}>
                      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${t.bg3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: '700', fontSize: '0.85rem', color: t.textMid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto' }} title={ds.name}>{ds.name.includes(': ') ? ds.name.split(': ')[1] : ds.name}</span>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ display: 'flex', gap: '0', alignItems: 'center' }}>
                            <button
                              onClick={() => {
                                const currentId = ds.xAxisId || 'axis-1';
                                const currentNum = parseInt(currentId.split('-')[1]) || 1;
                                const maxOthers = datasets.filter(d => d.id !== ds.id).reduce((m, d) => Math.max(m, parseInt((d.xAxisId || 'axis-1').split('-')[1]) || 1), 1);
                                const cap = Math.min(maxOthers + 1, 9);
                                const nextNum = currentNum >= cap ? 1 : currentNum + 1;
                                updateDataset(ds.id, { xAxisId: `axis-${nextNum}` });
                              }}
                              title="Cycle X-Axis (1-9)"
                              disabled={datasets.length === 1}
                              style={{ padding: '0 5px', height: '20px', background: 'none', border: `1px solid ${t.border}`, borderRight: 'none', cursor: datasets.length === 1 ? 'default' : 'pointer', color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', opacity: datasets.length === 1 ? 0.3 : 1 }}
                            >
                              {(ds.xAxisId || 'axis-1').split('-')[1]}
                            </button>
                            <button
                              onClick={() => {
                                const axis = xAxes.find(a => a.id === (ds.xAxisId || 'axis-1'));
                                if (axis) {
                                  updateXAxis(axis.id, { xMode: axis.xMode === 'date' ? 'numeric' : 'date' });
                                }
                              }}
                              title={xAxes.find(a => a.id === (ds.xAxisId || 'axis-1'))?.xMode === 'date' ? 'Switch to Numeric Axis' : 'Switch to Time Axis'}
                              style={{ padding: '2px', background: 'none', border: `1px solid ${t.border}`, borderRight: 'none', cursor: 'pointer', color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {xAxes.find(a => a.id === (ds.xAxisId || 'axis-1'))?.xMode === 'date' ? <Clock size={14} /> : <Hash size={14} />}
                            </button>
                            <select
                              value={ds.xAxisColumn}
                              onChange={(e) => updateDataset(ds.id, { xAxisColumn: e.target.value })}
                              title="X-Axis"
                              style={{ fontSize: '0.75rem', padding: '2px 4px', border: `1px solid ${t.border}`, background: t.selectBg, color: t.selectColor, maxWidth: '80px' }}
                            >
                              {ds.columns.map(c => <option key={c} value={c}>{c.includes(': ') ? c.split(': ')[1] : c}</option>)}
                            </select>
                          </div>
                          <button onClick={() => setCalculatingDatasetId(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }} title="Add Calculated Column"><Calculator size={16} /></button>
                          <button onClick={() => removeDataset(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.danger }} title="Delete Dataset"><Trash2 size={16} /></button>
                        </div>
                      </div>

                      <div style={{ padding: '6px 10px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
                          {ds.columns.map((col, colIdx) => {
                            const isUsed = series.some(s => s.sourceId === ds.id && s.yColumn === col);
                            const isX = ds.xAxisColumn === col;
                            if (isX) return null;
                            const colData = ds.data[colIdx];
                            const isCalc = !!colData?.formula;
                            const label = col.includes(': ') ? col.split(': ')[1] : col;
                            return (
                              <div key={col} style={{ display: 'flex', border: `1px solid ${t.accent}`, backgroundColor: t.bg3, opacity: isUsed ? 0.7 : 1 }}>
                                <button
                                  onClick={() => createSeries(ds.id, col)}
                                  style={{
                                    fontSize: '0.7rem', padding: '3px 8px', borderRadius: '0',
                                    border: 'none', background: 'none',
                                    color: t.accent, cursor: 'pointer', fontWeight: '600',
                                  }}
                                  title={isCalc ? `Formula: ${colData.formula}` : col}
                                >
                                  {isCalc ? `ƒ ${label}` : label}
                                </button>
                                {isCalc && (<>
                                  <button
                                    onClick={() => setEditingColumn({ datasetId: ds.id, name: col, formula: colData.formula! })}
                                    style={{ fontSize: '0.65rem', padding: '2px 4px', border: 'none', background: 'none', color: t.accent, cursor: 'pointer', borderLeft: `1px solid ${t.accent}` }}
                                    title="Edit formula"
                                  >✎</button>
                                  <button
                                    onClick={() => removeCalculatedColumn(ds.id, col)}
                                    style={{ display: 'flex', alignItems: 'center', padding: '2px 4px', border: 'none', background: 'none', color: t.danger, cursor: 'pointer', borderLeft: `1px solid ${t.accent}` }}
                                    title="Delete calculated column"
                                  ><Trash2 size={10} /></button>
                                </>)}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </ErrorBoundary>

          {/* Series Configuration Section */}
          <section className="sb-section">
            <div className="sb-section-header">
              <div onClick={() => toggleSection('series')} className="sb-section-toggle">
                <h2 className="sb-section-title">Series Config</h2>
                {openSections.series ? <ChevronDown size={16} color="var(--text-muted-color)" /> : <ChevronRight size={16} color="var(--text-muted-color)" />}
              </div>
            </div>

            {openSections.series && (
              <div className="sb-series-list">
                {series.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-light)', textAlign: 'center', fontStyle: 'italic' }}>Add columns from data sources</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="sb-series-header">
                      <div title="Visibility" className="sb-series-header-cell"><Eye size={12} /></div>
                      <div title="Order" className="sb-series-header-cell"><ArrowUpDown size={12} /></div>
                      <div title="Y-Axis #" className="sb-series-header-cell"><Hash size={12} /></div>
                      <div title="Side (L/R)" className="sb-series-header-cell"><MoveHorizontal size={12} /></div>
                      <div title="Grid" className="sb-series-header-cell"><Rows size={12} /></div>
                      <div title="Line Style" className="sb-series-header-cell"><Minus size={12} /></div>
                      <div title="Point Style" className="sb-series-header-cell"><Circle size={10} /></div>
                      <div title="Color" className="sb-series-header-cell"><Palette size={12} /></div>
                      <div title="Data Column" className="sb-series-header-cell--text">COL</div>
                      <div title="Series Name" className="sb-series-header-cell--text">NAME</div>
                      <div />
                    </div>
                    {series.map((s, idx) => (
                      <div
                        key={s.id}
                        onMouseEnter={() => setHighlightedSeries(s.id)}
                        onMouseLeave={() => setHighlightedSeries(null)}
                        className="sb-series-row"
                      >
                        <SeriesConfigUI
                          series={s}
                          dataset={datasetsById.get(s.sourceId)}
                          isFirst={idx === 0}
                          isLast={idx === series.length - 1}
                          onMove={(delta) => moveSeries(s.id, delta)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <input ref={sessionInputRef} type="file" accept=".json" onChange={(e) => { if (e.target.files?.[0]) handleImportSession(e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} />

        <footer className="sb-footer">
<button onClick={() => setShowLicense(true)} className="sb-footer-btn">License</button>
          <button onClick={() => setShowImprint(true)} className="sb-footer-btn">Imprint</button>
        </footer>
      </aside>

      {/* Modals */}
      {pendingFile && <ImportSettingsDialog fileName={pendingFile.file.name} fileContent={pendingFile.preview} fileType={pendingFile.type} onConfirm={confirmImport} onCancel={cancelImport} />}
      {selectedDatasetForCalc && <CalculatedColumnModal dataset={selectedDatasetForCalc} onClose={() => setCalculatingDatasetId(null)} />}
      {editingColumn && (() => {
        const ds = datasets.find(d => d.id === editingColumn.datasetId);
        return ds ? <CalculatedColumnModal dataset={ds} initialName={editingColumn.name} initialFormula={editingColumn.formula} onClose={() => setEditingColumn(null)} /> : null;
      })()}
      {showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
    </>
  );
};

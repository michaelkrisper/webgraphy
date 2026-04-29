import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { useDataImport } from '../../hooks/useDataImport';
import { useTheme } from '../../hooks/useTheme';
import { THEMES, type ThemeName, COLOR_PALETTE } from '../../themes';
import { SeriesConfigUI } from '../Sidebar/SeriesConfig';
import ErrorBoundary from '../ErrorBoundary';
import { FilePlus, Trash2, ChevronRight, ChevronDown, HelpCircle, X, Eye, FileImage, Image, Bookmark, Calculator, ArrowUpDown, Hash, MoveHorizontal, Rows, Minus, Circle, Palette, Sun, Moon, Terminal, Sparkles, Wand2, List, FlaskConical, RotateCcw, Save, FolderOpen, Clock } from 'lucide-react';
import { ImportSettingsDialog } from './ImportSettingsDialog';
import { DataViewModal } from './DataViewModal';
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
  const {
    datasets, series, xAxes, yAxes, axisTitles,
    removeDataset, updateDataset, updateXAxis,
    views, saveView, applyView, deleteView,
    moveSeries, updateViewName, loadDemoData,
    setHighlightedSeries, autoDetectViews,
    legendVisible, setLegendVisible
  } = useGraphStore();

  const [themeName, cycleTheme] = useTheme();
  const t = THEMES[themeName];

  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [tempViewName, setTempViewName] = useState('');
  const [showImprint, setShowImprint] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [viewingDatasetId, setViewingDatasetId] = useState<string | null>(null);
  const [calculatingDatasetId, setCalculatingDatasetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);

  const [width, setWidth] = useState(() => Math.min(600, window.innerWidth * 0.35));
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 768 || window.innerHeight < 500);
  const [isResizing, setIsResizing] = useState(false);
  const [openSections, setOpenSections] = useState({ sources: true, series: true, views: true });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections(s => ({ ...s, [key]: !s[key] }));
  const { importFile, confirmImport, cancelImport, pendingFile } = useDataImport();

  const selectedDatasetForView = useMemo(() => {
    return datasets.find(d => d.id === viewingDatasetId);
  }, [datasets, viewingDatasetId]);

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

  const customViews = useMemo(() => {
    return views ? views.filter(v => v.id !== 'default-view') : [];
  }, [views]);

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

    const { addSeries } = useGraphStore.getState();

    const usedAxisIds = new Set(series.map(s => s.yAxisId));
    let nextAxisId = 'axis-1';
    for (let i = 1; i <= 9; i++) {
      const id = `axis-${i}`;
      if (!usedAxisIds.has(id)) {
        nextAxisId = id;
        break;
      }
    }

    if (usedAxisIds.size >= 9) {
      nextAxisId = `axis-${(series.length % 9) + 1}`;
    }

    const color = COLOR_PALETTE[series.length % COLOR_PALETTE.length];

    addSeries({
      id: crypto.randomUUID(),
      sourceId: datasetId,
      name: columnName,
      yColumn: columnName,
      yAxisId: nextAxisId,
      pointStyle: 'circle',
      pointColor: color,
      lineStyle: 'solid',
      lineColor: color,
      hidden: false
    });
  };

  if (isCollapsed) {
    return <CollapsedMenuButton onClick={() => setIsCollapsed(false)} theme={t} />;
  }

  const sectionHeadingStyle: React.CSSProperties = { margin: 0, fontSize: '0.85rem', fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' };
  const iconBtnStyle: React.CSSProperties = { padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.accent };
  const hdrBtn = (onClick: () => void, icon: React.ReactNode, title: string, color?: string) => (
    <button onClick={onClick} title={title} style={{ background: 'none', border: 'none', cursor: 'pointer', color: color ?? t.textMuted, padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
      {icon}
    </button>
  );
  const hdrSep = <span style={{ width: 1, height: 16, background: t.border, margin: '0 2px' }} />;


  return (
    <>
      <aside className="sidebar" style={{ width, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: t.bg2, borderLeft: `1px solid ${t.border}`, boxShadow: `-2px 0 10px ${t.shadow}`, flexShrink: 0, zIndex: 1000 }}>
        {/* Resize Handle */}
        <div
          onMouseDown={() => setIsResizing(true)}
          style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 10 }}
        />

        {/* Header */}
        <header style={{ padding: '6px 10px', backgroundColor: t.bg, borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap', overflow: 'hidden' }}>
          <img src="./favicon.svg" style={{ width: 24, height: 24, flexShrink: 0, marginRight: '4px' }} alt="webgraphy logo" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'nowrap', flex: 1 }}>
            {hdrBtn(loadDemoData, <FlaskConical size={16} />, 'Load Demo Data')}
            {hdrBtn(() => { if (confirm('Reset all data?')) datasets.forEach(d => removeDataset(d.id)); }, <RotateCcw size={16} />, 'Reset', t.danger)}
            {hdrSep}
            {hdrBtn(handleExportSVG, <FileImage size={16} />, 'Export SVG')}
            {hdrBtn(handleExportPNG, <Image size={16} />, 'Export PNG')}
            {hdrSep}
            {hdrBtn(handleExportSession, <Save size={16} />, 'Save Session')}
            {hdrBtn(() => sessionInputRef.current?.click(), <FolderOpen size={16} />, 'Load Session')}
            {hdrSep}
            <span style={{ flex: 1 }} />
            {hdrBtn(() => setLegendVisible(!legendVisible), <List size={16} />, legendVisible ? 'Hide Legend' : 'Show Legend', legendVisible ? t.accent : t.textMuted)}
            {hdrBtn(cycleTheme, THEME_ICONS[themeName] as React.ReactElement, THEME_LABELS[themeName])}
            {hdrSep}
            {hdrBtn(() => setIsCollapsed(true), <X size={16} />, 'Collapse Sidebar')}
          </div>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

          {/* Data Sources Section */}
          <ErrorBoundary level="component">
            <section style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div onClick={() => toggleSection('sources')} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1 }}>
                  <h2 style={sectionHeadingStyle}>Data Sources</h2>
                  {openSections.sources ? <ChevronDown size={16} color={t.textMuted} /> : <ChevronRight size={16} color={t.textMuted} />}
                </div>
                <button onClick={() => fileInputRef.current?.click()} style={iconBtnStyle} title="Import File (CSV/JSON)"><FilePlus size={16} /></button>
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} style={{ display: 'none' }} />

              {openSections.sources && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                  {datasets.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 16px', border: `2px dashed ${t.border}`, borderRadius: '12px', color: t.textLight }}>
                      <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>No data loaded</p>
                      <button onClick={loadDemoData} style={{ background: 'none', border: `1px solid ${t.border2}`, padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', color: t.textMuted, cursor: 'pointer' }}>Load Demo Data</button>
                    </div>
                  )}

                  {datasets.map((ds) => (
                    <div key={ds.id} style={{ backgroundColor: t.bg, borderRadius: '10px', border: `1px solid ${t.cardBorder}`, overflow: 'hidden', boxShadow: `0 1px 3px ${t.shadow}` }}>
                      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.bg3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', fontSize: '0.9rem', color: t.textMid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={ds.name}>{ds.name}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => setCalculatingDatasetId(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }} title="Add Calculated Column"><Calculator size={16} /></button>
                          <button onClick={() => setViewingDatasetId(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted }} title="View Data"><Eye size={16} /></button>
                          <button onClick={() => removeDataset(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.danger }} title="Delete Dataset"><Trash2 size={16} /></button>
                        </div>
                      </div>

                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: t.textLight }}>X-Axis Column</label>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                              onClick={() => {
                                const axis = xAxes.find(a => a.id === (ds.xAxisId || 'axis-1'));
                                if (axis) {
                                  updateXAxis(axis.id, { xMode: axis.xMode === 'date' ? 'numeric' : 'date' });
                                }
                              }}
                              title={xAxes.find(a => a.id === (ds.xAxisId || 'axis-1'))?.xMode === 'date' ? 'Switch to Numeric Axis' : 'Switch to Time Axis'}
                              style={{ padding: '2px', background: 'none', border: `1px solid ${t.border}`, borderRadius: '4px', cursor: 'pointer', color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              {xAxes.find(a => a.id === (ds.xAxisId || 'axis-1'))?.xMode === 'date' ? <Clock size={14} /> : <Hash size={14} />}
                            </button>
                            <select
                              value={ds.xAxisColumn}
                              onChange={(e) => updateDataset(ds.id, { xAxisColumn: e.target.value })}
                              style={{ fontSize: '0.75rem', padding: '2px 4px', borderRadius: '4px', border: `1px solid ${t.border}`, background: t.selectBg, color: t.selectColor, maxWidth: '100px' }}
                            >
                              {ds.columns.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: t.textLight }}>X-Axis Assignment</label>
                          <select
                            value={ds.xAxisId}
                            onChange={(e) => updateDataset(ds.id, { xAxisId: e.target.value })}
                            style={{ fontSize: '0.75rem', padding: '2px 4px', borderRadius: '4px', border: `1px solid ${t.border}`, background: t.selectBg, color: t.selectColor, maxWidth: '120px' }}
                          >
                            {xAxes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>

                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: t.textLight, marginBottom: '6px' }}>Series / Columns</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
                          {ds.columns.map((col) => {
                            const isUsed = series.some(s => s.sourceId === ds.id && s.yColumn === col);
                            const isX = ds.xAxisColumn === col;
                            if (isX) return null;
                            return (
                              <button
                                key={col}
                                onClick={() => createSeries(ds.id, col)}
                                disabled={isUsed}
                                style={{
                                  fontSize: '0.7rem', padding: '3px 8px', borderRadius: '0',
                                  border: isUsed ? `1px solid ${t.border}` : `1px solid ${t.accent}`,
                                  backgroundColor: isUsed ? t.bg3 : t.bg3,
                                  color: isUsed ? t.textLight : t.accent,
                                  cursor: isUsed ? 'default' : 'pointer',
                                  fontWeight: '600'
                                }}
                              >
                                {col.includes(': ') ? col.split(': ')[1] : col}
                              </button>
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
          <section style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div onClick={() => toggleSection('series')} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1 }}>
                <h2 style={sectionHeadingStyle}>Series Config</h2>
                {openSections.series ? <ChevronDown size={16} color={t.textMuted} /> : <ChevronRight size={16} color={t.textMuted} />}
              </div>
            </div>

            {openSections.series && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {series.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: t.textLight, textAlign: 'center', fontStyle: 'italic' }}>Add columns from data sources</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'var(--touch-target-size) var(--touch-target-size) repeat(7, var(--touch-target-size)) 100px 1fr var(--touch-target-size)', gap: '0', padding: '4px 0', borderBottom: `2px solid ${t.border}`, color: t.textLight, alignItems: 'center', position: 'sticky', top: 0, background: t.sectionHeaderBg, zIndex: 1 }}>
                      <div title="Visibility" style={{ display: 'flex', justifyContent: 'center' }}><Eye size={12} /></div>
                      <div title="Order" style={{ display: 'flex', justifyContent: 'center' }}><ArrowUpDown size={12} /></div>
                      <div title="Y-Axis #" style={{ display: 'flex', justifyContent: 'center' }}><Hash size={12} /></div>
                      <div title="Side (L/R)" style={{ display: 'flex', justifyContent: 'center' }}><MoveHorizontal size={12} /></div>
                      <div title="Grid" style={{ display: 'flex', justifyContent: 'center' }}><Rows size={12} /></div>
                      <div title="Line Style" style={{ display: 'flex', justifyContent: 'center' }}><Minus size={12} /></div>
                      <div title="Line Width" style={{ display: 'flex', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>W</div>
                      <div title="Point Style" style={{ display: 'flex', justifyContent: 'center' }}><Circle size={10} /></div>
                      <div title="Color" style={{ display: 'flex', justifyContent: 'center' }}><Palette size={12} /></div>
                      <div title="Data Column" style={{ paddingLeft: '4px', fontSize: '10px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>COL</div>
                      <div title="Series Name" style={{ paddingLeft: '4px', fontSize: '10px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>NAME</div>
                      <div />
                    </div>
                    {series.map((s, idx) => (
                      <div
                        key={s.id}
                        onMouseEnter={() => setHighlightedSeries(s.id)}
                        onMouseLeave={() => setHighlightedSeries(null)}
                        style={{ transition: 'background 0.2s', borderRadius: '6px' }}
                      >
                        <SeriesConfigUI
                          series={s}
                          dataset={datasetsById.get(s.sourceId)}
                          isFirst={idx === 0}
                          isLast={idx === series.length - 1}
                          onMove={(delta) => moveSeries(s.id, delta)}
                          themeName={themeName}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Views Section */}
          <section style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div onClick={() => toggleSection('views')} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1 }}>
                <h2 style={sectionHeadingStyle}>Saved Views</h2>
                {openSections.views ? <ChevronDown size={16} color={t.textMuted} /> : <ChevronRight size={16} color={t.textMuted} />}
              </div>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button
                  onClick={autoDetectViews}
                  style={iconBtnStyle}
                  title="Auto-detect interesting spots (extrema, steep changes, intersections)"
                ><Wand2 size={16} /></button>
                <button
                  onClick={() => { const name = prompt('Enter view name:', `View ${customViews.length + 1}`); if (name) saveView(name); }}
                  style={iconBtnStyle}
                  title="Save Current View"
                ><Bookmark size={16} /></button>
              </div>
            </div>

            {openSections.views && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {customViews.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: t.textLight, textAlign: 'center', fontStyle: 'italic' }}>No saved views</p>
                ) : (
                  <div style={{ border: `1px solid ${t.border}`, borderRadius: '8px', overflow: 'hidden' }}>
                    {customViews.map((view, idx) => (
                      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', backgroundColor: t.bg, borderTop: idx > 0 ? `1px solid ${t.border}` : 'none' }}>
                        {editingViewId === view.id ? (
                          <input
                            autoFocus
                            value={tempViewName}
                            onChange={(e) => setTempViewName(e.target.value)}
                            onBlur={() => { updateViewName(view.id, tempViewName); setEditingViewId(null); }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                            style={{ flex: 1, fontSize: '0.85rem', border: `1px solid ${t.accent}`, borderRadius: '4px', padding: '2px 4px', background: t.bg, color: t.text }}
                          />
                        ) : (
                          <span
                            onClick={() => applyView(view.id)}
                            onDoubleClick={() => { setEditingViewId(view.id); setTempViewName(view.name); }}
                            style={{ flex: 1, fontSize: '0.85rem', fontWeight: '600', color: t.textMid, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {view.name}
                          </span>
                        )}
                        <button onClick={() => applyView(view.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.accent }} title="Apply"><Eye size={14} /></button>
                        <button onClick={() => deleteView(view.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: t.danger }} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <input ref={sessionInputRef} type="file" accept=".json" onChange={(e) => { if (e.target.files?.[0]) handleImportSession(e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} />

        <footer style={{ padding: '8px 16px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><HelpCircle size={13} /> Help</button>
          <button onClick={() => setShowLicense(true)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '0.75rem' }}>License</button>
          <button onClick={() => setShowImprint(true)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: '0.75rem' }}>Imprint</button>
        </footer>
      </aside>

      {/* Modals */}
      {pendingFile && <ImportSettingsDialog fileName={pendingFile.file.name} fileContent={pendingFile.preview} fileType={pendingFile.type} onConfirm={confirmImport} onCancel={cancelImport} theme={t} />}
      {selectedDatasetForView && <DataViewModal dataset={selectedDatasetForView} onClose={() => setViewingDatasetId(null)} />}
      {selectedDatasetForCalc && <CalculatedColumnModal dataset={selectedDatasetForCalc} onClose={() => setCalculatingDatasetId(null)} />}
      {showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
    </>
  );
};

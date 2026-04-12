import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { useDataImport } from '../../hooks/useDataImport';
import { SeriesConfigUI } from '../Sidebar/SeriesConfig';
import { persistence } from '../../services/persistence';
import { FilePlus, Layout, Trash2, ChevronRight, ChevronUp, ChevronDown, HelpCircle, X, Eye, FileImage, Image, RotateCcw, Bookmark, Upload, Clock, Hash, Calculator, ArrowUpDown, MoveHorizontal, Minus, Circle, Palette, Rows, Search, EyeOff } from 'lucide-react';
import { ImportSettingsDialog } from './ImportSettingsDialog';
import { DataViewModal } from './DataViewModal';
import { CalculatedColumnModal } from './CalculatedColumnModal';

import { exportToSVG, exportToPNG, downloadFile } from '../../services/export';
import { ImprintModal } from './ImprintModal';
import { HelpModal } from './HelpModal';
import { LicenseModal } from './LicenseModal';
import { CollapsedMenuButton } from './CollapsedMenuButton';

const COLOR_PALETTE = [
  '#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#ea580c'
];

/**
 * Sidebar Component (v3.0 - Visibility, Search & Highlighting)
 */
export const Sidebar: React.FC = () => {
  const { 
    datasets, series, xAxes, yAxes, axisTitles, 
    removeDataset, updateDataset, moveDataset, 
    views, saveView, applyView, deleteView, 
    moveSeries, updateViewName, loadDemoData,
    bulkHideAllSeries, bulkShowAllSeries, setHighlightedSeries
  } = useGraphStore();

  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [tempViewName, setTempViewName] = useState('');
  const [showImprint, setShowImprint] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [viewingDatasetId, setViewingDatasetId] = useState<string | null>(null);
  const [calculatingDatasetId, setCalculatingDatasetId] = useState<string | null>(null);
  const [seriesSearch, setSeriesSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);


  const [width, setWidth] = useState(() => Math.min(600, window.innerWidth * 0.35));
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 768 || window.innerHeight < 500);
  const [isResizing, setIsResizing] = useState(false);
  const [openSections, setOpenSections] = useState({ sources: true, series: true, views: true });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections(s => ({ ...s, [key]: !s[key] }));
  const { importFile, confirmImport, cancelImport, pendingFile, isImporting } = useDataImport();
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const filteredSeries = useMemo(() => {
    if (!seriesSearch.trim()) return series;
    const term = seriesSearch.toLowerCase();
    return series.filter(s => (s.name || s.yColumn).toLowerCase().includes(term));
  }, [series, seriesSearch]);

  const selectedDatasetForView = useMemo(() => {
    return datasets.find(d => d.id === viewingDatasetId);
  }, [datasets, viewingDatasetId]);

  const selectedDatasetForCalc = useMemo(() => {
    return datasets.find(d => d.id === calculatingDatasetId);
  }, [datasets, calculatingDatasetId]);

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
      plotContainer.clientHeight
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
      plotContainer.clientHeight
    );
    downloadFile(pngData, 'webgraphy-export.png', 'image/png');
  };

  const createSeries = (datasetId: string, columnName: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;

    const { addSeries } = useGraphStore.getState();

    // Find the first Y-axis that is not currently used by any series
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
      lineWidth: 1.5,
      hidden: false
    });
  };

  if (isCollapsed) {
    return <CollapsedMenuButton onClick={() => setIsCollapsed(false)} />;
  }

  return (
    <>
      <aside className="sidebar" style={{ width, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc', borderLeft: '1px solid #e2e8f0', boxShadow: '-2px 0 10px rgba(0,0,0,0.05)', flexShrink: 0, zIndex: 1000 }}>
        {/* Resize Handle */}
        <div 
          onMouseDown={() => setIsResizing(true)}
          style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'col-resize', zIndex: 10 }} 
        />

        {/* Header */}
        <header style={{ padding: '12px 16px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ padding: '6px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '8px', color: '#fff' }}>
              <Layout size={20} />
            </div>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.02em' }}>webgraphy</h1>
          </div>
          <button onClick={() => setIsCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px', borderRadius: '4px' }} title="Collapse Sidebar">
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          
          {/* Data Sources Section */}
          <section style={{ marginBottom: '24px' }}>
            <div onClick={() => toggleSection('sources')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Sources</h2>
              {openSections.sources ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
            </div>

            {openSections.sources && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '10px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', transition: 'background 0.2s', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)' }}
                >
                  <FilePlus size={18} /> Import File (CSV/JSON)
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} style={{ display: 'none' }} />

                {datasets.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 16px', border: '2px dashed #e2e8f0', borderRadius: '12px', color: '#94a3b8' }}>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>No data loaded</p>
                    <button onClick={loadDemoData} style={{ background: 'none', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#64748b', cursor: 'pointer' }}>Load Demo Data</button>
                  </div>
                )}

                {datasets.map((ds, idx) => (
                  <div key={ds.id} style={{ backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={ds.name}>{ds.name}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => setCalculatingDatasetId(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} title="Add Calculated Column"><Calculator size={16} /></button>
                        <button onClick={() => setViewingDatasetId(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }} title="View Data"><Eye size={16} /></button>
                        <button onClick={() => removeDataset(ds.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }} title="Delete Dataset"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8' }}>X-Axis Column</label>
                        <select 
                          value={ds.xAxisColumn} 
                          onChange={(e) => updateDataset(ds.id, { xAxisColumn: e.target.value })}
                          style={{ fontSize: '0.75rem', padding: '2px 4px', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', maxWidth: '120px' }}
                        >
                          {ds.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '6px' }}>Series / Columns</div>
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
                                border: isUsed ? '1px solid #e2e8f0' : '1px solid #3b82f6', 
                                backgroundColor: isUsed ? '#f1f5f9' : '#eff6ff',
                                color: isUsed ? '#94a3b8' : '#3b82f6',
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

          {/* Series Configuration Section */}
          <section style={{ marginBottom: '24px' }}>
            <div onClick={() => toggleSection('series')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Series Config</h2>
              {openSections.series ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
            </div>

            {openSections.series && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {series.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input 
                          type="text" 
                          placeholder="Search series..." 
                          value={seriesSearch}
                          onChange={(e) => setSeriesSearch(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px 6px 28px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff' }}
                        />
                      </div>
                      <button onClick={bulkShowAllSeries} style={{ padding: '6px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#64748b', cursor: 'pointer' }} title="Show All"><Eye size={16} /></button>
                      <button onClick={bulkHideAllSeries} style={{ padding: '6px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', color: '#64748b', cursor: 'pointer' }} title="Hide All"><EyeOff size={16} /></button>
                    </div>
                  </div>
                )}

                {series.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>Add columns from data sources</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {filteredSeries.map((s, idx) => (
                      <div 
                        key={s.id} 
                        onMouseEnter={() => setHighlightedSeries(s.id)}
                        onMouseLeave={() => setHighlightedSeries(null)}
                        style={{ transition: 'background 0.2s', borderRadius: '6px' }}
                      >
                        <SeriesConfigUI 
                          series={s} 
                          dataset={datasets.find(d => d.id === s.sourceId)} 
                          isFirst={idx === 0} 
                          isLast={idx === series.length - 1} 
                          onMove={moveSeries}
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
            <div onClick={() => toggleSection('views')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Saved Views</h2>
              {openSections.views ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
            </div>

            {openSections.views && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => {
                      const name = prompt('Enter view name:', `View ${customViews.length + 1}`);
                      if (name) saveView(name);
                    }}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', backgroundColor: '#fff', border: '1px solid #3b82f6', color: '#3b82f6', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    <Bookmark size={16} /> Save Current View
                  </button>
                </div>

                {customViews.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>No saved views</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {customViews.map(view => (
                      <div key={view.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        {editingViewId === view.id ? (
                          <input 
                            autoFocus
                            value={tempViewName}
                            onChange={(e) => setTempViewName(e.target.value)}
                            onBlur={() => { updateViewName(view.id, tempViewName); setEditingViewId(null); }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())}
                            style={{ flex: 1, fontSize: '0.85rem', border: '1px solid #3b82f6', borderRadius: '4px', padding: '2px 4px' }}
                          />
                        ) : (
                          <span 
                            onClick={() => applyView(view.id)} 
                            onDoubleClick={() => { setEditingViewId(view.id); setTempViewName(view.name); }}
                            style={{ flex: 1, fontSize: '0.85rem', fontWeight: '600', color: '#334155', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {view.name}
                          </span>
                        )}
                        <button onClick={() => applyView(view.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6' }} title="Apply"><RotateCcw size={14} /></button>
                        <button onClick={() => deleteView(view.id)} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer style={{ padding: '16px', backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button onClick={handleExportSVG} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', color: '#475569', cursor: 'pointer' }}><FileImage size={16} /> SVG</button>
            <button onClick={handleExportPNG} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '600', color: '#475569', cursor: 'pointer' }}><Image size={16} /> PNG</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <button onClick={() => setShowHelp(true)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}><HelpCircle size={14} /> Help</button>
            <button onClick={() => setShowLicense(true)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}>License</button>
            <button onClick={() => setShowImprint(true)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem' }}>Imprint</button>
          </div>
        </footer>
      </aside>

      {/* Modals */}
      {pendingFile && <ImportSettingsDialog file={pendingFile} onConfirm={confirmImport} onCancel={cancelImport} />}
      {selectedDatasetForView && <DataViewModal dataset={selectedDatasetForView} onClose={() => setViewingDatasetId(null)} />}
      {selectedDatasetForCalc && <CalculatedColumnModal dataset={selectedDatasetForCalc} onClose={() => setCalculatingDatasetId(null)} />}
      {showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
    </>
  );
};

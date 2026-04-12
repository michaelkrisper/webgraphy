import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { useDataImport } from '../../hooks/useDataImport';
import { SeriesConfigUI } from '../Sidebar/SeriesConfig';
import { persistence } from '../../services/persistence';
import { FilePlus, Layout, Trash2, ChevronRight, ChevronUp, ChevronDown, HelpCircle, X, Eye, FileImage, Image, RotateCcw, Bookmark, Upload, Clock, Hash, ArrowUpDown, MoveHorizontal, Minus, Circle, Palette, Type, Rows } from 'lucide-react';
import { ImportSettingsDialog } from './ImportSettingsDialog';
import { DataViewModal } from './DataViewModal';

import { exportToSVG, exportToPNG, downloadFile } from '../../services/export';
import { ImprintModal } from './ImprintModal';
import { HelpModal } from './HelpModal';
import { LicenseModal } from './LicenseModal';
import { CollapsedMenuButton } from './CollapsedMenuButton';

const COLOR_PALETTE = [
  '#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#ea580c'
];

/**
 * Sidebar Component (v2.6 - Floating Expand Button)
 * Manages data imports, dataset listing, global X-axis settings, and series configuration.
 */
export const Sidebar: React.FC = () => {
  const { datasets, series, xAxes, yAxes, axisTitles, removeDataset, updateDataset, moveDataset, views, saveView, applyView, deleteView, moveSeries, updateViewName, loadDemoData } = useGraphStore();
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [tempViewName, setTempViewName] = useState('');
  const [showImprint, setShowImprint] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [viewingDatasetId, setViewingDatasetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const [width, setWidth] = useState(() => Math.min(450, window.innerWidth * 0.85));
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 768 || window.innerHeight < 500);
  const [isResizing, setIsResizing] = useState(false);
  const [openSections, setOpenSections] = useState({ sources: true, series: true, views: true });
  const toggleSection = (key: keyof typeof openSections) => setOpenSections(s => ({ ...s, [key]: !s[key] }));
  const { importFile, confirmImport, cancelImport, pendingFile, isImporting } = useDataImport();
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const selectedDatasetForView = useMemo(() => {
    return datasets.find(d => d.id === viewingDatasetId);
  }, [datasets, viewingDatasetId]);

  const customViews = useMemo(() => {
    return views ? views.filter(v => v.id !== 'default-view') : [];
  }, [views]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(600, window.innerWidth - e.clientX));
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

  // Handle auto-resize on window resize (especially orientation change)
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
    
    // If all axes are already in use, fall back to a simple cycle
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
      lineWidth: 1.5
    });
  };

  return (
    <>
      {isCollapsed && (
        <CollapsedMenuButton onClick={() => setIsCollapsed(false)} />
      )}

      <aside 
        className="sidebar" 
        style={{ 
          width: isCollapsed ? '0px' : `${width}px`, 
          borderLeft: isCollapsed ? 'none' : '1px solid var(--border-color)',
          padding: isCollapsed ? '0px' : '1rem',
          position: 'relative',
          overflow: isCollapsed ? 'hidden' : 'auto'
        }}
      >
        <div className={`sidebar-content ${isCollapsed ? 'hidden' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid var(--text-color)', paddingBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="./favicon.svg" alt="logo" style={{ width: '28px', height: '28px', borderRadius: '4px' }} />
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>WebGraphy</h2>
              <button 
                onClick={() => setShowHelp(true)}
                title="Help & Interactions"
                aria-label="Help & Interactions"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', minWidth: 'var(--touch-target-size)', minHeight: 'var(--touch-target-size)' }}
              >
                <HelpCircle size={22} />
              </button>
            </div>
            <button onClick={() => setIsCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px', minWidth: 'var(--touch-target-size)', minHeight: 'var(--touch-target-size)' }} title="Collapse Menu" aria-label="Collapse Menu">
              <ChevronRight size={22} />
            </button>
          </div>
          
          <div className="section">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <button onClick={() => toggleSection('sources')} aria-expanded={openSections.sources} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1, background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', font: 'inherit', color: 'inherit', minHeight: 'var(--touch-target-size)' }}>
                <ChevronRight size={18} style={{ marginRight: '4px', transition: 'transform 0.15s', transform: openSections.sources ? 'rotate(90deg)' : 'none' }} />
                <FilePlus size={18} style={{ marginRight: '5px' }} />
                Data Sources
              </button>
              <button
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Import Data Source"
                aria-label="Import Data Source"
              >
                {isImporting ? '...' : <Upload size={18} />}
              </button>
              <input
                type="file"
                name="file-import"
                ref={fileInputRef}
                onChange={async (e) => {
                   if (e.target.files?.[0]) {
                     importFile(e.target.files[0]);
                   }
                }}
                style={{ display: 'none' }}
                accept=".csv,.json"
              />
            </div>
            {openSections.sources && <div className="sources-list" style={{ marginBottom: '1rem' }}>
              {datasets.map(d => (
                <div key={d.id} style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div
                      onDoubleClick={() => setViewingDatasetId(d.id)}
                      style={{ fontWeight: 'bold', fontSize: 'var(--mobile-font-size)', flex: '1 1 100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}
                      title={`${d.name} (Double-click to view data table)`}
                    >
                      {d.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' }}>
                      {/* X Axis selection */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <select
                          name={`dataset-x-column-${d.id}`}
                          aria-label={`X Column for ${d.name}`}
                          value={d.xAxisColumn}
                          onChange={(e) => updateDataset(d.id, { xAxisColumn: e.target.value })}
                          style={{ width: '90px', fontSize: 'var(--mobile-font-size)', padding: '2px', height: 'var(--touch-target-size)', minWidth: 0, flexShrink: 1, border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', background: '#f8fafc' }}
                          title="X Column (Source Wide)"
                        >
                          {d.columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button
                          onClick={() => {
                            const currentXIdx = parseInt(d.xAxisId?.split('-')[1]) || 1;
                            const nextXIdx = (currentXIdx % 9) + 1;
                            updateDataset(d.id, { xAxisId: `axis-${nextXIdx}` });
                          }}
                          style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', fontSize: 'var(--mobile-font-size)', padding: '0', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontWeight: 'bold', flexShrink: 0, color: '#475569' }}
                          title="Cycle X-Axis (1-9)"
                          aria-label="Cycle X-Axis">
                          {parseInt(d.xAxisId?.split('-')[1]) || 1}
                        </button>
                        <button
                          onClick={() => {
                            const axisId = d.xAxisId || 'axis-1';
                            const currentMode = xAxes.find(a => a.id === axisId)?.xMode || 'date';
                            const { updateXAxis } = useGraphStore.getState();
                            updateXAxis(axisId, { xMode: currentMode === 'date' ? 'numeric' : 'date' });
                          }}
                          style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', padding: '0', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}
                          title={xAxes.find(a => a.id === (d.xAxisId || 'axis-1'))?.xMode === 'date' ? "Switch to Decimal Mode" : "Switch to Time Mode"}
                          aria-label="Toggle X-Axis Mode"
                        >
                          {xAxes.find(a => a.id === (d.xAxisId || 'axis-1'))?.xMode === 'date' ? <Clock size={16} /> : <Hash size={16} />}
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#f1f5f9', borderRadius: '3px', padding: '1px' }}>
                          <button
                            onClick={() => moveDataset(d.id, -1)}
                            disabled={datasets.indexOf(d) === 0}
                            style={{ padding: '0', cursor: 'pointer', background: 'none', border: 'none', color: '#475569', height: 'calc(var(--touch-target-size) / 2)', width: 'var(--touch-target-size)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: datasets.indexOf(d) === 0 ? 0.3 : 1 }}
                            title="Move Up"
                            aria-label="Move Up"
                          >
                            <ChevronUp size={16} strokeWidth={3} />
                          </button>
                          <button
                            onClick={() => moveDataset(d.id, 1)}
                            disabled={datasets.indexOf(d) === datasets.length - 1}
                            style={{ padding: '0', cursor: 'pointer', background: 'none', border: 'none', color: '#475569', height: 'calc(var(--touch-target-size) / 2)', width: 'var(--touch-target-size)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: datasets.indexOf(d) === datasets.length - 1 ? 0.3 : 1 }}
                            title="Move Down"
                            aria-label="Move Down"
                          >
                            <ChevronDown size={16} strokeWidth={3} />
                          </button>
                        </div>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Are you sure you want to remove the data source "${d.name}"?`)) {
                              await persistence.deleteDataset(d.id);
                              removeDataset(d.id);
                            }
                          }}
                          style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', cursor: 'pointer', background: 'none', border: 'none', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Remove data source"
                          aria-label="Remove data source"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <details>
                    <summary style={{ fontSize: 'var(--mobile-font-size)', cursor: 'pointer', userSelect: 'none', marginBottom: '8px', color: '#64748b', display: 'flex', alignItems: 'center', padding: '6px 0' }}>
                      <ChevronRight size={18} className="details-chevron" />
                      <span style={{ flex: 1 }}>Columns ({d.columns.length}) &mdash; {d.rowCount.toLocaleString()} rows</span>
                    </summary>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                      <input
                        type="text"
                        name={`column-filter-${d.id}`}
                        aria-label={`Filter columns for ${d.name}`}
                        autoComplete="off"
                        placeholder="Filter..."
                        maxLength={100}
                        value={columnFilters[d.id] || ''}
                        onChange={(e) => setColumnFilters({ ...columnFilters, [d.id]: e.target.value })}
                        style={{ width: '100%', padding: '8px 30px 8px 8px', fontSize: 'var(--mobile-font-size)', border: '1px solid #ced4da', borderRadius: '4px', boxSizing: 'border-box', outline: 'none', height: 'var(--touch-target-size)' }}
                      />
                      {columnFilters[d.id] && (
                        <button
                          onClick={() => setColumnFilters({ ...columnFilters, [d.id]: '' })}
                          aria-label="Clear filter"
                          title="Clear filter"
                          style={{ position: 'absolute', right: '4px', background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 'var(--touch-target-size)', minHeight: 'var(--touch-target-size)' }}
                        >
                          <X size={18} style={{ color: '#999' }} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(() => {
                        const filterVal = (columnFilters[d.id] || '').toLowerCase();
                        const filteredColumns = d.columns.filter(col => col.toLowerCase().includes(filterVal));

                        if (filteredColumns.length === 0) {
                          return <span style={{ fontSize: 'var(--mobile-font-size)', color: '#999', padding: '4px' }}>No columns found.</span>;
                        }

                        return filteredColumns.map(col => (
                          <button
                            key={col}
                            onClick={() => createSeries(d.id, col)}
                            style={{ fontSize: 'var(--mobile-font-size)', padding: '6px 10px', cursor: 'pointer', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#475569', minHeight: 'var(--touch-target-size)' }}
                          >
                            {col}
                          </button>
                        ));
                      })()}
                    </div>
                  </details>
                </div>
              ))}
            </div>}
          </div>

          <div className="section">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <button onClick={() => toggleSection('series')} aria-expanded={openSections.series} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1, background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', font: 'inherit', color: 'inherit', minHeight: 'var(--touch-target-size)' }}>
                <ChevronRight size={18} style={{ marginRight: '4px', transition: 'transform 0.15s', transform: openSections.series ? 'rotate(90deg)' : 'none' }} />
                <Layout size={18} style={{ marginRight: '5px' }} />
                Data Series
              </button>
            </div>
            {openSections.series && <div className="series-list" style={{ marginBottom: '1rem' }}>
              {series.length === 0 && <p style={{ fontSize: 'var(--mobile-font-size)', color: '#666', padding: '8px' }}>Click a column above to add a series.</p>}
              {series.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, var(--touch-target-size)) 100px 1fr var(--touch-target-size)', gap: '4px', padding: '4px 0', borderBottom: '2px solid var(--border-color)', color: '#64748b', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--sidebar-bg)', zIndex: 1 }}>
                  <div title="Order" style={{ display: 'flex', justifyContent: 'center' }}><ArrowUpDown size={14} /></div>
                  <div title="Y-Axis #" style={{ display: 'flex', justifyContent: 'center' }}><Hash size={14} /></div>
                  <div title="Side (L/R)" style={{ display: 'flex', justifyContent: 'center' }}><MoveHorizontal size={14} /></div>
                  <div title="Grid" style={{ display: 'flex', justifyContent: 'center' }}><Rows size={14} /></div>
                  <div title="Line Style" style={{ display: 'flex', justifyContent: 'center' }}><Minus size={14} /></div>
                  <div title="Line Width" style={{ display: 'flex', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}>W</div>
                  <div title="Point Style" style={{ display: 'flex', justifyContent: 'center' }}><Circle size={12} /></div>
                  <div title="Color" style={{ display: 'flex', justifyContent: 'center' }}><Palette size={14} /></div>
                  <div title="Data Column" style={{ paddingLeft: '4px', fontSize: '10px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>COL</div>
                  <div title="Series Name" style={{ paddingLeft: '4px', fontSize: '10px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>NAME</div>
                  <div />
                </div>
              )}
              {[...series].reverse().map((s, i) => {
                const dataset = datasets.find(d => d.id === s.sourceId);
                return (
                  <SeriesConfigUI
                    key={s.id}
                    series={s}
                    dataset={dataset}
                    isFirst={i === 0}
                    isLast={i === series.length - 1}
                    onMove={(delta) => moveSeries(s.id, delta)}
                  />
                );
              })}
            </div>}
          </div>

          <div className="section" style={{ marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid #dee2e6' }}>
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <button onClick={() => toggleSection('views')} aria-expanded={openSections.views} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1, background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', font: 'inherit', color: 'inherit', minHeight: 'var(--touch-target-size)' }}>
                <ChevronRight size={18} style={{ marginRight: '4px', transition: 'transform 0.15s', transform: openSections.views ? 'rotate(90deg)' : 'none' }} />
                <Eye size={18} style={{ marginRight: '5px' }} />
                Data Views
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); saveView(''); }}
                style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Save Data View"
                aria-label="Save Data View"
              >
                <Bookmark size={18} />
              </button>
            </div>
            {openSections.views && <div style={{ padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', background: '#fff', marginBottom: '1rem' }}>
              
              {customViews.length === 0 && (
                <div style={{ fontSize: 'var(--mobile-font-size)', color: '#64748b', textAlign: 'center', padding: '8px' }}>No saved views.</div>
              )}
              
              {customViews.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {customViews.map(v => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      {editingViewId === v.id ? (
                        <input
                          autoFocus
                          name="view-name"
                          aria-label="Rename view"
                          autoComplete="off"
                          maxLength={50}
                          value={tempViewName}
                          onChange={(e) => setTempViewName(e.target.value)}
                          onBlur={() => {
                            if (tempViewName.trim()) updateViewName(v.id, tempViewName.trim());
                            setEditingViewId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (tempViewName.trim()) updateViewName(v.id, tempViewName.trim());
                              setEditingViewId(null);
                            }
                            if (e.key === 'Escape') setEditingViewId(null);
                          }}
                          style={{ flex: 1, fontSize: 'var(--mobile-font-size)', padding: '0 4px', height: 'var(--touch-target-size)', marginRight: '8px' }}
                        />
                      ) : (
                        <span 
                          onClick={() => { setEditingViewId(v.id); setTempViewName(v.name); }}
                          style={{ fontSize: 'var(--mobile-font-size)', fontWeight: 'bold', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px', cursor: 'text', padding: '4px 0' }}
                          title="Click to rename"
                        >
                          {v.name}
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => applyView(v.id)}
                          style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', cursor: 'pointer', background: 'none', border: 'none', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Apply view bounds"
                          aria-label="Apply view bounds"
                        >
                          <Eye size={18} />
                        </button>
                        <button 
                          onClick={() => deleteView(v.id)}
                          style={{ width: 'var(--touch-target-size)', height: 'var(--touch-target-size)', cursor: 'pointer', background: 'none', border: 'none', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Delete view"
                          aria-label="Delete view"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>

          <div className="section" style={{ paddingTop: '0.5rem', borderTop: '1px solid #dee2e6' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <button
                onClick={handleExportSVG}
                style={{ flex: 1, padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-color)', fontSize: 'var(--mobile-font-size)', minHeight: '44px' }}
              >
                <FileImage size={18} /> Export SVG
              </button>
              <button
                onClick={handleExportPNG}
                style={{ flex: 1, padding: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-color)', fontSize: 'var(--mobile-font-size)', minHeight: '44px' }}
              >
                <Image size={18} /> Export PNG
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={async () => {
                  if (confirm('Restore demo data? Current settings will be cleared.')) {
                    await persistence.clearAppState();
                    const db = await indexedDB.open('webgraphy-db');
                    db.onsuccess = () => {
                      const database = db.result;
                      const transaction = database.transaction(['datasets'], 'readwrite');
                      transaction.objectStore('datasets').clear();
                      transaction.oncomplete = () => {
                        loadDemoData().then(() => window.location.reload());
                      };
                    };
                  }
                }}
                style={{ flex: 1, padding: '12px', cursor: 'pointer', background: '#fff', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: 'var(--mobile-font-size)', minHeight: '44px' }}
              >
                <RotateCcw size={18} /> Demo
              </button>
              <button
                onClick={async () => {
                  if (confirm('Delete all datasets and reset all settings?')) {
                    await persistence.clearAppState();
                    localStorage.setItem('webgraphy-cleared', '1');
                    const db = await indexedDB.open('webgraphy-db');
                    db.onsuccess = () => {
                      const database = db.result;
                      const transaction = database.transaction(['datasets'], 'readwrite');
                      transaction.objectStore('datasets').clear();
                      transaction.oncomplete = () => window.location.reload();
                    };
                  }
                }}
                style={{ flex: 1, padding: '12px', cursor: 'pointer', background: '#fff', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: 'var(--mobile-font-size)', minHeight: '44px' }}
              >
                <RotateCcw size={18} /> Reset
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#999', paddingBottom: '1rem' }}>
            <span>v0.3.4</span>
            <span>|</span>
            <button 
              onClick={() => setShowImprint(true)} 
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline', padding: '4px', fontSize: '12px' }}
            >
              Imprint
            </button>
            <span>|</span>
            <button 
              onClick={() => setShowLicense(true)} 
              style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', textDecoration: 'underline', padding: '4px', fontSize: '12px' }}
            >
              License
            </button>
          </div>
        </div>

        {/* Resizer overlay positioned relative to sidebar */}
        {!isCollapsed && (
          <div 
            onMouseDown={() => setIsResizing(true)}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '5px',
              cursor: 'col-resize',
              background: isResizing ? '#3b82f6' : 'transparent',
              zIndex: 10,
              transition: 'background 0.2s'
            }}
          />
        )}
      </aside>
      {showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
      {pendingFile && (
        <ImportSettingsDialog
          fileName={pendingFile.file.name}
          fileContent={pendingFile.preview}
          fileType={pendingFile.type}
          onConfirm={confirmImport}
          onCancel={cancelImport}
        />
      )}
      {selectedDatasetForView && (
        <DataViewModal
          dataset={selectedDatasetForView}
          onClose={() => setViewingDatasetId(null)}
        />
      )}
    </>
  );
};

import React, { useState } from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { type SeriesConfig, type Dataset } from '../../services/persistence';
import { Trash2, Circle, Square, X, Rows, Ban, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { ColorPicker } from './ColorPicker';

interface Props {
  series: SeriesConfig;
  dataset: Dataset | undefined;
  isFirst?: boolean;
  isLast?: boolean;
  onMove?: (delta: -1 | 1) => void;
}

export const SeriesConfigUI: React.FC<Props> = ({ series, dataset, isFirst, isLast, onMove }) => {
  const { updateSeries, removeSeries, yAxes, updateYAxis, updateSeriesVisibility } = useGraphStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const handleUpdate = (updates: Partial<SeriesConfig>) => {
    updateSeries(series.id, updates);
  };

  const toggleVisibility = () => {
    updateSeriesVisibility(series.id, !series.hidden);
  };

  const currentYAxisIndex = parseInt(series.yAxisId.split('-')[1]) || 1;
  const currentYAxis = yAxes.find(a => a.id === series.yAxisId);

  const cycleYAxis = () => {
    const nextIndex = (currentYAxisIndex % 9) + 1;
    handleUpdate({ yAxisId: `axis-${nextIndex}` });
  };

  const renderPointStyleIcon = () => {
    const size = 12;
    switch (series.pointStyle) {
      case 'circle': return <Circle size={size} fill="currentColor" />;
      case 'square': return <Square size={size} fill="currentColor" />;
      case 'cross': return <X size={size + 2} strokeWidth={3} />;
      case 'none': return <Ban size={size + 2} strokeWidth={2.5} opacity={0.5} />;
      default: return null;
    }
  };

  const renderLineStyleIcon = () => {
    const color = "currentColor";
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" className="sc-line-icon">
        {series.lineStyle === 'solid' && <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" />}
        {series.lineStyle === 'dashed' && <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeDasharray="4,3" />}
        {series.lineStyle === 'dotted' && <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeDasharray="1,3" strokeLinecap="round" />}
        {series.lineStyle === 'none' && (
          <g opacity="0.4">
            <line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="1" strokeDasharray="2,2" />
            <line x1="4" y1="4" x2="12" y2="12" stroke="#dc3545" strokeWidth="1.5" opacity="1" />
          </g>
        )}
      </svg>
    );
  };

  return (
    <div className={`sc-row${series.hidden ? ' sc-row--hidden' : ''}`}>

      {/* Visibility Toggle */}
      <button
        onClick={toggleVisibility}
        className={`sc-btn sc-btn--plain`}
        style={{ color: series.hidden ? '#94a3b8' : 'var(--accent)' }}
        title={series.hidden ? "Show Series" : "Hide Series"}
        aria-label={series.hidden ? "Show Series" : "Hide Series"}
      >
        {series.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>

      {/* Reorder Buttons (UP/DOWN) */}
      <div className="sc-reorder">
        <button
          onClick={(e) => { e.stopPropagation(); onMove?.(-1); }}
          disabled={isFirst}
          className="sc-reorder-half sc-reorder-half--top"
          style={{ opacity: isFirst ? 0.3 : 1, cursor: isFirst ? 'default' : 'pointer' }}
          title="Move Up" aria-label="Move Up"
        >
          <ChevronUp size={14} strokeWidth={3} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMove?.(1); }}
          disabled={isLast}
          className="sc-reorder-half"
          style={{ opacity: isLast ? 0.3 : 1, cursor: isLast ? 'default' : 'pointer' }}
          title="Move Down" aria-label="Move Down"
        >
          <ChevronDown size={14} strokeWidth={3} />
        </button>
      </div>

      {/* Y Axis Cycle Button (1-9) */}
      <button
        onClick={cycleYAxis}
        className="sc-btn"
        style={{ fontWeight: 'bold' }}
        title="Cycle Y-Axis (1-9)" aria-label="Cycle Y-Axis"
      >
        {currentYAxisIndex}
      </button>

      {/* L/R Side Toggle */}
      {currentYAxis ? (
        <button
          onClick={() => updateYAxis(currentYAxis.id, { position: currentYAxis.position === 'left' ? 'right' : 'left' })}
          className="sc-btn"
          title={currentYAxis.position === 'left' ? "Left Axis" : "Right Axis"}
          aria-label="Toggle Left/Right Axis"
        >
          {currentYAxis.position === 'left' ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 13V2m-2 3l2-3 2 3M3 13h11m-3-2l3 2-3 2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 13V2m-2 3l2-3 2 3M13 13H2m3-2l-3 2 3 2" />
            </svg>
          )}
        </button>
      ) : <div className="sc-cell-placeholder" />}

      {/* Grid Toggle */}
      {currentYAxis ? (
        <button
          onClick={() => updateYAxis(currentYAxis.id, { showGrid: !currentYAxis.showGrid })}
          className={`sc-btn${currentYAxis.showGrid ? '' : ' sc-btn--plain'}`}
          title="Toggle Grid" aria-label="Toggle Grid"
        >
          {currentYAxis.showGrid ? <Rows size={16} /> : <Square size={16} />}
        </button>
      ) : <div className="sc-cell-placeholder" />}

      {/* Line Style Cycle */}
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

      {/* Point Style Cycle */}
      <button
        onClick={() => {
          const styles = ['circle', 'square', 'cross', 'none'] as const;
          const next = styles[(styles.indexOf(series.pointStyle) + 1) % styles.length];
          handleUpdate({ pointStyle: next });
        }}
        className="sc-btn"
        title="Point Style" aria-label="Cycle Point Style"
      >
        {renderPointStyleIcon()}
      </button>

      {/* Color Picker */}
      <ColorPicker
        color={series.lineColor}
        onChange={(newColor) => handleUpdate({ lineColor: newColor, pointColor: newColor })}
        ariaLabel={`Color for ${series.name || series.yColumn}`}
      />

      {/* Y Column Selector */}
      <select
        name={`series-y-column-${series.id}`}
        aria-label={`Y Column for ${series.name || series.yColumn}`}
        value={series.yColumn}
        onChange={(e) => handleUpdate({ yColumn: e.target.value })}
        className="sc-select"
        title="Y Column"
      >
        {dataset?.columns.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {/* Editable Title */}
      <div className="sc-title-cell">
        {isEditingTitle ? (
          <input
            autoFocus
            name={`series-title-${series.id}`}
            aria-label="Rename series"
            autoComplete="off"
            maxLength={100}
            defaultValue={series.name || series.yColumn}
            onBlur={(e) => { handleUpdate({ name: e.target.value }); setIsEditingTitle(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { handleUpdate({ name: e.currentTarget.value }); setIsEditingTitle(false); }
              if (e.key === 'Escape') { setIsEditingTitle(false); }
            }}
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

      {/* Delete Button */}
      <button
        onClick={() => removeSeries(series.id)}
        className="sc-btn sc-btn--plain"
        style={{ borderRight: 'none', color: 'var(--danger)' }}
        title="Delete" aria-label="Delete Series"
      >
        <Trash2 size={16} />
      </button>

    </div>
  );
};



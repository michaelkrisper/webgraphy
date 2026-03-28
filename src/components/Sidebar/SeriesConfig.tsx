import React from 'react';
import { useGraphStore } from '../../store/useGraphStore';
import { type SeriesConfig } from '../../services/persistence';
import { Settings, Trash2, Plus } from 'lucide-react';

interface Props {
  series: SeriesConfig;
  datasetName: string;
  columns: string[];
}

export const SeriesConfigUI: React.FC<Props> = ({ series, datasetName, columns }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { updateSeries, removeSeries, yAxes, addYAxis, updateYAxis } = useGraphStore();

  const handleUpdate = (updates: Partial<SeriesConfig>) => {
    updateSeries(series.id, updates);
  };

  const handleCreateYAxis = () => {
    const newId = crypto.randomUUID();
    addYAxis({
      id: newId,
      name: `Axis ${yAxes.length + 1}`,
      min: 0,
      max: 100,
      position: 'right',
      color: series.lineColor
    });
    handleUpdate({ yAxisId: newId });
  };

  const currentAxis = yAxes.find(a => a.id === series.yAxisId);

  return (
    <div style={{ border: '1px solid #dee2e6', borderRadius: '4px', marginBottom: '0.5rem', padding: '0.5rem', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {series.yColumn}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={() => setIsExpanded(!isExpanded)} style={{ padding: '2px 4px', cursor: 'pointer', display: 'flex' }}>
            <Settings size={14} />
          </button>
          <button onClick={() => removeSeries(series.id)} style={{ padding: '2px 4px', cursor: 'pointer', display: 'flex', color: 'red', border: 'none', background: 'none' }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
          <div style={{ marginBottom: '8px' }}>
             <strong>X-Column:</strong>
             <select 
               value={series.xColumn} 
               onChange={(e) => handleUpdate({ xColumn: e.target.value })}
               style={{ width: '100%', fontSize: '0.8rem' }}
             >
               {columns.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>

          <div style={{ marginBottom: '8px', border: '1px solid #eee', padding: '5px', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <strong>Y-Axis:</strong>
              <button onClick={handleCreateYAxis} style={{ fontSize: '10px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <Plus size={10} /> New
              </button>
            </div>
            <select 
              value={series.yAxisId} 
              onChange={(e) => handleUpdate({ yAxisId: e.target.value })}
              style={{ width: '100%', marginBottom: '5px' }}
            >
              {yAxes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.position})</option>)}
            </select>
            
            {currentAxis && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <select 
                    value={currentAxis.position} 
                    onChange={(e) => updateYAxis(currentAxis.id, { position: e.target.value as any })}
                    style={{ flex: 1, fontSize: '10px' }}
                  >
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                  <input 
                    type="text" 
                    value={currentAxis.name} 
                    onChange={(e) => updateYAxis(currentAxis.id, { name: e.target.value })}
                    style={{ flex: 2, fontSize: '10px' }}
                    placeholder="Axis Name"
                  />
                </div>
                <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={currentAxis.showGrid} 
                    onChange={(e) => updateYAxis(currentAxis.id, { showGrid: e.target.checked })} 
                  />
                  Show Major Grid
                </label>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <strong>Pt Color:</strong>
              <input 
                type="color" 
                value={series.pointColor} 
                onInput={(e) => handleUpdate({ pointColor: (e.target as HTMLInputElement).value })} 
                style={{ width: '100%', height: '20px', padding: 0 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <strong>Pt Size:</strong>
              <input 
                type="number" 
                value={series.pointSize} 
                onInput={(e) => handleUpdate({ pointSize: parseFloat((e.target as HTMLInputElement).value) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
            <div style={{ flex: 1 }}>
              <strong>Line Color:</strong>
              <input 
                type="color" 
                value={series.lineColor} 
                onInput={(e) => handleUpdate({ lineColor: (e.target as HTMLInputElement).value })} 
                style={{ width: '100%', height: '20px', padding: 0 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <strong>Width:</strong>
              <input 
                type="number" 
                step="0.1"
                value={series.lineWidth} 
                onInput={(e) => handleUpdate({ lineWidth: parseFloat((e.target as HTMLInputElement).value) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

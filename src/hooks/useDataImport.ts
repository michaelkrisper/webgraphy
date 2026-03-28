import { useState, useCallback } from 'react';
import { persistence, type Dataset } from '../services/persistence';
import { useGraphStore } from '../store/useGraphStore';

/**
 * Hook to manage data import logic and worker communication.
 */
export const useDataImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addDataset } = useGraphStore();

  const importFile = useCallback(async (file: File) => {
    setIsImporting(true);
    setError(null);

    const type = file.name.endsWith('.csv') ? 'csv' : 'json';
    const worker = new Worker(new URL('../workers/data-parser.worker.ts', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = async (event) => {
      const { type, dataset, error } = event.data;

      if (type === 'success') {
        const ds = dataset as Dataset;
        const currentDatasets = useGraphStore.getState().datasets;
        
        // Add A-Z prefix
        const letter = String.fromCharCode(65 + currentDatasets.length);
        const prefix = `${letter}: `;
        ds.name = `${letter} - ${ds.name}`;
        ds.columns = ds.columns.map(c => `${prefix}${c}`);

        await persistence.saveDataset(ds);
        addDataset(ds);
        setIsImporting(false);
        worker.terminate();
      } else if (type === 'error') {
        setError(error);
        setIsImporting(false);
        worker.terminate();
      }
    };

    worker.postMessage({ file, type });
  }, [addDataset]);

  return { importFile, isImporting, error };
};

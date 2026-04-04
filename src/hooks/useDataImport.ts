import { useState, useCallback } from 'react';
import { persistence, type Dataset } from '../services/persistence';
import { useGraphStore } from '../store/useGraphStore';
import type { ImportSettings } from '../types/import';

/**
 * Hook to manage data import logic and worker communication.
 */
export const useDataImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File, preview: string, type: 'csv' | 'json' } | null>(null);
  const { addDataset } = useGraphStore();

  const initiateImport = useCallback(async (file: File) => {
    setError(null);
    const type = file.name.endsWith('.csv') ? 'csv' : 'json';

    // Read preview (first 10KB)
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = e.target?.result as string;
      setPendingFile({ file, preview, type });
    };
    reader.readAsText(file.slice(0, 10240));
  }, []);

  const confirmImport = useCallback(async (settings: ImportSettings) => {
    if (!pendingFile) return;
    setIsImporting(true);
    setError(null);

    const { file, type } = pendingFile;
    const worker = new Worker(new URL('../workers/data-parser.worker.ts', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = async (event) => {
      const { type: msgType, dataset, error: msgError } = event.data;

      if (msgType === 'success') {
        const ds = dataset as Dataset;
        const currentDatasets = useGraphStore.getState().datasets;
        
        // Add A-Z prefix
        const letter = String.fromCharCode(65 + currentDatasets.length);
        const prefix = `${letter}: `;
        ds.name = `${letter} - ${ds.name}`;
        ds.columns = ds.columns.map(c => `${prefix}${c}`);
        if (ds.xAxisColumn) {
          ds.xAxisColumn = `${prefix}${ds.xAxisColumn}`;
        }

        await persistence.saveDataset(ds);
        addDataset(ds);
        setIsImporting(false);
        setPendingFile(null);
        worker.terminate();
      } else if (msgType === 'error') {
        setError(msgError);
        setIsImporting(false);
        worker.terminate();
      }
    };

    worker.postMessage({ file, type, settings });
  }, [pendingFile, addDataset]);

  const cancelImport = useCallback(() => {
    setPendingFile(null);
  }, []);

  return {
    importFile: initiateImport,
    confirmImport,
    cancelImport,
    pendingFile,
    isImporting,
    error
  };
};

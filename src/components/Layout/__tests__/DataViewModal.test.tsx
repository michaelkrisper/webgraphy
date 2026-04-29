import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DataViewModal } from '../DataViewModal';
import { type Dataset } from '../../../services/persistence';

describe('DataViewModal', () => {
  it('renders with an empty dataset', () => {
    const mockDataset = {
      id: 'ds-1',
      name: 'Empty Dataset',
      columns: ['Time', 'Value'],
      data: [
        { isFloat64: true, refPoint: 0, bounds: { min: 0, max: 0 }, data: new Float32Array() },
        { isFloat64: false, refPoint: 0, bounds: { min: 0, max: 0 }, data: new Float32Array() }
      ],
      rowCount: 0,
      xAxisColumn: 'Time',
      xAxisId: 'x-1'
    };

    const onClose = vi.fn();

    render(<DataViewModal dataset={mockDataset} onClose={onClose} />);

    expect(screen.getByText('Data Source: Empty Dataset')).toBeInTheDocument();
    expect(screen.getByText('Showing first 0 of 0 rows.')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('renders safely with a completely empty dataset (zero columns and data arrays)', () => {
    const mockDataset = {
      id: 'ds-3',
      name: 'No Columns Dataset',
      columns: [],
      data: [],
      rowCount: 0,
      xAxisColumn: '',
      xAxisId: 'x-3'
    };

    const onClose = vi.fn();

    render(<DataViewModal dataset={mockDataset as unknown as Dataset} onClose={onClose} />);

    expect(screen.getByText('Data Source: No Columns Dataset')).toBeInTheDocument();
    expect(screen.getByText('Showing first 0 of 0 rows.')).toBeInTheDocument();
  });

  it('renders with some data', () => {
    const mockDataset = {
      id: 'ds-2',
      name: 'Dataset With Data',
      columns: ['Time', 'Value'],
      data: [
        { isFloat64: true, refPoint: 1672531200000, bounds: { min: 1672531200000, max: 1672531200000 }, data: new Float32Array([0]) },
        { isFloat64: false, refPoint: 0, bounds: { min: 42.5, max: 42.5 }, data: new Float32Array([42.5]) }
      ],
      rowCount: 1,
      xAxisColumn: 'Time',
      xAxisId: 'x-2'
    };

    const onClose = vi.fn();

    // use `as any` as the `dataset` type might be more strict
    render(<DataViewModal dataset={mockDataset as unknown as Dataset} onClose={onClose} />);

    expect(screen.getByText('Data Source: Dataset With Data')).toBeInTheDocument();
    expect(screen.getByText('Showing first 1 of 1 rows.')).toBeInTheDocument();

    // Value test
    expect(screen.getByText('42.5')).toBeInTheDocument();
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DataViewModal } from '../DataViewModal';

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
});

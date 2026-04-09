import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeriesConfigUI } from '../SeriesConfig';
import { useGraphStore } from '../../../store/useGraphStore';
import type { Mock } from 'vitest';

// Mock the store
vi.mock('../../../store/useGraphStore', () => ({
  useGraphStore: vi.fn(),
}));

describe('SeriesConfigUI', () => {
  it('cycles line width when the button is clicked', () => {
    const updateSeries = vi.fn();
    (useGraphStore as unknown as Mock).mockReturnValue({
      updateSeries,
      yAxes: [],
    });

    const mockSeries = {
      id: 'series-1',
      datasetId: 'ds-1',
      yColumn: 'col-1',
      yAxisId: 'axis-1',
      lineColor: '#ff0000',
      lineWidth: 1.5,
      lineStyle: 'solid',
      pointStyle: 'circle',
    };

    render(<SeriesConfigUI series={mockSeries as never} dataset={{ id: 'ds-1', columns: ['col-1'] } as never} />);

    const cycleButton = screen.getByLabelText('Cycle Line Width');
    fireEvent.click(cycleButton);

    expect(updateSeries).toHaveBeenCalledWith('series-1', { lineWidth: 2 });
  });

  it('wraps around to 1 when cycling from 3', () => {
    const updateSeries = vi.fn();
    (useGraphStore as unknown as Mock).mockReturnValue({
      updateSeries,
      yAxes: [],
    });

    const mockSeries = {
      id: 'series-1',
      datasetId: 'ds-1',
      yColumn: 'col-1',
      yAxisId: 'axis-1',
      lineColor: '#ff0000',
      lineWidth: 3,
      lineStyle: 'solid',
      pointStyle: 'circle',
    };

    render(<SeriesConfigUI series={mockSeries as never} dataset={{ id: 'ds-1', columns: ['col-1'] } as never} />);

    const cycleButton = screen.getByLabelText('Cycle Line Width');
    fireEvent.click(cycleButton);

    expect(updateSeries).toHaveBeenCalledWith('series-1', { lineWidth: 1 });
  });
});

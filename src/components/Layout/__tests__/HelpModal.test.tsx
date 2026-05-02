import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HelpModal } from '../HelpModal';

describe('HelpModal', () => {
  it('renders the help content correctly', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    // Check modal title
    expect(screen.getByText('Help & Interactions')).toBeInTheDocument();

    // Check section titles
    expect(screen.getByText('Plot Area')).toBeInTheDocument();
    expect(screen.getByText('Axes (X & Y)')).toBeInTheDocument();
    expect(screen.getByText('Keyboard')).toBeInTheDocument();
    expect(screen.getByText('Sidebar')).toBeInTheDocument();

    // Check specific instructions
    expect(screen.getByText('Zoom in and out')).toBeInTheDocument();
    expect(screen.getByText('Pan the chart')).toBeInTheDocument();
    expect(screen.getByText('Synchronize all active X-axes (Zoom/Pan/Keys)')).toBeInTheDocument();

    // Check some specific content from each section
    expect(screen.getByText('Zoom only this specific axis')).toBeInTheDocument();
    expect(screen.getByText('Pan the X axis')).toBeInTheDocument();
    expect(screen.getByText('Import large CSV or JSON files for high performance')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    const closeButton = screen.getByLabelText('Close Help');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpModal } from '../HelpModal';

describe('HelpModal', () => {
  it('renders the help content', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    expect(screen.getByText('Help & Interactions')).toBeDefined();
    expect(screen.getByText('Plot Area')).toBeDefined();
    expect(screen.getByText('Axes (X & Y)')).toBeDefined();
    expect(screen.getByText('Keyboard')).toBeDefined();
    expect(screen.getByText('Sidebar')).toBeDefined();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    const closeButton = screen.getByLabelText('Close Help');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

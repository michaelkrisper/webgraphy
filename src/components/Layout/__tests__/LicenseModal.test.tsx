import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LicenseModal } from '../LicenseModal';

describe('LicenseModal', () => {
  it('renders the license heading and text', () => {
    const onClose = vi.fn();
    render(<LicenseModal onClose={onClose} />);

    expect(screen.getByRole('heading', { name: 'License' })).toBeInTheDocument();
    expect(screen.getByText(/MIT License/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<LicenseModal onClose={onClose} />);

    const closeButton = screen.getByLabelText('Close License');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

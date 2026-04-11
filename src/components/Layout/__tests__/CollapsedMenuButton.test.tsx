import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsedMenuButton } from '../CollapsedMenuButton';

describe('CollapsedMenuButton', () => {
  it('renders correctly with default text and aria-label', () => {
    render(<CollapsedMenuButton onClick={() => {}} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    expect(button).toBeTruthy();
    expect(button.textContent).toBe('Menu');
    expect(button.getAttribute('aria-label')).toBe('Open Menu');
    expect(button.getAttribute('title')).toBe('Open Menu');
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<CollapsedMenuButton onClick={handleClick} />);

    const button = screen.getByRole('button', { name: /open menu/i });
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('changes background color on hover', () => {
    render(<CollapsedMenuButton onClick={() => {}} />);
    const button = screen.getByRole('button', { name: /open menu/i });

    // Initial style
    expect(button.style.background).toBe('rgba(255, 255, 255, 0.8)');

    // Mouse enter
    fireEvent.mouseEnter(button);
    // JSOM might normalize rgba(..., 1) to rgb(...)
    expect(['rgba(255, 255, 255, 1)', 'rgb(255, 255, 255)']).toContain(button.style.background);

    // Mouse leave
    fireEvent.mouseLeave(button);
    expect(button.style.background).toBe('rgba(255, 255, 255, 0.8)');
  });
});

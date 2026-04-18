import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Normal component
const NormalComponent = () => <div>Normal Content</div>;

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <NormalComponent />
      </ErrorBoundary>
    );
    const element = screen.getByText('Normal Content');
    expect(element).toBeTruthy();
  });

  it('accepts level prop for app-level boundary', () => {
    const { container } = render(
      <ErrorBoundary level="app">
        <NormalComponent />
      </ErrorBoundary>
    );
    expect(container.querySelector('[role="complementary"]')).toBeFalsy();
    expect(screen.getByText('Normal Content')).toBeTruthy();
  });

  it('accepts level prop for component-level boundary', () => {
    const { container } = render(
      <ErrorBoundary level="component">
        <NormalComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Normal Content')).toBeTruthy();
  });

  it('is a valid React component', () => {
    const boundary = new ErrorBoundary({ children: <div>test</div> });
    expect(boundary).toBeTruthy();
    expect(boundary.state.hasError).toBe(false);
  });
});

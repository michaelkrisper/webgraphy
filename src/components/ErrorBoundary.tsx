import React from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  level?: 'top' | 'component';
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });
    console.error(
      '[ErrorBoundary]',
      error,
      errorInfo.componentStack
    );
  }

  handleReset = () => {
    if (this.props.level === 'top') {
      window.location.reload();
    } else {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.level === 'top') {
        return (
          <div className="error-page">
            <h1>
              Application Error
            </h1>
            <p>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <pre>
              {this.state.errorInfo?.componentStack}
            </pre>
            <button
              onClick={this.handleReset}
              className="error-page-reset"
            >
              Reset App
            </button>
          </div>
        );
      } else {
        return (
          <div className="error-component">
            <h3>Rendering failed</h3>
            <p>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={this.handleReset}
              className="error-component-reset"
            >
              Retry
            </button>
          </div>
        );
      }
    }

    return this.props.children;
  }
}

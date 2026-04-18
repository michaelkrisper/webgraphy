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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100vh',
              fontFamily: 'sans-serif',
              padding: '20px',
              backgroundColor: '#f5f5f5',
            }}
          >
            <h1 style={{ color: '#d32f2f', marginBottom: '20px' }}>
              Application Error
            </h1>
            <p style={{ color: '#666', marginBottom: '10px' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <pre
              style={{
                backgroundColor: '#fff',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '12px',
                maxHeight: '200px',
                overflow: 'auto',
                marginBottom: '20px',
                border: '1px solid #ccc',
              }}
            >
              {this.state.errorInfo?.componentStack}
            </pre>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 20px',
                backgroundColor: '#1976d2',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Reset App
            </button>
          </div>
        );
      } else {
        return (
          <div
            style={{
              padding: '20px',
              border: '1px solid #d32f2f',
              borderRadius: '4px',
              backgroundColor: '#ffebee',
              color: '#d32f2f',
              fontFamily: 'sans-serif',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Rendering failed</h3>
            <p style={{ fontSize: '14px' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 16px',
                backgroundColor: '#d32f2f',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                marginRight: '8px',
              }}
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

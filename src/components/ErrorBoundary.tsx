import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Graph/BrainExplorer error boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--orange)",
              background: "var(--orange-dim)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-lg)",
              margin: 20,
            }}
          >
            <h3>Something went wrong with the 3D graph</h3>
            <p style={{ opacity: 0.8, fontSize: 14 }}>
              The visualization layer hit an unexpected error. This can happen with very large
              datasets or during rapid interactions.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: undefined })}
              style={{
                marginTop: 12,
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                background: "var(--orange)",
                color: "var(--bg)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
            <div style={{ marginTop: 16, fontSize: 11, opacity: 0.6 }}>
              Try the "Performance" preset in Admin settings or use the Reset View button.
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

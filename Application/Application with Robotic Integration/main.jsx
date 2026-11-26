import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ProofmasterTwin from './ProofmasterTwin';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: "white", color: "red", height: "100vh", overflow: "auto" }}>
          <h2>Something went wrong.</h2>
          <div style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", marginTop: 20 }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const path = window.location.pathname;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {path.startsWith('/twin') ? <ProofmasterTwin /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);

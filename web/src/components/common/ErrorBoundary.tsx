import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  /** Defaults to reloading the page. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/** Last line of defence: a render error shows a way out instead of a blank page. Uses no context on purpose. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Eikon crashed while rendering', error, info.componentStack);
  }

  private reset = () => {
    if (this.props.onReset) {
      this.setState({ error: null });
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={styles.screen} role="alert">
        <h1>Something went wrong</h1>
        <p>Eikon hit an unexpected problem. Reloading usually fixes it.</p>
        <pre className={styles.detail}>{this.state.error.message}</pre>
        <button type="button" className={styles.button} onClick={this.reset}>
          Reload
        </button>
      </div>
    );
  }
}

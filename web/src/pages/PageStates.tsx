import { Button, Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import styles from './PageStates.module.css';

export function PageLoading() {
  return (
    <div className={styles.loading}>
      <Spinner size={26} />
    </div>
  );
}

export function PageError({
  onRetry,
  title = 'Couldn’t load this page',
}: {
  onRetry: () => void;
  title?: string;
}) {
  return (
    <EmptyState
      icon="wifiOff"
      title={title}
      action={
        <Button icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      <p>Eikon’s server didn’t respond. Check that the NAS is reachable over Tailscale.</p>
    </EmptyState>
  );
}

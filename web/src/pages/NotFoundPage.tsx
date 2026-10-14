import { Link } from 'react-router';
import { EmptyState } from '../components/common/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      icon="eyeSlash"
      title="Page not found"
      action={
        <Link to="/" style={{ color: 'var(--accent)' }}>
          Go to Library
        </Link>
      }
    >
      <p>This page doesn’t exist.</p>
    </EmptyState>
  );
}

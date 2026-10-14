import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';
import { useAuthLock } from '../../context/AuthLock';
import { useApi } from '../../context/Dependencies';
import { PageError, PageLoading } from '../../pages/PageStates';
import { LockScreen } from './LockScreen';

/** Shows the lock screen until the server says we're signed in (or that no passcode is set). */
export function AuthGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const client = useQueryClient();
  const { locked, unlock } = useAuthLock();
  const status = useQuery({
    queryKey: queryKeys.authStatus,
    queryFn: () => api.authStatus(),
    staleTime: Infinity,
  });

  if (status.isPending) return <PageLoading />;
  if (status.isError) return <PageError title="Can’t reach Eikon" onRetry={() => status.refetch()} />;

  const needsLogin = locked || (status.data.required && !status.data.authenticated);
  if (!needsLogin) return <>{children}</>;

  const onUnlocked = async () => {
    client.setQueryData(queryKeys.authStatus, { ...status.data, authenticated: true });
    unlock();
    await client.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
  };

  return <LockScreen numeric={status.data.numeric} onUnlocked={() => void onUnlocked()} />;
}

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface AuthLockValue {
  locked: boolean;
  lock(): void;
  unlock(): void;
}

const AuthLockContext = createContext<AuthLockValue | null>(null);

/** Bridge from non-React code (the API client's 401 hook) into the provider. */
export class LockSignal {
  private handler: () => void = () => {};

  listen(handler: () => void): () => void {
    this.handler = handler;
    return () => {
      this.handler = () => {};
    };
  }

  fire = (): void => this.handler();
}

/** Tracks whether the session is known to be locked (e.g. the cookie expired mid-session). */
export function AuthLockProvider({ children, lockSignal }: { children: ReactNode; lockSignal: LockSignal }) {
  const [locked, setLocked] = useState(false);
  useEffect(() => lockSignal.listen(() => setLocked(true)), [lockSignal]);
  const value = useMemo(
    () => ({ locked, lock: () => setLocked(true), unlock: () => setLocked(false) }),
    [locked],
  );
  return <AuthLockContext.Provider value={value}>{children}</AuthLockContext.Provider>;
}

export function useAuthLock(): AuthLockValue {
  const value = useContext(AuthLockContext);
  if (!value) throw new Error('useAuthLock must be used inside <AuthLockProvider>');
  return value;
}

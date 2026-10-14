import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import styles from './Toasts.module.css';

export type ToastTone = 'info' | 'error';

interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastsValue {
  show(text: string, tone?: ToastTone): void;
}

const ToastsContext = createContext<ToastsValue | null>(null);
export const TOAST_MS = 4000;

/** Brief, non-blocking messages ("Downloading…", "Couldn’t save that"), announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [{ toasts }, setState] = useState<{ toasts: Toast[]; nextId: number }>({ toasts: [], nextId: 1 });

  // Stable identities, so callers can list them as effect dependencies freely.
  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    setState(({ toasts: list, nextId }) => ({
      nextId: nextId + 1,
      toasts: [...list.slice(-2), { id: nextId, text, tone }],
    }));
  }, []);
  const dismiss = useCallback(
    (id: number) => setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })),
    [],
  );
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastsContext.Provider value={value}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDone={dismiss} />
        ))}
      </div>
    </ToastsContext.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(toast.id), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDone]);
  return (
    <button
      type="button"
      className={clsx(styles.toast, toast.tone === 'error' && styles.error)}
      onClick={() => onDone(toast.id)}
    >
      {toast.text}
    </button>
  );
}

export function useToasts(): ToastsValue {
  const value = useContext(ToastsContext);
  if (!value) throw new Error('useToasts must be used inside <ToastProvider>');
  return value;
}

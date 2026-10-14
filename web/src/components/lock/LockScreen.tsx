import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useAnimate } from 'motion/react';
import clsx from 'clsx';
import type { LoginResult } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useApi, useDependencies } from '../../context/Dependencies';
import { placeholderToDataUrl } from '../../core/placeholder';
import { Switch } from '../common/Controls';
import { Icon } from '../common/Icon';
import { LogoMark } from '../layout/Logo';
import styles from './LockScreen.module.css';

interface LockScreenProps {
  numeric: boolean;
  onUnlocked: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;
const MAX_LENGTH = 32;

export function secondsLeft(until: number | null, now: number): number {
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** 0..count-1, for lists whose items are identical and identified only by position. */
const positions = (count: number) => Array.from({ length: count }, (_unused, i) => i);

export function LockScreen({ numeric, onUnlocked }: LockScreenProps) {
  const api = useApi();
  const { now } = useDependencies();
  const [passcode, setPasscode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [scope, animate] = useAnimate();
  const wait = secondsLeft(lockedUntil, now());

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(timer);
  }, [wait]);

  const shake = useCallback(() => {
    void animate(scope.current, { x: [0, -14, 12, -9, 6, -3, 0] }, { duration: 0.45 });
  }, [animate, scope]);

  const submit = useCallback(async () => {
    if (!passcode || busy || wait > 0) return;
    setBusy(true);
    const result: LoginResult = await api
      .login({ passcode, remember })
      .catch((): LoginResult => ({ ok: false, error: 'Can’t reach Eikon' }));
    setBusy(false);
    if (result.ok) return onUnlocked();
    setError(result.error);
    setPasscode('');
    if (result.retryAfterSeconds) setLockedUntil(now() + result.retryAfterSeconds * 1000);
    shake();
  }, [api, passcode, remember, busy, wait, now, onUnlocked, shake]);

  const press = useCallback((key: (typeof KEYS)[number]) => {
    setError(null);
    if (key === 'del') setPasscode((p) => p.slice(0, -1));
    else if (key) setPasscode((p) => (p.length < MAX_LENGTH ? p + key : p));
  }, []);

  useEffect(() => {
    if (!numeric) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Enter') void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numeric, press, submit]);

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const message = wait > 0 ? `Too many attempts. Try again in ${wait}s.` : error;

  return (
    <div className={styles.screen}>
      <Mosaic />
      <motion.form
        className={styles.card}
        onSubmit={onFormSubmit}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 260 }}
      >
        <LogoMark size={56} />
        <h1 className={styles.title}>Eikon</h1>
        <p className={styles.prompt}>Enter passcode</p>

        <div ref={scope} className={styles.entry}>
          {numeric ? (
            <div className={styles.dots} aria-label={`${passcode.length} digits entered`} role="status">
              {/* One dot per digit typed; no placeholder dots, since the passcode length isn't known. */}
              {positions(passcode.length).map((position) => (
                <span key={position} className={styles.dot} />
              ))}
            </div>
          ) : (
            <input
              className={styles.input}
              type="password"
              value={passcode}
              onChange={(e) => {
                setError(null);
                setPasscode(e.target.value);
              }}
              autoFocus
              autoComplete="current-password"
              aria-label="Passcode"
              placeholder="Passcode"
            />
          )}
        </div>

        <p className={clsx(styles.message, message && styles.messageShown)} role="alert">
          {message ?? ' '}
        </p>

        {numeric && (
          <div className={styles.keypad}>
            {KEYS.map((key) =>
              key === '' ? (
                <span key="blank" />
              ) : (
                <button
                  key={key}
                  type="button"
                  className={clsx(styles.key, key === 'del' && styles.keyDel)}
                  onClick={() => press(key)}
                  aria-label={key === 'del' ? 'Delete' : key}
                  disabled={wait > 0}
                >
                  {key === 'del' ? <Icon name="delete" size={24} /> : key}
                </button>
              ),
            )}
          </div>
        )}

        <label className={styles.remember}>
          <span>Remember this device</span>
          <Switch label="Remember this device" checked={remember} onChange={setRemember} />
        </label>

        <button type="submit" className={styles.unlock} disabled={!passcode || busy || wait > 0}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </motion.form>
    </div>
  );
}

/** Soft colour field built from library placeholders — no recognisable imagery before sign-in. */
function Mosaic() {
  const api = useApi();
  const { data } = useQuery({
    queryKey: queryKeys.mosaic,
    queryFn: () => api.mosaic(),
    staleTime: Infinity,
    retry: false,
  });
  const cells = data && data.length > 0 ? data : [];
  return (
    <div className={styles.mosaic} aria-hidden="true">
      <div className={styles.mosaicGrid}>
        {positions(Math.min(cells.length, 48)).map((position) => {
          const url = placeholderToDataUrl(cells[position]!);
          return (
            <div
              key={position}
              className={styles.cell}
              style={url ? { backgroundImage: `url(${url})` } : undefined}
            />
          );
        })}
      </div>
      <div className={styles.veil} />
    </div>
  );
}

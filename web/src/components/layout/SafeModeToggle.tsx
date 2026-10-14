import clsx from 'clsx';
import { usePrefs } from '../../context/Prefs';
import { Icon } from '../common/Icon';
import styles from './SafeModeToggle.module.css';

export function SafeModeToggle({ compact = false }: { compact?: boolean }) {
  const { safeMode, setSafeMode } = usePrefs();
  const label = safeMode.enabled ? 'Safe mode on' : 'Safe mode off';
  return (
    <button
      type="button"
      className={clsx(styles.toggle, safeMode.enabled && styles.on, compact && styles.compact)}
      aria-pressed={safeMode.enabled}
      aria-label={label}
      title={label}
      onClick={() => setSafeMode({ enabled: !safeMode.enabled })}
    >
      <Icon name="safe" size={18} />
      {!compact && <span>Safe</span>}
    </button>
  );
}

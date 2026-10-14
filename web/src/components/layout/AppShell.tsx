import { Outlet } from 'react-router';
import { usePrefs } from '../../context/Prefs';
import { Icon } from '../common/Icon';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { useScrollMemory } from './useScrollMemory';
import styles from './AppShell.module.css';

export function AppShell() {
  useScrollMemory();
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
      <TabBar />
      <SafeModeBadge />
    </div>
  );
}

function SafeModeBadge() {
  const { safeMode, setSafeMode } = usePrefs();
  if (!safeMode.enabled) return null;
  return (
    <button
      type="button"
      className={styles.safeBadge}
      onClick={() => setSafeMode({ enabled: false })}
      title="Turn off safe mode"
    >
      <Icon name="safe" size={13} />
      Safe mode
    </button>
  );
}

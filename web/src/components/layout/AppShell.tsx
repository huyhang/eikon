import { Outlet } from 'react-router';
import { usePrefs } from '../../context/Prefs';
import { SIDEBAR_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { Icon } from '../common/Icon';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { useScrollMemory } from './useScrollMemory';
import styles from './AppShell.module.css';

export function AppShell() {
  useScrollMemory();
  // Phones never show the sidebar, so don't mount it (and its queries) there at all.
  const wide = useMediaQuery(SIDEBAR_QUERY);
  return (
    <div className={styles.shell}>
      {wide && <Sidebar />}
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

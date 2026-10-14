import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';
import { Spinner } from '../common/Controls';
import { useOffline, useOfflineAutoSync } from '../../context/Offline';
import { usePrefs } from '../../context/Prefs';
import { SIDEBAR_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useOnline } from '../../hooks/useOnline';
import { Icon } from '../common/Icon';
import { CommandPalette } from '../palette/CommandPalette';
import { BulkBar } from '../selection/BulkBar';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { useScrollMemory } from './useScrollMemory';
import styles from './AppShell.module.css';

export function AppShell() {
  useScrollMemory();
  // Phones never show the sidebar, so don't mount it (and its queries) there at all.
  const wide = useMediaQuery(SIDEBAR_QUERY);
  useOfflineAutoSync();
  return (
    <div className={styles.shell}>
      {wide && <Sidebar />}
      <main className={styles.main}>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
      <TabBar />
      <BulkBar />
      <CommandPalette />
      <SafeModeBadge />
      <OfflineBadge />
    </div>
  );
}

function PageLoading() {
  return (
    <div className={styles.pageLoading}>
      <Spinner />
    </div>
  );
}

/** Says when there's no connection, and where the saved favorites are. */
function OfflineBadge() {
  const online = useOnline();
  const { enabled } = useOffline();
  if (online) return null;
  return (
    <div className={styles.offlineBadge} role="status">
      <Icon name="wifiOff" size={13} />
      {enabled ? (
        <span>
          Offline · <Link to="/favorites">Favorites</Link> are saved
        </span>
      ) : (
        <span>Offline</span>
      )}
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

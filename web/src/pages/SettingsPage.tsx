import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RATINGS, type Rating } from '@eikon/shared';
import type { AuthStatus } from '@eikon/shared';
import { Link } from 'react-router';
import { backupDownloadUrl, EXPORT_URL } from '../api/client';
import {
  useBackups,
  useCreateBackup,
  useRetagAll,
  useRetryFailed,
  useScan,
  useSettings,
  useStatus,
  useUpdateSettings,
} from '../api/hooks';
import { queryKeys } from '../api/queryKeys';
import { useDependencies } from '../context/Dependencies';
import { useOffline } from '../context/Offline';
import { usePrefs } from '../context/Prefs';
import { formatBytes, formatCount, formatPercent, formatRelative } from '../core/format';
import { DENSITY_ROW_HEIGHTS, defaultDensity } from '../core/gestures';
import { hiddenRatings, RATING_LABELS } from '../core/safeMode';
import { describeOfflineState } from '../offline/syncRunner';
import type { ThemePref } from '../services/prefs';
import { Button, Segmented, Switch } from '../components/common/Controls';
import { Icon } from '../components/common/Icon';
import { PageHeader } from '../components/layout/PageHeader';
import styles from './SettingsPage.module.css';

const THEMES: { value: ThemePref; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Automatic' },
];

const SAFE_LEVELS = RATINGS.filter((r) => r !== 'explicit').map((r) => ({
  value: r,
  label: RATING_LABELS[r],
}));

export function SettingsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      <div className={styles.groups}>
        <AppearanceGroup />
        <SafeModeGroup />
        <TaggingGroup />
        <LibraryGroup />
        <OfflineGroup />
        <BackupGroup />
        <AccountGroup />
      </div>
    </div>
  );
}

function Group({ title, footer, children }: { title: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{title}</h2>
      <div className={styles.card}>{children}</div>
      {footer && <p className={styles.footer}>{footer}</p>}
    </section>
  );
}

function Row({ label, detail, children }: { label: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <span>{label}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
      {children}
    </div>
  );
}

function AppearanceGroup() {
  const { theme, setTheme, density, setDensity } = usePrefs();
  const level = density ?? defaultDensity(window.innerWidth);
  return (
    <Group title="Appearance">
      <Row label="Theme">
        <Segmented label="Theme" value={theme} options={THEMES} onChange={setTheme} />
      </Row>
      <Row label="Thumbnail size" detail="Pinch the grid to change it too">
        <input
          type="range"
          className={styles.slider}
          min={0}
          max={DENSITY_ROW_HEIGHTS.length - 1}
          value={level}
          onChange={(e) => setDensity(Number(e.target.value))}
          aria-label="Thumbnail size"
        />
      </Row>
    </Group>
  );
}

function SafeModeGroup() {
  const { safeMode, setSafeMode } = usePrefs();
  const hidden = hiddenRatings({ ...safeMode, enabled: true }).map((r) => RATING_LABELS[r].toLowerCase());
  return (
    <Group
      title="Safe Mode"
      footer={`Saved on this device only. While on, ${hidden.join(', ')} images — and images not analyzed yet — are hidden everywhere.`}
    >
      <Row label="Safe mode">
        <Switch
          label="Safe mode"
          checked={safeMode.enabled}
          onChange={(enabled) => setSafeMode({ enabled })}
        />
      </Row>
      <Row label="Show up to">
        <Segmented<Rating>
          label="Highest rating shown in safe mode"
          value={safeMode.maxRating}
          options={SAFE_LEVELS}
          onChange={(maxRating) => setSafeMode({ maxRating })}
        />
      </Row>
    </Group>
  );
}

function ThresholdSlider({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  // Follow the saved value when it changes elsewhere (React's "adjust state on prop change" pattern).
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <Row label={label} detail={`Show tags at ${formatPercent(draft)} confidence or higher`}>
      <input
        type="range"
        className={styles.slider}
        min={0.1}
        max={0.95}
        step={0.05}
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={() => draft !== value && onCommit(draft)}
        onKeyUp={() => draft !== value && onCommit(draft)}
      />
    </Row>
  );
}

function TaggingGroup() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const status = useStatus();
  const retagAll = useRetagAll();
  const retry = useRetryFailed();
  const { confirm } = useDependencies();
  const tagging = status.data?.tagging;

  const confirmRetag = () => {
    if (confirm('Re-tag every image? Your manual tag edits are kept.')) retagAll.mutate();
  };

  return (
    <Group
      title="Tagging"
      footer="Tags come from the WD tagger on gpubox. Changing thresholds is instant — nothing is re-analyzed."
    >
      <Row
        label="gpubox"
        detail={
          tagging ? `${formatCount(tagging.done)} of ${formatCount(tagging.total)} images tagged` : undefined
        }
      >
        {tagging && (
          <span className={tagging.taggerOnline ? styles.online : styles.offline}>
            {tagging.taggerOnline ? 'Online' : 'Offline'}
          </span>
        )}
      </Row>
      <Row
        label="Similar images"
        detail={
          tagging?.embedModel
            ? `${tagging.embedModel}${tagging.embeddingsPending ? ` · ${formatCount(tagging.embeddingsPending)} waiting` : ''}`
            : 'Off — gpubox has no embedding model'
        }
      />
      {settings.data && (
        <>
          <ThresholdSlider
            label="General tags"
            value={settings.data.generalThreshold}
            onCommit={(generalThreshold) => update.mutate({ generalThreshold })}
          />
          <ThresholdSlider
            label="Character tags"
            value={settings.data.characterThreshold}
            onCommit={(characterThreshold) => update.mutate({ characterThreshold })}
          />
        </>
      )}
      <div className={styles.actions}>
        {(tagging?.failed ?? 0) > 0 && (
          <Button icon="refresh" onClick={() => retry.mutate()} disabled={retry.isPending}>
            Retry {formatCount(tagging!.failed)} failed
          </Button>
        )}
        <Button icon="sparkles" onClick={confirmRetag} disabled={retagAll.isPending}>
          Re-tag all images
        </Button>
      </div>
    </Group>
  );
}

function LibraryGroup() {
  const status = useStatus();
  const scan = useScan();
  const settings = useSettings();
  const update = useUpdateSettings();
  const { now } = useDependencies();
  const s = status.data?.scan;
  const reviewPending = status.data?.review.pending ?? 0;
  const detail = !s
    ? undefined
    : s.phase !== 'idle'
      ? `Scanning… ${formatCount(s.processed)} of ${formatCount(s.total)}`
      : s.lastScanAt
        ? `Last scanned ${formatRelative(s.lastScanAt, now())}`
        : 'Not scanned yet';
  return (
    <Group title="Library" footer="Eikon also checks for new images automatically every few minutes.">
      <Row label="Library folder" detail={detail}>
        <Button
          icon="refresh"
          onClick={() => scan.mutate()}
          disabled={scan.isPending || (s && s.phase !== 'idle')}
        >
          Rescan
        </Button>
      </Row>
      {s?.lastError && <p className={styles.error}>{s.lastError}</p>}
      {settings.data && (
        <Row label="Hide smaller copies" detail="Show only the best copy of a picture in each grid">
          <Switch
            label="Hide smaller copies"
            checked={settings.data.hideDuplicates}
            onChange={(hideDuplicates) => update.mutate({ hideDuplicates })}
          />
        </Row>
      )}
      <LinkRow to="/duplicates" label="Duplicates" />
      <LinkRow
        to="/review"
        label="Review tags"
        detail={reviewPending ? `${formatCount(reviewPending)} waiting` : undefined}
      />
      <LinkRow to="/tags" label="Manage tags" detail="Rename, merge, aliases and implications" />
    </Group>
  );
}

function LinkRow({ to, label, detail }: { to: string; label: string; detail?: string }) {
  return (
    <Link to={to} className={styles.linkRow}>
      <Row label={label} detail={detail}>
        <Icon name="chevronRight" size={16} strokeWidth={2.4} />
      </Row>
    </Link>
  );
}

function OfflineGroup() {
  const { supported, enabled, state, setEnabled, syncNow } = useOffline();
  if (!supported) {
    return (
      <Group title="Offline">
        <Row
          label="Keep favorites available offline"
          detail="Needs Eikon opened over HTTPS (tailscale serve) in a browser with service workers"
        />
      </Group>
    );
  }
  return (
    <Group
      title="Offline"
      footer="Favorites are saved on this device so they open without a connection: on a plane, or away from your tailnet. On iPhone and iPad, add Eikon to the Home Screen so the browser keeps them."
    >
      <Row label="Keep favorites available offline" detail={describeOfflineState(state)}>
        <Switch label="Keep favorites available offline" checked={enabled} onChange={setEnabled} />
      </Row>
      {enabled && (
        <Row label="Sync now" detail="Also happens on its own after you change favorites">
          <Button icon="refresh" onClick={syncNow} disabled={state.phase === 'syncing'}>
            Sync
          </Button>
        </Row>
      )}
    </Group>
  );
}

function BackupGroup() {
  const backups = useBackups();
  const create = useCreateBackup();
  const { now } = useDependencies();
  const latest = backups.data?.[0];
  return (
    <Group
      title="Backups & Export"
      footer="Eikon backs up its database every night and keeps a week of copies in its data folder. The export holds every tag, favorite and rating you set, keyed by file content."
    >
      <Row
        label="Database backups"
        detail={latest ? `Last backup ${formatRelative(latest.createdAt, now())}` : 'No backup yet'}
      >
        <Button icon="refresh" onClick={() => create.mutate()} disabled={create.isPending}>
          Back up now
        </Button>
      </Row>
      {backups.data?.slice(0, 3).map((b) => (
        <a key={b.name} href={backupDownloadUrl(b.name)} download className={styles.linkRow}>
          <Row label={new Date(b.createdAt).toLocaleString()} detail={formatBytes(b.sizeBytes)}>
            <Icon name="download" size={17} />
          </Row>
        </a>
      ))}
      <a href={EXPORT_URL} download className={styles.linkRow}>
        <Row label="Export curation" detail="JSON: tags, favorites, ratings, aliases, saved searches">
          <Icon name="download" size={17} />
        </Row>
      </a>
    </Group>
  );
}

function AccountGroup() {
  const { api, confirm } = useDependencies();
  const offline = useOffline();
  const client = useQueryClient();
  const auth = client.getQueryData<AuthStatus>(queryKeys.authStatus);
  if (!auth?.required) return null;
  const leave = async (everywhere: boolean) => {
    if (everywhere && !confirm('Sign out on every device? Each one will need the passcode again.')) return;
    await (everywhere ? api.signOutEverywhere() : api.logout());
    await offline.forget(); // nothing private stays on a device that's signed out
    client.clear();
    window.location.assign('/');
  };
  if (auth.method === 'tailscale') {
    return (
      <Group
        title="This device"
        footer="Signed in by your Tailscale identity; remove the device from your tailnet to revoke it."
      >
        <Row label="Signed in as" detail={auth.user?.name ?? auth.user?.login}>
          <span className={styles.online}>Tailscale</span>
        </Row>
      </Group>
    );
  }
  return (
    <Group title="This device">
      <div className={styles.actions}>
        <Button variant="danger" icon="lock" onClick={() => void leave(false)}>
          Sign out
        </Button>
        <Button icon="lock" onClick={() => void leave(true)}>
          Sign out all devices
        </Button>
      </div>
    </Group>
  );
}

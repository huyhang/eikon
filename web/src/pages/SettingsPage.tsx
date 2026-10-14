import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RATINGS, type Rating } from '@eikon/shared';
import {
  useRetagAll,
  useRetryFailed,
  useScan,
  useSettings,
  useStatus,
  useUpdateSettings,
} from '../api/hooks';
import { queryKeys } from '../api/queryKeys';
import { useDependencies } from '../context/Dependencies';
import { usePrefs } from '../context/Prefs';
import { formatCount, formatPercent, formatRelative } from '../core/format';
import { DENSITY_ROW_HEIGHTS, defaultDensity } from '../core/gestures';
import { hiddenRatings, RATING_LABELS } from '../core/safeMode';
import type { ThemePref } from '../services/prefs';
import { Button, Segmented, Switch } from '../components/common/Controls';
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
  const tagging = status.data?.tagging;

  const confirmRetag = () => {
    if (window.confirm('Re-tag every image? Your manual tag edits are kept.')) retagAll.mutate();
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
  const { now } = useDependencies();
  const s = status.data?.scan;
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
    </Group>
  );
}

function AccountGroup() {
  const { api } = useDependencies();
  const client = useQueryClient();
  const auth = client.getQueryData<{ required: boolean }>(queryKeys.authStatus);
  if (!auth?.required) return null;
  const signOut = async () => {
    await api.logout();
    client.clear();
    window.location.assign('/');
  };
  return (
    <Group title="This device">
      <div className={styles.actions}>
        <Button variant="danger" icon="lock" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Group>
  );
}

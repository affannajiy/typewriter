import { useLiveQuery } from 'dexie-react-hooks';
import { Download, HardDrive, Play, ShieldCheck, Undo2, Upload } from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Card, PageHeader, Section, Segmented } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import {
  type BackupFile,
  type BackupSummary,
  type RestoreMode,
  analyseBackup,
  backupFileName,
  createBackup,
  latestSnapshot,
  parseBackup,
  restoreBackup,
  restoreSnapshot,
  serialiseBackup,
} from '@/database/backup/backup';
import { BackupError, MAX_BACKUP_BYTES } from '@/database/backup/validate';
import { writeSetting } from '@/database/repositories/settings';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useSettings } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { type SoundDetail, type SoundKind, playTypewriterSound } from '@/services/typewriterSound';
import { type StorageInfo, downloadTextFile, formatBytes, getStorageInfo, isStorageLow, requestPersistence } from '@/services/storage';
import { contrast, isHexColour } from '@/utils/colour';
import { formatDateTime } from '@/utils/dates';
import { describeError } from '@/utils/errors';
import { formatShortcut } from '@/features/editor/commands';
import { type AppSettings, EDITOR_FONTS, EDITOR_LEADINGS, EDITOR_SIZES, EDITOR_WIDTHS, MAX_DAILY_GOAL, PAPER_STYLES, SOUND_MACHINES, type SettingKey, THEME_IDS, type ThemeChoice } from './model';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function SettingsScreen() {
  const settings = useSettings();
  const guarded = useGuarded();
  const set = <K extends SettingKey>(key: K, value: AppSettings[K]) => void guarded(() => writeSetting(key, value));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.settings.title} description={t.settings.description} />
      <AppearanceSection settings={settings} set={set} />
      <TextSection settings={settings} set={set} />
      <Section title={t.settings.writing.title}>
        <Card>
          <Row label={t.settings.writing.pageSize} hint={t.settings.writing.hint}>
            <Segmented
              legend={t.settings.writing.pageSize}
              name="page-size"
              value={settings.pageSize}
              options={(['a4', 'letter', 'a5'] as const).map((value) => ({ value, label: t.settings.writing.sizes[value] }))}
              onChange={(value) => set('pageSize', value)}
            />
          </Row>
          <Row label={t.settings.writing.margin}>
            <Segmented
              legend={t.settings.writing.margin}
              name="page-margin"
              value={settings.pageMargin}
              options={(['narrow', 'normal', 'wide'] as const).map((value) => ({ value, label: t.settings.writing.margins[value] }))}
              onChange={(value) => set('pageMargin', value)}
            />
          </Row>
          <Row label={t.settings.writing.paperStyle} hint={t.settings.writing.paperStyleHint}>
            <Segmented
              legend={t.settings.writing.paperStyle}
              name="paper-style"
              value={settings.paperStyle}
              options={PAPER_STYLES.map((value) => ({ value, label: t.settings.writing.paperStyles[value] }))}
              onChange={(value) => set('paperStyle', value)}
            />
          </Row>
        </Card>
      </Section>
      <SoundSection settings={settings} set={set} />
      <StorageSection settings={settings} />
      <Section title={t.settings.privacy.title}>
        <Card className="flex gap-3 px-4 py-3 text-sm text-ink">
          <ShieldCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-success" />
          <p className="max-w-prose">{t.settings.privacy.body}</p>
        </Card>
      </Section>
      <Section title={t.settings.about.title}>
        <Card className="px-4 py-3 text-sm text-muted">
          <p className="font-display text-2xl font-semibold text-ink">TypeNote</p>
          <p>{t.settings.about.tagline}</p>
          <p className="mt-2">{t.settings.about.version(__APP_VERSION__)}</p>
          <p>{t.settings.about.credits}</p>
        </Card>
      </Section>
    </div>
  );
}

function AppearanceSection({ settings, set }: { settings: AppSettings; set: <K extends SettingKey>(key: K, value: AppSettings[K]) => void }) {
  const themes: ThemeChoice[] = ['system', ...THEME_IDS];
  // The custom accent must stay visible against the page background.
  const [background, setBackground] = useState('#ffffff');
  useEffect(() => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--tn-bg').trim();
    // The theme lives in the stylesheet, outside React: this reads it back after a change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isHexColour(value)) setBackground(value);
  }, [settings.theme]);
  const weakAccent = settings.accent !== null && contrast(settings.accent, background) < 3;

  return (
    <Section title={t.settings.appearance.title}>
      <Card>
        <fieldset className="border-b border-line px-4 py-3">
          <legend className="float-start mb-2 w-full text-sm font-medium text-ink">{t.settings.appearance.theme}</legend>
          <div className="clear-both grid grid-cols-2 gap-2 sm:grid-cols-4">
            {themes.map((theme) => (
              <label key={theme} data-clickable className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink has-checked:border-ink has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus hover:bg-accent-soft">
                <input type="radio" name="theme" value={theme} checked={settings.theme === theme} onChange={() => set('theme', theme)} className="accent-(--tn-accent)" />
                {theme !== 'system' && (
                  <span aria-hidden data-theme={theme} className="size-4 shrink-0 rounded-full border border-line-strong" style={{ background: 'linear-gradient(135deg, var(--tn-bg) 50%, var(--tn-accent) 50%)' }} />
                )}
                {t.settings.appearance.themes[theme]}
              </label>
            ))}
          </div>
        </fieldset>
        <Row label={t.settings.appearance.accent} hint={weakAccent ? t.settings.appearance.accentWeak : t.settings.appearance.accentHint}>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="accent-colour">
              {t.settings.appearance.accent}
            </label>
            <input id="accent-colour" type="color" value={settings.accent ?? '#795b43'} onChange={(e) => set('accent', e.target.value)} className="size-10 rounded border border-line-strong bg-surface p-0.5" />
            <Button disabled={settings.accent === null} onClick={() => set('accent', null)}>
              {t.settings.appearance.accentReset}
            </Button>
          </div>
        </Row>
        <Row label={t.settings.appearance.density}>
          <Segmented
            legend={t.settings.appearance.density}
            name="density"
            value={settings.density}
            options={[
              { value: 'comfortable', label: t.settings.appearance.comfortable },
              { value: 'compact', label: t.settings.appearance.compact },
            ]}
            onChange={(value) => set('density', value)}
          />
        </Row>
        <Row label={t.settings.appearance.motion} hint={t.settings.appearance.motionHint}>
          <Segmented
            legend={t.settings.appearance.motion}
            name="motion"
            value={settings.motion}
            options={[
              { value: 'system', label: t.settings.appearance.motionSystem },
              { value: 'on', label: t.settings.appearance.motionOn },
              { value: 'off', label: t.settings.appearance.motionOff },
            ]}
            onChange={(value) => set('motion', value)}
          />
        </Row>
      </Card>
    </Section>
  );
}

type Setter = <K extends SettingKey>(key: K, value: AppSettings[K]) => void;

/** Typeface, size, spacing and column of the page text, with a sample; focus mode; the daily goal. */
function TextSection({ settings, set }: { settings: AppSettings; set: Setter }) {
  const copy = t.settings.text;
  // The field may hold a half-typed number; only a valid one is stored. While the
  // writer types, the field is theirs: a stored value arriving late must not overwrite it.
  const [goal, setGoal] = useState(String(settings.dailyGoal));
  const [editingGoal, setEditingGoal] = useState(false);
  const [storedGoal, setStoredGoal] = useState(settings.dailyGoal);
  if (storedGoal !== settings.dailyGoal && !editingGoal) {
    setStoredGoal(settings.dailyGoal);
    setGoal(String(settings.dailyGoal));
  }
  const goalNumber = Number(goal);
  const goalValid = goal.trim() !== '' && Number.isInteger(goalNumber) && goalNumber >= 0 && goalNumber <= MAX_DAILY_GOAL;

  return (
    <Section title={copy.title}>
      <Card>
        <Row label={copy.font} hint={copy.fontHint}>
          <Segmented legend={copy.font} name="editor-font" value={settings.editorFont} options={EDITOR_FONTS.map((value) => ({ value, label: copy.fonts[value] }))} onChange={(value) => set('editorFont', value)} />
        </Row>
        <Row label={copy.size}>
          <Segmented legend={copy.size} name="editor-size" value={settings.editorSize} options={EDITOR_SIZES.map((value) => ({ value, label: copy.sizes[value] }))} onChange={(value) => set('editorSize', value)} />
        </Row>
        <Row label={copy.leading}>
          <Segmented legend={copy.leading} name="editor-leading" value={settings.editorLeading} options={EDITOR_LEADINGS.map((value) => ({ value, label: copy.leadings[value] }))} onChange={(value) => set('editorLeading', value)} />
        </Row>
        <Row label={copy.width} hint={copy.widthHint}>
          <Segmented legend={copy.width} name="editor-width" value={settings.editorWidth} options={EDITOR_WIDTHS.map((value) => ({ value, label: copy.widths[value] }))} onChange={(value) => set('editorWidth', value)} />
        </Row>
        {/* The page's own styles, so the sample is exactly what a page will show. */}
        <div
          role="img"
          aria-label={copy.sampleLabel}
          className="tn-page border-b border-line px-4 py-3"
          data-font={settings.editorFont}
          data-size={settings.editorSize}
          data-leading={settings.editorLeading}
          data-paper={settings.paperStyle}
        >
          <div data-layout="continuous">
            <div className="tn-editor flex">
              <p className="tn-prose" style={{ minHeight: 0 }}>
                {copy.sample} {copy.sample}
              </p>
            </div>
          </div>
        </div>
        <Row label={copy.focusDim} hint={copy.focusDimHint(formatShortcut('Mod+Shift+F'))}>
          <Segmented
            legend={copy.focusDim}
            name="focus-dim"
            value={settings.focusDim ? 'on' : 'off'}
            options={[
              { value: 'on', label: copy.focusDimOn },
              { value: 'off', label: copy.focusDimOff },
            ]}
            onChange={(value) => set('focusDim', value === 'on')}
          />
        </Row>
        <Row label={copy.goal} hint={copy.goalHint}>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="daily-goal">
              {copy.goal}
            </label>
            <input
              id="daily-goal"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_DAILY_GOAL}
              step={50}
              value={goal}
              aria-invalid={!goalValid}
              onFocus={() => setEditingGoal(true)}
              onBlur={() => {
                setEditingGoal(false);
                // Leaving the field with an invalid number shows the stored goal again.
                setStoredGoal(settings.dailyGoal);
                setGoal(String(settings.dailyGoal));
              }}
              onChange={(e) => {
                setGoal(e.target.value);
                const next = Number(e.target.value);
                if (e.target.value.trim() !== '' && Number.isInteger(next) && next >= 0 && next <= MAX_DAILY_GOAL) set('dailyGoal', next);
              }}
              className="h-11 w-28 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink tabular-nums aria-invalid:border-danger"
            />
            <output htmlFor="daily-goal" className="text-sm text-muted">
              {goalValid ? copy.goalValue(goalNumber) : copy.goalValue(settings.dailyGoal)}
            </output>
          </div>
        </Row>
      </Card>
    </Section>
  );
}

function SoundSection({ settings, set }: { settings: AppSettings; set: <K extends SettingKey>(key: K, value: AppSettings[K]) => void }) {
  // The slider moves at once; the database write follows.
  const [volume, setVolume] = useState(settings.soundVolume);
  // When the stored value changes (the write landed, or another tab changed it), the slider follows.
  const [stored, setStored] = useState(settings.soundVolume);
  if (stored !== settings.soundVolume) {
    setStored(settings.soundVolume);
    setVolume(settings.soundVolume);
  }

  /** "Dear Sir": a capital, a word, a space, a word, the bell where the setting puts it, the carriage return. */
  const sample = () => {
    const steps: [number, SoundKind, SoundDetail?][] = [
      [0, 'shiftDown'],
      [140, 'key', { char: 'D' }],
      [230, 'shiftUp'],
      [380, 'key', { char: 'e' }],
      [500, 'key', { char: 'a' }],
      [610, 'key', { char: 'r' }],
      [760, 'space'],
      [930, 'key', { char: 's' }],
      [1040, 'key', { char: 'i' }],
      [1150, 'key', { char: 'r' }],
      [1260, 'key', { char: ',' }],
      ...(settings.soundBell === 'margin' ? ([[1300, 'bell']] as [number, SoundKind][]) : []),
      [1900, 'return', { travel: 1, bell: settings.soundBell === 'return' }],
    ];
    for (const [delay, kind, detail] of steps) window.setTimeout(() => playTypewriterSound(kind, volume, detail, settings.soundMachine), delay);
  };

  return (
    <Section title={t.settings.sound.title}>
      <Card>
        <Row label={t.settings.sound.typing} hint={t.settings.sound.typingHint}>
          <Segmented
            legend={t.settings.sound.typing}
            name="typing-sound"
            value={settings.typingSound ? 'on' : 'off'}
            options={[
              { value: 'on', label: t.settings.sound.on },
              { value: 'off', label: t.settings.sound.off },
            ]}
            onChange={(value) => set('typingSound', value === 'on')}
          />
        </Row>
        <Row label={t.settings.sound.volume}>
          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="sound-volume">
              {t.settings.sound.volume}
            </label>
            <input
              id="sound-volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={volume}
              onChange={(e) => {
                const next = Number(e.target.value);
                setVolume(next);
                set('soundVolume', next);
              }}
              className="h-11 w-40 accent-(--tn-accent)"
            />
            <output htmlFor="sound-volume" className="w-10 text-end text-sm text-ink tabular-nums">
              {t.settings.sound.volumeValue(volume)}
            </output>
            <Button icon={Play} disabled={volume === 0} onClick={sample}>
              {t.settings.sound.test}
            </Button>
          </div>
        </Row>
        <Row label={t.settings.sound.bell} hint={t.settings.sound.bellHint}>
          <Segmented
            legend={t.settings.sound.bell}
            name="sound-bell"
            value={settings.soundBell}
            options={[
              { value: 'return', label: t.settings.sound.bellReturn },
              { value: 'margin', label: t.settings.sound.bellMargin },
              { value: 'off', label: t.settings.sound.bellOff },
            ]}
            onChange={(value) => set('soundBell', value)}
          />
        </Row>
        <Row label={t.settings.sound.machine} hint={t.settings.sound.machineHint}>
          <Segmented
            legend={t.settings.sound.machine}
            name="sound-machine"
            value={settings.soundMachine}
            options={SOUND_MACHINES.map((value) => ({ value, label: t.settings.sound.machines[value] }))}
            onChange={(value) => set('soundMachine', value)}
          />
        </Row>
      </Card>
    </Section>
  );
}

interface PendingRestore {
  file: BackupFile;
  summary: BackupSummary;
}

function StorageSection({ settings }: { settings: AppSettings }) {
  const guarded = useGuarded();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge-skip');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const snapshot = useLiveQuery(latestSnapshot, []);

  const refresh = () => void getStorageInfo().then(setInfo, () => setInfo(null));
  useEffect(refresh, []);

  const exportBackup = async () => {
    setBusy('export');
    await guarded(async () => {
      const file = await createBackup();
      downloadTextFile(backupFileName(), serialiseBackup(file));
      await writeSetting('lastBackupAt', Date.now());
      toast({ message: t.settings.storage.exported });
    });
    setBusy(null);
  };

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = ''; // Allow choosing the same file again.
    if (!chosen) return;
    try {
      if (chosen.size > MAX_BACKUP_BYTES) throw new BackupError('too-large');
      const file = parseBackup(await chosen.text());
      setMode('merge-skip');
      setPending({ file, summary: await analyseBackup(file) });
    } catch (error) {
      toast({ tone: 'error', message: describeError(error) });
    }
  };

  const runRestore = async () => {
    if (!pending) return;
    setConfirmReplace(false);
    setBusy('restore');
    await guarded(async () => {
      const report = await restoreBackup(pending.file, mode);
      toast({ message: t.settings.storage.restored(report.added, report.updated, report.skipped) + (report.repaired > 0 ? ` ${t.settings.storage.repaired(report.repaired)}` : '') });
      setPending(null);
    });
    setBusy(null);
    refresh();
  };

  const usage = info?.usage != null ? (info.quota ? t.settings.storage.usageOf(formatBytes(info.usage), formatBytes(info.quota)) : formatBytes(info.usage)) : t.settings.storage.usageUnknown;
  const modes: { value: RestoreMode; label: string; hint: string }[] = [
    { value: 'merge-skip', label: t.settings.storage.modes.mergeSkip, hint: t.settings.storage.modes.mergeSkipHint },
    { value: 'merge-newer', label: t.settings.storage.modes.mergeNewer, hint: t.settings.storage.modes.mergeNewerHint },
    { value: 'replace', label: t.settings.storage.modes.replace, hint: t.settings.storage.modes.replaceHint },
  ];

  return (
    <Section title={t.settings.storage.title}>
      <Card>
        <Row label={t.settings.storage.usage} hint={info && isStorageLow(info) ? t.settings.storage.low : t.settings.storage.usageHint}>
          <p className="flex items-center gap-2 text-sm text-ink">
            <HardDrive size={16} aria-hidden className="text-muted" />
            {usage}
          </p>
        </Row>
        <Row label={t.settings.storage.persistence} hint={info?.persisted ? t.settings.storage.persistedHint : t.settings.storage.notPersistedHint}>
          {info?.persisted ? (
            <p className="text-sm font-medium text-success">{t.settings.storage.persisted}</p>
          ) : (
            <Button
              disabled={!info?.canPersist}
              onClick={() =>
                void guarded(async () => {
                  const granted = await requestPersistence();
                  toast({ message: granted ? t.settings.storage.persistGranted : t.settings.storage.persistRefused });
                  refresh();
                })
              }
            >
              {t.settings.storage.persistRequest}
            </Button>
          )}
        </Row>
        <Row label={t.settings.storage.backup} hint={settings.lastBackupAt ? t.settings.storage.lastBackup(formatDateTime(settings.lastBackupAt)) : t.settings.storage.neverBackedUp}>
          <Button variant="primary" icon={Download} loading={busy === 'export'} onClick={() => void exportBackup()}>
            {t.settings.storage.export}
          </Button>
        </Row>
        <Row label={t.settings.storage.restore} hint={t.settings.storage.restoreHint}>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFileChosen(e)} data-testid="restore-file" />
          <Button icon={Upload} loading={busy === 'restore'} onClick={() => fileInput.current?.click()}>
            {t.settings.storage.chooseFile}
          </Button>
        </Row>
        {snapshot && (
          <Row label={t.settings.storage.undoRestore} hint={t.settings.storage.undoRestoreHint(formatDateTime(snapshot.createdAt))}>
            <Button
              icon={Undo2}
              onClick={() =>
                void guarded(async () => {
                  await restoreSnapshot(snapshot.id);
                  toast({ message: t.settings.storage.undone });
                })
              }
            >
              {t.settings.storage.undoRestoreAction}
            </Button>
          </Row>
        )}
      </Card>

      <Dialog
        open={pending !== null && !confirmReplace}
        onClose={() => setPending(null)}
        title={t.settings.storage.restoreTitle}
        footer={
          <>
            <Button onClick={() => setPending(null)}>{t.common.cancel}</Button>
            <Button variant="primary" loading={busy === 'restore'} onClick={() => (mode === 'replace' ? setConfirmReplace(true) : void runRestore())}>
              {mode === 'replace' ? t.settings.storage.continue : t.settings.storage.restoreAction}
            </Button>
          </>
        }
      >
        {pending && (
          <div className="flex flex-col gap-4">
            <p>
              {t.settings.storage.fileContains(pending.summary.counts)} {t.settings.storage.fileDate(formatDateTime(new Date(pending.file.exportedAt).getTime() || 0))}
            </p>
            {pending.summary.duplicates > 0 && <p className="rounded-md border border-line-strong bg-sunken px-3 py-2">{t.settings.storage.duplicates(pending.summary.duplicates)}</p>}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium">{t.settings.storage.modeLegend}</legend>
              {modes.map((option) => (
                <label key={option.value} data-clickable className="flex items-start gap-3 rounded-md border border-line px-3 py-2 has-checked:border-ink hover:bg-accent-soft">
                  <input type="radio" name="restore-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} className="mt-1 accent-(--tn-accent)" />
                  <span>
                    <span className="block font-medium">{option.label}</span>
                    <span className="block text-xs text-muted">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        title={t.settings.storage.replaceTitle}
        message={t.settings.storage.replaceMessage}
        confirmLabel={t.settings.storage.replaceConfirm}
        cancelLabel={t.settings.storage.replaceCancel}
        busy={busy === 'restore'}
        onConfirm={() => void runRestore()}
      />
    </Section>
  );
}

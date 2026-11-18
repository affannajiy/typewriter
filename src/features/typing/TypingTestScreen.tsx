import { Keyboard, RotateCcw, Shuffle, Volume2, VolumeX } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, type SyntheticEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, IconButton, cx } from '@/components/ui/Button';
import { LoadingBlock, PageHeader, Segmented } from '@/components/ui/Layout';
import { byOrder } from '@/database/repositories/common';
import { writeSetting } from '@/database/repositories/settings';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useTypewriter } from '@/features/pages/useTypewriter';
import { useSettings, useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { playTypewriterSound } from '@/services/typewriterSound';
import { type Duration, DURATIONS, type Keystrokes, type Passage, type PassageChoice, type Score, type TextSource, charStates, choosePassage, countInput, score } from './typingTest';

type Phase = 'ready' | 'running' | 'done';

const NO_KEYS: Keystrokes = { total: 0, wrong: 0 };
const ANY_NOTEBOOK = '';

/** The passage, letter by letter: typed letters are ink or marked wrong, the rest waits in grey. */
function PassageView({ text, typed, focused }: { text: string; typed: string; focused: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const states = useMemo(() => charStates(text, typed), [text, typed]);

  // Keep the line being typed in view: the passage scrolls inside its frame, line by line.
  useEffect(() => {
    const frame = box.current;
    const caret = frame?.querySelector<HTMLElement>('[data-caret]');
    if (!frame || !caret) return;
    const line = parseFloat(getComputedStyle(frame).lineHeight) || 32;
    frame.scrollTop = Math.max(0, caret.offsetTop - line);
  }, [typed.length]);

  // Words stay whole at the end of a line: each is one unbreakable group of letters.
  const groups: { start: number; chars: string[] }[] = [];
  Array.from(text).forEach((char, i) => {
    const last = groups[groups.length - 1];
    if (char === ' ' || !last || last.chars[last.chars.length - 1] === ' ') groups.push({ start: i, chars: [char] });
    else last.chars.push(char);
  });

  return (
    <div ref={box} aria-hidden className="tn-typing-text relative h-[calc(3*var(--tn-typing-line))] overflow-hidden font-mono text-2xl leading-(--tn-typing-line) select-none">
      {groups.map((group) => (
        // A space stays outside the unbreakable groups: it is where a line may end.
        <span key={group.start} className={group.chars[0] === ' ' ? undefined : 'whitespace-nowrap'}>
          {group.chars.map((char, offset) => {
            const i = group.start + offset;
            const state = states[i];
            const caret = i === typed.length;
            return (
              <span
                key={i}
                data-caret={caret ? '' : undefined}
                className={cx(
                  state === 'correct' && 'text-ink',
                  state === 'pending' && 'text-muted/60',
                  // Wrong letters are marked by a line as well as colour.
                  state === 'wrong' && 'tn-typing-wrong',
                  caret && focused && 'tn-typing-caret',
                )}
              >
                {state === 'wrong' && char === ' ' ? '·' : char}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}

function Results({ result, onAgain, onRetry }: { result: Score; onAgain: () => void; onRetry: () => void }) {
  const copy = t.typing.results;
  const actions = useRef<HTMLDivElement>(null);
  // The field that had focus is gone: focus goes to "Again", so Enter starts the next test.
  useEffect(() => {
    actions.current?.querySelector('button')?.focus();
  }, []);
  const items = [
    { label: copy.wpm, value: String(result.wpm), big: true },
    { label: copy.accuracy, value: `${result.accuracy} %`, big: true },
    { label: copy.raw, value: String(result.rawWpm) },
    { label: copy.characters, value: copy.charactersValue(result.correct, result.wrong) },
    { label: copy.time, value: copy.seconds(result.seconds) },
  ];
  return (
    <section aria-labelledby="typing-result" className="rounded-xl border border-line bg-surface p-6">
      <h2 id="typing-result" className="sr-only">
        {copy.title}
      </h2>
      <p role="status" className="sr-only">
        {copy.announce(result.wpm, result.accuracy)}
      </p>
      <dl className="flex flex-wrap items-end gap-x-10 gap-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className={cx('font-mono text-ink tabular-nums', item.big ? 'text-5xl font-semibold' : 'text-xl')}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div ref={actions} className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" icon={Shuffle} onClick={onAgain}>
          {copy.again}
        </Button>
        <Button icon={RotateCcw} onClick={onRetry}>
          {copy.retry}
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted">{copy.notSaved}</p>
    </section>
  );
}

/**
 * A timed typing test with the typewriter's sounds: 15, 30 or 60 seconds,
 * typing a passage from your own notes or a built-in one. The clock starts
 * on the first key. The result is shown, never stored.
 */
export default function TypingTestScreen() {
  const workspace = useWorkspace();
  const settings = useSettings();
  const guarded = useGuarded();
  const typewriter = useTypewriter(settings);
  const fieldId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

  const [duration, setDuration] = useState<Duration>(30);
  const [choice, setChoice] = useState<PassageChoice>({ source: 'notes', notebookId: null });
  const [passage, setPassage] = useState<Passage | null>(null);
  const [typed, setTyped] = useState('');
  const [keys, setKeys] = useState<Keystrokes>(NO_KEYS);
  const [phase, setPhase] = useState<Phase>('ready');
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<Score | null>(null);
  const [focused, setFocused] = useState(false);

  const pages = workspace?.pages;
  const newPassage = (next: PassageChoice = choice) => setPassage(pages ? choosePassage(next, pages) : null);

  // The first passage, once the notes are loaded.
  if (pages && passage === null) setPassage(choosePassage(choice, pages));

  const reset = (keepText: boolean, next: PassageChoice = choice) => {
    setTyped('');
    setKeys(NO_KEYS);
    setPhase('ready');
    setResult(null);
    if (!keepText) newPassage(next);
    requestAnimationFrame(() => field.current?.focus());
  };

  const finish = (finalTyped: string, finalKeys: Keystrokes, elapsedMs: number) => {
    if (!passage) return;
    setPhase('done');
    setResult(score(passage.text, finalTyped, finalKeys, elapsedMs));
    if (typewriter.on) playTypewriterSound('bell', settings.soundVolume, {}, settings.soundMachine);
  };

  // The clock: a tick every tenth of a second while running, and the end when time is up.
  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - startedAt >= duration * 1000) finish(typed, keys, duration * 1000);
    }, 100);
    return () => clearInterval(timer);
    // finish reads the newest typing through its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, startedAt, duration, typed, keys]);

  if (!workspace || !passage) return <LoadingBlock />;

  const target = passage.text;
  const left = phase === 'running' ? Math.max(0, Math.ceil(duration - (now - startedAt) / 1000)) : phase === 'ready' ? duration : 0;
  const notebooks = [...workspace.notebooks].sort(byOrder);

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    if (phase === 'done') return;
    // One line of text: a line break is a space, and nothing beyond the passage's end.
    const next = event.target.value.replace(/\n/gu, ' ').slice(0, target.length);
    const native = event.nativeEvent as InputEvent;
    let begin = startedAt;
    if (phase === 'ready' && next.length > 0) {
      begin = Date.now();
      setStartedAt(begin);
      setNow(begin);
      setPhase('running');
    }
    const counted = countInput(target, typed, next, keys);
    setKeys(counted);
    setTyped(next);
    typewriter.edit(native.inputType ?? 'insertText', native.data ?? null, null);
    if (next.length === target.length) finish(next, counted, Date.now() - begin);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    typewriter.onKeyDown(event);
    if (event.key === 'Escape') {
      event.preventDefault();
      reset(true);
    } else if (event.key === 'Enter') {
      // Enter is not part of the passage. After a result, it starts a new test.
      event.preventDefault();
      if (phase === 'done') reset(false);
    }
  };

  const blockPaste = (event: SyntheticEvent) => event.preventDefault();

  const toggleSound = () => {
    const next = !settings.typingSound;
    if (next) typewriter.feedPaper();
    void guarded(() => writeSetting('typingSound', next));
  };

  const setSource = (source: TextSource) => {
    const next = { ...choice, source };
    setChoice(next);
    reset(false, next);
  };
  const setNotebook = (value: string) => {
    const next = { ...choice, notebookId: value === ANY_NOTEBOOK ? null : value };
    setChoice(next);
    reset(false, next);
  };

  const copy = t.typing;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={copy.title} description={copy.description} />

      <div className={cx('mb-6 flex flex-wrap items-end gap-x-6 gap-y-3 transition-opacity duration-(--tn-motion)', phase === 'running' && 'pointer-events-none opacity-30')} inert={phase === 'running'}>
        <Segmented<string> legend={copy.duration} name="typing-duration" value={String(duration)} options={DURATIONS.map((d) => ({ value: String(d), label: copy.secondsShort(d) }))} onChange={(value) => (setDuration(Number(value) as Duration), reset(true))} />
        <Segmented<TextSource>
          legend={copy.source}
          name="typing-source"
          value={choice.source}
          options={[
            { value: 'notes', label: copy.sources.notes },
            { value: 'builtin', label: copy.sources.builtin },
          ]}
          onChange={setSource}
        />
        {choice.source === 'notes' && notebooks.length > 0 && (
          <label className="flex max-w-full min-w-0 flex-col gap-1 text-sm text-ink">
            <span className="font-medium">{copy.notebook}</span>
            <select value={choice.notebookId ?? ANY_NOTEBOOK} onChange={(event) => setNotebook(event.target.value)} className="h-10 w-full max-w-64 truncate rounded-md border border-line-strong bg-surface px-2 text-sm text-ink">
              <option value={ANY_NOTEBOOK}>{copy.anyNotebook}</option>
              {notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="ms-auto flex items-center gap-1">
          <IconButton icon={Shuffle} label={copy.newText} onClick={() => reset(false)} />
          <IconButton icon={settings.typingSound ? Volume2 : VolumeX} pressed={settings.typingSound} label={t.sound.toggle} onClick={toggleSound} />
        </div>
      </div>

      {passage.fellBack && choice.source === 'notes' && <p className="mb-4 rounded-md border border-line-strong bg-sunken px-3 py-2 text-sm text-ink">{copy.noNotes}</p>}

      {result ? (
        <Results result={result} onAgain={() => reset(false)} onRetry={() => reset(true)} />
      ) : (
        <div className="relative rounded-xl border border-line bg-surface px-6 py-5">
          <div className="mb-3 flex items-center justify-between text-sm text-muted">
            <span className="flex items-center gap-2">
              <Keyboard size={16} aria-hidden />
              {phase === 'ready' ? copy.startHint : copy.escHint}
            </span>
            <span aria-hidden className="font-mono text-2xl font-semibold text-ink tabular-nums">
              {left}
            </span>
          </div>
          <label htmlFor={fieldId} className="sr-only">
            {copy.fieldLabel}
          </label>
          {/* The real field sits over the passage, invisible: it takes every keyboard, phone ones included. */}
          <textarea
            ref={field}
            id={fieldId}
            value={typed}
            aria-describedby={`${fieldId}-text`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onKeyUp={(event) => typewriter.onKeyUp(event)}
            onPaste={blockPaste}
            onDrop={blockPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="absolute inset-0 z-10 h-full w-full cursor-text resize-none opacity-0"
          />
          <p id={`${fieldId}-text`} className="sr-only">
            {target}
          </p>
          <PassageView text={target} typed={typed} focused={focused} />
          {!focused && phase !== 'done' && <p className="mt-3 text-center text-sm text-muted">{copy.clickToFocus}</p>}
        </div>
      )}
    </div>
  );
}

import { type ChangeEvent, type KeyboardEvent, type SyntheticEvent, useEffect, useRef } from 'react';
import type { AppSettings } from '@/features/settings/model';
import { type CaretPlace, carriageEvents, measureCaret } from '@/services/carriage';
import { type SoundDetail, type SoundKind, isTypewriterSoundReady, playTypewriterSound, soundForInput } from '@/services/typewriterSound';

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Turns what happens in the writing fields into typewriter sounds.
 *
 * Edits come from the browser's input events, so every kind of keyboard works.
 * The caret's place on its visual line stands in for the carriage: when the
 * text wraps, the carriage returns, and the margin bell can ring before that.
 */
export function useTypewriter(settings: AppSettings) {
  const on = settings.typingSound;
  const carriage = useRef<CaretPlace | null>(null);
  const paperFed = useRef(false);

  const play = (kind: SoundKind, detail?: SoundDetail) => playTypewriterSound(kind, settings.soundVolume, detail);

  // A sheet is fed in when a page opens, if the browser already allows audio.
  useEffect(() => {
    if (!on || paperFed.current) return;
    paperFed.current = true;
    if (isTypewriterSoundReady()) playTypewriterSound('paper', settings.soundVolume);
  }, [on, settings.soundVolume]);

  const returnCarriage = (travel: number) => {
    play('return', { travel, bell: settings.soundBell === 'return' });
  };

  const onInput = (event: ChangeEvent<Field>) => {
    if (!on) return;
    const native = event.nativeEvent as InputEvent;
    const kind = soundForInput(native.inputType ?? '', native.data ?? null);
    const before = carriage.current;
    const after = event.target instanceof HTMLTextAreaElement ? measureCaret(event.target) : null;
    carriage.current = after;
    if (!kind) return;

    if (kind === 'return') {
      returnCarriage(before && before.width > 0 ? before.x / before.width : 0.5);
      return;
    }
    play(kind, { char: native.data ?? undefined });
    if (kind === 'backspace' || !after) return;

    const moved = carriageEvents(before, after);
    if (moved.wrapped) returnCarriage(moved.travel);
    else if (moved.bell && settings.soundBell === 'margin') play('bell');
  };

  /** The caret moved without an edit (arrow keys, a click): follow it silently. */
  const onSelect = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    if (on) carriage.current = measureCaret(event.currentTarget);
  };

  const onKeyDown = (event: KeyboardEvent<Field>) => {
    if (on && !event.repeat && (event.key === 'Shift' || event.key === 'CapsLock')) play('shiftDown');
  };

  const onKeyUp = (event: KeyboardEvent<Field>) => {
    if (on && event.key === 'Shift') play('shiftUp');
  };

  /** Called by the click that turns sounds on. That click also lets the browser start audio. */
  const feedPaper = () => {
    paperFed.current = true;
    play('paper');
  };

  return { onInput, onSelect, onKeyDown, onKeyUp, feedPaper };
}

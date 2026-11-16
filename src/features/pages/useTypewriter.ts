import { type ChangeEvent, type KeyboardEvent, useEffect, useRef } from 'react';
import type { AppSettings } from '@/features/settings/model';
import { type CaretPlace, carriageEvents } from '@/services/carriage';
import { type SoundDetail, type SoundKind, isTypewriterSoundReady, playTypewriterSound, soundForInput } from '@/services/typewriterSound';

/**
 * Turns what happens in the writing fields into typewriter sounds.
 *
 * Edits are described the way the browser's input events describe them
 * (`inputType` and `data`), so every kind of keyboard works. The caret's
 * place on its visual line stands in for the carriage: when the text wraps,
 * the carriage returns, and the margin bell can ring before that.
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

  /**
   * One edit. `caret` is where the caret is after it, or null when the field
   * has no measurable lines (the title).
   */
  const edit = (inputType: string, data: string | null, caret: CaretPlace | null) => {
    if (!on) return;
    const kind = soundForInput(inputType, data);
    const before = carriage.current;
    carriage.current = caret;
    if (!kind) return;

    if (kind === 'return') {
      returnCarriage(before && before.width > 0 ? before.x / before.width : 0.5);
      return;
    }
    play(kind, { char: data ?? undefined });
    if (kind === 'backspace' || !caret) return;

    const moved = carriageEvents(before, caret);
    if (moved.wrapped) returnCarriage(moved.travel);
    else if (moved.bell && settings.soundBell === 'margin') play('bell');
  };

  /** For a plain input element. */
  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const native = event.nativeEvent as InputEvent;
    edit(native.inputType ?? '', native.data ?? null, null);
  };

  /** The caret moved without an edit (arrow keys, a click): follow it silently. */
  const follow = (caret: CaretPlace | null) => {
    if (on) carriage.current = caret;
  };

  const onKeyDown = (event: Pick<KeyboardEvent, 'key' | 'repeat'>) => {
    if (on && !event.repeat && (event.key === 'Shift' || event.key === 'CapsLock')) play('shiftDown');
  };

  const onKeyUp = (event: Pick<KeyboardEvent, 'key'>) => {
    if (on && event.key === 'Shift') play('shiftUp');
  };

  /** Called by the click that turns sounds on. That click also lets the browser start audio. */
  const feedPaper = () => {
    paperFed.current = true;
    play('paper');
  };

  return { on, edit, onInput, follow, onKeyDown, onKeyUp, feedPaper };
}

export type Typewriter = ReturnType<typeof useTypewriter>;

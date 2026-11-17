import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { MAX_CARD_TEXT, MAX_DECK_DESCRIPTION, createCard, createDeck, updateCard, updateDeck } from '@/database/repositories/flashcards';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useDecks } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Deck, Flashcard, Id } from '@/types/models';
import { MathText } from './MathText';

/** Create a deck, or change one's name and description. */
export function DeckDialog({ deck, onClose, onCreated }: { deck: Deck | null; onClose: () => void; onCreated?: (deck: Deck) => void }) {
  const guarded = useGuarded();
  const [name, setName] = useState(deck?.name ?? '');
  const [description, setDescription] = useState(deck?.description ?? '');
  const [busy, setBusy] = useState(false);

  const submit = () =>
    void (async () => {
      setBusy(true);
      const done = await guarded(async () => {
        if (deck) await updateDeck(deck.id, { name, description });
        else onCreated?.(await createDeck({ name, description }));
        return true;
      });
      setBusy(false);
      if (done) onClose();
    })();

  return (
    <Dialog
      open
      onClose={onClose}
      title={deck ? t.study.editDeck : t.study.newDeck}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button variant="primary" type="submit" loading={busy}>
            {deck ? t.common.save : t.study.createDeck}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label={t.study.deckName} value={name} maxLength={200} required data-autofocus onChange={(e) => setName(e.target.value)} />
        <TextAreaField label={t.study.deckDescription} hint={t.common.optional} value={description} maxLength={MAX_DECK_DESCRIPTION} rows={2} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Dialog>
  );
}

interface CardDialogProps {
  /** The card to edit, or null for a new one. */
  card: Flashcard | null;
  /** The deck chosen at first, for a new card. */
  deckId?: Id | null;
  /** For a new card: its question to start with, and the page it is made from. */
  front?: string;
  sourcePageId?: Id | null;
  onClose: () => void;
}

/**
 * Add or edit a flashcard. With no deck yet, the dialog makes one named by
 * the writer, so a card can be made from a page in one step.
 */
export function CardDialog({ card, deckId = null, front: initialFront = '', sourcePageId = null, onClose }: CardDialogProps) {
  const decks = useDecks();
  const guarded = useGuarded();
  const toast = useToast();
  const [front, setFront] = useState(card?.front ?? initialFront);
  const [back, setBack] = useState(card?.back ?? '');
  const [chosen, setChosen] = useState<Id | null>(card?.deckId ?? deckId);
  const [newDeckName, setNewDeckName] = useState(t.study.newDeckName);
  const [showError, setShowError] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectId = useId();

  const noDecks = decks !== undefined && decks.length === 0;
  const target = chosen ?? decks?.[0]?.id ?? null;
  const frontMissing = front.trim() === '';

  const submit = () =>
    void (async () => {
      if (frontMissing) {
        setShowError(true);
        return;
      }
      setBusy(true);
      const done = await guarded(async () => {
        const into = noDecks || target === null ? (await createDeck({ name: newDeckName })).id : target;
        if (card) await updateCard(card.id, { front, back, deckId: into });
        else await createCard({ deckId: into, front, back, sourcePageId });
        return true;
      });
      setBusy(false);
      if (!done) return;
      toast({ message: card ? t.study.cardSaved : t.study.cardAdded });
      onClose();
    })();

  return (
    <Dialog
      open
      onClose={onClose}
      title={card ? t.study.editCard : t.study.addCard}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button variant="primary" type="submit" loading={busy} disabled={decks === undefined}>
            {card ? t.common.save : t.study.addCard}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {noDecks ? (
          <TextField label={t.study.deck} value={newDeckName} maxLength={200} onChange={(e) => setNewDeckName(e.target.value)} />
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={selectId} className="text-sm font-medium text-ink">
              {t.study.deck}
            </label>
            <select id={selectId} value={target ?? ''} onChange={(e) => setChosen(e.target.value)} className="min-h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink pointer-coarse:min-h-11">
              {decks?.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <TextAreaField
            label={t.study.front}
            hint={t.study.frontHint}
            error={showError && frontMissing ? t.errors.repository['invalid-card'] : null}
            value={front}
            maxLength={MAX_CARD_TEXT}
            rows={3}
            data-autofocus
            onChange={(e) => setFront(e.target.value)}
          />
          {front.includes('$') && (
            <p className="mt-1 rounded-md bg-sunken/50 px-3 py-2 text-sm text-ink">
              <MathText text={front} />
            </p>
          )}
        </div>
        <div>
          <TextAreaField label={t.study.back} value={back} maxLength={MAX_CARD_TEXT} rows={3} onChange={(e) => setBack(e.target.value)} />
          {back.includes('$') && (
            <p className="mt-1 rounded-md bg-sunken/50 px-3 py-2 text-sm text-ink">
              <MathText text={back} />
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

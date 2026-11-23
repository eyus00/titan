import { useEffect, useRef, type CSSProperties } from 'react';
import Button from './Button';
import Icon from './Icon';
import Kbd from './Kbd';
import { Count, Ring } from './Ring';
import { progress } from '../lib/learn';
import type { Card, StudySet } from '../lib/store';
import { plural } from '../lib/util';

/** The end of a pass through the deck (flashcards and quiz): how it went, and what it did for mastery. */
export default function DeckDone({ set, cards, total, firstTry, before, onAgain, onLeave }: { set: StudySet; cards: Card[]; total: number; firstTry: number; before: number; onAgain: () => void; onLeave: () => void }) {
  const after = progress(cards, set.stats, Date.now()).mastery;
  const gained = Math.round((after - before) * 100);
  const share = total ? firstTry / total : 1;
  // "Go again" takes the keyboard, so Enter starts another pass.
  const again = useRef<HTMLButtonElement>(null);
  useEffect(() => again.current?.focus(), []);
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="m-auto flex w-full max-w-md flex-col items-center py-6 text-center">
        <p className="enter label-mono text-muted">deck finished</p>
        <h1 className="enter mt-2 font-serif text-[clamp(2.6rem,10vw,4rem)] leading-none tracking-[-0.01em] text-balance">{share === 1 ? 'Every card right, first time.' : `${firstTry} of ${total} right first time.`}</h1>
        <div className="enter mt-9 flex items-center justify-center gap-8" style={{ '--i': 1 } as CSSProperties}>
          <div className="flex flex-col items-center gap-2">
            <Ring value={share} size={76} width={6}>
              <Count value={share * 100} className="font-mono text-sm" />
            </Ring>
            <span className="label-mono text-muted">first time</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Ring value={after} size={76} width={6}>
              <Count value={after * 100} className="font-mono text-sm" />
            </Ring>
            <span className="label-mono text-muted">{gained > 0 ? `mastery +${gained}` : 'mastery'}</span>
          </div>
        </div>
        <p className="enter mt-6 max-w-xs text-sm leading-relaxed text-pretty text-muted" style={{ '--i': 1 } as CSSProperties}>
          {share === 1
            ? 'Come back tomorrow: remembering after a break is what makes it stick.'
            : total - firstTry === 1
              ? 'The card you missed will come up first next time.'
              : `The ${plural(total - firstTry, 'card')} you missed will come up first next time.`}
        </p>
        <div className="enter mt-8 flex flex-wrap justify-center gap-2.5" style={{ '--i': 2 } as CSSProperties}>
          <Button ref={again} variant="primary" size="lg" onClick={onAgain}>
            <Icon name="again" size={16} stroke={2} />
            Go again
            <Kbd on>↵</Kbd>
          </Button>
          <Button size="lg" onClick={onLeave}>
            Done
            <Kbd>Esc</Kbd>
          </Button>
        </div>
      </div>
    </main>
  );
}

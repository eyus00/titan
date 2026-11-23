import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Dialog } from './Modal';
import Kbd from './Kbd';
import { keyCaps, useActiveHotkeys, useHotkeys } from '../lib/hotkeys';

/**
 * The keyboard shortcuts dialog, opened with "?". It lists whatever shortcuts the page on
 * screen has declared, so it is always up to date. Mount one per screen.
 */
export default function Shortcuts({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [own, setOwn] = useState(false);
  const shown = open ?? own;
  const set = onOpenChange ?? setOwn;
  useHotkeys('Everywhere', [{ keys: ['?'], label: 'Keyboard shortcuts', run: () => set(!shown), inDialog: shown }]);
  return <AnimatePresence>{shown && <List onClose={() => set(false)} />}</AnimatePresence>;
}

function List({ onClose }: { onClose: () => void }) {
  const groups = useActiveHotkeys();
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="label-mono mb-1 text-muted">{g.title.toLowerCase()}</h3>
            <ul className="divide-y divide-line">
              {g.list.map((h) => (
                <li key={h.keys.join()} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <span>{h.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {h.keys.slice(0, 2).map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        {i > 0 && <span className="label-mono mr-0.5 text-faint">or</span>}
                        {keyCaps(k).map((cap) => (
                          <Kbd key={cap} spoken className="inline-flex!">
                            {cap}
                          </Kbd>
                        ))}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

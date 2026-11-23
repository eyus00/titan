import { useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { AnimatePresence } from 'motion/react';
import { btn } from './Button';
import Icon from './Icon';
import { Wordmark } from './Logo';
import SettingsDialog from './SettingsDialog';
import Shortcuts from './Shortcuts';
import { Toaster } from './Toast';
import { useHotkeys } from '../lib/hotkeys';
import { cx } from '../lib/util';

/** Every page except the games: the logo, settings, and one narrow column. */
export default function Layout() {
  const [settings, setSettings] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const { pathname } = useLocation();
  useHotkeys('Everywhere', [{ keys: [','], label: 'Settings', run: () => setSettings(true) }]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16 sm:px-8">
      <ScrollRestoration />
      <header className="flex items-center justify-between pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <Link to="/" aria-label="Titan, home" className="-ml-1 rounded-lg px-1 py-1 transition-[scale] duration-150 ease-out active:scale-[0.96]">
          <Wordmark />
        </Link>
        <div className="-mr-2 flex items-center">
          <button type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setShortcuts(true)} className={cx(btn({ variant: 'ghost', icon: true }), 'hidden keys:inline-flex')}>
            <Icon name="keyboard" size={20} />
          </button>
          <button type="button" aria-label="Settings" title="Settings (,)" onClick={() => setSettings(true)} className={btn({ variant: 'ghost', icon: true })}>
            <Icon name="settings" size={20} />
          </button>
        </div>
      </header>
      {/* Keyed by address, so each page fades in as it arrives. */}
      <main key={pathname} className="page flex flex-1 flex-col">
        <Outlet />
      </main>
      <AnimatePresence>{settings && <SettingsDialog onClose={() => setSettings(false)} />}</AnimatePresence>
      <Shortcuts open={shortcuts} onOpenChange={setShortcuts} />
      <Toaster />
    </div>
  );
}

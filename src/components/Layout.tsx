import { useState } from 'react';
import { Link, Outlet, ScrollRestoration } from 'react-router';
import { Settings } from 'lucide-react';
import { btn } from './Button';
import { Wordmark } from './Logo';
import SettingsDialog from './SettingsDialog';
import { Toaster } from './Toast';

/** Every page except the game: the logo, settings, and one narrow column. */
export default function Layout() {
  const [settings, setSettings] = useState(false);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-5 pb-16 sm:px-8">
      <ScrollRestoration />
      <header className="flex items-center justify-between pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <Link to="/" aria-label="Titan, home" className="-ml-1 rounded-lg px-1 py-1">
          <Wordmark />
        </Link>
        <button type="button" aria-label="Settings" onClick={() => setSettings(true)} className={btn({ variant: 'ghost', icon: true }) + ' -mr-2'}>
          <Settings className="size-5" strokeWidth={1.75} />
        </button>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      <Toaster />
    </div>
  );
}

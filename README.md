# Titan

A matching game for studying terminology. Paste a list of words and definitions, then pair
them up against the clock. Cards show the whole definition, however long it is.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, then build to dist/
npm run preview    # serve the built site
```

Needs Node 20.19 or newer.

## What it does

- **Match**: a round deals a few pairs (4, 6, 8 or 10), shuffled. Pick a term, then its
  definition. A wrong pair adds a second. Best times are kept per set and round size, and the
  cards you missed are listed after the round.
- **Long cards**: each card's text is set at the largest size that fits. When a board has long
  definitions, their rows take height from rows that only hold short terms, and if a screen
  still can't hold everything the board scrolls. Text is never cut off.
- **Import a list**: paste text or open a `.txt` / `.csv` file. Choose what separates a term
  from its definition (tab, comma, space, dash, colon, equals, or your own) and what separates
  cards (new line, semicolon, blank line, or your own). The separators are guessed from the
  text, and a preview shows the cards before they are added.
- **Sound**: effects for picking, matching, missing and finishing, and music during a round.
  Both can be switched off in the game or in Settings.
- **Light and dark** themes, following the device unless set by hand.

## Where things are kept

Everything stays in the browser: sets, best times and settings in `localStorage`
(`titan:v1`), and the optional own music track in IndexedDB. There is no server and no
account. Settings has **Download backup** and **Restore from file** for moving sets between
devices.

## Deploy

The repository is ready for [Vercel](https://vercel.com): import it and deploy. `vercel.json`
sets the framework to Vite, sends every route to `index.html` (so `/set/abc/match` survives a
refresh) and caches the hashed files under `/assets` for a year.

## Code map

```
src/
  main.tsx              routes
  index.css             theme colours, fonts, card animations
  pages/
    Home.tsx            list of sets
    SetView.tsx         one set
    Editor.tsx          create and edit a set
    Match.tsx           the game: round logic, board layout, result
  components/           Button, Modal, Toast, ImportDialog, SettingsDialog, ...
  lib/
    store.ts            sets, settings and best times (localStorage)
    parse.ts            pasted text -> cards, separator detection
    fit.ts              picks each card's font size
    audio.ts            sound effects (synthesized, no audio files)
    theme.ts            the built-in music, written as notes and rendered in the browser
    music.ts            playback, and the "use my own track" slot
```

Stack: React 19, React Router, Vite, Tailwind CSS 4, TypeScript. A new study mode is a new
page in `src/pages` plus a route in `main.tsx`; the set data in `lib/store.ts` is shared.

### Music

The built-in theme is original. It is written as chords and a melody at the top of
`src/lib/theme.ts`, so changing the tune means editing those lists. **Settings → Music → Use
my own** plays any audio file from the device instead; that file stays in the browser.

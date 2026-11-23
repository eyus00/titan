# Titan

A study app for terminology. Paste a list of words and definitions, then match them against
the clock or flip through them as cards. Titan keeps track of what you know and brings back
what you miss.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, then build to dist/
npm run preview    # serve the built site
```

Needs Node 20.19 or newer.

## What it does

- **Match**: a board of cards, 4 × 4 by default (4, 6, 8 or 10 pairs). Pick a term, then its
  definition. Play a **timed round** (a wrong pair adds a second, best times are kept) or an
  **endless** run that keeps dealing boards until you stop it.
- **Flashcards**: flip, then mark each card as known or still learning (buttons, arrow keys or
  a drag). Missed cards come back a few cards later until they stick. Undo with `Z`.
- **Cards never cut text off, and the board never scrolls.** Each card's text is set at the
  largest size that fits; rows with long definitions take height from rows of short terms. If
  the chosen cards still can't fit the screen, the longest are swapped for shorter ones, and
  sizes that can't fit at all are switched off for that screen.
- **Smart choice of cards**: see "How it learns" below.
- **Progress**: a mastery ring per set, split into mastered / familiar / learning / new, with
  accuracy, cards to review, the terms that need work, a ring per term and a daily streak.
- **Import a list**: paste text or open a `.txt` / `.csv` file. Choose what separates a term
  from its definition (tab, comma, space, dash, colon, equals, or your own) and what separates
  cards (new line, semicolon, blank line, or your own). The separators are guessed from the
  text, and a preview shows the cards before they are added.
- **Keyboard everywhere**: press `?` on any screen for its shortcuts. In Match, `W A S D` or
  the arrow keys move across the board and `Enter` picks a card.
- **Sound**: effects for every action and four built-in songs for Match, or your own audio
  files. Both can be switched off in the game or in Settings.
- **Light and dark** themes, following the device unless set by hand.

## How it learns

`src/lib/learn.ts` holds the whole model. Every card has a memory half-life: the time after
which you are as likely to have forgotten it as to remember it.

- A clean answer lengthens the half-life, a little if the card was just seen and up to four
  times if it had nearly faded. Spaced practice counts for more than cramming.
- A mistake cuts the half-life and marks the card as hot. Hot cards are dealt far more often
  until a few clean answers cool them down.
- The next board is a weighted draw: cards that are fading, hot or new come up most, and
  well-known cards still return now and then. Two cards that were mixed up are dealt together
  again.
- Mastery (the rings) blends long-term strength with the current run of clean answers and
  fades with time away, so it shows what you know today.

## Where things are kept

Everything stays in the browser: sets, progress and settings in `localStorage` (`titan:v1`),
and your own music files in IndexedDB. There is no server and no account. Settings has
**Download backup** and **Restore from file** for moving sets between devices.

## Deploy

The repository is ready for [Vercel](https://vercel.com): import it and deploy. `vercel.json`
sets the framework to Vite, sends every route to `index.html` (so `/set/abc/match` survives a
refresh) and caches the hashed files under `/assets` for a year.

## Code map

```
src/
  main.tsx              routes
  index.css             theme colours, fonts, card states, motion
  pages/
    Home.tsx            your sets, streak
    SetView.tsx         one set: study modes, progress, terms
    Editor.tsx          create and edit a set
    Match.tsx           the game: dealing, board, keyboard, result
    Flashcards.tsx      the deck: flip, grade, undo
  components/
    Icon.tsx            the icon set (drawn for Titan, same language as the logo)
    Logo.tsx  Kbd.tsx  Button.tsx  Controls.tsx  Modal.tsx  Toast.tsx  Ring.tsx
    ImportDialog.tsx  SettingsDialog.tsx  Shortcuts.tsx  Layout.tsx
  lib/
    store.ts            sets, settings, progress, activity (localStorage)
    learn.ts            the memory model and the choice of cards
    board.ts            board layout: grid, row heights, font sizes, "does it fit"
    fit.ts              text measuring
    parse.ts            pasted text -> cards, separator detection
    hotkeys.ts          keyboard shortcuts and the list behind "?"
    proximity.ts        cards that react to the pointer together
    audio.ts            sound effects (synthesized, no audio files)
    songs.ts            the built-in music, written as notes and rendered in the browser
    music.ts            playback, track choice, your own tracks
```

Stack: React 19, React Router, Vite, Tailwind CSS 4, Motion, TypeScript. A new study mode is
a new page in `src/pages` plus a route in `main.tsx`; it reads cards from `lib/store.ts`,
orders them with `rank()` from `lib/learn.ts` and reports answers with `actions.answer()`.

### Music

The four built-in songs (Orbit, Drift, Pulse, Glass) are original. Each is a list of chords
and a melody in `src/lib/songs.ts`, so changing a tune means editing those lists. **Settings →
Music → Add your own** takes any audio files from the device; they stay in the browser and
can be chosen or shuffled like the built-in ones.

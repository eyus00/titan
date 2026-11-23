import type { ReactNode } from 'react';
import { cx } from '../lib/util';

/**
 * Titan's own icons, drawn on a 24 grid in the same language as the logo: straight lines,
 * square ends and sharp corners. Lines keep their weight at any size (see `.icon` in index.css),
 * so `stroke` is in screen pixels: 1.5 beside regular text, 2 beside medium or semibold.
 */
const solid = { fill: 'currentColor', stroke: 'none' } as const;

const ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  play: <path d="M7.5 4.5v15L20 12z" {...solid} />,
  stop: <path d="M6 6h12v12H6z" {...solid} />,
  back: <path d="M19 12H5.5M11 6l-6 6 6 6" />,
  forward: <path d="M5 12h13.5M13 6l6 6-6 6" />,
  settings: (
    <>
      <path d="M4 8h8M17.5 8H20M4 16h2.5M12 16h8" />
      <path d="M12.5 5.75H17v4.5h-4.5zM7 13.75h4.5v4.5H7z" />
    </>
  ),
  music: (
    <>
      <path d="M9 16.5v-11l10-2v11" />
      <path d="M5 15h4v4H5zM15 13h4v4h-4z" />
    </>
  ),
  musicOff: (
    <>
      <g opacity="0.4">
        <path d="M9 16.5v-11l10-2v11" />
        <path d="M5 15h4v4H5zM15 13h4v4h-4z" />
      </g>
      <path d="M4.5 4.5l15 15" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
      <path d="M15.5 9l2 3-2 3M18.5 6.5l3 5.5-3 5.5" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" opacity="0.4" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10.5 10.5v6M13.5 10.5v6" />,
  edit: <path d="M4.5 19.5l1-4.5L16 4.5 19.5 8 9 18.5zM13.5 7l3.5 3.5" />,
  copy: <path d="M9 9h11v11H9zM15 9V4H4v11h5" />,
  list: <path d="M4 6.5h11M4 11.5h11M4 16.5h6M17.5 13v8M13.5 17h8" />,
  file: <path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4" />,
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  again: (
    <>
      <path d="M4.5 12A7.5 7.5 0 1 0 12 4.5c-2.1 0-4 .8-5.4 2.1L4.5 8.5" />
      <path d="M4.5 4v4.5H9" />
    </>
  ),
  undo: <path d="M9 6.5L4.5 11 9 15.5M5 11h9.5a4.5 4.5 0 0 1 0 9H11" />,
  flip: <path d="M4 8.5h14M14.5 5L18 8.5 14.5 12M20 15.5H6M9.5 12L6 15.5 9.5 19" />,
  cards: (
    <>
      <path d="M8 8h12v12H8z" />
      <path d="M4.5 15.5v-11h11" />
    </>
  ),
  grid: <path d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z" />,
  endless: <path d="M2.5 12L7 7.5l10 9 4.5-4.5L17 7.5l-10 9z" />,
  flag: <path d="M6 21V4h12.5l-3 4.5 3 4.5H6" />,
  keyboard: (
    <>
      <path d="M3 6h18v12H3z" />
      <path d="M7 10h.5M11.75 10h.5M16.5 10h.5M7.5 14h9" />
    </>
  ),
  bolt: <path d="M13.5 3l-8 10.5H11L10 21l8.5-10.5H13z" />,
  star: <path d="M12 3l2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z" />,
  shuffle: <path d="M4 7h3.5l9 10H20M4 17h3.5l9-10H20M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5" />,
  chevron: <path d="M9.5 6l6 6-6 6" />,
  choice: (
    <>
      <path d="M4.5 4.5h15v15h-15z" />
      <path d="M9 9h6v6H9z" {...solid} />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

export default function Icon({ name, size = 18, stroke = 1.5, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden
      className={cx('icon shrink-0', className)}
    >
      {ICONS[name]}
    </svg>
  );
}

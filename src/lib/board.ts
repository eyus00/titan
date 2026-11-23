/**
 * The match board's layout. Given the cards' texts and the free area, it decides the grid, the
 * height of every row and the font size of every card, so that ALL of every card's text shows
 * and the board fits the screen exactly. The board never scrolls: when a set of cards cannot
 * fit, `fits` is false and the game deals fewer or shorter cards instead.
 */
import { fitText, textHeight } from './fit';
import { shuffle } from './util';

const MIN_CELL_W = 130;
const MIN_ROW_H = 44;
const MAX_CELL_W = 380;
const MAX_CELL_H = 250;
/** Cards read best a little wider than tall. */
const TARGET_RATIO = 1.7;
/** Below this font size (px) the board stops using even rows and gives long cards more height. */
const COMFORT = 15;
/** Text never goes smaller than this, whatever happens. */
const FLOOR = 9;
/** The card's border, both sides. */
const FRAME = 2;

export const gapFor = (W: number) => (W < 520 ? 8 : 12);

export interface Grid {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
}

/** Columns and rows for n cards in a W x H area: the grid whose cells are closest to the ideal shape, square grids preferred. */
export function chooseGrid(n: number, W: number, H: number, gap = gapFor(W)): Grid {
  let best: Grid & { score: number } = { cols: 1, rows: n, cellW: Math.min(W, MAX_CELL_W), cellH: MIN_ROW_H, score: -Infinity };
  for (let cols = 1; cols <= Math.min(n, 6); cols++) {
    const rows = Math.ceil(n / cols);
    const rawW = (W - gap * (cols - 1)) / cols;
    if (cols > 1 && rawW < MIN_CELL_W) break;
    const cellW = Math.min(rawW, MAX_CELL_W);
    const cellH = Math.min(Math.max((H - gap * (rows - 1)) / rows, MIN_ROW_H), MAX_CELL_H);
    let score = -Math.abs(Math.log(cellW / cellH / TARGET_RATIO));
    if (n % cols) score -= 0.4; // a ragged last row
    if (cols === 1) score -= 0.5;
    if (cols === rows) score += 0.5; // 4 x 4 for sixteen cards
    if (score > best.score) best = { cols, rows, cellW, cellH, score };
  }
  return best;
}

export interface BoardPlan {
  cols: number;
  cellW: number;
  gap: number;
  padX: number;
  padY: number;
  /** Height of each row, in px. Together with the gaps they fill the area and no more. */
  rows: number[];
  /** Font size of each card, in px. */
  sizes: number[];
  /** Everything shows at a readable size. False = these cards are too much for this screen. */
  fits: boolean;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** The shared measurements for a board of n cards. */
function frame(n: number, W: number, H: number) {
  const gap = gapFor(W);
  const grid = chooseGrid(n, W, H, gap);
  const padX = grid.cellW < 200 ? 10 : 16;
  const padY = grid.cellH < 110 ? 8 : 12;
  return {
    ...grid,
    gap,
    padX,
    padY,
    innerW: grid.cellW - padX * 2 - FRAME,
    chrome: padY * 2 + FRAME,
    /** Smallest size that still counts as comfortably readable. */
    min: grid.cellW < 200 ? 11 : 12,
    max: Math.min(26, Math.max(15, grid.cellH * 0.22)),
    room: Math.min(H - gap * (grid.rows - 1), grid.rows * MAX_CELL_H),
  };
}

/**
 * Even rows when that keeps everything comfortably readable. Otherwise rows with long
 * definitions take height from rows that only hold short terms.
 */
export function planBoard(texts: string[], W: number, H: number): BoardPlan {
  const f = frame(texts.length, W, H);
  const base = { cols: f.cols, cellW: f.cellW, gap: f.gap, padX: f.padX, padY: f.padY };

  const even = texts.map((t) => fitText(t, f.innerW, f.cellH - f.chrome, f.min, f.max));
  if (even.every((e) => e.fits && e.size >= Math.min(COMFORT, f.max))) {
    return { ...base, rows: Array<number>(f.rows).fill(f.cellH), sizes: even.map((e) => e.size), fits: true };
  }

  /** Row heights needed to show every card at one font size. */
  const need = (size: number) => {
    const rows = Array<number>(f.rows).fill(MIN_ROW_H);
    texts.forEach((t, i) => {
      const r = Math.floor(i / f.cols);
      rows[r] = Math.max(rows[r], textHeight(t, f.innerW, size) + f.chrome);
    });
    return rows;
  };

  let rows = need(FLOOR);
  let size = FLOOR;
  const total = sum(rows);
  if (total > f.room) {
    // Too much text even at the smallest size: squeeze the rows into the area (cards clip).
    rows = rows.map((h) => (h * f.room) / total);
  } else {
    // The largest size (in half pixels) at which every row still fits on screen.
    let lo = FLOOR * 2;
    let hi = Math.round(f.max * 2);
    if (sum(need(hi / 2)) <= f.room) lo = hi;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sum(need(mid / 2)) <= f.room) lo = mid;
      else hi = mid;
    }
    size = lo / 2;
    rows = need(size);
    const spare = (f.room - sum(rows)) / f.rows;
    rows = rows.map((h) => h + spare);
  }
  const sizes = texts.map((t, i) => fitText(t, f.innerW, rows[Math.floor(i / f.cols)] - f.chrome, FLOOR, f.max).size);
  return { ...base, rows, sizes, fits: total <= f.room && size >= f.min };
}

/**
 * An order for the cards that needs the least height: cards of similar length share a row.
 * The rows, and the cards within each row, are then shuffled, so position gives nothing away.
 */
export function packOrder<T>(items: T[], text: (item: T) => string, W: number, H: number): T[] {
  const f = frame(items.length, W, H);
  const byHeight = items
    .map((item) => ({ item, h: textHeight(text(item), f.innerW, f.min) }))
    .sort((a, b) => b.h - a.h)
    .map((x) => x.item);
  const rows: T[][] = [];
  for (let i = 0; i < byHeight.length; i += f.cols) rows.push(shuffle(byHeight.slice(i, i + f.cols)));
  // The ragged last row (if any) stays last.
  const full = rows.filter((r) => r.length === f.cols);
  const rest = rows.filter((r) => r.length !== f.cols);
  return [...shuffle(full), ...rest].flat();
}

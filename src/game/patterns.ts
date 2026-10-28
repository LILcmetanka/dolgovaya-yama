import { GRID_COLUMNS, GRID_ROWS, isJoker, isLock, isSkull, isSpecial, isTicket, SYMBOLS, type Grid, type SlotSymbol } from './rules';

/**
 * Паттерны сетки 5×3: какие клетки должны совпасть и во сколько раз паттерн умножает цену символа.
 * Здесь же поиск паттернов и итог прокрутки. Без Phaser — только данные и маленькие функции.
 */

/** Клетка сетки: [ряд, столбец]. Ряд 0 — верхний, столбец 0 — левый. */
export type Cell = [row: number, col: number];

/** Паттерн: форма из клеток и множитель. */
export interface Pattern {
  id: string; // имя для кода
  multiplier: number; // × паттерна: паттерн платит цену символа × multiplier
  cells: Cell[]; // форма, прижатая к левому верхнему углу; поиск сдвигает её по всей сетке
  isRow?: boolean; // ряд: в одном ряду считается только самый длинный отрезок
}

/** Все паттерны автомата. Порядок — как на панели паттернов. */
export const PATTERNS: Pattern[] = [
  { id: 'row3', multiplier: 1, cells: [[0, 0], [0, 1], [0, 2]], isRow: true },
  { id: 'row4', multiplier: 2, cells: [[0, 0], [0, 1], [0, 2], [0, 3]], isRow: true },
  { id: 'row5', multiplier: 3, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], isRow: true },
  { id: 'column', multiplier: 1, cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'diagonalDown', multiplier: 1, cells: [[0, 0], [1, 1], [2, 2]] }, // ↘
  { id: 'diagonalUp', multiplier: 1, cells: [[2, 0], [1, 1], [0, 2]] }, // ↗
  { id: 'square', multiplier: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: 'v', multiplier: 4, cells: [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]] },
  { id: 'lambda', multiplier: 4, cells: [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]] }, // Λ
  { id: 'zigzag', multiplier: 3, cells: [[0, 0], [1, 1], [0, 2], [1, 3], [0, 4]] }, // через всю сетку: верх-низ-верх
  { id: 'zigzagUp', multiplier: 3, cells: [[1, 0], [0, 1], [1, 2], [0, 3], [1, 4]] }, // низ-верх-низ
  { id: 'frame', multiplier: 6, cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]] }, // рамка 3×3 без середины
  { id: 'eye', multiplier: 8, cells: [[1, 0], [0, 1], [0, 2], [0, 3], [1, 4], [2, 1], [2, 2], [2, 3], [1, 2]] }, // глаз со зрачком
  { id: 'jackpot', multiplier: 10, cells: allCells() }, // все 15 клеток
];

/** Паттерн из одних джокеров платит как самый дорогой символ. */
const BEST_SYMBOL = SYMBOLS.reduce((best, symbol) => (symbol.price > best.price ? symbol : best));

/** Найденный паттерн: какой, из какого символа и на каких клетках. */
export interface PatternHit {
  pattern: Pattern;
  symbol: SlotSymbol;
  cells: Cell[];
}

/** Итог прокрутки. */
export interface SpinResult {
  kind: 'skull' | 'win' | 'nothing';
  win: number; // сумма «цена символа × множитель паттерна», ещё без множителя серии; при черепах 0
  hits: PatternHit[]; // при черепах — паттерны из черепов, иначе — выигравшие паттерны
  tickets: number; // сколько билетов 🎟 на экране
}

/** Все клетки сетки — форма джекпота. */
function allCells(): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col++) cells.push([row, col]);
  }
  return cells;
}

/** Ширина и высота формы в клетках. */
export function patternSize(pattern: Pattern): { width: number; height: number } {
  const width = 1 + Math.max(...pattern.cells.map(([, col]) => col));
  const height = 1 + Math.max(...pattern.cells.map(([row]) => row));
  return { width, height };
}

/** Все места паттерна на сетке: форму сдвигаем вправо и вниз, пока она не упрётся в край. */
export function placements(pattern: Pattern): Cell[][] {
  const { width, height } = patternSize(pattern);
  const result: Cell[][] = [];
  for (let top = 0; top + height <= GRID_ROWS; top++) {
    for (let left = 0; left + width <= GRID_COLUMNS; left++) {
      result.push(pattern.cells.map(([row, col]): Cell => [row + top, col + left]));
    }
  }
  return result;
}

/** Все места всех паттернов. Считаем один раз: сетка не меняется. */
const ALL_PLACEMENTS = PATTERNS.flatMap((pattern) => placements(pattern).map((cells) => ({ pattern, cells })));

/**
 * Какой символ сложился на клетках: все одинаковые — он. Джокер заменяет любой платящий символ,
 * одни джокеры — паттерн платит как самый дорогой символ. Черепа джокер не заменяет, особые символы в паттерны не складываются.
 * Не сложилось — null.
 */
function patternSymbol(grid: Grid, cells: Cell[]): SlotSymbol | null {
  let symbol: SlotSymbol | null = null;
  let hasJoker = false;
  for (const [row, col] of cells) {
    const cell = grid[row][col];
    if (isSpecial(cell)) return null; // билеты, кубики и злые символы в паттерны не складываются
    if (isJoker(cell)) {
      hasJoker = true;
      continue;
    }
    if (!symbol) symbol = cell;
    else if (cell.id !== symbol.id) return null;
  }
  if (!symbol) return BEST_SYMBOL; // все клетки — джокеры
  if (isSkull(symbol) && hasJoker) return null; // черепа джокер не достраивает
  return symbol;
}

/** Ряд внутри более длинного ряда: «ряд из 4» не считается ещё и «рядом из 3». */
function isInsideLongerRow(hit: PatternHit, hits: PatternHit[]): boolean {
  if (!hit.pattern.isRow) return false;
  const row = hit.cells[0][0];
  return hits.some((other) => other.pattern.isRow && other.cells[0][0] === row && other.cells.length > hit.cells.length);
}

/** Столбцы, где лежит замок 🔒: замок блокирует свой столбец — паттерны через него не считаются, и черепа тоже. */
export function lockedColumns(grid: Grid): Set<number> {
  const columns = new Set<number>();
  grid.forEach((line) => line.forEach((symbol, col) => {
    if (isLock(symbol)) columns.add(col);
  }));
  return columns;
}

/** Все паттерны на сетке, и из черепов тоже. Джекпот перекрывает всё, в одном ряду — только самый длинный отрезок. Через столбцы с замком — нет. */
export function findPatterns(grid: Grid): PatternHit[] {
  const hits: PatternHit[] = [];
  const locked = lockedColumns(grid);
  for (const { pattern, cells } of ALL_PLACEMENTS) {
    if (cells.some(([, col]) => locked.has(col))) continue;
    const symbol = patternSymbol(grid, cells);
    if (symbol) hits.push({ pattern, symbol, cells });
  }
  const jackpot = hits.find((hit) => hit.pattern.id === 'jackpot');
  if (jackpot) return [jackpot];
  return hits.filter((hit) => !isInsideLongerRow(hit, hits));
}

/** Клетки, где лежат билеты 🎟. */
export function ticketCells(grid: Grid): Cell[] {
  const cells: Cell[] = [];
  grid.forEach((line, row) => line.forEach((symbol, col) => {
    if (isTicket(symbol)) cells.push([row, col]);
  }));
  return cells;
}

/** Сколько билетов 🎟 на сетке. */
function countTickets(grid: Grid): number {
  return ticketCells(grid).length;
}

/** Итог прокрутки: паттерн из черепов сжигает всё; иначе выигрыш — сумма «цена символа × множитель паттерна». И сколько на экране билетов. */
export function evaluateGrid(grid: Grid): SpinResult {
  const hits = findPatterns(grid);
  const tickets = countTickets(grid);
  const skullHits = hits.filter((hit) => isSkull(hit.symbol));
  if (skullHits.length > 0) return { kind: 'skull', win: 0, hits: skullHits, tickets };
  if (hits.length === 0) return { kind: 'nothing', win: 0, hits, tickets };

  let win = 0;
  for (const hit of hits) win += hit.symbol.price * hit.pattern.multiplier;
  return { kind: 'win', win, hits, tickets };
}

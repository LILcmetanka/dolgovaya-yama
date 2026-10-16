/**
 * Правила «Долговой ямы»: символы, сетка 5×3, долг и множитель серии.
 * Паттерны и подсчёт выигрыша — в patterns.ts. Здесь нет Phaser — только числа и маленькие чистые функции.
 */

/** Сколько прокруток даётся на один раунд. */
export const SPINS_PER_ROUND = 12;
/** Долг первого раунда. */
export const DEBT_START = 30;
/** Во сколько раз долг растёт с каждым раундом. */
export const DEBT_GROWTH = 1.8;
/** До скольких округляется долг. */
export const DEBT_ROUND_TO = 10;
/** На сколько растёт множитель с каждой прокруткой подряд. */
export const MULTIPLIER_STEP = 1;
/** Сетка автомата: 5 столбцов и 3 ряда. */
export const GRID_COLUMNS = 5;
export const GRID_ROWS = 3;
/** Вес черепа: чем больше, тем чаще он выпадает. 26 — около 3 черепов на экране и паттерн из черепов в ~16% прокруток. */
export const SKULL_WEIGHT = 26;

/** Символ в клетке сетки. */
export interface SlotSymbol {
  id: string; // имя для кода
  sign: string; // что нарисовано в клетке
  color: number; // цвет фона клетки — символы различаются, даже если эмодзи не отрисуется
  weight: number; // вес: чем больше, тем чаще выпадает
  price: number; // скрытая цена: столько платит паттерн ×1 из этого символа. На экране её нет
}

/**
 * Все символы автомата. Череп ничего не платит: паттерн из черепов сжигает кон (см. patterns.ts).
 * Веса и цены подобраны симуляцией: редкий символ дороже.
 */
export const SYMBOLS: SlotSymbol[] = [
  { id: 'cherry', sign: '🍒', color: 0xef4444, weight: 30, price: 4 },
  { id: 'lemon', sign: '🍋', color: 0xfacc15, weight: 25, price: 6 },
  { id: 'bell', sign: '🔔', color: 0xf97316, weight: 18, price: 9 },
  { id: 'diamond', sign: '💎', color: 0x22d3ee, weight: 13, price: 15 },
  { id: 'seven', sign: '7', color: 0xa855f7, weight: 9, price: 25 },
  { id: 'skull', sign: '💀', color: 0x111827, weight: SKULL_WEIGHT, price: 0 },
];

/** Сетка после прокрутки: grid[ряд][столбец]. Ряд 0 — верхний, столбец 0 — левый. */
export type Grid = SlotSymbol[][];

/** Череп ли это. */
export function isSkull(symbol: SlotSymbol): boolean {
  return symbol.id === 'skull';
}

/** Случайный символ с учётом весов. */
export function randomSymbol(): SlotSymbol {
  let totalWeight = 0;
  for (const symbol of SYMBOLS) totalWeight += symbol.weight;

  // Бросаем число от 0 до суммы весов и смотрим, в чей отрезок оно попало.
  let roll = Math.random() * totalWeight;
  for (const symbol of SYMBOLS) {
    if (roll < symbol.weight) return symbol;
    roll -= symbol.weight;
  }
  return SYMBOLS[SYMBOLS.length - 1]; // сюда не дойдём, но TypeScript требует return
}

/** Прокрутка: в каждой из 15 клеток независимо выпадает свой символ. */
export function spinGrid(): Grid {
  const grid: Grid = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const cells: SlotSymbol[] = [];
    for (let col = 0; col < GRID_COLUMNS; col++) cells.push(randomSymbol());
    grid.push(cells);
  }
  return grid;
}

/** Долг раунда N = DEBT_START × DEBT_GROWTH^(N−1), округлённый до DEBT_ROUND_TO: 30, 50, 100, 170, 310… */
export function debtForRound(round: number): number {
  const exact = DEBT_START * DEBT_GROWTH ** (round - 1);
  return Math.round(exact / DEBT_ROUND_TO) * DEBT_ROUND_TO;
}

/**
 * Множитель прокрутки. streak — сколько прокруток подряд уже было без паттерна из черепов и без «забрать»:
 * 0 → ×1, 1 → ×2, 2 → ×3… (при MULTIPLIER_STEP = 1).
 */
export function multiplierForStreak(streak: number): number {
  return 1 + streak * MULTIPLIER_STEP;
}

/** Сколько прокрутка кладёт на кон: выигрыш паттернов × множитель серии, округлённый до целого. */
export function winWithMultiplier(win: number, multiplier: number): number {
  return Math.round(win * multiplier);
}

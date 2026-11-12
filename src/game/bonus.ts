import { cellsOf } from './evil';
import { evaluateGrid, PATTERNS, placements, type SpinResult } from './patterns';
import { isPaying, isSkull, randomSymbol, spinGrid, type Grid, type SlotSymbol, type WeightOf } from './rules';

/**
 * Удача: корона, клевер и джекпот — что они дают, когда выпали. Без Phaser.
 * 👑 корона: CROWNS_FOR_FREE_SPINS и больше на экране (где угодно) — бесплатные прокрутки, как фриспины в казино:
 * крутятся сами, черепов, кубика, пауков, замков и крови в них нет — прокрутка полностью чистая (так решил автор:
 * короны стали сильнее, поэтому их и стало меньше — 3/4/6). Лампочки прокруток они не тратят.
 * 🍀 клевер: следующая прокрутка — наверняка с паттерном: любой из паттернов на стекле, от ряда из 3 до джекпота.
 * Джекпот: кроме фишек — ещё билеты и прокрутки.
 */

export const CROWNS_FOR_FREE_SPINS = 3; // столько корон на экране (или больше) — бесплатные прокрутки
export const FREE_SPINS = [3, 4, 6]; // сколько бесплатных прокруток за 3, 4 и 5 (и больше) корон
/**
 * Потолок бесплатных прокруток за раунд. С предметом «удача» (👑 вес ×2) цепочка «бесплатная прокрутка даёт короны»
 * может не сходиться: бесплатная прокрутка чистая, и доля корон в ней выше, чем в обычной. Без удачи потолок почти
 * не виден. Число сверялось симуляцией (full-run.mjs).
 */
export const MAX_FREE_SPINS_PER_ROUND = 25;
export const JACKPOT_TICKETS = 2; // джекпот: столько билетов…
export const JACKPOT_SPINS = 3; // …и столько прокруток
const LUCKY_TRIES = 100; // клевер: сколько раз перекрутить, пока паттерн не засчитается (обычно хватает одной-двух)

/** Сколько бесплатных прокруток дают crowns корон на экране: меньше CROWNS_FOR_FREE_SPINS — ни одной. */
export function freeSpinsFor(crowns: number): number {
  if (crowns < CROWNS_FOR_FREE_SPINS) return 0;
  return FREE_SPINS[Math.min(crowns - CROWNS_FOR_FREE_SPINS, FREE_SPINS.length - 1)];
}

/** Сколько корон на сетке. */
export function countCrowns(grid: Grid): number {
  return cellsOf(grid, 'crown').length;
}

/** Есть ли на сетке клевер: тогда следующая прокрутка — с паттерном наверняка. */
export function hasClover(grid: Grid): boolean {
  return cellsOf(grid, 'clover').length > 0;
}

/** Вес символа в бесплатной прокрутке: она полностью чистая — ни черепов, ни кубика Дилера, ни пауков, замков и крови. */
export function freeSpinWeight(symbol: SlotSymbol, weight: number): number {
  return isSkull(symbol) || symbol.isEvil ? 0 : weight;
}

/**
 * Прокрутка после клевера: случайный паттерн со стекла (любой с равным шансом, и джекпот тоже) на случайном месте,
 * из случайного платящего символа (по весам этой прокрутки); остальные клетки выпадают как обычно.
 * Если паттерн не засчитался (его столбец заблокировал замок или рядом сложились черепа) — крутим заново.
 */
export function luckyGrid(weightOf: WeightOf): Grid {
  const payingWeight: WeightOf = (symbol) => (isPaying(symbol) ? weightOf(symbol) : 0);
  for (let tries = 1; ; tries++) {
    const grid = spinGrid(weightOf);
    const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    const places = placements(pattern);
    const cells = places[Math.floor(Math.random() * places.length)];
    const symbol = randomSymbol(payingWeight);
    for (const [row, col] of cells) grid[row][col] = symbol;
    if (evaluateGrid(grid).kind === 'win' || tries >= LUCKY_TRIES) return grid;
  }
}

/** Джекпот ли выпал: все 15 клеток — один символ. */
export function isJackpot(result: SpinResult): boolean {
  return result.kind === 'win' && result.hits.some((hit) => hit.pattern.id === 'jackpot');
}

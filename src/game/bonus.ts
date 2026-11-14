import { cellsOf } from './evil';
import { evaluateGrid, PATTERNS, placements, type Pattern, type SpinResult } from './patterns';
import { isPaying, isSkull, randomSymbol, spinGrid, type Grid, type SlotSymbol, type WeightOf } from './rules';

/**
 * Удача: корона, клевер и джекпот — что они дают, когда выпали. Без Phaser.
 * 👑 корона: CROWNS_FOR_FREE_SPINS и больше на экране (где угодно) — бесплатные прокрутки, как фриспины в казино:
 * крутятся сами, черепов, кубика, пауков, замков и крови в них нет — прокрутка полностью чистая (так решил автор:
 * короны стали сильнее, поэтому их и стало меньше — 3/4/6). Лампочки прокруток они не тратят.
 * Бесплатная прокрутка тоже может дать короны — цепочка разрешена, игрового потолка за раунд нет (решение автора):
 * сколько корон выпало, столько прокруток короны и дают. От зацикливания раунда держит только технический
 * предохранитель FREE_SPINS_GUARD — он игроку не виден.
 * 🍀 клевер: следующая прокрутка — наверняка с паттерном: любой из паттернов на стекле, от ряда из 3 до джекпота.
 * Клеверов на экране может быть несколько, и они стакаются: один — равные шансы, два — сильные паттерны чаще,
 * три и больше — ещё чаще (cloverPatternWeight). Удача тратится на одну прокрутку целиком.
 * Джекпот: кроме фишек — ещё билеты и прокрутки.
 */

export const CROWNS_FOR_FREE_SPINS = 3; // столько корон на экране (или больше) — бесплатные прокрутки
export const FREE_SPINS = [3, 4, 6]; // сколько бесплатных прокруток за 3, 4 и 5 (и больше) корон
/**
 * Технический предохранитель от зависания раунда, а не игровое правило: столько бесплатных прокруток за раунд —
 * предел. Он игроку не виден (ни попапа, ни рамок), а срабатывание в консоли — console.warn('free spins guard').
 * Игрового потолка за раунд нет (решение автора): короны дают все прокрутки, что положены за выпавшие короны.
 * Предохранитель нужен на случай, если цепочка «бесплатная прокрутка даёт короны» не сойдётся (так было с «удачей»,
 * 👑 вес ×2, при старом потолке 25): тогда раунд кончится штатно, а не будет крутиться вечно. Число сверялось
 * симуляцией (full-run.mjs): до 500 цепочка доходит редко — в 2–3 % забегов, и без предела она бы не кончилась.
 */
export const FREE_SPINS_GUARD = 500;
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

/** Сколько клеверов на сетке: от их числа зависит, какой паттерн выберет удача (стакинг, DONTLIKE п. 17). */
export function countClovers(grid: Grid): number {
  return cellsOf(grid, 'clover').length;
}

// вес паттерна растёт с числом клеверов, но множитель выше 4 не считается:
// иначе джекпот (×100) съедал бы всю удачу уже при двух клеверах
const CLOVER_MULTIPLIER_CAP = 4;

/**
 * Вес паттерна в удаче при clovers клеверах. Чем больше клеверов, тем чаще сильные паттерны:
 * один клевер — у всех паттернов вес 1 (равные шансы, как было), дальше вес растёт как множитель паттерна в степени.
 */
export function cloverPatternWeight(pattern: Pattern, clovers: number): number {
  // 1 клевер — 0, 2 — 1, 3 и больше — 2: выше второй степени выигрыш не растёт.
  // Клеверы — счётчик с сетки, но степень берём от целого: 2,5 не должно давать 4^1,5 между ступенями.
  const boost = Math.max(0, Math.min(Math.floor(clovers), 3) - 1);
  return Math.pow(Math.min(pattern.multiplier, CLOVER_MULTIPLIER_CAP), boost);
}

/** Вес символа в бесплатной прокрутке: она полностью чистая — ни черепов, ни кубика Дилера, ни пауков, замков и крови. */
export function freeSpinWeight(symbol: SlotSymbol, weight: number): number {
  return isSkull(symbol) || symbol.isEvil ? 0 : weight;
}

/**
 * Прокрутка после клевера: паттерн со стекла на случайном месте, из случайного платящего символа (по весам этой прокрутки);
 * остальные клетки выпадают как обычно. Паттерн выбирается по весам клеверов: с одним — равный шанс, с двумя и больше —
 * сильные чаще (cloverPatternWeight); джекпот входит в те же веса, отдельного шанса у него нет.
 * Если паттерн не засчитался (его столбец заблокировал замок или рядом сложились черепа) — крутим заново.
 */
export function luckyGrid(weightOf: WeightOf, clovers = 1): Grid {
  // Контракт: клеверов меньше одного — удачи нет, сетка обычная. Иначе ноль клеверов тихо давал бы
  // полноценный паттерн, а это уже не «обычная прокрутка», и ошибку в вызове никто бы не заметил.
  // NaN проверяем отдельно: `NaN < 1` — false, и он прошёл бы дальше, а pickPattern на пустых весах выдал бы джекпот.
  if (!Number.isFinite(clovers) || clovers < 1) return spinGrid(weightOf);
  const payingWeight: WeightOf = (symbol) => (isPaying(symbol) ? weightOf(symbol) : 0);
  for (let tries = 1; ; tries++) {
    const grid = spinGrid(weightOf);
    const pattern = pickPattern(clovers);
    const places = placements(pattern);
    const cells = places[Math.floor(Math.random() * places.length)];
    const symbol = randomSymbol(payingWeight);
    for (const [row, col] of cells) grid[row][col] = symbol;
    if (evaluateGrid(grid).kind === 'win' || tries >= LUCKY_TRIES) return grid;
  }
}

/** Паттерн по весам клеверов: сумма весов, случайное число, накопительный проход. */
function pickPattern(clovers: number): Pattern {
  const weights = PATTERNS.map((pattern) => cloverPatternWeight(pattern, clovers));
  let roll = Math.random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < PATTERNS.length; i++) {
    if (roll < weights[i]) return PATTERNS[i];
    roll -= weights[i];
  }
  return PATTERNS[PATTERNS.length - 1]; // округление в конце: последний паттерн, если число легло на самый край
}

/** Джекпот ли выпал: все 15 клеток — один символ. */
export function isJackpot(result: SpinResult): boolean {
  return result.kind === 'win' && result.hits.some((hit) => hit.pattern.id === 'jackpot');
}

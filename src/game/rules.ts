import { GAME_CONFIG } from './gameConfig';

/**
 * Правила «Долговой ямы»: символы, сетка 5×3, долг и множитель серии.
 * Паттерны и подсчёт выигрыша — в patterns.ts. Здесь нет Phaser — только числа и маленькие чистые функции.
 * Главные числа баланса (прокрутки, долг, черепа, множитель) — ручки в gameConfig.ts, здесь у них имена для кода.
 */

/** Сколько прокруток даётся на один раунд. */
export const SPINS_PER_ROUND = GAME_CONFIG.spinsPerRound;
/** Долг первого раунда. */
export const DEBT_START = GAME_CONFIG.debtStart;
/** Во сколько раз долг растёт с каждым раундом. */
export const DEBT_GROWTH = GAME_CONFIG.debtGrowth;
/** До скольких округляется долг. */
export const DEBT_ROUND_TO = 10;
/** На сколько растёт множитель с каждой прокруткой подряд. */
export const MULTIPLIER_STEP = GAME_CONFIG.multiplierStep;
/** Какую долю серии оставляет «забрать»: множитель не падает до ×1, а уменьшается вдвое. */
export const TAKE_KEEPS_STREAK = GAME_CONFIG.takeKeepsStreak;
/** Сетка автомата: 5 столбцов и 3 ряда. */
export const GRID_COLUMNS = 5;
export const GRID_ROWS = 3;
/** Вес черепа в первом раунде: около 3 черепов на экране и паттерн из черепов в ~16% прокруток. */
export const SKULL_WEIGHT = GAME_CONFIG.skullWeight;
/**
 * Дальше череп держит ту же долю клеток, ~21,5%: когда в автомат входят новые символы, его вес растёт вместе с ними
 * (иначе черепов становится меньше, и игра делается спокойнее). Вес черепа = сумма весов остальных × SKULL_RATIO.
 */
const FIRST_ROUND_OTHERS = 95; // сумма весов остальных символов первого раунда: 30 + 25 + 18 + 13 + 9
export const SKULL_RATIO = SKULL_WEIGHT / FIRST_ROUND_OTHERS;

/** Символ в клетке сетки. */
export interface SlotSymbol {
  id: string; // имя для кода
  sign: string; // что нарисовано в клетке
  color: number; // цвет фона клетки — символы различаются, даже если эмодзи не отрисуется
  weight: number; // вес: чем больше, тем чаще выпадает (у кубика растёт, пока его нет, — см. evil.ts)
  price: number; // цена: столько платит паттерн ×1 из этого символа (её видно на мониторе справа); 0 — символ не платит
  unlockRound: number; // с какого раунда символ есть в автомате: 1 — с самого начала
  isEvil?: boolean; // злой символ или кубик Дилера: новость о нём красная — «ВНИМАНИЕ»
}

/**
 * Все символы автомата. Череп ничего не платит: паттерн из черепов сжигает кон (см. patterns.ts).
 * Джокер 🃏 заменяет в паттерне любой платящий символ. Особые символы (🎟 билет, 🎲 кубик, злые 🕷 🔒 🩸, удача 🍀 👑)
 * в паттерны не складываются — у них свои правила (TICKET_SCATTER, evil.ts, bonus.ts).
 * Новые символы входят в автомат по ходу забега (unlockRound). Веса и цены подобраны симуляцией: редкий символ дороже.
 * Порядок важен только для случайного выбора (randomSymbol): закрытые символы с весом 0 его не меняют.
 */
export const SYMBOLS: SlotSymbol[] = [
  { id: 'cherry', sign: '🍒', color: 0xef4444, weight: 30, price: 4, unlockRound: 1 },
  { id: 'lemon', sign: '🍋', color: 0xfacc15, weight: 25, price: 6, unlockRound: 1 },
  { id: 'grape', sign: '🍇', color: 0x7c3aed, weight: 16, price: 10, unlockRound: 5 },
  { id: 'bell', sign: '🔔', color: 0xf97316, weight: 18, price: 9, unlockRound: 1 },
  { id: 'clover', sign: '🍀', color: 0x16a34a, weight: 1, price: 0, unlockRound: 7 }, // редкий, ~раз за раунд: следующая прокрутка — с паттерном (bonus.ts)
  { id: 'diamond', sign: '💎', color: 0x22d3ee, weight: 13, price: 15, unlockRound: 1 },
  { id: 'crown', sign: '👑', color: 0xca8a04, weight: 10, price: 0, unlockRound: 9 }, // 3 и больше на экране — бесплатные прокрутки (bonus.ts)
  { id: 'seven', sign: '7', color: 0xa855f7, weight: 9, price: 25, unlockRound: 1 },
  { id: 'joker', sign: '🃏', color: 0x312e81, weight: 8, price: 0, unlockRound: 3 },
  { id: 'ticket', sign: '🎟', color: 0xb45309, weight: 6, price: 0, unlockRound: 2 }, // в клетке — не эмодзи, а красный билет, как на табло (decor.ts)
  { id: 'dice', sign: '🎲', color: 0x9d174d, weight: 2, price: 0, unlockRound: 4, isEvil: true },
  { id: 'spider', sign: '🕷', color: 0x3f3f46, weight: 6, price: 0, unlockRound: 6, isEvil: true },
  { id: 'lock', sign: '🔒', color: 0x57534e, weight: 5, price: 0, unlockRound: 8, isEvil: true },
  { id: 'blood', sign: '🩸', color: 0x7f1d1d, weight: 4, price: 0, unlockRound: 10, isEvil: true },
  { id: 'skull', sign: '💀', color: 0x111827, weight: SKULL_WEIGHT, price: 0, unlockRound: 1 },
];

/** Столько билетов 🎟 на экране (или больше) — +1 настоящий билет. */
export const TICKET_SCATTER = 3;

/** Сетка после прокрутки: grid[ряд][столбец]. Ряд 0 — верхний, столбец 0 — левый. */
export type Grid = SlotSymbol[][];

/** Череп ли это. */
export function isSkull(symbol: SlotSymbol): boolean {
  return symbol.id === 'skull';
}

/** Джокер ли это: в паттерне заменяет любой платящий символ. */
export function isJoker(symbol: SlotSymbol): boolean {
  return symbol.id === 'joker';
}

/** Билет ли это: в паттерны не складывается, TICKET_SCATTER штук на экране — +1 билет. */
export function isTicket(symbol: SlotSymbol): boolean {
  return symbol.id === 'ticket';
}

/** Платящий ли символ: у него есть цена, из него складываются выигрышные паттерны. */
export function isPaying(symbol: SlotSymbol): boolean {
  return symbol.price > 0;
}

/** Особый ли символ: не платит, не череп и не джокер (билет, кубик, злые, клевер, корона). В паттерны не складывается. */
export function isSpecial(symbol: SlotSymbol): boolean {
  return !isPaying(symbol) && !isSkull(symbol) && !isJoker(symbol);
}

/** Замок ли это: блокирует свой столбец — паттерны через него не считаются (см. patterns.ts). */
export function isLock(symbol: SlotSymbol): boolean {
  return symbol.id === 'lock';
}

/** Кубик ли это — кубик Дилера (его вес растёт, пока он не выпадает). */
export function isDice(symbol: SlotSymbol): boolean {
  return symbol.id === 'dice';
}

/** Есть ли символ в автомате в раунде round. */
export function isUnlocked(symbol: SlotSymbol, round: number): boolean {
  return round >= symbol.unlockRound;
}

/** Какие символы впервые входят в автомат в раунде round — о них показывают новость. */
export function symbolsUnlockedAt(round: number): SlotSymbol[] {
  return SYMBOLS.filter((symbol) => symbol.unlockRound === round && round > 1);
}

/** Вес символа в прокрутке. Обычно это его weight (0 — символа ещё нет в автомате), но чеснок и амулеты его меняют (см. RoundScene.symbolWeight). */
export type WeightOf = (symbol: SlotSymbol) => number;
const BASE_WEIGHT: WeightOf = (symbol) => (isUnlocked(symbol, 1) ? symbol.weight : 0);

/**
 * Обычные веса в раунде round: символов, которых ещё нет в автомате, не бывает, череп держит свою долю клеток.
 * diceWeight — вес кубика в этой прокрутке (он растёт, пока кубик не выпадает; см. evil.ts). Долю черепа кубик не меняет.
 */
export function weightsForRound(round: number, diceWeight?: number): WeightOf {
  let others = 0;
  for (const symbol of SYMBOLS) {
    if (!isSkull(symbol) && !isDice(symbol) && isUnlocked(symbol, round)) others += symbol.weight;
  }
  const skullWeight = others * SKULL_RATIO;
  return (symbol) => {
    if (!isUnlocked(symbol, round)) return 0;
    if (isSkull(symbol)) return skullWeight;
    if (isDice(symbol) && diceWeight !== undefined) return diceWeight;
    return symbol.weight;
  };
}

/** Случайный символ с учётом весов. */
export function randomSymbol(weightOf: WeightOf = BASE_WEIGHT): SlotSymbol {
  let totalWeight = 0;
  for (const symbol of SYMBOLS) totalWeight += weightOf(symbol);

  // Бросаем число от 0 до суммы весов и смотрим, в чей отрезок оно попало.
  let roll = Math.random() * totalWeight;
  for (const symbol of SYMBOLS) {
    const weight = weightOf(symbol);
    if (roll < weight) return symbol;
    roll -= weight;
  }
  return SYMBOLS[SYMBOLS.length - 1]; // сюда не дойдём, но TypeScript требует return
}

/** Прокрутка: в каждой из 15 клеток независимо выпадает свой символ. weightOf — веса этой прокрутки. */
export function spinGrid(weightOf: WeightOf = BASE_WEIGHT): Grid {
  const grid: Grid = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    const cells: SlotSymbol[] = [];
    for (let col = 0; col < GRID_COLUMNS; col++) cells.push(randomSymbol(weightOf));
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
 * Множитель прокрутки. streak — серия: +1 за каждую прокрутку без паттерна из черепов; черепа и новый раунд её обнуляют,
 * «забрать» уменьшает (streakAfterTake). 0 → ×1, 1 → ×2, 2 → ×3… (при шаге MULTIPLIER_STEP = 1; амулет «Разгон» делает шаг больше).
 */
export function multiplierForStreak(streak: number, step = MULTIPLIER_STEP): number {
  return 1 + streak * step;
}

/**
 * Серия после «забрать»: остаётся TAKE_KEEPS_STREAK от неё, с округлением вниз — ×9 → ×5, ×4 → ×2, ×2 → ×1.
 * Если сбрасывать до ×1, на поздних раундах забирать невыгодно: с ×1 долг уже не добить. Совсем не трогать серию тоже нельзя —
 * тогда забирать выгодно всегда (симуляция, шаг 27).
 */
export function streakAfterTake(streak: number): number {
  return Math.floor(streak * TAKE_KEEPS_STREAK);
}

/** Сколько прокрутка кладёт на кон: выигрыш паттернов × множитель серии, округлённый до целого. */
export function winWithMultiplier(win: number, multiplier: number): number {
  return Math.round(win * multiplier);
}

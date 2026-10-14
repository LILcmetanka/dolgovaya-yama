/**
 * Правила «Долговой ямы»: символы, выплаты, оценка линии, долг, множитель и усиления.
 * Здесь нет Phaser — только числа и маленькие чистые функции.
 */

/** Сколько прокруток даётся на один раунд. */
export const SPINS_PER_ROUND = 12;
/** Долг первого раунда. */
export const DEBT_START = 30;
/** Во сколько раз долг растёт с каждым раундом. */
export const DEBT_GROWTH = 1.5;
/** До скольких округляется долг. */
export const DEBT_ROUND_TO = 10;
/** На сколько растёт множитель с каждой прокруткой подряд. */
export const MULTIPLIER_STEP = 1;
/** Вес черепа: чем больше, тем чаще он выпадает. */
export const SKULL_WEIGHT = 8;
/** Сколько прокруток добавляет усиление «+2 прокрутки». */
export const EXTRA_SPINS = 2;
/** Во сколько раз «двойное забрать» увеличивает вносимый кон. */
export const TAKE_BOOST = 2;

/** Символ на барабане. */
export interface SlotSymbol {
  id: string; // имя для кода
  sign: string; // что нарисовано на барабане
  color: number; // цвет фона барабана — символы различаются, даже если эмодзи не отрисуется
  weight: number; // вес: чем больше, тем чаще выпадает
  pair: number; // выигрыш за два одинаковых
  three: number; // выигрыш за три одинаковых
}

/** Все символы автомата. Череп ничего не платит — его проверяют первым (см. evaluateLine). */
export const SYMBOLS: SlotSymbol[] = [
  { id: 'cherry', sign: '🍒', color: 0xef4444, weight: 30, pair: 4, three: 20 },
  { id: 'lemon', sign: '🍋', color: 0xfacc15, weight: 25, pair: 6, three: 30 },
  { id: 'bell', sign: '🔔', color: 0xf97316, weight: 18, pair: 10, three: 50 },
  { id: 'diamond', sign: '💎', color: 0x22d3ee, weight: 10, pair: 20, three: 100 },
  { id: 'seven', sign: '7', color: 0xa855f7, weight: 5, pair: 40, three: 400 },
  { id: 'skull', sign: '💀', color: 0x111827, weight: SKULL_WEIGHT, pair: 0, three: 0 },
];

/** Усиление из магазина. Покупается за излишек, который остался после закрытия долга. */
export interface PowerUp {
  id: 'spins' | 'shield' | 'double';
  name: string; // название в магазине
  hint: string; // что делает, коротко
  price: number; // сколько стоит из излишка
}

/**
 * Магазин усилений. Цены подобраны симуляцией: покупка помогает,
 * но и оставить излишек в счёт нового долга — тоже нормальный выбор.
 */
export const POWER_UPS: PowerUp[] = [
  { id: 'spins', name: `+${EXTRA_SPINS} прокрутки`, hint: 'в этом раунде', price: 10 },
  { id: 'shield', name: 'Щит от черепа', hint: 'один раз спасёт кон', price: 15 },
  { id: 'double', name: 'Двойное «забрать»', hint: `следующий кон ×${TAKE_BOOST}`, price: 30 },
];

/** Линия — три символа, по одному с каждого барабана. */
export type Line = [SlotSymbol, SlotSymbol, SlotSymbol];

/** Чем закончилась прокрутка. */
export interface LineResult {
  kind: 'skull' | 'three' | 'pair' | 'nothing';
  win: number; // выигрыш из таблицы выплат, ещё без множителя
  reels: number[]; // номера барабанов (0, 1, 2): где череп или какие совпали
}

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

/** Прокрутка: на каждом из трёх барабанов независимо выпадает свой символ. */
export function spinLine(): Line {
  return [randomSymbol(), randomSymbol(), randomSymbol()];
}

/** Оценка линии строго по порядку: череп → три одинаковых → пара → ничего. */
export function evaluateLine(line: Line): LineResult {
  const skullReels = [0, 1, 2].filter((reel) => isSkull(line[reel]));
  if (skullReels.length > 0) return { kind: 'skull', win: 0, reels: skullReels };

  const [a, b, c] = line;
  if (a.id === b.id && b.id === c.id) return { kind: 'three', win: a.three, reels: [0, 1, 2] };
  if (a.id === b.id) return { kind: 'pair', win: a.pair, reels: [0, 1] };
  if (a.id === c.id) return { kind: 'pair', win: a.pair, reels: [0, 2] };
  if (b.id === c.id) return { kind: 'pair', win: b.pair, reels: [1, 2] };
  return { kind: 'nothing', win: 0, reels: [] };
}

/** Долг раунда N = DEBT_START × DEBT_GROWTH^(N−1), округлённый до DEBT_ROUND_TO: 30, 50, 70, 100, 150… */
export function debtForRound(round: number): number {
  const exact = DEBT_START * DEBT_GROWTH ** (round - 1);
  return Math.round(exact / DEBT_ROUND_TO) * DEBT_ROUND_TO;
}

/**
 * Множитель прокрутки. streak — сколько прокруток подряд уже было без черепа и без «забрать»:
 * 0 → ×1, 1 → ×2, 2 → ×3… (при MULTIPLIER_STEP = 1).
 */
export function multiplierForStreak(streak: number): number {
  return 1 + streak * MULTIPLIER_STEP;
}

/** Сколько прокрутка кладёт на кон: выигрыш из таблицы × множитель, округлённый до целого. */
export function winWithMultiplier(win: number, multiplier: number): number {
  return Math.round(win * multiplier);
}

/** Цена самого дешёвого усиления: если излишек меньше, магазин не открывается. */
export function cheapestPowerUpPrice(): number {
  return Math.min(...POWER_UPS.map((powerUp) => powerUp.price));
}

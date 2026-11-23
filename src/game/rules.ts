import { GAME_CONFIG } from './gameConfig';

/**
 * Правила «Долговой ямы»: символы, сетка 5×3, долг и множитель серии.
 * Паттерны и подсчёт выигрыша — в patterns.ts. Здесь нет Phaser — только числа и маленькие чистые функции.
 * Главные числа баланса (прокрутки, долг, черепа, множитель) — ручки в gameConfig.ts, здесь у них имена для кода.
 */

/** Сколько прокруток даётся на один раунд. */
export const SPINS_PER_ROUND = GAME_CONFIG.spinsPerRound;
/**
 * Потолок прокруток в раунде. Колокольчик 🔔 за каждый паттерн из 🔔 и буст «колокола» (вес ×2) добавляют прокрутки
 * быстрее, чем они тратятся, — без потолка раунд не кончается никогда (симуляция шага 63а: 3000 забегов, на 10-м раунде
 * прокруток уже 61 при двух колокольчиках). Потолок виден только в очень удачном раунде.
 */
export const MAX_SPINS_PER_ROUND = 30;
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
/**
 * Какую долю серии оставляет череп — «мягкий сброс» по багу 11 (решение 15.11.2026).
 * Замер `full-run.mjs`, 300 забегов, сид 1: новое правило — 10+ долгов у 71%, 1 млн у 14%;
 * старое обнуление на том же симуляторе — 63% и 10%.
 */
export const SKULL_KEEPS_STREAK = 1 / 3;
/** Сетка автомата: 5 столбцов и 3 ряда. */
export const GRID_COLUMNS = 5;
export const GRID_ROWS = 3;
/** Вес черепа в данных символов — справочное число: долю клеток задаёт skullShare (см. weightsForRound). */
export const SKULL_WEIGHT = GAME_CONFIG.skullWeight;
/**
 * Доля клеток-черепов в раунде: со skullShareStart растёт на skullShareGrowth за раунд и упирается в skullShareCap.
 * Замечание 19: раньше доля была постоянной (~21,5%), и черепа не пугали по-новому — игрок не видел, что стало хуже.
 * Рост откатывает только чеснок (🧄 ×0,5 к весу до конца раунда, items.ts); новых предметов и полей в RunSave нет —
 * доля целиком выводится из номера раунда, поэтому кассета и забег заново её не ломают.
 */
export function skullShare(round: number): number {
  const grown = GAME_CONFIG.skullShareStart + GAME_CONFIG.skullShareGrowth * (round - 1);
  return Math.min(GAME_CONFIG.skullShareCap, Math.max(GAME_CONFIG.skullShareMin, grown));
}

/**
 * Вес черепа из доли клеток: если черепов доля s, то вес = сумма весов остальных × s/(1−s) — тогда и в клетках
 * доля ровно s, какого бы размера ни был автомат. Старая постоянная доля 26/121 ≈ 0,215 даёт 26/95 — прежнее
 * SKULL_RATIO, так правка воспроизводит поведение до замечания 19 (0,215 — это старая доля, не нынешняя).
 * Долю клампим: 0 или 1 дали бы вес 0 или ∞ — такой вызов не должен ломать прокрутку.
 */
export function skullRatioFromShare(share: number): number {
  // Верхний край — чуть ниже 1: 1 дала бы ∞. Потолок нарочно высокий, чтобы поднятый skullShareCap
  // считался честно, а не молча упирался в прежние 0,6.
  const safe = Math.min(Math.max(share, 0.01), 1 - 1e-6);
  return safe / (1 - safe);
}

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
 * Джокер 🃏 заменяет в паттерне любой платящий символ. Вынесен в константу: подмена (шаг 63б) ставит его в клетку сетки.
 */
export const JOKER: SlotSymbol = { id: 'joker', sign: '🃏', color: 0x312e81, weight: 8, price: 0, unlockRound: 3 };

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
  JOKER,
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
 * Обычные веса в раунде round: символов, которых ещё нет в автомате, не бывает, а долю клеток у черепа задаёт
 * skullShare(round) — она растёт по раундам (замечание 19). У кубика вес — свой (он растёт, пока кубик не выпадает;
 * см. evil.ts), и долю черепа кубик не меняет, как и раньше.
 */
export function weightsForRound(round: number, diceWeight?: number): WeightOf {
  let others = 0;
  for (const symbol of SYMBOLS) {
    if (!isSkull(symbol) && !isDice(symbol) && isUnlocked(symbol, round)) others += symbol.weight;
  }
  const skullWeight = others * skullRatioFromShare(skullShare(round));
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

/**
 * Долг раунда N = DEBT_START × DEBT_GROWTH^(N−1), округлённый до DEBT_ROUND_TO: 150, 540, 1940, 7000, 25 190…
 * growthMul — улучшение №7 (шаг 28): долг растёт медленнее (×3,4 вместо ×3,6). Кривая та же, меняется только шаг роста;
 * без улучшения growthMul = 1 и числа прежние.
 */
export function debtForRound(round: number, growthMul = 1): number {
  const exact = DEBT_START * (DEBT_GROWTH * growthMul) ** (round - 1);
  return Math.round(exact / DEBT_ROUND_TO) * DEBT_ROUND_TO;
}

/**
 * Долг первого раунда с поправкой улучшения №6 («стартовый долг −5%»): DEBT_START × mul по тому же округлению.
 * Дальше долг считается по кривой от раунда — скидка старта на следующие раунды не переезжает.
 */
export function startDebt(mul = 1): number {
  return Math.round((DEBT_START * mul) / DEBT_ROUND_TO) * DEBT_ROUND_TO;
}

/**
 * Не хватает ли фишек на долг. Одна дверь для BaseScene.hasEnoughForDebt и Коллектора (шаг 38, `DONTLIKE` п.15):
 * прощённый долг — это 0, и платить по нему нечего, значит «не хватает» быть не может. Раньше сравнение
 * `balance >= debt` давало верный ответ случайно; теперь 0 и мусор явно считаются «долга нет»: нулевой долг
 * не включает GOOD LUCK и раунд спасения, даже если числа долга испортит сделка или сохранение.
 */
export function debtShortfall(debt: number, balance: number): boolean {
  const owed = Number.isFinite(debt) && debt > 0 ? debt : 0;
  const chips = Number.isFinite(balance) ? Math.max(0, balance) : 0;
  return owed > chips;
}

/**
 * Множитель прокрутки. streak — серия: +1 за каждую прокрутку без паттерна из черепов; черепа оставляют от неё
 * треть (streakAfterSkull), «забрать» уменьшает (streakAfterTake), а между раундами она сохраняется — новый раунд
 * начинает с той же серии.
 * 0 → ×1, 1 → ×2, 2 → ×3… (при шаге MULTIPLIER_STEP = 1; амулет «Разгон» делает шаг больше).
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

/**
 * Серия после черепа: остаётся SKULL_KEEPS_STREAK от неё, с округлением вниз — ×10 → ×4, ×4 → ×2, ×3 → ×1
 * (числа — множители). Мусор, отрицательное, NaN и Infinity — 0. Почему не «минус одна ступень» — см. SKULL_KEEPS_STREAK.
 */
export function streakAfterSkull(streak: number): number {
  if (!Number.isFinite(streak) || streak <= 0) return 0;
  return Math.floor(streak * SKULL_KEEPS_STREAK);
}

/** Сколько прокрутка кладёт на кон: выигрыш паттернов × множитель серии, округлённый до целого. */
export function winWithMultiplier(win: number, multiplier: number): number {
  return Math.round(win * multiplier);
}

/**
 * Прокрутки с бонусом, но не больше потолка за раунд — иначе бонусы обгоняют трату и раунд не кончается никогда.
 * cap — потолок: MAX_SPINS_PER_ROUND, а с улучшением №3 (шаг 28) — он плюс UPGRADE_SPIN_CAP_BONUS.
 */
export function spinsAfterBonus(spinsLeft: number, add: number, cap = MAX_SPINS_PER_ROUND): number {
  return Math.min(cap, spinsLeft + add);
}

import type { PatternHit } from './patterns';
import type { Words } from './lang';
import { isSkull, MULTIPLIER_STEP, type SlotSymbol } from './rules';

/**
 * Амулеты: постоянные на весь забег, стоят в гнёздах на корпусе автомата и меняют его правила.
 * Покупаются за билеты 🎟 в витрине над торговым автоматом. Проклятые — сильный плюс с минусом.
 * Здесь данные и что меняет каждый амулет — маленькими функциями. Без Phaser — чтобы проверить симуляцией.
 */

export type AmuletId =
  | 'cherryPit'
  | 'bell'
  | 'piggy'
  | 'insurance'
  | 'boost'
  | 'vest'
  | 'cut'
  | 'interest'
  | 'bones'
  | 'skullPocket'
  | 'greed';

/** Редкость: от неё цена и цвет ободка. Проклятый — сильный плюс с минусом. */
export type Rarity = 'common' | 'rare' | 'legendary' | 'cursed';

export interface Amulet {
  id: AmuletId;
  sign: string; // что нарисовано на амулете
  name: Words; // название — в подсказке при наведении, на двух языках
  description: Words; // что делает — в подсказке
  rarity: Rarity;
  maxCopies: number; // сколько копий можно купить (потолок стакинга)
  price?: number; // цена в билетах; нет — по редкости (AMULET_PRICES)
}

/**
 * Цена амулета в билетах — по редкости. Обычный и проклятый можно купить уже в первом магазине,
 * на редкий и легендарный надо копить несколько долгов (билет за долг — один).
 */
export const AMULET_PRICES: Record<Rarity, number> = { common: 1, rare: 3, legendary: 4, cursed: 1 };

/** Цена в билетах: целые билеты, округлённые после скидки сделки (mul), но не меньше одного. */
export function ticketPrice(price: number, mul = 1): number {
  return Math.max(1, Math.round(price * mul));
}

/** Числа амулетов. Подобраны симуляцией. */
export const CHERRY_PIT_FACTOR = 2; // косточка: паттерны из 🍒 платят во столько раз больше за каждую копию
export const BELL_SPINS = 2; // колокольчик: столько прокруток за каждый паттерн из 🔔 за каждую копию
// Колокольчик греет черепа: каждое срабатывание (паттерн из 🔔) до конца раунда делает долю черепов больше на
// BELL_SKULL_STEP за копию — так цепочка бесплатных прокруток сама себя ограничивает. Потолок — BELL_SKULL_MAX за раунд.
export const BELL_SKULL_STEP = 0.01; // 1 процентный пункт за срабатывание за копию
export const BELL_SKULL_MAX = 0.3; // больше 30 % за раунд колокольчик не добавляет
export const PIGGY_COINS = 2; // копилка: прокрутка без выигрыша кладёт на кон столько × множитель (в степени копий)
export const INSURANCE_SHARE = 0.75; // страховка: такая доля сгоревшего кона всё равно уходит на табло (один раз за копию за раунд)
/** Сделка №5 «страховка возвращает 100%»: каждая следующая копия страховки вдвое дороже предыдущей. */
export const INSURANCE_COPY_DOUBLING = 2;
export const BOOST_BONUS = 1; // разгон: множитель растёт на столько больше за прокрутку за каждую копию (обычный шаг — MULTIPLIER_STEP)
export const VEST_SHIELDS = 1; // бронежилет: столько паттернов из черепов за раунд не сжигают кон за каждую копию
export const CUT_FACTOR = 2; // огранка: 💎 выпадает во столько раз чаще за каждую копию (в степени копий)
export const INTEREST_SHARE = 0.5; // проценты: после расплаты фишки на табло растут на такую долю за каждую копию
export const BONES_BONUS = 0.15; // коллекционер костей: +15% ко всем выигрышам за каждый паттерн из черепов
export const SKULL_POCKET_SKULLS = 1.25; // череп в кармане: черепов во столько раз больше за каждую копию (в степени копий)…
export const SKULL_POCKET_WIN = 2; // …но все выигрыши во столько раз больше за каждую копию (в степени копий)
export const GREED_WIN = 2; // жадность: все выигрыши во столько раз больше за каждую копию (в степени копий)…
export const GREED_LOST_SPINS = 3; // …но прокруток в раунде на столько меньше за каждую копию

/** Все амулеты. Порядок не важен: в витрину они попадают случайно. */
export const AMULETS: Amulet[] = [
  {
    id: 'cherryPit', sign: '🍒',
    name: { ru: 'Вишнёвая косточка', en: 'Cherry pit' },
    description: { ru: 'Каждая копия: паттерны из 🍒 платят вдвое больше', en: 'Each copy: 🍒 patterns pay double' },
    rarity: 'common',
    maxCopies: 2,
  },
  {
    id: 'bell', sign: '🔔',
    name: { ru: 'Колокольчик', en: 'Little bell' },
    description: {
      ru: `Каждая копия: паттерн из 🔔 даёт +${BELL_SPINS} прокрутки и +${Math.round(BELL_SKULL_STEP * 100)} % к доле черепов до конца раунда (до +${Math.round(BELL_SKULL_MAX * 100)})`,
      en: `Each copy: a 🔔 pattern gives +${BELL_SPINS} spins and +${Math.round(BELL_SKULL_STEP * 100)}% to the skull share until the round ends (up to +${Math.round(BELL_SKULL_MAX * 100)}%)`,
    },
    rarity: 'common',
    maxCopies: 2,
  },
  {
    id: 'piggy', sign: '🐷',
    name: { ru: 'Копилка', en: 'Piggy bank' },
    description: { ru: 'Каждая копия: пустая прокрутка кладёт на кон 2 × множитель', en: 'Each copy: a losing spin adds 2 × multiplier to the pot' },
    rarity: 'common',
    maxCopies: 2,
  },
  {
    id: 'insurance', sign: '🧾',
    name: { ru: 'Страховка', en: 'Insurance' },
    description: {
      ru: `Сгоревший кон отдаёт ${Math.round(INSURANCE_SHARE * 100)}% на табло — по разу за копию в раунде`,
      en: `A burned pot pays ${Math.round(INSURANCE_SHARE * 100)}% back to your chips — once per copy per round`,
    },
    rarity: 'legendary',
    maxCopies: 2,
    price: 6, // дорогая: снимает самый частый проигрыш — сгоревший кон
  },
  {
    id: 'boost', sign: '⚡',
    name: { ru: 'Разгон', en: 'Boost' },
    description: { ru: `Каждая копия: множитель растёт на ${BOOST_BONUS} быстрее`, en: `Each copy: the multiplier grows ${BOOST_BONUS} faster` },
    rarity: 'rare',
    maxCopies: 3,
  },
  {
    id: 'vest', sign: '🦺',
    name: { ru: 'Бронежилет', en: 'Vest' },
    description: { ru: 'Каждая копия: ещё один паттерн черепов за раунд не жжёт кон', en: 'Each copy: one more skull pattern per round does not burn the pot' },
    rarity: 'rare',
    maxCopies: 2,
    price: 2,
  },
  {
    id: 'cut', sign: '💎',
    name: { ru: 'Огранка', en: 'Cut' },
    description: { ru: 'Каждая копия: 💎 выпадает вдвое чаще', en: 'Each copy: 💎 drops twice as often' },
    rarity: 'rare',
    maxCopies: 2,
    price: 2,
  },
  {
    id: 'interest', sign: '🏦',
    name: { ru: 'Проценты', en: 'Interest' },
    description: { ru: 'Каждая копия: после расплаты остаток на табло растёт на 50%', en: 'Each copy: after paying, the board balance grows by 50%' },
    rarity: 'rare',
    maxCopies: 2,
  },
  {
    id: 'bones', sign: '🦴',
    name: { ru: 'Коллекционер костей', en: 'Bone collector' },
    description: { ru: 'Каждые черепа навсегда +15% к выигрышам', en: 'Every skull pattern: +15% to wins forever' },
    rarity: 'legendary',
    maxCopies: 1,
  },
  {
    id: 'skullPocket', sign: '💀',
    name: { ru: 'Череп в кармане', en: 'Skull in pocket' },
    description: { ru: 'Каждая копия: выигрыши ×2, но и черепов больше', en: 'Each copy: wins ×2, but more skulls' },
    rarity: 'cursed',
    maxCopies: 2,
  },
  {
    id: 'greed', sign: '🩸',
    name: { ru: 'Жадность', en: 'Greed' },
    description: { ru: 'Каждая копия: выигрыши ×2, но в раунде на 3 прокрутки меньше', en: 'Each copy: wins ×2, but 3 fewer spins per round' },
    rarity: 'cursed',
    maxCopies: 2,
  },
];

/** Гнёзда для амулетов на корпусе. */
export const START_SOCKETS = 2;
export const MAX_SOCKETS = 6;
export const SOCKET_PRICES = [2, 3, 4, 5]; // цена 3-го, 4-го, 5-го и 6-го гнезда в билетах
export const AMULET_OFFER_SIZE = 3; // столько амулетов в витрине за раз
/** Мини-чемодан за фишки (`DONTLIKE` п.7): второй, меньше, ровно на два амулета. */
export const MINI_CASE_PLACES = 2;
/** Цена амулета в мини-чемодане — такая доля фишек на руках (не доля билетов). */
export const MINI_CASE_PRICE_SHARE = 0.5;
/** Ниже этого цена не опускается: у пустого кошелька амулет всё равно стоит MINI_CASE_PRICE_MIN. */
export const MINI_CASE_PRICE_MIN = 300;
/** Сколько раз за забег в мини-чемодане покупают: один амулет, как и раньше за фишки (решение СОЛО 23.11.2026). */
export const MINI_CASE_PURCHASES = 1;

/**
 * Цена амулета в мини-чемодане: доля фишек на руках (MINI_CASE_PRICE_SHARE), но не меньше MINI_CASE_PRICE_MIN.
 * mul — скидка улучшения №39 «мини-чемодан дешевле» (0,5); на нижнюю границу она не действует.
 * Мусор в балансе (NaN, минус) считается нулём: цена тогда — нижняя граница.
 */
export function miniCasePrice(balance: number, mul = 1): number {
  const bank = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const scale = Number.isFinite(mul) && mul > 0 ? mul : 1;
  return Math.max(MINI_CASE_PRICE_MIN, Math.round(bank * MINI_CASE_PRICE_SHARE * scale));
}
export const TICKETS_PER_DEBT = 1; // столько билетов за каждый отданный долг (с двумя гнёзда и амулеты заполнялись к 3–4-му долгу)
export const EARLY_PAY_MIN_SPINS = 3; // долг отдан раньше, а прокруток осталось столько или больше — ещё EARLY_PAY_TICKETS
export const EARLY_PAY_TICKETS = 1;

/**
 * Сколько копий каждого амулета: в гнёздах стоят уникальные амулеты, а дубли считаются счётчиком (шаг 62б).
 * Ключа нет — копий этого амулета нет; нулевые ключи не храним.
 */
export type AmuletCounts = Partial<Record<AmuletId, number>>;

/** Сколько копий амулета id по счётчикам. */
export function countOf(counts: AmuletCounts, id: AmuletId): number {
  return counts[id] ?? 0;
}

/** Добавить одну копию амулета id (мутация счётчика). */
export function addCopy(counts: AmuletCounts, id: AmuletId): void {
  counts[id] = countOf(counts, id) + 1;
}

/**
 * Развернуть счётчики в список id по числу копий (в порядке AMULETS). Такой список нужен существующим функциям
 * (copiesOf, winFactor, amuletWeight и остальным) — они считают копии по AmuletId[] и их не переписываем.
 */
export function amuletIdsFrom(counts: AmuletCounts): AmuletId[] {
  const ids: AmuletId[] = [];
  for (const amulet of AMULETS) {
    const count = countOf(counts, amulet.id);
    for (let i = 0; i < count; i++) ids.push(amulet.id);
  }
  return ids;
}

/** Сколько копий амулета id у игрока (стакинг: одинаковые амулеты усиливают друг друга). */
export function copiesOf(owned: AmuletId[], id: AmuletId): number {
  return owned.filter((ownedId) => ownedId === id).length;
}

/** Есть ли у игрока амулет. */
export function owns(owned: AmuletId[], id: AmuletId): boolean {
  return copiesOf(owned, id) > 0;
}

/** Цена амулета в билетах: переопределённая или по редкости, со скидкой магазина (mul — сделка №2).
 *  ticketsOff — улучшение №26 (шаг 28б): столько билетов снимается, но не ниже одного — бесплатно не продают. */
export function amuletPrice(amulet: Amulet, mul = 1, ticketsOff = 0): number {
  const price = ticketPrice(amulet.price ?? AMULET_PRICES[amulet.rarity], mul);
  const off = Number.isFinite(ticketsOff) && ticketsOff > 0 ? Math.floor(ticketsOff) : 0;
  return Math.max(1, price - off);
}

/**
 * Потолок копий амулета с улучшением №27 (шаг 28б): каждая копия улучшения поднимает потолок ВСЕХ амулетов на 1.
 * Мусор в прибавке (NaN, минус) — потолок игры.
 */
export function maxCopiesOf(amulet: Amulet, bonus = 0): number {
  const extra = Number.isFinite(bonus) && bonus > 0 ? Math.floor(bonus) : 0;
  return amulet.maxCopies + extra;
}

/** Цена копии страховки со сделкой №5: k-я копия (k — уже купленные) вдвое дороже предыдущей. */
export function insuranceCopyPrice(price: number, copies: number): number {
  return Math.round(price * INSURANCE_COPY_DOUBLING ** Math.max(0, copies));
}

/** Сколько билетов за долг, отданный раньше конца раунда: оставшиеся прокрутки пропадают, а за EARLY_PAY_MIN_SPINS и больше — билет. */
export function earlyPayTickets(spinsLeft: number): number {
  return spinsLeft >= EARLY_PAY_MIN_SPINS ? EARLY_PAY_TICKETS : 0;
}

/** Цена следующего гнезда (сейчас гнёзд sockets). Гнёзд уже MAX_SOCKETS — null.
 *  firstFree — улучшение №28 (шаг 28б): первое гнездо забега (sockets === START_SOCKETS) бесплатно. */
export function socketPrice(sockets: number, mul = 1, firstFree = false): number | null {
  if (sockets >= MAX_SOCKETS) return null;
  if (firstFree && sockets === START_SOCKETS) return 0;
  return ticketPrice(SOCKET_PRICES[sockets - START_SOCKETS], mul);
}

/**
 * Что в витрине амулетов: count разных случайных амулетов (по умолчанию AMULET_OFFER_SIZE), которых ещё можно
 * докупить (копий меньше потолка + maxCopiesBonus — улучшение №27). exclude — их не предлагать: мини-чемодан
 * не повторяет то, что уже лежит в основном (`DONTLIKE` п.7).
 */
export function randomAmuletOffer(owned: AmuletId[], maxCopiesBonus = 0, count = AMULET_OFFER_SIZE, exclude: readonly AmuletId[] = []): Amulet[] {
  const pool = AMULETS.filter(
    (amulet) => copiesOf(owned, amulet.id) < maxCopiesOf(amulet, maxCopiesBonus) && !exclude.includes(amulet.id),
  );
  const offer: Amulet[] = [];
  while (offer.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    offer.push(pool.splice(index, 1)[0]);
  }
  return offer;
}

/**
 * Улучшение №29 (шаг 28б): в первом магазине витрина амулетов обязана содержать редкий амулет.
 * Уже есть редкий — витрина как есть; нет — последнее место занимает случайный редкий, которого нет в других местах
 * и копий которого меньше потолка. Редких не осталось — витрина как есть (правило не выдумывает амулет).
 */
export function withRareAmulet(offer: Amulet[], owned: AmuletId[], maxCopiesBonus = 0, random = Math.random): Amulet[] {
  if (offer.some((amulet) => amulet.rarity === 'rare')) return offer;
  const taken = new Set(offer.map((amulet) => amulet.id));
  const pool = AMULETS.filter(
    (amulet) => amulet.rarity === 'rare' && !taken.has(amulet.id) && copiesOf(owned, amulet.id) < maxCopiesOf(amulet, maxCopiesBonus),
  );
  if (pool.length === 0) return offer;
  const rare = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  if (offer.length < AMULET_OFFER_SIZE) return [...offer, rare];
  const next = [...offer];
  next[next.length - 1] = rare; // последнее место показывают как «редкий в витрине»
  return next;
}

// ---------- Что меняют амулеты ----------

/** Вес символа с амулетами: огранка — 💎 чаще, череп в кармане — черепов больше (в степени копий). */
export function amuletWeight(symbol: SlotSymbol, weight: number, owned: AmuletId[]): number {
  if (symbol.id === 'diamond' && owns(owned, 'cut')) return weight * CUT_FACTOR ** copiesOf(owned, 'cut');
  if (isSkull(symbol) && owns(owned, 'skullPocket')) return weight * SKULL_POCKET_SKULLS ** copiesOf(owned, 'skullPocket');
  return weight;
}

/** Во сколько раз паттерн этого символа платит больше: косточка удваивает вишни (за каждую копию). */
function symbolPayoutFactor(symbol: SlotSymbol, owned: AmuletId[]): number {
  if (symbol.id === 'cherry' && owns(owned, 'cherryPit')) return CHERRY_PIT_FACTOR ** copiesOf(owned, 'cherryPit');
  return 1;
}

/**
 * Выигрыш паттернов с амулетами (ещё без множителя серии): косточка — паттерны из 🍒 ×2 за копию, две копии — ×4.
 * payMul — множитель выплаты символа из сделки Дилера (№14: вишни платят ×2); без него — обычная цена.
 */
export function amuletPatternWin(hits: PatternHit[], owned: AmuletId[], payMul?: (symbol: SlotSymbol) => number): number {
  let win = 0;
  for (const hit of hits) {
    const mul = payMul ? Math.max(0, payMul(hit.symbol)) : 1;
    win += hit.symbol.price * hit.pattern.multiplier * symbolPayoutFactor(hit.symbol, owned) * mul;
  }
  return win;
}

/**
 * Сколько платит выпадение символа в паттерне ×1 с усилениями этого забега: цена × косточка × множитель выигрыша
 * (амулеты и кости — то же, что в addToPot). Для вкладки «Символы» на планшете (хоч. 9.1): там видно не базовую
 * цену, а фактическую. Частоту выпадения (бусты предметов) не считает: это шанс, а не выплата.
 */
export function symbolPayout(symbol: SlotSymbol, owned: AmuletId[], bones: number): number {
  return Math.round(symbol.price * symbolPayoutFactor(symbol, owned) * winFactor(owned, bones));
}

/** Во сколько раз больше все выигрыши: череп в кармане, жадность (в степени копий), коллекционер костей (bones — сколько паттернов из черепов он собрал). */
export function winFactor(owned: AmuletId[], bones: number): number {
  let factor = 1;
  if (owns(owned, 'skullPocket')) factor *= SKULL_POCKET_WIN ** copiesOf(owned, 'skullPocket');
  if (owns(owned, 'greed')) factor *= GREED_WIN ** copiesOf(owned, 'greed');
  if (owns(owned, 'bones')) factor *= 1 + BONES_BONUS * bones;
  return factor;
}

/** На сколько растёт множитель серии с каждой прокруткой: обычно на MULTIPLIER_STEP (ручка в GAME_CONFIG), с разгоном — на BOOST_BONUS больше за копию. */
export function multiplierStep(owned: AmuletId[]): number {
  return MULTIPLIER_STEP + BOOST_BONUS * copiesOf(owned, 'boost');
}

/** Сколько прокруток в раунде: жадность забирает по GREED_LOST_SPINS за копию. */
export function spinsPerRound(base: number, owned: AmuletId[]): number {
  return Math.max(1, base - GREED_LOST_SPINS * copiesOf(owned, 'greed'));
}

/** Сколько прокруток добавить за эту прокрутку: колокольчик — по BELL_SPINS за каждый паттерн из 🔔 и за копию. */
export function bellSpins(hits: PatternHit[], owned: AmuletId[]): number {
  if (!owns(owned, 'bell')) return 0;
  return hits.filter((hit) => hit.symbol.id === 'bell').length * BELL_SPINS * copiesOf(owned, 'bell');
}

/**
 * Поправка доли черепов от колокольчика: каждое срабатывание в раунде (сколько паттернов из 🔔 в hits — как bellSpins)
 * прибавляет BELL_SKULL_STEP за копию, но не выше BELL_SKULL_MAX. current — сколько уже набежало в этом раунде.
 * Срабатываний нет — current как есть (поправка живёт до конца раунда); без колокольчика — 0.
 * current — мусор (NaN, бесконечность, минус) — считаем с нуля, чтобы вес черепа не стал NaN.
 * step — ручка замера (симулятор): по умолчанию константа игры. 0 — правило выключено (эталон «до»), поэтому ноль
 * остаётся нулём; мусор (NaN, бесконечность, минус) — считаем константой игры, чтобы вес черепа не стал NaN.
 */
export function bellSkullDelta(hits: PatternHit[], owned: AmuletId[], current: number, step = BELL_SKULL_STEP): number {
  const copies = copiesOf(owned, 'bell');
  if (copies <= 0) return 0;
  const safe = Number.isFinite(current) && current > 0 ? Math.min(current, BELL_SKULL_MAX) : 0;
  const fired = hits.filter((hit) => hit.symbol.id === 'bell').length;
  if (fired <= 0) return safe;
  const grow = Number.isFinite(step) && step >= 0 ? step : BELL_SKULL_STEP;
  return Math.min(BELL_SKULL_MAX, safe + grow * fired * copies);
}

/** Какие амулеты сработали на выигрыше — их значки на корпусе подпрыгнут. */
export function amuletsOnWin(hits: PatternHit[], owned: AmuletId[]): AmuletId[] {
  const hasSymbol = (id: string): boolean => hits.some((hit) => hit.symbol.id === id);
  const fired: AmuletId[] = ['skullPocket', 'greed', 'bones']; // множат любой выигрыш
  if (hasSymbol('cherry')) fired.push('cherryPit');
  if (hasSymbol('diamond')) fired.push('cut');
  if (hasSymbol('bell')) fired.push('bell');
  return fired.filter((id) => owns(owned, id));
}

/**
 * Сколько кладёт копилка за прокрутку без выигрыша (с множителем этой прокрутки; PIGGY_COINS в степени копий).
 * bonus — улучшение №14 (шаг 28): +1 фишка за прокрутку. Без копилки выплаты нет вовсе, бонус один её не включает.
 */
export function piggyCoins(multiplier: number, owned: AmuletId[], bonus = 0): number {
  return owns(owned, 'piggy') ? PIGGY_COINS ** copiesOf(owned, 'piggy') * multiplier + bonus : 0;
}

/**
 * Сколько вернёт страховка: доля сгоревшего кона, пока сработок в раунде меньше, чем копий (used — сколько уже было).
 * share — доля возврата: INSURANCE_SHARE, а со сделкой №5 «страховка возвращает 100%» — 1.
 */
export function insuranceRefund(lost: number, owned: AmuletId[], used = 0, share = INSURANCE_SHARE): number {
  return used < copiesOf(owned, 'insurance') ? Math.floor(lost * share) : 0;
}

/** Сколько паттернов из черепов в начале раунда не сжигают кон (бронежилет; VEST_SHIELDS за копию). */
export function vestShields(owned: AmuletId[]): number {
  return VEST_SHIELDS * copiesOf(owned, 'vest');
}

/**
 * Проценты: сколько фишек добавить к остатку на табло после расплаты (INTEREST_SHARE за копию).
 * bonus — улучшение №13 (шаг 28): +5 % к доле, только пока «Проценты» есть — без амулета выплаты нет.
 */
export function interestCoins(balance: number, owned: AmuletId[], bonus = 0): number {
  const copies = copiesOf(owned, 'interest');
  if (copies <= 0) return 0;
  return Math.floor(balance * (INTEREST_SHARE * copies + bonus));
}

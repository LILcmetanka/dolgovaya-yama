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

/** Числа амулетов. Подобраны симуляцией. */
export const CHERRY_PIT_FACTOR = 2; // косточка: паттерны из 🍒 платят во столько раз больше за каждую копию
export const BELL_SPINS = 2; // колокольчик: столько прокруток за каждый паттерн из 🔔 за каждую копию
export const PIGGY_COINS = 2; // копилка: прокрутка без выигрыша кладёт на кон столько × множитель (в степени копий)
export const INSURANCE_SHARE = 1; // страховка: такая доля сгоревшего кона всё равно уходит на табло
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
    description: { ru: 'Каждая копия: паттерн из 🔔 даёт +2 прокрутки', en: 'Each copy: a 🔔 pattern gives +2 spins' },
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
    description: { ru: 'Сгоревший кон уходит на табло', en: 'A burned pot still goes to your chips' },
    rarity: 'legendary',
    maxCopies: 1,
    price: 4,
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
export const AMULET_OFFER_SIZE = 2; // столько амулетов в витрине за раз
export const TICKETS_PER_DEBT = 1; // столько билетов за каждый отданный долг (с двумя гнёзда и амулеты заполнялись к 3–4-му долгу)
export const EARLY_PAY_MIN_SPINS = 3; // долг отдан раньше, а прокруток осталось столько или больше — ещё EARLY_PAY_TICKETS
export const EARLY_PAY_TICKETS = 1;
export const TICKET_PRICE_SHARE = 1; // билет в витрине стоит такую долю долга следующего раунда — целый долг (один за посещение)
const TICKET_PRICE_ROUND_TO = 5; // цена билета круглая: до 5 фишек

/** Сколько копий амулета id у игрока (стакинг: одинаковые амулеты усиливают друг друга). */
export function copiesOf(owned: AmuletId[], id: AmuletId): number {
  return owned.filter((ownedId) => ownedId === id).length;
}

/** Есть ли у игрока амулет. */
export function owns(owned: AmuletId[], id: AmuletId): boolean {
  return copiesOf(owned, id) > 0;
}

/** Цена амулета в билетах: переопределённая или по редкости. */
export function amuletPrice(amulet: Amulet): number {
  return amulet.price ?? AMULET_PRICES[amulet.rarity];
}

/** Сколько билетов за долг, отданный раньше конца раунда: оставшиеся прокрутки пропадают, а за EARLY_PAY_MIN_SPINS и больше — билет. */
export function earlyPayTickets(spinsLeft: number): number {
  return spinsLeft >= EARLY_PAY_MIN_SPINS ? EARLY_PAY_TICKETS : 0;
}

/** Цена билета в фишках, когда долг следующего раунда — debt. */
export function ticketPrice(debt: number): number {
  return Math.max(TICKET_PRICE_ROUND_TO, Math.round((TICKET_PRICE_SHARE * debt) / TICKET_PRICE_ROUND_TO) * TICKET_PRICE_ROUND_TO);
}

/** Цена следующего гнезда (сейчас гнёзд sockets). Гнёзд уже MAX_SOCKETS — null. */
export function socketPrice(sockets: number): number | null {
  if (sockets >= MAX_SOCKETS) return null;
  return SOCKET_PRICES[sockets - START_SOCKETS];
}

/** Что в витрине амулетов: AMULET_OFFER_SIZE разных случайных амулетов, которых ещё можно докупить (копий меньше потолка). */
export function randomAmuletOffer(owned: AmuletId[]): Amulet[] {
  const pool = AMULETS.filter((amulet) => copiesOf(owned, amulet.id) < amulet.maxCopies);
  const offer: Amulet[] = [];
  while (offer.length < AMULET_OFFER_SIZE && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    offer.push(pool.splice(index, 1)[0]);
  }
  return offer;
}

// ---------- Что меняют амулеты ----------

/** Вес символа с амулетами: огранка — 💎 чаще, череп в кармане — черепов больше (в степени копий). */
export function amuletWeight(symbol: SlotSymbol, weight: number, owned: AmuletId[]): number {
  if (symbol.id === 'diamond' && owns(owned, 'cut')) return weight * CUT_FACTOR ** copiesOf(owned, 'cut');
  if (isSkull(symbol) && owns(owned, 'skullPocket')) return weight * SKULL_POCKET_SKULLS ** copiesOf(owned, 'skullPocket');
  return weight;
}

/** Выигрыш паттернов с амулетами (ещё без множителя серии): косточка — паттерны из 🍒 ×2 за копию, две копии — ×4. */
export function amuletPatternWin(hits: PatternHit[], owned: AmuletId[]): number {
  let win = 0;
  for (const hit of hits) {
    const cherryFactor = hit.symbol.id === 'cherry' && owns(owned, 'cherryPit') ? CHERRY_PIT_FACTOR ** copiesOf(owned, 'cherryPit') : 1;
    win += hit.symbol.price * hit.pattern.multiplier * cherryFactor;
  }
  return win;
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

/** Какие амулеты сработали на выигрыше — их значки на корпусе подпрыгнут. */
export function amuletsOnWin(hits: PatternHit[], owned: AmuletId[]): AmuletId[] {
  const hasSymbol = (id: string): boolean => hits.some((hit) => hit.symbol.id === id);
  const fired: AmuletId[] = ['skullPocket', 'greed', 'bones']; // множат любой выигрыш
  if (hasSymbol('cherry')) fired.push('cherryPit');
  if (hasSymbol('diamond')) fired.push('cut');
  if (hasSymbol('bell')) fired.push('bell');
  return fired.filter((id) => owns(owned, id));
}

/** Сколько кладёт копилка за прокрутку без выигрыша (с множителем этой прокрутки; PIGGY_COINS в степени копий). */
export function piggyCoins(multiplier: number, owned: AmuletId[]): number {
  return owns(owned, 'piggy') ? PIGGY_COINS ** copiesOf(owned, 'piggy') * multiplier : 0;
}

/** Сколько сгоревшего кона страховка всё равно отдаёт на табло. */
export function insuranceRefund(lost: number, owned: AmuletId[]): number {
  return owns(owned, 'insurance') ? Math.floor(lost * INSURANCE_SHARE) : 0;
}

/** Сколько паттернов из черепов в начале раунда не сжигают кон (бронежилет; VEST_SHIELDS за копию). */
export function vestShields(owned: AmuletId[]): number {
  return VEST_SHIELDS * copiesOf(owned, 'vest');
}

/** Проценты: сколько фишек добавить к остатку на табло после расплаты (INTEREST_SHARE за копию). */
export function interestCoins(balance: number, owned: AmuletId[]): number {
  return Math.floor(balance * INTEREST_SHARE * copiesOf(owned, 'interest'));
}

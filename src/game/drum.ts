import { ITEMS, roundPrice, type Item, type ItemId } from './items';

/**
 * «Барабан» в магазине — колесо с секторами на стене: крутишь за фишки — выпадает то, на чём встало колесо:
 * предмет (на полку), билет или фишки. Амулетов в нём нет — они только в витрине.
 * Первая прокрутка в магазине дешёвая, каждая следующая — вдвое дороже; в новом магазине — снова дешёвая.
 * Цена — доля долга следующего раунда, поэтому растёт вместе с долгом. Без Phaser — чтобы проверить симуляцией.
 */

/** Что выпадает: предмет — на полку, билет — на табло, фишки — на табло. */
export type DrumPrize = ItemId | 'ticket' | 'chips';

/**
 * Сектора колеса по кругу, по часовой стрелке от верха. Сектора равные — выпадают с равным шансом (фишки — два сектора).
 * Числа подобраны симуляцией (шаг 30): одна-две прокрутки за магазин выгодны, крутить без меры — нет. Шаг 41: «фишки» — цена прокрутки ×2.
 * Фишки — последним: их два сектора не должны стоять рядом, а цвета соседних (красный, чёрный, у фишек зелёный) — совпасть.
 */
export const DRUM_SECTORS: DrumPrize[] = ['cigarette', 'chips', 'shield', 'ticket', 'garlic', 'triple', 'chips'];
const DRUM_ITEMS: Item[] = ITEMS; // предметы, которые бывают на колесе
export const DRUM_PRICE_SHARE = 0.25; // первая прокрутка в магазине стоит такую долю долга следующего раунда
export const DRUM_PRICE_GROWTH = 2; // каждая следующая прокрутка — во столько раз дороже
export const DRUM_CHIPS_MULTIPLIER = 2; // сектор «фишки» даёт цену этой прокрутки во столько раз больше — всегда больше, чем заплатил

/** Цена прокрутки: spins — сколько раз уже крутили в этом магазине, debt — долг следующего раунда, mul — скидка сделки. */
export function drumPrice(spins: number, debt: number, mul = 1): number {
  return roundPrice(DRUM_PRICE_SHARE * DRUM_PRICE_GROWTH ** spins * debt, mul);
}

/** Сколько фишек даёт сектор «фишки»: paid — сколько заплатили за эту прокрутку. Цена кратна 5, значит, и выплата. */
export function drumChips(paid: number): number {
  return paid * DRUM_CHIPS_MULTIPLIER;
}

/** Предмет сектора; у билета и фишек — null. */
export function prizeItem(prize: DrumPrize): Item | null {
  return DRUM_ITEMS.find((item) => item.id === prize) ?? null;
}

/** Может ли выпасть приз: предмету нужно свободное место на полке, билет и фишки есть всегда. */
export function canWin(prize: DrumPrize, hasFreeSlot: boolean): boolean {
  if (prize === 'ticket' || prize === 'chips') return true;
  return hasFreeSlot;
}

/** Случайный сектор из тех, что могут выпасть (available — по сектору), с равным шансом. Билет и фишки есть всегда. */
export function randomSector(available: boolean[]): number {
  const open = available.flatMap((isOpen, sector) => (isOpen ? [sector] : []));
  return open[Math.floor(Math.random() * open.length)];
}

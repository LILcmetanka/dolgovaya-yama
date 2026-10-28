import { ITEMS, roundPrice, type Item, type ItemId } from './items';

/**
 * «Барабан» в магазине — колесо с секторами на стене: крутишь за фишки — выпадает то, на чём встало колесо:
 * предмет (на полку), билет, место на полке или фишки. Амулетов в нём нет — они только в витрине.
 * Первая прокрутка в магазине дешёвая, каждая следующая — вдвое дороже; в новом магазине — снова дешёвая.
 * Цена — доля долга следующего раунда, поэтому растёт вместе с долгом. Без Phaser — чтобы проверить симуляцией.
 */

/** Что выпадает: предмет — на полку, билет — на табло, место — ещё одна клетка полки, фишки — на табло. */
export type DrumPrize = ItemId | 'ticket' | 'slot' | 'chips';

/**
 * Сектора колеса по кругу, по часовой стрелке от верха. Сектора равные — выпадают с равным шансом (фишки — два сектора).
 * Числа подобраны симуляцией (шаг 30): одна-две прокрутки за магазин выгодны, крутить без меры — нет.
 */
export const DRUM_SECTORS: DrumPrize[] = ['cigarette', 'chips', 'shield', 'ticket', 'garlic', 'chips', 'triple', 'slot'];
export const DRUM_PRICE_SHARE = 0.25; // первая прокрутка в магазине стоит такую долю долга следующего раунда
export const DRUM_PRICE_GROWTH = 2; // каждая следующая прокрутка — во столько раз дороже
export const DRUM_CHIPS_SHARE = 0.25; // сектор «фишки» даёт такую долю долга: на первой прокрутке — цену назад

/** Цена прокрутки: spins — сколько раз уже крутили в этом магазине, debt — долг следующего раунда. */
export function drumPrice(spins: number, debt: number): number {
  return roundPrice(DRUM_PRICE_SHARE * DRUM_PRICE_GROWTH ** spins * debt);
}

/** Сколько фишек даёт сектор «фишки». */
export function drumChips(debt: number): number {
  return roundPrice(DRUM_CHIPS_SHARE * debt);
}

/** Предмет сектора; у билета, места и фишек — null. */
export function prizeItem(prize: DrumPrize): Item | null {
  return ITEMS.find((item) => item.id === prize) ?? null;
}

/** Может ли выпасть приз: предмету нужно свободное место на полке, месту — чтобы полки ещё не были полными. */
export function canWin(prize: DrumPrize, hasFreeSlot: boolean, canAddSlot: boolean): boolean {
  if (prize === 'slot') return canAddSlot;
  if (prize === 'ticket' || prize === 'chips') return true;
  return hasFreeSlot;
}

/** Случайный сектор из тех, что могут выпасть (available — по сектору), с равным шансом. Билет и фишки есть всегда. */
export function randomSector(available: boolean[]): number {
  const open = available.flatMap((isOpen, sector) => (isOpen ? [sector] : []));
  return open[Math.floor(Math.random() * open.length)];
}

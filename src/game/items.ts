import type { Words } from './lang';
import { isSkull, type SlotSymbol } from './rules';

/**
 * Предметы торгового автомата: одноразовые, лежат на полке, включаешь сам — кликом или клавишей.
 * Здесь данные, цены, места на полке и что сейчас включено. Без Phaser — чтобы проверить симуляцией.
 * Что делает каждый предмет в игре — в RoundScene.activateItem().
 */

// Патрон и лупа — не из торгового автомата: патрон — за билеты (shot.ts), лупа — из барабана (collectorGame.ts).
export type ItemId = 'cigarette' | 'shield' | 'garlic' | 'triple' | 'bullet' | 'magnifier';

/** Предмет на полке. */
export interface Item {
  id: ItemId;
  sign: string; // что нарисовано на предмете
  name: Words; // название — в подсказке при наведении, на двух языках
  description: Words; // что делает — в подсказке
  color: number; // цвет ободка — предметы различаются, даже если эмодзи не отрисуется
}

/** Предмет торгового автомата: у него есть цена в фишках. */
export interface ShopItem extends Item {
  priceShare: number; // цена — такая доля долга следующего раунда
}

/**
 * Все предметы торгового автомата. Цена — доля долга следующего раунда, поэтому растёт вместе с ним:
 * рано предметы дешёвые, и их выгодно копить на полке до трудного раунда. Подобраны симуляцией:
 * вдвое дороже, чем было до шага 26, — в магазине за раз 1–2 покупки, а не всё сразу. ×3 подорожал меньше, чем вдвое:
 * он теперь утраивает кон, а не удваивает, и должен стоить своих денег.
 */
export const ITEMS: ShopItem[] = [
  {
    id: 'cigarette', sign: '🚬',
    name: { ru: 'Сигарета', en: 'Cigarette' },
    description: { ru: 'Сразу +3 прокрутки', en: '+3 spins right away' },
    color: 0xa8a29e, priceShare: 0.4,
  },
  {
    id: 'shield', sign: '🛡',
    name: { ru: 'Щит', en: 'Shield' },
    description: { ru: 'Следующие черепа не сожгут кон', en: "Next skulls won't burn the pot" },
    color: 0x38bdf8, priceShare: 0.3,
  },
  {
    id: 'garlic', sign: '🧄',
    name: { ru: 'Чеснок', en: 'Garlic' },
    description: { ru: 'До конца раунда черепов вдвое меньше', en: 'Half the skulls until the round ends' },
    color: 0xd9f99d, priceShare: 1,
  },
  {
    id: 'triple', sign: '×3',
    name: { ru: 'Тройное «забрать»', en: 'Triple take' },
    description: { ru: 'Следующее «забрать» — втройне', en: 'Next take pays triple' },
    color: 0xfde047, priceShare: 0.7,
  },
];

/** Что делают предметы. */
export const CIGARETTE_SPINS = 3; // сигарета: столько прокруток прибавляется сразу
export const GARLIC_SKULL_FACTOR = 0.5; // пока действует чеснок, вес черепа во столько раз меньше
export const TRIPLE_TAKE_FACTOR = 3; // тройное «забрать»: кон уходит на табло, умноженный на столько

/** Магазин и полка. Полок две, по 4 места: вторая (места 5–8) — когда заполнена первая. */
export const OFFER_SIZE = 3; // столько разных предметов в торговом автомате за раз
export const START_SLOTS = 2; // мест на полке в начале забега
export const MAX_SLOTS = 8; // больше мест на полках не бывает
export const SLOT_PRICE_SHARES = [1, 2, 3, 4, 5, 6]; // цена 3-го…8-го места — доля долга следующего раунда: место N стоит N − 2 долга
const PRICE_ROUND_TO = 5; // цены круглые: до 5 фишек

/** Что сейчас включено. Щит и ×3 ждут своего момента и переходят в следующий раунд, чеснок — только до конца раунда. */
export interface ItemEffects {
  shields: number; // сколько паттернов из черепов ещё отобьёт щит
  isGarlicOn: boolean; // чеснок: до конца раунда черепов вдвое меньше
  tripleTakes: number; // сколько «забрать» ещё утроится
}

/** Ничего не включено — так начинается забег. */
export function noEffects(): ItemEffects {
  return { shields: 0, isGarlicOn: false, tripleTakes: 0 };
}

/** Цена: доля долга, округлённая до PRICE_ROUND_TO, но не меньше PRICE_ROUND_TO. Ею же круглится цена барабана (drum.ts). */
export function roundPrice(exact: number): number {
  return Math.max(PRICE_ROUND_TO, Math.round(exact / PRICE_ROUND_TO) * PRICE_ROUND_TO);
}

/** Цена предмета, когда долг следующего раунда — debt. */
export function itemPrice(item: ShopItem, debt: number): number {
  return roundPrice(item.priceShare * debt);
}

/** Цена следующего места на полке (сейчас мест slots). Мест уже MAX_SLOTS — null: больше не продаётся. */
export function slotPrice(slots: number, debt: number): number | null {
  if (slots >= MAX_SLOTS) return null;
  return roundPrice(SLOT_PRICE_SHARES[slots - START_SLOTS] * debt);
}

/** Что лежит в торговом автомате: OFFER_SIZE разных предметов в случайном порядке. */
export function randomOffer(): ShopItem[] {
  const pool = [...ITEMS];
  const offer: ShopItem[] = [];
  while (offer.length < OFFER_SIZE && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    offer.push(pool.splice(index, 1)[0]);
  }
  return offer;
}

/** Вес символа с чесноком: пока он действует, черепов вдвое меньше. */
export function garlicWeight(symbol: SlotSymbol, weight: number, effects: ItemEffects): number {
  return effects.isGarlicOn && isSkull(symbol) ? weight * GARLIC_SKULL_FACTOR : weight;
}

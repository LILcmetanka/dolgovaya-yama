import type { Words } from './lang';
import type { SlotSymbol } from './rules';

/**
 * Предметы торгового автомата: одноразовые, лежат на полке, включаешь сам — кликом или клавишей.
 * Здесь данные, цены, места на полке и что сейчас включено. Без Phaser — чтобы проверить симуляцией.
 * Что делает каждый предмет в игре — в RoundScene.activateItem().
 */

export type ItemId =
  | 'cigarette' | 'shield' | 'garlic' | 'triple'
  | 'cherries' | 'bells' | 'diamonds' | 'luck' | 'risk' | 'hammer' | 'candle' | 'luckSpin'
  | 'shuffle' | 'swap';

/** Предметы, которые после прокрутки переделывают сетку (шаг 63б): окно выбора — RoundScene.openReroll. */
export type RerollId = 'shuffle' | 'swap';

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
  unlockRound?: number; // в витрине только с этого раунда — раньше замка нет (молот)
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
  // Шаг 63а: бусты символов (вишни, колокола, алмазы, удача) действуют до конца раунда, как чеснок;
  // риск, молот, свеча и фарт — до своего момента. Числа — из design/02-предметы.md.
  {
    id: 'cherries', sign: '🍒',
    name: { ru: 'Вишни', en: 'Cherries' },
    description: { ru: 'До конца раунда вишен вдвое больше', en: 'Twice as many cherries until the round ends' },
    color: 0xef4444, priceShare: 0.4,
  },
  {
    id: 'bells', sign: '🔔',
    name: { ru: 'Колокола', en: 'Bells' },
    description: { ru: 'До конца раунда колоколов вдвое больше', en: 'Twice as many bells until the round ends' },
    color: 0xf97316, priceShare: 0.4,
  },
  {
    id: 'diamonds', sign: '💎',
    name: { ru: 'Алмазы', en: 'Diamonds' },
    description: { ru: 'До конца раунда алмазов вдвое больше', en: 'Twice as many diamonds until the round ends' },
    color: 0x22d3ee, priceShare: 0.5,
  },
  {
    id: 'luck', sign: '🍀',
    name: { ru: 'Удача', en: 'Luck' },
    description: { ru: 'До конца раунда клеверов и корон вдвое больше', en: 'Twice as many clovers and crowns until the round ends' },
    // С 9-го раунда: корона входит только с 9-го, а без неё предмет дал бы половину (клевер один есть с 7-го).
    color: 0x16a34a, priceShare: 0.5, unlockRound: 9,
  },
  {
    id: 'risk', sign: '💀',
    name: { ru: 'Риск', en: 'Risk' },
    description: { ru: 'Следующая прокрутка: черепов втрое больше, но выигрыш ×10', en: 'Next spin: three times the skulls, but wins ×10' },
    color: 0xb91c1c, priceShare: 0.3,
  },
  {
    id: 'hammer', sign: '🔨',
    name: { ru: 'Молот', en: 'Hammer' },
    description: { ru: 'Следующая прокрутка: замки не блокируют столбцы', en: "Next spin: locks don't block their columns" },
    color: 0x78716c, priceShare: 0.5, unlockRound: 8, // с 8-го раунда: раньше в автомате нет замков
  },
  {
    id: 'candle', sign: '🕯',
    name: { ru: 'Свеча', en: 'Candle' },
    description: { ru: 'Следующее «забрать» не режет серию', en: 'The next take keeps the multiplier' },
    color: 0xfbbf24, priceShare: 0.4,
  },
  {
    id: 'luckSpin', sign: '✨', // не 🍀: иначе в столбике у экрана фарт не отличить от удачи
    name: { ru: 'Фарт', en: 'Lucky spin' },
    description: { ru: 'Следующая прокрутка — без черепов', en: 'Next spin has no skulls' },
    color: 0x4ade80, priceShare: 0.3,
  },
  // Шаг 63б: окно выбора после остановки сетки, до итога (design/02). Заряжены — значит сработают на следующей платной прокрутке.
  {
    id: 'shuffle', sign: '🔀',
    name: { ru: 'Перемешка', en: 'Shuffle' },
    description: { ru: 'Следующая прокрутка: перекрутить один столбец', en: 'Next spin: reroll one column' },
    color: 0x60a5fa, priceShare: 0.4,
  },
  {
    id: 'swap', sign: '🃏',
    name: { ru: 'Подмена', en: 'Swap' },
    description: { ru: 'Заменить клетку на джокера; висит, пока не применишь', en: 'Turn a cell into a joker; stays charged until used' },
    color: 0xe879f9, priceShare: 0.5,
  },
];

/** Что делают предметы. */
export const CIGARETTE_SPINS = 3; // сигарета: столько прокруток прибавляется сразу
export const GARLIC_SKULL_FACTOR = 0.5; // пока действует чеснок, вес черепа во столько раз меньше
export const TRIPLE_TAKE_FACTOR = 3; // тройное «забрать»: кон уходит на табло, умноженный на столько
export const SYMBOL_BOOST_FACTOR = 2; // буст предмета (вишни, колокола…): вес символа во столько раз больше
export const RISK_SKULL_FACTOR = 3; // риск: черепов на следующей прокрутке во столько раз больше
export const RISK_WIN_FACTOR = 10; // риск: выигрышные паттерны на этой прокрутке платят во столько раз больше

/** Магазин и полка. Полок две, по 4 места: вторая (места 5–8) — когда заполнена первая. */
export const OFFER_SIZE = 3; // столько разных предметов в торговом автомате за раз
export const START_SLOTS = 2; // мест на полке в начале забега
export const MAX_SLOTS = 8; // больше мест на полках не бывает
export const SLOT_PRICE_SHARES = [1, 2, 3, 4, 5, 6]; // цена 3-го…8-го места — доля долга следующего раунда: место N стоит N − 2 долга
const PRICE_ROUND_TO = 5; // цены круглые: до 5 фишек

/**
 * Что сейчас включено. Щит и ×3 ждут своего момента и переходят в следующий раунд; бусты символов и флаги
 * действуют до конца раунда или до прокрутки, после которой гаснут (см. RoundScene.finishSpin).
 */
export interface ItemEffects {
  shields: number; // сколько паттернов из черепов ещё отобьёт щит
  tripleTakes: number; // сколько «забрать» ещё утроится
  candle: boolean; // следующее «забрать» не режет серию
  symbolBoost: Partial<Record<string, number>>; // множители веса символов до конца раунда (чеснок — skull ×0,5)
  risk: boolean; // следующая прокрутка: черепа ×3, выигрыш ×10
  hammer: boolean; // следующая прокрутка: замки не блокируют столбцы
  luckSpin: boolean; // следующая прокрутка: без черепов
  shuffle: boolean; // следующая платная прокрутка: можно перекрутить один столбец
  swap: boolean; // следующая платная прокрутка: можно заменить одну клетку на джокера
}

/** Ничего не включено — так начинается забег. */
export function noEffects(): ItemEffects {
  return {
    shields: 0, tripleTakes: 0, candle: false, symbolBoost: {}, risk: false, hammer: false, luckSpin: false,
    shuffle: false, swap: false,
  };
}

/**
 * Копия включённых предметов: запись кассеты не должна делить объект с игрой — иначе откат вернул бы
 * не то, что записали. symbolBoost копируется отдельно: это тоже объект.
 */
export function copyEffects(effects: ItemEffects): ItemEffects {
  return { ...effects, symbolBoost: { ...effects.symbolBoost } };
}

/** Погасить всё, что живёт не дольше раунда: бусты символов (чеснок, вишни…) и флаги прокрутки. */
export function clearRoundEffects(effects: ItemEffects): void {
  effects.symbolBoost = {};
  effects.risk = false;
  effects.hammer = false;
  effects.luckSpin = false;
  effects.shuffle = false;
  effects.swap = false;
  effects.candle = false;
}

/**
 * Цена: доля долга, округлённая до PRICE_ROUND_TO, но не меньше PRICE_ROUND_TO. Ею же круглится цена барабана (drum.ts).
 * mul — скидка сделки Дилера (№2): доля долга умножается на неё до округления.
 */
export function roundPrice(exact: number, mul = 1): number {
  return Math.max(PRICE_ROUND_TO, Math.round((exact * mul) / PRICE_ROUND_TO) * PRICE_ROUND_TO);
}

/** Цена предмета, когда долг следующего раунда — debt, а скидка сделки — mul. */
export function itemPrice(item: ShopItem, debt: number, mul = 1): number {
  return roundPrice(item.priceShare * debt, mul);
}

/** Цена следующего места на полке (сейчас мест slots). Мест уже MAX_SLOTS — null: больше не продаётся. */
export function slotPrice(slots: number, debt: number, mul = 1): number | null {
  if (slots >= MAX_SLOTS) return null;
  return roundPrice(SLOT_PRICE_SHARES[slots - START_SLOTS] * debt, mul);
}

/** Что лежит в торговом автомате: OFFER_SIZE разных предметов в случайном порядке. Предметы с unlockRound раньше раунда не продаются. */
export function randomOffer(round: number, isAllowed: (item: ShopItem) => boolean = () => true): ShopItem[] {
  const pool = ITEMS.filter((item) => (item.unlockRound ?? 1) <= round && isAllowed(item));
  const offer: ShopItem[] = [];
  while (offer.length < OFFER_SIZE && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    offer.push(pool.splice(index, 1)[0]);
  }
  return offer;
}

/**
 * Новый предмет на место купленного: из пула этого раунда, которого нет ни в остальных рядах витрины, ни среди
 * только что купленного (его сцена тоже передаёт сюда). Пул кончился — null: ряд остаётся пустым, как раньше.
 */
export function offerReplacement(
  offer: readonly (ShopItem | null)[],
  round: number,
  isAllowed: (item: ShopItem) => boolean = () => true,
): ShopItem | null {
  const taken = new Set(offer.filter((item): item is ShopItem => item !== null).map((item) => item.id));
  const pool = ITEMS.filter((item) => (item.unlockRound ?? 1) <= round && !taken.has(item.id) && isAllowed(item));
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/** Вес символа с включёнными бустами: чеснок, вишни, колокола, удача. */
export function boostWeight(symbol: SlotSymbol, weight: number, effects: ItemEffects): number {
  return weight * (effects.symbolBoost[symbol.id] ?? 1);
}

/** Действует ли чеснок: вес черепа уменьшен. По нему BaseScene красит огни вокруг экрана в покое. */
export function garlicOn(effects: ItemEffects): boolean {
  return (effects.symbolBoost.skull ?? 1) < 1;
}

/**
 * Включён ли предмет уже и второй ничего не добавит: бусты символов и флаги работают как «да/нет».
 * Щит, ×3 и сигарета копятся — их второй экземпляр не лишний.
 */
export function isItemOn(id: ItemId, effects: ItemEffects): boolean {
  const boost = (symbol: string): boolean => (effects.symbolBoost[symbol] ?? 1) > 1;
  switch (id) {
    case 'garlic': return garlicOn(effects);
    case 'cherries': return boost('cherry');
    case 'bells': return boost('bell');
    case 'diamonds': return boost('diamond');
    case 'luck': return boost('clover') || boost('crown');
    case 'risk': return effects.risk;
    case 'hammer': return effects.hammer;
    case 'candle': return effects.candle;
    case 'luckSpin': return effects.luckSpin;
    case 'shuffle': return effects.shuffle;
    case 'swap': return effects.swap;
    default: return false; // сигарета, щит, ×3
  }
}

/**
 * Столбик включённых предметов у экрана: столько мест, сколько видно сразу. Пятый предмет включается,
 * только когда игрок кликом освободил место у экрана, — сам собой ничего не вытесняется.
 */
export const EFFECT_SLOTS = 4;

/** Предметы, которые занимают место в столбике. Чеснока и сигареты тут нет: чеснок красит огни, сигарета мгновенная. */
export type SlotEffectId = Exclude<ItemId, 'garlic' | 'cigarette'>;

/** Порядок столбика: в нём включённые предметы стоят сверху вниз. */
export const SLOT_EFFECT_IDS: SlotEffectId[] = [
  'shield', 'triple', 'candle', 'risk', 'hammer', 'luckSpin', 'shuffle', 'swap', 'cherries', 'bells', 'diamonds', 'luck',
];

/** Занимает ли предмет место в столбике у экрана (чеснок и сигарета — не занимают). */
export function takesEffectSlot(id: ItemId): id is SlotEffectId {
  return id !== 'garlic' && id !== 'cigarette';
}

/** Сколько раз ещё сработает включённый предмет (у бустов и флагов — 1, пока действуют). */
export function effectCount(effects: ItemEffects, id: SlotEffectId): number {
  if (id === 'shield') return effects.shields;
  if (id === 'triple') return effects.tripleTakes;
  return isItemOn(id, effects) ? 1 : 0;
}

/** Какие предметы сейчас занимают места у экрана — по порядку столбика. */
export function activeSlotEffects(effects: ItemEffects): SlotEffectId[] {
  return SLOT_EFFECT_IDS.filter((id) => effectCount(effects, id) > 0);
}

/** Убрать предмет совсем: игрок кликом освободил его место у экрана. */
export function clearEffect(id: SlotEffectId, effects: ItemEffects): void {
  switch (id) {
    case 'shield': effects.shields = 0; break;
    case 'triple': effects.tripleTakes = 0; break;
    case 'candle': effects.candle = false; break;
    case 'risk': effects.risk = false; break;
    case 'hammer': effects.hammer = false; break;
    case 'luckSpin': effects.luckSpin = false; break;
    case 'shuffle': effects.shuffle = false; break;
    case 'swap': effects.swap = false; break;
    case 'cherries': delete effects.symbolBoost.cherry; break;
    case 'bells': delete effects.symbolBoost.bell; break;
    case 'diamonds': delete effects.symbolBoost.diamond; break;
    case 'luck': delete effects.symbolBoost.clover; delete effects.symbolBoost.crown; break;
  }
}


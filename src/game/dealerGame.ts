import { INSURANCE_SHARE } from './amulets';
import type { Words } from './lang';
import { LOW_PATTERN_MULTIPLIER, TOP_MULTIPLIER, type Pattern } from './patterns';
import { DEBT_ROUND_TO, isPaying, isUnlocked, streakAfterSkull, SYMBOLS, type SlotSymbol } from './rules';

/**
 * Сделка Дилера (решение автора 15.11.2026, QUESTIONS.md): на экране выпал кубик 🎲 — Дилер кладёт на сукно
 * три карты-сделки. В каждой две строки: что получаешь и чем платишь. Игрок берёт одну сделку или отказывается.
 * Сделки — связки из DONTLIKE.md «20 связок» (ответ автора: 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 20).
 * Шаг 9 — каркас и три связки: №6 «билеты / магазин закрыт», №19 «раунд без черепов», №20 «шаг ×2 / череп в ×1».
 * Шаг 10 — ещё три: №4 «тише черепа / потолок серии», №14 «мягкий череп / −1 прокрутка», №17 «выигрыш +25% / черепа навсегда».
 * Шаг 11 — пять: №2 «−20% цен / долг +8%», №5 «страховка 100% / каждая копия вдвое дороже»,
 * №7 «вес джекпота +50% / вес чёрных паттернов +1», №11 «выбранный символ +2 веса / остальным −0,5», №12 «долг −10% / +20%».
 * Шаг 11, партия Б — последние пять: №8 «смена автомата отложена / черепа +2 п.п. навсегда»,
 * №9 «ещё одно второе дыхание / серия −1 ступень», №10 «первый череп не жжёт кон / кон не идёт в цель»,
 * №13 «бесплатный амулет / −2 места в столбике», №15 «забрать дважды / второе забирание дешевле на 20%».
 * Остальные связки автора добавляются так же: поле в PactEffects и ветка в pactEffects + карта в PACTS.
 * Сделка живёт на кассете как запись { id, untilRound, symbol? } — сколько раундов действует, столько и лежит.
 * Без Phaser — только числа и маленькие функции.
 */

export type PactId =
  | 'tickets-shop' | 'quiet-round' | 'double-step'
  | 'skull-calm' | 'soft-skull' | 'price-up'
  | 'cheap-shop' | 'full-insurance' | 'jackpot-weight' | 'symbol-weight' | 'debt-cut'
  | 'machine-delay' | 'extra-breath' | 'safe-bank' | 'free-amulet' | 'double-take';

/** Карта-сделка: id, сколько раундов живёт и две строки на карте — баф зелёным, дебаф красным. */
export interface PactSpec {
  id: PactId;
  rounds: number; // сколько раундов действует, считая раунд, в котором взяли (PACT_LAST_ROUNDS — до конца забега)
  bonus: Words; // «получаешь» — зелёная строка на карте
  cost: Words; // «платишь» — красная строка на карте
  needsSymbol?: boolean; // №11: прежде чем взять, игрок выбирает символ (ряд кнопок на сукне)
}

/** Запись на кассете: сделка и последний раунд, в котором она ещё действует. */
export interface Pact {
  id: PactId;
  untilRound: number;
  symbol?: SlotSymbol; // №11: выбранный игроком символ (в старых записях поля нет — сделка без символа ничего не делает)
}

/**
 * Поправка сделки №11 к весам: выбранному символу +plus, каждому другому −minus (вес не ниже нуля).
 * Числа берутся из констант рядом и лежат в PactEffects — вес символа сам их не выдумывает.
 */
export interface SymbolLuck {
  id: string; // id выбранного символа
  plus: number;
  minus: number;
}

/**
 * Что из сделок действует в раунде round — единственное место, где это решается: и прокрутка, и плашка доли,
 * и множитель, и сгорание серии, и магазин спрашивают отсюда.
 */
export interface PactEffects {
  noSkulls: boolean; // в автомате этого раунда нет черепов
  skullShareDelta: number; // доля черепов в этом раунде выше (+) или ниже (−) на столько; 0 — без поправки
  shopClosed: boolean; // магазин после этого раунда не открывается
  multiplierStepMul: number; // во сколько раз больше шаг множителя серии (1 — обычный, 2 — «шаг вдвое»)
  skullWipesStreak: boolean; // череп обнуляет серию, а не оставляет от неё треть (streakAfterSkull)
  multiplierCap: number; // множитель серии не выше этого (PACT_CAP; Infinity — без потолка)
  skullSoft: boolean; // череп снимает с серии одну ступень вместо трети
  spinsDelta: number; // столько прокруток прибавится (+) или убавится (−) в начале раунда
  winMul: number; // во сколько раз больше выигрыш паттернов (1 — без поправки)
  shopDiscount: number; // множитель цен магазина (1 — без скидки, CHEAP_SHOP_DISCOUNT — «−20% цен»)
  insuranceShare: number; // доля возврата страховки (INSURANCE_SHARE — обычная, INSURANCE_FULL_SHARE — «весь кон»)
  insuranceDoubles: boolean; // каждая следующая копия страховки вдвое дороже предыдущей
  jackpotWeightMul: number; // во сколько раз тяжелее джекпот в удаче клевера (1 — обычный)
  blackWeightAdd: number; // сколько веса прибавляется «чёрным» паттернам в удаче клевера (0 — ничего)
  symbolLuck: SymbolLuck | null; // №11: выбранный символ и его поправки к весам (null — сделки нет)
  noMachineSwap: boolean; // №8: автомат в начале этого раунда не меняется сам (только первые NO_SWAP_ROUNDS раундов сделки)
  bankSurvivesSkull: boolean; // №10: первый череп в раунде не жжёт кон, а собранное в конце раунда в цель не идёт
  effectSlotsDelta: number; // №13: столько мест в столбике включённых предметов прибавится (+) или убавится (−)
  doubleTake: boolean; // №15: после «забрать» в этой прокрутке можно забрать ещё раз (80% забранного, DOUBLE_TAKE_SHARE)
}

/** Сколько карт Дилер кладёт на сукно. */
export const PACT_OFFER_COUNT = 3;
/**
 * «До конца забега» в раундах: конечное число, а не Infinity. Infinity переживает только память — в JSON она
 * становится null, и сделка на кассете молча теряла бы срок. Шаг 10 ставит столько раундов связкам «навсегда».
 */
export const PACT_LAST_ROUNDS = 999;
/** «+1 билет сразу»: выдаётся один раз, в момент сделки (в PactEffects его нет — это не эффект на раунд). */
export const PACT_TICKETS = 1;
/** №6: столько раундов магазин закрыт после сделки. */
export const TICKETS_SHOP_ROUNDS = 4;
/** №19: столько раундов живёт «тихий раунд» (первый — без черепов, второй — с поправкой доли). */
export const QUIET_ROUND_ROUNDS = 2;
/** №20: столько раундов шаг множителя удвоен. */
export const DOUBLE_STEP_ROUNDS = 3;
/** №4: столько раундов черепа тише и серия упирается в потолок. */
export const SKULL_CALM_ROUNDS = 1;
/** №14: столько раундов череп мягкий и прокруток в раунде меньше. */
export const SOFT_SKULL_ROUNDS = 1;
/** «Шаг множителя серии вдвое»: было ×1, ×2, ×3… стало ×1, ×3, ×5… */
export const PACT_STEP_FACTOR = 2;
/** «В следующем раунде доля черепов выше» на 9 п.п. (подобрано симулятором, шаг 9). */
export const QUIET_SKULL_DELTA = 0.09;
/** Поправка доли не должна довести её до 100 %: дальше сетка была бы из одних черепов. */
export const SKULL_SHARE_MAX = 0.9;
/** И не увести в ноль: вес черепа на нуле — это «нет черепов», а сделка обещала только «тише». */
export const SKULL_SHARE_MIN = 0.01;
// ---------- Связки шага 10 ----------
/** №4 «Тише черепа»: доля черепов ниже на 3 п.п., пока сделка жива. */
export const SKULL_CALM_DELTA = -0.03;
/** №4: множитель серии не поднимается выше ×3 (серия выше двух ступеней ничего не даёт). */
export const PACT_CAP = 3;
/** №14 «Мягкий череп»: −1 прокрутка в каждом раунде, пока сделка жива. */
export const SOFT_SKULL_SPINS = -1;
/** №17 «Цена вверх»: выигрыш паттернов +25 % — число автора из DONTLIKE.md, симулятором не подкручивается. */
export const PRICE_UP_WIN = 1.25;
/** …и доля черепов +0,5 п.п. до конца забега. */
export const PRICE_UP_SKULL_DELTA = 0.005;
// ---------- Связки шага 11 ----------
/**
 * №2 «−20% цен / долг +8%»: скидка живёт столько же раундов, сколько магазин закрывает сделка №6, — четыре.
 * Долг +8% — разово в момент взятия: бессрочная скидка за один разовый штраф была бы чистой прибылью без риска.
 */
export const CHEAP_SHOP_ROUNDS = 4;
/** №2: во столько раз дешевле всё в магазине (предметы, места, амулеты, гнёзда, барабан, кассета). */
export const CHEAP_SHOP_DISCOUNT = 0.8;
/** №2: во столько раз дороже долг раунда, в котором взяли карту (разово). */
export const CHEAP_SHOP_DEBT_MUL = 1.08;
/** №5 «страховка возвращает 100% кона»: доля возврата вместо обычной INSURANCE_SHARE. */
export const INSURANCE_FULL_SHARE = 1;
/** №7 «вес джекпота +50%»: во столько раз тяжелее джекпот в удаче клевера. */
export const JACKPOT_WEIGHT_MUL = 1.5;
/** №7 «вес чёрных паттернов +1»: столько веса прибавляется каждому «чёрному» (LOW_PATTERN_MULTIPLIER). */
export const BLACK_PATTERN_WEIGHT_ADD = 1;
/** №11: +2 веса выбранному символу, −0,5 каждому другому (вес не ниже нуля, черепа не трогаем). */
export const SYMBOL_LUCK_PLUS = 2;
export const SYMBOL_LUCK_MINUS = 0.5;
/** №11: столько раундов живёт выбранный символ. */
export const SYMBOL_LUCK_ROUNDS = 2;
/** №12: текущий долг −10%, следующий +20%. Оба сдвига разовые, поэтому сделка живёт один раунд. */
export const DEBT_CUT_MUL = 0.9;
export const DEBT_NEXT_MUL = 1.2;
export const DEBT_CUT_ROUNDS = 1;
// ---------- Связки шага 11, партия Б ----------
/** №8 «смена автомата отложена на 4 раунда»: столько раундов сделки автомат не меняется сам. */
export const NO_SWAP_ROUNDS = 4;
/** №8 «черепа +2 п.п. навсегда»: доля черепов выше до конца забега (срок сделки — PACT_LAST_ROUNDS). */
export const MACHINE_DELAY_SKULL_DELTA = 0.02;
/** №9 «+1 запас второго дыхания»: сколько запасов даёт карта (разово, но не выше потолка) и сколько ступеней серии снимает. */
export const EXTRA_BREATH_COUNT = 1;
export const EXTRA_BREATH_STREAK_COST = 1;
/** №9: потолок запасов «второго дыхания» — базовый и один от карты; больше двух не даёт ни одна карта. */
export const SECOND_WIND_MAX = 2;
/**
 * №9: числа разовые, а срок — до конца забега: запись сделки остаётся маркером «уже брал» (pactLive не даёт взять
 * второй раз), эффекта в раунде у неё нет (ветка в pactEffects без действия).
 */
export const EXTRA_BREATH_ROUNDS = PACT_LAST_ROUNDS;
/** №10: столько раундов первый череп не жжёт кон (и собранное за раунд не идёт в цель). */
export const SAFE_BANK_ROUNDS = 1;
/** №13 «бесплатный случайный амулет»: столько раундов у столбика предметов на два места меньше. */
export const FREE_AMULET_ROUNDS = 3;
export const FREE_AMULET_SLOTS = 2;
/**
 * №15 «можно забрать дважды за прокрутку / второе забирание стоит 20% банка»: второе забирание отдаёт
 * DOUBLE_TAKE_SHARE только что забранного кона. 20 % — число автора из DONTLIKE.md, симулятором не подкручивается.
 */
export const DOUBLE_TAKE_SHARE = 0.8;
/** №15: столько раундов живёт «забрать дважды» (в брифе было до конца забега, но +80% к каждому забиранию на весь забег — слишком сильно). */
export const DOUBLE_TAKE_ROUNDS = 3;

/**
 * Число в тексте карты: целые без дробной части, дробные — с одним знаком (0,5 / 0.5).
 * Сначала округляем до десятых: 0,09 · 100 в JS — это 9.000000000000002, и без округления карта сказала бы «+9.0 п.п.».
 */
function cardNum(value: number, isEn: boolean): string {
  const tenths = Math.round(value * 10) / 10;
  const shown = Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
  return isEn ? shown : shown.replace('.', ',');
}

/**
 * Пул сделок. Тексты короткие: на карте две строки, каждая переносится по словам и влезает в ~40 символов.
 * Цифры в текстах берутся из констант рядом — в сцене их нет, и разъехаться они не могут.
 * Названия и описания предметов и амулетов лежат рядом с ними (items.ts, amulets.ts) — сделки тоже со своими текстами.
 */
export const PACTS: readonly PactSpec[] = [
  {
    id: 'tickets-shop',
    rounds: TICKETS_SHOP_ROUNDS,
    bonus: { ru: '+1 билет сразу', en: '+1 ticket right away' },
    cost: {
      ru: `магазин закрыт ${TICKETS_SHOP_ROUNDS} раунда`,
      en: `shop closed for ${TICKETS_SHOP_ROUNDS} rounds`,
    },
  },
  {
    id: 'quiet-round',
    rounds: QUIET_ROUND_ROUNDS,
    bonus: { ru: 'до конца раунда нет черепов', en: 'no skulls until the round ends' },
    cost: {
      ru: `в следующем черепа +${cardNum(QUIET_SKULL_DELTA * 100, false)} п.п.`,
      en: `next round skulls +${cardNum(QUIET_SKULL_DELTA * 100, true)} pp`,
    },
  },
  {
    id: 'double-step',
    rounds: DOUBLE_STEP_ROUNDS,
    bonus: { ru: 'шаг серии ×2: ×1, ×3, ×5', en: 'streak step ×2: ×1, ×3, ×5' },
    cost: { ru: 'череп роняет серию в ×1', en: 'a skull drops the streak to ×1' },
  },
  {
    id: 'skull-calm',
    rounds: SKULL_CALM_ROUNDS,
    bonus: {
      ru: `черепов на ${cardNum(-SKULL_CALM_DELTA * 100, false)} п.п. меньше`,
      en: `skulls ${cardNum(-SKULL_CALM_DELTA * 100, true)} pp rarer`,
    },
    cost: { ru: `серия не выше ×${PACT_CAP}`, en: `streak capped at ×${PACT_CAP}` },
  },
  {
    id: 'soft-skull',
    rounds: SOFT_SKULL_ROUNDS,
    bonus: { ru: 'череп снимает 1 ступень серии', en: 'a skull costs 1 streak step' },
    cost: {
      ru: `−${Math.abs(SOFT_SKULL_SPINS)} прокрутка в раунде`,
      en: `−${Math.abs(SOFT_SKULL_SPINS)} spin per round`,
    },
  },
  {
    id: 'price-up',
    rounds: PACT_LAST_ROUNDS,
    bonus: {
      ru: `выигрыш паттернов +${cardNum((PRICE_UP_WIN - 1) * 100, false)}%`,
      en: `pattern wins +${cardNum((PRICE_UP_WIN - 1) * 100, true)}%`,
    },
    cost: {
      ru: `черепа +${cardNum(PRICE_UP_SKULL_DELTA * 100, false)} п.п. навсегда`,
      en: `skulls +${cardNum(PRICE_UP_SKULL_DELTA * 100, true)} pp forever`,
    },
  },
  {
    id: 'cheap-shop',
    rounds: CHEAP_SHOP_ROUNDS,
    bonus: {
      ru: `цены в магазине −${cardNum((1 - CHEAP_SHOP_DISCOUNT) * 100, false)}% на ${CHEAP_SHOP_ROUNDS} раунда`,
      en: `shop prices −${cardNum((1 - CHEAP_SHOP_DISCOUNT) * 100, true)}% for ${CHEAP_SHOP_ROUNDS} rounds`,
    },
    cost: {
      ru: `долг +${cardNum((CHEAP_SHOP_DEBT_MUL - 1) * 100, false)}% разово`,
      en: `debt +${cardNum((CHEAP_SHOP_DEBT_MUL - 1) * 100, true)}% one time`,
    },
  },
  {
    id: 'full-insurance',
    rounds: PACT_LAST_ROUNDS,
    bonus: {
      ru: `страховка отдаёт ${cardNum(INSURANCE_FULL_SHARE * 100, false)}% кона`,
      en: `insurance pays ${cardNum(INSURANCE_FULL_SHARE * 100, true)}% of the pot`,
    },
    cost: {
      ru: 'копия вдвое дороже до конца забега',
      en: 'each copy ×2 until the run ends',
    },
  },
  {
    id: 'jackpot-weight',
    rounds: PACT_LAST_ROUNDS,
    bonus: {
      ru: `вес джекпота +${cardNum((JACKPOT_WEIGHT_MUL - 1) * 100, false)}%`,
      en: `jackpot weight +${cardNum((JACKPOT_WEIGHT_MUL - 1) * 100, true)}%`,
    },
    cost: {
      ru: `вес «чёрных» +${cardNum(BLACK_PATTERN_WEIGHT_ADD, false)} до конца забега`,
      en: `black patterns +${cardNum(BLACK_PATTERN_WEIGHT_ADD, true)} until the run ends`,
    },
  },
  {
    id: 'symbol-weight',
    rounds: SYMBOL_LUCK_ROUNDS,
    needsSymbol: true,
    bonus: {
      ru: `выбранный символ +${cardNum(SYMBOL_LUCK_PLUS, false)} веса на ${SYMBOL_LUCK_ROUNDS} раунда`,
      en: `chosen symbol +${cardNum(SYMBOL_LUCK_PLUS, true)} weight for ${SYMBOL_LUCK_ROUNDS} rounds`,
    },
    cost: {
      ru: `остальным −${cardNum(SYMBOL_LUCK_MINUS, false)} веса`,
      en: `others −${cardNum(SYMBOL_LUCK_MINUS, true)} weight`,
    },
  },
  {
    id: 'debt-cut',
    rounds: DEBT_CUT_ROUNDS,
    bonus: {
      ru: `текущий долг −${cardNum((1 - DEBT_CUT_MUL) * 100, false)}%`,
      en: `current debt −${cardNum((1 - DEBT_CUT_MUL) * 100, true)}%`,
    },
    cost: {
      ru: `следующий долг +${cardNum((DEBT_NEXT_MUL - 1) * 100, false)}%`,
      en: `next debt +${cardNum((DEBT_NEXT_MUL - 1) * 100, true)}%`,
    },
  },
  {
    id: 'machine-delay',
    rounds: PACT_LAST_ROUNDS,
    bonus: {
      ru: `автомат не меняется ${NO_SWAP_ROUNDS} раунда`,
      en: `the machine holds ${NO_SWAP_ROUNDS} rounds`,
    },
    cost: {
      ru: `черепа +${cardNum(MACHINE_DELAY_SKULL_DELTA * 100, false)} п.п. навсегда`,
      en: `skulls +${cardNum(MACHINE_DELAY_SKULL_DELTA * 100, true)} pp forever`,
    },
  },
  {
    id: 'extra-breath',
    rounds: EXTRA_BREATH_ROUNDS,
    bonus: {
      ru: `+${EXTRA_BREATH_COUNT} запас «второго дыхания» (не больше ${SECOND_WIND_MAX})`,
      en: `+${EXTRA_BREATH_COUNT} second wind (max ${SECOND_WIND_MAX})`,
    },
    cost: {
      ru: `серия −${EXTRA_BREATH_STREAK_COST} ступень прямо сейчас`,
      en: `streak −${EXTRA_BREATH_STREAK_COST} step right now`,
    },
  },
  {
    id: 'safe-bank',
    rounds: SAFE_BANK_ROUNDS,
    bonus: { ru: 'первый череп в раунде не жжёт кон', en: 'first skull spares the pot' },
    cost: { ru: 'набранное в раунде не идёт в цель', en: 'round pot never reaches the goal' },
  },
  {
    id: 'free-amulet',
    rounds: FREE_AMULET_ROUNDS,
    bonus: { ru: 'бесплатный случайный амулет', en: 'a free random amulet' },
    cost: {
      ru: `слотов предметов −${FREE_AMULET_SLOTS} на ${FREE_AMULET_ROUNDS} раунда`,
      en: `item slots −${FREE_AMULET_SLOTS} for ${FREE_AMULET_ROUNDS} rounds`,
    },
  },
  {
    id: 'double-take',
    rounds: DOUBLE_TAKE_ROUNDS,
    bonus: {
      ru: `можно забрать дважды ${DOUBLE_TAKE_ROUNDS} раунда`,
      en: `take twice for ${DOUBLE_TAKE_ROUNDS} rounds`,
    },
    cost: {
      ru: `каждое второе «забирание» теряет ${cardNum((1 - DOUBLE_TAKE_SHARE) * 100, false)}%`,
      en: `each second take loses ${cardNum((1 - DOUBLE_TAKE_SHARE) * 100, true)}%`,
    },
  },
];

/** Сделка по id: id типизирован, поэтому сделка есть всегда (цикл-проверка — для чужих данных кассеты). */
export function pactSpec(id: PactId): PactSpec {
  const spec = PACTS.find((pact) => pact.id === id);
  if (!spec) throw new Error(`неизвестная сделка: ${id}`);
  return spec;
}

/** Запись сделки для кассеты: взяли в раунде round — действует spec.rounds раундов, untilRound — последний из них. */
export function pactOf(id: PactId, round: number, symbol?: SlotSymbol): Pact {
  const pact: Pact = { id, untilRound: round + pactSpec(id).rounds - 1 };
  if (symbol) pact.symbol = symbol; // №11: выбранный символ — часть сделки, кассета его возвращает
  return pact;
}

/** Знакомый ли это id сделки (кассета могла прийти из другой версии игры). */
export function isPactId(value: unknown): value is PactId {
  return typeof value === 'string' && PACTS.some((pact) => pact.id === value);
}

/** Последний раунд сделки с кассеты: не число, NaN и Infinity — 0, то есть сделка уже кончилась. */
function pactRoundOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Символ сделки №11 с кассеты: только платящий символ из SYMBOLS — череп, злые, билет и кубик выбрать нельзя.
 * Проверить «символ уже открыт в этом раунде» при чтении невозможно: кассета хранит сделку и её срок, но не раунд
 * записи, а откат может вернуть забег на раунд назад — счёт раунда на плёнке не про этот раунд. Поэтому берём любой
 * платящий символ: закрытый сейчас даёт вес 0 и ни на что не влияет (symbolLuckWeight не трогает нулевой вес).
 * Мусор и незнакомый id — undefined: сделка без символа ничего не меняет, и это лучше, чем чужой объект.
 */
function pactSymbolOf(value: unknown): SlotSymbol | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const id = (value as { id?: unknown }).id;
  if (typeof id !== 'string') return undefined;
  return SYMBOLS.find((symbol) => symbol.id === id && isPaying(symbol));
}

/**
 * Сделки с кассеты: неизвестные id отбрасываем, битый untilRound — 0, то есть сделка уже кончилась.
 * Символ читается только у сделки №11 — у остальных id его быть не должно (мусор со старой плёнки не храним).
 * В старых записях полей нет — сделок и символа нет.
 */
export function readPacts(list: unknown): Pact[] {
  if (!Array.isArray(list)) return [];
  const pacts: Pact[] = [];
  for (const value of list) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as { id?: unknown; untilRound?: unknown; symbol?: unknown };
    if (!isPactId(record.id)) continue;
    const pact: Pact = { id: record.id, untilRound: pactRoundOf(record.untilRound) };
    const symbol = record.id === 'symbol-weight' ? pactSymbolOf(record.symbol) : undefined;
    if (symbol) pact.symbol = symbol;
    pacts.push(pact);
  }
  return pacts;
}

/** Первый раунд сделки: untilRound − (rounds − 1), пока сделки не сдвинуты — раунд, в котором её взяли. */
function firstRoundOf(pact: Pact): number {
  return pact.untilRound - pactSpec(pact.id).rounds + 1;
}

/**
 * Действует ли сделка в раунде round: untilRound — последний раунд её жизни.
 * Раунд до первого тоже не считается: после провала спасения счёт идёт назад, и сделка, взятая
 * два раунда назад, не должна оживать в раунде, где её ещё не было (это важно магазину).
 */
function isPactActive(pact: Pact, round: number): boolean {
  return round > 0 && round <= pact.untilRound && round >= firstRoundOf(pact);
}

/** Живёт ли сделка id в раунде round: такую второй раз не берут — дубликат не даёт ни бафа, ни билетов. */
export function pactLive(pacts: readonly Pact[], id: PactId, round: number): boolean {
  return pacts.some((pact) => pact.id === id && isPactActive(pact, round));
}

/**
 * Сдвинуть сроки сделок на delta раундов — когда счёт раундов идёт назад (провал спасения) или вперёд.
 * Сделка живёт не «до номера раунда», а столько раундов, сколько их реально сыграно: без сдвига откат счёта
 * спрятал бы сделку (firstRoundOf > round) — закрытый магазин открылся бы, а сделка потом «реанимировалась» сама.
 * Сроки, ушедшие за нулевой раунд, снимаются.
 */
export function shiftPacts(pacts: readonly Pact[], delta: number): Pact[] {
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const shifted: Pact[] = [];
  for (const pact of pacts) {
    const untilRound = pact.untilRound + step;
    if (untilRound > 0) shifted.push(pact.symbol ? { id: pact.id, untilRound, symbol: pact.symbol } : { id: pact.id, untilRound });
  }
  return shifted;
}

/**
 * Что действует в раунде round. Все сделки складываются: две одинаковые не удваивают шаг (он «вдвое», а не «во сколько раз»),
 * а «нет черепов» и «черепов больше» — разные раунды одной сделки, поэтому друг друга не гасят.
 */
export function pactEffects(pacts: readonly Pact[], round: number): PactEffects {
  const effects: PactEffects = {
    noSkulls: false,
    skullShareDelta: 0,
    shopClosed: false,
    multiplierStepMul: 1,
    skullWipesStreak: false,
    multiplierCap: Number.POSITIVE_INFINITY, // потолка нет, пока сделка его не поставит
    skullSoft: false,
    spinsDelta: 0,
    winMul: 1,
    shopDiscount: 1, // цены обычные, пока сделка не даст скидку
    insuranceShare: INSURANCE_SHARE, // обычная доля возврата страховки
    insuranceDoubles: false,
    jackpotWeightMul: 1, // джекпот в удаче весит как обычно
    blackWeightAdd: 0,
    symbolLuck: null,
    noMachineSwap: false, // автомат меняется сам, как обычно
    bankSurvivesSkull: false, // череп жжёт кон как обычно
    effectSlotsDelta: 0, // столбик включённых предметов обычный
    doubleTake: false, // «забрать» одно за прокрутку
  };
  for (const pact of pacts) {
    if (!isPactActive(pact, round)) continue;
    switch (pact.id) {
      case 'tickets-shop':
        // Магазин закрыт, пока сделка жива: все её раунды, считая тот, в котором её взяли.
        effects.shopClosed = true;
        break;
      case 'quiet-round': {
        // Первый раунд сделки — без черепов, последний — черепов больше на QUIET_SKULL_DELTA.
        if (round === firstRoundOf(pact)) effects.noSkulls = true;
        else if (round === pact.untilRound) effects.skullShareDelta += QUIET_SKULL_DELTA;
        break;
      }
      case 'double-step':
        effects.multiplierStepMul = PACT_STEP_FACTOR;
        effects.skullWipesStreak = true;
        break;
      case 'skull-calm':
        // Тише черепа: доля ниже на SKULL_CALM_DELTA, а серия всё время сделки упирается в ×PACT_CAP.
        effects.skullShareDelta += SKULL_CALM_DELTA;
        effects.multiplierCap = Math.min(effects.multiplierCap, PACT_CAP);
        break;
      case 'soft-skull':
        // Мягкий череп: ступень вместо трети, но в раунде на SOFT_SKULL_SPINS прокрутку меньше.
        effects.skullSoft = true;
        effects.spinsDelta += SOFT_SKULL_SPINS;
        break;
      case 'price-up':
        // Выигрыш паттернов больше, черепа чаще — до конца забега (срок PACT_LAST_ROUNDS).
        effects.winMul *= PRICE_UP_WIN;
        effects.skullShareDelta += PRICE_UP_SKULL_DELTA;
        break;
      case 'cheap-shop':
        // Скидка на все цены магазина. Долг +8% разовый — он в PactEffects не живёт (DealerScene.acceptPact).
        effects.shopDiscount *= CHEAP_SHOP_DISCOUNT;
        break;
      case 'full-insurance':
        // Страховка отдаёт весь кон, но каждая следующая копия вдвое дороже (цена — в магазине).
        effects.insuranceShare = INSURANCE_FULL_SHARE;
        effects.insuranceDoubles = true;
        break;
      case 'jackpot-weight':
        // Удача клевера: джекпот тяжелее, «чёрные» паттерны чаще.
        effects.jackpotWeightMul *= JACKPOT_WEIGHT_MUL;
        effects.blackWeightAdd += BLACK_PATTERN_WEIGHT_ADD;
        break;
      case 'symbol-weight':
        // Поправки к весам действуют, только если символ с кассеты уцелел: сделка без него ничего не меняет.
        if (pact.symbol) effects.symbolLuck = { id: pact.symbol.id, plus: SYMBOL_LUCK_PLUS, minus: SYMBOL_LUCK_MINUS };
        break;
      case 'debt-cut':
        // Долг −10% и +20% — разовые: они срабатывают в момент взятия и при назначении следующего долга
        // (DealerScene.acceptPact, ShopScene.takeDebtForRound), а не каждый раунд сделки.
        break;
      case 'machine-delay':
        // Черепа чаще до конца забега, а сам автомат замирает только на первые NO_SWAP_ROUNDS раундов сделки.
        effects.skullShareDelta += MACHINE_DELAY_SKULL_DELTA;
        if (round - firstRoundOf(pact) < NO_SWAP_ROUNDS) effects.noMachineSwap = true;
        break;
      case 'extra-breath':
        // Запас дыхания и минус ступень серии — разовые (DealerScene.applyPactOnce): в раунде эффекта нет.
        // Запись живёт до конца забега только маркером «уже брал» — pactLive не даёт взять карту второй раз.
        break;
      case 'safe-bank':
        // Первый череп в раунде кон не жжёт, но собранное за раунд сгорает вместо автозабора (RoundScene.closeRound).
        effects.bankSurvivesSkull = true;
        break;
      case 'free-amulet':
        // Столбик у экрана на два места короче, пока сделка жива; амулет выдаётся один раз при взятии.
        effects.effectSlotsDelta -= FREE_AMULET_SLOTS;
        break;
      case 'double-take':
        // Второе «забрать» в той же прокрутке отдаёт DOUBLE_TAKE_SHARE забранного (RoundScene.take); срок — 3 раунда.
        effects.doubleTake = true;
        break;
    }
  }
  return effects;
}

/**
 * Долг со сдвигом сделки — −10% (№12 «текущий долг»), +8% (№2 «плата») или +20% (№12 «следующий долг»),
 * с округлением до DEBT_ROUND_TO тем же, что в rules.debtForRound. Мусор в множителе — долг как есть.
 */
export function pactDebt(debt: number, mul: number): number {
  if (!Number.isFinite(debt) || !Number.isFinite(mul)) return debt;
  return Math.round((debt * mul) / DEBT_ROUND_TO) * DEBT_ROUND_TO;
}

/**
 * Символы, из которых игрок выбирает для сделки №11: платящие и уже вошедшие в автомат — череп, злые,
 * билет, клевер, корона и кубик не выбираются, а закрытый символ ничего бы не дал.
 */
export function pactSymbols(round: number): SlotSymbol[] {
  return SYMBOLS.filter((symbol) => isPaying(symbol) && isUnlocked(symbol, round));
}

/**
 * Можно ли предложить выбор символа для сделки №11: список пуст — выбирать не из чего, и карта ведёт себя
 * как отказ (DealerTable зовёт отказ Дилера), а не молча не нажимается.
 */
export function pactSymbolsAvailable(symbols: readonly SlotSymbol[]): boolean {
  return symbols.length > 0;
}

/**
 * Поправка сделки №7 к весам паттернов в удаче клевера: джекпот тяжелее в jackpotWeightMul раз,
 * «чёрным» (LOW_PATTERN_MULTIPLIER) прибавляется blackWeightAdd. null — поправки нет, luckyGrid зовут как раньше.
 */
export function pactPatternWeight(effects: PactEffects): ((pattern: Pattern, weight: number) => number) | null {
  if (effects.jackpotWeightMul === 1 && effects.blackWeightAdd === 0) return null;
  return (pattern, weight) => {
    const jackpot = pattern.multiplier === TOP_MULTIPLIER ? effects.jackpotWeightMul : 1;
    const black = pattern.multiplier === LOW_PATTERN_MULTIPLIER ? effects.blackWeightAdd : 0;
    return weight * jackpot + black;
  };
}

/**
 * Во сколько раз тяжелее (легче, если delta < 0) сделать череп, чтобы его доля в автомате стала share + delta.
 * share — доля до поправки (0…1). Долю даёт k·share / (k·share + others), отсюда k = (s+δ)·(1−s) / (s·(1−s−δ)).
 * Двигается один вес черепа, поэтому и прокрутка, и плашка «💀 N%» показывают одно и то же число.
 * Поправка не выходит за SKULL_SHARE_MIN…SKULL_SHARE_MAX; двигать нечего (черепов нет, доля уже у границы,
 * delta 0 или мусор) — 1.
 */
export function skullShareWeightMul(share: number, delta: number): number {
  if (!Number.isFinite(share) || !(share > 0) || !Number.isFinite(delta) || delta === 0) return 1;
  const target = Math.min(SKULL_SHARE_MAX, Math.max(SKULL_SHARE_MIN, share + delta));
  if (!(target > 0) || target >= 1 || target === share) return 1;
  if (delta > 0 ? !(target > share) : !(target < share)) return 1; // доля уже у границы — двигать некуда
  const mul = (target * (1 - share)) / (share * (1 - target));
  return Number.isFinite(mul) && mul > 0 ? mul : 1;
}

/**
 * Серия после паттерна из черепов с учётом сделок: «череп в ×1» обнуляет, «мягкий череп» снимает одну ступень
 * множителя, иначе от серии остаётся треть (rules.streakAfterSkull). Одно место для сцены и симулятора.
 * Ступень — это одно очко серии: множитель = 1 + серия × шаг, поэтому при шаге 2 ступень дороже в шкале (×19 → ×17),
 * но из серии всё равно уходит ровно 1 — «одна ступень» не зависит от шага.
 */
export function skullStreakAfter(streak: number, effects: PactEffects): number {
  if (effects.skullWipesStreak) return 0;
  const safe = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  if (!effects.skullSoft) return streakAfterSkull(safe);
  return Math.max(0, safe - 1);
}

/**
 * Сколько отдаст второе «забрать» в той же прокрутке (№15): DOUBLE_TAKE_SHARE только что забранного.
 * Сделки нет, первого забирания не было (0, минус, NaN, ∞) — 0, то есть второго забирания не бывает.
 */
export function pactDoubleTake(isOn: boolean, lastTaken: number): number {
  if (!isOn || !Number.isFinite(lastTaken) || lastTaken <= 0) return 0;
  return Math.round(lastTaken * DOUBLE_TAKE_SHARE);
}

/**
 * Три карты на сукно: count разных сделок из пула, кроме exclude (им шаг 10 уберёт те, что уже на столе).
 * Порядок случайный — игрок видит карты в разном порядке, как их положил Дилер.
 */
export function offerPacts(count = PACT_OFFER_COUNT, exclude: readonly PactId[] = []): PactSpec[] {
  const offers = PACTS.filter((pact) => !exclude.includes(pact.id));
  for (let index = offers.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [offers[index], offers[swap]] = [offers[swap], offers[index]];
  }
  return offers.slice(0, Math.max(0, Math.min(count, offers.length)));
}

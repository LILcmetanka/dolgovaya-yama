import { roundPrice } from './items';
import type { Grid, SlotSymbol } from './rules';

/**
 * Действия вне прокрутки (шаг 29, `DONTLIKE.md` §3 — одобрены №2, 4, 5, 6, 8, 10).
 * Это необязательные траты билетов и фишек между прокрутками раунда: обмен символа, лотерея,
 * обслуживание автомата, кража из кассы Коллектора, продажа символа и выкуп долга следующего раунда.
 *
 * Здесь только правила и числа: что сколько стоит, что происходит при успехе и провале, что живёт до конца
 * раунда. Рисует и показывает список на экране автомата `parts/screenList.ts`, применяет сцена (`RoundScene`), а симулятор
 * (`full-run.mjs`) зовёт те же функции — других копий чисел быть не должно.
 * Без Phaser и без побочных эффектов.
 */

/** Шесть действий. Порядок — как в списке (клавиши 1–6 работают, но на экране не подписаны). */
export type ActionId = 'exchange' | 'lottery' | 'service' | 'theft' | 'sale' | 'debt';
export const ACTION_IDS: readonly ActionId[] = ['exchange', 'lottery', 'service', 'theft', 'sale', 'debt'];

// ---------- Цены и числа ----------
/** №2 «Обмен символа»: столько билетов за обмен весов двух символов до конца раунда. */
export const ACTION_EXCHANGE_TICKETS = 2;
/** №4 «Лотерея»: билет за случайный баф или дебаф. */
export const ACTION_LOTTERY_TICKETS = 1;
/** №5 «Обслуживание автомата»: доля долга за чистку черепов на два раунда, но не меньше минимума.
 *  Шаг 38 (DONTLIKE п.3): 10% и 15 фишек оказались слишком дешёвыми — теперь 20% и минимум 30 (решение СОЛО). */
export const ACTION_SERVICE_SHARE = 0.2;
export const ACTION_SERVICE_MIN = 30;
/** №5: на сколько раундов чистка (текущий и следующий) и на сколько % ниже доля черепов. */
export const ACTION_SERVICE_ROUNDS = 2;
export const ACTION_SERVICE_SKULL_DELTA = -0.04;
/**
 * №6 «Кража»: шанс успеха начинается с малого и растёт с каждым раундом — до потолка (шаг 38, DONTLIKE п.14:
 * наоборот, 55% с падением, позволяло фармить улучшения в первом раунде). Провал по-прежнему сразу KABOOM.
 * Решение СОЛО 23.11.2026: 25% + 5 % за раунд, потолок 60%.
 */
export const ACTION_THEFT_CHANCE_START = 0.25;
export const ACTION_THEFT_CHANCE_STEP = 0.05;
export const ACTION_THEFT_CHANCE_MAX = 0.6;
/** №6: сколько фишек даёт успех — доля долга, но не меньше минимума. */
export const ACTION_THEFT_REWARD_SHARE = 0.25;
export const ACTION_THEFT_REWARD_MIN = 40;
/** №8 «Продажа символа»: сколько фишек даёт одна клетка проданного символа (цена символа × клетки). */
export const ACTION_SALE_CELL_MULT = 1;
// №8 (шаг 38, DONTLIKE п.4): цена растёт вместе с текущим разгоном серии — цена символа × клетки × множитель,
// без потолка (DONTLIKE п.5: у игрока был ×89, а цена считалась как ×10).
/** №10 «Долговая биржа»: платишь долю следующего долга сейчас — он уменьшается на другую (бо́льшую) долю. */
export const ACTION_DEBT_PAY_SHARE = 0.14;
export const ACTION_DEBT_PAY_MIN = 10;
export const ACTION_DEBT_CUT_SHARE = 0.16;
export const ACTION_DEBT_CUT_MIN = 20;

// ---------- Лотерея ----------
/** Выигрыш лотереи: баф или дебаф до конца раунда. Короткие, читаются в подсказке. */
export interface LotteryPrize {
  id: string; // имя для кода и lang.ts
  buff: boolean; // баф — хорошо, дебаф — плохо (цвет и текст)
  winMul?: number; // во столько раз больше/меньше выигрыш паттернов до конца раунда
  skullDelta?: number; // поправка к доле черепов до конца раунда
  spins?: number; // прокрутки сразу (положительные) или отнимаются (отрицательные)
}

/** Пулы лотереи: три бафа и три дебафа. Баф/дебаф — честный жребий 50 на 50. */
export const LOTTERY_BUFFS: readonly LotteryPrize[] = [
  { id: 'win-up', buff: true, winMul: 1.25 },
  { id: 'skull-down', buff: true, skullDelta: -0.03 },
  { id: 'spins-up', buff: true, spins: 2 },
];
export const LOTTERY_DEBUFFS: readonly LotteryPrize[] = [
  { id: 'win-down', buff: false, winMul: 0.8 },
  { id: 'skull-up', buff: false, skullDelta: 0.03 },
  { id: 'spins-down', buff: false, spins: -1 },
];
export const LOTTERY_POOL: readonly LotteryPrize[] = [...LOTTERY_BUFFS, ...LOTTERY_DEBUFFS];

/** Жребий лотереи: первое число — баф или дебаф (пополам), второе — какой из трёх. */
export function lotteryRoll(random: () => number = Math.random): LotteryPrize {
  const roll = random();
  const pool = Number.isFinite(roll) && roll < 0.5 ? LOTTERY_BUFFS : LOTTERY_DEBUFFS;
  const index = Math.floor(random() * pool.length);
  return pool[Number.isFinite(index) ? Math.min(pool.length - 1, Math.max(0, index)) : 0];
}

// ---------- Состояние действий раунда ----------
/**
 * Что действия сделали в этом раунде. Каждое действие — один раз за раунд (`used`), иначе кража или
 * обслуживание фармились бы бесконечно. Живёт до конца раунда; в кассету не пишется: откат возвращает
 * раунд к записи, а действие — нет (см. QUESTIONS.md, «решено в СОЛО 22.11.2026»).
 */
export interface ActionState {
  used: ActionId[]; // какие действия уже потрачены в этом раунде
  exchange: { from: string; to: string } | null; // №2: веса каких символов поменялись местами
  lottery: LotteryPrize | null; // №4: что выпало в лотерее
  serviceRounds: number; // №5: сколько раундов ещё действует чистка черепов
  sold: string[]; // №8: проданные символы — их в автомате нет до конца раунда
  debtCut: number; // №10: на сколько фишек уменьшится долг следующего раунда
}

/** Чистое состояние: новый забег или сброс сцены. */
export function freshActions(): ActionState {
  return { used: [], exchange: null, lottery: null, serviceRounds: 0, sold: [], debtCut: 0 };
}

/**
 * Новый раунд: одноразовые действия снова доступны, обмен, лотерея и проданные символы гаснут —
 * они жили до конца прошлого раунда. Чистка черепов тикает: купленная в раунде N работает в N и N+1.
 * Выкуп долга (debtCut) не обнуляется здесь: его применит магазин на открытии следующего раунда
 * (ShopScene.applyShopDebt) — startRound зовётся уже после.
 */
export function startRoundActions(state: ActionState): ActionState {
  return {
    used: [],
    exchange: null,
    lottery: null,
    serviceRounds: Math.max(0, Math.floor(state.serviceRounds) - 1),
    sold: [],
    debtCut: state.debtCut,
  };
}

/** Потрачено ли действие в этом раунде. */
export function actionUsed(state: ActionState, id: ActionId): boolean {
  return state.used.includes(id);
}

/** Отметить действие потраченным (возвращает новое состояние, старое не меняется). */
export function useAction(state: ActionState, id: ActionId): ActionState {
  return actionUsed(state, id) ? state : { ...state, used: [...state.used, id] };
}

// ---------- Цены и эффекты ----------
/** №5: цена чистки — доля долга круга, не меньше минимума (округление как у цен магазина). */
export function servicePrice(debt: number): number {
  return Math.max(ACTION_SERVICE_MIN, roundPrice(ACTION_SERVICE_SHARE * Math.max(0, debt)));
}

/** №5: можно ли чистить (чистка уже идёт — второй раз не берут, иначе копились бы раунды). */
export function serviceAllowed(state: ActionState): boolean {
  return state.serviceRounds <= 0;
}

/** №5: поправка к доле черепов от чистки, пока она действует. */
export function serviceSkullDelta(state: ActionState): number {
  return state.serviceRounds > 0 ? ACTION_SERVICE_SKULL_DELTA : 0;
}

/** №9-подобная общая поправка к доле черепов от действий (лотерея + чистка). */
export function actionSkullDelta(state: ActionState): number {
  return (state.lottery?.skullDelta ?? 0) + serviceSkullDelta(state);
}

/** №4: множитель выигрыша паттернов от лотереи (1 — ничего не выпало). */
export function lotteryWinMul(state: ActionState): number {
  return state.lottery?.winMul ?? 1;
}

/**
 * №6: шанс успеха кражи в раунде round (1 — первый раунд). С каждым раундом риск падает: 25%, 30%, 35%… до 60%
 * (шаг 38, DONTLIKE п.14). Округление до процента: 0,25 + 0,05 × 3 — это 0,4 в double, но 0,30000000000000004
 * бывает при других шагах; на панели и в тесте должно быть ровно целое число процентов.
 */
export function theftChance(round: number): number {
  const step = Number.isFinite(round) ? Math.max(0, round - 1) : 0;
  const chance = Math.round((ACTION_THEFT_CHANCE_START + ACTION_THEFT_CHANCE_STEP * step) * 100) / 100;
  return Math.min(ACTION_THEFT_CHANCE_MAX, chance);
}

/** №6: сколько даёт успешная кража — доля долга круга, не меньше минимума. */
export function theftReward(debt: number): number {
  return Math.max(ACTION_THEFT_REWARD_MIN, roundPrice(ACTION_THEFT_REWARD_SHARE * Math.max(0, debt)));
}

/** №6: удалась ли попытка. Провал — сразу KABOOM (решает сцена), никакого «второго шанса». */
export function theftSucceeds(round: number, random: () => number = Math.random): boolean {
  const roll = random();
  return Number.isFinite(roll) && roll < theftChance(round);
}

/** №10: сколько фишек платится сейчас за выкуп части следующего долга. */
export function debtBuyPrice(nextDebt: number): number {
  return Math.max(ACTION_DEBT_PAY_MIN, roundPrice(ACTION_DEBT_PAY_SHARE * Math.max(0, nextDebt)));
}

/** №10: на сколько фишек станет меньше долг следующего раунда. */
export function debtBuyCut(nextDebt: number): number {
  return Math.max(ACTION_DEBT_CUT_MIN, roundPrice(ACTION_DEBT_CUT_SHARE * Math.max(0, nextDebt)));
}

/** №8: сколько клеток символа symbolId на сетке grid. */
export function symbolCells(grid: Grid | null, symbolId: string): number {
  if (!grid) return 0;
  let count = 0;
  for (const row of grid) for (const cell of row) if (cell.id === symbolId) count += 1;
  return count;
}

/**
 * №8: множитель, который входит в цену продажи, — текущий разгон серии. Потолка нет (DONTLIKE п.5: у игрока был
 * ×89, а цена считалась как ×10). Меньше 1 и мусор считаются единицей.
 */
export function saleMultiplier(multiplier = 1): number {
  return Number.isFinite(multiplier) && multiplier > 1 ? multiplier : 1;
}

/**
 * №8: сколько фишек даёт продажа символа с cells клетками на сетке при текущем множителе серии multiplier.
 * Формула: цена символа × клетки × множитель (без потолка). Множитель меньше 1 и мусор
 * считаются единицей: продажа не может стоить меньше «цены за клетку», иначе игрок получил бы штраф за разгон.
 */
export function salePrice(symbol: SlotSymbol, cells: number, multiplier = 1): number {
  if (!(symbol.price > 0) || !(cells > 0)) return 0;
  return Math.round(symbol.price * cells * ACTION_SALE_CELL_MULT * saleMultiplier(multiplier));
}

/**
 * №2: можно ли менять символ from на to. Оба — платящие символы этого автомата (иначе обмен открыл бы
 * закрытый символ или обменял черепа), и это не один и тот же символ.
 */
export function canExchange(from: SlotSymbol, to: SlotSymbol, isInMachine: (symbol: SlotSymbol) => boolean): boolean {
  if (from.id === to.id) return false;
  if (!(from.price > 0) || !(to.price > 0)) return false;
  return isInMachine(from) && isInMachine(to);
}

/**
 * Улучшения после смерти (шаг 28, `DONTLIKE.md` §1). После гибели игроку показывают три улучшения и дают взять
 * одно бесплатно; второе — за билеты из остатка погибшего забега (UPGRADE_SECOND_PRICE). Купленное живёт
 * в localStorage (progress.ts) и действует со следующего забега.
 *
 * Здесь только данные и маленькие чистые функции: пул улучшений, что из покупок получается (upgradeEffects)
 * и как предлагать. Эффекты применяют сцена и симулятор — через upgradeEffects() и только через него:
 * иначе числа разъехались бы по файлам и замер перестал бы совпадать с игрой.
 * Без Phaser и без побочных эффектов.
 */

import { INSURANCE_SHARE } from './amulets';
import { TICKET_SHARE_START } from './items';
import type { TextKey } from './lang';
import { DEBT_GROWTH, JOKER, SYMBOLS, type Grid } from './rules';

/** Группа улучшения — подпись на карточке (прокрутки, долг, фишки, билеты, предметы, амулеты, сетка, магазин, кассета, прочее). */
export type UpgradeGroup = 'spins' | 'debt' | 'chips' | 'tickets' | 'items' | 'amulets' | 'grid' | 'shop' | 'tape' | 'other';

/**
 * Id пула. Первая партия (28а) — 11 штук; вторая (28б) — 12: билеты (№16–18), предметы (№22–25),
 * амулеты (№26–30); третья (28в) — 9: сетка (№31–35) и магазин (№36, 38–40); четвёртая (28г) — кассета
 * (№42, 44, 45) и прочее (№48–50). №46 «+5% рекорда к стартовым фишкам» и №47 «билет за ачивку» удалены
 * шагом 38 (`DONTLIKE.md` п.1 и п.10): пул 42 → 40. №21 «ещё место на полке» удалён 25.11: полка
 * фиксированная. №37 «+1 ряд витрины» удалён 25.11 (автор: «убрать улучшение на 5 предметов»): пул 39 → 38.
 */
export type UpgradeId =
  | 'spin-first-round'
  | 'spin-cap'
  | 'spin-skull-free'
  | 'debt-start'
  | 'debt-growth'
  | 'debt-forgive'
  | 'debt-defer'
  | 'win-patterns'
  | 'win-interest'
  | 'win-piggy'
  | 'win-insurance'
  // 28б: билеты (№16–18)
  | 'ticket-start'
  | 'ticket-third-debt'
  | 'ticket-jackpot'
  // 28б: предметы (№22–25)
  | 'item-price'
  | 'item-clover-weight'
  | 'item-cherry-weight'
  | 'item-hammer-empty'
  // 28б: амулеты (№26–30)
  | 'amulet-price'
  | 'amulet-copy'
  | 'amulet-first-socket'
  | 'amulet-first-rare'
  | 'amulet-survives-death'
  // 28в: сетка (№31–35)
  | 'grid-skull-share'
  | 'grid-start-joker'
  | 'grid-start-symbol'
  | 'grid-jackpot'
  | 'grid-blood-weight'
  // 28в: магазин (№36, 38–40)
  | 'shop-discount'
  | 'shop-ticket-share'
  | 'shop-amulet-chips'
  | 'shop-gift-item'
  // 28г: кассета (№42, 44, 45)
  | 'tape-keeps-streak'
  | 'tape-free'
  | 'tape-refund-tickets'
  // 28г: прочее (№48–50)
  | 'machine-no-swap'
  | 'machine-start-pick'
  | 'skull-cancel';

/** Сколько взято каждого улучшения. Нет ключа — не брали; мусор (дроби, минус) отбрасывает progress.ts. */
export type PurchasedUpgrades = Partial<Record<UpgradeId, number>>;

/**
 * Данные улучшения: только числа и флаги, без побочных эффектов. 0/1 у флагов — «включено/нет».
 * Как из этого складываются готовые числа — одна функция upgradeEffects внизу файла.
 */
export interface UpgradeGain {
  firstRoundSpins?: number; // прибавляется к прокруткам первого раунда
  spinCapBonus?: number; // прибавляется к потолку прокруток за раунд
  freeSpinAfterFirstSkull?: number; // 1 — первый паттерн черепов в раунде даёт бесплатную прокрутку
  startDebtMul?: number; // во столько раз дешевле стартовый долг (перемножается за каждую покупку)
  debtGrowthMul?: number; // во столько раз медленнее растёт долг (перемножается за каждую покупку)
  debtForgiveEveryRuns?: number; // каждый N-й забег первый долг прощается
  deferOnce?: number; // 1 — раз за забег долг можно отложить на раунд
  winMul?: number; // во столько раз больше выигрыш паттернов (перемножается)
  interestBonus?: number; // прибавляется к доле «Процентов» на остаток
  piggyBonus?: number; // прибавляется к фишкам копилки за прокрутку
  insuranceShare?: number; // доля возврата страховки (берётся большая из игры и улучшения)
  startTickets?: number; // билеты на табло в начале забега (№16)
  debtTicketBonus?: number; // прибавка билетов за долг, закрытый в раунде UPGRADE_DEBT_TICKET_ROUND (№17)
  jackpotTickets?: number; // прибавка билетов за джекпот (№18)
  itemPriceMul?: number; // во столько раз дешевле предметы (перемножается, №22)
  cloverWeight?: number; // прибавка веса клевера 🍀 (№23)
  cherryWeight?: number; // прибавка веса вишни 🍒 (№24)
  hammerKeepsOnEmpty?: number; // 1 — молот не тратится на прокрутке без выигрыша (№25)
  amuletTicketsOff?: number; // на столько билетов дешевле каждый амулет, не ниже 1 (№26)
  amuletMaxCopies?: number; // прибавка к потолку копий любого амулета (перемножается по копиям улучшения, №27)
  firstSocketFree?: number; // 1 — первое гнездо в забеге бесплатно (№28)
  rareAmuletFirstShop?: number; // 1 — в первом магазине всегда есть редкий амулет (№29)
  deathAmuletSave?: number; // 1 — при выборе памяти на старте можно взять на один амулет больше (№30)
  // Третья партия (28в)
  skullShareDelta?: number; // поправка к доле черепов, складывается со сделками и колокольчиком (№31)
  startJoker?: number; // 1 — на первой сетке забега джокер (№32)
  startSymbolPick?: number; // 1 — перед забегом игрок выбирает символ первой сетки (№33)
  jackpotWinMul?: number; // во столько раз больше платит только джекпот-паттерн (№34)
  bloodWeight?: number; // прибавка веса крови 🩸 (№35)
  shopPriceMul?: number; // во столько раз дешевле всё в магазинах (перемножается, №36)
  ticketShareStart?: number; // доля фишек за первый билет (№38; шаги роста не меняются)
  miniCasePriceMul?: number; // №39: во столько раз дешевле амулет за фишки в мини-чемодане (перемножается)
  freeItemFirstShop?: number; // 1 — в первом магазине забега один предмет бесплатно (№40)
  // Четвёртая партия (28г): кассета и прочее
  rewindKeepsStreak?: number; // 1 — откат кассетой не сбрасывает серию (№42)
  freeTape?: number; // 1 — кассета в магазине стоит 0 билетов (№44)
  rewindRefundsTickets?: number; // 1 — откат возвращает билеты, потраченные после записи (№45)
  noMachineSwap?: number; // 1 — автомат больше не меняется сам в начале раунда (№48)
  startMachinePick?: number; // 1 — перед забегом игрок выбирает автомат (№49)
  skullCancel?: number; // 1 — раз за забег можно отменить выпавший череп (№50)
}

export interface Upgrade {
  id: UpgradeId;
  group: UpgradeGroup;
  name: TextKey; // название — ключ lang.ts
  desc: TextKey; // что даёт — ключ lang.ts, одной честной строкой
  repeat: number; // сколько раз можно взять; 1 — один раз (в первой партии «×N» нет)
  apply: UpgradeGain;
}

// ---------- Числа первой партии ----------
export const UPGRADE_OFFERS = 3; // сколько карточек показывают после смерти
export const UPGRADE_SECOND_PRICE = 6; // второе улучшение — за столько билетов из остатка забега
export const UPGRADE_FIRST_ROUND_SPINS = 1; // №1: +1 прокрутка в первом раунде
export const UPGRADE_SPIN_CAP_BONUS = 2; // №3: +2 к потолку прокруток за раунд
export const UPGRADE_START_DEBT_MUL = 0.95; // №6: стартовый долг −5%
export const UPGRADE_DEBT_GROWTH = 3.4; // №7: рост долга ×3,4 вместо ×3,6
/** №7 в виде множителя к DEBT_GROWTH: debtForRound принимает его вторым числом. */
export const UPGRADE_DEBT_GROWTH_MUL = UPGRADE_DEBT_GROWTH / DEBT_GROWTH;
export const UPGRADE_FORGIVE_EVERY_RUNS = 5; // №8: первый долг прощается раз в пять забегов
export const UPGRADE_WIN_MUL = 1.05; // №12: выигрыш паттернов +5%
export const UPGRADE_INTEREST_BONUS = 0.05; // №13: проценты на остаток +5%
export const UPGRADE_PIGGY_BONUS = 1; // №14: копилка +1 фишка за прокрутку
export const UPGRADE_INSURANCE_SHARE = 0.8; // №15: страховка возвращает 80% вместо 75%
// ---------- Числа второй партии (28б) ----------
export const UPGRADE_START_TICKETS = 1; // №16: билет на табло с первого кадра забега
export const UPGRADE_DEBT_TICKET_ROUND = 3; // №17: только за долг, закрытый ровно в третьем раунде
export const UPGRADE_DEBT_TICKET_BONUS = 1; // №17: +1 билет к обычному «билету за долг»
export const UPGRADE_JACKPOT_TICKETS = 1; // №18: джекпот даёт на билет больше (2 + 1 = 3)
export const UPGRADE_ITEM_PRICE_MUL = 0.9; // №22: предметы дешевле на 10%
export const UPGRADE_CLOVER_WEIGHT = 1; // №23: клевер 🍀 тяжелее на 1
export const UPGRADE_CHERRY_WEIGHT = 1; // №24: вишня 🍒 тяжелее на 1
export const UPGRADE_AMULET_TICKETS_OFF = 1; // №26: амулеты дешевле на 1 билет (не ниже 1)
export const UPGRADE_AMULET_MAX_COPIES = 1; // №27: каждая копия улучшения поднимает потолок копий на 1
// ---------- Числа третьей партии (28в) ----------
export const UPGRADE_SKULL_SHARE_DELTA = -0.01; // №31: доля черепов ниже на 1 % (складывается со всеми поправками)
export const UPGRADE_BLOOD_WEIGHT = 2; // №35: кровь 🩸 тяжелее на 2 (базовый вес 4)
export const UPGRADE_JACKPOT_WIN_MUL = 1.2; // №34: джекпот платит ×120 вместо ×100
export const UPGRADE_SHOP_PRICE_MUL = 0.9; // №36: всё в магазине дешевле на 10% (перемножается со скидкой сделки)
export const UPGRADE_TICKET_SHARE_START = 0.3; // №38: первый билет за фишки — 30% банка вместо 40%
export const UPGRADE_MINI_CASE_PRICE_MUL = 0.5; // №39: амулет за фишки в мини-чемодане вдвое дешевле
// ---------- Числа четвёртой партии (28г) ----------
export const MEMORY_PICKS_UPGRADE = 1; // №30: ещё один амулет из прошлого забега можно взять на старте

/**
 * Пул — 38 улучшений (номера — исходные из `DONTLIKE.md` §1): 11 первой партии (28а), 12 второй (28б),
 * 9 третьей (28в), 6 четвёртой (28г). Прокрутки (№1, 3, 4), долг (№6, 7, 8, 10), фишки (№12–15); билеты (№16–18),
 * предметы (№22–25), амулеты (№26–30); сетка (№31–35), магазин (№36, 38–40); кассета (№42, 44, 45) и прочее (№48–50).
 * №21 «ещё место на полке» убран: полка фиксированная, места не расширяются (DONTLIKE, 25.11).
 * №37 «+1 ряд витрины» убран: витрина снова 4 ряда — три предмета и билеты (DONTLIKE, 25.11).
 */
export const UPGRADES: Upgrade[] = [
  {
    id: 'spin-first-round', group: 'spins', name: 'upgSpinFirstRound', desc: 'upgSpinFirstRoundWhat', repeat: 1,
    apply: { firstRoundSpins: UPGRADE_FIRST_ROUND_SPINS },
  },
  {
    id: 'spin-cap', group: 'spins', name: 'upgSpinCap', desc: 'upgSpinCapWhat', repeat: 1,
    apply: { spinCapBonus: UPGRADE_SPIN_CAP_BONUS },
  },
  {
    id: 'spin-skull-free', group: 'spins', name: 'upgSpinSkullFree', desc: 'upgSpinSkullFreeWhat', repeat: 1,
    apply: { freeSpinAfterFirstSkull: 1 },
  },
  {
    id: 'debt-start', group: 'debt', name: 'upgDebtStart', desc: 'upgDebtStartWhat', repeat: 1,
    apply: { startDebtMul: UPGRADE_START_DEBT_MUL },
  },
  {
    id: 'debt-growth', group: 'debt', name: 'upgDebtGrowth', desc: 'upgDebtGrowthWhat', repeat: 1,
    apply: { debtGrowthMul: UPGRADE_DEBT_GROWTH_MUL },
  },
  {
    id: 'debt-forgive', group: 'debt', name: 'upgDebtForgive', desc: 'upgDebtForgiveWhat', repeat: 1,
    apply: { debtForgiveEveryRuns: UPGRADE_FORGIVE_EVERY_RUNS },
  },
  {
    id: 'debt-defer', group: 'debt', name: 'upgDebtDefer', desc: 'upgDebtDeferWhat', repeat: 1,
    apply: { deferOnce: 1 },
  },
  {
    id: 'win-patterns', group: 'chips', name: 'upgWinPatterns', desc: 'upgWinPatternsWhat', repeat: 1,
    apply: { winMul: UPGRADE_WIN_MUL },
  },
  {
    id: 'win-interest', group: 'chips', name: 'upgWinInterest', desc: 'upgWinInterestWhat', repeat: 1,
    apply: { interestBonus: UPGRADE_INTEREST_BONUS },
  },
  {
    id: 'win-piggy', group: 'chips', name: 'upgWinPiggy', desc: 'upgWinPiggyWhat', repeat: 1,
    apply: { piggyBonus: UPGRADE_PIGGY_BONUS },
  },
  {
    id: 'win-insurance', group: 'chips', name: 'upgWinInsurance', desc: 'upgWinInsuranceWhat', repeat: 1,
    apply: { insuranceShare: UPGRADE_INSURANCE_SHARE },
  },
  // ---------- Вторая партия (28б): билеты, предметы, амулеты ----------
  {
    id: 'ticket-start', group: 'tickets', name: 'upgTicketStart', desc: 'upgTicketStartWhat', repeat: 1,
    apply: { startTickets: UPGRADE_START_TICKETS },
  },
  {
    id: 'ticket-third-debt', group: 'tickets', name: 'upgTicketThird', desc: 'upgTicketThirdWhat', repeat: 1,
    apply: { debtTicketBonus: UPGRADE_DEBT_TICKET_BONUS },
  },
  {
    id: 'ticket-jackpot', group: 'tickets', name: 'upgTicketJackpot', desc: 'upgTicketJackpotWhat', repeat: 1,
    apply: { jackpotTickets: UPGRADE_JACKPOT_TICKETS },
  },
  {
    id: 'item-price', group: 'items', name: 'upgItemPrice', desc: 'upgItemPriceWhat', repeat: 1,
    apply: { itemPriceMul: UPGRADE_ITEM_PRICE_MUL },
  },
  {
    id: 'item-clover-weight', group: 'items', name: 'upgItemClover', desc: 'upgItemCloverWhat', repeat: 1,
    apply: { cloverWeight: UPGRADE_CLOVER_WEIGHT },
  },
  {
    id: 'item-cherry-weight', group: 'items', name: 'upgItemCherry', desc: 'upgItemCherryWhat', repeat: 1,
    apply: { cherryWeight: UPGRADE_CHERRY_WEIGHT },
  },
  {
    id: 'item-hammer-empty', group: 'items', name: 'upgItemHammer', desc: 'upgItemHammerWhat', repeat: 1,
    apply: { hammerKeepsOnEmpty: 1 },
  },
  {
    id: 'amulet-price', group: 'amulets', name: 'upgAmuletPrice', desc: 'upgAmuletPriceWhat', repeat: 1,
    apply: { amuletTicketsOff: UPGRADE_AMULET_TICKETS_OFF },
  },
  {
    // «×2»: берётся дважды, каждая копия поднимает потолок копий ВСЕХ амулетов на 1 (не выдаёт конкретный).
    id: 'amulet-copy', group: 'amulets', name: 'upgAmuletCopy', desc: 'upgAmuletCopyWhat', repeat: 2,
    apply: { amuletMaxCopies: UPGRADE_AMULET_MAX_COPIES },
  },
  {
    id: 'amulet-first-socket', group: 'amulets', name: 'upgAmuletSocket', desc: 'upgAmuletSocketWhat', repeat: 1,
    apply: { firstSocketFree: 1 },
  },
  {
    id: 'amulet-first-rare', group: 'amulets', name: 'upgAmuletRare', desc: 'upgAmuletRareWhat', repeat: 1,
    apply: { rareAmuletFirstShop: 1 },
  },
  {
    id: 'amulet-survives-death', group: 'amulets', name: 'upgAmuletDeath', desc: 'upgAmuletDeathWhat', repeat: 1,
    apply: { deathAmuletSave: 1 },
  },
  // ---------- Третья партия (28в): сетка ----------
  {
    id: 'grid-skull-share', group: 'grid', name: 'upgGridSkull', desc: 'upgGridSkullWhat', repeat: 1,
    apply: { skullShareDelta: UPGRADE_SKULL_SHARE_DELTA },
  },
  {
    id: 'grid-start-joker', group: 'grid', name: 'upgGridJoker', desc: 'upgGridJokerWhat', repeat: 1,
    apply: { startJoker: 1 },
  },
  {
    id: 'grid-start-symbol', group: 'grid', name: 'upgGridSymbol', desc: 'upgGridSymbolWhat', repeat: 1,
    apply: { startSymbolPick: 1 },
  },
  {
    id: 'grid-jackpot', group: 'grid', name: 'upgGridJackpot', desc: 'upgGridJackpotWhat', repeat: 1,
    apply: { jackpotWinMul: UPGRADE_JACKPOT_WIN_MUL },
  },
  {
    id: 'grid-blood-weight', group: 'grid', name: 'upgGridBlood', desc: 'upgGridBloodWhat', repeat: 1,
    apply: { bloodWeight: UPGRADE_BLOOD_WEIGHT },
  },
  // ---------- Третья партия (28в): магазин ----------
  {
    id: 'shop-discount', group: 'shop', name: 'upgShopDiscount', desc: 'upgShopDiscountWhat', repeat: 1,
    apply: { shopPriceMul: UPGRADE_SHOP_PRICE_MUL },
  },
  {
    id: 'shop-ticket-share', group: 'shop', name: 'upgShopTicket', desc: 'upgShopTicketWhat', repeat: 1,
    apply: { ticketShareStart: UPGRADE_TICKET_SHARE_START },
  },
  {
    id: 'shop-amulet-chips', group: 'shop', name: 'upgShopAmulet', desc: 'upgShopAmuletWhat', repeat: 1,
    apply: { miniCasePriceMul: UPGRADE_MINI_CASE_PRICE_MUL },
  },
  {
    id: 'shop-gift-item', group: 'shop', name: 'upgShopGift', desc: 'upgShopGiftWhat', repeat: 1,
    apply: { freeItemFirstShop: 1 },
  },
  // ---------- Четвёртая партия (28г): кассета ----------
  {
    id: 'tape-keeps-streak', group: 'tape', name: 'upgTapeStreak', desc: 'upgTapeStreakWhat', repeat: 1,
    apply: { rewindKeepsStreak: 1 },
  },
  {
    id: 'tape-free', group: 'tape', name: 'upgTapeFree', desc: 'upgTapeFreeWhat', repeat: 1,
    apply: { freeTape: 1 },
  },
  {
    id: 'tape-refund-tickets', group: 'tape', name: 'upgTapeTickets', desc: 'upgTapeTicketsWhat', repeat: 1,
    apply: { rewindRefundsTickets: 1 },
  },
  // ---------- Четвёртая партия (28г): прочее ----------
  {
    id: 'machine-no-swap', group: 'other', name: 'upgMachineNoSwap', desc: 'upgMachineNoSwapWhat', repeat: 1,
    apply: { noMachineSwap: 1 },
  },
  {
    id: 'machine-start-pick', group: 'other', name: 'upgMachinePick', desc: 'upgMachinePickWhat', repeat: 1,
    apply: { startMachinePick: 1 },
  },
  {
    id: 'skull-cancel', group: 'other', name: 'upgSkullCancel', desc: 'upgSkullCancelWhat', repeat: 1,
    apply: { skullCancel: 1 },
  },
];

/** Id пула — по нему progress отбрасывает чужие ключи из сохранения. Объявлен раньше функций: они зовут его на загрузке. */
const UPGRADE_IDS = new Set<string>(UPGRADES.map((upgrade) => upgrade.id));

/** Существует ли такое улучшение: чужое id в прогресс не пускаем. */
export function isUpgradeId(id: unknown): id is UpgradeId {
  return typeof id === 'string' && UPGRADE_IDS.has(id);
}

/** Улучшение по id; чужого нет — undefined. */
export function upgradeById(id: UpgradeId): Upgrade | undefined {
  return UPGRADES.find((upgrade) => upgrade.id === id);
}

/**
 * Готовые числа из покупок: их читают сцены и симулятор, других мест у правил улучшений нет.
 * Ноль покупок — нейтральные числа (ничего не меняется): так проверяется, что без улучшений игра та же.
 */
export interface UpgradeEffects {
  firstRoundSpins: number;
  spinCapBonus: number;
  freeSpinAfterFirstSkull: boolean;
  startDebtMul: number;
  debtGrowthMul: number;
  debtForgiveEveryRuns: number; // 0 — прощения нет
  deferOnce: boolean;
  winMul: number;
  interestBonus: number;
  piggyBonus: number;
  insuranceShare: number;
  // Вторая партия (28б)
  startTickets: number;
  debtTicketBonus: number; // за долг, закрытый в раунде UPGRADE_DEBT_TICKET_ROUND
  jackpotTickets: number;
  itemPriceMul: number;
  cloverWeight: number;
  cherryWeight: number;
  keepsHammerOnEmpty: boolean;
  amuletTicketsOff: number;
  amuletMaxCopies: number;
  firstSocketFree: boolean;
  rareAmuletFirstShop: boolean;
  deathAmuletSave: boolean;
  // Третья партия (28в)
  skullShareDelta: number; // поправка к доле черепов (складывается со сделками и колокольчиком)
  startJoker: boolean;
  startSymbolPick: boolean;
  jackpotWinMul: number;
  bloodWeight: number;
  shopPriceMul: number;
  ticketShareStart: number;
  miniCasePriceMul: number; // №39: цена амулета за фишки в мини-чемодане (1 — как есть)
  freeItemFirstShop: boolean;
  // Четвёртая партия (28г): кассета и прочее
  rewindKeepsStreak: boolean; // №42: откат не сбрасывает серию
  freeTape: boolean; // №44: кассета в магазине бесплатна
  rewindRefundsTickets: boolean; // №45: откат возвращает билеты, потраченные после записи
  noMachineSwap: boolean; // №48: смена автомата выключена
  startMachinePick: boolean; // №49: в начале забега выбираешь автомат
  skullCancelOnce: boolean; // №50: раз за забег можно отменить череп
}

/** Нейтральные числа: ровно то, что даёт игра без единого улучшения. */
export function neutralUpgrades(): UpgradeEffects {
  return {
    firstRoundSpins: 0,
    spinCapBonus: 0,
    freeSpinAfterFirstSkull: false,
    startDebtMul: 1,
    debtGrowthMul: 1,
    debtForgiveEveryRuns: 0,
    deferOnce: false,
    winMul: 1,
    interestBonus: 0,
    piggyBonus: 0,
    // Обычная доля страховки — число игры, а не копия: без улучшения правила те же.
    insuranceShare: INSURANCE_SHARE,
    startTickets: 0,
    debtTicketBonus: 0,
    jackpotTickets: 0,
    itemPriceMul: 1,
    cloverWeight: 0,
    cherryWeight: 0,
    keepsHammerOnEmpty: false,
    amuletTicketsOff: 0,
    amuletMaxCopies: 0,
    firstSocketFree: false,
    rareAmuletFirstShop: false,
    deathAmuletSave: false,
    skullShareDelta: 0,
    startJoker: false,
    startSymbolPick: false,
    jackpotWinMul: 1,
    bloodWeight: 0,
    shopPriceMul: 1,
    ticketShareStart: TICKET_SHARE_START,
    miniCasePriceMul: 1,
    freeItemFirstShop: false,
    rewindKeepsStreak: false,
    freeTape: false,
    rewindRefundsTickets: false,
    noMachineSwap: false,
    startMachinePick: false,
    skullCancelOnce: false,
  };
}

/** Сколько раз улучшение уже взято: мусор и «больше потолка» считаем как потолок. */
export function takenOf(upgrade: Upgrade, purchased: PurchasedUpgrades): number {
  const value = purchased[upgrade.id];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(upgrade.repeat, Math.floor(value));
}

/** Сколько ещё раз можно взять это улучшение. */
export function leftToTake(upgrade: Upgrade, purchased: PurchasedUpgrades): number {
  return upgrade.repeat - takenOf(upgrade, purchased);
}

/**
 * Из покупок — готовые числа. Складываем по всем улучшениям пула, а не по ключам сохранения:
 * чужое id в покупках просто ни на что не влияет.
 *   • прибавка (прокрутки, потолок, проценты, копилка, билеты, места, вес символа) — × число покупок;
 *   • множители (долг, рост, выигрыш, цена предметов) — в степени числа покупок;
 *   • флаги — «взято хотя бы раз»;
 *   • «раз в N забегов» и доля страховки — берём сильнейшее из взятых.
 */
export function upgradeEffects(purchased: PurchasedUpgrades): UpgradeEffects {
  const effects = neutralUpgrades();
  for (const upgrade of UPGRADES) {
    const count = takenOf(upgrade, purchased);
    if (count === 0) continue;
    const apply = upgrade.apply;
    effects.firstRoundSpins += (apply.firstRoundSpins ?? 0) * count;
    effects.spinCapBonus += (apply.spinCapBonus ?? 0) * count;
    effects.interestBonus += (apply.interestBonus ?? 0) * count;
    effects.piggyBonus += (apply.piggyBonus ?? 0) * count;
    effects.startTickets += (apply.startTickets ?? 0) * count;
    effects.debtTicketBonus += (apply.debtTicketBonus ?? 0) * count;
    effects.jackpotTickets += (apply.jackpotTickets ?? 0) * count;
    effects.cloverWeight += (apply.cloverWeight ?? 0) * count;
    effects.cherryWeight += (apply.cherryWeight ?? 0) * count;
    effects.amuletTicketsOff += (apply.amuletTicketsOff ?? 0) * count;
    effects.amuletMaxCopies += (apply.amuletMaxCopies ?? 0) * count;
    effects.skullShareDelta += (apply.skullShareDelta ?? 0) * count;
    effects.bloodWeight += (apply.bloodWeight ?? 0) * count;
    if (apply.startDebtMul !== undefined) effects.startDebtMul *= apply.startDebtMul ** count;
    if (apply.debtGrowthMul !== undefined) effects.debtGrowthMul *= apply.debtGrowthMul ** count;
    if (apply.winMul !== undefined) effects.winMul *= apply.winMul ** count;
    if (apply.itemPriceMul !== undefined) effects.itemPriceMul *= apply.itemPriceMul ** count;
    if (apply.jackpotWinMul !== undefined) effects.jackpotWinMul *= apply.jackpotWinMul ** count;
    if (apply.shopPriceMul !== undefined) effects.shopPriceMul *= apply.shopPriceMul ** count;
    if (apply.ticketShareStart !== undefined) effects.ticketShareStart = Math.min(effects.ticketShareStart, apply.ticketShareStart);
    if (apply.debtForgiveEveryRuns !== undefined) {
      effects.debtForgiveEveryRuns = Math.max(effects.debtForgiveEveryRuns, apply.debtForgiveEveryRuns);
    }
    if (apply.insuranceShare !== undefined) effects.insuranceShare = Math.max(effects.insuranceShare, apply.insuranceShare);
    if (apply.freeSpinAfterFirstSkull) effects.freeSpinAfterFirstSkull = true;
    if (apply.deferOnce) effects.deferOnce = true;
    if (apply.hammerKeepsOnEmpty) effects.keepsHammerOnEmpty = true;
    if (apply.firstSocketFree) effects.firstSocketFree = true;
    if (apply.rareAmuletFirstShop) effects.rareAmuletFirstShop = true;
    if (apply.deathAmuletSave) effects.deathAmuletSave = true;
    if (apply.startJoker) effects.startJoker = true;
    if (apply.startSymbolPick) effects.startSymbolPick = true;
    if (apply.miniCasePriceMul !== undefined) effects.miniCasePriceMul *= apply.miniCasePriceMul ** count;
    if (apply.freeItemFirstShop) effects.freeItemFirstShop = true;
    if (apply.rewindKeepsStreak) effects.rewindKeepsStreak = true;
    if (apply.freeTape) effects.freeTape = true;
    if (apply.rewindRefundsTickets) effects.rewindRefundsTickets = true;
    if (apply.noMachineSwap) effects.noMachineSwap = true;
    if (apply.startMachinePick) effects.startMachinePick = true;
    if (apply.skullCancel) effects.skullCancelOnce = true;
  }
  return effects;
}

/** Есть ли ещё что предлагать: куплено всё — экран улучшений после смерти не показывается. */
export function upgradesLeft(purchased: PurchasedUpgrades): Upgrade[] {
  return UPGRADES.filter((upgrade) => leftToTake(upgrade, purchased) > 0);
}

/**
 * Три предложения после смерти: разные улучшения, которые ещё можно взять (как randomAmuletOffer).
 * Осталось меньше трёх — отдаём сколько есть: иначе последние улучшения пула стали бы недостижимы.
 * Совсем нечего — пустой список, и экран не показывается.
 */
export function upgradeOffers(purchased: PurchasedUpgrades, count = UPGRADE_OFFERS, random = Math.random): Upgrade[] {
  const pool = upgradesLeft(purchased);
  const offers: Upgrade[] = [];
  while (offers.length < count && pool.length > 0) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    offers.push(pool.splice(index, 1)[0]);
  }
  return offers;
}

/**
 * Прощается ли первый долг этого забега (№8): каждый N-й забег, считая с первого. 0 — улучшения нет,
 * мусор в номере — не прощаем (лучше обычный долг, чем неизвестное число).
 */
export function forgivesDebt(debtForgiveEveryRuns: number, runNumber: number): boolean {
  if (!(debtForgiveEveryRuns > 0) || !Number.isInteger(runNumber) || runNumber <= 0) return false;
  return runNumber % debtForgiveEveryRuns === 0;
}

/**
 * Билеты за долг, закрытый в раунде round (№17): обычный «билет за долг» плюс прибавка — но ровно в третьем раунде,
 * не в любом. Мусор в номере и в прибавке — прибавки нет (лучше обычный билет, чем непонятное число).
 */
export function roundDebtTickets(round: number, bonus: number): number {
  if (!Number.isInteger(round) || round !== UPGRADE_DEBT_TICKET_ROUND) return 0;
  return Number.isFinite(bonus) && bonus > 0 ? Math.floor(bonus) : 0;
}

/**
 * Тратится ли молот после прокрутки с итогом kind (№25): с улучшением прокрутка без выигрыша молот не тратит —
 * он ждёт следующей, где замку есть что блокировать. Черепа — тоже прокрутка с паттерном, молот тратится.
 */
export function keepsHammerAfter(kind: 'skull' | 'win' | 'nothing', keepsOnEmpty: boolean): boolean {
  return keepsOnEmpty && kind === 'nothing';
}

/**
 * Прибавка веса символов от улучшений (№23 клевер, №24 вишня, №35 кровь) — готовый объект для WeightContext.symbolBonus.
 * Другие символы сюда не попадают: вес двигают только эти три ручки.
 */
export function symbolWeightBonus(effects: UpgradeEffects): Partial<Record<string, number>> {
  const bonus: Partial<Record<string, number>> = {};
  if (effects.cloverWeight > 0) bonus.clover = effects.cloverWeight;
  if (effects.cherryWeight > 0) bonus.cherry = effects.cherryWeight;
  if (effects.bloodWeight > 0) bonus.blood = effects.bloodWeight;
  return bonus;
}

/**
 * Первая сетка забега с улучшениями №32 и №33: в ней есть джокер и выбранный игроком символ. Это именно первая
 * сетка раунда (не стартовая картинка до прокрутки), поэтому улучшение и работает. Уже выпавший символ второй раз
 * не подставляем — «в сетке есть», а не «всегда ровно один»: прокрутка могла сама дать джокера, и удваивать его
 * незачем. Если подставить некуда (сетка пустая — так не бывает, но защищаемся), возвращаем как было.
 */
export function startGridOf(grid: Grid, effects: UpgradeEffects, startSymbolId: string | null, random = Math.random): Grid {
  const result = grid.map((cells) => [...cells]);
  const used = new Set<string>(); // клетки, которые уже заменили: второй символ не должен затереть первого
  const freeCells = (): [number, number][] => {
    const cells: [number, number][] = [];
    result.forEach((line, row) => line.forEach((_cell, col) => {
      if (!used.has(`${row}:${col}`)) cells.push([row, col]);
    }));
    return cells;
  };
  const place = (symbol: Grid[number][number]): void => {
    if (result.some((line) => line.some((cell) => cell.id === symbol.id))) return; // уже есть — второй не нужен
    const cells = freeCells();
    if (cells.length === 0) return;
    const [row, col] = cells[Math.min(cells.length - 1, Math.floor(random() * cells.length))];
    used.add(`${row}:${col}`);
    result[row][col] = symbol;
  };
  if (effects.startJoker) place(JOKER);
  const chosen = startSymbolId === null ? undefined : SYMBOLS.find((symbol) => symbol.id === startSymbolId);
  if (chosen) place(chosen);
  return result;
}

/** Во сколько раз больше платит джекпот (№34): только он, обычные паттерны — 1. */
export function jackpotWinFactor(isJackpotHit: boolean, effects: UpgradeEffects): number {
  return isJackpotHit ? effects.jackpotWinMul : 1;
}

/**
 * Сколько амулетов прошлого забега можно взять на старте (шаг 38): один всегда, ещё один — с №30 «Амулет в памяти».
 * Одноразовость и место в гнёздах держит вызывающий (GameScene.chooseStartAmulet): больше свободных гнёзд не взять.
 * Сделка №34 даёт свою прибавку отдельно — это её число (MEMORY_PICKS_PACT), а не улучшения.
 */
export function memoryPickCount(effects: UpgradeEffects): number {
  return 1 + (effects.deathAmuletSave ? MEMORY_PICKS_UPGRADE : 0);
}

/** Целое ≥ 0 из любого числа: мусор (NaN, ∞, минус, дроби) не должен ломать ни билеты, ни серию. */
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// ---------- Четвёртая партия (28г): кассета и прочее ----------

/**
 * №42 «Откат не сбрасывает серию»: после отката кассетой остаётся большая из двух серий — записанной на плёнку
 * и той, что накопилась до отката. Так перемотка не отнимает заработанный множитель, а состояние дальше берётся
 * с записи. Без улучшения — ровно как на плёнке.
 */
export function streakAfterRewind(recordStreak: number, currentStreak: number, keeps: boolean): number {
  const back = safeCount(recordStreak);
  return keeps ? Math.max(back, safeCount(currentStreak)) : back;
}

/** №44 «Кассета в магазине бесплатна»: цена кассеты в билетах — 0, когда улучшение взято. */
export function tapePriceAfter(price: number, free: boolean): number {
  return free ? 0 : safeCount(price);
}

/**
 * №45 «Откат возвращает билеты, потраченные после записи»: к снимку с плёнки прибавляются билеты, ушедшие после
 * записи (амулет, гнездо, кассета). Больше потраченного не начисляем — потраченное и есть наша прибавка, поэтому
 * дважды одни и те же билеты не вернуть: счётчик обнуляется вместе с откатом (сцена перезапускается).
 */
export function ticketsAfterRewind(recordTickets: number, spentSinceRecord: number, refunds: boolean): number {
  const back = safeCount(recordTickets);
  return refunds ? back + safeCount(spentSinceRecord) : back;
}

/** №46 «Рекорд даёт +5% к стартовым фишкам»: удалено шагом 38 (`DONTLIKE.md` п.10) — ломало баланс. */

/** №47 «Каждая ачивка даёт по билету раз в забег»: удалено шагом 38 (`DONTLIKE.md` п.1) — билетов за ачивки нет. */

/** №50 «Один раз за забег можно отменить череп»: улучшение взято и в этом забеге ещё не тратили. */
export function skullCancelAllowed(effects: UpgradeEffects, used: boolean): boolean {
  return effects.skullCancelOnce && !used;
}

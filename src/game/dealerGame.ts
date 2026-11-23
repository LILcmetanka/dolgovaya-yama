import { INSURANCE_SHARE } from './amulets';
import type { Words } from './lang';
import { LOW_PATTERN_MULTIPLIER, TOP_MULTIPLIER, type Pattern } from './patterns';
import { DEBT_ROUND_TO, debtForRound, isPaying, isUnlocked, JOKER, skullShare, streakAfterSkull, SYMBOLS, type Grid, type SlotSymbol } from './rules';

/**
 * Сделка Дилера (решение автора 15.11.2026, QUESTIONS.md): на экране выпал кубик 🎲 — Дилер кладёт на сукно
 * три карты-сделки. В каждой две строки: что получаешь и чем платишь. Игрок берёт одну сделку или отказывается.
 * Сделки — связки из DONTLIKE.md «20 связок» (ответ автора: 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 20).
 * Шаг 9 — каркас и три связки: №6 «билеты / магазин закрыт», №19 «раунд без черепов», №20 «шаг ×2 / череп в ×1».
 * Шаг 10 — ещё три: №4 «тише черепа / потолок серии», №14 «мягкий череп / −1 прокрутка», №17 «выигрыш +25% / черепа навсегда».
 * Шаг 11 — пять: №2 «−20% цен / долг +8%», №5 «страховка 100% / каждая копия вдвое дороже»,
 * №7 «вес джекпота +50% / вес чёрных паттернов +1», №11 «выбранный символ +2 веса / остальным −0,5», №12 «долг −10% / +20%».
 * Шаг 11, партия Б — ещё пять: №8 «смена автомата отложена / черепа +2 п.п. навсегда»,
 * №10 «первый череп не жжёт кон / кон не идёт в цель»,
 * №13 «бесплатный амулет / −2 места в столбике», №15 «забрать дважды / второе забирание дешевле на 20%».
 * №9 «ещё один запас прощения» удалена целиком 22.11.2026 (шаг 33, решение автора); прощение провала
 * убрано шагом 34 — провал спасения сразу кончает забег. В пуле осталось 15 карт.
 * Остальные связки автора добавляются так же: поле в PactEffects и ветка в pactEffects + карта в PACTS.
 * Сделка живёт на кассете как запись { id, untilRound, symbol? } — сколько раундов действует, столько и лежит.
 * Без Phaser — только числа и маленькие функции.
 */

export type PactId =
  | 'tickets-shop' | 'quiet-round' | 'double-step'
  | 'skull-calm' | 'soft-skull' | 'price-up'
  | 'cheap-shop' | 'full-insurance' | 'jackpot-weight' | 'symbol-weight' | 'debt-cut'
  | 'machine-delay' | 'safe-bank' | 'free-amulet' | 'double-take'
  // Шаг 30: DONTLIKE.md §2 (37 карт из 44; №31, 37, 41 — дубли уже принятых, №42, 47, 49, 50 — без механики, см. QUESTIONS.md)
  | 'spin-plus' | 'spin-cap' | 'empty-spin'
  | 'calm-win' | 'half-step' | 'skull-growth' | 'skull-cap'
  | 'win-debt' | 'jackpot-double' | 'cherry-double' | 'step-two'
  | 'amulet-half' | 'ticket-gift' | 'interest-win' | 'insurance-free'
  | 'pot-start' | 'piggy-lock' | 'skull-refund' | 'pot-safe-double' | 'chips-start'
  | 'free-item' | 'item-cheap' | 'two-slots' | 'joker-slot'
  | 'amulet-copy' | 'socket-gift' | 'amulet-save' | 'rare-only'
  | 'symbol-run' | 'machine-pick' | 'joker-center' | 'blood-round'
  | 'debt-defer' | 'debt-freeze' | 'debt-tickets'
  | 'win-double-risk' | 'take-streak';

/** Карта-сделка: id, сколько раундов живёт и две строки на карте — баф зелёным, дебаф красным. */
export interface PactSpec {
  id: PactId;
  rounds: number; // сколько раундов действует, считая раунд, в котором взяли (PACT_LAST_ROUNDS — до конца забега)
  bonus: Words; // «получаешь» — зелёная строка на карте
  cost: Words; // «платишь» — красная строка на карте
  needsSymbol?: boolean; // №11: прежде чем взять, игрок выбирает символ (ряд кнопок на сукне)
  needsMachine?: boolean; // №38: прежде чем взять, игрок выбирает автомат (три кнопки на сукне)
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
  // ---------- Шаг 30: DONTLIKE.md §2 ----------
  spinCapDelta: number; // №2: +N к потолку прокруток раунда
  spinCapValue: number; // №10: потолок прокруток ровно N (0 — не задан, работает обычный)
  skullSpinCost: number; // №2: столько прокруток отнимает каждый паттерн из черепов
  emptySpinSpins: number; // №5: столько прокруток даёт прокрутка без выигрыша (как копилка, но в прокрутках)
  skullShareMax: number; // №10: доля черепов не выше этого (Infinity — без потолка)
  skullHalfStep: boolean; // №7: череп снимает полступени, а не треть серии
  streakStepBonus: number; // №15: шаг множителя серии больше на столько
  skullDropSteps: number; // №15: череп снимает столько ступеней серии
  jackpotWinMul: number; // №12: во сколько раз больше платит только джекпот-паттерн
  symbolWeightMul: Partial<Record<string, number>>; // №14: множители веса символов (вишни реже вдвое)
  symbolPayMul: Partial<Record<string, number>>; // №14: множители выплаты символов (вишни платят вдвое)
  skullUnblockable: boolean; // №46: щит и бронежилет черепа не отбивают
  ticketChipsMul: number; // №18: во сколько раз дороже билеты за фишки
  amuletPriceMul: number; // №17: множитель цен амулетов
  amuletPriceAdd: number; // №32: столько билетов прибавляется к цене каждого амулета
  amuletCopiesDouble: boolean; // №17: каждая следующая копия любого амулета вдвое дороже
  amuletFreeInsurance: boolean; // №20: страховка в витрине стоит 0 билетов
  insuranceMaxOne: boolean; // №20: страховку можно держать только одну
  amuletDeathSave: boolean; // №34: один амулет не сгорает при смерти (как улучшение №30)
  amuletsClosed: boolean; // №33: в этом забеге амулеты не продаются
  rareAmuletForced: boolean; // №35: в витрине всегда есть редкий амулет
  amuletPerShop: number; // №35: столько амулетов в витрине за магазин (0 — обычное число)
  interestBonus: number; // №19: прибавка к «Процентам» на остаток
  piggyBonus: number; // №22: прибавка к фишкам копилки за прокрутку (сама копилка — амулет)
  potStart: number; // №21: столько фишек лежит на коне в начале каждого раунда сделки
  noTake: boolean; // №22: кон нельзя забрать руками, только сам в конце раунда
  takeOncePerRound: boolean; // №23: забрать кон можно один раз за раунд
  skullPotRefund: number; // №23: такая доля сгоревшего кона возвращается на табло без страховки
  potSafeFirst: boolean; // №24: первый череп в раунде кон не жжёт
  skullDoubleBurn: boolean; // №24: череп после пощажённого сжигает вдвое (пот и столько же с табло)
  itemPriceMul: number; // №27: множитель цен предметов
  itemOfferDelta: number; // №27: на столько меньше/больше предметов в витрине
  shelfSlotsDelta: number; // №26/28/30: на столько мест на полке больше (+) или меньше (−)
  jokerCenter: boolean; // №39: в центре каждой сетки джокер
  bloodFirstSpin: boolean; // №40: первая прокрутка раунда кровавая
  debtDefer: boolean; // №43: раз за забег долг можно отложить на раунд
  debtNoGrowth: boolean; // №44: долг следующего раунда не растёт
  debtTicketsHalf: boolean; // №45: половину долга можно закрыть билетами
  doubleTakeShare: number; // №48: какую долю первого забирания отдаёт второе (у №15 — DOUBLE_TAKE_SHARE)
  takeStreakReset: boolean; // №48: после первого забирания серия сбрасывается в ноль
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

// ---------- Связки шага 30: DONTLIKE.md §2 (одобрены все, кроме №3, 4, 8, 13, 16, 29) ----------
// Карты, у которых эффект живёт на раунд, складываются в PactEffects. Разовые выдачи (билет, долг, предмет,
// амулет, гнездо, автомат) сцена и симулятор делают в момент взятия — у них числа тоже отсюда.
/** №1: +1 прокрутка в раунде, черепа чаще на 1 п.п. */
export const SPIN_PLUS_SPINS = 1;
export const SPIN_PLUS_SKULL_DELTA = 0.01;
export const SPIN_PLUS_ROUNDS = 3;
/** №2: +2 к потолку прокруток, каждый череп отнимает 1 прокрутку. */
export const SPIN_CAP_BONUS = 2;
export const SPIN_CAP_SKULL_SPINS = 1;
export const SPIN_CAP_ROUNDS = 3;
/** №5: +1 прокрутка за пустой кон (прокрутку без выигрыша), долг следующего раунда +10%. */
export const EMPTY_SPIN_SPINS = 1;
export const EMPTY_SPIN_DEBT_MUL = 1.1;
export const EMPTY_SPIN_ROUNDS = 3;
/** №6: черепа реже на 3 п.п. два раунда, выигрыш −10%. */
export const CALM_WIN_SKULL_DELTA = -0.03;
export const CALM_WIN_MUL = 0.9;
export const CALM_WIN_ROUNDS = 2;
/** №7: череп снимает полступени серии, билетов −1 разово. */
export const HALF_STEP_ROUNDS = 3;
export const HALF_STEP_TICKETS = 1;
/** №9: первые три раунда сделки черепа не растут, на пятом рост вдвое (одна лишняя ступень роста доли). */
export const SKULL_GROWTH_ROUNDS = 5;
/** №10: доля черепов не выше 25%, потолок прокруток 10. */
export const SKULL_CAP_SHARE = 0.25;
export const SKULL_CAP_SPINS = 10;
export const SKULL_CAP_ROUNDS = 3;
/** №11: паттерны +20%, долг +8% разово. */
export const WIN_DEBT_WIN = 1.2;
export const WIN_DEBT_MUL = 1.08;
export const WIN_DEBT_ROUNDS = 3;
/** №12: джекпот платит вдвое больше, но выпадает вдвое реже. */
export const JACKPOT_DOUBLE_WIN = 2;
export const JACKPOT_DOUBLE_WEIGHT = 0.5;
export const JACKPOT_DOUBLE_ROUNDS = 3;
/** №14: вишни платят вдвое больше, но выпадают вдвое реже. */
export const CHERRY_PAY_MUL = 2;
export const CHERRY_WEIGHT_MUL = 0.5;
export const CHERRY_ROUNDS = 3;
/** №15: шаг множителя +1, череп роняет серию на две ступени. */
export const STEP_TWO_BONUS = 1;
export const STEP_TWO_SKULL_STEPS = 2;
export const STEP_TWO_ROUNDS = 3;
/** №17: амулет за полцены, вторая копия любого амулета вдвое дороже. */
export const AMULET_HALF_PRICE = 0.5;
export const AMULET_HALF_COPY_MUL = 2;
export const AMULET_HALF_ROUNDS = 3;
/** №18: билет в подарок, билеты за фишки дороже на 20%. */
export const TICKET_GIFT_CHIPS_MUL = 1.2;
export const TICKET_GIFT_ROUNDS = 3;
/** №19: проценты +10% на раунд, выигрыш −15%. */
export const INTEREST_WIN_BONUS = 0.1;
export const INTEREST_WIN_MUL = 0.85;
export const INTEREST_WIN_ROUNDS = 3;
/** №20: страховка бесплатно, но одна на забег (до конца забега). */
export const INSURANCE_FREE_ROUNDS = PACT_LAST_ROUNDS;
/** №21: стартовый кон 150 фишек, долг следующего раунда +15%. */
export const POT_START_CHIPS = 150;
export const POT_START_DEBT_MUL = 1.15;
export const POT_START_ROUNDS = 3;
/** №22: копилка +2 за прокрутку, но кон нельзя забрать руками — только в конце раунда. */
export const PIGGY_LOCK_BONUS = 2;
export const PIGGY_LOCK_ROUNDS = 3;
/** №23: череп возвращает 50% кона на табло, забрать кон можно только раз в раунд. */
export const SKULL_REFUND_SHARE = 0.5;
export const SKULL_REFUND_ROUNDS = 3;
/** №24: первый череп кон не жжёт, следующий сжигает вдвое (пот и столько же с табло). */
export const POT_SAFE_DOUBLE_ROUNDS = 3;
/** №25: старт с 100 фишками, стартовый долг +10% (разово). */
export const CHIPS_START_CHIPS = 100;
export const CHIPS_START_DEBT_MUL = 1.1;
/** №26: бесплатный предмет, −1 место на полке три раунда. */
export const FREE_ITEM_SHELF = -1;
export const FREE_ITEM_ROUNDS = 3;
/** №27: предметы −20%, в витрине на один предмет меньше. */
export const ITEM_CHEAP_MUL = 0.8;
export const ITEM_CHEAP_OFFER = -1;
export const ITEM_CHEAP_ROUNDS = 3;
/** №28: +2 места на полке, черепа чаще на 2 п.п. */
export const TWO_SLOTS_BONUS = 2;
export const TWO_SLOTS_SKULL_DELTA = 0.02;
export const TWO_SLOTS_ROUNDS = 3;
/** №30: джокер в подарок (предмет «подмена»), −1 место на полке. */
export const JOKER_SLOT_SHELF = -1;
export const JOKER_SLOT_ROUNDS = 3;
/** №32: копия любого амулета бесплатно, все амулеты дороже на 1 билет. */
export const AMULET_COPY_PRICE_ADD = 1;
export const AMULET_COPY_ROUNDS = 3;
/** №33: гнездо в подарок, амулеты в этом забеге не продаются. */
export const SOCKET_GIFT_ROUNDS = PACT_LAST_ROUNDS;
/** №34: амулет не сгорает при смерти раз, но следующий купленный сгорает сразу. */
export const AMULET_SAVE_ROUNDS = PACT_LAST_ROUNDS;
/** №35: редкий амулет в витрине, но только один амулет за магазин. */
export const RARE_ONLY_AMULETS = 1;
export const RARE_ONLY_ROUNDS = 3;
/** №36: выбранный символ +2 веса, остальным −0,5 — до конца забега (у старой карты №11 те же числа на 2 раунда). */
export const SYMBOL_RUN_ROUNDS = PACT_LAST_ROUNDS;
/** №38: автомат сразу меняется на выбранный, скидка магазина −10%. */
export const MACHINE_PICK_DISCOUNT = 0.9;
export const MACHINE_PICK_ROUNDS = 3;
/** №39: джокер в центре каждой сетки, выигрыш −10%. */
export const JOKER_CENTER_WIN = 0.9;
export const JOKER_CENTER_ROUNDS = 3;
/** №40: кровавая прокрутка гарантирована раз в раунд, черепа чаще на 2 п.п. */
export const BLOOD_FIRST_SKULL_DELTA = 0.02;
export const BLOOD_FIRST_ROUNDS = 3;
/** №43: отсрочка на раунд, долг +25%. */
export const DEBT_DEFER_COST_MUL = 1.25;
/** №44: долг не растёт в этом раунде, следующий растёт вдвое. */
export const DEBT_FREEZE_NEXT_MUL = 2;
/** №45: половину долга можно заплатить билетами, билетов −2. Разово −2 билета, правило — на три раунда. */
export const DEBT_TICKETS_OFF = 2;
export const DEBT_TICKETS_SHARE = 0.5;
export const DEBT_TICKETS_PER_TICKET = 0.1; // один билет закрывает 10% долга, половина — не больше пяти билетов
export const DEBT_TICKETS_ROUNDS = 3;
/** №46: выигрыш ×2, но череп не отбивается щитом/бронежилетом — кон сгорает всегда. */
export const WIN_DOUBLE = 2;
export const WIN_DOUBLE_ROUNDS = 3;
/** №48: второе забирание отдаёт весь кон, но серия сбрасывается до нуля. */
export const TAKE_STREAK_ROUNDS = 3;

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
  // ---------- Шаг 30: 37 карт из DONTLIKE.md §2 ----------
  {
    id: 'spin-plus',
    rounds: SPIN_PLUS_ROUNDS,
    bonus: { ru: `+${SPIN_PLUS_SPINS} прокрутка в раунде`, en: `+${SPIN_PLUS_SPINS} spin per round` },
    cost: {
      ru: `черепа чаще на ${cardNum(SPIN_PLUS_SKULL_DELTA * 100, false)}%`,
      en: `skulls ${cardNum(SPIN_PLUS_SKULL_DELTA * 100, true)}% more often`,
    },
  },
  {
    id: 'spin-cap',
    rounds: SPIN_CAP_ROUNDS,
    bonus: { ru: `+${SPIN_CAP_BONUS} к потолку прокруток`, en: `+${SPIN_CAP_BONUS} spin cap` },
    cost: {
      ru: `каждый череп −${SPIN_CAP_SKULL_SPINS} прокрутка`,
      en: `each skull −${SPIN_CAP_SKULL_SPINS} spin`,
    },
  },
  {
    id: 'empty-spin',
    rounds: EMPTY_SPIN_ROUNDS,
    bonus: { ru: `+${EMPTY_SPIN_SPINS} прокрутка за пустой кон`, en: `+${EMPTY_SPIN_SPINS} spin for an empty pot` },
    cost: {
      ru: `долг следующего раунда +${cardNum((EMPTY_SPIN_DEBT_MUL - 1) * 100, false)}%`,
      en: `next round debt +${cardNum((EMPTY_SPIN_DEBT_MUL - 1) * 100, true)}%`,
    },
  },
  {
    id: 'calm-win',
    rounds: CALM_WIN_ROUNDS,
    bonus: {
      ru: `черепа реже на ${cardNum(-CALM_WIN_SKULL_DELTA * 100, false)}%`,
      en: `skulls ${cardNum(-CALM_WIN_SKULL_DELTA * 100, true)}% rarer`,
    },
    cost: {
      ru: `выигрыш −${cardNum((1 - CALM_WIN_MUL) * 100, false)}%`,
      en: `wins −${cardNum((1 - CALM_WIN_MUL) * 100, true)}%`,
    },
  },
  {
    id: 'half-step',
    rounds: HALF_STEP_ROUNDS,
    bonus: { ru: 'череп снимает полступени', en: 'a skull costs half a step' },
    cost: { ru: `билетов −${HALF_STEP_TICKETS} сразу`, en: `−${HALF_STEP_TICKETS} ticket right away` },
  },
  {
    id: 'skull-growth',
    rounds: SKULL_GROWTH_ROUNDS,
    bonus: { ru: `черепа не растут ${SKULL_GROWTH_ROUNDS - 2} раунда`, en: `skulls stay flat for ${SKULL_GROWTH_ROUNDS - 2} rounds` },
    cost: { ru: 'на пятом раунде растут вдвое', en: 'they grow twice as fast in round five' },
  },
  {
    id: 'skull-cap',
    rounds: SKULL_CAP_ROUNDS,
    bonus: {
      ru: `доля черепов не выше ${cardNum(SKULL_CAP_SHARE * 100, false)}%`,
      en: `skull share at most ${cardNum(SKULL_CAP_SHARE * 100, true)}%`,
    },
    cost: { ru: `потолок прокруток ${SKULL_CAP_SPINS}`, en: `spin cap ${SKULL_CAP_SPINS}` },
  },
  {
    id: 'win-debt',
    rounds: WIN_DEBT_ROUNDS,
    bonus: {
      ru: `паттерны +${cardNum((WIN_DEBT_WIN - 1) * 100, false)}%`,
      en: `patterns +${cardNum((WIN_DEBT_WIN - 1) * 100, true)}%`,
    },
    cost: {
      ru: `долг +${cardNum((WIN_DEBT_MUL - 1) * 100, false)}% разово`,
      en: `debt +${cardNum((WIN_DEBT_MUL - 1) * 100, true)}% once`,
    },
  },
  {
    id: 'jackpot-double',
    rounds: JACKPOT_DOUBLE_ROUNDS,
    bonus: {
      ru: `джекпот +${cardNum((JACKPOT_DOUBLE_WIN - 1) * 100, false)}%`,
      en: `jackpot +${cardNum((JACKPOT_DOUBLE_WIN - 1) * 100, true)}%`,
    },
    cost: { ru: 'джекпот реже вдвое', en: 'jackpot twice as rare' },
  },
  {
    id: 'cherry-double',
    rounds: CHERRY_ROUNDS,
    bonus: { ru: 'вишни платят ×2', en: 'cherries pay ×2' },
    cost: { ru: 'вишни реже вдвое', en: 'cherries twice as rare' },
  },
  {
    id: 'step-two',
    rounds: STEP_TWO_ROUNDS,
    bonus: { ru: 'шаг серии +1', en: 'streak step +1' },
    cost: { ru: `череп роняет на ${STEP_TWO_SKULL_STEPS} ступени`, en: `a skull drops ${STEP_TWO_SKULL_STEPS} steps` },
  },
  {
    id: 'amulet-half',
    rounds: AMULET_HALF_ROUNDS,
    bonus: { ru: 'амулет за полцены', en: 'amulets at half price' },
    cost: { ru: 'вторая копия дороже вдвое', en: 'a second copy costs double' },
  },
  {
    id: 'ticket-gift',
    rounds: TICKET_GIFT_ROUNDS,
    bonus: { ru: '+1 билет сразу', en: '+1 ticket right away' },
    cost: {
      ru: `билеты за фишки дороже на ${cardNum((TICKET_GIFT_CHIPS_MUL - 1) * 100, false)}%`,
      en: `tickets for chips +${cardNum((TICKET_GIFT_CHIPS_MUL - 1) * 100, true)}%`,
    },
  },
  {
    id: 'interest-win',
    rounds: INTEREST_WIN_ROUNDS,
    bonus: {
      ru: `проценты +${cardNum(INTEREST_WIN_BONUS * 100, false)}% на раунд`,
      en: `interest +${cardNum(INTEREST_WIN_BONUS * 100, true)}% per round`,
    },
    cost: {
      ru: `выигрыш −${cardNum((1 - INTEREST_WIN_MUL) * 100, false)}%`,
      en: `wins −${cardNum((1 - INTEREST_WIN_MUL) * 100, true)}%`,
    },
  },
  {
    id: 'insurance-free',
    rounds: INSURANCE_FREE_ROUNDS,
    bonus: { ru: 'страховка бесплатно', en: 'insurance is free' },
    cost: { ru: 'страховка одна на забег', en: 'only one insurance per run' },
  },
  {
    id: 'pot-start',
    rounds: POT_START_ROUNDS,
    bonus: { ru: `стартовый кон ${POT_START_CHIPS} фишек`, en: `${POT_START_CHIPS} chips in the pot at round start` },
    cost: {
      ru: `долг следующего раунда +${cardNum((POT_START_DEBT_MUL - 1) * 100, false)}%`,
      en: `next round debt +${cardNum((POT_START_DEBT_MUL - 1) * 100, true)}%`,
    },
  },
  {
    id: 'piggy-lock',
    rounds: PIGGY_LOCK_ROUNDS,
    bonus: { ru: `копилка +${PIGGY_LOCK_BONUS} за прокрутку`, en: `piggy bank +${PIGGY_LOCK_BONUS} per spin` },
    cost: { ru: 'кон нельзя забрать руками', en: 'the pot cannot be taken by hand' },
  },
  {
    id: 'skull-refund',
    rounds: SKULL_REFUND_ROUNDS,
    bonus: {
      ru: `череп возвращает ${cardNum(SKULL_REFUND_SHARE * 100, false)}% кона`,
      en: `a skull returns ${cardNum(SKULL_REFUND_SHARE * 100, true)}% of the pot`,
    },
    cost: { ru: 'забрать кон можно раз в раунд', en: 'take the pot once per round' },
  },
  {
    id: 'pot-safe-double',
    rounds: POT_SAFE_DOUBLE_ROUNDS,
    bonus: { ru: 'первый череп не жжёт кон', en: 'the first skull spares the pot' },
    cost: { ru: 'следующий череп сжигает вдвое', en: 'the next skull burns double' },
  },
  {
    id: 'chips-start',
    rounds: 1,
    bonus: { ru: `сразу +${CHIPS_START_CHIPS} фишек`, en: `+${CHIPS_START_CHIPS} chips right away` },
    cost: {
      ru: `долг +${cardNum((CHIPS_START_DEBT_MUL - 1) * 100, false)}% сразу`,
      en: `debt +${cardNum((CHIPS_START_DEBT_MUL - 1) * 100, true)}% right away`,
    },
  },
  {
    id: 'free-item',
    rounds: FREE_ITEM_ROUNDS,
    bonus: { ru: 'бесплатный предмет на полку', en: 'a free item on the shelf' },
    cost: {
      ru: `мест на полке −${-FREE_ITEM_SHELF} на ${FREE_ITEM_ROUNDS} раунда`,
      en: `−${-FREE_ITEM_SHELF} shelf slot for ${FREE_ITEM_ROUNDS} rounds`,
    },
  },
  {
    id: 'item-cheap',
    rounds: ITEM_CHEAP_ROUNDS,
    bonus: {
      ru: `предметы −${cardNum((1 - ITEM_CHEAP_MUL) * 100, false)}%`,
      en: `items −${cardNum((1 - ITEM_CHEAP_MUL) * 100, true)}%`,
    },
    cost: {
      ru: `в витрине на ${-ITEM_CHEAP_OFFER} предмет меньше`,
      en: `${-ITEM_CHEAP_OFFER} item fewer in the window`,
    },
  },
  {
    id: 'two-slots',
    rounds: TWO_SLOTS_ROUNDS,
    bonus: { ru: `+${TWO_SLOTS_BONUS} места на полке`, en: `+${TWO_SLOTS_BONUS} shelf slots` },
    cost: {
      ru: `черепа чаще на ${cardNum(TWO_SLOTS_SKULL_DELTA * 100, false)}%`,
      en: `skulls ${cardNum(TWO_SLOTS_SKULL_DELTA * 100, true)}% more often`,
    },
  },
  {
    id: 'joker-slot',
    rounds: JOKER_SLOT_ROUNDS,
    bonus: { ru: 'джокер в подарок', en: 'a free joker' },
    cost: {
      ru: `джокер занимает ${-JOKER_SLOT_SHELF} место полки`,
      en: `the joker takes ${-JOKER_SLOT_SHELF} shelf slot`,
    },
  },
  {
    id: 'amulet-copy',
    rounds: AMULET_COPY_ROUNDS,
    bonus: { ru: 'копия любого амулета', en: 'a copy of any amulet' },
    cost: { ru: `все амулеты дороже на ${AMULET_COPY_PRICE_ADD}`, en: `all amulets cost ${AMULET_COPY_PRICE_ADD} more` },
  },
  {
    id: 'socket-gift',
    rounds: SOCKET_GIFT_ROUNDS,
    bonus: { ru: 'гнездо в подарок', en: 'a free socket' },
    cost: { ru: 'в этом забеге амулеты не продаются', en: 'no amulets are sold this run' },
  },
  {
    id: 'amulet-save',
    rounds: AMULET_SAVE_ROUNDS,
    bonus: { ru: 'амулет не сгорает при смерти', en: 'one amulet survives death' },
    cost: { ru: 'следующий амулет сгорает сразу', en: 'the next amulet burns at once' },
  },
  {
    id: 'rare-only',
    rounds: RARE_ONLY_ROUNDS,
    bonus: { ru: 'в витрине редкий амулет', en: 'a rare amulet in the window' },
    cost: { ru: `только ${RARE_ONLY_AMULETS} амулет за магазин`, en: `only ${RARE_ONLY_AMULETS} amulet per shop` },
  },
  {
    id: 'symbol-run',
    rounds: SYMBOL_RUN_ROUNDS,
    needsSymbol: true,
    bonus: {
      ru: `выбранный символ +${cardNum(SYMBOL_LUCK_PLUS, false)} веса до конца забега`,
      en: `chosen symbol +${cardNum(SYMBOL_LUCK_PLUS, true)} weight until the run ends`,
    },
    cost: {
      ru: `остальным −${cardNum(SYMBOL_LUCK_MINUS, false)} веса`,
      en: `others −${cardNum(SYMBOL_LUCK_MINUS, true)} weight`,
    },
  },
  {
    id: 'machine-pick',
    rounds: MACHINE_PICK_ROUNDS,
    needsMachine: true,
    bonus: { ru: 'автомат меняется на выбранный', en: 'the machine switches to your choice' },
    cost: {
      ru: `скидка магазина −${cardNum((1 - MACHINE_PICK_DISCOUNT) * 100, false)}%`,
      en: `shop discount −${cardNum((1 - MACHINE_PICK_DISCOUNT) * 100, true)}%`,
    },
  },
  {
    id: 'joker-center',
    rounds: JOKER_CENTER_ROUNDS,
    bonus: { ru: 'джокер в центре каждой сетки', en: 'a joker in the centre of every grid' },
    cost: {
      ru: `выигрыш −${cardNum((1 - JOKER_CENTER_WIN) * 100, false)}%`,
      en: `wins −${cardNum((1 - JOKER_CENTER_WIN) * 100, true)}%`,
    },
  },
  {
    id: 'blood-round',
    rounds: BLOOD_FIRST_ROUNDS,
    bonus: { ru: 'кровавая прокрутка раз в раунд', en: 'one bloody spin per round' },
    cost: {
      ru: `черепа чаще на ${cardNum(BLOOD_FIRST_SKULL_DELTA * 100, false)}%`,
      en: `skulls ${cardNum(BLOOD_FIRST_SKULL_DELTA * 100, true)}% more often`,
    },
  },
  {
    id: 'debt-defer',
    rounds: PACT_LAST_ROUNDS,
    bonus: { ru: 'отсрочка долга на раунд', en: 'defer the debt one round' },
    cost: {
      ru: `долг +${cardNum((DEBT_DEFER_COST_MUL - 1) * 100, false)}%`,
      en: `debt +${cardNum((DEBT_DEFER_COST_MUL - 1) * 100, true)}%`,
    },
  },
  {
    id: 'debt-freeze',
    rounds: 1,
    bonus: { ru: 'долг не растёт в этом раунде', en: 'the debt does not grow this round' },
    cost: { ru: `следующий растёт ×${DEBT_FREEZE_NEXT_MUL}`, en: `the next one grows ×${DEBT_FREEZE_NEXT_MUL}` },
  },
  {
    id: 'debt-tickets',
    rounds: DEBT_TICKETS_ROUNDS,
    bonus: {
      ru: `половину долга можно закрыть билетами`,
      en: `half the debt can be paid with tickets`,
    },
    cost: { ru: `билетов −${DEBT_TICKETS_OFF} сразу`, en: `−${DEBT_TICKETS_OFF} tickets right away` },
  },
  {
    id: 'win-double-risk',
    rounds: WIN_DOUBLE_ROUNDS,
    bonus: { ru: `выигрыш ×${WIN_DOUBLE}`, en: `wins ×${WIN_DOUBLE}` },
    cost: { ru: 'при черепе кон сгорает всегда', en: 'a skull always burns the pot' },
  },
  {
    id: 'take-streak',
    rounds: TAKE_STREAK_ROUNDS,
    bonus: { ru: 'второе забирание кона', en: 'a second take' },
    cost: { ru: 'серия сбрасывается', en: 'the streak resets' },
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
 * Брали ли сделку id в этом забеге — хоть она ещё действует, хоть уже кончилась (DONTLIKE п.9: «если ты брал,
 * то снова можешь это взять — оно не убирается»). Список pacts — память забега: взятая сделка остаётся в нём
 * и после своего последнего раунда, кассета её возвращает вместе с забегом. Поэтому такой карты Дилер больше
 * не кладёт на сукно до конца забега, а не только пока она жива.
 */
export function pactAlreadyTaken(pacts: readonly Pact[], id: PactId): boolean {
  return pacts.some((pact) => pact.id === id);
}

/**
 * Сдвинуть сроки сделок на delta раундов: сделка живёт не «до номера раунда», а столько раундов, сколько их реально
 * сыграно. В игре функцию больше никто не зовёт — счёт раундов в спасении не откатывается (раунд переигрывается тем же
 * номером, CollectorScene.winRescue/failRescue передают его магазину), поэтому сроки сделок и не сдвигаются.
 * Живёт для `dealer-sim.mjs` (и старых сценариев с откатом счёта): без сдвига откат спрятал бы сделку
 * (firstRoundOf > round), и закрытый магазин открылся бы. Сроки, ушедшие за нулевой раунд, снимаются.
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
    // Шаг 30: нейтральные числа карт третьей партии
    spinCapDelta: 0,
    spinCapValue: 0,
    skullSpinCost: 0,
    emptySpinSpins: 0,
    skullShareMax: Number.POSITIVE_INFINITY,
    skullHalfStep: false,
    streakStepBonus: 0,
    skullDropSteps: 0,
    jackpotWinMul: 1,
    symbolWeightMul: {},
    symbolPayMul: {},
    skullUnblockable: false,
    ticketChipsMul: 1,
    amuletPriceMul: 1,
    amuletPriceAdd: 0,
    amuletCopiesDouble: false,
    amuletFreeInsurance: false,
    insuranceMaxOne: false,
    amuletDeathSave: false,
    amuletsClosed: false,
    rareAmuletForced: false,
    amuletPerShop: 0,
    interestBonus: 0,
    piggyBonus: 0,
    potStart: 0,
    noTake: false,
    takeOncePerRound: false,
    skullPotRefund: 0,
    potSafeFirst: false,
    skullDoubleBurn: false,
    itemPriceMul: 1,
    itemOfferDelta: 0,
    shelfSlotsDelta: 0,
    jokerCenter: false,
    bloodFirstSpin: false,
    debtDefer: false,
    debtNoGrowth: false,
    debtTicketsHalf: false,
    doubleTakeShare: DOUBLE_TAKE_SHARE,
    takeStreakReset: false,
  };
  for (const pact of pacts) {
    if (!isPactId(pact.id)) continue; // чужая запись с кассеты не роняет эффекты
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
      // ---------- Шаг 30 ----------
      case 'spin-plus':
        effects.spinsDelta += SPIN_PLUS_SPINS;
        effects.skullShareDelta += SPIN_PLUS_SKULL_DELTA;
        break;
      case 'spin-cap':
        effects.spinCapDelta += SPIN_CAP_BONUS;
        effects.skullSpinCost += SPIN_CAP_SKULL_SPINS;
        break;
      case 'empty-spin':
        effects.emptySpinSpins += EMPTY_SPIN_SPINS;
        break;
      case 'calm-win':
        effects.skullShareDelta += CALM_WIN_SKULL_DELTA;
        effects.winMul *= CALM_WIN_MUL;
        break;
      case 'half-step':
        effects.skullHalfStep = true;
        break;
      case 'skull-growth': {
        // Сделка считает раунды от взятия: первые три доля стоит на месте (как в раунде взятия),
        // на пятом раунде рост вдвое — одна лишняя ступень роста (GAME_CONFIG.skullShareGrowth = 1 п.п.).
        const elapsed = Math.max(0, round - firstRoundOf(pact));
        if (elapsed <= 2) effects.skullShareDelta += skullShare(firstRoundOf(pact)) - skullShare(round);
        else if (elapsed === SKULL_GROWTH_ROUNDS - 1) effects.skullShareDelta += skullShare(round) - skullShare(round - 1);
        break;
      }
      case 'skull-cap':
        effects.skullShareMax = Math.min(effects.skullShareMax, SKULL_CAP_SHARE);
        effects.spinCapValue = SKULL_CAP_SPINS;
        break;
      case 'win-debt':
        effects.winMul *= WIN_DEBT_WIN;
        break;
      case 'jackpot-double':
        effects.jackpotWinMul *= JACKPOT_DOUBLE_WIN;
        effects.jackpotWeightMul *= JACKPOT_DOUBLE_WEIGHT;
        break;
      case 'cherry-double':
        effects.symbolWeightMul.cherry = (effects.symbolWeightMul.cherry ?? 1) * CHERRY_WEIGHT_MUL;
        effects.symbolPayMul.cherry = (effects.symbolPayMul.cherry ?? 1) * CHERRY_PAY_MUL;
        break;
      case 'step-two':
        effects.streakStepBonus += STEP_TWO_BONUS;
        effects.skullDropSteps = Math.max(effects.skullDropSteps, STEP_TWO_SKULL_STEPS);
        break;
      case 'amulet-half':
        effects.amuletPriceMul *= AMULET_HALF_PRICE;
        effects.amuletCopiesDouble = true;
        break;
      case 'ticket-gift':
        effects.ticketChipsMul *= TICKET_GIFT_CHIPS_MUL;
        break;
      case 'interest-win':
        effects.interestBonus += INTEREST_WIN_BONUS;
        effects.winMul *= INTEREST_WIN_MUL;
        break;
      case 'insurance-free':
        effects.amuletFreeInsurance = true;
        effects.insuranceMaxOne = true;
        break;
      case 'pot-start':
        effects.potStart = Math.max(effects.potStart, POT_START_CHIPS);
        break;
      case 'piggy-lock':
        // Копилка даёт больше, но кон забрать руками нельзя: он уйдёт сам в конце раунда (RoundScene.take).
        effects.piggyBonus += PIGGY_LOCK_BONUS;
        effects.noTake = true;
        break;
      case 'skull-refund':
        effects.skullPotRefund = Math.max(effects.skullPotRefund, SKULL_REFUND_SHARE);
        effects.takeOncePerRound = true;
        break;
      case 'pot-safe-double':
        effects.potSafeFirst = true;
        effects.skullDoubleBurn = true;
        break;
      case 'free-item':
        effects.shelfSlotsDelta += FREE_ITEM_SHELF;
        break;
      case 'item-cheap':
        effects.itemPriceMul *= ITEM_CHEAP_MUL;
        effects.itemOfferDelta += ITEM_CHEAP_OFFER;
        break;
      case 'two-slots':
        effects.shelfSlotsDelta += TWO_SLOTS_BONUS;
        effects.skullShareDelta += TWO_SLOTS_SKULL_DELTA;
        break;
      case 'joker-slot':
        effects.shelfSlotsDelta += JOKER_SLOT_SHELF;
        break;
      case 'amulet-copy':
        effects.amuletPriceAdd += AMULET_COPY_PRICE_ADD;
        break;
      case 'socket-gift':
        effects.amuletsClosed = true;
        break;
      case 'amulet-save':
        effects.amuletDeathSave = true;
        break;
      case 'rare-only':
        effects.rareAmuletForced = true;
        effects.amuletPerShop = RARE_ONLY_AMULETS;
        break;
      case 'symbol-run':
        if (pact.symbol) effects.symbolLuck = { id: pact.symbol.id, plus: SYMBOL_LUCK_PLUS, minus: SYMBOL_LUCK_MINUS };
        break;
      case 'machine-pick':
        effects.shopDiscount *= MACHINE_PICK_DISCOUNT;
        break;
      case 'joker-center':
        effects.jokerCenter = true;
        effects.winMul *= JOKER_CENTER_WIN;
        break;
      case 'blood-round':
        effects.bloodFirstSpin = true;
        effects.skullShareDelta += BLOOD_FIRST_SKULL_DELTA;
        break;
      case 'debt-defer':
        effects.debtDefer = true;
        break;
      case 'debt-freeze':
        effects.debtNoGrowth = true;
        break;
      case 'debt-tickets':
        effects.debtTicketsHalf = true;
        break;
      case 'win-double-risk':
        effects.winMul *= WIN_DOUBLE;
        effects.skullUnblockable = true;
        break;
      case 'take-streak':
        effects.doubleTake = true;
        effects.doubleTakeShare = 1;
        effects.takeStreakReset = true;
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
  return Math.max(0, Math.round((debt * mul) / DEBT_ROUND_TO) * DEBT_ROUND_TO);
}

/** Билеты после разовой платы сделки: в минус не уходят (карта не может забрать больше, чем есть). */
export function pactTickets(tickets: number, delta: number): number {
  const safe = Number.isFinite(tickets) ? Math.max(0, Math.floor(tickets)) : 0;
  const shift = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  return Math.max(0, safe + shift);
}

/** Долг магазина и множитель, который останется: одно правило для ShopScene (openShop/skipClosedShop) и тестов. */
export interface ShopDebt {
  debt: number;
  debtNextMul: number;
}

/**
 * Номер раунда, перед которым встаёт магазин: обычный заход — следующий (round + 1), повтор раунда (выжил в спасении
 * или провалил его со «вторым дыханием») — тот самый раунд, который переигрывается. Считает его ShopScene.openShop,
 * и по нему же проверяется сделка «магазин закрыт»: по счёту после отката сделка, взятая в N, потерялась бы в N − 1.
 */
export function shopRoundOf(round: number, replayRound?: number): number {
  return replayRound ?? round + 1;
}

/**
 * Долг нового магазина. keepDebt — раунд играется заново (выжил в спасении): долг остаётся РОВНО тем же числом,
 * а «следующий долг +20%» (№12) не тратится — раунд по номеру не сменился, и разовые «−10% сейчас» / «+8% сейчас»
 * уже сидят в текущем долге. Иначе — долг следующего раунда по формуле debtForRound с множителем №12, и множитель
 * сбрасывается: он живёт ровно один долг.
 * growthMul — улучшение №7 (шаг 28): рост долга ×3,4 вместо ×3,6; на повтор раунда не влияет.
 */
export function shopDebt(currentDebt: number, round: number, nextMul: number, keepDebt = false, growthMul = 1): ShopDebt {
  if (keepDebt) return { debt: currentDebt, debtNextMul: nextMul };
  return { debt: pactDebt(debtForRound(round, growthMul), nextMul), debtNextMul: 1 };
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
  const steps = Number.isFinite(effects.skullDropSteps) ? Math.max(0, Math.floor(effects.skullDropSteps)) : 0;
  if (steps > 0) return Math.max(0, safe - steps);
  if (effects.skullSoft) return Math.max(0, safe - 1);
  // №7: полступени — доля потерь вдвое меньше обычной (две трети серии остаётся вместо трети).
  if (effects.skullHalfStep) return Math.max(0, Math.ceil((safe * (1 + 1 / 3)) / 2));
  return streakAfterSkull(safe);
}

/**
 * Сколько отдаст второе «забрать» в той же прокрутке (№15): DOUBLE_TAKE_SHARE только что забранного.
 * Сделки нет, первого забирания не было (0, минус, NaN, ∞) — 0, то есть второго забирания не бывает.
 */
export function pactDoubleTake(isOn: boolean, lastTaken: number, share = DOUBLE_TAKE_SHARE): number {
  if (!isOn || !Number.isFinite(lastTaken) || lastTaken <= 0) return 0;
  const safe = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : DOUBLE_TAKE_SHARE;
  return Math.round(lastTaken * safe);
}

/**
 * Потолок прокруток раунда с поправками сделок: №2 «+2 к потолку» и №10 «потолок 10».
 * spinCapValue (№10) — абсолютный: он не может поднять потолок выше обычного, только опустить.
 */
export function pactSpinCap(base: number, effects: PactEffects): number {
  const safeBase = Number.isFinite(base) ? Math.max(1, Math.floor(base)) : 1;
  const delta = Number.isFinite(effects.spinCapDelta) ? Math.trunc(effects.spinCapDelta) : 0;
  const raised = Math.max(1, safeBase + delta);
  const fixed = Number.isFinite(effects.spinCapValue) && effects.spinCapValue > 0 ? Math.floor(effects.spinCapValue) : 0;
  return fixed > 0 ? Math.min(raised, fixed) : raised;
}

/**
 * Поправка к доле черепов с учётом потолка сделки №10: если доля с поправкой выше skullShareMax,
 * поправка урезается ровно до потолка. Мусор — поправка как есть.
 */
export function pactSkullDelta(share: number, delta: number, max: number): number {
  if (!Number.isFinite(delta)) return 0;
  if (!Number.isFinite(share) || !Number.isFinite(max) || max >= 1) return delta;
  if (share + delta <= max) return delta;
  return Math.max(-1, max - share);
}

/** №39: джокер в центре каждой сетки. Сетка не меняется на месте — возвращается новая. */
export function pactJokerCenter(grid: Grid, effects: PactEffects): Grid {
  if (!effects.jokerCenter) return grid;
  if (!Array.isArray(grid) || grid.length === 0) return grid;
  const row = Math.floor(grid.length / 2);
  if (!Array.isArray(grid[row]) || grid[row].length === 0) return grid;
  const col = Math.floor(grid[row].length / 2);
  return grid.map((cells, r) => (r === row ? cells.map((cell, c) => (c === col ? JOKER : cell)) : cells));
}

/** №14/№36: множитель выплаты символа из сделки (1 — обычная цена). */
export function pactSymbolPay(symbol: SlotSymbol, effects: PactEffects): number {
  const mul = effects.symbolPayMul?.[symbol.id] ?? 1;
  return Number.isFinite(mul) && mul > 0 ? mul : 1;
}

/** №12: во сколько раз больше платит джекпот (1 — обычно; улучшение №34 считается отдельно). */
export function pactJackpotWin(isJackpot: boolean, effects: PactEffects): number {
  return isJackpot && Number.isFinite(effects.jackpotWinMul) && effects.jackpotWinMul > 0 ? effects.jackpotWinMul : 1;
}

/**
 * №45: сколько билетов закрывает половину долга и сколько фишек останется доплатить.
 * Один билет — DEBT_TICKETS_PER_TICKET (10%) долга, но не больше половины (пять билетов).
 * Баланс, долг и билеты — мусор/ноль/минус: план пустой (0 билетов, весь долг фишками).
 */
export function pactDebtTicketPlan(debt: number, tickets: number): { tickets: number; chips: number } {
  const total = Number.isFinite(debt) && debt > 0 ? debt : 0;
  const have = Number.isFinite(tickets) && tickets > 0 ? Math.floor(tickets) : 0;
  if (total === 0 || have === 0) return { tickets: 0, chips: total };
  const unit = Math.round(total * DEBT_TICKETS_PER_TICKET);
  if (unit <= 0) return { tickets: 0, chips: total }; // билет не закрывает даже целой фишки — не тратим
  const half = Math.round(total * DEBT_TICKETS_SHARE);
  const use = Math.min(5, have, Math.ceil(half / unit)); // не больше половины долга — пяти билетов
  const covered = Math.min(half, unit * use);
  return { tickets: use, chips: Math.max(0, total - covered) };
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

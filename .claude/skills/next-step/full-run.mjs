// Полный забег «Долговой ямы» на настоящих файлах логики — headless-симулятор баланса.
// Запуск из папки next-step:
//   node --import ./ts-resolve.mjs full-run.mjs [игр]   — два варианта стратегии: как в игре и со сгорающей серией
//   SIM_DEBUG=1        — строка на раунд: round, debt, balance, pot, streak, spinsLeft, freeSpins, автомат, tickets, closed
//   SIM_MACHINE=<id>   — забег на одном автомате (classic | greedy | quiet): смена автомата выключена
//   SIM_SWAP_CHANCE=<0|1> — шанс смены автомата в начале раунда; по умолчанию MACHINE_SWAP_CHANCE из machines.ts
//   SIM_ROUNDS=1       — вместо вариантов: последний шанс по раундам, распределение цели и ориентир «цель от долга»
//   SIM_VARIANTS=all   — добавить к двум вариантам раннюю оплату
//   SIM_SEED=<число>   — подменить Math.random детерминированным ГКЧ: прогон повторяется, сид печатается в отчёте
//   SIM_CHASE_RECORD=1 — забег не кончается на 1 000 000: тот же забег идёт дальше до 10 000 000 (CHIP_RECORD) или смерти,
//                        как «ДАЛЬШЕ» на экране победы; в отчёт — доля дошедших до 10 млн и медиана их раунда и минут
//   SIM_NO_LAST_CHANCE=1 — диагностика без последнего шанса: нехватка фишек сразу конец забега (с ним спасается 95%
//                          и забег упирается в 14+ долгов — числа ничего не говорят о правилах)
//   SIM_REFUSE_PACTS=1 — бот отказывается от всех сделок Дилера: эталон «как до шага 9» для сравнения баланса
//   SIM_TICKET_SHARE_START / _STEP / _MAX — доля фишек на руках за билет (items.ts: 0,4 / 0,3 / 1 — старт, шаг и потолок);
//                        по умолчанию — числа игры, эти ручки замеряют другую цену без правки items.ts
//   SIM_TICKETS_PER_SHOP=<целое ≥ 0> — сколько билетов можно купить за один заход в магазин (правило игры
//                        items.TICKETS_PER_SHOP); 0 — без потолка; по умолчанию — потолок игры
//   SIM_LC_BUY=0       — без докупки действия в последнем шансе (эталон шага 13 для сравнения баланса)
//   SIM_LC_BUY_MAX / _START / _STEP / _MAX_SHARE — числа докупки (lastChance.ts: 3 докупки, доли 0,25/0,15/0,55);
//                        это ручки замера, по умолчанию — числа игры
//   SIM_LC_BUY_GOAL=frozen — диагностика: цель после докупки не растёт (не правило игры, а замер)
//   SIM_SKULL_SHARE=constant — старая доля черепов (26/121 ≈ 0,215) вместо роста 18→30% по раундам (замечание 19)
//   SIM_PHASE_STEP=2 — старый шаг множителя в фазе 2 (+1 к шагу); без него в фазе 2 шаг 1 (×1, ×2, ×3)
//   SIM_PHASE_SPINS=0 — фаза 2 без +1 прокрутки (как до замечания 19)
//   SIM_PHASE_SKULL=1.2 — старый множитель веса черепа в фазе 2 (phase2SkullFactor до правки)
//   SIM_LEGACY=1 — все четыре старые ручки сразу: вся игра-правила до замечания 19 (доля 21,5%, фаза ×1,2,
//                  шаг 2, без +1 прокрутки). Таблицу замера в DESIGN/HANDOFF собирают из отдельных флагов.
// streakReset — не переменная: это второй вариант в обычном прогоне, BASE_STRATEGY + { streakReset: true } («серия
// сгорает в конце раунда», в коде — переходит). Числа из двух строк одного прогона сравнимы между собой.
//
// Что повторяет (слой за слоем, как в игре): RoundScene — прокрутка, итог, «забрать», окно перемешки и подмены;
// MachineScene — ржавчина и смена автомата; BonusScene — короны, клевер, джекпот; PhaseScene — фазы;
// ShopScene — витрины по закрытым долгам, предметы, амулеты с гнёздами, барабан;
// SaveScene — кассета (запись и откат); DealerScene — сделки Дилера; CollectorScene — расплата и последний шанс
// (последний шанс живёт в last-chance-sim.mjs). Правила и числа — из rules, patterns, items, amulets, evil,
// bonus, phases, levers, machines, drum, dealerGame, save; копий чисел в симуляторе нет.
// Активные амулеты (шаг 12б) — тоже как в игре: в начале раунда заряд полный, бот жмёт значок сразу
// (amulets.canPressActive решает, можно ли, amulets.pressActiveAmulet — что даёт), «Оберег» сдвигает долю
// черепов до конца раунда, «Прицел» добавляет прокрутки.
//
// Политика игрока (BASE_STRATEGY) — это не правила игры, а выбор за игрока: «забрать», когда кон добирает долг
// или набирает долю долга; риск, молот, свеча и фарт — по своим порогам; бусты символов, перемешка и подмена —
// пока на долг не хватает; Дилер — сделка с приоритетом «шаг ×2 → раунд без черепов → билеты», иначе отказ; покупки в магазине по порядку «кассета →
// билеты за фишки под нужный амулет → амулеты по AMULET_POWER → предметы по ITEM_ORDER → барабан» с резервом reserveShare долга
// (ряды витрины пополняются после покупки, как ShopScene.refillRow); автомат игрок не выбирает —
// в начале раунда он с шансом swapChance меняется сам (machineAtRoundStart). AMULET_POWER, ITEM_ORDER
// и модель времени SECONDS (сколько секунд занимает действие на экране) — оценки игрока, не числа из src/game.
// Билеты за фишки бот покупает только под конкретный амулет из витрины, которого иначе не хватает по билетам,
// и только пока после покупки на руках остаётся резерв reserveShare долга: билет — не доход, а размен фишек на амулет.
//
// Проверки и страховки — разные вещи, и в отчёте они считаются отдельно. 5 ПРОВЕРОК ловят настоящую ошибку: долг —
// debtForRound(раунд) плюс законные сдвиги сделок («долг −10%» и «+20%» из №12, «+8%» из №2), все числа конечны, табло билетов = учёт и не в минусе, откат по правилу игры
// (запись есть, не из будущего), исходы последнего шанса = число шансов.
// 9 СТРАХОВОК повторяют то, что уже держит сам код (потолок прокруток и технический предохранитель фриспинов,
// места в столбике, пять источников билетов, расход ≤ остатка, кассета не раньше 3-го долга, серия на closeRound,
// откат только между прокрутками) — они сработают только после чьей-то правки. Внизу прогона печатается
// «проверки: 0 нарушений» и «страховки: 0 сработали» отдельными строками.
//
// Цель забега (решение автора 2026-11-14) сверена с кодом: CHIP_GOAL и CHIP_RECORD из gameConfig.ts, а «набрано» — то же,
// что накапливает BaseScene.earn. 1 000 000 набранных = экран победы, а на нём кнопка «ДАЛЬШЕ»: тот же забег идёт
// дальше до 10 000 000 (CHIP_RECORD) — там экран «РЕКОРД» и конец. «Набрано» — все приходы фишек на табло за забег:
// забранный кон (payPot), возврат страховки (burnPot), «Проценты» (payDebt), фишки барабана (winDrum); долг его не
// уменьшает. В симуляторе это одна дверь earn(): она же ведёт peakBalance (пик табло), millionRound/millionSeconds —
// когда взяли 1 000 000 — и recordRound/recordSeconds — когда взяли 10 000 000. Победа на 1 млн, как и в startVictory,
// кончает забег посреди раунда (раунд не докручивается, долг не платится, магазина нет), поэтому «долгов закрыто»
// у победителя на один меньше круга — это не ошибка. SIM_CHASE_RECORD=1 повторяет «ДАЛЬШЕ»: забег на 1 млн не
// кончается и идёт дальше. Кассета откатывает всё это с записи (runSave); после взятой цели откат закрыт, как в игре
// (canRewind смотрит на isGameOver).
//
// Известные ограничения (сознательные, не баги):
//  • freeSpinsGiven кассетой не откатывается: в игре сцена после отката перезапускается и счётчик обнуляется;
//    здесь счётчик строже (не сбрасывается откатом), но он только для предохранителя — на игру не влияет;
//  • ранняя оплата по умолчанию выключена (payEarly: 'none'): раньше она всегда была дороже докрутки раунда;
//  • обучение (тьма первого забега), звук, анимации и панели не моделируются: KABOOM — просто конец забега,
//    а время считается по SECONDS.
//
// Последний шанс (решение автора 2026-11-14): цель считается от денег, а не от входной сетки. Паттерн должен
// оплатить долю LAST_CHANCE_GOAL_SHARE нехватки фишек, выраженную в множителе (lastChance.lastChanceGoal);
// цена символа — из раунда (chancePrice), множитель серии и множители выигрыша — как в addToPot. Входная сетка
// уже бьёт цель — победа сразу (instant). Прежнее правило «побей свой же паттерн» спасало 95% нехваток и
// растягивало забег; долю можно переопределить без правки кода: SIM_LC_SHARE=0.2|0.5|1. Диагноз с числами
// печатает SIM_ROUNDS=1; подробно — HANDOFF.md, «Симулятор».
import { fileURLToPath } from 'node:url';
import { BUY_GOAL_FROZEN, BUY_ON, BUY_RULES, chanceReport, playLastChance, roundReport, SHARE } from './last-chance-sim.mjs';

const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
// lastChance.ts нужен здесь для потолка цели (BEST_WITHOUT_JACKPOT) в сводке; правила цели — в last-chance-sim.
const LC = await import(SRC + 'lastChance.ts');
// Сид: SIM_SEED=<число> подменяет Math.random детерминированным ГКЧ — прогон повторяем, сид печатается в отчёте.
// Без SIM_SEED — обычный случайный прогон, сид в отчёте «—».
const SEED = process.env.SIM_SEED === undefined ? null : Number(process.env.SIM_SEED);
if (SEED !== null && !Number.isFinite(SEED)) throw new Error(`SIM_SEED должен быть числом, получено «${process.env.SIM_SEED}»`);
if (SEED !== null) Math.random = mulberry32(SEED >>> 0);

/** Тот же ГКЧ, что в last-chance-sim.comparePolicies: прогон с одним сидом повторяется бит в бит. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = await import(SRC + 'rules.ts');
const P = await import(SRC + 'patterns.ts');
const A = await import(SRC + 'amulets.ts');
const I = await import(SRC + 'items.ts');
const E = await import(SRC + 'evil.ts');
const B = await import(SRC + 'bonus.ts');
const PH = await import(SRC + 'phases.ts');
const M = await import(SRC + 'machines.ts');
const D = await import(SRC + 'dealerGame.ts');
const SK = await import(SRC + 'skullShare.ts'); // вес символа со сделкой №11 — тот же код, что в сцене
const DR = await import(SRC + 'drum.ts');
const L = await import(SRC + 'levers.ts');
const S = await import(SRC + 'save.ts');
// Цель забега (решение автора): 1 000 000 набранных = победа, 10 000 000 — отметка рекорда. Числа — из gameConfig.ts,
// своей копии здесь нет; в симуляторе победа кончает забег так же, как CollectorScene.startVictory.
const C = await import(SRC + 'gameConfig.ts');
const GOAL = C.CHIP_GOAL;
const RECORD = C.CHIP_RECORD;
// SIM_CHASE_RECORD=1 — «ДАЛЬШЕ» с экрана победы: забег не кончается на 1 000 000 и идёт до 10 000 000 или смерти.
const CHASE_RECORD = process.env.SIM_CHASE_RECORD === '1';

// Сила амулетов (шаг 7: забег с этим амулетом с первого раунда) — по ней игрок покупает. Это оценка игрока, не число игры.
// Активные (шаг 12б): «Прицел» даёт прокрутки каждый раунд, «Оберег» тише держит черепа — обе ниже топовых пассивных.
const AMULET_POWER = { bones: 5.39, boost: 5.11, interest: 5.09, insurance: 5.02, sight: 4.92, cut: 4.88, cherryPit: 4.69, vest: 4.66, greed: 4.61, charm: 4.5, piggy: 4.43, skullPocket: 4.41, bell: 4.08 };
const ITEM_ORDER = ['garlic', 'triple', 'cigarette', 'shield', 'cherries', 'bells', 'diamonds', 'luck', 'shuffle', 'swap', 'risk', 'hammer', 'candle', 'luckSpin'];
// Модель времени: сколько секунд занимает действие на экране. Числа не из игры — это оценка, для «минут забега».
// lastChance — весь эпизод: GOOD LUCK, чистая прокрутка, два действия, чемодан; secondWind — пауза перед магазином.
// lastChanceBuy — одна докупка действия (шаг 14): столько стоит игроку ещё одна прокрутка по времени.
const SECONDS = { spin: 2.5, take: 1, dealer: 6, collector: 2.5, shop: 10, rewind: 5, rec: 1, lastChance: 12, lastChanceBuy: 2, secondWind: 2 };

// ---------- Диагностика замечания 19: старые правила против новых ----------
// Доля черепов до правки была постоянной, а фаза 2 множила её вес и росла множителем. Теперь доля растёт по раундам,
// а фаза 2 даёт +1 прокрутку. Чтобы сравнить правила, старые включаются флагами, а не второй копией симулятора.
// SIM_LEGACY=1 — вся старая игра сразу: постоянная доля 26/121, фаза 2 множит черепа (×1,2), шаг множителя 2,
// прокрутки фазой не прибавляются. Отдельные флаги ниже — чтобы менять по одной ручке (так и снята таблица замера).
const LEGACY = process.env.SIM_LEGACY === '1';
const SKULL_SHARE_CONSTANT = LEGACY || process.env.SIM_SKULL_SHARE === 'constant'; // старая доля 26/121 ≈ 0,215 в каждом раунде
const LEGACY_SKULL_RATIO = 26 / 95; // SKULL_RATIO кода до правки: вес черепа = сумма весов остальных × 26/95
const LEGACY_PHASE_STEP = LEGACY || process.env.SIM_PHASE_STEP === '2'; // старый +1 к шагу множителя в фазе 2
const PHASE_BONUS_SPINS = !LEGACY && process.env.SIM_PHASE_SPINS !== '0'; // +1 прокрутка от фазы 2 в начале раунда
const LEGACY_PHASE_SKULL = LEGACY ? 1.2 : phaseSkullFactor(); // старый ×1,2 к весу черепа в фазе 2
const NO_LAST_CHANCE = process.env.SIM_NO_LAST_CHANCE === '1'; // нехватка фишек — сразу конец забега
const REFUSE_PACTS = process.env.SIM_REFUSE_PACTS === '1'; // эталон без сделок: бот отказывается от всех карт

/** SIM_PHASE_SKULL=<число> — как SIM_SEED: не число — падаем сразу, иначе вес черепа молча стал бы NaN. */
function phaseSkullFactor() {  const raw = process.env.SIM_PHASE_SKULL;
  if (raw === undefined || raw === '') return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SIM_PHASE_SKULL должен быть положительным числом, получено «${raw}»`);
  }
  return value;
}

/** SIM_SWAP_CHANCE=<число 0…1> — шанс, что автомат сменится сам в начале раунда; null — взять из machines.ts. */
function swapChanceFromEnv() {
  const raw = process.env.SIM_SWAP_CHANCE;
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`SIM_SWAP_CHANCE должен быть числом 0…1, получено «${raw}»`);
  }
  return value;
}

/**
 * Политика билета за фишки (шаг 13) для замера: цена — доля фишек на руках, и потолок покупок за магазин.
 * По умолчанию всё из игры (items.ts), ручки окружения нужны, чтобы снять сетку вариантов без правки items.ts.
 */
const TICKET_SHARE = ticketSharesFromEnv();
/** Хоть одна доля переопределена — цену считаем здесь по формуле items.ticketForChips, иначе зовём саму игру. */
const TICKET_SHARE_OVERRIDE = ['SIM_TICKET_SHARE_START', 'SIM_TICKET_SHARE_STEP', 'SIM_TICKET_SHARE_MAX']
  .some((name) => process.env[name] !== undefined && process.env[name] !== '');
/**
 * Сколько билетов можно купить за один заход в магазин — правило игры (items.TICKETS_PER_SHOP), 0 — без потолка.
 * SIM_TICKETS_PER_SHOP=<целое ≥ 0> замеряет другой потолок: 0 — без потолка, 2 — не больше двух за магазин.
 */
const TICKETS_PER_SHOP = ticketsPerShopFromEnv();

/** Доли банка за билет из окружения (SIM_TICKET_SHARE_*): не число 0…1 — падаем сразу, иначе цена молча стала бы NaN. */
function ticketSharesFromEnv() {
  const read = (name, fallback) => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${name} должен быть числом 0…1, получено «${raw}»`);
    }
    return value;
  };
  return {
    start: read('SIM_TICKET_SHARE_START', I.TICKET_SHARE_START),
    step: read('SIM_TICKET_SHARE_STEP', I.TICKET_SHARE_STEP),
    max: read('SIM_TICKET_SHARE_MAX', I.TICKET_SHARE_MAX),
  };
}

/** Потолок покупок билета за магазин из окружения; без ручки — правило игры items.TICKETS_PER_SHOP (0 — нет потолка). */
function ticketsPerShopFromEnv() {
  const fallback = I.TICKETS_PER_SHOP ?? 0; // нет правила в игре — покупать можно, сколько хватит фишек
  const raw = process.env.SIM_TICKETS_PER_SHOP;
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`SIM_TICKETS_PER_SHOP должен быть целым 0 или больше, получено «${raw}»`);
  }
  return value;
}

/** Доля банка за билет после bought покупок за забег — как items.ticketShare, но с ручками замера. */
function ticketShareOf(bought) {
  if (!Number.isFinite(bought)) return TICKET_SHARE.start;
  return Math.min(TICKET_SHARE.max, TICKET_SHARE.start + TICKET_SHARE.step * Math.max(0, Math.floor(bought)));
}

/**
 * Цена билета за фишки при balance на руках — та же дверь, что ShopScene.buyTicket: без ручек зовём
 * items.ticketForChips, с ручками считаем её формулу, а округление берём из игры (items.roundPrice).
 */
function ticketPrice(balance, bought, mul = 1) {
  if (!TICKET_SHARE_OVERRIDE) return I.ticketForChips(balance, bought, mul);
  const bank = Number.isFinite(balance) && balance > 0 ? balance : 0;
  return I.roundPrice(bank * ticketShareOf(bought), mul);
}

/** Политика игрока (не правила игры). */
export const BASE_STRATEGY = {
  takeShare: 0.5, shieldShare: 0.25, boostShare: 0.25, reserveShare: 0.5, drumShare: 0.5,
  rustSkulls: 2,
  // Кассета (шаг 45): когда покупать ('none' | 'first' — до амулетов | 'after'), сколько за забег ('one' | 'always'),
  // когда записывать и когда откатываться.
  tape: 'first',
  tapes: 'one',
  rec: 'start', // 'start' — первой прокруткой раунда; 'pot' — когда кон ≥ recShare долга (перед риском)
  recShare: 0.5,
  recSpins: 4, // 'danger' — записать, когда осталось столько прокруток или меньше, а на долг не хватает
  play: 'burn', // 'burn' — откат между прокрутками, когда черепа сожгли кон ≥ burnShare; 'none' — кассету только записывать
  burnShare: 0.5,
  // Замах рычага (DONTLIKE п. 8): заряд 0…1 у каждой платной прокрутки. SIM_CHARGE задаёт его из окружения,
  // по умолчанию середина шкалы — веса как без замаха.
  charge: chargeFromEnv(),
  // Деньги: отдавать долг раньше конца раунда ('none' | 'ticket' — только когда за это дают билет, earlyPayTickets).
  payEarly: 'none',
  // Автомат: игрок его не выбирает. Шанс, что в начале раунда он сменится сам (SIM_SWAP_CHANCE), — из machines.ts.
  swapChance: swapChanceFromEnv() ?? M.MACHINE_SWAP_CHANCE,
  // Серия: false — как в коде (переходит в следующий раунд), true — второй набор чисел (сгорает на конце раунда).
  streakReset: false,
};

/** Заряд замаха из окружения: SIM_CHARGE=0…1 (по умолчанию 0,5 — веса такие же, как без замаха). */
function chargeFromEnv() {
  const raw = process.env.SIM_CHARGE;
  if (raw === undefined) return 0.5;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) console.warn(`SIM_CHARGE должен быть 0…1, получено «${raw}» — беру 0,5`);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.5;
}
/** Заряд этого прогона — печатается в отчёте. */
const CHARGE = chargeFromEnv();

/** Цена кассеты — как в игре (save.ts: 2, 3, 4… по купленным). econ оставлен для старых файлов рядом (tape45-sim). */
export function defaultEcon() {
  return { tapePrice: (bought) => S.tapePrice(bought) };
}

const clone = (value) => structuredClone(value);
// Амулеты по копиям: в гнёздах лежат уникальные (s.amulets), а копии — счётчиком (шаг 62б).
const ids = (s) => A.amuletIdsFrom(s.amuletCounts);
// Автомат забега: его id (машина меняется сама в начале раунда, см. startRound).
const mach = (s) => s.machineId;
/**
 * Множитель серии, как BaseScene.multiplier: шаг от амулетов плюс бонус фазы 2 (сделка может шаг удвоить),
 * но не выше потолка сделки «серия не выше ×N».
 */
/** Шаг множителя, как BaseScene.streakStep × RoundScene.streakStep: амулеты, фаза 2 и сделка «шаг вдвое». */
const streakStep = (s) => (A.multiplierStep(ids(s)) + s.phase.multiplierBonus) * D.pactEffects(s.pacts, s.round).multiplierStepMul;
/** Множитель серии, как BaseScene.multiplier: серия × шаг, но не выше потолка сделки «серия не выше ×N». */
const multiplier = (s) => Math.min(R.multiplierForStreak(s.streak, streakStep(s)), D.pactEffects(s.pacts, s.round).multiplierCap);

function newRun() {
  return {
    round: 1, debt: R.debtForRound(1), balance: 0, tickets: 0, spinsLeft: R.SPINS_PER_ROUND, pot: 0, streak: 0,
    slots: I.START_SLOTS, shelf: new Array(I.START_SLOTS).fill(null), effects: I.noEffects(), sockets: A.START_SOCKETS,
    amulets: [], amuletCounts: {}, bones: 0, roundShields: 0,
    // Активный амулет (шаг 12б): гнездо одно, заряд тратится нажатием и возвращается в начале раунда;
    // сдвиг доли черепов от «Оберега» живёт до конца раунда.
    activeUses: 0, amuletSkullDelta: 0,
    machineId: 'classic', // BaseScene: забег начинается с классического
    diceDrought: 0, isBloodNext: false, luckyClovers: 0, freeSpins: 0, phase: PH.PHASES[0], rustyColumn: null, lastGrid: null,
    charge: 0.5, // заряд замаха следующей платной прокрутки (DONTLIKE п. 8): ставится в playRound
    // Цель забега (решение автора 2026-11-14): earned — все приходы фишек за забег (BaseScene.earn), не баланс.
    // peakBalance — самый большой баланс за забег; millionRound/millionSeconds — когда earned перевалил CHIP_GOAL.
    earned: 0, peakBalance: 0, millionRound: null, millionSeconds: null,
    recordRound: null, recordSeconds: null, // когда earned перевалил 10 000 000 (CHIP_RECORD) — для SIM_CHASE_RECORD
    secondWindLeft: S.SECOND_WIND_START, // сколько провалов последнего шанса простят (failLastChance); кассета не пополняет, сделка №9 даёт ещё
    breathTaken: false, // сделка №9 уже бралась: одна на забег, откат этой памяти не снимает
    bankKeptThisRound: false, // сделка №10: первый череп в этом раунде кон уже не сжёг
    slotBase: 0, // сколько предметов стояло в столбике с начала раунда: сделка №13 новых сверх предела не даёт
    insuranceSaves: 0, // сколько раз страховка сработала в раунде (копий до двух — столько и спасений)
    pacts: [], // сделки Дилера (dealerGame.Pact): что действует в раунде, решает D.pactEffects
    debtNextMul: 1, // сделка №12: следующий долг дороже во столько раз (сбрасывается на назначении)
  };
}


/** Веса символов следующей прокрутки: автомат, амулеты, предметы, риск/фарт, фаза и замах (как skullShare.ts). */
function weightOf(s, isFree) {
  const raw = rawWeightOf(s, isFree);
  // Доля черепов: + у одних сделок, − у «тише черепа», плюс сдвиг «Оберега» 🧿 этого раунда (RoundScene.weightContext).
  const delta = D.pactEffects(s.pacts, s.round).skullShareDelta + s.amuletSkullDelta;
  if (delta === 0 || !Number.isFinite(delta) || isFree) return raw;
  // Долю черепов считаем по тем же весам, что и прокрутку (как RoundScene.weightContext), и берём тот же
  // множитель веса черепа из dealerGame: числа сделки в симуляторе не повторяются.
  let skull = 0;
  let others = 0;
  for (const symbol of R.SYMBOLS) {
    const weight = raw(symbol);
    if (R.isSkull(symbol)) skull = weight;
    else if (!R.isDice(symbol)) others += weight;
  }
  const mul = D.skullShareWeightMul(skull + others > 0 ? skull / (skull + others) : 0, delta);
  if (mul === 1) return raw;
  return (symbol) => (R.isSkull(symbol) ? raw(symbol) * mul : raw(symbol));
}

/** Вес символа без поправки сделки на долю черепов: автомат, амулеты, предметы, риск/фарт, фаза и замах. */
function rawWeightOf(s, isFree) {
  const id = s.machineId;
  const base = R.weightsForRound(s.round, E.diceWeight(s.diceDrought));
  const owned = ids(s);
  const noSkulls = D.pactEffects(s.pacts, s.round).noSkulls; // сделка «до конца раунда нет черепов»
  const luck = D.pactEffects(s.pacts, s.round).symbolLuck; // сделка №11: выбранный символ
  let others = 0;
  for (const symbol of R.SYMBOLS) if (!R.isSkull(symbol) && !R.isDice(symbol)) others += base(symbol);
  const legacySkull = others * LEGACY_SKULL_RATIO;
  return (symbol) => {
    if (noSkulls && R.isSkull(symbol)) return 0; // черепам этого раунда вес 0 — как RoundScene.baseWeights
    if (!M.machineSymbolAllowed(id, symbol)) return 0; // «Тихий»: нет паука, замка, крови и клевера
    const baseWeight = SKULL_SHARE_CONSTANT && R.isSkull(symbol) ? legacySkull : base(symbol);
    const skullFactor = R.isSkull(symbol) ? M.machineSkullFactor(id) : 1; // «Жадный»: черепа тяжелее
    const machined = A.amuletWeight(symbol, baseWeight, owned) * skullFactor; // огранка, череп в кармане
    let weight = I.boostWeight(symbol, machined, s.effects); // чеснок, вишни, колокола, алмазы, удача
    if (luck !== null) weight = SK.symbolLuckWeight(symbol, weight, luck); // сделка №11: выбранный символ ± веса
    if (s.effects.risk && R.isSkull(symbol)) weight *= I.RISK_SKULL_FACTOR; // риск: черепа втрое чаще
    if (s.effects.luckSpin && R.isSkull(symbol)) weight = 0; // фарт: на этой прокрутке черепов нет
    // Замах рычага: сильный — черепа и крупные символы чаще, слабый — тише. Выплаты не меняет (DONTLIKE п. 8).
    if (!isFree) {
      if (R.isSkull(symbol)) weight *= L.skullChargeFactor(s.charge);
      else if (symbol.price >= L.CHARGE_BIG_PRICE) weight *= L.bigChargeFactor(s.charge);
    }
    // До замечания 19 фаза 2 множила вес черепа (phase2SkullFactor = 1,2). SIM_PHASE_SKULL=1.2 возвращает это.
    if (R.isSkull(symbol) && s.phase.number >= 2) weight *= LEGACY_PHASE_SKULL;
    return isFree ? B.freeSpinWeight(symbol, weight) : weight;
  };
}

/**
 * Законный долг раунда: debtForRound(раунд), сдвинутый сделками Дилера. «Следующий долг +20%» (№12) меняет долг
 * при назначении в магазине, «текущий долг −10%» (№12) и «долг +8%» (№2) — разово уже в раунде. Поэтому сравниваем
 * с набором этих чисел, а не с одним: застрявший с прошлого раунда долг (настоящая ошибка) в набор не попадёт.
 */
function debtOk(s) {
  const base = R.debtForRound(s.round);
  for (const assign of [1, D.DEBT_NEXT_MUL]) {
    const debt = D.pactDebt(base, assign);
    const cut = D.pactDebt(debt, D.DEBT_CUT_MUL);
    const cheap = D.pactDebt(debt, D.CHEAP_SHOP_DEBT_MUL);
    // Обе карты могли лечь в один раунд: порядок применения даёт два разных округления.
    const values = [debt, cut, cheap, D.pactDebt(cut, D.CHEAP_SHOP_DEBT_MUL), D.pactDebt(cheap, D.DEBT_CUT_MUL)];
    if (values.includes(s.debt)) return true;
  }
  return false;
}

function violate(g, name) {
  g.violations[name] = (g.violations[name] ?? 0) + 1;
}

function guard(g, name) {
  g.safeguards[name] = (g.safeguards[name] ?? 0) + 1;
}

/** Доход билетов: только шесть источников из кода. Источник — страховка (вызовы с литералами), сумма — проверка. */
function gainTickets(s, g, source, count) {
  if (!(source in g.ticketIncome)) guard(g, 'билеты: неизвестный источник дохода');
  if (count <= 0) return;
  s.tickets += count;
  if (source in g.ticketIncome) g.ticketIncome[source] += count;
  g.ticketsLedger += count;
}

/** Трата билетов (амулеты, гнёзда, кассета, прокачка автомата) — тоже через одну дверь. Вернёт false, если не хватило. */
function spendTickets(s, g, count) {
  if (count > s.tickets) {
    guard(g, 'билеты: расход больше остатка'); // все места покупки проверяют остаток заранее
    return false;
  }
  s.tickets -= count;
  g.ticketsLedger -= count;
  return true;
}

const FINITE = ['round', 'debt', 'balance', 'earned', 'peakBalance', 'tickets', 'spinsLeft', 'pot', 'streak', 'luckyClovers', 'freeSpins', 'activeUses', 'amuletSkullDelta'];

/**
 * Общая проверка состояния. Зовётся после раунда, прокрутки, магазина и отката.
 * Здесь только настоящие проверки (долг, конечность, табло билетов, уровни, неотрицательные билеты); потолки,
 * места и прочее, что уже обеспечено кодом, живут в guard-ах на своих местах.
 */
function check(s, g) {
  if (!debtOk(s)) violate(g, 'долг вне набора debtForRound + сдвиги сделок');
  if (!FINITE.every((key) => Number.isFinite(s[key]))) violate(g, 'в состоянии NaN или ∞');
  if (s.tickets !== g.ticketsLedger) violate(g, 'билеты: табло не сходится с учётом');
  if (s.tickets < 0) violate(g, 'билеты ушли в минус');
  // Уровни меняет только прокачка (+1) и откат (возврат к записи): учёт — в upgradeMachine и rewind.
  if (g.survived + g.secondWind + g.dead !== g.lastChances) violate(g, 'исходы последнего шанса не сходятся с числом шансов');
  checkGuards(s, g);
}

/** Потолки и правила, которые уже обеспечены кодом: сработать могут только после правки. */
function checkGuards(s, g) {
  if (s.spinsLeft < 0 || s.spinsLeft > R.MAX_SPINS_PER_ROUND) guard(g, 'прокруток в раунде вне 0…MAX_SPINS_PER_ROUND');
  if (g.freeSpinsGiven > B.MAX_FREE_SPINS_PER_ROUND) guard(g, 'фриспинов за раунд больше потолка');
  if (I.activeSlotEffects(s.effects).length > Math.max(I.effectSlotLimit(D.pactEffects(s.pacts, s.round).effectSlotsDelta), s.slotBase)) guard(g, 'включено больше мест, чем даёт столбик');
  // Кассета: первый долг закрыт — ещё не продают (BaseScene.cassetteUnlocked). Проверяем момент покупки, а не текущий
  // раунд: после последнего шанса и отката счёт уменьшается, и «сейчас раунд < 3» уже не значит «купили рано».
  if (g.tapesBought > 0 && g.tapeClosedAtBuy < 3) guard(g, 'кассета куплена раньше третьего долга');
}

// ---------- Раунд ----------

/**
 * Доход забега — одна дверь, как BaseScene.earn в игре: баланс, «набрано» (earned) и пик табло.
 * Цель — chipGoal: 1 000 000 (CHIP_GOAL), а в SIM_CHASE_RECORD=1 — 10 000 000 (CHIP_RECORD), как после «ДАЛЬШЕ».
 * Момент первой ступени запоминаем сразу (millionRound, millionSeconds), второй — recordRound/recordSeconds.
 * Своего правила в симуляторе нет: считаем то же, что считает игра после каждой прибавки баланса.
 */
function earn(s, g, amount) {
  if (!(amount > 0)) return;
  s.balance += amount;
  s.earned += amount;
  if (s.balance > s.peakBalance) s.peakBalance = s.balance;
  if (s.millionRound === null && s.earned >= GOAL) {
    s.millionRound = s.round;
    s.millionSeconds = g.time;
  }
  if (s.recordRound === null && s.earned >= RECORD) {
    s.recordRound = s.round;
    s.recordSeconds = g.time;
  }
}

/**
 * Цель, на которой забег кончается: раунд не докручивается, долг этого раунда не платится — победа
 * (CollectorScene.startVictory). Обычный прогон — 1 000 000; SIM_CHASE_RECORD=1 («ДАЛЬШЕ») — 10 000 000.
 */
function goalReached(s) {
  return s.earned >= (CHASE_RECORD ? RECORD : GOAL);
}

/** Забрать кон на табло. isRoundEnd — кон забирается сам в конце раунда: серию не режем (KABOOM её обнулит). Вернёт сумму. */
function payPot(s, g, isRoundEnd = false) {
  let amount = s.pot;
  if (s.effects.tripleTakes > 0) { s.effects.tripleTakes -= 1; amount *= I.TRIPLE_TAKE_FACTOR; }
  earn(s, g, amount); s.pot = 0;
  if (s.effects.candle) s.effects.candle = false; // свеча: это «забрать» серию не режет
  else if (!isRoundEnd) s.streak = R.streakAfterTake(s.streak);
  return amount;
}

/**
 * Нажатие активного амулета — те же правила, что RoundScene.useActiveAmulet: можно ли нажимать, решает
 * amulets.canPressActive (нет амулета, пассивный, «Прицел» у потолка прокруток — отказ без списания заряда),
 * что даёт нажатие — amulets.pressActiveAmulet (списывает заряд, эффект включается). Копий чисел и правил
 * в симуляторе нет.
 */
function pressActiveAmulet(s, g) {
  const amulet = A.activeAmuletOf(s.amuletCounts);
  if (!A.canPressActive(amulet, s.spinsLeft, R.MAX_SPINS_PER_ROUND)) return;
  const use = A.pressActiveAmulet(amulet, s.activeUses);
  if (!use.used) return;
  s.activeUses = use.chargesLeft;
  s.amuletSkullDelta += use.skullShareDelta; // «Оберег»: черепа реже до конца раунда
  if (use.spinsBonus > 0) s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, use.spinsBonus); // «Прицел»: прокрутки раунда
  g.amuletPresses += 1;
  g.pressesById[amulet.id] = (g.pressesById[amulet.id] ?? 0) + 1;
}

/** Новый раунд. Серию НЕ трогаем: в коде она переходит в следующий раунд (BaseScene → RoundScene.startRound). */
function startRound(s, st, g) {
  const owned = ids(s);
  // Сделки, чей срок вышел вместе с прошлым раундом, уходят (RoundScene.dropExpiredPacts).
  s.pacts = s.pacts.filter((pact) => pact.untilRound >= s.round);
  // Автомат сам редко меняется в начале раунда (машина по умолчанию — та, что стоит с забега; первый раунд не меняется).
  // Сделка №8 держит его первые NO_SWAP_ROUNDS своих раундов (RoundScene.startRound): смены и новости нет.
  const switched = D.pactEffects(s.pacts, s.round).noMachineSwap ? s.machineId : M.machineAtRoundStart(s.machineId, s.round, st.swapChance);
  if (switched !== s.machineId) { s.machineId = switched; g.machineSwaps += 1; }
  // Фаза — по закрытым долгам (checkPhase); ставим её до прокруток: она даёт phase2BonusSpins (замечание 19).
  s.phase = PH.phaseAt(s.round - 1);
  const plan = A.spinsPerRound(R.SPINS_PER_ROUND, owned); // как RoundScene.startRound, без потолка
  const planSpins = PHASE_BONUS_SPINS ? R.spinsAfterBonus(plan, s.phase.bonusSpins) : plan; // потолок прокруток — как в игре
  // Сделка «−1 прокрутка в раунде»: после амулетов и фазы, но не меньше одной (RoundScene.startRound).
  s.spinsLeft = Math.max(MIN_ROUND_SPINS, planSpins + D.pactEffects(s.pacts, s.round).spinsDelta);
  s.roundShields = A.vestShields(owned);
  // Активный амулет: в начале раунда заряд снова полный, сдвиг «Оберега» от прошлого раунда снят (RoundScene.startRound).
  s.amuletSkullDelta = 0;
  const active = A.activeAmuletOf(s.amuletCounts);
  s.activeUses = active ? A.activeUses(active) : 0;
  // Бот жмёт значок сразу, как только раунд начался: «Прицел» добавляет прокрутки на весь раунд, «Оберег» держит
  // черепа тише все прокрутки — позже эффект работал бы короче.
  pressActiveAmulet(s, g);
  s.isBloodNext = false; // кровь не переходит в новый раунд
  s.insuranceSaves = 0; // страховка снова готова: сработок на раунд — по числу копий
  s.bankKeptThisRound = false; // сделка №10: «первый череп не жжёт кон» — снова первый
  g.freeSpinsGiven = 0; // потолок бесплатных прокруток — на раунд
  g.freeInRound = 0;
  g.roundPaid = 0;
  I.clearRoundEffects(s.effects); // бусты и флаги прошлого раунда не переходят в новый
  s.slotBase = I.activeSlotEffects(s.effects).length; // щит и ×3 переходят раунд: столбик с этого начался
  check(s, g);
}

function closeRound(s, st, g) {
  const streakBefore = s.streak;
  s.isBloodNext = false; s.luckyClovers = 0; s.rustyColumn = null;
  if (s.pot > 0) {
    // Сделка №10 «набранное в раунде не идёт в цель»: автозабор кон не отдаёт — он сгорает.
    if (D.pactEffects(s.pacts, s.round).bankSurvivesSkull) s.pot = 0;
    else payPot(s, g, true); // кон забирается сам — серия остаётся
  }
  I.clearRoundEffects(s.effects);
  if (st.streakReset) s.streak = 0; // ВТОРОЙ набор чисел: серия сгорает в конце раунда (в коде — нет)
  else if (s.streak !== streakBefore) guard(g, 'серия меняется на closeRound'); // её держит payPot(isRoundEnd = true)
  // Прокруток за раунд: в игре MAX_SPINS_PER_ROUND ограничивает только текущее число (spinsAfterBonus), а сумма
  // за раунд растёт от колокольчиков, сигарет и джекпота — считаем её отдельно.
  if (g.roundSpins > g.maxRoundSpins) g.maxRoundSpins = g.roundSpins;
  if (g.roundSpins > R.MAX_SPINS_PER_ROUND) g.roundsOverCap += 1;
  g.roundSpins = 0;
}

/**
 * Приоритет бота у Дилера: «ещё дыхание» и «забрать дважды» усиливают забег сильнее всего, дальше — «шаг ×2»,
 * «раунд без черепов» бережёт кон, «+1 билет» дешевле всех. №8–15 — из партии Б шага 11.
 */
const PACT_PRIORITY = [
  'extra-breath', 'double-take', 'double-step', 'quiet-round', 'tickets-shop', 'free-amulet',
  'price-up', 'machine-delay', 'safe-bank', 'skull-calm', 'soft-skull',
  'cheap-shop', 'debt-cut', 'full-insurance', 'jackpot-weight', 'symbol-weight',
];
const MIN_ROUND_SPINS = 1; // та же нижняя граница, что RoundScene.MIN_ROUND_SPINS: раунд без прокруток невозможен

/**
 * Дилер (шаг 9): на сукне три сделки из D.offerPacts — бот берёт первую по приоритету или отказывается.
 * Сделку, которая уже действует, не берём (D.pactLive — то же правило, что в DealerScene.acceptPact).
 * Числа (билеты, шаг, п.п. черепов) — из dealerGame: здесь их нет, эффекты читает D.pactEffects там, где считается
 * вес, множитель, сгорание серии и открытие магазина.
 */
function dealer(s, st, g) {
  g.time += SECONDS.dealer;
  if (REFUSE_PACTS) { g.pactsRefused += 1; return; } // замер эталона: сделки на столе есть, но бот их не берёт
  const offers = D.offerPacts();
  g.pactsOffered += offers.length;
  const pick = PACT_PRIORITY.map((id) => offers.find((pact) => pact.id === id && !D.pactLive(s.pacts, id, s.round))).find(Boolean);
  if (!pick) { g.pactsRefused += 1; return; }
  // №11: символ выбирает игрок — бот берёт самый дорогой из тех, что уже в автомате (pactSymbols).
  // Выбирать не из чего — сделку не берём: без символа она ничего не делает (как отказ карты в DealerTable).
  const symbols = pick.id === 'symbol-weight' ? D.pactSymbols(s.round) : [];
  const lucky = D.pactSymbolsAvailable(symbols)
    ? symbols.reduce((best, symbol) => (symbol.price > best.price ? symbol : best), symbols[0])
    : undefined;
  if (pick.id === 'symbol-weight' && !lucky) { g.pactsRefused += 1; return; }
  // №13: бесплатный амулет некуда поставить — карта не берётся (как DealerScene.acceptPact: нет сосуда или кандидатов).
  if (pick.id === 'free-amulet' && (s.amulets.length >= s.sockets || A.randomAmuletOffer(ids(s)).length === 0)) {
    g.pactsRefused += 1;
    return;
  }
  // №9: одна на забег. Пока сделка на кассете, её отсекает pactLive; после отката — липкий флаг breathTaken.
  if (pick.id === 'extra-breath' && s.breathTaken) {
    g.pactsRefused += 1;
    return;
  }
  s.pacts.push(D.pactOf(pick.id, s.round, lucky));
  // Разовые эффекты сделки — те же, что DealerScene.applyPactOnce: билет, долг +8% (№2), долг −10% и +20% (№12),
  // дыхание и ступень серии (№9), бесплатный амулет (№13).
  switch (pick.id) {
    case 'tickets-shop': gainTickets(s, g, 'pact', D.PACT_TICKETS); break;
    case 'cheap-shop': s.debt = D.pactDebt(s.debt, D.CHEAP_SHOP_DEBT_MUL); break;
    case 'debt-cut':
      s.debt = D.pactDebt(s.debt, D.DEBT_CUT_MUL);
      s.debtNextMul = D.DEBT_NEXT_MUL;
      break;
    case 'extra-breath':
      // Разово и не выше потолка; сделка-маркер живёт до конца забега, повторно её не берут (pactLive, breathTaken).
      s.secondWindLeft = Math.min(D.SECOND_WIND_MAX, s.secondWindLeft + D.EXTRA_BREATH_COUNT);
      s.streak = Math.max(0, s.streak - D.EXTRA_BREATH_STREAK_COST);
      s.breathTaken = true;
      break;
    case 'free-amulet': {
      // Уже включённые предметы сделка не снимает: предел столбика проверяем от того, что уже стоит.
      s.slotBase = Math.max(s.slotBase, I.activeSlotEffects(s.effects).length);
      const [amulet] = A.randomAmuletOffer(ids(s));
      if (amulet) {
        if (!s.amulets.some((owned) => owned.id === amulet.id)) s.amulets.push(amulet); // копия — в гнездо своего амулета
        A.addCopy(s.amuletCounts, amulet.id);
        g.amuletsFree += 1;
      }
      break;
    }
  }
  g.pactsTaken += 1;
  g.pactsById[pick.id] = (g.pactsById[pick.id] ?? 0) + 1; // какие карты бот берёт (для отчёта)
}

/**
 * Перемешка и подмена в симуляции (шаг 63б). В игре окно открывается после остановки сетки, до итога, и игрок видит сетку.
 * Подмена — джокер в лучшую клетку: это выбор, а не случайность, исход виден, поэтому перебираем все 15.
 * Перемешка — столбец, где больше всего неплатящих клеток, а новые символы случайные, как в игре; берём её, только если
 * в этом столбце хотя бы две неплатящие клетки и прокрутка пока не выигрывает. За прокрутку — не больше одного применения.
 * Здесь только решение игрока: сами клетки считает evaluateGrid ниже, один раз на итог.
 */
function rerollGrid(grid, s, w, g) {
  const before = P.evaluateGrid(grid, { ignoreLocks: s.effects.hammer });
  if (s.effects.swap) {
    let best = null;
    let bestScore = before.win;
    for (let row = 0; row < R.GRID_ROWS; row++) {
      for (let col = 0; col < R.GRID_COLUMNS; col++) {
        const trial = grid.map((line, r) => line.map((cell, c) => (r === row && c === col ? R.JOKER : cell)));
        const got = P.evaluateGrid(trial, { ignoreLocks: s.effects.hammer });
        if (got.kind !== 'skull' && got.win > bestScore) { bestScore = got.win; best = trial; }
      }
    }
    if (best) { s.effects.swap = false; g.swapUsed += 1; return best; } // джокер пригодился
  }
  if (s.effects.shuffle) {
    let column = 0;
    let junk = -1;
    for (let col = 0; col < R.GRID_COLUMNS; col++) {
      const bad = grid.filter((line) => !R.isPaying(line[col])).length;
      if (bad > junk) { junk = bad; column = col; }
    }
    if (junk >= 2 && before.kind !== 'win') {
      const trial = grid.map((line) => line.slice());
      for (let row = 0; row < R.GRID_ROWS; row++) trial[row][column] = R.randomSymbol(w);
      s.effects.shuffle = false;
      g.shuffleUsed += 1;
      return trial;
    }
  }
  return grid; // не пригодилось — предмет остаётся заряженным до следующей платной прокрутки
}

/**
 * Ржавчина (MachineScene.rollGrid / rustAfterSpin): шанс — из спеки автомата (MachineSpec.rustChance).
 * У всех трёх автоматов он 0, путь спит: characters.ts (rustColumn, jamGrid) симулятор больше не импортирует.
 */
function jamGrid(grid, previous, column) {
  return grid.map((cells, row) => cells.map((symbol, col) => (col === column ? previous[row][col] : symbol)));
}

function rustAfterSpin(s) {
  if (s.freeSpins > 0 || s.luckyClovers > 0 || s.spinsLeft === 0) return;
  const chance = M.machineSpec(mach(s)).rustChance;
  if (chance === 0 || Math.random() >= chance) return;
  s.rustyColumn = Math.floor(Math.random() * R.GRID_COLUMNS);
}

/** Короны → бесплатные прокрутки (игрового потолка за раунд нет), клевер → удача следующей, джекпот → билеты и прокрутки. */
function collectBonuses(s, g, grid, result) {
  const free = B.freeSpinsFor(B.countCrowns(grid)); // сколько положено за короны — столько и дают
  if (free > 0) {
    g.crownEvents += 1;
    s.freeSpins += free; g.freeSpinsGiven += free; g.freeInRound += free;
    g.freeMax = Math.max(g.freeMax, g.freeInRound);
  }
  const clovers = B.countClovers(grid); // клеверов может быть несколько — от их числа зависит сила паттерна
  if (clovers > 0) s.luckyClovers = clovers;
  if (B.isJackpot(result)) {
    gainTickets(s, g, 'jackpot', B.JACKPOT_TICKETS);
    s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, B.JACKPOT_SPINS);
  }
}

/**
 * Черепа сожгли кон. Страховка (INSURANCE_SHARE) возвращает часть сгоревшего на табло — один раз за раунд
 * (insuranceSaves против числа копий), иначе спасла бы больше раз, чем куплено (RoundScene.burnPot).
 */
function burnPot(s, g) {
  const lost = s.pot;
  const refund = A.insuranceRefund(lost, ids(s), s.insuranceSaves, D.pactEffects(s.pacts, s.round).insuranceShare);
  s.pot = 0;
  // Сделки с черепом: «череп в ×1» обнуляет, «мягкий череп» снимает одну ступень (одно очко серии), иначе треть.
  s.streak = D.skullStreakAfter(s.streak, D.pactEffects(s.pacts, s.round));
  if (refund > 0) {
    s.insuranceSaves += 1;
    earn(s, g, refund); // сработка копии: счётчик страховки гасит её до конца раунда; возврат — доход забега
  }
}

/** Одна прокрутка (обычная или бесплатная) с итогом — как RoundScene.roll + evaluateSpin. Вернёт, сколько сгорело. */
function roll(s, st, g, isFree) {
  g.time += SECONDS.spin;
  g.spins += 1;
  g.roundSpins += 1; // сумма прокруток за раунд (для проверки «потолок не ограничивает сумму»)
  if (!isFree) g.paidSpins += 1;
  const calm = false; // спокойного режима больше нет: заряд только двигает веса
  if (!isFree) g.normalSpins += 1;
  const mult = multiplier(s);
  const w = weightOf(s, isFree);
  // В спокойной прокрутке клевер не тратится (выплат нет) и заевший столбец не переносится: в нём могли быть черепа и кубик.
  let grid;
  if (!calm && s.luckyClovers > 0) {
    const clovers = s.luckyClovers;
    s.luckyClovers = 0;
    grid = B.luckyGrid(w, clovers, D.pactPatternWeight(D.pactEffects(s.pacts, s.round)) ?? undefined); // сделка №7
  }
  else grid = R.spinGrid(w);
  if (calm) s.rustyColumn = null;
  else if (s.rustyColumn !== null && s.lastGrid) { grid = jamGrid(grid, s.lastGrid, s.rustyColumn); s.rustyColumn = null; }
  // Окно перемешки и подмены: только на платной прокрутке; в спокойной выплат нет — переделывать сетку незачем.
  if (!isFree && !calm) grid = rerollGrid(grid, s, w, g);
  const result = P.evaluateGrid(grid, { ignoreLocks: s.effects.hammer }); // единственный вход в подсчёт итога (молот: замки не блокируют)
  const isBloody = s.isBloodNext;
  if (!calm) s.isBloodNext = E.cellsOf(grid, 'blood').length > 0; // в calm кровь следующей прокрутки не ставит
  if (!calm && result.tickets >= R.TICKET_SCATTER) gainTickets(s, g, 'scatter', 1);
  let burned = 0;
  const owned = ids(s);
  if (!calm && result.kind === 'skull') { // в calm черепов по весам нет — ветка не запускается
    s.bones += 1;
    if (s.roundShields > 0) { s.roundShields -= 1; s.streak += 1; }
    else if (s.effects.shields > 0) { s.effects.shields -= 1; s.streak += 1; }
    else {
      // Сделка №10: первый череп раунда кон не жжёт, второй — как обычно. Серия падает в любом случае.
      const keepsPot = D.pactEffects(s.pacts, s.round).bankSurvivesSkull && !s.bankKeptThisRound;
      if (keepsPot) { s.bankKeptThisRound = true; s.streak = D.skullStreakAfter(s.streak, D.pactEffects(s.pacts, s.round)); }
      else { burned = s.pot; burnPot(s, g); }
      if (isBloody) s.balance -= E.bloodBurn(s.balance); // кровавая прокрутка: сгорает ещё и часть табло
    }
  } else {
    s.streak += 1; // серия растёт всегда — и в спокойной прокрутке
    if (!calm) {
      if (result.kind === 'win') {
        const win = A.amuletPatternWin(result.hits, owned);
        const factor = A.winFactor(owned, s.bones) * (isBloody ? E.BLOOD_WIN : 1) * M.machineWinFactor(mach(s)) * (s.effects.risk ? I.RISK_WIN_FACTOR : 1)
          * D.pactEffects(s.pacts, s.round).winMul; // сделка «выигрыш паттернов +N%» — только паттерны
        s.pot += Math.round(win * mult * factor);
        s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, A.bellSpins(result.hits, owned)); // потолок прокруток за раунд
      } else s.pot += A.piggyCoins(mult, owned);
      s.pot -= E.spiderBite(s.pot, E.cellsOf(grid, 'spider').length);
    }
  }
  if (!calm) collectBonuses(s, g, grid, result);
  s.lastGrid = grid;
  rustAfterSpin(s);
  // Риск, молот и фарт — на одну прокрутку; в спокойной заряды ждут обычной.
  if (!calm) {
    s.effects.risk = false;
    s.effects.hammer = false;
    s.effects.luckSpin = false;
  }
  if (!calm && E.cellsOf(grid, 'dice').length > 0) { s.diceDrought = 0; dealer(s, st, g); } else s.diceDrought += 1;
  return burned;
}

/**
 * Решения игрока между прокрутками: предметы и «забрать».
 * Шаг 63а: бусты символов включаем, пока долг не добит; риск и фарт — перед трудной прокруткой (риск на пустом коне,
 * фарт — когда кон уже есть), молот — когда на прошлой сетке был замок, свечу — перед «забрать» на длинной серии.
 * Шаг 63б: перемешка и подмена — на трудную прокрутку. Числа не подбирались: задача — чтобы симуляция считала эффекты.
 * Столбик у экрана — не больше EFFECT_SLOTS включённых сразу (RoundScene.useItem: пятый отклоняется).
 */
function beforeSpin(s, st, g) {
  const need = s.debt;
  // Включить предмет — как RoundScene.useItem: уже действующий второй отклоняется, риск с фартом несовместимы,
  // а шестой по счёту предмет у экрана не включить, пока игрок не освободит место.
  const blocked = (id) => (id === 'risk' && s.effects.luckSpin) || (id === 'luckSpin' && s.effects.risk);
  const useSlot = (id) => {
    if (I.isItemOn(id, s.effects) || blocked(id)) return false;
    // Сделка №13 короче столбик — предел считает items.effectSlotLimit, как RoundScene.useItem.
    const places = I.effectSlotLimit(D.pactEffects(s.pacts, s.round).effectSlotsDelta);
    if (I.takesEffectSlot(id) && I.activeSlotEffects(s.effects).length >= places) {
      g.itemSlotsDenied += 1; // места в столбике нет — в игре ценник отклонён, предмет остаётся на полке
      return false;
    }
    const i = s.shelf.findIndex((it) => it?.id === id);
    if (i < 0) return false;
    s.shelf[i] = null;
    return true;
  };
  if (useSlot('garlic')) s.effects.symbolBoost.skull = I.GARLIC_SKULL_FACTOR;
  // Бусты символов: пока на долг не хватает, лишние фишки на кон не помешают.
  for (const [item, symbol] of [['cherries', 'cherry'], ['bells', 'bell'], ['diamonds', 'diamond'], ['luck', 'clover']]) {
    if (s.balance < need && useSlot(item)) {
      s.effects.symbolBoost[symbol] = I.SYMBOL_BOOST_FACTOR;
      if (item === 'luck') s.effects.symbolBoost.crown = I.SYMBOL_BOOST_FACTOR; // в игре удача бустит и клевер, и короны
    }
  }
  if (s.balance < need && s.pot === 0 && s.streak <= 1 && useSlot('risk')) s.effects.risk = true; // риск на малом коне и серии
  if (s.balance + s.pot < need) {
    if (useSlot('shuffle')) s.effects.shuffle = true;
    if (useSlot('swap')) s.effects.swap = true;
  }
  if (s.balance < need && s.pot > st.shieldShare * need && useSlot('luckSpin')) s.effects.luckSpin = true; // кон бережём
  const hasLock = !!s.lastGrid && s.lastGrid.some((line) => line.some((cell) => R.isLock(cell)));
  if (hasLock && useSlot('hammer')) s.effects.hammer = true;
  if (s.pot >= st.shieldShare * need && s.effects.shields === 0 && useSlot('shield')) s.effects.shields += 1;
  if (s.pot >= st.boostShare * need && s.effects.tripleTakes === 0 && useSlot('triple')) s.effects.tripleTakes += 1;
  if (s.spinsLeft === 1 && s.balance + s.pot < need && !I.isItemOn('cigarette', s.effects)
    && s.spinsLeft < R.MAX_SPINS_PER_ROUND && useSlot('cigarette')) s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, I.CIGARETTE_SPINS);
  let take = s.balance < need ? s.balance + s.pot >= need : s.pot >= st.takeShare * need;
  if (s.rustyColumn !== null && s.lastGrid) {
    const skulls = s.lastGrid.filter((line) => R.isSkull(line[s.rustyColumn])).length;
    if (skulls >= st.rustSkulls) take = true;
  }
  if (take && s.pot > 0 && s.streak >= 2 && !s.effects.candle && useSlot('candle')) s.effects.candle = true; // не режем серию
  if (take && s.pot > 0) {
    const taken = payPot(s, g);
    g.time += SECONDS.take;
    // Сделка №15: второе «забрать» в той же прокрутке отдаёт DOUBLE_TAKE_SHARE забранного (RoundScene.take).
    const extra = D.pactDoubleTake(D.pactEffects(s.pacts, s.round).doubleTake, taken);
    if (extra > 0) { earn(s, g, extra); g.doubleTakes += 1; }
  }
}

// ---------- Кассета (SaveScene) ----------

/** Что попадает на кассету — поля RunSave из save.ts, которые есть в симуляторе. */
function runSave(s) {
  return {
    round: s.round, spinsLeft: s.spinsLeft, pot: s.pot, streak: s.streak, isBloodNext: s.isBloodNext,
    luckyClovers: s.luckyClovers, roundShields: s.roundShields, debt: s.debt, balance: s.balance, tickets: s.tickets,
    slots: s.slots, shelf: s.shelf, effects: s.effects, sockets: s.sockets, amulets: s.amulets,
    amuletCounts: s.amuletCounts, bones: s.bones, machineId: s.machineId, activeUses: s.activeUses,
    pacts: s.pacts, debtNextMul: s.debtNextMul, diceDrought: s.diceDrought, secondWindLeft: s.secondWindLeft, breathTaken: s.breathTaken, insuranceSaves: s.insuranceSaves,
    // Цель забега тоже на плёнке (RunSave.earned): откат возвращает и набранное, и пик табло, и момент победы.
    earned: s.earned, peakBalance: s.peakBalance, millionRound: s.millionRound, millionSeconds: s.millionSeconds,
    recordRound: s.recordRound, recordSeconds: s.recordSeconds,
  };
}

/** Записать: снимок забега как есть. Кассета на видеомагнитофоне становится записанной. */
function record(s, g) {
  g.tape = 'recorded'; g.record = clone(runSave(s));
  // Счётчики прокруток вместе со снимком: после отката раунд играется заново, и списанные до отката прокрутки
  // не должны дважды попадать в «прокруток за забег», «макс. за раунд» и долю раундов сверх потолка.
  g.recordCounters = { roundSpins: g.roundSpins, spins: g.spins, paidSpins: g.paidSpins, roundPaid: g.roundPaid, firstSpinMult: g.firstSpinMult, firstSpinRounds: g.firstSpinRounds };
  g.time += SECONDS.rec; g.recs += 1;
}

/**
 * Откатиться к записи: автомат съедает кассету. Предусловия — как SaveScene.canRewind: кассета записана, раунд идёт,
 * впереди нет бесплатных прокруток. Запись может быть из прошлого раунда — loadTape:136-166 восстанавливает круг
 * из записи, поэтому откат через границу раунда разрешён (tapeState переживает конец раунда, canRewind истинен сразу
 * после startRound). «Второе дыхание» и страховка откатом не пополняются, страховка — только в том же раунде.
 * Известное ограничение: freeSpinsGiven не откатывается (в игре сцена после отката перезапускается и счётчик
 * обнуляется — там откат даёт полный потолок заново; здесь строже, поэтому фриспинов за раунд не больше).
 */
function rewind(s, g) {
  const saved = g.record;
  // Правило игры (SaveScene.canRewind + loadTape): кассета записана и запись не из будущего.
  if (g.tape !== 'recorded' || saved === null || saved.round > s.round) {
    g.illegalRewinds += 1;
    violate(g, 'правило отката: нет записи или запись из будущего');
    return s;
  }
  // Предохранитель бота: сам он откатывается только между прокрутками (canAct).
  if (!(s.spinsLeft > 0 && s.freeSpins === 0)) {
    g.illegalRewinds += 1;
    guard(g, 'бот откатился не между прокрутками');
    return s;
  }
  const back = clone(saved);
  // Откат не пополняет дыхание: запасов на плёнке и сейчас — по меньшему (как SaveScene.insertTape).
  back.secondWindLeft = Math.min(S.secondWindLeftOf(saved), s.secondWindLeft);
  back.breathTaken = saved.breathTaken || s.breathTaken; // карта №9 одна на забег, откат её не забывает
  // Откат не пополняет страховку: сработки этого раунда и с плёнки берём по большей (как SaveScene.loadTape).
  back.insuranceSaves = Math.max(saved.round === s.round ? s.insuranceSaves : 0, saved.insuranceSaves ?? 0);
  // Заряд активного амулета откат не пополняет — берём меньшее из текущего и плёнки (SaveScene.insertTape).
  back.activeUses = Math.min(s.activeUses, S.activeUsesOf(saved, s.activeUses));
  // Сдвиг «Оберега» — состояние раунда, а не плёнки: после перезапуска сцены его нет (RoundScene.resetState).
  back.amuletSkullDelta = 0;
  g.tape = 'forSale'; g.record = null; g.time += SECONDS.rewind; g.rewinds += 1;
  Object.assign(s, back);
  Object.assign(g, g.recordCounters ?? {}); // счётчики прокруток — как на записи
  g.recordCounters = null;
  g.ticketsLedger = back.tickets; // билеты вернулись к записи — сверка табло начинается заново
  s.rustyColumn = null; s.lastGrid = null; s.freeSpins = 0; // заморозок и прошлой сетки в записи нет
  return s;
}

function shouldRecord(s, st) {
  if (st.rec === 'start') return true;
  if (st.rec === 'pot') return s.pot >= st.recShare * s.debt;
  if (st.rec === 'danger') return s.spinsLeft <= st.recSpins && s.balance + s.pot < s.debt; // дело плохо — записать сейчас
  return false;
}

/**
 * Раунд с начала (или с середины — после отката к записи посреди раунда): прокрутки до конца.
 * Вернёт состояние — s может смениться после отката.
 */
function playRound(s, st, g) {
  for (;;) {
    while (s.freeSpins > 0) {
      // Технический предохранитель FREE_SPINS_GUARD: в игре на нём раунд кончается штатно (RoundScene.afterSpin),
      // поэтому и здесь цепочка рвётся, а не крутится вечно. Игрового потолка бесплатных прокруток нет.
      if (g.freeSpinsGiven > B.FREE_SPINS_GUARD) {
        g.guardStops += 1;
        g.freeSpinsGiven = 0; // раунд кончился: счётчик «за раунд» больше не к чему применять (иначе проверка между раундами ругнётся)
        s.freeSpins = 0; s.spinsLeft = 0; break;
      }
      s.freeSpins -= 1; roll(s, st, g, true);
    }
    if (goalReached(s)) return s; // цель взята (например, страховкой) — забег кончен
    if (s.spinsLeft === 0) return s;
    if (g.tape === 'blank' && shouldRecord(s, st)) record(s, g); // запись — только между прокрутками
    beforeSpin(s, st, g);
    if (goalReached(s)) return s; // «забрать» перевалило цель — победа, раунд не докручивается
    // Отдать долг раньше: в игре — клик по светящейся записке, оставшиеся прокрутки пропадают, за 3 и больше — билет.
    if (st.payEarly === 'ticket' && s.balance >= s.debt) {
      const bonus = A.earlyPayTickets(s.spinsLeft); // сколько билетов даст ранняя оплата прямо сейчас
      if (bonus > 0) {
        gainTickets(s, g, 'early', bonus);
        s.spinsLeft = 0;
        g.paidEarly += 1;
        check(s, g);
        return s; // раунд кончился: кон заберёт closeRound, потом Коллектор
      }
    }
    s.spinsLeft -= 1;
    s.charge = st.charge; // замах этой платной прокрутки (DONTLIKE п. 8)
    if (g.roundPaid === 0) { g.firstSpinMult += multiplier(s); g.firstSpinRounds += 1; } // диагностика переноса серии
    g.roundPaid += 1;
    if (s.spinsLeft < 0) { guard(g, 'spinsLeft < 0'); return s; }
    const burned = roll(s, st, g, false);
    check(s, g);
    // Откат — между прокрутками раунда, как canRewind: запись может быть и из прошлого раунда (см. rewind).
    // Запись «из будущего» (после спасения раунд откатился) политика не трогает: игра позволяет нажать кассету,
    // но тогда круг прыгнул бы вперёд — поведение разрешено только явным правилом rewind, политика его не использует.
    // После взятой цели откат закрыт и в игре (isGameOver), и здесь: иначе кассета отменяла бы победу.
    if (st.play === 'burn' && !goalReached(s) && g.tape === 'recorded' && g.record !== null && g.record.round <= s.round
      && s.freeSpins === 0 && s.spinsLeft > 0 && burned >= st.burnShare * s.debt) {
      s = rewind(s, g);
    }
  }
}

// ---------- Магазин ----------

function freeSlot(s) { return s.shelf.indexOf(null); }

/** Долг нового раунда: debtForRound + разовый «следующий долг +20%» (№12) — как ShopScene.takeDebtForRound. */
function takeDebtForRound(s) {
  const debt = D.pactDebt(R.debtForRound(s.round), s.debtNextMul);
  s.debtNextMul = 1; // множитель действует ровно на один долг
  return debt;
}

/** Магазин после отданного долга: раунд +1, новый долг, витрины по закрытым долгам, покупки. */
function openShop(s, st, g, econ) {
  // Магазин закрыт сделкой Дилера (ShopScene.skipClosedShop): панель не выезжает — новый долг и сразу новый раунд.
  // Срок проверяем до увеличения раунда: сделка «считая текущий раунд» закрывает и этот магазин, и следующий.
  if (D.pactEffects(s.pacts, s.round).shopClosed) {
    // Время идёт и здесь: в игре панель не выезжает, но игрок всё равно тратит те же секунды на записку и раунд.
    g.shopsClosed += 1;
    g.time += SECONDS.shop;
    s.round += 1;
    s.debt = takeDebtForRound(s); // «следующий долг +20%» из сделки №12, как ShopScene.takeDebtForRound
    check(s, g);
    return;
  }
  g.time += SECONDS.shop;
  g.shops += 1;
  s.round += 1;
  s.debt = takeDebtForRound(s); // долг не зависит от автомата (characterDebt больше нет)
  const closed = s.round - 1; // closedDebts(): раунд уже увеличен
  check(s, g);
  // Скидка №2 (ShopScene.shopDiscount) и «страховка вдвое дороже за копию» (№5): магазин открывается после раунда,
  // поэтому срок сделки смотрим на прошлом раунде — счёт уже увеличен.
  const shopEffects = D.pactEffects(s.pacts, closed);
  const shopMul = shopEffects.shopDiscount;
  const fullInsurance = shopEffects.insuranceDoubles;
  // Витрина — под автомат, который стоит: «Удача» у «Тихого» бесполезна (клевера там нет).
  const offer = I.randomOffer(s.round, (item) => M.machineItemAllowed(s.machineId, item));
  // Что открыто в магазине — по закрытым долгам (BaseScene.amuletsUnlocked / drumUnlocked / cassetteUnlocked:
  // 1 — амулеты, 2 — барабан, 3 — кассета); в openShop раунд уже увеличен, поэтому closed = round − 1.
  const amuletOffer = closed >= 1 ? A.randomAmuletOffer(ids(s)) : [];
  const reserve = () => s.balance - st.reserveShare * s.debt;
  // Кассета продаётся с третьего закрытого долга, цена — save.tapePrice (2 + купленные). Цена получает и число
  // закрытых долгов (второй аргумент) — старый контракт tape45-sim (econ.tapePrice(bought, closed)) не ломается.
  const buyTape = () => {
    if (closed < 3 || g.tape !== 'forSale') return; // открыта с третьего долга и только пока не куплена
    if (st.tape === 'none') return;
    // econ.tapeOnce === false — «сколько угодно кассет» (старая ручка tape45-sim); иначе по политике st.tapes.
    const manyTapes = st.tapes === 'always' || econ.tapeOnce === false;
    if (!manyTapes && g.tapesBought > 0) return;
    const price = S.tapePrice(g.tapesBought, shopMul); // цена и скидка №2 — как в SaveScene.showTapePrice
    if (price > s.tickets) return;
    spendTickets(s, g, price);
    g.tapesBought += 1;
    g.tapeClosedAtBuy = closed; // для инварианта: кассета не раньше третьего закрытого долга
    g.tape = 'blank';
  };
  if (st.tape === 'first') buyTape();
  // Билеты за фишки (шаг 13): четвёртый ряд торгового автомата — билет стоит долю фишек на руках (items.ticketForChips),
  // и каждый следующий за забег дороже. Бот покупает их только с умыслом: в витрине есть амулет, который он всё равно
  // взял бы (тот же порядок AMULET_POWER и те же проверки копий, гнезда и активного гнезда, что в цикле ниже),
  // а билетов на него не хватает. Покупка — по одному, не больше потолка игры items.TICKETS_PER_SHOP за магазин
  // (SIM_TICKETS_PER_SHOP замеряет другой потолок, 0 — без потолка), и только пока после неё фишек остаётся не меньше
  // резерва (reserve()): билет — размен фишек на амулет, а не доход.
  if (closed >= 1) {
    /** Сколько билетов нужно на амулет: цена и, для нового амулета без гнезда, ещё и гнездо. null — бот его не возьмёт. */
    const amuletNeed = (amulet) => {
      if (A.countOf(s.amuletCounts, amulet.id) >= amulet.maxCopies) return null; // копий уже под потолок
      const base = A.amuletPrice(amulet, shopMul);
      // №5: каждая следующая копия страховки вдвое дороже, пока сделка жива (как в цикле ниже).
      const price = fullInsurance && amulet.id === 'insurance' ? A.insuranceCopyPrice(base, A.countOf(s.amuletCounts, 'insurance')) : base;
      if (A.isActive(amulet)) return A.activeAmuletOf(s.amuletCounts) === null ? price : null; // гнездо активного одно
      const socket = s.amulets.findIndex((a) => a.id === amulet.id);
      if (socket < 0 && s.amulets.length >= s.sockets) {
        const sp = A.socketPrice(s.sockets, shopMul);
        return sp === null ? null : sp + price; // новый амулет — только вместе с гнездом
      }
      return price;
    };
    for (const amulet of [...amuletOffer].sort((a, b) => AMULET_POWER[b.id] - AMULET_POWER[a.id])) {
      const need = amuletNeed(amulet);
      if (need === null) continue; // этот амулет бот не возьмёт и с билетами
      if (need <= s.tickets) break; // лучший доступный уже по карману — докупать незачем
      for (let bought = 0; (TICKETS_PER_SHOP === 0 || bought < TICKETS_PER_SHOP) && s.tickets < need; bought++) {
        const price = ticketPrice(s.balance, g.ticketsBought, shopMul);
        if (price > s.balance || reserve() - price < 0) break; // фишки ушли бы ниже резерва — запас кончился
        s.balance -= price;
        s.tickets += 1;
        g.ticketsLedger += 1; // билет куплен, а не заработан: в ticketIncome по источникам он не идёт
        g.ticketsBought += 1;
      }
      break;
    }
  }
  // Амулеты по силе; копия не требует свободного гнезда (шаг 62б), новому амулету — гнездо (отдельная покупка за билеты).
  // Активный (шаг 12б) встаёт в своё янтарное гнездо: пассивные гнёзда и докупка гнезда ему не нужны, но гнездо одно.
  if (closed >= 1) {
    for (const amulet of [...amuletOffer].sort((a, b) => AMULET_POWER[b.id] - AMULET_POWER[a.id])) {
      if (A.countOf(s.amuletCounts, amulet.id) >= amulet.maxCopies) continue;
      const base = A.amuletPrice(amulet, shopMul);
      // №5: каждая следующая копия страховки вдвое дороже, пока сделка жива.
      const price = fullInsurance && amulet.id === 'insurance' ? A.insuranceCopyPrice(base, A.countOf(s.amuletCounts, 'insurance')) : base;
      if (price > s.tickets) continue;
      if (A.isActive(amulet)) {
        if (A.activeAmuletOf(s.amuletCounts) !== null) continue; // гнездо активного занято — второй не встанет (ShopScene.buyAmulet)
        spendTickets(s, g, price);
        A.addCopy(s.amuletCounts, amulet.id);
        g.activesBought += 1;
        g.amuletsBought += 1;
        continue;
      }
      const socket = s.amulets.findIndex((a) => a.id === amulet.id); // гнездо этого амулета; −1 — такого ещё нет
      if (socket < 0 && s.amulets.length >= s.sockets) {
        const sp = A.socketPrice(s.sockets, shopMul);
        if (sp === null || sp + price > s.tickets) continue; // гнездо с амулетом не по карману — этот не взять
        spendTickets(s, g, sp);
        s.sockets += 1;
        g.socketsBought += 1;
      }
      spendTickets(s, g, price);
      A.addCopy(s.amuletCounts, amulet.id);
      if (socket < 0) s.amulets.push(amulet); // гнездо занято сразу: следующий амулет его не получит
      g.amuletsBought += 1;
    }
  }
  if (st.tape === 'after') buyTape();
  // Предметы торгового автомата; нет места — место (тоже отдельная покупка, за фишки). Ряд после покупки пополняется
  // (ShopScene.buyItem → refillRow → offerReplacement), поэтому за заход можно купить больше трёх: идём по ITEM_ORDER
  // проходами, пока хоть одна покупка проходит.
  const isAllowed = (item) => M.machineItemAllowed(s.machineId, item);
  const buyItem = (row) => {
    const item = offer[row];
    const price = I.itemPrice(item, s.debt, shopMul);
    if (freeSlot(s) < 0) {
      const slot = I.slotPrice(s.slots, s.debt, shopMul);
      if (slot === null || reserve() - slot - price < 0) return false;
      s.balance -= slot; s.slots += 1; s.shelf.push(null);
      g.slotsBought += 1;
    }
    if (reserve() - price < 0) return false;
    s.balance -= price; s.shelf[freeSlot(s)] = item;
    g.itemsBought += 1;
    offer[row] = null;
    const replacement = I.offerReplacement([...offer, item], s.round, isAllowed); // как refillRow: не тот же и не из других рядов
    if (replacement) offer[row] = replacement;
    return true;
  };
  for (let pass = 0; pass < 8; pass++) {
    let bought = false;
    for (const id of ITEM_ORDER) {
      const row = offer.findIndex((it) => it?.id === id);
      if (row < 0) continue;
      if (buyItem(row)) bought = true;
    }
    if (!bought) break; // денег или места больше нет
  }
  // Барабан — со второго закрытого долга.
  if (closed >= 2) {
    for (let spins = 0; ; spins++) {
      const price = DR.drumPrice(spins, s.debt, shopMul);
      if (price > st.drumShare * s.debt || reserve() - price < 0) break;
      s.balance -= price;
      const available = DR.DRUM_SECTORS.map((prize) => DR.canWin(prize, freeSlot(s) >= 0, s.slots < I.MAX_SLOTS));
      const prize = DR.DRUM_SECTORS[DR.randomSector(available)];
      const item = DR.prizeItem(prize);
      if (item) s.shelf[freeSlot(s)] = item;
      else if (prize === 'ticket') gainTickets(s, g, 'drum', 1);
      else if (prize === 'slot') { s.slots += 1; s.shelf.push(null); }
      else if (prize === 'chips') earn(s, g, DR.drumChips(price)); // фишки барабана — доход забега, как ShopScene.winDrum
      g.drumSpins += 1;
    }
  }
  check(s, g);
}

// ---------- Коллектор ----------

/**
 * Расплата: 'paid' | 'survived' | 'secondWind' | 'dead'.
 * Фишек хватило — долг уходит, «Проценты» капают, за долг билет (CollectorScene.payDebt).
 * Не хватило — последний шанс (CollectorScene.startLastChance): одна чистая сетка и два действия, правила и
 * политика — в last-chance-sim.mjs. Победа: чемодан платит долг, фишки целы, билета нет, счёт −1 (269-277).
 * Провал: пока есть запас «второго дыхания» — забег живёт, запас тратится; запасов нет — KABOOM
 * (обычный забег — один запас, сделка №9 кладёт ещё). Кон к этому моменту уже забран
 * closeRound, серию последний шанс не трогает (startLastChance гасит только pot).
 */
function collector(s, g) {
  g.time += SECONDS.collector;
  if (s.balance >= s.debt) {
    s.balance -= s.debt;
    const interest = A.interestCoins(s.balance, ids(s));
    if (interest > 0) earn(s, g, interest); // проценты — доход забега (CollectorScene.payDebt), не штраф
    gainTickets(s, g, 'debt', A.TICKETS_PER_DEBT);
    check(s, g);
    return 'paid';
  }
  if (NO_LAST_CHANCE) {
    // Диагностика (SIM_NO_LAST_CHANCE=1): последнего шанса и «второго дыхания» нет — нехватка фишек сразу конец забега.
    // g.lastChances всё равно растёт: проверка «исходы последнего шанса = число шансов» иначе разошлась бы.
    g.lastChances += 1;
    g.dead += 1;
    return 'dead';
  }
  // Нехватка: сетка без амулетов, предметов, фазы и автомата — как CollectorScene.cleanWeight. Цель — от денег:
  // скольких фишек не хватило, множитель серии и множители выигрыша (амулеты и автомат, как в addToPot).
  const need = s.debt - s.balance;
  const streak = multiplier(s);
  const factor = A.winFactor(ids(s), s.bones) * M.machineWinFactor(s.machineId) * D.pactEffects(s.pacts, s.round).winMul;
  const lastChance = playLastChance({ round: s.round, diceDrought: s.diceDrought, need, streak, factor, balance: s.balance });
  g.lastChances += 1;
  g.lcActions += lastChance.actions;
  // Докупка действия (шаг 14) платится фишками на руках: банк уменьшается ровно на заплаченное.
  if (lastChance.paid > 0) s.balance -= lastChance.paid;
  g.lcBuys += lastChance.bought;
  g.lcPaid += lastChance.paid;
  g.time += SECONDS.lastChanceBuy * lastChance.bought;
  if (lastChance.instant) g.instantWins += 1;
  if (lastChance.firstWin && !lastChance.instant) g.firstActionWins += 1; // цель была побита уже после первого действия
  if (lastChance.firstWin && !lastChance.won) g.firstWinLost += 1; // второе действие снесло уже собранную победу
  g.time += SECONDS.lastChance;
  // Кривая для study(): где случался шанс, какая цель вышла из нехватки и побили ли её. goal — по правилу игры
  // (доля LAST_CHANCE_GOAL_SHARE), goalFull — та же цель при share = 1 («закрой весь долг»), для сравнения.
  // bought/paid — докупка шага 14: сколько действий куплено за шанс и сколько фишек за них отдано.
  g.collectorSamples.push({
    round: s.round, debt: s.debt, balance: s.balance, diceDrought: s.diceDrought,
    goal: lastChance.goal, goalFull: lastChance.goalFull, won: lastChance.won, actions: lastChance.actions,
    instant: lastChance.instant, firstWin: lastChance.firstWin, need, streak, factor,
    bought: lastChance.bought, paid: lastChance.paid,
  });
  if (lastChance.won) { g.survived += 1; return 'survived'; }
  if (s.secondWindLeft <= 0) { g.dead += 1; return 'dead'; } // запасы кончились — KABOOM
  s.secondWindLeft -= 1;
  g.secondWind += 1;
  g.time += SECONDS.secondWind;
  return 'secondWind';
}

// ---------- Забег ----------

/** Стратегия с оглядкой на SIM_MACHINE: диагностический забег на одном автомате, смена автомата выключена. */
export function envStrategy(strategy = BASE_STRATEGY) {
  const id = process.env.SIM_MACHINE;
  if (!id || !M.MACHINES.some((spec) => spec.id === id)) return strategy; // неизвестный автомат — обычная стратегия
  return { ...strategy, swapChance: 0, pinnedMachine: id };
}

export function runGame(st = BASE_STRATEGY, econ = defaultEcon()) {
  const g = {
    time: 0, tape: 'forSale', record: null, recordCounters: null, tapesBought: 0, tapeClosedAtBuy: 0, recs: 0, rewinds: 0,
    illegalRewinds: 0, maxClosed: 0, collectorSamples: [],
    lastChances: 0, survived: 0, secondWind: 0, dead: 0, instantWins: 0, firstActionWins: 0, firstWinLost: 0, lcActions: 0, lcBuys: 0, lcPaid: 0, attempts: 0, // последний шанс (шаг 68б) и докупка (шаг 14)
    freeSpinsGiven: 0, freeInRound: 0, freeMax: 0, crownEvents: 0, guardStops: 0, // бесплатные прокрутки: счётчик предохранителя, за раунд, максимум за раунд, срабатывания предохранителя
    shuffleUsed: 0, swapUsed: 0, // перемешка и подмена (шаг 63б): сколько раз применили
    normalSpins: 0, spins: 0, paidSpins: 0, // прокрутки: платные (заряд один на забег) и всего
    roundSpins: 0, maxRoundSpins: 0, roundsOverCap: 0, // прокруток в раунде: максимум и сколько раундов перевалило за потолок
    shops: 0, machineSwaps: 0, // автомат: сколько раз сменился сам в начале раунда
    amuletsBought: 0, socketsBought: 0, itemsBought: 0, slotsBought: 0, drumSpins: 0, paidEarly: 0,
    ticketsBought: 0, // билеты за фишки (шаг 13): сколько куплено за забег — от него растёт цена следующего
    activesBought: 0, amuletPresses: 0, pressesById: {}, // активные амулеты (шаг 12б): куплено и сколько раз нажато
    itemSlotsDenied: 0, // сколько раз предмет не включился: все 4 места в столбике заняты
    roundPaid: 0,
    firstSpinMult: 0, firstSpinRounds: 0, // средний множитель на первой платной прокрутке раунда (перенос серии)
    ticketsLedger: 0, ticketIncome: { debt: 0, early: 0, scatter: 0, jackpot: 0, drum: 0, pact: 0 }, // доход по источникам
    pactsOffered: 0, pactsTaken: 0, pactsRefused: 0, shopsClosed: 0, pactsById: {}, doubleTakes: 0, amuletsFree: 0, // сделки Дилера: сколько и каких взято
    violations: {}, safeguards: {},
  };
  let s = newRun();
  if (st.pinnedMachine) s.machineId = st.pinnedMachine; // диагностика: забег на одном автомате
  startRound(s, st, g);
  const debug = !!process.env.SIM_DEBUG;
  if (debug) console.log('round,debt,balance,pot,streak,spinsLeft,freeSpins,machine,tickets,closed');
  let guard = 0;
  for (; guard < 400; guard++) {
    g.attempts += 1; // попытка раунда: после спасения тот же долг играется заново
    s = playRound(s, st, g);
    g.maxClosed = Math.max(g.maxClosed, s.round - 1);
    // Победа (цель 1 000 000 набранных) кончает забег посреди раунда: раунд не докручивается, долг не платится,
    // магазина нет — так же, как CollectorScene.startVictory. Проверка после каждого шага, где могли прийти фишки.
    if (goalReached(s)) break;
    closeRound(s, st, g);
    if (goalReached(s)) break; // кон забрали в конце раунда — цель могла взяться и тут
    const res = collector(s, g);
    if (debug) {
      console.log([s.round, s.debt, s.balance, s.earned, s.pot, s.streak, s.spinsLeft, s.freeSpins, s.machineId, s.tickets, s.round - 1].join(','));
    }
    if (res === 'dead') break; // KABOOM: второе дыхание уже было
    if (goalReached(s)) break; // «Проценты» после долга перевалили цель
    // Выигранный последний шанс: счёт на один долг назад (WON_DEBT_ROUND_STEP = 2, магазин прибавит единицу → N − 1).
    // Провал («второе дыхание»): долг не закрыт — счёт не двигаем (FAILED_DEBT_ROUND_STEP = 1), следующий долг тот же.
    // Счёт раундов идёт назад — сроки сделок едут вместе с ним (CollectorScene: shiftPacts): сделка живёт
    // столько раундов, сколько их реально сыграно, а не «до номера раунда».
    const roundBefore = s.round;
    if (res === 'survived') s.round = Math.max(0, s.round - R.WON_DEBT_ROUND_STEP);
    else if (res === 'secondWind') s.round = Math.max(0, s.round - R.FAILED_DEBT_ROUND_STEP);
    s.pacts = D.shiftPacts(s.pacts, s.round - roundBefore);
    openShop(s, st, g, econ);
    if (goalReached(s)) break; // фишки барабана
    startRound(s, st, g);
  }
  g.maxClosed = Math.max(g.maxClosed, s.round - 1);
  return {
    closed: s.round - 1, guardHit: guard >= 400, ...g, record: undefined,
    // Итоги цели — с последнего состояния забега (после отката кассетой они тоже с записи).
    earned: s.earned, peakBalance: s.peakBalance, millionRound: s.millionRound, millionSeconds: s.millionSeconds,
    recordRound: s.recordRound, recordSeconds: s.recordSeconds,
  };
}

/**
 * Медиана списка: средняя кривая врёт из-за редких провалов, поэтому в отчётах по раундам — медиана.
 */
function medianOf(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** Сводка по готовым забегам. */
export function summarizeRuns(runs) {
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const sorted = runs.map((r) => r.closed).sort((a, b) => a - b);
  const minutes = runs.map((r) => r.time / 60).sort((a, b) => a - b);
  // Цель последнего шанса: медиана по всем приходам Коллектора (goal) и та же цель при share = 1 (goalFull).
  const samples = runs.flatMap((r) => r.collectorSamples);
  const goalAtCap = samples.filter((sample) => sample.goal >= LC.BEST_WITHOUT_JACKPOT).length / Math.max(samples.length, 1);
  // Докупка действия (шаг 14): где бот её брал и как часто такие шансы спасались — против шансов без докупки.
  const boughtSamples = samples.filter((sample) => sample.bought > 0);
  const freeSamples = samples.filter((sample) => !(sample.bought > 0));
  const rescueOf = (list) => (list.length ? list.filter((sample) => sample.won).length / list.length : 0);
  const violations = {};
  const safeguards = {};
  for (const run of runs) {
    for (const [name, count] of Object.entries(run.violations)) violations[name] = (violations[name] ?? 0) + count;
    for (const [name, count] of Object.entries(run.safeguards)) safeguards[name] = (safeguards[name] ?? 0) + count;
  }
  const income = (key) => mean((r) => r.ticketIncome[key]);
  // Забеги, дошедшие до цели: до них — медиана номера раунда и минут, когда 1 000 000 перевалил (millionRound).
  const won = runs.filter((r) => r.earned >= GOAL);
  // Дошедшие до 10 000 000 (CHIP_RECORD) — есть только в SIM_CHASE_RECORD=1: в обычном прогоне забег кончается на 1 млн.
  const reachedRecord = runs.filter((r) => r.earned >= RECORD);
  return {
    closed: mean((r) => r.closed), median: sorted[Math.floor(sorted.length / 2)], peak: mean((r) => r.maxClosed),
    // Цель забега: набрано за забег (медиана), пик баланса, доля забегов с 1 000 000 и когда это случилось.
    runs: runs.length, wonRuns: won.length, victory: won.length / runs.length,
    earnedMedian: medianOf(runs.map((r) => r.earned)), earnedMean: mean((r) => r.earned),
    peakBalanceMedian: medianOf(runs.map((r) => r.peakBalance)),
    millionRoundMedian: medianOf(won.map((r) => r.millionRound)),
    millionMinutesMedian: medianOf(won.map((r) => r.millionSeconds / 60)),
    // Рекорд 10 млн: сколько забегов дошло и когда (medianOf пустого списка — 0, это честный ноль, а не ошибка).
    recordRuns: reachedRecord.length, recordShare: reachedRecord.length / runs.length,
    recordRoundMedian: medianOf(reachedRecord.map((r) => r.recordRound)),
    recordMinutesMedian: medianOf(reachedRecord.map((r) => r.recordSeconds / 60)),
    first: mean((r) => (r.closed >= 1 ? 1 : 0)), ten: mean((r) => (r.maxClosed >= 10 ? 1 : 0)), best: sorted.at(-1),
    // Забег умер в 6-м раунде или раньше: после 5-го раунда ни один долг не закрыт (закрыто ≤ 5).
    flop5: mean((r) => (r.closed <= 5 ? 1 : 0)),
    minutes: mean((r) => r.time / 60), minutesMedian: minutes[Math.floor(minutes.length / 2)], over10: mean((r) => (r.time > 600 ? 1 : 0)),
    tapesBought: mean((r) => r.tapesBought), bought: mean((r) => (r.tapesBought > 0 ? 1 : 0)), rewinds: mean((r) => r.rewinds),
    illegalRewinds: mean((r) => r.illegalRewinds),
    // Последний шанс (шаг 68б): сколько раз приходил, сколько спасено, сколько из них мгновенно, дыхание и KABOOM.
    lastChances: mean((r) => r.lastChances), survived: mean((r) => r.survived), secondWind: mean((r) => r.secondWind),
    dead: mean((r) => r.dead), instantWins: mean((r) => r.instantWins), lcActions: mean((r) => r.lcActions),
    attempts: mean((r) => r.attempts), attemptsMedian: medianOf(runs.map((r) => r.attempts)), // попыток раунда за забег
    firstActionWins: mean((r) => r.firstActionWins), firstWinLost: mean((r) => r.firstWinLost),
    // Докупка действия (шаг 14): сколько куплено за забег, сколько фишек заплачено, сколько шансов с ней и без.
    lcBuys: mean((r) => r.lcBuys), lcPaid: mean((r) => r.lcPaid),
    buyChances: boughtSamples.length, buyChanceShare: boughtSamples.length / Math.max(samples.length, 1),
    buyRescue: rescueOf(boughtSamples), noBuyRescue: rescueOf(freeSamples),
    rescue: runs.reduce((a, r) => a + r.survived, 0) / Math.max(runs.reduce((a, r) => a + r.lastChances, 0), 1),
    rescuePerRun: mean((r) => (r.lastChances > 0 ? r.survived / r.lastChances : 0)), // среднее по забегам от долей: короче забег — сильнее вес
    instantShare: mean((r) => (r.lastChances > 0 ? r.instantWins / r.lastChances : 0)),
    secondWindMax: Math.max(...runs.map((r) => r.secondWind)), // со сделкой №9 максимум — SECOND_WIND_MAX = 2 использования за забег
    noChance: mean((r) => (r.lastChances === 0 ? 1 : 0)), // забеги, где последний шанс не приходил ни разу
    // Цель последнего шанса: медиана нужного множителя и доля приходов, где её закрывает только джекпот (потолок ×10).
    goalMedian: medianOf(samples.map((sample) => sample.goal)),
    goalFullMedian: medianOf(samples.map((sample) => sample.goalFull)),
    goalAtCap,
    guard: mean((r) => (r.guardHit ? 1 : 0)), // доля забегов, упёршихся в предохранитель 400 раундов (бот копит быстрее долга)
    shops: mean((r) => r.shops), spins: mean((r) => r.spins), paidSpins: mean((r) => r.paidSpins),
    maxRoundSpins: mean((r) => r.maxRoundSpins), overCap: mean((r) => r.roundsOverCap / Math.max(r.attempts, 1)), // доля раундов, где прокруток больше MAX_SPINS_PER_ROUND
    machineSwaps: mean((r) => r.machineSwaps),
    itemSlotsDenied: mean((r) => r.itemSlotsDenied), amulets: mean((r) => r.amuletsBought), sockets: mean((r) => r.socketsBought),
    // Активные амулеты (шаг 12б): сколько куплено за забег и сколько раз нажато, по видам.
    activesBought: mean((r) => r.activesBought), amuletPresses: mean((r) => r.amuletPresses),
    pressesById: Object.fromEntries(A.AMULETS.filter(A.isActive).map((amulet) => [amulet.id, mean((r) => r.pressesById[amulet.id] ?? 0)])),
    items: mean((r) => r.itemsBought), slots: mean((r) => r.slotsBought), drumSpins: mean((r) => r.drumSpins),
    ticketsBought: mean((r) => r.ticketsBought), // билеты за фишки (шаг 13) — сколько куплено за забег
    paidEarly: mean((r) => r.paidEarly),
    ticketIncome: { debt: income('debt'), early: income('early'), scatter: income('scatter'), jackpot: income('jackpot'), drum: income('drum'), pact: income('pact') },
    pactsTaken: mean((r) => r.pactsTaken), pactsRefused: mean((r) => r.pactsRefused), shopsClosed: mean((r) => r.shopsClosed),
    doubleTakes: mean((r) => r.doubleTakes), amuletsFree: mean((r) => r.amuletsFree),
    pactsById: Object.fromEntries(D.PACTS.map((spec) => [spec.id, mean((r) => r.pactsById[spec.id] ?? 0)])),
    firstSpinMult: mean((r) => (r.firstSpinRounds > 0 ? r.firstSpinMult / r.firstSpinRounds : 0)),
    crownEvents: mean((r) => r.crownEvents), freeMax: mean((r) => r.freeMax),
    guardStops: mean((r) => r.guardStops), guardRuns: runs.filter((r) => r.guardStops > 0).length / runs.length,
    // Режимы прокрутки (шаг 70): средние счётчики и доля спокойных среди платных.
    normalSpins: mean((r) => r.normalSpins),
    violations,
    safeguards,
  };
}

export function summarize(st, games, econ) {
  const runs = [];
  for (let i = 0; i < games; i++) runs.push(runGame(st, econ));
  return summarizeRuns(runs);
}

/**
 * Один проход: сводка забегов и разбивка последнего шанса по раундам — где он случался, какая была цель,
 * сколько не хватало, был ли он побит и сколько действий ушло. Этим живёт last-chance-sim.mjs.
 */
export function study(games = 2000) {
  const runs = [];
  const byRound = new Map(); // раунд → { deficit: [], goal: [], count, won, instant, actions }
  for (let game = 0; game < games; game++) {
    const run = runGame(BASE_STRATEGY, defaultEcon());
    runs.push(run);
    for (const sample of run.collectorSamples) {
      let row = byRound.get(sample.round);
      if (!row) {
        row = { deficit: [], goal: [], count: 0, won: 0, instant: 0, actions: 0 };
        byRound.set(sample.round, row);
      }
      row.deficit.push(sample.debt - sample.balance);
      row.goal.push(sample.goal);
      row.count += 1;
      if (sample.won) row.won += 1;
      if (sample.instant) row.instant += 1;
      row.actions += sample.actions;
    }
  }
  return { summary: summarizeRuns(runs), rounds: byRound, samples: runs.flatMap((run) => run.collectorSamples) };
}

const sum = (list) => list.reduce((a, b) => a + b, 0);

/** Короткие названия сделок для строки отчёта: полные — в dealerGame.PACTS, здесь только для печати. */
const PACT_SHORT = [
  ['double-step', 'шаг'], ['quiet-round', 'тихий'], ['tickets-shop', 'билеты'], ['skull-calm', 'тише'],
  ['soft-skull', 'мягкий'], ['price-up', 'цена'], ['cheap-shop', 'скидка'], ['full-insurance', 'страховка'],
  ['jackpot-weight', 'джекпот'], ['symbol-weight', 'символ'], ['debt-cut', 'долг'],
  ['machine-delay', 'автомат'], ['extra-breath', 'дыхание'], ['safe-bank', 'банк'], ['free-amulet', 'амулет'], ['double-take', 'дважды'],
];

export function report(name, x) {
  const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const pct = (n) => Math.round(n * 100) + '%';
  const chips = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  console.log(`${name.padEnd(44)} в конце ${f(x.closed)} (мед ${x.median}), пик ${f(x.peak)} (среднее максимумов по забегам), 1-й ${pct(x.first)}, 10+ ${pct(x.ten)}, после 5-го раунда без долгов ${pct(x.flop5)}, рекорд ${x.best} | ${f(x.minutes, 1)} мин (мед ${f(x.minutesMedian, 1)}, >10 ${pct(x.over10)}) | попыток раунда ${f(x.attempts, 1)} (мед ${x.attemptsMedian}), магазинов ${f(x.shops, 1)}, прокруток ${f(x.spins, 0)} (платных ${f(x.paidSpins, 0)}), макс. за раунд ${f(x.maxRoundSpins, 0)} (больше потолка в ${pct(x.overCap)} раундов) | кассет ${f(x.tapesBought)} (берут ${pct(x.bought)}), откатов ${f(x.rewinds)} | множитель 1-й прокрутки ${f(x.firstSpinMult)}, упёрлись в 400 раундов ${pct(x.guard)} | сид ${SEED ?? '—'} | нарушений ${f(sum(Object.values(x.violations)), 0)}, страховок ${f(sum(Object.values(x.safeguards)), 0)}`);
  console.log(`${''.padEnd(44)} последний шанс: шансов ${f(x.lastChances)} за забег (не было у ${pct(x.noChance)}), спасено ${pct(x.rescue)} (${f(x.survived)} из ${f(x.lastChances)}; среднее по забегам ${pct(x.rescuePerRun)}), мгновенных ${pct(x.instantShare)}, цель мед ×${f(x.goalMedian, 1)} (полная нехватка ×${f(x.goalFullMedian, 1)}, у потолка ×10 — ${pct(x.goalAtCap)}), цель побита после 1-го действия ${pct(x.firstActionWins / Math.max(x.lastChances, 1e-9))} (в т.ч. позже снесена ${pct(x.firstWinLost / Math.max(x.lastChances, 1e-9))}), второе дыхание ${f(x.secondWind)} (макс ${x.secondWindMax}), KABOOM ${f(x.dead)}, действий на шанс ${f(x.lcActions / Math.max(x.lastChances, 1e-9), 1)}, доля цели ${f(SHARE, 2)}`);
  // Докупка действия (шаг 14): сколько куплено и почём, и спасаются ли такие шансы чаще обычных.
  console.log(`${''.padEnd(44)} докупка действия: ${f(x.lcBuys)} за забег (заплачено ${chips(x.lcPaid)} фишек), шансов с докупкой ${x.buyChances} (${pct(x.buyChanceShare)}), спасено с докупкой ${pct(x.buyRescue)} / без ${pct(x.noBuyRescue)} | докупок ${BUY_RULES.max}, доли ${f(BUY_RULES.start, 2)}/${f(BUY_RULES.step, 2)}/${f(BUY_RULES.maxShare, 2)}${BUY_ON ? '' : ', выключена'}${BUY_GOAL_FROZEN ? ', цель заморожена' : ''}`);
  console.log(`${''.padEnd(44)} билеты: за долг ${f(x.ticketIncome.debt)}, ранняя оплата ${f(x.ticketIncome.early)}, 🎟×3 ${f(x.ticketIncome.scatter)}, джекпот ${f(x.ticketIncome.jackpot)}, барабан ${f(x.ticketIncome.drum)}, сделка ${f(x.ticketIncome.pact)} | сделок взято ${f(x.pactsTaken)}, отказов ${f(x.pactsRefused)}, магазинов закрыто сделкой ${f(x.shopsClosed)} | по видам (за забег): ${PACT_SHORT.map(([id, name]) => `${name} ${f(x.pactsById[id])}`).join(', ')} | вторых забираний ${f(x.doubleTakes)}, амулетов по сделке ${f(x.amuletsFree)} | автомат: смен ${f(x.machineSwaps, 0)} | куплено: амулетов ${f(x.amulets)}, гнёзд ${f(x.sockets)}, предметов ${f(x.items)}, мест ${f(x.slots)}, прокруток барабана ${f(x.drumSpins)}, ранних оплат ${f(x.paidEarly)} | отказов по местам ${f(x.itemSlotsDenied)} | билетов куплено ${f(x.ticketsBought)} за забег | активных куплено ${f(x.activesBought)}, нажатий ${f(x.amuletPresses)} (${A.AMULETS.filter(A.isActive).map((amulet) => `${amulet.id} ${f(x.pressesById[amulet.id])}`).join(', ')}) | фриспины до ${f(x.freeMax, 1)} за раунд, предохранитель ${B.FREE_SPINS_GUARD} срезал ${f(x.guardStops)} раз (у ${pct(x.guardRuns)} забегов) | заряд замаха ${f(CHARGE, 2)}`);
  // Строка цели: в SIM_CHASE_RECORD=1 к ней добавляется вторая ступень — 10 000 000 и кто до неё дошёл.
  const recordLine = CHASE_RECORD
    ? ` | рекорд ${chips(RECORD)}: взяли ${pct(x.recordShare)} (${x.recordRuns} из ${x.runs}), у дошедших: раунд мед ${f(x.recordRoundMedian, 0)}, минут мед ${f(x.recordMinutesMedian, 1)}`
    : '';
  console.log(`${''.padEnd(44)} цель ${chips(GOAL)}: набрано за забег мед ${chips(x.earnedMedian)} (среднее ${chips(x.earnedMean)}), пик табло мед ${chips(x.peakBalanceMedian)}, 1 млн взяли ${pct(x.victory)} (${x.wonRuns} из ${x.runs}) | у дошедших: раунд мед ${f(x.millionRoundMedian, 0)}, минут мед ${f(x.millionMinutesMedian, 1)}${recordLine}`);
}

/**
 * Блок инвариантов: печатается в конце прогона, суммой по всем вариантам.
 * Отдельно — 6 ПРОВЕРОК (ловят настоящую ошибку) и 8 СТРАХОВОК (правило уже держит код; сработают только после
 * чьей-то правки). Цель в обоих случаях — 0.
 */
export function invariantReport(summaries) {
  const total = {};
  const guarded = {};
  for (const x of summaries) {
    for (const [name, count] of Object.entries(x.violations)) total[name] = (total[name] ?? 0) + count;
    for (const [name, count] of Object.entries(x.safeguards)) guarded[name] = (guarded[name] ?? 0) + count;
  }
  const names = Object.keys(total);
  const guardsFired = Object.keys(guarded);
  if (names.length === 0) {
    console.log('проверки: 0 нарушений (5): долг из набора debtForRound + сдвиги сделок (№2, №12); все числа конечны; табло билетов = учёт и не в минусе; откат по правилу игры (запись есть, не из будущего); исходы последнего шанса = число шансов');
  } else {
    console.log('проверки: НАРУШЕНИЯ');
    for (const [name, count] of Object.entries(total).sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${count}`);
  }
  if (guardsFired.length === 0) {
    console.log(`страховки: 0 сработали (9) — правила держит сам код, это заслон на будущие правки: прокруток в раунде 0…30 и не меньше нуля, фриспинов за раунд ≤ ${B.FREE_SPINS_GUARD} (технический предохранитель, игрового потолка нет), включено предметов не больше мест в столбике (сделка №13 его укорачивает), источник билетов из шести, расход билетов ≤ остатка, кассета не раньше 3-го долга, серия на closeRound не меняется, бот откатывается только между прокрутками`);
  } else {
    console.log('страховки: СРАБОТАЛИ');
    for (const [name, count] of Object.entries(guarded).sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${count}`);
  }
  return { violations: total, safeguards: guarded };
}

if (import.meta.filename === process.argv[1]) {
  const raw = process.argv[2];
  const games = raw === undefined ? 5000 : Number(raw);
  if (!Number.isInteger(games) || games <= 0) {
    console.error(`нужно целое число забегов больше нуля, получено «${raw}»: node --import ./ts-resolve.mjs full-run.mjs 1000`);
    process.exit(1);
  }
  const econ = defaultEcon();
  const summaries = [];
  const pinned = envStrategy(BASE_STRATEGY);
  if (process.env.SIM_ROUNDS) {
    // Отдельный прогон: разбивка последнего шанса по раундам, диагноз цели и сводка вместо вариантов стратегии.
    const result = study(games);
    roundReport(result);
    chanceReport(result.samples);
    report('как в игре (study)', result.summary);
    summaries.push(result.summary);
  } else if (pinned.pinnedMachine) {
    // Диагностика «один автомат»: смена автомата выключена (swapChance 0).
    const name = `${pinned.pinnedMachine}, смена выключена${pinned.streakReset ? ' (серия сгорает)' : ''}`;
    const x = summarize(pinned, games, econ);
    summaries.push(x);
    report(name, x);
  } else {
    // По умолчанию два варианта — как в игре и сгорающая серия (их просят проверки). Забеги после шага 68б длинные,
    // поэтому остальные варианты включаются отдельно: SIM_VARIANTS=all.
    const variants = [
      ['как в игре (серия через раунд)', BASE_STRATEGY],
      ['серия сгорает в конце раунда', { ...BASE_STRATEGY, streakReset: true }],
    ];
    if (process.env.SIM_VARIANTS === 'all') {
      variants.push(['ранняя оплата, когда дают билет', { ...BASE_STRATEGY, payEarly: 'ticket' }]);
    }
    for (const [name, st] of variants) {
      const x = summarize(st, games, econ);
      summaries.push(x);
      report(name, x);
    }
  }
  invariantReport(summaries);
}

// Полный забег «Долговой ямы» на настоящих файлах логики — headless-симулятор баланса.
// Запуск из папки next-step:
//   node --import ./ts-resolve.mjs full-run.mjs [игр]   — два варианта стратегии: как в игре и со сгорающей серией
//   SIM_DEBUG=1        — строка на раунд: round, debt, balance, pot, streak, spinsLeft, freeSpins, автомат/уровень, tickets, closed
//   SIM_MACHINE=<id>   — забег на одном автомате (classic | greedy | quiet), переключение выключено
//   SIM_MACHINE_LEVEL=<1|2|3> — стартовый уровень этого автомата («машина × уровень»), SIM_MACHINE_BRANCH=<skull|spin>
//   SIM_ROUNDS=1       — вместо вариантов: последний шанс по раундам, распределение цели и ориентир «цель от долга»
//   SIM_VARIANTS=all   — добавить к двум вариантам раннюю оплату и выбор автомата
//   SIM_SEED=<число>   — подменить Math.random детерминированным ГКЧ: прогон повторяется, сид печатается в отчёте
//   SIM_CHASE_RECORD=1 — забег не кончается на 1 000 000: тот же забег идёт дальше до 10 000 000 (CHIP_RECORD) или смерти,
//                        как «ДАЛЬШЕ» на экране победы; в отчёт — доля дошедших до 10 млн и медиана их раунда и минут
//   SIM_NO_LAST_CHANCE=1 — диагностика без последнего шанса: нехватка фишек сразу конец забега (с ним спасается 95%
//                          и забег упирается в 14+ долгов — числа ничего не говорят о правилах)
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
// MachineScene — ржавчина и выбор автомата; BonusScene — короны, клевер, джекпот; PhaseScene — фазы;
// ShopScene — витрины по закрытым долгам, предметы, амулеты с гнёздами, барабан, прокачка автомата;
// SaveScene — кассета (запись и откат); DealerScene — игра Дилера; CollectorScene — расплата и последний шанс
// (последний шанс живёт в last-chance-sim.mjs). Правила и числа — из rules, patterns, items, amulets, evil,
// bonus, phases, levers, machines, drum, dealerGame, save; копий чисел в симуляторе нет.
//
// Политика игрока (BASE_STRATEGY) — это не правила игры, а выбор за игрока: «забрать», когда кон добирает долг
// или набирает долю долга; риск, молот, свеча и фарт — по своим порогам; бусты символов, перемешка и подмена —
// пока на долг не хватает; Дилер — лучшая стрелка, пока шанс ≥ 0,7; покупки в магазине по порядку «кассета →
// прокачка автомата → амулеты по AMULET_POWER → предметы по ITEM_ORDER → барабан» с резервом reserveShare долга
// (ряды витрины пополняются после покупки, как ShopScene.refillRow); автомат не переключается, ветка 3-го уровня —
// «череп», как ставит игра, а «прокрутка» — только если игрок так решил (machineBranch). AMULET_POWER, ITEM_ORDER
// и модель времени SECONDS (сколько секунд занимает действие на экране) — оценки игрока, не числа из src/game.
//
// Проверки и страховки — разные вещи, и в отчёте они считаются отдельно. 6 ПРОВЕРОК ловят настоящую ошибку: долг =
// debtForRound(раунд), все числа конечны, табло билетов = учёт и не в минусе, Σ уровней = независимый учёт
// (прокачка и откат), откат по правилу игры (запись есть, не из будущего), исходы последнего шанса = число шансов.
// 9 СТРАХОВОК повторяют то, что уже держит сам код (потолки прокруток и фриспинов, места в столбике, пять
// источников билетов, расход ≤ остатка, кассета не раньше 3-го долга, серия на closeRound, откат только между
// прокрутками) — они сработают только после чьей-то правки. Внизу прогона печатается «проверки: 0 нарушений»
// и «страховки: 0 сработали» отдельными строками.
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
//  • freeSpinsGiven кассетой не откатывается: в игре сцена после отката перезапускается и счётчик обнуляется,
//    то есть откат даёт полный потолок заново; здесь строже — фриспинов за раунд не больше;
//  • кассета откатывается по правилам игры (canRewind): запись может быть и из прошлого раунда — тогда откат
//    возвращает и круг, как SaveScene.loadTape. Исключение одно: уровни автоматов после такого отката падают до
//    записанных, а инвариант «Σ уровней» это разрешает только откату (учёт — g.levelExpectation);
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
import { chanceReport, playLastChance, roundReport, SHARE } from './last-chance-sim.mjs';

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
const AMULET_POWER = { bones: 5.39, boost: 5.11, interest: 5.09, insurance: 5.02, cut: 4.88, cherryPit: 4.69, vest: 4.66, greed: 4.61, piggy: 4.43, skullPocket: 4.41, bell: 4.08 };
const ITEM_ORDER = ['garlic', 'triple', 'cigarette', 'shield', 'cherries', 'bells', 'diamonds', 'luck', 'shuffle', 'swap', 'risk', 'hammer', 'candle', 'luckSpin'];
// Модель времени: сколько секунд занимает действие на экране. Числа не из игры — это оценка, для «минут забега».
// lastChance — весь эпизод: GOOD LUCK, чистая прокрутка, два действия, чемодан; secondWind — пауза перед магазином.
const SECONDS = { spin: 2.5, take: 1, dealer: 6, collector: 2.5, shop: 10, rewind: 5, rec: 1, lastChance: 12, secondWind: 2 };

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

/** SIM_PHASE_SKULL=<число> — как SIM_SEED: не число — падаем сразу, иначе вес черепа молча стал бы NaN. */
function phaseSkullFactor() {
  const raw = process.env.SIM_PHASE_SKULL;
  if (raw === undefined || raw === '') return 1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`SIM_PHASE_SKULL должен быть положительным числом, получено «${raw}»`);
  }
  return value;
}

export const BASE_STRATEGY = {
  takeShare: 0.5, shieldShare: 0.25, boostShare: 0.25, dealerChance: 0.7, reserveShare: 0.5, drumShare: 0.5,
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
  // Режим прокрутки (шаг 70): 'off' — выключено (обычные правила), 'risk', 'calm' | 'normal',
  // 'calm-risk' — пока серия меньше calmTo, крутить спокойно, потом рисковать (и только пока на долг не хватает).
  mode: 'off',
  calmTo: 5,
  // Деньги: отдавать долг раньше конца раунда ('none' | 'ticket' — только когда за это дают билет, earlyPayTickets).
  payEarly: 'none',
  // Автомат: 'sticky' — не переключать и качать тот, что стоит; 'by-level' — брать лучший по уровню и выплатам.
  machine: 'sticky',
  machineLevel: 0, // 0 — как в игре (1 → 2 → 3 по билетам); 1..3 — диагностический пин уровня (SIM_MACHINE_LEVEL)
  machineBranch: 'skull', // ветка 3-го уровня: как в игре по умолчанию 'skull' (−10% черепа); 'spin' — +1 прокрутка, если так решил игрок
  // Серия: false — как в коде (переходит в следующий раунд), true — второй набор чисел (сгорает на конце раунда).
  streakReset: false,
};

/** Цена кассеты — как в игре (save.ts: 2, 3, 4… по купленным). econ оставлен для старых файлов рядом (tape45-sim). */
export function defaultEcon() {
  return { tapePrice: (bought) => S.tapePrice(bought) };
}

const clone = (value) => structuredClone(value);
// Амулеты по копиям: в гнёздах лежат уникальные (s.amulets), а копии — счётчиком (шаг 62б).
const ids = (s) => A.amuletIdsFrom(s.amuletCounts);
// Автомат, который стоит сейчас: его уровень и ветка из записи забега (BaseScene.machineState).
const mach = (s) => s.machineSet[s.machineId];
const levelSum = (s) => M.MACHINES.reduce((sum, spec) => sum + s.machineSet[spec.id].level, 0);

function newRun() {
  return {
    round: 1, debt: R.debtForRound(1), balance: 0, tickets: 0, spinsLeft: R.SPINS_PER_ROUND, pot: 0, streak: 0,
    slots: I.START_SLOTS, shelf: new Array(I.START_SLOTS).fill(null), effects: I.noEffects(), sockets: A.START_SOCKETS,
    amulets: [], amuletCounts: {}, bones: 0, roundShields: 0,
    machineSet: M.newMachineSet(), machineId: 'classic', // BaseScene: все трое с первого уровня, стоит классический
    diceDrought: 0, isBloodNext: false, luckyClovers: 0, freeSpins: 0, phase: PH.PHASES[0], rustyColumn: null, lastGrid: null,
    mode: 'normal', // режим следующей платной прокрутки (шаг 70): переключается в playRound — modeFor
    // Цель забега (решение автора 2026-11-14): earned — все приходы фишек за забег (BaseScene.earn), не баланс.
    // peakBalance — самый большой баланс за забег; millionRound/millionSeconds — когда earned перевалил CHIP_GOAL.
    earned: 0, peakBalance: 0, millionRound: null, millionSeconds: null,
    recordRound: null, recordSeconds: null, // когда earned перевалил 10 000 000 (CHIP_RECORD) — для SIM_CHASE_RECORD
    secondWindUsed: false, // «второе дыхание» тратится один раз за забег (failLastChance); кассета его не возвращает
    insuranceUsed: false, // страховка сработала в этом раунде — второй сгоревший кон она не спасёт
  };
}

/**
 * Режим следующей платной прокрутки (шаг 70). 'off' — выключено (обычные правила), 'risk' и 'calm' — прямо;
 * 'calm-risk' — пока серия меньше calmTo, крутить спокойно (серия +1 без черепов), потом рисковать;
 * на долг уже хватает — обычные прокрутки, рисковать незачем. 'risk-behind' — риск, только пока на долг не хватает.
 */
function modeFor(s, st) {
  if (st.mode === 'calm-risk') {
    if (s.balance >= s.debt) return 'normal';
    return s.streak < st.calmTo ? 'calm' : 'risk';
  }
  if (st.mode === 'risk-behind') return s.balance >= s.debt ? 'normal' : 'risk';
  if (st.mode === 'off') return 'normal';
  return st.mode; // 'normal' | 'risk' | 'calm'
}

/**
 * Вес символа в прокрутке — точный порядок RoundScene.symbolWeight (162-172): автомат → амулеты → бусты →
 * риск и фарт → режим → чистая прокрутка. Фазы здесь больше нет (замечание 19): доля черепа растёт по раундам
 * в rules.ts, а фаза 2 добавляет прокрутку в startRound. SIM_SKULL_SHARE=constant возвращает старую постоянную долю.
 */
function weightOf(s, isFree) {
  const machine = mach(s);
  const base = R.weightsForRound(s.round, E.diceWeight(s.diceDrought));
  const owned = ids(s);
  // Старая доля: сумма весов остальных как в weightsForRound, череп = остальные × 26/95 (как SKULL_RATIO до правки).
  let others = 0;
  for (const symbol of R.SYMBOLS) if (!R.isSkull(symbol) && !R.isDice(symbol)) others += base(symbol);
  const legacySkull = others * LEGACY_SKULL_RATIO;
  return (symbol) => {
    if (!M.machineSymbolAllowed(machine, symbol)) return 0; // «Тихий»: нет паука, замка, крови и клевера
    const baseWeight = SKULL_SHARE_CONSTANT && R.isSkull(symbol) ? legacySkull : base(symbol);
    const skullFactor = R.isSkull(symbol) ? M.machineSkullFactor(machine) : 1; // «Жадный», ветка «череп»
    const machined = A.amuletWeight(symbol, baseWeight, owned) * skullFactor; // огранка, череп в кармане
    let weight = I.boostWeight(symbol, machined, s.effects); // чеснок, вишни, колокола, алмазы, удача
    if (s.effects.risk && R.isSkull(symbol)) weight *= I.RISK_SKULL_FACTOR; // риск: черепа втрое чаще
    if (s.effects.luckSpin && R.isSkull(symbol)) weight = 0; // фарт: на этой прокрутке черепов нет
    weight = L.modeWeight(symbol, weight, isFree ? 'normal' : s.mode); // режим прокрутки (шаг 70)
    // До замечания 19 фаза 2 множила вес черепа (phase2SkullFactor = 1,2). SIM_PHASE_SKULL=1.2 возвращает это.
    if (R.isSkull(symbol) && s.phase.number >= 2) weight *= LEGACY_PHASE_SKULL;
    return isFree ? B.freeSpinWeight(symbol, weight) : weight;
  };
}

// Шаг множителя в фазе 2: phase2MultiplierBonus = 0 (окно показывает ×1, ×2, ×3). SIM_PHASE_STEP=2 —
// старый +1, и он действовал только во второй фазе (phase2MultiplierBonus лежал в данных фазы 2), в первой шаг 1.
const multiplier = (s) => R.multiplierForStreak(
  s.streak,
  A.multiplierStep(ids(s)) + s.phase.multiplierBonus + (LEGACY_PHASE_STEP && s.phase.number >= 2 ? 1 : 0),
);

// Цену символа для цели последнего шанса считает игра (lastChance.chancePrice) — своей копии здесь нет.

// ---------- Учёт (билеты, инварианты) ----------

/**
 * Две двери для нарушений.
 *  • violate — ПРОВЕРКА: сравнивает состояние с независимым расчётом или с правилом игры; такое может сработать
 *    только при настоящей ошибке в логике симулятора.
 *  • guard — СТРАХОВКА от будущих правок: правило уже обеспечено кодом (потолок ставит spinsAfterBonus, место
 *    проверяет useItem, кассету не продают до 3-го долга), и сработать она может лишь после чьей-то правки.
 * В отчёте они считаются и печатаются отдельно, чтобы «0 нарушений» не выдавалось за 10 независимых проверок.
 */
function violate(g, name) {
  g.violations[name] = (g.violations[name] ?? 0) + 1;
}

function guard(g, name) {
  g.safeguards[name] = (g.safeguards[name] ?? 0) + 1;
}

/** Доход билетов: только пять источников из кода. Источник — страховка (вызовы с литералами), сумма — проверка. */
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

const FINITE = ['round', 'debt', 'balance', 'earned', 'peakBalance', 'tickets', 'spinsLeft', 'pot', 'streak', 'luckyClovers', 'freeSpins'];

/**
 * Общая проверка состояния. Зовётся после раунда, прокрутки, магазина и отката.
 * Здесь только настоящие проверки (долг, конечность, табло билетов, уровни, неотрицательные билеты); потолки,
 * места и прочее, что уже обеспечено кодом, живут в guard-ах на своих местах.
 */
function check(s, g) {
  if (s.debt !== R.debtForRound(s.round)) violate(g, 'долг ≠ debtForRound(раунд)');
  if (!FINITE.every((key) => Number.isFinite(s[key]))) violate(g, 'в состоянии NaN или ∞');
  if (s.tickets !== g.ticketsLedger) violate(g, 'билеты: табло не сходится с учётом');
  if (s.tickets < 0) violate(g, 'билеты ушли в минус');
  // Уровни меняет только прокачка (+1) и откат (возврат к записи): учёт — в upgradeMachine и rewind.
  if (levelSum(s) !== g.levelExpectation) violate(g, 'Σ уровней разошлась с учётом прокачки и отката');
  if (g.survived + g.secondWind + g.dead !== g.lastChances) violate(g, 'исходы последнего шанса не сходятся с числом шансов');
  checkGuards(s, g);
}

/** Потолки и правила, которые уже обеспечены кодом: сработать могут только после правки. */
function checkGuards(s, g) {
  if (s.spinsLeft < 0 || s.spinsLeft > R.MAX_SPINS_PER_ROUND) guard(g, 'прокруток в раунде вне 0…MAX_SPINS_PER_ROUND');
  if (g.freeSpinsGiven > B.MAX_FREE_SPINS_PER_ROUND) guard(g, 'фриспинов за раунд больше потолка');
  if (I.activeSlotEffects(s.effects).length > I.EFFECT_SLOTS) guard(g, 'включено больше EFFECT_SLOTS предметов');
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

/** Забрать кон на табло. isRoundEnd — кон забирается сам в конце раунда: серию не режем (KABOOM её обнулит). */
function payPot(s, g, isRoundEnd = false) {
  let amount = s.pot;
  if (s.effects.tripleTakes > 0) { s.effects.tripleTakes -= 1; amount *= I.TRIPLE_TAKE_FACTOR; }
  earn(s, g, amount); s.pot = 0;
  if (s.effects.candle) s.effects.candle = false; // свеча: это «забрать» серию не режет
  else if (!isRoundEnd) s.streak = R.streakAfterTake(s.streak);
}

/** Новый раунд. Серию НЕ трогаем: в коде она переходит в следующий раунд (BaseScene → RoundScene.startRound). */
function startRound(s, st, g) {
  const owned = ids(s);
  // Фаза — по закрытым долгам (checkPhase); ставим её до прокруток: она даёт phase2BonusSpins (замечание 19).
  s.phase = PH.phaseAt(s.round - 1);
  const plan = A.spinsPerRound(R.SPINS_PER_ROUND, owned) + M.machineBonusSpins(mach(s)); // как RoundScene.startRound, без потолка
  s.spinsLeft = PHASE_BONUS_SPINS ? R.spinsAfterBonus(plan, s.phase.bonusSpins) : plan; // потолок прокруток — как в игре
  s.roundShields = A.vestShields(owned);
  s.isBloodNext = false; // кровь не переходит в новый раунд
  s.insuranceUsed = false; // страховка снова готова: одна на раунд
  g.freeSpinsGiven = 0; // потолок бесплатных прокруток — на раунд
  g.freeInRound = 0;
  g.roundPaid = 0;
  I.clearRoundEffects(s.effects); // бусты и флаги прошлого раунда не переходят в новый
  check(s, g);
}

function closeRound(s, st, g) {
  const streakBefore = s.streak;
  s.isBloodNext = false; s.luckyClovers = 0; s.rustyColumn = null;
  if (s.pot > 0) payPot(s, g, true); // кон забирается сам — серия остаётся
  I.clearRoundEffects(s.effects);
  if (st.streakReset) s.streak = 0; // ВТОРОЙ набор чисел: серия сгорает в конце раунда (в коде — нет)
  else if (s.streak !== streakBefore) guard(g, 'серия меняется на closeRound'); // её держит payPot(isRoundEnd = true)
  // Прокруток за раунд: в игре MAX_SPINS_PER_ROUND ограничивает только текущее число (spinsAfterBonus), а сумма
  // за раунд растёт от колокольчиков, сигарет и джекпота — считаем её отдельно.
  if (g.roundSpins > g.maxRoundSpins) g.maxRoundSpins = g.roundSpins;
  if (g.roundSpins > R.MAX_SPINS_PER_ROUND) g.roundsOverCap += 1;
  g.roundSpins = 0;
}

/** Игра Дилера: ставка — кон (пустой — Дилер ставит), угадываем лучшей стрелкой, пока шанс ≥ dealerChance. */
function dealer(s, st, g) {
  g.time += SECONDS.dealer;
  let stake = D.dealerStake(s.pot, s.debt);
  let card = D.randomCard();
  for (let first = true; ; first = false) {
    const dir = D.guessChance(card, 'higher') >= D.guessChance(card, 'lower') ? 'higher' : 'lower';
    if (!first && D.guessChance(card, dir) < st.dealerChance) break;
    const next = D.randomCard();
    if (!D.isGuessRight(card, next, dir)) { s.pot = 0; return; }
    stake = Math.round(stake * D.winFactor(dir)); card = next;
  }
  s.pot = stake;
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

/** Короны → бесплатные прокрутки (с потолком), клевер → удача следующей, джекпот → билеты и прокрутки. */
function collectBonuses(s, g, grid, result) {
  const want = B.freeSpinsFor(B.countCrowns(grid)); // сколько дали бы без потолка
  const free = Math.min(want, B.MAX_FREE_SPINS_PER_ROUND - g.freeSpinsGiven); // потолок за раунд
  if (want > 0) g.crownEvents += 1;
  if (want > free) {
    g.freeCapped += 1;
    if (s.effects.symbolBoost.crown) g.capWithLuck += 1;
    else g.capNoLuck += 1;
  }
  if (free > 0) {
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
 * (insuranceUsed), иначе второй сгоревший кон она бы тоже спасла (RoundScene.burnPot).
 */
function burnPot(s, g) {
  const lost = s.pot;
  const refund = s.insuranceUsed ? 0 : A.insuranceRefund(lost, ids(s));
  s.pot = 0;
  s.streak = 0;
  if (refund > 0) {
    s.insuranceUsed = true;
    earn(s, g, refund); // страховка одноразовая: флаг insuranceUsed её гасит до конца раунда; возврат — доход забега
  }
}

/** Одна прокрутка (обычная или бесплатная) с итогом — как RoundScene.roll + evaluateSpin. Вернёт, сколько сгорело. */
function roll(s, st, g, isFree) {
  g.time += SECONDS.spin;
  g.spins += 1;
  g.roundSpins += 1; // сумма прокруток за раунд (для проверки «потолок не ограничивает сумму»)
  if (!isFree) g.paidSpins += 1;
  const mode = isFree ? 'normal' : s.mode; // бесплатные прокрутки идут обычными правилами (шаг 70)
  const calm = mode === 'calm'; // спокойная прокрутка — по названию режима, а не по нулевому выигрышу
  if (!isFree) {
    if (mode === 'calm') g.calmSpins += 1;
    else if (mode === 'risk') g.riskSpins += 1;
    else g.normalSpins += 1;
  }
  const mult = multiplier(s);
  const w = weightOf(s, isFree);
  // В спокойной прокрутке клевер не тратится (выплат нет) и заевший столбец не переносится: в нём могли быть черепа и кубик.
  let grid;
  if (!calm && s.luckyClovers > 0) { const clovers = s.luckyClovers; s.luckyClovers = 0; grid = B.luckyGrid(w, clovers); }
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
      burned = s.pot;
      burnPot(s, g);
      if (isBloody) s.balance -= E.bloodBurn(s.balance); // кровавая прокрутка: сгорает ещё и часть табло
    }
  } else {
    s.streak += 1; // серия растёт всегда — и в спокойной прокрутке
    if (!calm) {
      if (result.kind === 'win') {
        const win = A.amuletPatternWin(result.hits, owned);
        const factor = A.winFactor(owned, s.bones) * (isBloody ? E.BLOOD_WIN : 1) * M.machineWinFactor(mach(s)) * (s.effects.risk ? I.RISK_WIN_FACTOR : 1) * L.winModeFactor(mode);
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
    if (I.takesEffectSlot(id) && I.activeSlotEffects(s.effects).length >= I.EFFECT_SLOTS) {
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
  if (take && s.pot > 0) { payPot(s, g); g.time += SECONDS.take; }
}

// ---------- Кассета (SaveScene) ----------

/** Что попадает на кассету — поля RunSave из save.ts, которые есть в симуляторе. */
function runSave(s) {
  return {
    round: s.round, spinsLeft: s.spinsLeft, pot: s.pot, streak: s.streak, isBloodNext: s.isBloodNext,
    luckyClovers: s.luckyClovers, roundShields: s.roundShields, debt: s.debt, balance: s.balance, tickets: s.tickets,
    slots: s.slots, shelf: s.shelf, effects: s.effects, sockets: s.sockets, amulets: s.amulets,
    amuletCounts: s.amuletCounts, bones: s.bones, machineSet: s.machineSet, machineId: s.machineId,
    diceDrought: s.diceDrought, secondWindUsed: s.secondWindUsed, insuranceUsed: s.insuranceUsed,
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
  const recordedLevels = levelSum({ machineSet: back.machineSet }); // сколько уровней было на записи
  back.secondWindUsed = s.secondWindUsed || (saved.secondWindUsed ?? false);
  back.insuranceUsed = (saved.round === s.round ? s.insuranceUsed : false) || (saved.insuranceUsed ?? false);
  g.tape = 'forSale'; g.record = null; g.time += SECONDS.rewind; g.rewinds += 1;
  Object.assign(s, back);
  Object.assign(g, g.recordCounters ?? {}); // счётчики прокруток — как на записи
  g.recordCounters = null;
  g.levelExpectation = recordedLevels; // учёт уровней: после отката они ровно такие, как на записи (проверит check)
  g.ticketsLedger = back.tickets; // билеты вернулись к записи — сверка табло начинается заново
  s.rustyColumn = null; s.lastGrid = null; s.freeSpins = 0; s.mode = 'normal'; // заморозок и прошлой сетки в записи нет
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
    while (s.freeSpins > 0) { s.freeSpins -= 1; roll(s, st, g, true); }
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
    s.mode = modeFor(s, st); // режим платной прокрутки — после предметов и «забрать»
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

/** Какой автомат встанет на место со следующего раунда. Выбор бесплатный, уровни всех трёх остаются в записи. */
function pickMachine(s, st) {
  if (st.machine !== 'by-level') return s.machineId; // 'sticky': не переключаем
  let best = s.machineId;
  let bestScore = -Infinity;
  for (const spec of M.MACHINES) {
    const state = s.machineSet[spec.id];
    const score = state.level * 10 + spec.winFactor; // уровень дороже всего: прокачка одного не пропадает
    if (score > bestScore) { bestScore = score; best = spec.id; }
  }
  return best;
}

/** Прокачка выбранного автомата за билеты (ур.1→2 — 1 билет, ур.2→3 — 3) и ветка третьего уровня. */
function upgradeMachine(s, st, g, id) {
  for (let guard = 0; guard < 3; guard++) {
    const state = s.machineSet[id];
    if (st.machineLevel > 0 && state.level >= st.machineLevel) break; // диагностический пин уровня
    const price = M.machineUpgradePrice(state);
    if (price === null || price > s.tickets) break;
    spendTickets(s, g, price);
    const upgraded = M.upgradedMachine(state);
    // Третий уровень без ветки — покупка без бонуса: ShopScene.upgradeMachine ставит «череп», потом игрок меняет кнопкой.
    s.machineSet[id] = upgraded.level === 3 && upgraded.branch === null ? { ...upgraded, branch: st.machineBranch } : upgraded;
    g.machineUpgrades += 1;
    g.levelExpectation += 1; // учёт уровней: только прокачка их прибавляет, откат возвращает к записи
  }
  const finalState = s.machineSet[id];
  if (finalState.level >= 3 && finalState.branch !== st.machineBranch) { // выбор ветки бесплатный, до ухода из магазина
    finalState.branch = st.machineBranch;
    g.machineBranches += 1;
  }
}

/** Магазин после отданного долга: раунд +1, новый долг, витрины по закрытым долгам, покупки. */
function openShop(s, st, g, econ) {
  g.time += SECONDS.shop;
  g.shops += 1;
  s.round += 1;
  s.debt = R.debtForRound(s.round); // долг не зависит от автомата (characterDebt больше нет)
  const closed = s.round - 1; // closedDebts(): раунд уже увеличен
  const nextId = pickMachine(s, st);
  if (nextId !== s.machineId) g.machinePicks += 1;
  const next = s.machineSet[nextId];
  check(s, g);
  // Витрина — под автомат, который будет играть раунд: «Удача» у «Тихого» бесполезна (клевера там нет).
  const offer = I.randomOffer(s.round, (item) => M.machineItemAllowed(next, item));
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
    const price = econ.tapePrice(g.tapesBought, closed);
    if (price > s.tickets) return;
    spendTickets(s, g, price);
    g.tapesBought += 1;
    g.tapeClosedAtBuy = closed; // для инварианта: кассета не раньше третьего закрытого долга
    g.tape = 'blank';
  };
  if (st.tape === 'first') buyTape();
  upgradeMachine(s, st, g, nextId); // сначала дешёвая постоянная прибавка: 1 билет за 2-й уровень
  // Амулеты по силе; копия не требует свободного гнезда (шаг 62б), новому амулету — гнездо (отдельная покупка за билеты).
  if (closed >= 1) {
    for (const amulet of [...amuletOffer].sort((a, b) => AMULET_POWER[b.id] - AMULET_POWER[a.id])) {
      if (A.countOf(s.amuletCounts, amulet.id) >= amulet.maxCopies) continue;
      const socket = s.amulets.findIndex((a) => a.id === amulet.id); // гнездо этого амулета; −1 — такого ещё нет
      const price = A.amuletPrice(amulet);
      if (price > s.tickets) continue;
      if (socket < 0 && s.amulets.length >= s.sockets) {
        const sp = A.socketPrice(s.sockets);
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
  const isAllowed = (item) => M.machineItemAllowed(next, item);
  const buyItem = (row) => {
    const item = offer[row];
    const price = I.itemPrice(item, s.debt);
    if (freeSlot(s) < 0) {
      const slot = I.slotPrice(s.slots, s.debt);
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
      const price = DR.drumPrice(spins, s.debt);
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
  s.machineId = nextId; // leaveShop: выбранный автомат встаёт на место
  check(s, g);
}

// ---------- Коллектор ----------

/**
 * Расплата: 'paid' | 'survived' | 'secondWind' | 'dead'.
 * Фишек хватило — долг уходит, «Проценты» капают, за долг билет (CollectorScene.payDebt).
 * Не хватило — последний шанс (CollectorScene.startLastChance): одна чистая сетка и два действия, правила и
 * политика — в last-chance-sim.mjs. Победа: чемодан платит долг, фишки целы, билета нет, счёт −1 (269-277).
 * Провал: первое за забег — «второе дыхание», второе — KABOOM (283-296). Кон к этому моменту уже забран
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
  const factor = A.winFactor(ids(s), s.bones) * M.machineWinFactor(mach(s));
  const lastChance = playLastChance({ round: s.round, diceDrought: s.diceDrought, need, streak, factor });
  g.lastChances += 1;
  g.lcActions += lastChance.actions;
  if (lastChance.instant) g.instantWins += 1;
  if (lastChance.firstWin && !lastChance.instant) g.firstActionWins += 1; // цель была побита уже после первого действия
  if (lastChance.firstWin && !lastChance.won) g.firstWinLost += 1; // второе действие снесло уже собранную победу
  g.time += SECONDS.lastChance;
  // Кривая для study(): где случался шанс, какая цель вышла из нехватки и побили ли её. goal — по правилу игры
  // (доля LAST_CHANCE_GOAL_SHARE), goalFull — та же цель при share = 1 («закрой весь долг»), для сравнения.
  g.collectorSamples.push({
    round: s.round, debt: s.debt, balance: s.balance, diceDrought: s.diceDrought,
    goal: lastChance.goal, goalFull: lastChance.goalFull, won: lastChance.won, actions: lastChance.actions,
    instant: lastChance.instant, firstWin: lastChance.firstWin, need, streak, factor,
  });
  if (lastChance.won) { g.survived += 1; return 'survived'; }
  if (s.secondWindUsed) { g.dead += 1; return 'dead'; } // дыхание уже потрачено — KABOOM
  s.secondWindUsed = true;
  g.secondWind += 1;
  g.time += SECONDS.secondWind;
  return 'secondWind';
}

// ---------- Забег ----------

/** Стратегия с оглядкой на SIM_MACHINE / SIM_MACHINE_LEVEL / SIM_MACHINE_BRANCH: диагностический забег на одном автомате. */
export function envStrategy(strategy = BASE_STRATEGY) {
  const id = process.env.SIM_MACHINE;
  if (!id || !M.MACHINES.some((spec) => spec.id === id)) return strategy; // неизвестный автомат — обычная стратегия
  const level = Number(process.env.SIM_MACHINE_LEVEL ?? 0);
  // Ветка — политика, а не часть диагностики: без SIM_MACHINE_BRANCH остаётся та, что в стратегии («череп», как в игре).
  const branch = process.env.SIM_MACHINE_BRANCH === 'spin' ? 'spin' : strategy.machineBranch;
  return { ...strategy, machine: 'sticky', machineLevel: Number.isFinite(level) && level > 0 ? level : 0, machineBranch: branch, pinnedMachine: id };
}

export function runGame(st = BASE_STRATEGY, econ = defaultEcon()) {
  const g = {
    time: 0, tape: 'forSale', record: null, recordCounters: null, tapesBought: 0, tapeClosedAtBuy: 0, recs: 0, rewinds: 0,
    illegalRewinds: 0, maxClosed: 0, collectorSamples: [],
    lastChances: 0, survived: 0, secondWind: 0, dead: 0, instantWins: 0, firstActionWins: 0, firstWinLost: 0, lcActions: 0, attempts: 0, // последний шанс (шаг 68б)
    freeSpinsGiven: 0, freeInRound: 0, freeMax: 0, crownEvents: 0, freeCapped: 0, capWithLuck: 0, capNoLuck: 0, // потолок фриспинов
    shuffleUsed: 0, swapUsed: 0, // перемешка и подмена (шаг 63б): сколько раз применили
    normalSpins: 0, riskSpins: 0, calmSpins: 0, spins: 0, paidSpins: 0, // прокрутки: режимы (шаг 70) и всего
    roundSpins: 0, maxRoundSpins: 0, roundsOverCap: 0, // прокруток в раунде: максимум и сколько раундов перевалило за потолок
    shops: 0, machineUpgrades: 0, machinePicks: 0, machineBranches: 0, // автомат: прокачки, выборы, ветки
    amuletsBought: 0, socketsBought: 0, itemsBought: 0, slotsBought: 0, drumSpins: 0, paidEarly: 0,
    itemSlotsDenied: 0, // сколько раз предмет не включился: все 4 места в столбике заняты
    roundPaid: 0,
    firstSpinMult: 0, firstSpinRounds: 0, // средний множитель на первой платной прокрутке раунда (перенос серии)
    ticketsLedger: 0, ticketIncome: { debt: 0, early: 0, scatter: 0, jackpot: 0, drum: 0 }, // доход по источникам
    levelExpectation: 0, violations: {}, safeguards: {},
  };
  let s = newRun();
  if (st.pinnedMachine) { // диагностика: забег на одном автомате, сразу с нужным уровнем
    s.machineId = st.pinnedMachine;
    if (st.machineLevel > 0) s.machineSet[s.machineId] = { id: s.machineId, level: st.machineLevel, branch: st.machineLevel >= 3 ? st.machineBranch : null };
  }
  g.levelExpectation = levelSum(s); // учёт уровней: дальше их меняют только прокачка (+1) и откат (к записи)
  startRound(s, st, g);
  const debug = !!process.env.SIM_DEBUG;
  if (debug) console.log('round,debt,balance,pot,streak,spinsLeft,freeSpins,machine/level,tickets,closed');
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
      console.log([s.round, s.debt, s.balance, s.earned, s.pot, s.streak, s.spinsLeft, s.freeSpins, `${s.machineId}/${mach(s).level}`, s.tickets, s.round - 1].join(','));
    }
    if (res === 'dead') break; // KABOOM: второе дыхание уже было
    if (goalReached(s)) break; // «Проценты» после долга перевалили цель
    // Победа в последнем шансе и «второе дыхание» стоят одного долга: счёт на один назад (CollectorScene.ts:274, 293),
    // магазин прибавит единицу — следующий раунд N − 1.
    if (res === 'survived' || res === 'secondWind') s.round = Math.max(0, s.round - 2);
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
    rescue: runs.reduce((a, r) => a + r.survived, 0) / Math.max(runs.reduce((a, r) => a + r.lastChances, 0), 1),
    rescuePerRun: mean((r) => (r.lastChances > 0 ? r.survived / r.lastChances : 0)), // среднее по забегам от долей: короче забег — сильнее вес
    instantShare: mean((r) => (r.lastChances > 0 ? r.instantWins / r.lastChances : 0)),
    secondWindMax: Math.max(...runs.map((r) => r.secondWind)), // по правилам не больше 1 за забег
    noChance: mean((r) => (r.lastChances === 0 ? 1 : 0)), // забеги, где последний шанс не приходил ни разу
    // Цель последнего шанса: медиана нужного множителя и доля приходов, где её закрывает только джекпот (потолок ×10).
    goalMedian: medianOf(samples.map((sample) => sample.goal)),
    goalFullMedian: medianOf(samples.map((sample) => sample.goalFull)),
    goalAtCap,
    guard: mean((r) => (r.guardHit ? 1 : 0)), // доля забегов, упёршихся в предохранитель 400 раундов (бот копит быстрее долга)
    shops: mean((r) => r.shops), spins: mean((r) => r.spins), paidSpins: mean((r) => r.paidSpins),
    maxRoundSpins: mean((r) => r.maxRoundSpins), overCap: mean((r) => r.roundsOverCap / Math.max(r.attempts, 1)), // доля раундов, где прокруток больше MAX_SPINS_PER_ROUND
    machines: mean((r) => r.machineUpgrades), machinePicks: mean((r) => r.machinePicks), machineBranches: mean((r) => r.machineBranches),
    itemSlotsDenied: mean((r) => r.itemSlotsDenied), amulets: mean((r) => r.amuletsBought), sockets: mean((r) => r.socketsBought),
    items: mean((r) => r.itemsBought), slots: mean((r) => r.slotsBought), drumSpins: mean((r) => r.drumSpins),
    paidEarly: mean((r) => r.paidEarly),
    ticketIncome: { debt: income('debt'), early: income('early'), scatter: income('scatter'), jackpot: income('jackpot'), drum: income('drum') },
    firstSpinMult: mean((r) => (r.firstSpinRounds > 0 ? r.firstSpinMult / r.firstSpinRounds : 0)),
    crownEvents: mean((r) => r.crownEvents), freeCapped: mean((r) => r.freeCapped), freeMax: mean((r) => r.freeMax),
    capWithLuck: mean((r) => r.capWithLuck), capNoLuck: mean((r) => r.capNoLuck),
    runsCapped: runs.filter((r) => r.freeCapped > 0).length / runs.length,
    // Режимы прокрутки (шаг 70): средние счётчики и доля спокойных среди платных.
    normalSpins: mean((r) => r.normalSpins), riskSpins: mean((r) => r.riskSpins), calmSpins: mean((r) => r.calmSpins),
    calmShare: mean((r) => {
      const paid = r.normalSpins + r.riskSpins + r.calmSpins;
      return paid > 0 ? r.calmSpins / paid : 0;
    }),
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

export function report(name, x) {
  const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const pct = (n) => Math.round(n * 100) + '%';
  const chips = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  console.log(`${name.padEnd(44)} в конце ${f(x.closed)} (мед ${x.median}), пик ${f(x.peak)} (среднее максимумов по забегам), 1-й ${pct(x.first)}, 10+ ${pct(x.ten)}, после 5-го раунда без долгов ${pct(x.flop5)}, рекорд ${x.best} | ${f(x.minutes, 1)} мин (мед ${f(x.minutesMedian, 1)}, >10 ${pct(x.over10)}) | попыток раунда ${f(x.attempts, 1)} (мед ${x.attemptsMedian}), магазинов ${f(x.shops, 1)}, прокруток ${f(x.spins, 0)} (платных ${f(x.paidSpins, 0)}), макс. за раунд ${f(x.maxRoundSpins, 0)} (больше потолка в ${pct(x.overCap)} раундов) | кассет ${f(x.tapesBought)} (берут ${pct(x.bought)}), откатов ${f(x.rewinds)} | множитель 1-й прокрутки ${f(x.firstSpinMult)}, упёрлись в 400 раундов ${pct(x.guard)} | сид ${SEED ?? '—'} | нарушений ${f(sum(Object.values(x.violations)), 0)}, страховок ${f(sum(Object.values(x.safeguards)), 0)}`);
  console.log(`${''.padEnd(44)} последний шанс: шансов ${f(x.lastChances)} за забег (не было у ${pct(x.noChance)}), спасено ${pct(x.rescue)} (${f(x.survived)} из ${f(x.lastChances)}; среднее по забегам ${pct(x.rescuePerRun)}), мгновенных ${pct(x.instantShare)}, цель мед ×${f(x.goalMedian, 1)} (полная нехватка ×${f(x.goalFullMedian, 1)}, у потолка ×10 — ${pct(x.goalAtCap)}), цель побита после 1-го действия ${pct(x.firstActionWins / Math.max(x.lastChances, 1e-9))} (в т.ч. позже снесена ${pct(x.firstWinLost / Math.max(x.lastChances, 1e-9))}), второе дыхание ${f(x.secondWind)} (макс ${x.secondWindMax}), KABOOM ${f(x.dead)}, действий на шанс ${f(x.lcActions / Math.max(x.lastChances, 1e-9), 1)}, доля цели ${f(SHARE, 2)}`);
  console.log(`${''.padEnd(44)} билеты: за долг ${f(x.ticketIncome.debt)}, ранняя оплата ${f(x.ticketIncome.early)}, 🎟×3 ${f(x.ticketIncome.scatter)}, джекпот ${f(x.ticketIncome.jackpot)}, барабан ${f(x.ticketIncome.drum)} | автомат: прокачек ${f(x.machines)}, выборов ${f(x.machinePicks)}, веток ${f(x.machineBranches)} | куплено: амулетов ${f(x.amulets)}, гнёзд ${f(x.sockets)}, предметов ${f(x.items)}, мест ${f(x.slots)}, прокруток барабана ${f(x.drumSpins)}, ранних оплат ${f(x.paidEarly)} | отказов по местам ${f(x.itemSlotsDenied)} | фриспины до ${f(x.freeMax, 1)} за раунд, потолок срезал ${f(x.freeCapped)} раз (у ${pct(x.runsCapped)} забегов) | режимы: обычно ${f(x.normalSpins, 0)}, риск ${f(x.riskSpins, 0)}, спокойно ${f(x.calmSpins, 0)}`);
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
    console.log('проверки: 0 нарушений (6): долг = debtForRound(раунд); все числа конечны; табло билетов = учёт и не в минусе; Σ уровней = учёт прокачки и отката; откат по правилу игры (запись есть, не из будущего); исходы последнего шанса = число шансов');
  } else {
    console.log('проверки: НАРУШЕНИЯ');
    for (const [name, count] of Object.entries(total).sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${count}`);
  }
  if (guardsFired.length === 0) {
    console.log('страховки: 0 сработали (9) — правила держит сам код, это заслон на будущие правки: прокруток в раунде 0…30 и не меньше нуля, фриспинов за раунд ≤ 25, включено ≤ 4 предметов, источник билетов из пяти, расход билетов ≤ остатка, кассета не раньше 3-го долга, серия на closeRound не меняется, бот откатывается только между прокрутками');
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
    // Диагностика «машина × уровень»: один автомат, уровень прибит, переключения нет.
    const name = `${pinned.pinnedMachine} ур. ${pinned.machineLevel || 'авто'}, ветка ${pinned.machineBranch}${pinned.streakReset ? ' (серия сгорает)' : ''}`;
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
      variants.push(['автомат: лучший уровень и выплаты', { ...BASE_STRATEGY, machine: 'by-level' }]);
    }
    for (const [name, st] of variants) {
      const x = summarize(st, games, econ);
      summaries.push(x);
      report(name, x);
    }
  }
  invariantReport(summaries);
}

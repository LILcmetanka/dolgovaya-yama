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
//   SIM_NO_RESCUE=1    — диагностика без спасения: нехватка фишек сразу конец забега
//   SIM_REFUSE_PACTS=1 — бот отказывается от всех сделок Дилера: эталон «как до шага 9» для сравнения баланса
//   SIM_TICKET_SHARE_START / _STEP / _MAX — доля фишек на руках за билет (items.ts: 0,4 / 0,3 / 1 — старт, шаг и потолок);
//                        по умолчанию — числа игры, эти ручки замеряют другую цену без правки items.ts
//   SIM_TICKETS_PER_SHOP=<целое ≥ 0> — сколько билетов можно купить за один заход в магазин (правило игры
//                        items.TICKETS_PER_SHOP); 0 — без потолка; по умолчанию — потолок игры
//   SIM_RESCUE_SKULL=<0…1> — доля черепов в раунде спасения (lastChance.RESCUE_SKULL_SHARE, 0,5);
//                        ручка калибровки, в игре — число из lastChance.ts
//   SIM_RESCUE_FREEZE=<целое ≥ 1> — сколько столбцов можно заморозить между прокрутками спасения
//                        (lastChance.RESCUE_FREEZE_PER_SPIN, в игре 1); ручка калибровки
//   SIM_BELL_SKULL=<шаг> — шаг поправки колокольчика к доле черепов за срабатывание (amulets.BELL_SKULL_STEP, 0,01);
//                        0 — правило выключено (как до шага 25), потолок всегда из amulets.BELL_SKULL_MAX
//   SIM_SKULL_SHARE=constant — старая доля черепов (26/121 ≈ 0,215) вместо роста 18→30% по раундам (замечание 19)
//   SIM_PHASE_STEP=2 — старый шаг множителя в фазе 2 (+1 к шагу); без него в фазе 2 шаг 1 (×1, ×2, ×3)
//   SIM_PHASE_SPINS=0 — фаза 2 без +1 прокрутки (как до замечания 19)
//   SIM_PHASE_SKULL=1.2 — старый множитель веса черепа в фазе 2 (phase2SkullFactor до правки)
//   SIM_LEGACY=1 — все четыре старые ручки сразу: вся игра-правила до замечания 19 (доля 21,5%, фаза ×1,2,
//                  шаг 2, без +1 прокрутки). Таблицу замера в DESIGN/HANDOFF собирают из отдельных флагов.
//   SIM_TAKE_POT=<фишки> — порог «забрать» кон (политика бота, не правило игры): по умолчанию 180, как решено 19.11.
//   SIM_UPGRADES=<n> — забег начинается с n купленных улучшений после смерти (шаг 28; бот берёт их по приоритету
//                        UPGRADE_PRIORITY). Числа и правила — из upgrades.ts, здесь только выбор бота.
//   SIM_META=<n> — прогон с метапрогрессией: n последовательных забегов, после каждого бота берёт лучшее доступное
//                        улучшение; в отчёте отдельная строка «улучшения». Без SIM_UPGRADES/SIM_META поведение прежнее.
//   SIM_RECORD=<фишки> — рекорд лучшего забега по фишкам для улучшения №46 «старт с 5% рекорда» (по умолчанию 0:
//                        в обычном прогоне рекорда нет, в SIM_META он копится от забега к забегу сам).
//   SIM_ACTIONS=0      — бот не пользуется действиями вне прокрутки (шаг 29): эталон «как до действий».
// streakReset — не переменная: это второй вариант в обычном прогоне, BASE_STRATEGY + { streakReset: true } («серия
// сгорает в конце раунда», в коде — переходит). Числа из двух строк одного прогона сравнимы между собой.
//
// Что повторяет (слой за слоем, как в игре): RoundScene — прокрутка, итог, «забрать», окно перемешки и подмены;
// MachineScene — ржавчина и смена автомата; BonusScene — короны, клевер, джекпот; PhaseScene — фазы;
// ShopScene — витрины по закрытым долгам, предметы, амулеты с гнёздами, барабан;
// SaveScene — кассета (запись и откат); DealerScene — сделки Дилера; CollectorScene — расплата и последний шанс
// (раунд спасения живёт в last-chance-sim.mjs). Правила и числа — из rules, patterns, items, amulets, evil,
// bonus, phases, machines, drum, dealerGame, save; копий чисел в симуляторе нет.
// Политика игрока (BASE_STRATEGY) — это не правила игры, а выбор за игрока: «забрать», когда кон добирает долг
// или дорос до абсолютного порога SIM_TAKE_POT (180 фишек; при долге 10к+ доля долга не набиралась никогда и бот
// тянул забег до предохранителя); риск, молот, свеча и фарт — по своим порогам; бусты символов, перемешка и подмена —
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
// (запись есть, не из будущего), исходы спасения = число спасений.
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
// Раунд спасения (решение автора 22.11.2026): долг оплатить нечем — 5 прокруток, доля черепов RESCUE_SKULL_SHARE,
// нужен хотя бы один платящий паттерн. Амулеты и предметы заморожены; после прокрутки бот морозит до RESCUE_FREEZE_PER_SPIN столбцов.
// Выжил — ни фишек, ни билетов не дают, долг остаётся прежним, раунд играется заново (счёт −WON_RESCUE_ROUND_STEP,
// магазин +1); не выжил — KABOOM сразу, без прощения (шаг 34). Спасение одно за забег (rescueAllowed): вторая нехватка
// фишек — сразу KABOOM, отдельный счётчик rescueLocked. Флаг липкий — откат кассетой его не снимает.
// Долю черепов можно переопределить без правки кода: SIM_RESCUE_SKULL=0.5. Диагноз с числами печатает SIM_ROUNDS=1;
// подробно — HANDOFF.md, «Симулятор».
import { fileURLToPath } from 'node:url';
import { playRescue, rescueReport, roundReport, SKULL_SHARE, SPINS as RESCUE_SPINS, FREEZE as RESCUE_FREEZE } from './last-chance-sim.mjs';

const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
// lastChance.ts нужен здесь для правила «одна яма за забег» (rescueAllowed) и шага счёта после выживания
// (WON_RESCUE_ROUND_STEP); сами прокрутки спасения — в last-chance-sim.
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
const S = await import(SRC + 'save.ts');
// Улучшения после смерти (шаг 28): пул, эффекты и прощение долга — те же функции, что зовёт игра.
const UPG = await import(SRC + 'upgrades.ts');
// Действия вне прокрутки (шаг 29): цены, жребий, обмен весов и продажа — те же функции, что зовёт сцена.
const ACT = await import(SRC + 'actions.ts');
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
// rescue — весь раунд спасения: 5 прокруток с заморозкой столбцов. Провал — сразу KABOOM, паузы на магазин нет.
const SECONDS = { spin: 2.5, take: 1, dealer: 6, collector: 2.5, shop: 10, rewind: 5, rec: 1, rescue: 16, defer: 2, action: 3 };

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
const NO_RESCUE = process.env.SIM_NO_RESCUE === '1'; // нехватка фишек — сразу конец забега
const REFUSE_PACTS = process.env.SIM_REFUSE_PACTS === '1'; // эталон без сделок: бот отказывается от всех карт
// SIM_PACTS=all (шаг 30): Дилер кладёт те карты, которых бот ещё не брал, — так за прогон видны все 52.
const PACTS_MODE = process.env.SIM_PACTS === 'all' ? 'all' : 'normal';
// В режиме «все карты» помним, какие уже применились хоть раз: каждая карта должна попасть на стол.
const PACT_SEEN = new Set();
const ACTIONS_ON = process.env.SIM_ACTIONS !== '0'; // шаг 29: SIM_ACTIONS=0 — бот не пользуется действиями

// ---------- Улучшения после смерти (шаг 28) ----------
/**
 * Приоритет бота в пуле улучшений: что брать первым, если выбор есть. Это оценка игрока, не числа игры —
 * сами эффекты считает upgrades.upgradeEffects. Крупное: +5% к выигрышу паттернов, рост долга ×3,4 (долг растёт
 * каждым раундом, экономия копится), потолок прокруток, проценты, отсрочка как вторая жизнь.
 */
const UPGRADE_PRIORITY = [
  'win-patterns', 'debt-growth', 'spin-cap', 'win-interest', 'debt-defer',
  'debt-start', 'spin-skull-free', 'win-piggy', 'spin-first-round', 'debt-forgive', 'win-insurance',
  // 28б: билеты, предметы, амулеты (порядок — оценка силы, не числа игры).
  'amulet-price', 'ticket-start', 'item-slot', 'item-price', 'amulet-first-rare',
  'ticket-third-debt', 'ticket-jackpot', 'item-hammer-empty', 'amulet-first-socket',
  'item-cherry-weight', 'item-clover-weight', 'amulet-copy', 'amulet-survives-death',
  // 28в: сетка и магазин.
  'shop-discount', 'grid-skull-share', 'shop-ticket-share', 'shop-extra-row',
  'grid-jackpot', 'grid-blood-weight', 'shop-gift-item', 'shop-amulet-chips',
  'grid-start-joker', 'grid-start-symbol',
  // 28г: кассета и прочее (порядок — оценка силы, не числа игры).
  'record-start-chips', 'skull-cancel', 'machine-no-swap', 'machine-start-pick',
  'tape-free', 'tape-refund-tickets', 'achievement-ticket', 'tape-keeps-streak',
];
/** Сколько улучшений накоплено к началу забега (SIM_UPGRADES). */
const SIM_UPGRADES = upgradesFromEnv('SIM_UPGRADES');
/** Сколько забегов в прогоне с метапрогрессией (SIM_META); 0 — не запускать. */
const SIM_META = upgradesFromEnv('SIM_META');
/** Сколько последних забегов меты показывать отдельной строкой: там улучшения уже накоплены. */
const META_TAIL = 50;
/** Рекорд фишек для улучшения №46 (SIM_RECORD): 0 — рекорда нет, как в первом забеге. */
const SIM_RECORD = wholeNumberFromEnv('SIM_RECORD', 0);

/** Целое ≥ 0 из окружения (SIM_RECORD): мусор — падаем сразу, иначе улучшение молча не работало бы. */
function wholeNumberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} должен быть целым числом ≥ 0, получено «${raw}»`);
  return value;
}

/**
 * Метрика бота для №49 «стартовый автомат выбираешь сам»: среднее «долгов закрыто» из замера SIM_MACHINE
 * (300 забегов, сид 1, шаг 28г): classic 1,32, quiet 1,07, greedy 0,71. Это оценка игрока, не числа игры:
 * «Жадный» платит больше, но и черепа у него чаще — на длинной дистанции он проигрывает.
 */
const MACHINE_BOT_SCORE = { classic: 1.32, quiet: 1.07, greedy: 0.71 };

/** Какой автомат бот выберет в начале забега: без №49 — классический, как в игре. */
function bestStartMachine(effects) {
  if (!effects.startMachinePick) return 'classic';
  return M.MACHINES.reduce((best, machine) => (MACHINE_BOT_SCORE[machine.id] > MACHINE_BOT_SCORE[best] ? machine.id : best), M.MACHINES[0].id);
}

/**
 * Улучшение №50 «раз за забег можно отменить череп». «Самый дорогой кон» онлайн не угадать: вперёд видно только
 * текущий кон, а щит бот ставит по своему порогу. Поэтому отмена достаётся первому черепу, который правда сжигает
 * кон (щит его не закрыл) — до него отменять было нечего, а после первого такого черепа отмена уже потрачена.
 * Череп на пустом коне (жжёт только серию) отмену не тратит: единственная за забег должна спасти фишки.
 */
function shouldCancelSkull(s) {
  return s.upgradeEffects.skullCancelOnce && !s.skullCancelUsed && s.pot > 0;
}

/** SIM_UPGRADES/SIM_META=<целое ≥ 0>: не число — падаем сразу, иначе бот молча играл бы без улучшений. */
function upgradesFromEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} должен быть целым числом ≥ 0, получено «${raw}»`);
  return value;
}

/** Покупки для n улучшений по приоритету бота: по одному разу каждое (repeat первой партии — 1). */
function purchasedWith(count) {
  const purchased = {};
  for (const id of UPGRADE_PRIORITY.slice(0, Math.max(0, Math.min(count, UPGRADE_PRIORITY.length)))) purchased[id] = 1;
  return purchased;
}

/** Улучшения, накопленные к обычному прогону (SIM_UPGRADES): одинаковые на все забеги замера. */
const PRELOADED_UPGRADES = purchasedWith(SIM_UPGRADES);

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
 * SIM_BELL_SKULL=<число 0…1> — шаг колокольчика к доле черепов за срабатывание (amulets.BELL_SKULL_STEP по умолчанию);
 * 0 — правило выключено, так замеряют «до». Не число — падаем сразу, иначе доля молча стала бы NaN.
 */
const BELL_SKULL_STEP = bellSkullStepFromEnv();
function bellSkullStepFromEnv() {
  const raw = process.env.SIM_BELL_SKULL;
  if (raw === undefined || raw === '') return A.BELL_SKULL_STEP;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`SIM_BELL_SKULL должен быть числом 0…1, получено «${raw}»`);
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
function ticketShareOf(bought, start = TICKET_SHARE.start) {
  if (!Number.isFinite(bought)) return start;
  return Math.min(TICKET_SHARE.max, start + TICKET_SHARE.step * Math.max(0, Math.floor(bought)));
}

/**
 * Цена билета за фишки при balance на руках — та же дверь, что ShopScene.buyTicket: без ручек зовём
 * items.ticketForChips, с ручками считаем её формулу, а округление берём из игры (items.roundPrice).
 * start — доля первого билета (улучшение №38, 28в): шаги роста не меняются.
 */
function ticketPrice(balance, bought, mul = 1, start = I.TICKET_SHARE_START) {
  if (!TICKET_SHARE_OVERRIDE) return I.ticketForChips(balance, bought, mul, start);
  const bank = Number.isFinite(balance) && balance > 0 ? balance : 0;
  return I.roundPrice(bank * ticketShareOf(bought, start), mul);
}

/**
 * Порог «забрать» в фишках — абсолютный, а не доля долга (правка 19.11.2026, DONTLIKE.md, «Переделать (баланс долгов)» п.3).
 * Раньше бот забирал кон при pot ≥ takeShare (0,5) × долга: при долге 10к такой кон не набирался никогда, бот
 * накручивал бесплатные прокрутки до предохранителя, забег тянулся 294 минуты, и замеры на жёстких кривых врали.
 * Живой игрок забирает, когда на коне есть заметная сумма, а не «половина долга». Ориентир автора — 150–200;
 * SIM_TAKE_POT=<целое> меняет порог для замера, не трогая файл.
 * Цифра 2,3% (150 ×3,6, сид 1) — нижняя граница, а не потолок: в ветке «долг уже покрыт банком» бот берёт кон
 * по 180 и режет серию, хотя человек с запасом играет мягче: копит кон дольше и уходит дальше.
 */
export const SIM_TAKE_POT = takePotFromEnv() ?? 180;

/** Порог «забрать» из SIM_TAKE_POT (целое больше нуля); пусто — порог по умолчанию. */
function takePotFromEnv() {
  const raw = process.env.SIM_TAKE_POT;
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`SIM_TAKE_POT должен быть целым числом больше нуля, получено «${raw}»`);
  return value;
}

/** Политика игрока (не правила игры). */
export const BASE_STRATEGY = {
  shieldShare: 0.25, boostShare: 0.25, reserveShare: 0.5, drumShare: 0.5,
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
  // Деньги: отдавать долг раньше конца раунда ('none' | 'ticket' — только когда за это дают билет, earlyPayTickets).
  payEarly: 'none',
  // Автомат: игрок его не выбирает. Шанс, что в начале раунда он сменится сам (SIM_SWAP_CHANCE), — из machines.ts.
  swapChance: swapChanceFromEnv() ?? M.MACHINE_SWAP_CHANCE,
  // Серия: false — как в коде (переходит в следующий раунд), true — второй набор чисел (сгорает на конце раунда).
  streakReset: false,
  // Действия вне прокрутки (шаг 29, политика бота, не правила): обслуживание — когда доля черепов не ниже
  // serviceSkullShare; биржа — когда текущий долг уже закрыт; кража — когда шанс успеха не ниже theftChance
  // (то есть риск смерти не выше 1 − theftChance); продажа и обмен — когда на долг не хватает.
  actions: true,
  serviceSkullShare: 0.27,
  theftChance: 0.5,
  saleMin: 60,
  lotteryTickets: 3,
  exchangeTickets: 4,
};

/** Цена кассеты — как в игре (save.ts: 2, 3, 4… по купленным). econ оставлен для старых файлов рядом (tape45-sim). */
export function defaultEcon() {
  return { tapePrice: (bought) => S.tapePrice(bought) };
}

const clone = (value) => structuredClone(value);
// Амулеты по копиям: в гнёздах лежат уникальные (s.amulets), а копии — счётчиком (шаг 62б).
const ids = (s) => A.amuletIdsFrom(s.amuletCounts);
const symbolById = (id) => R.SYMBOLS.find((symbol) => symbol.id === id);
// Автомат забега: его id (машина меняется сама в начале раунда, см. startRound).
const mach = (s) => s.machineId;
/**
 * Множитель серии, как BaseScene.multiplier: шаг от амулетов плюс бонус фазы 2 (сделка может шаг удвоить),
 * но не выше потолка сделки «серия не выше ×N».
 */
/** Шаг множителя, как BaseScene.streakStep × RoundScene.streakStep: амулеты, фаза 2 и сделка «шаг вдвое». */
const streakStep = (s) => {
  const pact = D.pactEffects(s.pacts, s.round);
  return (A.multiplierStep(ids(s)) + s.phase.multiplierBonus) * pact.multiplierStepMul + pact.streakStepBonus;
};
/** Множитель серии, как BaseScene.multiplier: серия × шаг, но не выше потолка сделки «серия не выше ×N». */
const multiplier = (s) => Math.min(R.multiplierForStreak(s.streak, streakStep(s)), D.pactEffects(s.pacts, s.round).multiplierCap);
/** Потолок прокруток раунда: улучшение №3 и поправки сделок шага 30 (№2, №10) — та же функция, что в сцене. */
const spinCap = (s) => D.pactSpinCap(R.MAX_SPINS_PER_ROUND + s.upgradeEffects.spinCapBonus, D.pactEffects(s.pacts, s.round));

/**
 * Выбор бота в №33 (28в): самый тяжёлый платящий символ, который уже есть в автомате в первом раунде.
 * Это тот же принцип, что «самый дорогой доступный амулет» для №39: бот берёт самое частое, а не самое дорогое.
 */
function startSymbolOf(effects) {
  if (!effects.startSymbolPick) return null;
  const base = R.weightsForRound(1);
  const paying = R.SYMBOLS.filter((symbol) => R.isPaying(symbol) && R.isUnlocked(symbol, 1));
  if (paying.length === 0) return null;
  return paying.reduce((best, symbol) => (base(symbol) > base(best) ? symbol : best), paying[0]).id;
}

/**
 * Новый забег. upgraded — что куплено в прогрессe (экран после смерти, шаг 28); runNumber — номер забега
 * (улучшение №8 прощает первый долг каждый пятый); chipRecord — рекорд фишек лучшего забега (улучшение №46:
 * с него начинается табло). Без покупок числа прежние: upgradeEffects({}) нейтральны.
 */
function newRun(upgraded = {}, runNumber = 1, chipRecord = 0) {
  const upgradeEffects = UPG.upgradeEffects(upgraded);
  // Первый долг: старт −5% (№6) или вовсе 0 в забег прощения (№8) — то же, что BaseScene.resetState.
  const forgiven = UPG.forgivesDebt(upgradeEffects.debtForgiveEveryRuns, runNumber);
  const start = forgiven ? 0 : R.startDebt(upgradeEffects.startDebtMul);
  // №21 (28б): мест на полке — START_SLOTS плюс улучшение, но не больше MAX_SLOTS (как BaseScene.resetState).
  const slots = Math.min(I.MAX_SLOTS, I.START_SLOTS + Math.max(0, upgradeEffects.itemSlots));
  // №46 (28г): стартовые фишки от рекорда — в earned НЕ идут, как в BaseScene.resetState (рекорд не раздувается).
  const startChips = UPG.recordStartChips(chipRecord, upgradeEffects.recordStartShare);
  return {
    round: 1, debtRound: 1, debtBase: start, deferAdded: 0, debtOps: [], debt: start, balance: startChips,
    startChips, // сколько дал №46 — в отчёте видно, пришло ли улучшение в забег
    tickets: upgradeEffects.startTickets, // №16 (28б): старт с билетом
    spinsLeft: R.SPINS_PER_ROUND, pot: 0, streak: 0,
    slots, shelf: new Array(slots).fill(null), effects: I.noEffects(), sockets: A.START_SOCKETS,
    amulets: [], amuletCounts: {}, bones: 0, roundShields: 0,
    // №49 (28г): стартовый автомат выбирает бот по своей метрике; без улучшения — классический, как в игре.
    machineId: bestStartMachine(upgradeEffects),
    diceDrought: 0, isBloodNext: false, luckyClovers: 0, freeSpins: 0, phase: PH.PHASES[0], rustyColumn: null, lastGrid: null,
    // Цель забега (решение автора 2026-11-14): earned — все приходы фишек за забег (BaseScene.earn), не баланс.
    // peakBalance — самый большой баланс за забег; millionRound/millionSeconds — когда earned перевалил CHIP_GOAL.
    earned: 0, peakBalance: 0, millionRound: null, millionSeconds: null,
    recordRound: null, recordSeconds: null, // когда earned перевалил 10 000 000 (CHIP_RECORD) — для SIM_CHASE_RECORD
    rescueUsed: false, // спасение в этом забеге уже было: второе не прощают; откат кассетой флаг не снимает, как devUsed
    deferUsed: false, // улучшение №10: отсрочка в этом забеге потрачена (липкая, как rescueUsed)
    deferCarry: 0, // улучшение №10: отложенный долг, который прибавится к следующему в магазине
    runNumber, // номер забега: от него №8 решает, прощать ли первый долг
    upgradeEffects, // готовые числа улучшений (upgrades.upgradeEffects): других мест у правил улучшений нет
    skullFreeGiven: false, // улучшение №4: бесплатная прокрутка за первый череп в раунде уже выдана
    startSymbol: startSymbolOf(upgradeEffects), // №33 (28в): выбранный ботом первый символ забега
    startGridGiven: false, // №32/33: первая сетка уже получила джокера и выбранный символ
    skullCancelUsed: false, // №50 (28г): отмена черепа в этом забеге уже потрачена (липкая, как rescueUsed)
    amuletChipUsed: false, // №39: амулет за фишки в этом забеге уже брали (липкий, откат не снимает)
    giftGiven: false, // №40: подарок первого магазина уже выдан (липкий)
    bankKeptThisRound: false, // сделка №10: первый череп в этом раунде кон уже не сжёг
    tookThisRound: false, // сделка №23: «забрать» раз за раунд
    potSparedThisRound: false, // сделка №24: первый череп раунда уже пощадил кон
    amuletBurns: false, // сделка №34: следующий купленный амулет сгорит
    bellSkull: 0, // колокольчик (шаг 25): сколько к доле черепов набежало срабатываниями 🔔 в этом раунде
    slotBase: 0, // сколько предметов стояло в столбике с начала раунда: сделка №13 новых сверх предела не даёт
    insuranceSaves: 0, // сколько раз страховка сработала в раунде (копий до двух — столько и спасений)
    pacts: [], // сделки Дилера (dealerGame.Pact): что действует в раунде, решает D.pactEffects
    debtNextMul: 1, // сделка №12: следующий долг дороже во столько раз (сбрасывается на назначении)
    actions: ACT.freshActions(), // действия вне прокрутки (шаг 29): что сделано в раунде и что ещё действует
    debtCutApplied: 0, // сколько фишек срезал выкуп долга (№10) в текущем долге — для проверки долга
  };
}


/** Веса символов следующей прокрутки: автомат, амулеты, предметы, риск/фарт и фаза (как skullShare.ts). */
function weightOf(s, isFree) {
  const raw = rawWeightOf(s, isFree);
  // Доля черепов: + у одних сделок, − у «тише черепа» (RoundScene.weightContext), плюс колокольчик за раунд
  // и −1 п.п. от улучшения №31 (28в).
  const effects = D.pactEffects(s.pacts, s.round);
  const share = (() => {
    let skull = 0;
    let others = 0;
    for (const symbol of R.SYMBOLS) {
      const weight = raw(symbol);
      if (R.isSkull(symbol)) skull = weight;
      else if (!R.isDice(symbol)) others += weight;
    }
    return skull + others > 0 ? skull / (skull + others) : 0;
  })();
  // Сделка №10 держит долю не выше своего потолка — та же функция, что в RoundScene.
  const delta = D.pactSkullDelta(
    share,
    effects.skullShareDelta + s.bellSkull + s.upgradeEffects.skullShareDelta + ACT.actionSkullDelta(s.actions),
    effects.skullShareMax,
  );
  if (delta === 0 || !Number.isFinite(delta) || isFree) return raw;
  // Долю черепов считаем по тем же весам, что и прокрутку (как RoundScene.weightContext), и берём тот же
  // множитель веса черепа из dealerGame: числа сделки в симуляторе не повторяются.
  const mul = D.skullShareWeightMul(share, delta);
  if (mul === 1) return raw;
  return (symbol) => (R.isSkull(symbol) ? raw(symbol) * mul : raw(symbol));
}

/** Вес символа без поправки сделки на долю черепов: автомат, амулеты, предметы, риск/фарт и фаза. */
function rawWeightOf(s, isFree) {
  const id = s.machineId;
  const base = R.weightsForRound(s.round, E.diceWeight(s.diceDrought));
  // Действия шага 29: проданный символ (№8) выпадает из автомата, обмен (№2) меняет базовые веса местами —
  // тот же порядок, что в skullShare.symbolWeightOf, поэтому плашка доли черепов и прокрутка сходятся.
  const baseOf = (symbol) => {
    const swap = s.actions?.exchange ?? null;
    if (s.actions?.sold?.includes(symbol.id)) return 0;
    if (swap) {
      if (symbol.id === swap.to) return base(symbolById(swap.from) ?? symbol);
      if (symbol.id === swap.from) return base(symbolById(swap.to) ?? symbol);
    }
    return base(symbol);
  };
  const owned = ids(s);
  const noSkulls = D.pactEffects(s.pacts, s.round).noSkulls; // сделка «до конца раунда нет черепов»
  const luck = D.pactEffects(s.pacts, s.round).symbolLuck; // сделка №11: выбранный символ
  const symbolBonus = UPG.symbolWeightBonus(s.upgradeEffects); // №23/24 (28б): клевер и вишня тяжелее на 1
  let others = 0;
  for (const symbol of R.SYMBOLS) if (!R.isSkull(symbol) && !R.isDice(symbol)) others += base(symbol);
  const legacySkull = others * LEGACY_SKULL_RATIO;
  return (symbol) => {
    if (noSkulls && R.isSkull(symbol)) return 0; // черепам этого раунда вес 0 — как RoundScene.baseWeights
    if (!M.machineSymbolAllowed(id, symbol)) return 0; // «Тихий»: нет паука, замка, крови и клевера
    const baseWeight = SKULL_SHARE_CONSTANT && R.isSkull(symbol) ? legacySkull : baseOf(symbol);
    const skullFactor = R.isSkull(symbol) ? M.machineSkullFactor(id) : 1; // «Жадный»: черепа тяжелее
    const machined = A.amuletWeight(symbol, baseWeight, owned) * skullFactor; // огранка, череп в кармане
    // №23/24 (28б): клевер и вишня тяжелее на 1 — как skullShare.symbolWeightOf; закрытый символ не открывается.
    const bonus = symbolBonus[symbol.id] ?? 0;
    const withBonus = bonus > 0 && machined > 0 ? machined + bonus : machined;
    let weight = I.boostWeight(symbol, withBonus, s.effects); // чеснок, вишни, колокола, алмазы, удача
    const symbolMul = D.pactEffects(s.pacts, s.round).symbolWeightMul[symbol.id]; // сделка №14: вишни реже вдвое
    if (Number.isFinite(symbolMul) && symbolMul > 0) weight *= symbolMul;
    if (luck !== null) weight = SK.symbolLuckWeight(symbol, weight, luck); // сделка №11: выбранный символ ± веса
    if (s.effects.risk && R.isSkull(symbol)) weight *= I.RISK_SKULL_FACTOR; // риск: черепа втрое чаще
    if (s.effects.luckSpin && R.isSkull(symbol)) weight = 0; // фарт: на этой прокрутке черепов нет
    // До замечания 19 фаза 2 множила вес черепа (phase2SkullFactor = 1,2). SIM_PHASE_SKULL=1.2 возвращает это.
    if (R.isSkull(symbol) && s.phase.number >= 2) weight *= LEGACY_PHASE_SKULL;
    return isFree ? B.freeSpinWeight(symbol, weight) : weight;
  };
}

/**
 * Законный долг раунда: debtForRound(раунд) с ростом улучшения №7, сдвинутый сделками Дилера. «Следующий долг +20%»
 * (№12) меняет долг при назначении в магазине, «текущий долг −10%» (№12) и «долг +8%» (№2) — разово уже в раунде.
 * Первый долг забега — по правилам улучшений: −5% (№6) или 0 в забег прощения (№8); улучшение №10 прибавляет
 * к долгу отложенное раньше (deferAdded). Поэтому сравниваем с набором этих чисел, а не с одним: застрявший
 * с прошлого раунда долг (настоящая ошибка) в набор не попадёт.
 */
function debtOk(s) {
  // Долг, который пережил спасение, помнит, от какого числа и какие сделки его двигали: debtBase — долг сразу
  // после takeDebtForRound, debtOps — «−10%» и «+8%» в порядке применения. Порядок важен из-за округления до 10.
  const round = s.debtRound ?? s.round;
  const growth = s.upgradeEffects.debtGrowthMul;
  const formula = R.debtForRound(round, growth);
  // Само основание — формула круга или она же с «следующий долг +20%»; в первом раунде — старт с улучшениями.
  // Сделки шага 30 добавляют свои разовые множители к следующему долгу — база может быть любой из них.
  const NEXT_MULS = [D.DEBT_NEXT_MUL, D.EMPTY_SPIN_DEBT_MUL, D.POT_START_DEBT_MUL, D.DEBT_DEFER_COST_MUL, D.DEBT_FREEZE_NEXT_MUL];
  const bases = round === 1
    ? [R.startDebt(s.upgradeEffects.startDebtMul), 0, ...NEXT_MULS.map((mul) => D.pactDebt(R.startDebt(s.upgradeEffects.startDebtMul), mul))]
    : [formula, ...NEXT_MULS.map((mul) => D.pactDebt(formula, mul))];
  const stored = s.debtBase ?? s.debt;
  if (!bases.includes(stored)) return false;
  // Выкуп долга (действие №10, шаг 29) идёт ДО разовых сделок: магазин срезает число, а «+8%» и «−10%»
  // применяются уже в раунде (dealer.applyPactOnce). Поэтому срез — в той же очереди, перед ops.
  let value = stored + (s.deferAdded ?? 0) - (s.debtCutApplied ?? 0);
  for (const op of s.debtOps ?? []) {
    // Строки — те же имена, что пишет dealer(). Новые разовые сдвиги шага 30 — 'win' (+8%), 'chips' (+10%),
    // 'pot' (+15%), 'defer' (+25%); старые 'cut' (−10%) и 'cheap' (+8%) остались как были.
    const mul = op === 'cut' ? D.DEBT_CUT_MUL
      : op === 'win' ? D.WIN_DEBT_MUL
        : op === 'chips' ? D.CHIPS_START_DEBT_MUL
          : op === 'pot' ? D.POT_START_DEBT_MUL
            : op === 'defer' ? D.DEBT_DEFER_COST_MUL
              : D.CHEAP_SHOP_DEBT_MUL;
    value = D.pactDebt(value, mul);
  }
  // На поздних раундах долг огромный (debtForRound растёт в 3,6 раза), и округление до 10 на таких числах
  // теряет точность: сравниваем с относительным допуском, а не побитово.
  return Math.abs(value - s.debt) <= Math.max(10, Math.abs(s.debt) * 1e-9);
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
  // №45 (28г): трата после записи на кассету — её вернёт откат (не больше, чем потрачено; см. rewind).
  if (g.tape === 'recorded') g.ticketsSpentOnTape += count;
  return true;
}

const FINITE = ['round', 'debt', 'balance', 'earned', 'peakBalance', 'tickets', 'spinsLeft', 'pot', 'streak', 'luckyClovers', 'freeSpins'];

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
  // Исходы спасения: каждая нехватка фишек кончилась победой, смертью в раунде спасения
  // или смертью из-за «яма уже была» (rescueLocked, без прокруток).
  if (g.survived + g.dead !== g.lastChances + g.rescueLocked) violate(g, 'исходы последнего шанса не сходятся с числом шансов');
  checkGuards(s, g);
}

/** Потолки и правила, которые уже обеспечены кодом: сработать могут только после правки. */
function checkGuards(s, g) {
  // Потолок прокруток — с улучшением №3: MAX_SPINS_PER_ROUND + бонус (upgrades.UPGRADE_SPIN_CAP_BONUS).
  const cap = D.pactSpinCap(R.MAX_SPINS_PER_ROUND + s.upgradeEffects.spinCapBonus, D.pactEffects(s.pacts, s.round));
  if (s.spinsLeft < 0 || s.spinsLeft > cap) guard(g, 'прокруток в раунде вне 0…потолок');
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
  else if (!isRoundEnd) s.streak = D.pactEffects(s.pacts, s.round).takeStreakReset ? 0 : R.streakAfterTake(s.streak);
  if (!isRoundEnd) s.tookThisRound = true; // сделка №23: забрать кон можно раз в раунд
  return amount;
}

/** Новый раунд. Серию НЕ трогаем: в коде она переходит в следующий раунд (BaseScene → RoundScene.startRound). */
function startRound(s, st, g) {
  const owned = ids(s);
  // Сделки, чей срок вышел вместе с прошлым раундом, уходят (RoundScene.dropExpiredPacts).
  s.pacts = s.pacts.filter((pact) => pact.untilRound >= s.round);
  // Диагностический режим SIM_PACTS=all: Дилер приходит в начале каждого раунда — иначе короткие забеги
  // не успевают показать все карты. Это только замер, в игре Дилер по-прежнему приходит на кубике.
  if (PACTS_MODE === 'all') dealer(s, st, g);
  const roundPacts = D.pactEffects(s.pacts, s.round);
  // Автомат сам редко меняется в начале раунда (машина по умолчанию — та, что стоит с забега; первый раунд не меняется).
  // Сделка №8 держит его первые NO_SWAP_ROUNDS своих раундов (RoundScene.startRound): смены и новости нет.
  // Улучшение №48 (28г) отключает смену совсем: шанс 0, как будто сделка держит автомат всегда.
  const swapChance = s.upgradeEffects.noMachineSwap ? 0 : st.swapChance;
  const switched = D.pactEffects(s.pacts, s.round).noMachineSwap ? s.machineId : M.machineAtRoundStart(s.machineId, s.round, swapChance);
  if (switched !== s.machineId) { s.machineId = switched; g.machineSwaps += 1; }
  // Фаза — по закрытым долгам (checkPhase); ставим её до прокруток: она даёт phase2BonusSpins (замечание 19).
  s.phase = PH.phaseAt(s.round - 1);
  const plan = A.spinsPerRound(R.SPINS_PER_ROUND, owned); // как RoundScene.startRound, без потолка
  // Потолок прокруток: MAX_SPINS_PER_ROUND плюс улучшение №3 — и поправки сделок шага 30 (D.pactSpinCap).
  const cap = D.pactSpinCap(R.MAX_SPINS_PER_ROUND + s.upgradeEffects.spinCapBonus, roundPacts);
  const planSpins = PHASE_BONUS_SPINS ? R.spinsAfterBonus(plan, s.phase.bonusSpins, cap) : plan;
  // Сделка «−1 прокрутка в раунде»: после амулетов и фазы, но не меньше одной (RoundScene.startRound).
  // «+1 прокрутка» (шаг 30) не пробивает потолок раунда — он для всех бонусных прокруток один.
  s.spinsLeft = Math.max(MIN_ROUND_SPINS, planSpins + roundPacts.spinsDelta);
  if (roundPacts.spinsDelta > 0) s.spinsLeft = Math.min(cap, s.spinsLeft);
  // Сделки шага 30: №21 — стартовый кон, №40 — первая прокрутка кровавая, №23/№24 — счётчики нового раунда.
  if (roundPacts.potStart > 0) s.pot = Math.max(s.pot, roundPacts.potStart);
  s.tookThisRound = false;
  s.potSparedThisRound = false;
  if (s.round === 1) s.spinsLeft += s.upgradeEffects.firstRoundSpins; // улучшение №1: +1 прокрутка в первом раунде
  s.skullFreeGiven = false; // улучшение №4: бесплатная прокрутка за первый череп снова доступна
  s.roundShields = A.vestShields(owned);
  s.isBloodNext = roundPacts.bloodFirstSpin; // кровь не переходит в новый раунд; сделка №40 делает первую прокрутку кровавой
  s.insuranceSaves = 0; // страховка снова готова: сработок на раунд — по числу копий
  s.bankKeptThisRound = false; // сделка №10: «первый череп не жжёт кон» — снова первый
  s.bellSkull = 0; // колокольчик: поправка к доле черепов живёт один раунд (RoundScene.startRound)
  s.actions = ACT.startRoundActions(s.actions); // шаг 29: одноразовые снова доступны, обмен и продажа гаснут
  s.lastGrid = null; // сетка прошлого раунда не годится для продажи и обмена (как RoundScene.startRound)
  g.freeSpinsGiven = 0; // потолок бесплатных прокруток — на раунд
  g.freeInRound = 0;
  g.roundPaid = 0;
  I.clearRoundEffects(s.effects); // бусты и флаги прошлого раунда не переходят в новый
  s.slotBase = I.activeSlotEffects(s.effects).length; // щит и ×3 переходят раунд: столбик с этого начался
  g.roundEarnStart = s.earned; // доход раунда считается от «набрано» на входе в раунд
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
 * Приоритет бота у Дилера: «забрать дважды» усиливает забег сильнее всего, дальше — «шаг ×2»,
 * «раунд без черепов» бережёт кон, «+1 билет» дешевле всех. №8–15 — из партии Б шага 11.
 * №9 «ещё одно дыхание» из приоритета убрана 22.11.2026 вместе с картой (шаг 33).
 */
const PACT_PRIORITY = [
  'double-take', 'double-step', 'quiet-round', 'tickets-shop', 'free-amulet',
  'price-up', 'machine-delay', 'safe-bank', 'skull-calm', 'soft-skull',
  'cheap-shop', 'debt-cut', 'full-insurance', 'jackpot-weight', 'symbol-weight',
  // Шаг 30: новые карты — сначала усиления выигрыша и конa, потом экономика, риск и разовые выдачи.
  'win-double-risk', 'take-streak', 'pot-start', 'spin-plus', 'spin-cap', 'win-debt', 'jackpot-double',
  'cherry-double', 'step-two', 'joker-center', 'empty-spin', 'calm-win', 'half-step', 'skull-growth',
  'skull-cap', 'ticket-gift', 'amulet-half', 'interest-win', 'insurance-free', 'piggy-lock', 'skull-refund',
  'pot-safe-double', 'chips-start', 'free-item', 'item-cheap', 'two-slots', 'joker-slot', 'amulet-copy',
  'socket-gift', 'amulet-save', 'rare-only', 'symbol-run', 'machine-pick', 'blood-round', 'debt-defer',
  'debt-freeze', 'debt-tickets',
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
  // SIM_PACTS=all: Дилер кладёт те карты, которых ещё не брали, — так за прогон видно каждую карту пула.
  let offers;
  if (PACTS_MODE === 'all') {
    const unseen = D.PACTS.filter((pact) => !PACT_SEEN.has(pact.id));
    const pool = unseen.length > 0 ? unseen : D.PACTS;
    // Окно едет от забега к забегу: карта, которую сейчас взять нельзя, не запирает весь стол.
    const start = pool.length > 0 ? (s.runNumber * 3) % pool.length : 0;
    offers = [...pool.slice(start, start + 3), ...pool.slice(0, Math.max(0, 3 - (pool.length - start)))].slice(0, 3);
  } else {
    offers = D.offerPacts();
  }
  g.pactsOffered += offers.length;
  /** Можно ли взять карту сейчас: те же проверки, что DealerScene.acceptPact. */
  const canTake = (pact) => {
    if (D.pactLive(s.pacts, pact.id, s.round)) return false;
    if (pact.needsSymbol && D.pactSymbolsAvailable(D.pactSymbols(s.round)) === false) return false;
    if (pact.id === 'free-amulet' && (s.amulets.length >= s.sockets || A.randomAmuletOffer(ids(s), s.upgradeEffects.amuletMaxCopies).length === 0)) return false;
    if ((pact.id === 'free-item' || pact.id === 'joker-slot') && s.shelf.slice(0, Math.max(0, s.slots - 1)).indexOf(null) < 0) return false;
    if (pact.id === 'amulet-copy' && !s.amulets.some((amulet) => A.countOf(s.amuletCounts, amulet.id) < A.maxCopiesOf(amulet, s.upgradeEffects.amuletMaxCopies))) return false;
    if (pact.id === 'socket-gift' && s.sockets >= A.MAX_SOCKETS) return false;
    return true;
  };
  const pick = PACTS_MODE === 'all'
    ? offers.find(canTake)
    : PACT_PRIORITY.map((id) => offers.find((pact) => pact.id === id && canTake(pact))).find(Boolean);
  if (!pick) { g.pactsRefused += 1; return; }
  // №11: символ выбирает игрок — бот берёт самый дорогой из тех, что уже в автомате (pactSymbols).
  // Выбирать не из чего — сделку не берём: без символа она ничего не делает (как отказ карты в DealerTable).
  const symbolPact = pick.needsSymbol === true;
  const symbols = symbolPact ? D.pactSymbols(s.round) : [];
  const lucky = D.pactSymbolsAvailable(symbols)
    ? symbols.reduce((best, symbol) => (symbol.price > best.price ? symbol : best), symbols[0])
    : undefined;
  if (symbolPact && !lucky) { g.pactsRefused += 1; return; }
  // №38: автомат выбирает игрок — бот берёт «Жадного» (у него больше выигрыш) или классический.
  const machinePick = pick.needsMachine === true ? (M.MACHINES.some((m) => m.id === 'greedy') ? 'greedy' : 'classic') : undefined;
  if (pick.needsMachine && !machinePick) { g.pactsRefused += 1; return; }
  s.pacts.push(D.pactOf(pick.id, s.round, lucky));
  // Разовые эффекты сделки — те же, что DealerScene.applyPactOnce: билет, долг +8% (№2), долг −10% и +20% (№12),
  // бесплатный амулет (№13).
  switch (pick.id) {
    case 'tickets-shop': gainTickets(s, g, 'pact', D.PACT_TICKETS); break;
    case 'cheap-shop':
      s.debt = D.pactDebt(s.debt, D.CHEAP_SHOP_DEBT_MUL);
      s.debtOps.push('cheap');
      break;
    case 'debt-cut':
      s.debt = D.pactDebt(s.debt, D.DEBT_CUT_MUL);
      s.debtOps.push('cut');
      s.debtNextMul = D.DEBT_NEXT_MUL;
      break;
    case 'free-amulet': {
      // Уже включённые предметы сделка не снимает: предел столбика проверяем от того, что уже стоит.
      s.slotBase = Math.max(s.slotBase, I.activeSlotEffects(s.effects).length);
      const [amulet] = A.randomAmuletOffer(ids(s), s.upgradeEffects.amuletMaxCopies); // потолок копий с №27
      if (amulet) {
        if (!s.amulets.some((owned) => owned.id === amulet.id)) s.amulets.push(amulet); // копия — в гнездо своего амулета
        A.addCopy(s.amuletCounts, amulet.id);
        g.amuletsFree += 1;
      }
      break;
    }
    // ---------- Шаг 30: разовые выдачи ----------
    case 'empty-spin': s.debtNextMul = D.EMPTY_SPIN_DEBT_MUL; break;
    case 'half-step': {
      const pay = Math.min(D.HALF_STEP_TICKETS, s.tickets);
      if (pay > 0) spendTickets(s, g, pay);
      break;
    }
    case 'win-debt':
      s.debt = D.pactDebt(s.debt, D.WIN_DEBT_MUL);
      s.debtOps.push('win');
      break;
    case 'ticket-gift': gainTickets(s, g, 'pact', D.PACT_TICKETS); break;
    case 'pot-start': s.debtNextMul = D.POT_START_DEBT_MUL; break;
    case 'chips-start':
      earn(s, g, D.CHIPS_START_CHIPS);
      s.debt = D.pactDebt(s.debt, D.CHIPS_START_DEBT_MUL);
      s.debtOps.push('chips');
      break;
    case 'free-item': {
      s.slots = Math.max(0, Math.min(I.MAX_SLOTS, s.slots + D.FREE_ITEM_SHELF)); // сначала короче полка
      const slot = s.shelf.slice(0, s.slots).indexOf(null);
      if (slot >= 0) {
        const [item] = I.randomOffer(s.round, (entry) => M.machineItemAllowed(s.machineId, entry), 1);
        if (item) s.shelf[slot] = item;
      }
      break;
    }
    case 'two-slots':
      for (let n = 0; n < D.TWO_SLOTS_BONUS && s.slots < I.MAX_SLOTS; n++) { s.slots += 1; s.shelf.push(null); }
      break;
    case 'joker-slot': {
      s.slots = Math.max(0, Math.min(I.MAX_SLOTS, s.slots + D.JOKER_SLOT_SHELF)); // сначала короче полка
      const slot = s.shelf.slice(0, s.slots).indexOf(null);
      const joker = I.ITEMS.find((entry) => entry.id === 'swap');
      if (slot >= 0 && joker) s.shelf[slot] = joker;
      break;
    }
    case 'amulet-copy': {
      const candidate = s.amulets.find((amulet) => A.countOf(s.amuletCounts, amulet.id) < A.maxCopiesOf(amulet, s.upgradeEffects.amuletMaxCopies));
      if (candidate) { A.addCopy(s.amuletCounts, candidate.id); g.amuletsFree += 1; }
      break;
    }
    case 'socket-gift': s.sockets = Math.min(A.MAX_SOCKETS, s.sockets + 1); break;
    case 'amulet-save': s.amuletBurns = true; break;
    case 'machine-pick': if (machinePick) s.machineId = machinePick; break;
    case 'debt-defer': s.debtNextMul = D.DEBT_DEFER_COST_MUL; break;
    case 'debt-tickets': {
      const pay = Math.min(D.DEBT_TICKETS_OFF, s.tickets);
      if (pay > 0) spendTickets(s, g, pay);
      break;
    }
  }
  g.pactsTaken += 1;
  g.pactsById[pick.id] = (g.pactsById[pick.id] ?? 0) + 1; // какие карты бот берёт (для отчёта)
  if (PACTS_MODE === 'all') PACT_SEEN.add(pick.id);
  // Сделка №10 может опустить потолок уже посреди раунда: текущие прокрутки не должны остаться выше него.
  s.spinsLeft = Math.min(s.spinsLeft, spinCap(s));
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
    gainTickets(s, g, 'jackpot', B.JACKPOT_TICKETS + s.upgradeEffects.jackpotTickets); // №18 (28б): джекпот даёт +1 билет
    s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, B.JACKPOT_SPINS, spinCap(s));
  }
}

/**
 * Черепа сожгли кон. Страховка (INSURANCE_SHARE) возвращает часть сгоревшего на табло — один раз за раунд
 * (insuranceSaves против числа копий), иначе спасла бы больше раз, чем куплено (RoundScene.burnPot).
 */
function burnPot(s, g) {
  const lost = s.pot;
  const pact = D.pactEffects(s.pacts, s.round);
  // Улучшение №15 (шаг 28): страховка возвращает 80% вместо 75% — берём большую долю из сделки и улучшения.
  const share = Math.max(pact.insuranceShare, s.upgradeEffects.insuranceShare);
  const insured = A.insuranceRefund(lost, ids(s), s.insuranceSaves, share);
  // Сделка №23: череп возвращает половину сгоревшего кона на табло без страховки.
  const refund = Math.max(insured, Math.floor(lost * Math.max(0, Math.min(1, pact.skullPotRefund))));
  s.pot = 0;
  // Сделки с черепом: «череп в ×1» обнуляет, «мягкий череп» снимает одну ступень (одно очко серии), иначе треть.
  s.streak = D.skullStreakAfter(s.streak, pact);
  if (refund > 0) {
    if (insured > 0) s.insuranceSaves += 1;
    earn(s, g, refund); // сработка копии: счётчик страховки гасит её до конца раунда; возврат — доход забега
  }
}

/** Одна прокрутка (обычная или бесплатная) с итогом — как RoundScene.roll + evaluateSpin. Вернёт, сколько сгорело. */
function roll(s, st, g, isFree) {
  g.time += SECONDS.spin;
  g.spins += 1;
  g.roundSpins += 1; // сумма прокруток за раунд (для проверки «потолок не ограничивает сумму»)
  if (!isFree) g.paidSpins += 1;
  const calm = false; // спокойного режима больше нет: рычаг только крутит, веса не двигает
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
  // Улучшения №32/33 (28в): первая сетка забега — с джокером и выбранным символом, как RoundScene.roll.
  if (!s.startGridGiven) {
    grid = UPG.startGridOf(grid, s.upgradeEffects, s.startSymbol);
    s.startGridGiven = true;
  }
  grid = D.pactJokerCenter(grid, D.pactEffects(s.pacts, s.round)); // сделка №39: джокер в центре каждой сетки
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
    const pact = D.pactEffects(s.pacts, s.round);
    // №50 (28г): отмена черепа — только если череп правда сжёг бы кон (щиты и сделка №10 его и так отобьют)
    // и кон стоит отмены (политика бота, см. shouldCancelSkull). Отменили — ни кона, ни серии, ни страховки.
    const keepsPotNow = (pact.bankSurvivesSkull && !s.bankKeptThisRound) || (pact.potSafeFirst && !s.potSparedThisRound);
    const cancels = !pact.skullUnblockable && s.roundShields === 0 && s.effects.shields === 0 && !keepsPotNow && shouldCancelSkull(s);
    if (cancels) {
      s.skullCancelUsed = true;
      g.skullCancels += 1;
    } else {
      // Улучшение №4 (шаг 28): первый паттерн черепов в раунде даёт бесплатную прокрутку (RoundScene.grantSkullFreeSpin).
      if (s.upgradeEffects.freeSpinAfterFirstSkull && !s.skullFreeGiven) {
        s.skullFreeGiven = true;
        s.freeSpins += 1; g.freeSpinsGiven += 1; g.freeInRound += 1;
        g.freeMax = Math.max(g.freeMax, g.freeInRound);
        g.skullFree += 1;
      }
      if (!pact.skullUnblockable && s.roundShields > 0) { s.roundShields -= 1; s.streak += 1; }
      else if (!pact.skullUnblockable && s.effects.shields > 0) { s.effects.shields -= 1; s.streak += 1; }
      else {
        // Сделка №10/№24: первый череп раунда кон не жжёт, второй — как обычно (№24 — ещё и вдвое).
        const bankSafe = pact.bankSurvivesSkull && !s.bankKeptThisRound;
        const pactSafe = pact.potSafeFirst && !s.potSparedThisRound;
        if (bankSafe) s.bankKeptThisRound = true;
        if (pactSafe) s.potSparedThisRound = true;
        const keepsPot = bankSafe || pactSafe;
        const doubleBurn = pact.skullDoubleBurn && s.potSparedThisRound && !keepsPot;
        if (keepsPot) { s.streak = D.skullStreakAfter(s.streak, pact); }
        else {
          burned = s.pot;
          burnPot(s, g);
          if (doubleBurn && burned > 0) s.balance = Math.max(0, s.balance - burned); // вдвое: пот и столько же с табло
        }
        if (isBloody) s.balance -= E.bloodBurn(s.balance); // кровавая прокрутка: сгорает ещё и часть табло
      }
      // Сделка №2: каждый череп отнимает прокрутку, но не оставляет раунд без прокруток.
      if (pact.skullSpinCost > 0) s.spinsLeft = Math.max(MIN_ROUND_SPINS, s.spinsLeft - Math.abs(pact.skullSpinCost));
    }
  } else {
    s.streak += 1; // серия растёт всегда — и в спокойной прокрутке
    if (!calm) {
      if (result.kind === 'win') {
        const pact = D.pactEffects(s.pacts, s.round);
        const payMul = (symbol) => D.pactSymbolPay(symbol, pact); // сделка №14: вишни платят ×2
        const win = A.amuletPatternWin(result.hits, owned, payMul);
        const jackpot = result.hits.some((hit) => hit.pattern.id === 'jackpot'); // №34: только джекпот
        const factor = A.winFactor(owned, s.bones) * (isBloody ? E.BLOOD_WIN : 1) * M.machineWinFactor(mach(s)) * (s.effects.risk ? I.RISK_WIN_FACTOR : 1)
          * pact.winMul // сделка «выигрыш паттернов +N%» — только паттерны
          * s.upgradeEffects.winMul // улучшение №12 «выигрыш паттернов +5%» (шаг 28) — тоже только паттерны
          * UPG.jackpotWinFactor(jackpot, s.upgradeEffects) // №34: джекпот ×1,2 (×120 вместо ×100)
          * D.pactJackpotWin(jackpot, pact) // сделка №12: джекпот платит вдвое
          * ACT.lotteryWinMul(s.actions); // №4 (шаг 29): лотерея может поднять или срезать выигрыш раунда
        s.pot += Math.round(win * mult * factor);
        s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, A.bellSpins(result.hits, owned), spinCap(s)); // потолок прокруток за раунд
        // Колокольчик (шаг 25): каждое срабатывание до конца раунда делает черепа чаще — тот же amulets.bellSkullDelta,
        // что зовёт RoundScene.addToPot. Копится и тогда, когда прокрутки уже у потолка (сработало же).
        s.bellSkull = A.bellSkullDelta(result.hits, owned, s.bellSkull, BELL_SKULL_STEP);
      } else {
        s.pot += A.piggyCoins(mult, owned, s.upgradeEffects.piggyBonus); // улучшение №14: +1 фишка за прокрутку
        // Сделка №5: пустая прокрутка даёт ещё прокрутку — не выше потолка раунда.
        const empty = D.pactEffects(s.pacts, s.round).emptySpinSpins;
        if (empty > 0) s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, empty, spinCap(s));
      }
      s.pot -= E.spiderBite(s.pot, E.cellsOf(grid, 'spider').length);
    }
  }
  if (!calm) collectBonuses(s, g, grid, result);
  s.lastGrid = grid;
  rustAfterSpin(s);
  // Риск, молот и фарт — на одну прокрутку; в спокойной прокрутке флаги ждут обычной.
  if (!calm) {
    s.effects.risk = false;
    // №25 (28б): молот не тратится на прокрутке без выигрыша — как RoundScene.finishSpinOutcome.
    if (!UPG.keepsHammerAfter(result.kind, s.upgradeEffects.keepsHammerOnEmpty)) s.effects.hammer = false;
    s.effects.luckSpin = false;
  }
  if (!calm && E.cellsOf(grid, 'dice').length > 0) { s.diceDrought = 0; dealer(s, st, g); } else s.diceDrought += 1;
  return burned;
}

/**
 * Доля клеток-черепов сейчас — как плашка «💀 N%» в игре: по тем же весам, что и следующая прокрутка
 * (weightOf уже включает сделки, колокольчик, улучшение №31 и действия шага 29).
 */
function skullShareNow(s) {
  const weight = weightOf(s, false);
  let skull = 0;
  let others = 0;
  for (const symbol of R.SYMBOLS) {
    const value = weight(symbol);
    if (R.isSkull(symbol)) skull = value;
    else if (!R.isDice(symbol)) others += value;
  }
  return skull + others > 0 ? skull / (skull + others) : 0;
}

/** Символы последней сетки, которые платят и есть в автомате: из них бот выбирает обмен (№2) и продажу (№8). */
function gridSymbolsOf(s) {
  if (!s.lastGrid) return [];
  const weight = rawWeightOf(s, false);
  const seen = new Set();
  const list = [];
  for (const row of s.lastGrid) {
    for (const cell of row) {
      if (seen.has(cell.id) || !(cell.price > 0) || !(weight(cell) > 0)) continue;
      seen.add(cell.id);
      list.push(cell);
    }
  }
  return list;
}

/** Сколько клеток символа на последней сетке (как actions.symbolCells). */
function cellsOfSymbol(s, id) {
  let count = 0;
  for (const row of s.lastGrid ?? []) for (const cell of row) if (cell.id === id) count += 1;
  return count;
}

/**
 * Действия вне прокрутки (шаг 29) между прокрутками раунда. Политика бота (не правила): обслуживание — при
 * высокой доле черепов, биржа — когда долг уже закрыт, кража — когда риск смерти ниже порога, продажа и обмен —
 * когда на долг не хватает. Каждое — раз в раунде (actions.useAction). Вернёт true, если кража провалилась
 * и забег кончился: тогда раунд не докручивается (KABOOM, как в игре).
 */
function useActions(s, st, g) {
  if (!ACTIONS_ON || st.actions === false || !s.actions) return false;
  const used = (id) => ACT.actionUsed(s.actions, id);
  const short = s.balance + s.pot < s.debt;
  // №5: обслуживание — черепа уже жалят, а фишки есть.
  if (!used('service') && ACT.serviceAllowed(s.actions)) {
    const price = ACT.servicePrice(s.debt);
    if (price <= s.balance && skullShareNow(s) >= st.serviceSkullShare) {
      s.balance -= price;
      s.actions = ACT.useAction({ ...s.actions, serviceRounds: ACT.ACTION_SERVICE_ROUNDS }, 'service');
      g.actionService += 1;
      g.actionPaid += price;
      g.time += SECONDS.action;
    }
  }
  // №10: биржа — этот долг уже закрыт, и платить есть чем: следующий станет дешевле.
  if (!used('debt') && s.actions.debtCut === 0) {
    const next = D.shopDebt(s.debt, s.round + 1, s.debtNextMul, false, s.upgradeEffects.debtGrowthMul).debt + (s.deferCarry ?? 0);
    const price = ACT.debtBuyPrice(next);
    if (price <= s.balance && s.balance - price >= s.debt) {
      s.balance -= price;
      s.actions = ACT.useAction({ ...s.actions, debtCut: ACT.debtBuyCut(next) }, 'debt');
      g.actionDebt += 1;
      g.actionPaid += price;
      g.actionDebtChips += ACT.debtBuyCut(next);
      g.time += SECONDS.action;
    }
  }
  // №8: продажа символа — на долг не хватает, а на сетке есть символ, за который дают достаточно.
  if (!used('sale') && short) {
    const best = gridSymbolsOf(s)
      .map((symbol) => ({ symbol, price: ACT.salePrice(symbol, cellsOfSymbol(s, symbol.id)) }))
      .sort((a, b) => b.price - a.price)[0];
    if (best && best.price >= st.saleMin) {
      s.actions = ACT.useAction({ ...s.actions, sold: [...s.actions.sold, best.symbol.id] }, 'sale');
      earn(s, g, best.price);
      g.actionSale += 1;
      g.actionChips += best.price;
      g.time += SECONDS.action;
    }
  }
  // №2: обмен — на долг не хватает и билетов с запасом: тяжёлый дешёвый символ меняется на лёгкий дорогой.
  if (!used('exchange') && short && s.tickets >= st.exchangeTickets) {
    const weight = weightOf(s, false);
    const grid = gridSymbolsOf(s);
    const to = grid.slice().sort((a, b) => b.price - a.price)[0];
    const from = grid.slice().sort((a, b) => weight(b) - weight(a))[0];
    if (to && from && to.id !== from.id && weight(to) < weight(from)) {
      spendTickets(s, g, ACT.ACTION_EXCHANGE_TICKETS);
      s.actions = ACT.useAction({ ...s.actions, exchange: { from: from.id, to: to.id } }, 'exchange');
      g.actionExchange += 1;
      g.time += SECONDS.action;
    }
  }
  // №4: лотерея — билетов с запасом и на долг не хватает.
  if (!used('lottery') && short && s.tickets >= st.lotteryTickets) {
    spendTickets(s, g, ACT.ACTION_LOTTERY_TICKETS);
    const prize = ACT.lotteryRoll();
    s.actions = ACT.useAction({ ...s.actions, lottery: prize }, 'lottery');
    if (prize.spins > 0) s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, prize.spins, spinCap(s));
    else if (prize.spins < 0) s.spinsLeft = Math.max(MIN_ROUND_SPINS, s.spinsLeft + prize.spins);
    g.actionLottery += 1;
    g.time += SECONDS.action;
  }
  // №6: кража — последняя прокрутка раунда, на долг всё равно не хватает, яма уже была (иначе впереди спасение)
  // и риск смерти (1 − шанс) не выше порога политики: это последний шанс, а не способ подзаработать.
  if (!used('theft') && short && s.spinsLeft <= 1 && s.rescueUsed && ACT.theftChance(s.round) >= st.theftChance) {
    s.actions = ACT.useAction(s.actions, 'theft');
    g.actionTheft += 1;
    g.time += SECONDS.action;
    if (ACT.theftSucceeds(s.round)) {
      const reward = ACT.theftReward(s.debt);
      earn(s, g, reward);
      g.actionChips += reward;
    } else {
      g.actionTheftFailed += 1; // провал — смерть: второй попытки и магазина нет, раунд не докручивается
      return true;
    }
  }
  return false;
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
    && s.spinsLeft < spinCap(s) && useSlot('cigarette')) s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, I.CIGARETTE_SPINS, spinCap(s));
  // «Забрать»: пока на руках меньше долга — забираем, как только баланс с коном закрывает его (как в игре);
  // когда долг уже покрыт — забираем кон от абсолютного порога SIM_TAKE_POT. Второй случай и есть правка 19.11:
  // раньше порог был 0,5 × долга, и при долге 10к+ кон не набирался никогда — бот крутил фриспины до предохранителя
  // (забег 294 минуты), и замеры на жёстких кривых врали.
  // Шаг 27: спасение оставляет долг прежним, и текущий долг может быть меньше номинального долга круга.
  // Бот, как игрок, всё равно целится в нормальную прибыль круга (debtForRound), а не в маленький долг.
  // Ржавая смерть отдельно: столбец с черепами сжигает кон, его тоже забираем при любом пороге.
  const nominal = Math.max(0, R.debtForRound(s.round, s.upgradeEffects.debtGrowthMul) - s.balance);
  const takeTarget = Math.max(need, nominal, SIM_TAKE_POT);
  const takePact = D.pactEffects(s.pacts, s.round);
  // Сделки №22/№23: кон нельзя забрать руками вовсе или только раз за раунд.
  const canTakeNow = !takePact.noTake && !(takePact.takeOncePerRound && s.tookThisRound);
  let take = canTakeNow && s.balance + s.pot >= takeTarget;
  if (s.rustyColumn !== null && s.lastGrid) {
    const skulls = s.lastGrid.filter((line) => R.isSkull(line[s.rustyColumn])).length;
    if (canTakeNow && skulls >= st.rustSkulls) take = true;
  }
  if (take && s.pot > 0 && s.streak >= 2 && !s.effects.candle && useSlot('candle')) s.effects.candle = true; // не режем серию
  if (take && s.pot > 0) {
    const taken = payPot(s, g);
    g.time += SECONDS.take;
    // Сделка №15: второе «забрать» в той же прокрутке отдаёт DOUBLE_TAKE_SHARE забранного (RoundScene.take).
    const takeEffects = D.pactEffects(s.pacts, s.round);
    const extra = D.pactDoubleTake(takeEffects.doubleTake, taken, takeEffects.doubleTakeShare);
    if (extra > 0) { earn(s, g, extra); g.doubleTakes += 1; }
  }
}

// ---------- Кассета (SaveScene) ----------

/** Что попадает на кассету — поля RunSave из save.ts, которые есть в симуляторе. */
function runSave(s) {
  return {
    round: s.round, spinsLeft: s.spinsLeft, pot: s.pot, streak: s.streak, isBloodNext: s.isBloodNext,
    luckyClovers: s.luckyClovers, roundShields: s.roundShields, debtRound: s.debtRound, debtBase: s.debtBase, deferAdded: s.deferAdded, debtOps: s.debtOps, debt: s.debt, balance: s.balance, tickets: s.tickets,
    slots: s.slots, shelf: s.shelf, effects: s.effects, sockets: s.sockets, amulets: s.amulets,
    amuletCounts: s.amuletCounts, bones: s.bones, machineId: s.machineId,
    pacts: s.pacts, debtNextMul: s.debtNextMul, diceDrought: s.diceDrought, insuranceSaves: s.insuranceSaves,
    debtCutApplied: s.debtCutApplied, // сколько срезал выкуп долга (№10): откат к записи после выкупа это помнит
    rescueUsed: s.rescueUsed, // липкий, как devUsed: откат спасение не возвращает (save.ts)
    deferUsed: s.deferUsed, // и отсрочка (улучшение №10) липкая: откат вторую попытку не даёт
    amuletChipUsed: s.amuletChipUsed, // №39: амулет за фишки тоже липкий
    giftGiven: s.giftGiven, // №40: подарок первого магазина тоже
    skullCancelUsed: s.skullCancelUsed, // №50 (28г): отмена черепа тоже липкая
    startSymbol: s.startSymbol, // №33: выбранный символ
    startGridGiven: s.startGridGiven, // первая сетка уже с джокером/символом
    // Цель забега тоже на плёнке (RunSave.earned): откат возвращает и набранное, и пик табло, и момент победы.
    earned: s.earned, peakBalance: s.peakBalance, millionRound: s.millionRound, millionSeconds: s.millionSeconds,
    recordRound: s.recordRound, recordSeconds: s.recordSeconds,
  };
}

/** Записать: снимок забега как есть. Кассета на видеомагнитофоне становится записанной. */
function record(s, g) {
  g.tape = 'recorded'; g.record = clone(runSave(s));
  // №45 (28г): с этой минуты траты считаются «потраченными после записи» — их вернёт откат.
  g.ticketsSpentOnTape = 0;
  // Счётчики прокруток вместе со снимком: после отката раунд играется заново, и списанные до отката прокрутки
  // не должны дважды попадать в «прокруток за забег», «макс. за раунд» и долю раундов сверх потолка.
  // roundEarnStart — «набрано» на входе в раунд: без него после отката «доход раунда» в balanceRows считался
  // от начала заново сыгранного раунда и врал в меньшую сторону.
  g.recordCounters = { roundSpins: g.roundSpins, spins: g.spins, paidSpins: g.paidSpins, roundPaid: g.roundPaid, firstSpinMult: g.firstSpinMult, firstSpinRounds: g.firstSpinRounds, roundEarnStart: g.roundEarnStart };
  g.time += SECONDS.rec; g.recs += 1;
}

/**
 * Откатиться к записи: автомат съедает кассету. Предусловия — как SaveScene.canRewind: кассета записана, раунд идёт,
 * впереди нет бесплатных прокруток. Запись может быть из прошлого раунда — loadTape:136-166 восстанавливает круг
 * из записи, поэтому откат через границу раунда разрешён (tapeState переживает конец раунда, canRewind истинен сразу
 * после startRound). Страховка откатом не пополняется и живёт только в том же раунде.
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
  back.rescueUsed = S.rescueUsedOf(saved, s.rescueUsed); // спасение тоже липкое: откат вторую яму не выпрашивает
  back.deferUsed = S.deferUsedOf(saved, s.deferUsed); // отсрочка (улучшение №10) липкая так же
  back.amuletChipUsed = S.amuletChipUsedOf(saved, s.amuletChipUsed); // №39 липкий
  back.giftGiven = S.freeGiftUsedOf(saved, s.giftGiven); // №40 липкий
  back.skullCancelUsed = S.skullCancelUsedOf(saved, s.skullCancelUsed); // №50 липкий: откат вторую отмену не даёт
  // №42 (28г): откат не сбрасывает серию — остаётся большая из текущей и записанной (upgrades.streakAfterRewind).
  back.streak = UPG.streakAfterRewind(saved.streak, s.streak, s.upgradeEffects.rewindKeepsStreak);
  // №45 (28г): откат возвращает билеты, потраченные после записи, — к снимку с плёнки (не больше потраченного).
  back.tickets = UPG.ticketsAfterRewind(saved.tickets, g.ticketsSpentOnTape, s.upgradeEffects.rewindRefundsTickets);
  back.deferCarry = 0; // отложенный долг на плёнку не пишется: на записи число уже включает его
  // Откат не пополняет страховку: сработки этого раунда и с плёнки берём по большей (как SaveScene.loadTape).
  back.insuranceSaves = Math.max(saved.round === s.round ? s.insuranceSaves : 0, saved.insuranceSaves ?? 0);
  g.tape = 'forSale'; g.record = null; g.time += SECONDS.rewind; g.rewinds += 1;
  Object.assign(s, back);
  Object.assign(g, g.recordCounters ?? {}); // счётчики прокруток и начало дохода раунда (roundEarnStart) — как на записи
  g.recordCounters = null;
  g.ticketsLedger = back.tickets; // билеты вернулись к записи — сверка табло начинается заново
  g.ticketsSpentOnTape = 0; // №45: потраченные билеты вернулись — второй раз их не начислить
  s.rustyColumn = null; s.lastGrid = null; s.freeSpins = 0; // заморозок и прошлой сетки в записи нет
  // Колокольчик живёт в раунде и на плёнку не пишется (save.ts шаг 25 не трогал): в игре откат перезапускает сцену,
  // resetState обнуляет поправку — здесь так же, иначе после отката черепов было бы больше, чем в игре.
  s.bellSkull = 0;
  // Действия вне прокрутки (шаг 29) на плёнку не пишутся: в игре откат перезапускает сцену, и resetState
  // оставляет действия пустыми. Так же и здесь — заплаченное откатывает уже сам снимок баланса.
  // А вот след выкупа долга в самой записи остаётся: долг на плёнке уже срезан (debtCutApplied), и проверка
  // долга должна это знать — иначе откат к записи после выкупа выглядел бы как «долг не из набора».
  s.actions = ACT.freshActions();
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
    // Действия вне прокрутки (шаг 29): тоже между прокрутками. Провал кражи кончает забег — раунд не докручивается.
    if (useActions(s, st, g)) {
      g.theftDeath = true;
      return s;
    }
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

/**
 * Долг нового раунда: debtForRound с ростом улучшения №7 + разовый «следующий долг +20%» (№12) — как
 * ShopScene.applyShopDebt, — плюс отложенный раньше долг (улучшение №10, deferCarry).
 */
function takeDebtForRound(s, g) {
  // то же правило, что ShopScene.applyShopDebt (рост долга — из улучшения №7)
  const next = D.shopDebt(s.debt, s.round, s.debtNextMul, false, s.upgradeEffects.debtGrowthMul);
  const carry = s.deferCarry ?? 0;
  // «Долговая биржа» (действие №10, шаг 29): выкупленный заранее долг уменьшает следующий (ShopScene.applyShopDebt).
  const cut = s.actions?.debtCut ?? 0;
  const debt = Math.max(0, next.debt + carry - cut);
  s.deferCarry = 0; // отложенный долг уже в числе — второй раз не прибавляем
  s.debtCutApplied = cut; // сколько срезал выкуп: проверка долга это учитывает
  if (cut > 0) s.actions = { ...s.actions, debtCut: 0 }; // выкуп одноразовый
  s.debtNextMul = next.debtNextMul; // множитель действует ровно на один долг
  // Долг этого круга и его база для «−10%» и «+8%». При повторе раунда (выжил в спасении) сюда не
  // заходят вовсе: openShop(..., keepDebt) оставляет прежнее число и прежние debtBase/debtOps.
  s.debtRound = s.round;
  s.debtBase = next.debt; // от чего считаются «−10%» и «+8%» этого долга; отсрочка — отдельным полем
  s.deferAdded = carry;
  s.debtOps = [];
  // Замер баланса долгов: у последней оплаты теперь известен настоящий следующий долг (после спасения
  // раунд играется заново, и следующий долг будет тем же — debtForRound(round + 1) в collector() бы соврал).
  if (g.lastBalanceRow) { g.lastBalanceRow.nextDebt = debt; g.lastBalanceRow = null; }
  return debt;
}

/**
 * Витрина амулетов магазина: потолок копий поднят улучшением №27 (28б). В первом магазине забега (закрыт ровно
 * первый долг) улучшение №29 гарантирует редкий амулет — как ShopScene.amuletOfferForShop.
 */
/** Потолок копий с учётом сделки №20: страховку можно держать только одну. */
function amuletMaxNow(s, amulet, bonus, effects) {
  const max = A.maxCopiesOf(amulet, bonus);
  return effects?.insuranceMaxOne && amulet.id === 'insurance' ? Math.min(1, max) : max;
}

/** Цена амулета с поправками сделок №17/№20/№32 — та же арифметика, что ShopScene.amuletPriceNow. */
function amuletCostNow(s, amulet, shopMul, ticketsOff, effects) {
  if (effects.amuletFreeInsurance && amulet.id === 'insurance') return 0;
  const price = A.amuletPrice(amulet, shopMul * effects.amuletPriceMul, ticketsOff) + effects.amuletPriceAdd;
  if (effects.amuletCopiesDouble) return A.insuranceCopyPrice(price, A.countOf(s.amuletCounts, amulet.id));
  if (effects.insuranceDoubles && amulet.id === 'insurance') return A.insuranceCopyPrice(price, A.countOf(s.amuletCounts, 'insurance'));
  return price;
}

function shopAmuletOffer(s, closed, maxCopiesBonus, shopEffects) {
  let offer = A.randomAmuletOffer(ids(s), maxCopiesBonus);
  // Сделка №35: редкий амулет всегда и только один амулет за магазин.
  if (shopEffects?.rareAmuletForced || (s.upgradeEffects.rareAmuletFirstShop && closed === 1)) {
    offer = A.withRareAmulet(offer, ids(s), maxCopiesBonus);
  }
  const limit = Number.isFinite(shopEffects?.amuletPerShop) && shopEffects.amuletPerShop > 0 ? shopEffects.amuletPerShop : 0;
  return limit > 0 ? offer.slice(0, limit) : offer;
}

/**
 * Магазин после отданного долга: раунд +1, новый долг, витрины по закрытым долгам, покупки.
 * keepDebt — раунд играется заново (выжил в спасении): долг остаётся ровно прежним числом,
 * debtBase/debtOps и debtNextMul не трогаются (ShopScene.openShop(true)). Иначе «−10%» и «+8%» сделок терялись бы.
 * checkRound — раунд, по которому проверяется «магазин закрыт»: по умолчанию счёт магазина на входе, а при повторе
 * раунда сюда приходит исходный номер (ShopScene.openShop(keepDebt, replayRound)): иначе сделка, взятая в N,
 * искалась бы в N − 1 и магазин открывался бы зря.
 */
function openShop(s, st, g, econ, keepDebt = false, checkRound = s.round) {
  // Магазин закрыт сделкой Дилера (ShopScene.skipClosedShop): панель не выезжает — новый долг и сразу новый раунд.
  // Срок проверяем по номеру магазина (checkRound), а не по счёту после отката.
  if (D.pactEffects(s.pacts, checkRound).shopClosed) {
    // Время идёт и здесь: в игре панель не выезжает, но игрок всё равно тратит те же секунды на записку и раунд.
    g.shopsClosed += 1;
    g.time += SECONDS.shop;
    s.round += 1;
    const freezeClosed = !keepDebt && D.pactEffects(s.pacts, checkRound).debtNoGrowth;
    if (!keepDebt && !freezeClosed) s.debt = takeDebtForRound(s, g); // «следующий долг +20%» из сделки №12
    if (freezeClosed) s.debtNextMul = D.DEBT_FREEZE_NEXT_MUL; // сделка №44: следующий долг вдвое
    check(s, g);
    return;
  }
  g.time += SECONDS.shop;
  g.shops += 1;
  s.round += 1;
  // Сделка №44: долг не растёт в этом раунде — оставляем прежнее число, следующий долг вдвое.
  const freeze = !keepDebt && D.pactEffects(s.pacts, checkRound).debtNoGrowth;
  if (!keepDebt && !freeze) s.debt = takeDebtForRound(s, g); // долг не зависит от автомата (characterDebt больше нет)
  if (freeze) s.debtNextMul = D.DEBT_FREEZE_NEXT_MUL;
  const closed = s.round - 1; // closedDebts(): раунд уже увеличен
  check(s, g);
  // Скидка №2 (ShopScene.shopDiscount) и «страховка вдвое дороже за копию» (№5): магазин открывается после раунда,
  // поэтому срок сделки смотрим на прошлом раунде — счёт уже увеличен.
  const shopEffects = D.pactEffects(s.pacts, closed);
  const shopMul = shopEffects.shopDiscount * s.upgradeEffects.shopPriceMul; // сделка №2 × скидка №36 (28в)
  const fullInsurance = shopEffects.insuranceDoubles;
  // Улучшения 28б: предметы дешевле на 10% (№22), амулеты на билет дешевле (№26), потолок копий выше (№27).
  const itemMul = shopMul * s.upgradeEffects.itemPriceMul * shopEffects.itemPriceMul;
  const amuletTicketsOff = s.upgradeEffects.amuletTicketsOff;
  const maxCopiesBonus = s.upgradeEffects.amuletMaxCopies;
  // №38 (28в): доля первого билета за фишки — из улучшения, шаги роста те же.
  const ticketStart = s.upgradeEffects.ticketShareStart;
  const ticketShopMul = shopMul * shopEffects.ticketChipsMul; // сделка №18: билеты за фишки дороже
  // Витрина — под автомат, который стоит: «Удача» у «Тихого» бесполезна (клевера там нет).
  // №37: рядов предметов на один больше; сделка №27 — на один меньше. Витрина потом пополняется, как ShopScene.refillRow.
  const rows = Math.max(1, I.offerRowCount(s.upgradeEffects.offerRows + shopEffects.itemOfferDelta));
  const offer = I.randomOffer(s.round, (item) => M.machineItemAllowed(s.machineId, item), rows);
  // Что открыто в магазине — по закрытым долгам; сделка №33 закрывает амулеты на весь забег.
  const amuletOffer = closed >= 1 && !shopEffects.amuletsClosed ? shopAmuletOffer(s, closed, maxCopiesBonus, shopEffects) : [];
  // №40 (28в): первый магазин забега — один случайный предмет бесплатно на свободное место полки.
  if (closed === 1 && s.upgradeEffects.freeItemFirstShop && !s.giftGiven && freeSlot(s) >= 0) {
    const [gift] = I.randomOffer(s.round, (item) => M.machineItemAllowed(s.machineId, item), 1);
    if (gift) {
      s.shelf[freeSlot(s)] = gift;
      s.giftGiven = true;
      g.giftsGiven += 1;
    }
  }
  const reserve = () => s.balance - st.reserveShare * s.debt;
  // Кассета продаётся с третьего закрытого долга, цена — save.tapePrice (2 + купленные). Цена получает и число
  // закрытых долгов (второй аргумент) — старый контракт tape45-sim (econ.tapePrice(bought, closed)) не ломается.
  const buyTape = () => {
    if (closed < 3 || g.tape !== 'forSale') return; // открыта с третьего долга и только пока не куплена
    if (st.tape === 'none') return;
    // econ.tapeOnce === false — «сколько угодно кассет» (старая ручка tape45-sim); иначе по политике st.tapes.
    const manyTapes = st.tapes === 'always' || econ.tapeOnce === false;
    if (!manyTapes && g.tapesBought > 0) return;
    const price = UPG.tapePriceAfter(S.tapePrice(g.tapesBought, shopMul), s.upgradeEffects.freeTape); // №44 (28г): кассета бывает бесплатной
    if (price > s.tickets) return;
    spendTickets(s, g, price);
    g.tapesBought += 1;
    g.tapeClosedAtBuy = closed; // для инварианта: кассета не раньше третьего закрытого долга
    g.tape = 'blank';
  };
  if (st.tape === 'first') buyTape();
  // Билеты за фишки (шаг 13): четвёртый ряд торгового автомата — билет стоит долю фишек на руках (items.ticketForChips),
  // и каждый следующий за забег дороже. Бот покупает их только с умыслом: в витрине есть амулет, который он всё равно
  // взял бы (тот же порядок AMULET_POWER и те же проверки копий и гнезда, что в цикле ниже),
  // а билетов на него не хватает. Покупка — по одному, не больше потолка игры items.TICKETS_PER_SHOP за магазин
  // (SIM_TICKETS_PER_SHOP замеряет другой потолок, 0 — без потолка), и только пока после неё фишек остаётся не меньше
  // резерва (reserve()): билет — размен фишек на амулет, а не доход.
  if (closed >= 1) {
    /** Сколько билетов нужно на амулет: цена и, для нового амулета без гнезда, ещё и гнездо. null — бот его не возьмёт. */
    const amuletNeed = (amulet) => {
      if (A.countOf(s.amuletCounts, amulet.id) >= amuletMaxNow(s, amulet, maxCopiesBonus, shopEffects)) return null; // копий уже под потолок
      const price = amuletCostNow(s, amulet, shopMul, amuletTicketsOff, shopEffects);
      const socket = s.amulets.findIndex((a) => a.id === amulet.id);
      if (socket < 0 && s.amulets.length >= s.sockets) {
        const sp = A.socketPrice(s.sockets, shopMul, s.upgradeEffects.firstSocketFree); // №28: первое гнездо бесплатно
        return sp === null ? null : sp + price; // новый амулет — только вместе с гнездом
      }
      return price;
    };
    for (const amulet of [...amuletOffer].sort((a, b) => AMULET_POWER[b.id] - AMULET_POWER[a.id])) {
      const need = amuletNeed(amulet);
      if (need === null) continue; // этот амулет бот не возьмёт и с билетами
      if (need <= s.tickets) break; // лучший доступный уже по карману — докупать незачем
      for (let bought = 0; (TICKETS_PER_SHOP === 0 || bought < TICKETS_PER_SHOP) && s.tickets < need; bought++) {
        const price = ticketPrice(s.balance, g.ticketsBought, ticketShopMul, ticketStart);
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
  if (closed >= 1) {
    for (const amulet of [...amuletOffer].sort((a, b) => AMULET_POWER[b.id] - AMULET_POWER[a.id])) {
      if (A.countOf(s.amuletCounts, amulet.id) >= amuletMaxNow(s, amulet, maxCopiesBonus, shopEffects)) continue;
      const price = amuletCostNow(s, amulet, shopMul, amuletTicketsOff, shopEffects);
      if (price > s.tickets) continue;
      const socket = s.amulets.findIndex((a) => a.id === amulet.id); // гнездо этого амулета; −1 — такого ещё нет
      if (socket < 0 && s.amulets.length >= s.sockets) {
        const sp = A.socketPrice(s.sockets, shopMul, s.upgradeEffects.firstSocketFree); // №28: первое гнездо бесплатно
        if (sp === null || sp + price > s.tickets) continue; // гнездо с амулетом не по карману — этот не взять
        spendTickets(s, g, sp);
        s.sockets += 1;
        g.socketsBought += 1;
      }
      spendTickets(s, g, price);
      // Сделка №34: следующий купленный амулет сгорает сразу — билеты не возвращаются.
      if (s.amuletBurns) { s.amuletBurns = false; g.amuletsBurned += 1; continue; }
      A.addCopy(s.amuletCounts, amulet.id);
      if (socket < 0) s.amulets.push(amulet); // гнездо занято сразу: следующий амулет его не получит
      g.amuletsBought += 1;
    }
  }
  // №39 (28в): раз за забег амулет за фишки. Бот берёт самый дорогой доступный (по цене в фишках) из тех,
  // что вообще взял бы: копия — в своё гнездо, новый — только при свободном гнезде (гнездо за билеты не покупаем).
  if (closed >= 1 && s.upgradeEffects.amuletForChips && !s.amuletChipUsed) {
    const chipRate = ticketPrice(s.balance, 0, ticketShopMul, ticketStart); // курс билета этого магазина
    const candidates = amuletOffer
      .filter((amulet) => A.countOf(s.amuletCounts, amulet.id) < amuletMaxNow(s, amulet, maxCopiesBonus, shopEffects))
      .filter((amulet) => s.amulets.some((owned) => owned.id === amulet.id) || s.amulets.length < s.sockets)
      .map((amulet) => {
        const tickets = amuletCostNow(s, amulet, shopMul, amuletTicketsOff, shopEffects);
        return { amulet, price: I.chipsForTickets(tickets, chipRate) };
      })
      .filter((option) => option.price <= s.balance)
      .sort((a, b) => b.price - a.price); // самый дорогой доступный
    const pick = candidates[0];
    if (pick) {
      const socket = s.amulets.findIndex((owned) => owned.id === pick.amulet.id);
      s.balance -= pick.price;
      A.addCopy(s.amuletCounts, pick.amulet.id);
      if (socket < 0) s.amulets.push(pick.amulet);
      s.amuletChipUsed = true;
      g.amuletChipsBought += 1;
    }
  }
  if (st.tape === 'after') buyTape();
  // Предметы торгового автомата; нет места — место (тоже отдельная покупка, за фишки). Ряд после покупки пополняется
  // (ShopScene.buyItem → refillRow → offerReplacement), поэтому за заход можно купить больше трёх: идём по ITEM_ORDER
  // проходами, пока хоть одна покупка проходит.
  const isAllowed = (item) => M.machineItemAllowed(s.machineId, item);
  const buyItem = (row) => {
    const item = offer[row];
    const price = I.itemPrice(item, s.debt, itemMul); // №22 (28б): предметы дешевле на 10%
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
 * Расплата: 'paid' | 'survived' | 'locked' | 'dead'.
 * Фишек хватило — долг уходит, «Проценты» капают, за долг билет (CollectorScene.payDebt).
 * Не хватило — раунд спасения (CollectorScene.startRescue): 5 прокруток, паттерн спасает, правила и
 * политика — в last-chance-sim.mjs. Спасение одно за забег (rescueAllowed): если оно уже было, 'locked' —
 * сразу конец забега, без прокруток (CollectorScene.callCollector → kaboom).
 * Победа: за выживание не дают ни фишек, ни билетов, долг остаётся прежним — раунд играется заново (winRescue).
 * Провал: сразу KABOOM, без прощения и без магазина (решение автора 22.11.2026, шаг 34) — иначе в игре не бывает.
 * Кон к этому моменту уже забран closeRound, серию спасение не трогает (startRescue гасит только pot).
 */
function collector(s, g) {
  g.time += SECONDS.collector;
  // Сделка №45: половину долга можно закрыть билетами (1 билет = 10%, не больше половины), остаток — фишками.
  const payPact = D.pactEffects(s.pacts, s.round);
  if (s.balance < s.debt && payPact.debtTicketsHalf) {
    const plan = D.pactDebtTicketPlan(s.debt, s.tickets);
    if (plan.tickets > 0 && plan.chips <= s.balance && spendTickets(s, g, plan.tickets)) {
      s.balance += s.debt - plan.chips; // билеты превратились в фишки ровно на свою долю долга
      g.debtTickets += plan.tickets;
    }
  }
  if (s.balance >= s.debt) {
    s.balance -= s.debt;
    // Замер баланса долгов (правка 19.11): доход раунда — всё, что пришло на табло с входа в раунд до этой оплаты
    // (забранный кон, «Проценты», страховка, барабан, сделки); остаток — что осталось сразу после оплаты, до
    // «Процентов» этого же шага. nextDebt проставит openShop: следующий долг знает только он (после спасения
    // раунд играется заново, и следующий долг будет тем же — debtForRound(round + 1) тут соврёт).
    const row = { round: s.round, debt: s.debt, income: s.earned - g.roundEarnStart, leftover: s.balance, nextDebt: null };
    g.balanceRows.push(row);
    g.lastBalanceRow = row;
    // Улучшение №13 (шаг 28): +5 п.п. к «Процентам» — CollectorScene.payDebt.
    // Сделка №19: свой процент на остаток работает и без амулета «Проценты» (как CollectorScene.payDebt).
    const interest = A.interestCoins(s.balance, ids(s), s.upgradeEffects.interestBonus) + Math.floor(s.balance * payPact.interestBonus);
    if (interest > 0) earn(s, g, interest); // проценты — доход забега (CollectorScene.payDebt), не штраф
    gainTickets(s, g, 'debt', A.TICKETS_PER_DEBT + UPG.roundDebtTickets(s.round, s.upgradeEffects.debtTicketBonus)); // №17: +1 в третьем раунде
    check(s, g);
    return 'paid';
  }
  // Улучшение №10 (шаг 28): раз за забег долг можно отложить на раунд — неуплаченный прибавится к следующему.
  // Идёт раньше спасения (CollectorScene.callCollector): это перенос, а не прощение, и второй раз за забег не даётся.
  if ((s.upgradeEffects.deferOnce || payPact.debtDefer) && !s.deferUsed) {
    s.deferUsed = true;
    s.deferCarry = s.debt;
    g.deferred += 1;
    g.time += SECONDS.defer;
    return 'deferred';
  }
  if (NO_RESCUE) {
    // Диагностика (SIM_NO_RESCUE=1): спасения нет — нехватка фишек сразу конец забега.
    // g.lastChances всё равно растёт: проверка «исходы спасения = число спасений» иначе разошлась бы.
    g.lastChances += 1;
    g.dead += 1;
    return 'dead';
  }
  if (!LC.rescueAllowed(s.rescueUsed)) {
    // Вторая нехватка фишек за забег: яму уже прощали, второй раз — KABOOM сразу (CollectorScene.callCollector).
    // Прокруток нет, GOOD LUCK нет; отдельный счётчик, чтобы в отчёте было видно, сколько забегов так кончилось.
    g.rescueLocked += 1;
    g.dead += 1;
    return 'locked';
  }
  // Нехватка: раунд спасения (CollectorScene.startRescue). Сетка спасения — платящие символы раунда и черепа
  // с долей SKULL_SHARE; амулеты и предметы заморожены, поэтому их веса и множители сюда не входят.
  // Бот крутит до победы или до конца прокруток и морозит по одному столбцу (политика — last-chance-sim.mjs).
  const need = s.debt - s.balance;
  // Выживание ничего не начисляет: если фишки, «набрано» или билеты сдвинутся — это ошибка, а не правило.
  const before = { balance: s.balance, earned: s.earned, tickets: s.tickets };
  const rescue = playRescue({ round: s.round });
  s.rescueUsed = true; // флаг ставит startRescue: вторая яма за этот забег закрыта (и откатом кассеты не снимается)
  g.lastChances += 1;
  g.rescueSpins += rescue.spins;
  g.rescueFrozen += rescue.frozen;
  g.time += SECONDS.rescue;
  // Кривая для study(): где приходило спасение, сколько не хватало и чем кончилось.
  g.collectorSamples.push({
    round: s.round, debt: s.debt, balance: s.balance, need,
    won: rescue.won, spins: rescue.spins, frozen: rescue.frozen,
  });
  if (rescue.won) {
    if (s.balance !== before.balance || s.earned !== before.earned || s.tickets !== before.tickets) {
      violate(g, 'спасение начислило фишки или билеты');
    }
    g.survived += 1;
    return 'survived';
  }
  g.dead += 1; // провал спасения — смерть сразу: ни магазина, ни отката счёта (шаг 34)
  return 'dead';
}

// ---------- Забег ----------

/** Стратегия с оглядкой на SIM_MACHINE: диагностический забег на одном автомате, смена автомата выключена. */
export function envStrategy(strategy = BASE_STRATEGY) {
  const id = process.env.SIM_MACHINE;
  if (!id || !M.MACHINES.some((spec) => spec.id === id)) return strategy; // неизвестный автомат — обычная стратегия
  return { ...strategy, swapChance: 0, pinnedMachine: id };
}

export function runGame(st = BASE_STRATEGY, econ = defaultEcon(), upgraded = {}, runNumber = 1, chipRecord = 0) {
  const g = {
    time: 0, tape: 'forSale', record: null, recordCounters: null, tapesBought: 0, tapeClosedAtBuy: 0, recs: 0, rewinds: 0,
    ticketsSpentOnTape: 0, // №45 (28г): сколько билетов ушло после записи — откат их вернёт
    skullCancels: 0, // №50 (28г): сколько раз бот отменил череп (по правилу — не больше одного за забег)
    illegalRewinds: 0, maxClosed: 0, collectorSamples: [],
    lastChances: 0, survived: 0, dead: 0, rescueSpins: 0, rescueFrozen: 0, rescueLocked: 0, attempts: 0, // раунд спасения (шаг 27): спасений, прокруток и заморозок на спасение, вторая яма за забег (rescueLocked)
    deferred: 0, skullFree: 0, // улучшения шага 28: сколько раз долг отложен и сколько бесплатных прокруток дал первый череп
    freeSpinsGiven: 0, freeInRound: 0, freeMax: 0, crownEvents: 0, guardStops: 0, // бесплатные прокрутки: счётчик предохранителя, за раунд, максимум за раунд, срабатывания предохранителя
    shuffleUsed: 0, swapUsed: 0, // перемешка и подмена (шаг 63б): сколько раз применили
    normalSpins: 0, spins: 0, paidSpins: 0, // прокрутки: платные и всего
    roundSpins: 0, maxRoundSpins: 0, roundsOverCap: 0, // прокруток в раунде: максимум и сколько раундов перевалило за потолок
    shops: 0, machineSwaps: 0, // автомат: сколько раз сменился сам в начале раунда
    amuletsBought: 0, socketsBought: 0, itemsBought: 0, slotsBought: 0, drumSpins: 0, paidEarly: 0,
    amuletChipsBought: 0, giftsGiven: 0, // №39 и №40 (28в): амулет за фишки и подарок первого магазина
    ticketsBought: 0, // билеты за фишки (шаг 13): сколько куплено за забег — от него растёт цена следующего
    itemSlotsDenied: 0, // сколько раз предмет не включился: все 4 места в столбике заняты
    roundPaid: 0,
    // Замер баланса долгов (правка 19.11): «набрано» на входе в раунд и строка на каждый отданный долг.
    // Строка: раунд, долг, доход раунда (приход фишек на табло за раунд), остаток после оплаты (до «Процентов»),
    // следующий долг (его проставляет openShop). Печатает summarizeRuns/report.
    roundEarnStart: 0, balanceRows: [], lastBalanceRow: null,
    firstSpinMult: 0, firstSpinRounds: 0, // средний множитель на первой платной прокрутке раунда (перенос серии)
    ticketsLedger: 0, ticketIncome: { debt: 0, early: 0, scatter: 0, jackpot: 0, drum: 0, pact: 0 }, // доход по источникам
    pactsOffered: 0, pactsTaken: 0, pactsRefused: 0, shopsClosed: 0, pactsById: {}, doubleTakes: 0, amuletsFree: 0, // сделки Дилера: сколько и каких взято
    amuletsBurned: 0, debtTickets: 0, // шаг 30: амулеты, сгоревшие от сделки №34, и билеты, закрывшие долг (№45)
    violations: {}, safeguards: {},
    // Действия вне прокрутки (шаг 29): сколько раз бот применил каждое, сколько краж провалено, сколько фишек
    // пришло от краж и продаж, сколько ушло на действия и сколько срезал выкуп долга.
    actionExchange: 0, actionLottery: 0, actionService: 0, actionTheft: 0, actionSale: 0, actionDebt: 0,
    actionTheftFailed: 0, theftDeath: false, actionChips: 0, actionPaid: 0, actionDebtChips: 0,
  };
  let s = newRun(upgraded, runNumber, chipRecord);
  g.ticketsLedger = s.tickets; // №16 (28б): билет на старте — учёт начинается с него, а не с нуля
  if (st.pinnedMachine) s.machineId = st.pinnedMachine; // диагностика: забег на одном автомате
  startRound(s, st, g);
  const debug = !!process.env.SIM_DEBUG;
  if (debug) console.log('round,debt,balance,pot,streak,spinsLeft,freeSpins,machine,tickets,closed');
  let guard = 0;
  for (; guard < 400; guard++) {
    g.attempts += 1; // попытка раунда: после спасения тот же долг играется заново
    s = playRound(s, st, g);
    g.maxClosed = Math.max(g.maxClosed, s.round - 1);
    if (g.theftDeath) break; // провал кражи (шаг 29) — сразу конец забега: без долга и без магазина
    // Победа (цель 1 000 000 набранных) кончает забег посреди раунда: раунд не докручивается, долг не платится,
    // магазина нет — так же, как CollectorScene.startVictory. Проверка после каждого шага, где могли прийти фишки.
    if (goalReached(s)) break;
    closeRound(s, st, g);
    if (goalReached(s)) break; // кон забрали в конце раунда — цель могла взяться и тут
    const res = collector(s, g);
    if (debug) {
      console.log([s.round, s.debt, s.balance, s.earned, s.pot, s.streak, s.spinsLeft, s.freeSpins, s.machineId, s.tickets, s.round - 1].join(','));
    }
    if (res === 'dead' || res === 'locked') break; // KABOOM: провал спасения или яму уже прощали
    if (goalReached(s)) break; // «Проценты» после долга перевалили цель
    // Выжил в спасении: ни фишек, ни билетов это не даёт, долг остаётся РОВНО прежним числом, и раунд играется
    // заново. Счёт отступает на WON_RESCUE_ROUND_STEP, а openShop прибавит единицу — номер круга тот же, и
    // openShop(true) не пересчитывает долг (CollectorScene.winRescue). Сроки сделок не сдвигаются: раунд по номеру
    // не сменился, и сделка на 1 раунд должна действовать в переигранном раунде, а не исчезнуть.
    // Провал спасения сюда не доходит: это смерть забега (res === 'dead', цикл выше уже прерван).
    // res === 'paid' → обычный магазин (новый раунд, новый долг). res === 'survived' → повтор раунда.
    // res === 'deferred' (улучшение №10) → тоже магазин: долг этого раунда прибавится к следующему (deferCarry).
    const debtBefore = s.debt;
    const debtNextBefore = s.debtNextMul;
    const replay = res === 'survived';
    const replayRound = s.round; // магазин встанет перед этим же раундом (ShopScene.openShop(keepDebt, replayRound))
    if (replay) s.round = Math.max(0, s.round - LC.WON_RESCUE_ROUND_STEP);
    openShop(s, st, g, econ, replay, replayRound);
    // Выживание долг не двигает: сравниваем число до ямы и после открытия магазина. Законных изменений от
    // debtNextMul здесь быть не может — повтором раунда множитель не тратится.
    if (replay && (s.debt !== debtBefore || s.debtNextMul !== debtNextBefore)) violate(g, 'спасение: долг после выживания не тот же');
    if (goalReached(s)) break; // фишки барабана
    startRound(s, st, g);
  }
  g.maxClosed = Math.max(g.maxClosed, s.round - 1);
  return {
    // balanceRows и roundEarnStart приезжают из ...g — по ним summarizeRuns строит «баланс долгов»;
    // явно повторяем balanceRows, чтобы сводка не осталась без строк, если состав g когда-нибудь сократят.
    balanceRows: g.balanceRows, roundEarnStart: g.roundEarnStart,
    closed: s.round - 1, guardHit: guard >= 400, ...g, record: undefined,
    // Итоги цели — с последнего состояния забега (после отката кассетой они тоже с записи).
    earned: s.earned, peakBalance: s.peakBalance, millionRound: s.millionRound, millionSeconds: s.millionSeconds,
    recordRound: s.recordRound, recordSeconds: s.recordSeconds,
    startChips: s.startChips ?? 0, // №46 (28г): сколько забег получил от рекорда на старте
    // Чем забег кончился — для разбора победителей: раунд, долг, баланс, амулеты (копии не важны, берём id).
    finalRound: s.round, finalDebt: s.debt, finalBalance: s.balance, finalAmulets: A.amuletIdsFrom(s.amuletCounts),
  };
}

/**
 * Медиана списка: средняя кривая врёт из-за редких провалов, поэтому в отчётах по раундам — медиана.
 */
function medianOf(list) {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/**
 * Баланс долгов (правка 19.11, DONTLIKE.md): строки g.balanceRows — по одной на отданный долг (раунд, долг,
 * доход раунда, остаток после оплаты, следующий долг). Считаем медианы по раундам: «долг / доход раунда»
 * (ниже 0,9 — подушка копится, долг не жмёт) и «остаток после оплаты / следующий долг» (выше 15% — подушка).
 */
function debtBalance(rows) {
  const byRound = new Map();
  for (const row of rows) {
    if (!(row.income > 0) || !(row.nextDebt > 0)) continue; // доля от нуля — не число, такую строку пропускаем
    if (!byRound.has(row.round)) byRound.set(row.round, []);
    byRound.get(row.round).push(row);
  }
  const first5 = rows.filter((row) => row.round <= 5 && row.income > 0 && row.nextDebt > 0);
  const rounds = [...byRound.keys()].sort((a, b) => a - b).slice(0, 8).map((round) => {
    const list = byRound.get(round);
    return {
      round,
      rows: list.length,
      debt: medianOf(list.map((row) => row.debt)),
      income: medianOf(list.map((row) => row.income)),
      ratio: medianOf(list.map((row) => row.debt / row.income)),
      leftoverShare: medianOf(list.map((row) => row.leftover / row.nextDebt)),
    };
  });
  return {
    rounds,
    ratioFirst5: medianOf(first5.map((row) => row.debt / row.income)),
    leftoverFirst5: medianOf(first5.map((row) => row.leftover / row.nextDebt)),
    paidRows: rows.length,
  };
}

/** Сводка по готовым забегам. */
export function summarizeRuns(runs) {
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const sorted = runs.map((r) => r.closed).sort((a, b) => a - b);
  const minutes = runs.map((r) => r.time / 60).sort((a, b) => a - b);
  const violations = {};
  const safeguards = {};
  for (const run of runs) {
    for (const [name, count] of Object.entries(run.violations)) violations[name] = (violations[name] ?? 0) + count;
    for (const [name, count] of Object.entries(run.safeguards)) safeguards[name] = (safeguards[name] ?? 0) + count;
  }
  const debt = debtBalance(runs.flatMap((r) => r.balanceRows ?? []));
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
    finalDebtMedian: medianOf(runs.map((r) => r.finalDebt)), // долг, на котором забег кончился (медиана)
    tapesBought: mean((r) => r.tapesBought), bought: mean((r) => (r.tapesBought > 0 ? 1 : 0)), rewinds: mean((r) => r.rewinds),
    illegalRewinds: mean((r) => r.illegalRewinds),
    // Раунд спасения (шаг 27): сколько раз приходил, сколько выжило, за сколько прокруток и с какими заморозками.
    lastChances: mean((r) => r.lastChances), survived: mean((r) => r.survived),
    dead: mean((r) => r.dead),
    // «Яма уже была»: вторая нехватка фишек в забеге — KABOOM без раунда спасения (решение автора 22.11.2026).
    rescueLocked: mean((r) => r.rescueLocked), lockedRuns: mean((r) => (r.rescueLocked > 0 ? 1 : 0)),
    rescueMax: Math.max(...runs.map((r) => r.lastChances)), // спасений за забег: по правилу не больше одного
    attempts: mean((r) => r.attempts), attemptsMedian: medianOf(runs.map((r) => r.attempts)), // попыток раунда за забег
    rescueSpins: mean((r) => r.rescueSpins / Math.max(r.lastChances, 1)),
    rescueFrozen: mean((r) => r.rescueFrozen / Math.max(r.lastChances, 1)),
    rescue: runs.reduce((a, r) => a + r.survived, 0) / Math.max(runs.reduce((a, r) => a + r.lastChances, 0), 1),
    rescuePerRun: mean((r) => (r.lastChances > 0 ? r.survived / r.lastChances : 0)), // среднее по забегам от долей: короче забег — сильнее вес
    noChance: mean((r) => (r.lastChances === 0 ? 1 : 0)), // забеги, где спасение не приходило ни разу
    guard: mean((r) => (r.guardHit ? 1 : 0)), // доля забегов, упёршихся в предохранитель 400 раундов (бот копит быстрее долга)
    shops: mean((r) => r.shops), spins: mean((r) => r.spins), paidSpins: mean((r) => r.paidSpins),
    maxRoundSpins: mean((r) => r.maxRoundSpins), overCap: mean((r) => r.roundsOverCap / Math.max(r.attempts, 1)), // доля раундов, где прокруток больше MAX_SPINS_PER_ROUND
    machineSwaps: mean((r) => r.machineSwaps),
    itemSlotsDenied: mean((r) => r.itemSlotsDenied), amulets: mean((r) => r.amuletsBought), sockets: mean((r) => r.socketsBought),
    amuletChips: mean((r) => r.amuletChipsBought), gifts: mean((r) => r.giftsGiven),
    items: mean((r) => r.itemsBought), slots: mean((r) => r.slotsBought), drumSpins: mean((r) => r.drumSpins),
    ticketsBought: mean((r) => r.ticketsBought), // билеты за фишки (шаг 13) — сколько куплено за забег
    paidEarly: mean((r) => r.paidEarly),
    ticketIncome: { debt: income('debt'), early: income('early'), scatter: income('scatter'), jackpot: income('jackpot'), drum: income('drum'), pact: income('pact') },
    pactsTaken: mean((r) => r.pactsTaken), pactsRefused: mean((r) => r.pactsRefused), shopsClosed: mean((r) => r.shopsClosed),
    doubleTakes: mean((r) => r.doubleTakes), amuletsFree: mean((r) => r.amuletsFree),
    pactsById: Object.fromEntries(D.PACTS.map((spec) => [spec.id, mean((r) => r.pactsById[spec.id] ?? 0)])),
    pactsPool: D.PACTS.length,
    pactsDistinct: new Set(runs.flatMap((r) => Object.keys(r.pactsById).filter((id) => r.pactsById[id] > 0))).size,
    amuletsBurned: mean((r) => r.amuletsBurned ?? 0), debtTickets: mean((r) => r.debtTickets ?? 0),
    firstSpinMult: mean((r) => (r.firstSpinRounds > 0 ? r.firstSpinMult / r.firstSpinRounds : 0)),
    crownEvents: mean((r) => r.crownEvents), freeMax: mean((r) => r.freeMax),
    // Улучшения после смерти (шаг 28): сколько раз долг отложен (№10) и сколько бесплатных прокруток дал первый череп (№4).
    deferred: mean((r) => r.deferred), skullFree: mean((r) => r.skullFree),
    // Шаг 28г: стартовые фишки от рекорда (№46) и отмены черепа (№50).
    startChips: mean((r) => r.startChips ?? 0),
    skullCancels: mean((r) => r.skullCancels),
    // Действия вне прокрутки (шаг 29): сколько раз бот применил каждое, сколько краж провалено (и кончилось смертью),
    // сколько фишек пришло от краж и продаж и сколько ушло на действия.
    actionExchange: mean((r) => r.actionExchange), actionLottery: mean((r) => r.actionLottery),
    actionService: mean((r) => r.actionService), actionTheft: mean((r) => r.actionTheft),
    actionSale: mean((r) => r.actionSale), actionDebt: mean((r) => r.actionDebt),
    theftFailed: mean((r) => r.actionTheftFailed), theftDeaths: runs.filter((r) => r.theftDeath).length / runs.length,
    actionChips: mean((r) => r.actionChips), actionPaid: mean((r) => r.actionPaid),
    actionDebtChips: mean((r) => r.actionDebtChips),
    guardStops: mean((r) => r.guardStops), guardRuns: runs.filter((r) => r.guardStops > 0).length / runs.length,
    // Режимы прокрутки (шаг 70): средние счётчики и доля спокойных среди платных.
    normalSpins: mean((r) => r.normalSpins),
    // Баланс долгов (правка 19.11): долг / доход раунда и остаток после оплаты к следующему долгу.
    debtRounds: debt.rounds, debtRatioFirst5: debt.ratioFirst5, debtLeftoverFirst5: debt.leftoverFirst5,
    debtPaidRows: debt.paidRows,
    violations,
    safeguards,
  };
}

export function summarize(st, games, econ, upgraded = PRELOADED_UPGRADES) {
  const runs = [];
  // Номер забега — 1…games: улучшение №8 прощает первый долг каждый пятый забег, как в игре по progress.runs.
  // Рекорд для №46 берётся из SIM_RECORD: в обычном прогоне его нет (как в первом забеге игрока).
  for (let i = 0; i < games; i++) runs.push(runGame(st, econ, upgraded, i + 1, SIM_RECORD));
  return summarizeRuns(runs);
}

/**
 * Прогон с метапрогрессией (SIM_META, шаг 28): N забегов подряд. После каждого бот берёт лучшее доступное улучшение
 * (UPGRADE_PRIORITY) — ровно то, что игрок делает на экране смерти. Возвращает сводку, сводку последних забегов
 * (там улучшения уже накоплены — по ней видно, что они правда применяются, а не только покупаются) и итоговый набор.
 */
export function metaRuns(games, st = BASE_STRATEGY, econ = defaultEcon(), tailSize = META_TAIL) {
  const runs = [];
  const purchased = {};
  let chipRecord = 0; // №46 (28г): рекорд фишек копится от забега к забегу — как localStorage в игре
  for (let index = 0; index < games; index++) {
    const run = runGame(st, econ, { ...purchased }, index + 1, chipRecord);
    runs.push(run);
    chipRecord = Math.max(chipRecord, run.earned);
    const next = UPGRADE_PRIORITY.find((id) => !(id in purchased));
    if (next) purchased[next] = 1; // по одному за смерть: экран улучшений даёт одно бесплатное
  }
  const tailCount = Math.max(1, Math.min(tailSize, runs.length));
  return { summary: summarizeRuns(runs), tail: summarizeRuns(runs.slice(-tailCount)), tailCount, purchased };
}

/**
 * Один проход: сводка забегов и разбивка спасения по раундам — где оно приходило, сколько не хватало,
 * чем кончилось и сколько прокруток и заморозок ушло. Этим живёт last-chance-sim.mjs.
 */
export function study(games = 2000) {
  const runs = [];
  const byRound = new Map(); // раунд → { deficit: [], count, won, spins, frozen }
  for (let game = 0; game < games; game++) {
    const run = runGame(BASE_STRATEGY, defaultEcon(), PRELOADED_UPGRADES, game + 1);
    runs.push(run);
    for (const sample of run.collectorSamples) {
      let row = byRound.get(sample.round);
      if (!row) {
        row = { deficit: [], count: 0, won: 0, spins: 0, frozen: 0 };
        byRound.set(sample.round, row);
      }
      row.deficit.push(sample.debt - sample.balance);
      row.count += 1;
      if (sample.won) row.won += 1;
      row.spins += sample.spins;
      row.frozen += sample.frozen;
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
  ['machine-delay', 'автомат'], ['safe-bank', 'банк'], ['free-amulet', 'амулет'], ['double-take', 'дважды'],
];

/**
 * Отдельная строка про улучшения после смерти (шаг 28): сколько накоплено, 1 млн, медианы минут и долгов,
 * сколько раз сработали отсрочка (№10) и бесплатная прокрутка за череп (№4).
 */
export function upgradesReport(name, x, count) {
  const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const pct = (n) => Math.round(n * 100) + '%';
  const violations = sum(Object.values(x.violations));
  const safeguards = sum(Object.values(x.safeguards));
  console.log(`${name.padEnd(44)} улучшений ${count}/${UPGRADE_PRIORITY.length}: 1 млн ${pct(x.victory)} (${x.wonRuns} из ${x.runs}), медиана ${f(x.minutesMedian, 1)} мин, медиана долгов ${x.median}, 10+ ${pct(x.ten)}, отложено долгов ${f(x.deferred)}, прокруток за черепа ${f(x.skullFree)}, черепов отменено ${f(x.skullCancels)} | нарушений ${violations}, страховок ${safeguards}`);
}

export function report(name, x) {  const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const pct = (n) => Math.round(n * 100) + '%';
  const chips = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  console.log(`${name.padEnd(44)} в конце ${f(x.closed)} (мед ${x.median}), пик ${f(x.peak)} (среднее максимумов по забегам), 1-й ${pct(x.first)}, 10+ ${pct(x.ten)}, после 5-го раунда без долгов ${pct(x.flop5)}, рекорд ${x.best} | ${f(x.minutes, 1)} мин (мед ${f(x.minutesMedian, 1)}, >10 ${pct(x.over10)}) | попыток раунда ${f(x.attempts, 1)} (мед ${x.attemptsMedian}), магазинов ${f(x.shops, 1)}, прокруток ${f(x.spins, 0)} (платных ${f(x.paidSpins, 0)}), макс. за раунд ${f(x.maxRoundSpins, 0)} (больше потолка в ${pct(x.overCap)} раундов) | кассет ${f(x.tapesBought)} (берут ${pct(x.bought)}), откатов ${f(x.rewinds)} | множитель 1-й прокрутки ${f(x.firstSpinMult)}, упёрлись в 400 раундов ${pct(x.guard)} | сид ${SEED ?? '—'} | нарушений ${f(sum(Object.values(x.violations)), 0)}, страховок ${f(sum(Object.values(x.safeguards)), 0)}`);
  console.log(`${''.padEnd(44)} спасение: спасений за забег ${f(x.lastChances)} (не было у ${pct(x.noChance)}, макс за забег ${x.rescueMax}), выжило ${pct(x.rescue)} (${f(x.survived)} из ${f(x.lastChances)}; среднее по забегам ${pct(x.rescuePerRun)}), прокруток на спасение ${f(x.rescueSpins, 2)} (всего ${RESCUE_SPINS}), заморожено столбцов ${f(x.rescueFrozen, 2)}, KABOOM ${f(x.dead)}, яма уже была ${f(x.rescueLocked)} (у ${pct(x.lockedRuns)} забегов), доля черепов ${f(SKULL_SHARE, 2)}, заморозок за прокрутку ${RESCUE_FREEZE}; за выживание фишек и билетов нет, долг тот же, провал спасения — сразу KABOOM | долг после ямы не тот же: ${f(x.violations['спасение: долг после выживания не тот же'] ?? 0, 0)}`);
  console.log(`${''.padEnd(44)} долг в конце забега мед ${chips(x.finalDebtMedian)}, минут мед ${f(x.minutesMedian, 1)}`);
  console.log(`${''.padEnd(44)} билеты: за долг ${f(x.ticketIncome.debt)}, ранняя оплата ${f(x.ticketIncome.early)}, 🎟×3 ${f(x.ticketIncome.scatter)}, джекпот ${f(x.ticketIncome.jackpot)}, барабан ${f(x.ticketIncome.drum)}, сделка ${f(x.ticketIncome.pact)} | сделок взято ${f(x.pactsTaken)}, отказов ${f(x.pactsRefused)}, магазинов закрыто сделкой ${f(x.shopsClosed)} | по видам (за забег): ${PACT_SHORT.map(([id, name]) => `${name} ${f(x.pactsById[id])}`).join(', ')} | вторых забираний ${f(x.doubleTakes)}, амулетов по сделке ${f(x.amuletsFree)} | автомат: смен ${f(x.machineSwaps, 0)} | куплено: амулетов ${f(x.amulets)}, гнёзд ${f(x.sockets)}, предметов ${f(x.items)}, мест ${f(x.slots)}, прокруток барабана ${f(x.drumSpins)}, ранних оплат ${f(x.paidEarly)} | амулет за фишки ${f(x.amuletChips)}, подарок первого магазина ${f(x.gifts)} | отказов по местам ${f(x.itemSlotsDenied)} | билетов куплено ${f(x.ticketsBought)} за забег | фриспины до ${f(x.freeMax, 1)} за раунд, предохранитель ${B.FREE_SPINS_GUARD} срезал ${f(x.guardStops)} раз (у ${pct(x.guardRuns)} забегов)`);
  // Шаг 30: пул сделок и сколько разных карт реально применилось; в режиме SIM_PACTS=all — счётчик по каждой карте.
  console.log(`${''.padEnd(44)} сделки шага 30: пул ${x.pactsPool}, разных взято ${x.pactsDistinct} из ${x.pactsPool}, сгорело амулетов ${f(x.amuletsBurned)}, долг закрыт билетами ${f(x.debtTickets)} | режим ${PACTS_MODE === 'all' ? 'ВСЕ КАРТЫ (SIM_PACTS=all)' : 'обычный'}`);
  if (PACTS_MODE === 'all') {
    // Всего взятий за прогон: средняя на забег, умноженная на число забегов (округление до целого).
    const counts = D.PACTS.map((spec) => `${spec.id} ${Math.round((x.pactsById[spec.id] ?? 0) * x.runs)}`).join(', ');
    console.log(`${''.padEnd(44)} по картам (всего взято за прогон): ${counts}`);
  }
  // Строка цели: в SIM_CHASE_RECORD=1 к ней добавляется вторая ступень — 10 000 000 и кто до неё дошёл.
  const recordLine = CHASE_RECORD
    ? ` | рекорд ${chips(RECORD)}: взяли ${pct(x.recordShare)} (${x.recordRuns} из ${x.runs}), у дошедших: раунд мед ${f(x.recordRoundMedian, 0)}, минут мед ${f(x.recordMinutesMedian, 1)}`
    : '';
  console.log(`${''.padEnd(44)} цель ${chips(GOAL)}: набрано за забег мед ${chips(x.earnedMedian)} (среднее ${chips(x.earnedMean)}), пик табло мед ${chips(x.peakBalanceMedian)}, 1 млн взяли ${pct(x.victory)} (${x.wonRuns} из ${x.runs}) | у дошедших: раунд мед ${f(x.millionRoundMedian, 0)}, минут мед ${f(x.millionMinutesMedian, 1)}${recordLine}`);
  // Действия вне прокрутки (шаг 29): сколько раз каждое применили, что дали и что стоили; кражи — с провалами.
  console.log(`${''.padEnd(44)} действия: обмен ${f(x.actionExchange)}, лотерея ${f(x.actionLottery)}, обслуживание ${f(x.actionService)}, продажа ${f(x.actionSale)}, биржа ${f(x.actionDebt)} (срезано фишек ${chips(x.actionDebtChips)}), кража ${f(x.actionTheft)} (провалов ${f(x.theftFailed)}, умерли от кражи ${pct(x.theftDeaths)} забегов) | пришло от краж и продаж ${chips(x.actionChips)}, ушло на действия ${chips(x.actionPaid)} | ${ACTIONS_ON ? 'включены' : 'ВЫКЛЮЧЕНЫ (SIM_ACTIONS=0)'}`);
  // Баланс долгов (правка 19.11): долг / доход раунда и остаток после оплаты к следующему долгу — по раундам 1–5.
  // Пустые данные печатаем как «—»: иначе 0 × 100 рисовал бы NaN и ошибку в balanceRows никто бы не заметил.
  const rounds = (x.debtRounds ?? []).slice(0, 5).map((row) => `р${row.round} ${f(row.ratio, 2)} (${chips(row.debt)}/${chips(row.income)})`).join(', ');
  const debtEmpty = !(x.debtPaidRows > 0) || !Number.isFinite(x.debtLeftoverFirst5);
  if (debtEmpty && x.runs > 0) {
    console.warn(`долги: нет строк баланса при ${x.runs} забегах — проверь, что runGame отдаёт balanceRows (до правки 19.11 их не было)`);
  }
  const debtRatioText = debtEmpty ? '—' : f(x.debtRatioFirst5, 2);
  const debtLeftText = debtEmpty ? '—' : `${f(x.debtLeftoverFirst5 * 100, 1)}%`;
  console.log(`${''.padEnd(44)} долги: ${rounds || '—'} | мед «долг / доход» 1–5 ${debtRatioText} | остаток после оплаты к следующему долгу мед ${debtLeftText} (раунды 1–5, оплат ${x.debtPaidRows}) | «забрать» при коне от ${SIM_TAKE_POT}`);
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
    console.log('проверки: 0 нарушений (7): долг из набора debtForRound + сдвиги сделок (№2, №12); все числа конечны; табло билетов = учёт и не в минусе; выживание в спасении не начисляет ни фишек, ни билетов; после выживания в спасении долг ровно тот же (и debtNextMul не потрачен); исходы спасения = число спасений + «яма уже была»; записей на кассету не бывает из будущего');
  } else {
    console.log('проверки: НАРУШЕНИЯ');
    for (const [name, count] of Object.entries(total).sort((a, b) => b[1] - a[1])) console.log(`  ${name}: ${count}`);
  }
  if (guardsFired.length === 0) {
    console.log(`страховки: 0 сработали (9) — правила держит сам код, это заслон на будущие правки: прокруток в раунде 0…потолок (30 плюс улучшение №3) и не меньше нуля, фриспинов за раунд ≤ ${B.FREE_SPINS_GUARD} (технический предохранитель, игрового потолка нет), включено предметов не больше мест в столбике (сделка №13 его укорачивает), источник билетов из шести, расход билетов ≤ остатка, кассета не раньше 3-го долга, серия на closeRound не меняется, бот откатывается только между прокрутками`);
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
    rescueReport(result.samples);
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
  // Улучшения после смерти (шаг 28): отдельные строки, только когда их включили ручкой.
  if (SIM_UPGRADES > 0) {
    upgradesReport('с улучшениями (на все забеги)', summaries[0], Object.keys(PRELOADED_UPGRADES).length);
  }
  if (SIM_META > 0) {
    const meta = metaRuns(SIM_META, envStrategy(BASE_STRATEGY), econ);
    summaries.push(meta.summary);
    upgradesReport(`с метапрогрессией (${SIM_META} забегов)`, meta.summary, Object.keys(meta.purchased).length);
    // Улучшения копятся по одному за смерть, поэтому медиана первых забегов тянет сводку вниз. Строка последних
    // забегов показывает, что они не только куплены, но и применены: здесь набор уже полный.
    upgradesReport(`  её последние ${meta.tailCount} забегов (набор полный)`, meta.tail, Object.keys(meta.purchased).length);
  }
  invariantReport(summaries);
}

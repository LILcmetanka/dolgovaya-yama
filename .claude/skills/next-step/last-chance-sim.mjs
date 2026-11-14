// Последний шанс «Долговой ямы» — по правилам текущего кода, без Phaser (шаг 68б: одна чистая сетка, два действия,
// «второе дыхание»). Запуск из папки next-step:
//   node --import ./ts-resolve.mjs last-chance-sim.mjs      — три политики на 200 зафиксированных сетках
//   SIM_ROUNDS=1 node --import ./ts-resolve.mjs full-run.mjs 800 — доля спасений по раундам (там живёт study)
//
// ПРАВИЛА, как они читаются из кода (src/game):
//  • Вход — одна чистая прокрутка, её делает сам автомат: обычные веса раунда, но у запрещённых символов вес 0
//    (CollectorScene.cleanWeight; запрещены skull, dice, spider, lock, blood — lastChance.ts).
//  • Цель — от денег, а не от сетки (2026-11-14): паттерн должен оплатить долю LAST_CHANCE_GOAL_SHARE нехватки,
//    выраженную в множителе (lastChance.ts, lastChanceGoal + chancePrice):
//    goal = need × share / (цена символа раунда × множитель серии × множители выигрыша), не выше ×10 (без джекпота).
//    Входная сетка уже бьёт цель — победа сразу, полоса действий не открывается (`instant`).
//  • Действий ровно LAST_CHANCE_ACTIONS = 2 (lastChance.ts): перекрут столбца — три клетки выпадают заново
//    (CollectorScene.rerollColumn) — или джокер в клетку. В занятую джокером клетку и в замороженный столбец
//    игра не даёт, действие при этом не тратится. Заморозка бесплатна и действий не тратит:
//    она только запрещает перекрут, поэтому политика ею не пользуется — она сужает выбор.
//  • Раньше проверить нельзя: исход считается, когда действия кончились (finishLastChance), «сдаться» —
//    сразу провал (onLastChanceButton). Задача: best > goal (isLastChanceGoalMet, lastChance.ts).
//  • Победа: чемодан платит долг, фишки целы, билета нет, счёт −1 (winLastChance). Провал: первое за забег —
//    «второе дыхание» (счёт −1, магазин), второе — KABOOM (failLastChance).
//
// ПОЛИТИКА (объявлена явно, это выбор игрока, а не правило игры):
//  • жадная: на каждом шаге берём действие с наибольшей вероятностью побить цель. Для перекрута вероятность оценивается
//    выборкой GREEDY_SAMPLES исходов столбца (в задании 32-64), для джокера она точная — 0 или 1. При равной
//    вероятности выигрывает действие с большим средним лучшим множителем: иначе при нуле вероятностей выбор был бы
//    произвольным, а игрок так не играет.
//  • границы для отчёта: «без действий» (исход входной сетки) и перебор всех пар действий (oracleWin) — оценка сверху.
import { fileURLToPath } from 'node:url';

const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const R = await import(SRC + 'rules.ts');
const P = await import(SRC + 'patterns.ts');
const E = await import(SRC + 'evil.ts');
const LC = await import(SRC + 'lastChance.ts');

export const GREEDY_SAMPLES = 32; // N исходов перекрута на столбец в жадной политике (в задании 32-64)
export const ORACLE_FIRST = 20; // сколько исходов первого действия перебирает oracle
export const ORACLE_SECOND = 50; // сколько исходов перекрута на столбец во втором действии перебора
export const BOUND_GRIDS = 200; // на скольких зафиксированных сетках сравниваются политики
/** Сид зафиксированных сеток и выборок в границах политик: SIM_SEED переопределяет, значение печатается в отчёте. */
export const SIM_SEED = Number(process.env.SIM_SEED ?? 20261113);
/**
 * Доля нехватки, которую должен оплатить паттерн. По умолчанию — правило игры (lastChance.ts);
 * SIM_LC_SHARE переопределяет её для замера порога без правки кода. Значение печатается в каждом отчёте.
 */
export const SHARE = Number(process.env.SIM_LC_SHARE ?? LC.LAST_CHANCE_GOAL_SHARE);
if (!Number.isFinite(SHARE) || SHARE <= 0) throw new Error(`SIM_LC_SHARE должен быть положительным числом, получено «${process.env.SIM_LC_SHARE}»`);

const cloneGrid = (grid) => grid.map((line) => line.slice());

/** Веса чистой сетки — CollectorScene.cleanWeight: обычные веса раунда без запрещённых символов. */
export function cleanWeight(round, diceDrought) {
  const base = R.weightsForRound(round, E.diceWeight(diceDrought));
  return (symbol) => (LC.isLastChanceSymbol(symbol) ? base(symbol) : 0);
}

/** Входная сетка: одна чистая прокрутка (CollectorScene.rollLastChance + cleanWeight). */
export function entryGrid(round, diceDrought) {
  return R.spinGrid(cleanWeight(round, diceDrought));
}

/** Лучший множитель паттернов сетки (lastChance.ts). */
export function bestMultiplier(grid) {
  return LC.bestMultiplier(P.evaluateGrid(grid));
}

/**
 * Цель от денег (lastChance.ts, lastChanceGoal + chancePrice): нехватка × доля, переведённая в множитель паттерна.
 * Цена символа берётся по раунду — тем же правилом, что в игре; формула не копируется.
 */
export function moneyGoal(need, round, streak, factor, share = SHARE) {
  return LC.lastChanceGoal(need, LC.chancePrice(round), streak, factor, share);
}

/** Полная нехватка (share = 1): паттерн должен оплатить весь долг — верхняя граница цели, для сравнения. */
export function fullGoal(need, round, streak, factor) {
  return moneyGoal(need, round, streak, factor, 1);
}

/** Побита ли цель (CollectorScene.finishLastChance). */
export function isGoalMet(grid, goal) {
  return LC.isLastChanceGoalMet(bestMultiplier(grid), goal);
}

/** Перекрут столбца: все три клетки выпадают заново (CollectorScene.rerollColumn). */
function rerolledColumn(grid, col, weight) {
  const next = cloneGrid(grid);
  for (let row = 0; row < R.GRID_ROWS; row++) next[row][col] = R.randomSymbol(weight);
  return next;
}

/** Джокер в клетку (CollectorScene.placeJoker). */
function withJoker(grid, row, col) {
  const next = cloneGrid(grid);
  next[row][col] = R.JOKER;
  return next;
}

/**
 * Одно действие жадной политики: наибольшая вероятность побить цель, при равенстве — больший средний лучший
 * множитель. Джокер считается точно, перекрут — выборкой GREEDY_SAMPLES исходов на столбец.
 */
export function chooseAction(grid, goal, weight, samples = GREEDY_SAMPLES) {
  let best = null;
  const better = (candidate) => !best || candidate.p > best.p || (candidate.p === best.p && candidate.mean > best.mean);
  // Джокер: подстановка известна заранее, поэтому вероятность 0 или 1. В занятую джокером клетку игра не даёт.
  for (let row = 0; row < R.GRID_ROWS; row++) {
    for (let col = 0; col < R.GRID_COLUMNS; col++) {
      if (grid[row][col].id === R.JOKER.id) continue;
      const trial = withJoker(grid, row, col);
      const bestAfter = bestMultiplier(trial);
      const action = { kind: 'joker', row, col, p: LC.isLastChanceGoalMet(bestAfter, goal) ? 1 : 0, mean: bestAfter };
      if (better(action)) best = action;
    }
  }
  // Перекрут: какая из трёх клеток выпадет — неизвестно, вероятность оцениваем выборкой.
  for (let col = 0; col < R.GRID_COLUMNS; col++) {
    let wins = 0;
    let sum = 0;
    for (let k = 0; k < samples; k++) {
      const bestAfter = bestMultiplier(rerolledColumn(grid, col, weight));
      if (LC.isLastChanceGoalMet(bestAfter, goal)) wins += 1;
      sum += bestAfter;
    }
    const action = { kind: 'reroll', col, p: wins / samples, mean: sum / samples };
    if (better(action)) best = action;
  }
  return best;
}

function applyAction(grid, action, weight) {
  return action.kind === 'joker' ? withJoker(grid, action.row, action.col) : rerolledColumn(grid, action.col, weight);
}

/**
 * Играет последний шанс по жадной политике. Возвращает { won, goal, goalFull, actions, instant, firstWin }.
 * Цель считается от денег: need — сколько фишек не хватило, streak — множитель серии, factor — множители выигрыша
 * (амулеты и автомат, как в addToPot). Действий всегда LAST_CHANCE_ACTIONS: игра не даёт проверить исход раньше
 * (после первого действия полоса ждёт второго), поэтому и политика делает оба. firstWin — цель была побита уже
 * после первого действия (диагностика). instant — входная сетка уже бьёт цель: победа сразу, полоса не открывается.
 * goalFull — та же цель при share = 1, для сравнения с прежним ориентиром «закрой весь долг».
 */
export function playLastChance({ round, diceDrought, need, streak = 1, factor = 1, share = SHARE, samples = GREEDY_SAMPLES }) {
  const weight = cleanWeight(round, diceDrought);
  let grid = R.spinGrid(weight);
  const goal = moneyGoal(need, round, streak, factor, share);
  const goalFull = fullGoal(need, round, streak, factor);
  if (isGoalMet(grid, goal)) return { won: true, goal, goalFull, actions: 0, instant: true, firstWin: true };
  let firstWin = false;
  for (let step = 0; step < LC.LAST_CHANCE_ACTIONS; step++) {
    grid = applyAction(grid, chooseAction(grid, goal, weight, samples), weight);
    if (step === 0) firstWin = isGoalMet(grid, goal);
  }
  return { won: isGoalMet(grid, goal), goal, goalFull, actions: LC.LAST_CHANCE_ACTIONS, instant: false, firstWin };
}

/** Нижняя граница: ничего не делать — побеждает, только если входная сетка уже бьёт цель. */
export function noActionWin(grid, goal) {
  return isGoalMet(grid, goal);
}

/** Самый сильный паттерн без джекпота — из кода игры, не копией: цель выше него закрывает только джекпот. */
const BEST_WITHOUT_JACKPOT = LC.BEST_WITHOUT_JACKPOT;

/** Та же жадная политика, но с готовой целью (политики сравниваются на одних и тех же числах). */
export function playWithGoal(grid, goal, weight, samples = GREEDY_SAMPLES) {
  let state = grid;
  for (let step = 0; step < LC.LAST_CHANCE_ACTIONS; step++) state = applyAction(state, chooseAction(state, goal, weight, samples), weight);
  return isGoalMet(state, goal);
}

/**
 * Воспроизведение правила игры на настоящих приходах Коллектора: на выборке приходов выдаём чистую сетку того же
 * раунда и играем ту же политику с целью от нехватки (share из SHARE). Так проверяется, что прогон забегов и
 * отдельный замер сходятся, а не «сколько было бы при другом правиле».
 */
export function rescueRateWithGoal(chances, limit = 2000) {
  const step = Math.max(1, Math.ceil(chances.length / limit));
  const sample = chances.filter((_, index) => index % step === 0);
  let won = 0;
  let reachable = 0;
  const goals = [];
  for (const chance of sample) {
    const goal = moneyGoal(chance.need, chance.round, chance.streak, chance.factor);
    goals.push(goal);
    if (goal < BEST_WITHOUT_JACKPOT) reachable += 1; // без джекпота потолок — ×10, а нужно best > goal
    const weight = cleanWeight(chance.round, chance.diceDrought);
    if (playWithGoal(R.spinGrid(weight), goal, weight)) won += 1;
  }
  const sorted = [...goals].sort((a, b) => a - b);
  return {
    won: sample.length > 0 ? won / sample.length : 0,
    count: sample.length,
    goalMedian: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    reachable: sample.length > 0 ? reachable / sample.length : 0,
    share: SHARE,
  };
}

/** Жадная политика на уже выданной сетке (для сравнения политик на одних и тех же сетках). */
export function greedyWin(grid, goal, weight, samples = GREEDY_SAMPLES) {
  let state = grid;
  for (let step = 0; step < LC.LAST_CHANCE_ACTIONS; step++) state = applyAction(state, chooseAction(state, goal, weight, samples), weight);
  return isGoalMet(state, goal);
}

/**
 * Верхняя оценка — перебор всех пар действий: на первом шаге 5 перекрутов (исходы выборкой) и 15 джокеров (точно),
 * на втором — то же самое для каждой получившейся сетки. Возвращает оценку вероятности побить цель.
 * Это не точная граница: исходы перекрута перебираются выборкой (ORACLE_FIRST × ORACLE_SECOND), иначе пришлось бы
 * считать 1331 исход на столбец на каждом шаге — на 200 сетках это часы.
 */
export function oracleWin(grid, goal, weight, first = ORACLE_FIRST, second = ORACLE_SECOND) {
  const secondValue = (state) => {
    let best = 0;
    for (let row = 0; row < R.GRID_ROWS; row++) {
      for (let col = 0; col < R.GRID_COLUMNS; col++) {
        if (state[row][col].id === R.JOKER.id) continue;
        if (LC.isLastChanceGoalMet(bestMultiplier(withJoker(state, row, col)), goal)) return 1; // джокер выигрывает
      }
    }
    for (let col = 0; col < R.GRID_COLUMNS; col++) {
      let wins = 0;
      for (let k = 0; k < second; k++) if (LC.isLastChanceGoalMet(bestMultiplier(rerolledColumn(state, col, weight)), goal)) wins += 1;
      if (wins / second > best) best = wins / second;
    }
    return best;
  };
  let best = 0;
  for (let row = 0; row < R.GRID_ROWS; row++) {
    for (let col = 0; col < R.GRID_COLUMNS; col++) {
      if (grid[row][col].id === R.JOKER.id) continue;
      const value = secondValue(withJoker(grid, row, col));
      if (value > best) best = value;
      if (best === 1) return 1;
    }
  }
  for (let col = 0; col < R.GRID_COLUMNS; col++) {
    let sum = 0;
    for (let k = 0; k < first; k++) sum += secondValue(rerolledColumn(grid, col, weight));
    if (sum / first > best) best = sum / first;
  }
  return best;
}

/** Фиксированные сетки и выборки для отчёта: ГКЧ подменяет Math.random, чтобы прогон повторялся. */
function withSeed(seed, fn) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

const pct = (n) => `${Math.round(n * 1000) / 10}%`;
const f = (n, d = 2) => n.toFixed(d).replace('.', ',');

/**
 * Три политики на одних и тех же зафиксированных сетках: «без действий», жадная, перебор всех пар действий.
 * Сетки разные по раундам и засухе кубика — символы входят в автомат по раундам, веса от этого зависят.
 * Цель — от денег (moneyGoal), а денег в этом замере нет: синтетическая нехватка = весь долг раунда, множители
 * серии и выигрыша ×1. Это худший приход Коллектора — сетки сравниваются по политике, а не по балансу.
 */
export function comparePolicies(count = BOUND_GRIDS, seed = SIM_SEED) {
  return withSeed(seed, () => {
    const rows = [];
    let noWin = 0;
    let greedy = 0;
    let oracle = 0;
    let above = 0; // сетки, где жадная оказалась выше перебора (ошибка выборки, должно быть 0)
    let instant = 0;
    for (let i = 0; i < count; i++) {
      const round = 1 + (i % 10);
      const drought = i % 6;
      const weight = cleanWeight(round, drought);
      const grid = R.spinGrid(weight);
      const goal = moneyGoal(R.debtForRound(round), round, 1, 1);
      const instantWin = noActionWin(grid, goal) ? 1 : 0; // входная сетка уже бьёт цель
      if (instantWin) instant += 1;
      const gr = instantWin ? 1 : (greedyWin(grid, goal, weight) ? 1 : 0);
      const or = instantWin ? 1 : oracleWin(grid, goal, weight);
      noWin += instantWin;
      greedy += gr;
      oracle += or;
      if (gr > or) above += 1;
      rows.push({ round, goal, no: instantWin, gr, or });
    }
    const played = rows.length;
    return { rows, played, instant, no: noWin / played, greedy: greedy / played, oracle: oracle / played, above };
  });
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/**
 * Диагноз последнего шанса по настоящим приходам Коллектора: какая цель выходит из нехватки фишек, какой паттерн её
 * бьёт и сколько нехваток спасается. Числа — правило игры при доле SHARE (в шапке отчёта), не ориентир.
 */
export function chanceReport(chances) {
  const total = chances.length;
  if (total === 0) {
    console.log('последнего шанса не было ни разу');
    return;
  }
  const rescued = (list) => (list.length ? list.filter((chance) => chance.won).length / list.length : 0);
  const share = (list) => list.length / total;
  console.log(`\nцель последнего шанса — ${f(SHARE, 2)} нехватки фишек, выраженные в множителе паттерна (${total} приходов Коллектора):`);
  console.log('паттерн  шансов  доля    спасено');
  for (const pattern of [...new Set(chances.map((chance) => LC.goalPattern(chance.goal)))].sort((a, b) => a - b)) {
    const same = chances.filter((chance) => LC.goalPattern(chance.goal) === pattern);
    console.log(`×${String(pattern).padEnd(7)}${String(same.length).padEnd(8)}${pct(share(same)).padEnd(8)}${pct(rescued(same))}`);
  }
  const cumulative = [
    ['цель 0', (chance) => chance.goal === 0],
    ['цель ≤ ×1', (chance) => chance.goal < 1],
    ['цель ≤ ×2', (chance) => chance.goal <= 2],
    ['цель ≤ ×4', (chance) => chance.goal <= 4],
    ['цель у потолка ×10', (chance) => chance.goal >= BEST_WITHOUT_JACKPOT],
  ];
  for (const [name, test] of cumulative) {
    const same = chances.filter(test);
    console.log(`  ${name.padEnd(20)} доля ${pct(share(same)).padEnd(7)} спасено ${pct(rescued(same))}`);
  }
  const withActions = chances.filter((chance) => !chance.instant);
  const oneAction = withActions.filter((chance) => chance.firstWin).length;
  const lostAfterFirst = withActions.filter((chance) => chance.firstWin && !chance.won).length;
  const actions = withActions.reduce((sum, chance) => sum + chance.actions, 0) / Math.max(withActions.length, 1);
  console.log(`действия: ${f(actions, 2)} на шанс; после первого действия цель уже побита в ${pct(oneAction / Math.max(withActions.length, 1))} случаев, второе действие её разрушило в ${pct(lostAfterFirst / Math.max(withActions.length, 1))}`);
  const rule = rescueRateWithGoal(chances);
  console.log(`правило игры (доля ${f(rule.share, 2)}, ${rule.count} приходов, та же политика): медиана цели ×${f(rule.goalMedian, 1)}, цель ниже потолка ×10 в ${pct(rule.reachable)} приходов, спасено ${pct(rule.won)}`);
}

export function roundReport(studyResult) {
  const { summary, rounds } = studyResult;
  console.log(`\nпоследний шанс по раундам (${summary.lastChances} на забег, спасено ${pct(summary.rescue)}, мгновенных ${pct(summary.instantShare)}, доля цели ${f(SHARE, 2)}):`);
  console.log('раунд  шансов  спасено  мгновенно  действий  цель    паттерн  нехватка');
  for (const [round, row] of [...rounds].sort((a, b) => a[0] - b[0])) {
    if (row.count < 3) continue; // слишком мало случаев — строка ничего не говорит
    const goal = median(row.goal);
    console.log(
      `${String(round).padEnd(7)}${String(row.count).padEnd(8)}${pct(row.won / row.count).padEnd(9)}${pct(row.instant / row.count).padEnd(11)}`
      + `${f(row.actions / row.count, 1).padEnd(10)}${f(goal, 1).padEnd(8)}×${String(LC.goalPattern(goal)).padEnd(7)}${median(row.deficit)}`,
    );
  }
}

if (import.meta.filename === process.argv[1]) {
  const check = comparePolicies();
  console.log(`границы политик на ${check.played} зафиксированных сетках (раунды 1-10, засуха кубика 0-5, доля цели ${f(SHARE, 2)}, синтетическая нехватка = долг раунда, множители ×1):`);
  console.log(`  без действий ${pct(check.no)} (входная сетка уже бьёт цель — ${check.instant} сеток) | жадная (N=${GREEDY_SAMPLES}) ${pct(check.greedy)} | перебор пар действий ${pct(check.oracle)} | жадная выше перебора ${check.above} | сид ${SIM_SEED}`);
  for (const pattern of [...new Set(check.rows.map((row) => LC.goalPattern(row.goal)))].sort((a, b) => a - b)) {
    const same = check.rows.filter((row) => LC.goalPattern(row.goal) === pattern);
    const share = (key) => same.reduce((a, row) => a + row[key], 0) / same.length;
    console.log(`  цель ×${pattern}: сеток ${same.length}, без действий ${pct(share('no'))}, жадная ${pct(share('gr'))}, перебор ${pct(share('or'))}`);
  }
  console.log('доля спасений по раундам — отдельный прогон: SIM_ROUNDS=1 node --import ./ts-resolve.mjs full-run.mjs [игр]');
}

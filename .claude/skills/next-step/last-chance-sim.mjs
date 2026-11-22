// Раунд спасения «Долговой ямы» — по правилам игры, без Phaser (шаг 27).
// Запуск из папки next-step:
//   node --import ./ts-resolve.mjs last-chance-sim.mjs          — доля выживания и прокруток/заморозок по раундам
//   SIM_RESCUE_SKULL=0.45 node ... last-chance-sim.mjs          — калибровка доли черепов без правки кода
//   SIM_RESCUE_FREEZE=2 node ... last-chance-sim.mjs            — калибровка заморозок за прокрутку
//   SIM_ROUNDS=1 node --import ./ts-resolve.mjs full-run.mjs N  — настоящие приходы Коллектора из забегов
//
// ПРАВИЛА, как они читаются из кода (src/game/lastChance.ts):
//  • Фишек на долг не хватило, банкомат уехал с GOOD LUCK — 5 прокруток (RESCUE_SPINS).
//  • Сетка спасения: платящие символы раунда и черепа с долей RESCUE_SKULL_SHARE (50–70% по автору);
//    злых символов, кубика, билетов, короны, клевера и джокера в ней нет (CollectorScene.rescueSpinNow).
//  • После прокрутки можно заморозить или разморозить до RESCUE_FREEZE_PER_SPIN столбцов (в игре — 1). Крутятся только незамороженные,
//    последний столбец морозить нельзя (rescueFreezeVerdict): это правило игры, а не политика.
//  • Собрал любой платящий паттерн — выжил; прокрутки кончились без паттерна — умер (rescueOutcome).
//  • Амулеты и предметы заморожены: их веса и множители сюда не входят.
//
// ПОЛИТИКА БОТА (это выбор игрока, а не правило): после прокрутки бот морозит лучший незамороженный столбец,
// если в нём есть пара одинаковых платящих символов или горизонтальные совпадения; столбец с черепом не морозит
// (череп испортил бы линии через него), размораживать не пробует — замораживает по одному и крутит дальше.
import { fileURLToPath } from 'node:url';

const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const R = await import(SRC + 'rules.ts');
const LC = await import(SRC + 'lastChance.ts');

/**
 * Доля черепов: по умолчанию правило игры (LC.RESCUE_SKULL_SHARE), SIM_RESCUE_SKULL — ручка калибровки.
 * Невалидное число — падаем сразу, а не считаем молча с NaN.
 */
export const SKULL_SHARE = (() => {
  const raw = process.env.SIM_RESCUE_SKULL;
  if (raw === undefined || raw === '') return LC.RESCUE_SKULL_SHARE;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new Error(`SIM_RESCUE_SKULL должен быть числом от 0 до 1, получено «${raw}»`);
  }
  return LC.rescueSkullShare(value);
})();

/** Сколько прокруток даётся в спасении — правило игры, а не политика; SIM_RESCUE_SPINS — ручка калибровки. */
export const SPINS = (() => {
  const raw = process.env.SIM_RESCUE_SPINS;
  if (raw === undefined || raw === '') return LC.RESCUE_SPINS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`SIM_RESCUE_SPINS должен быть целым числом не меньше 1, получено «${raw}»`);
  return value;
})();

/**
 * Сколько заморозок/разморозок разрешено между двумя прокрутками: правило игры (LC.RESCUE_FREEZE_PER_SPIN),
 * SIM_RESCUE_FREEZE — ручка калибровки. Авторские 5 прокруток при этом не меняются.
 */
export const FREEZE = (() => {
  const raw = process.env.SIM_RESCUE_FREEZE;
  if (raw === undefined || raw === '') return LC.RESCUE_FREEZE_PER_SPIN;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`SIM_RESCUE_FREEZE должен быть целым числом не меньше 1, получено «${raw}»`);
  return value;
})();

/** Веса сетки спасения: платящие символы раунда плюс черепа с долей SKULL_SHARE. */
export function rescueWeight(round) {
  return LC.rescueWeightOf(round, SKULL_SHARE);
}

/** Оценка столбца для бота: сколько одинаковых не-черепов в столбце и сколько клеток держат пару в ряду. */
function columnScore(grid, col) {
  const counts = new Map();
  let skull = 0;
  for (let row = 0; row < R.GRID_ROWS; row++) {
    const cell = grid[row][col];
    if (R.isSkull(cell)) {
      skull += 1;
      continue;
    }
    if (!R.isPaying(cell)) continue; // билетов и особых в спасении нет, но правило не должно на них падать
    counts.set(cell.id, (counts.get(cell.id) ?? 0) + 1);
  }
  if (skull > 0) return 0; // череп в столбце: морозить его — портить линии
  let best = 0;
  for (const count of counts.values()) best = Math.max(best, count);
  let horizontal = 0;
  for (let row = 0; row < R.GRID_ROWS; row++) {
    const cell = grid[row][col];
    if (!R.isPaying(cell)) continue;
    if (col > 0 && grid[row][col - 1].id === cell.id) horizontal += 1;
    if (col < R.GRID_COLUMNS - 1 && grid[row][col + 1].id === cell.id) horizontal += 1;
  }
  return Math.max(0, best - 1) * 2 + horizontal; // пара в столбце весит как две горизонтальные
}

/** Какой столбец морозить: лучший по columnScore, но только если там есть совпадение (score > 0). */
export function freezePick(grid, frozen) {
  let best = 0;
  let pick = -1;
  for (let col = 0; col < R.GRID_COLUMNS; col++) {
    if (frozen.has(col)) continue;
    const score = columnScore(grid, col);
    if (score > best) {
      best = score;
      pick = col;
    }
  }
  return pick;
}

/**
 * Один раунд спасения по правилам игры и политике бота. Возвращает { won, spins, frozen }:
 * spins — сколько прокруток успели сделать до победы или до конца, frozen — сколько столбцов заморожено к концу.
 * freezeSpins — сколько заморозок разрешено между прокрутками (правило игры FREEZE); бот тратит их подряд,
 * пока среди незамороженных есть столбец с парой.
 */
export function playRescue({ round, share = SKULL_SHARE, spins = SPINS, freezeSpins = FREEZE }) {
  const weight = LC.rescueWeightOf(round, share);
  let grid = LC.rescueSpin(null, [], weight);
  const frozen = new Set();
  let used = 1;
  if (LC.rescueHasPattern(grid)) return { won: true, spins: used, frozen: 0 };
  for (; used < spins; ) {
    // За ход — до freezeSpins заморозок; последний свободный столбец правило не даёт заморозить.
    for (let action = 0; action < freezeSpins; action++) {
      const pick = freezePick(grid, frozen);
      if (pick < 0 || LC.rescueFreezeVerdict([...frozen], pick, false) !== 'ok') break;
      frozen.add(pick);
    }
    grid = LC.rescueSpin(grid, [...frozen], weight);
    used += 1;
    if (LC.rescueHasPattern(grid)) return { won: true, spins: used, frozen: frozen.size };
  }
  return { won: false, spins: used, frozen: frozen.size };
}

const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
const pct = (value) => `${Math.round(value * 100)}%`;
const f = (value, digits = 2) => value.toFixed(digits).replace('.', ',');

/**
 * Диагноз по настоящим приходам Коллектора: сколько спасений выжило, за сколько прокруток и сколько
 * столбцов морозили. chances — collectorSamples из full-run.mjs.
 */
export function rescueReport(chances) {
  const total = chances.length;
  if (total === 0) {
    console.log('спасение не приходило ни разу');
    return;
  }
  const won = chances.filter((chance) => chance.won);
  console.log(`\nраунд спасения — доля черепов ${f(SKULL_SHARE, 2)}, ${total} приходов Коллектора:`);
  console.log(`выжило ${pct(won.length / total)} (${won.length} из ${total}), прокруток на спасение ${f(chances.reduce((sum, chance) => sum + chance.spins, 0) / total, 2)}, заморожено столбцов ${f(chances.reduce((sum, chance) => sum + chance.frozen, 0) / total, 2)}`);
  console.log('раунд  спасений  выжило  прокруток  заморожено  нехватка');
  const byRound = new Map();
  for (const chance of chances) {
    if (!byRound.has(chance.round)) byRound.set(chance.round, []);
    byRound.get(chance.round).push(chance);
  }
  for (const [round, list] of [...byRound].sort((a, b) => a[0] - b[0])) {
    if (list.length < 3) continue;
    const roundWon = list.filter((chance) => chance.won).length;
    console.log(
      `${String(round).padEnd(7)}${String(list.length).padEnd(10)}${pct(roundWon / list.length).padEnd(8)}`
      + `${f(list.reduce((sum, chance) => sum + chance.spins, 0) / list.length, 2).padEnd(11)}`
      + `${f(list.reduce((sum, chance) => sum + chance.frozen, 0) / list.length, 2).padEnd(12)}${median(list.map((chance) => chance.need))}`,
    );
  }
}

/** Разбивка по раундам из study(): где спасение приходило и чем кончилось. */
export function roundReport(studyResult) {
  const { summary, rounds } = studyResult;
  console.log(`\nспасение по раундам (${summary.lastChances} на забег, выжило ${pct(summary.rescue)}, доля черепов ${f(SKULL_SHARE, 2)}, прокруток ${summary.rescueSpins} на спасение):`);
  console.log('раунд  спасений  выжило  прокруток  заморожено  нехватка');
  for (const [round, row] of [...rounds].sort((a, b) => a[0] - b[0])) {
    if (row.count < 3) continue;
    console.log(
      `${String(round).padEnd(7)}${String(row.count).padEnd(10)}${pct(row.won / row.count).padEnd(8)}`
      + `${f(row.spins / row.count, 2).padEnd(11)}${f(row.frozen / row.count, 2).padEnd(12)}${median(row.deficit)}`,
    );
  }
}

// Прямой замер выживания по раундам (без забегов): удобно калибровать SKULL_SHARE.
if (import.meta.filename === process.argv[1]) {
  const N = 20000;
  console.log(`доля черепов ${f(SKULL_SHARE, 2)}, прокруток ${SPINS}, заморозок за прокрутку ${FREEZE}, бот морозит лучшие столбцы с парой:`);
  for (const round of [1, 2, 3, 5, 8, 10, 15, 20]) {
    let won = 0;
    let spins = 0;
    let frozen = 0;
    for (let i = 0; i < N; i++) {
      const result = playRescue({ round });
      if (result.won) won += 1;
      spins += result.spins;
      frozen += result.frozen;
    }
    console.log(`  раунд ${String(round).padEnd(3)} выжило ${pct(won / N).padEnd(5)} прокруток ${f(spins / N)} заморожено ${f(frozen / N)}`);
  }
}

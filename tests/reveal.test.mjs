// Тесты поэтапного показа выигравших паттернов (DONTLIKE 19.11, «Улучшения» п.1): каскад рамок как в Clover Pit.
// Главное здесь — числа: показ обязан телескопировать в тот же gain, который игра начисляет в addToPot, побитово.
// Без Phaser и DOM. Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../src/game/reveal.ts');
const A = await import('../src/game/amulets.ts');
const P = await import('../src/game/patterns.ts');
const S = await import('../src/game/rules.ts');

// ---------- Вспомогательное ----------

/** Простой генератор: один и тот же прогон на каждом запуске, без Math.random. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Платящие символы: у них цена больше нуля, из них и складываются выигравшие паттерны. */
const PAYING = S.SYMBOLS.filter((symbol) => symbol.price > 0);
/** Амулеты, которые вообще трогают выигрыш паттернов (косточка, жадность, череп в кармане, кости). */
const WIN_AMULETS = ['cherryPit', 'greed', 'skullPocket', 'bones', 'boost', 'bell', 'piggy', 'insurance', 'vest', 'interest', 'cut'];

/** Случайный набор попаданий: паттерны и символы любые, клетки — настоящее место паттерна на сетке. */
function randomHits(random, count) {
  const hits = [];
  for (let i = 0; i < count; i++) {
    const pattern = P.PATTERNS[Math.floor(random() * P.PATTERNS.length)];
    const symbol = PAYING[Math.floor(random() * PAYING.length)];
    const places = P.placements(pattern);
    hits.push({ pattern, symbol, cells: places[Math.floor(random() * places.length)] });
  }
  return hits;
}

/** Случайный набор амулетов: каждая копия по разу, часть амулетов не берём. */
function randomAmulets(random) {
  return WIN_AMULETS.filter(() => random() < 0.5);
}

/** Сетка целиком из одного символа — на ней findPatterns даёт ровно джекпот. */
function filledGrid(symbol) {
  return Array.from({ length: S.GRID_ROWS }, () => Array.from({ length: S.GRID_COLUMNS }, () => symbol));
}

// ---------- Числа: телескоп ----------

test('шагов столько же, сколько попаданий, и порядок hits не сортируется', () => {
  const random = rng(7);
  for (let round = 0; round < 50; round++) {
    const hits = randomHits(random, 1 + Math.floor(random() * 15));
    const steps = R.revealSteps(hits, [], 1, 1);
    assert.equal(steps.length, hits.length, 'длина каскада — число попаданий');
    for (let i = 0; i < hits.length; i++) assert.equal(steps[i].hit, hits[i], `шаг ${i}: тот же паттерн в том же порядке`);
  }
});

test('последний шаг — ровно прежний gain: Math.round(amuletPatternWin(hits) × multiplier × factor)', () => {
  const random = rng(11);
  for (let round = 0; round < 200; round++) {
    const hits = randomHits(random, 1 + Math.floor(random() * 15));
    const owned = randomAmulets(random);
    const multiplier = [1, 2, 3, 5, 10, 25][Math.floor(random() * 6)];
    const factor = [1, 1.7, 3, 3.3, 10][Math.floor(random() * 5)];
    const steps = R.revealSteps(hits, owned, multiplier, factor);
    // Оракул — тот же вызов, что в addToPot: amuletPatternWin по всем hits, затем × множитель × factor.
    const gain = Math.round(A.amuletPatternWin(hits, owned) * multiplier * factor);
    assert.equal(steps[steps.length - 1].shown, gain, `прогон ${round}: последний шаг равен gain`);
  }
});

test('дельты: неотрицательны, а сумма равна последнему shown', () => {
  const random = rng(23);
  for (let round = 0; round < 200; round++) {
    const hits = randomHits(random, 1 + Math.floor(random() * 15));
    const owned = randomAmulets(random);
    const multiplier = [1, 2, 5, 10][Math.floor(random() * 4)];
    const factor = [1, 1.7, 3, 3.3, 10][Math.floor(random() * 5)];
    const steps = R.revealSteps(hits, owned, multiplier, factor);
    let sum = 0;
    let previous = 0;
    for (const step of steps) {
      assert.ok(step.delta >= 0, `прогон ${round}: дельта не бывает отрицательной (${step.delta})`);
      assert.equal(step.delta, step.shown - previous, `прогон ${round}: дельта — прибавка шага`);
      sum += step.delta;
      previous = step.shown;
    }
    assert.equal(sum, steps[steps.length - 1].shown, `прогон ${round}: сумма дельт — последний shown`);
  }
});

test('shown не убывает: каждая новая рамка только добавляет кон', () => {
  const random = rng(31);
  for (let round = 0; round < 300; round++) {
    const hits = randomHits(random, 1 + Math.floor(random() * 15));
    const steps = R.revealSteps(hits, randomAmulets(random), 1 + Math.floor(random() * 20), [1, 1.7, 3][Math.floor(random() * 3)]);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i].shown >= steps[i - 1].shown, `прогон ${round}: шаг ${i} не ниже прошлого`);
  }
});

test('фаззинг: 1000 наборов, factor 1 / 1,7 / 3 / 3,3 / 10 — телескоп и оракул сходятся', () => {
  const random = rng(2026);
  const factors = [1, 1.7, 3, 3.3, 10];
  for (let round = 0; round < 1000; round++) {
    const hits = randomHits(random, 1 + Math.floor(random() * 15));
    const owned = randomAmulets(random);
    const multiplier = 1 + Math.floor(random() * 30);
    const factor = factors[round % factors.length];
    const steps = R.revealSteps(hits, owned, multiplier, factor);
    let sum = 0;
    for (let i = 0; i < steps.length; i++) {
      // Каждый шаг — выигрыш своего префикса, не больше и не меньше.
      const prefix = Math.round(A.amuletPatternWin(hits.slice(0, i + 1), owned) * multiplier * factor);
      assert.equal(steps[i].shown, prefix, `прогон ${round}, шаг ${i}`);
      assert.ok(steps[i].delta >= 0, `прогон ${round}, шаг ${i}: дельта ≥ 0`);
      sum += steps[i].delta;
    }
    assert.equal(sum, Math.round(A.amuletPatternWin(hits, owned) * multiplier * factor), `прогон ${round}: сумма дельт = gain`);
  }
});

test('косточка и множители: показанное растёт от шага к шагу и на вишнях ×2 за копию', () => {
  const cherry = S.SYMBOLS.find((symbol) => symbol.id === 'cherry');
  const row = P.PATTERNS.find((pattern) => pattern.id === 'row3');
  const column = P.PATTERNS.find((pattern) => pattern.id === 'column');
  const hits = [
    { pattern: row, symbol: cherry, cells: [[0, 0], [0, 1], [0, 2]] },
    { pattern: column, symbol: cherry, cells: [[0, 4], [1, 4], [2, 4]] },
  ];
  // Одна копия косточки: паттерн из 🍒 платит цена 4 × множитель паттерна 1 × 2 = 8.
  const steps = R.revealSteps(hits, ['cherryPit'], 1, 1);
  assert.deepEqual(steps.map((step) => step.shown), [8, 16], 'показанное: 8, потом 16');
  assert.deepEqual(steps.map((step) => step.delta), [8, 8], 'дельты по 8');
});

test('джекпот (все 15 клеток) — ровно один шаг', () => {
  const seven = S.SYMBOLS.find((symbol) => symbol.id === 'seven');
  const hits = P.findPatterns(filledGrid(seven));
  assert.equal(hits.length, 1, 'на полной сетке один паттерн — джекпот');
  assert.equal(hits[0].pattern.id, 'jackpot', 'и это джекпот');
  assert.equal(hits[0].cells.length, 15, 'джекпот занимает все 15 клеток');
  const steps = R.revealSteps(hits, [], 2, 1);
  assert.equal(steps.length, 1, 'один шаг: показывать больше нечего');
  assert.equal(steps[0].shown, Math.round(seven.price * 100 * 2), 'цена семь ×100 паттерна ×2 серии');
  assert.equal(steps[0].delta, steps[0].shown, 'вся сумма — в первом же шаге');
});

test('сетка без паттернов — ноль шагов, и это не ошибка', () => {
  assert.deepEqual(R.revealSteps([], [], 3, 10), [], 'пустой список hits — пустой каскад');
});

// ---------- Тайминги ----------

test('числа таймингов — как в согласованном плане', () => {
  assert.equal(R.WIN_REVEAL_STEP, 340, 'предел шага');
  assert.equal(R.WIN_REVEAL_MIN_STEP, 110, 'минимум шага');
  assert.equal(R.WIN_REVEAL_BUDGET, 2200, 'бюджет платной прокрутки');
  assert.equal(R.WIN_REVEAL_FREE_BUDGET, 1100, 'бюджет бесплатной');
  assert.equal(R.WIN_REVEAL_FREE_MIN_STEP, 73, 'минимум шага бесплатной: 15 × 73 = 1095 мс — бюджет держится');
  assert.equal(R.WIN_REVEAL_HOLD, 320, 'пауза перед итогом');
});

test('шаг: бюджет / число паттернов, но в границах [минимум, предел]', () => {
  assert.equal(R.revealStepMs(1, false), 340, 'один паттерн — предел, делить нечего');
  assert.equal(R.revealStepMs(3, false), 340, '2200/3 больше предела — предел');
  assert.equal(R.revealStepMs(8, false), 275, '2200/8');
  assert.equal(R.revealStepMs(13, false), 2200 / 13, '2200/13 — ещё бюджет');
  assert.equal(R.revealStepMs(15, false), 2200 / 15, '15 паттернов — ещё бюджет, а не минимум');
  assert.equal(R.revealStepMs(100, false), 110, 'на россыпи упираемся в минимум');
  assert.equal(R.revealStepMs(1, true), 340, 'бесплатная: один паттерн — тоже предел');
  assert.equal(R.revealStepMs(3, true), 340, 'бесплатная: 1100/3 больше предела — предел');
  assert.equal(R.revealStepMs(8, true), 137.5, 'бесплатная: 1100/8');
  assert.equal(R.revealStepMs(13, true), 1100 / 13, 'бесплатная: 1100/13 — ещё бюджет');
  assert.equal(R.revealStepMs(15, true), 1100 / 15, 'бесплатная: 15 паттернов — ещё бюджет, а не минимум');
  assert.equal(R.revealStepMs(100, true), 73, 'бесплатная: свой минимум');
  assert.equal(R.revealStepMs(0, false), 340, 'ноль паттернов не делит на ноль');
});

test('весь показ укладывается в бюджет: платная ≤ 2,2 с, бесплатная ≤ 1,1 с на 1…15 попаданиях', () => {
  // 15 — верхняя граница: столько паттернов на сетке 5×3 не собрать (перебор даёт максимум 9), значит до неё
  // бюджет обязан держаться без всяких «минимум важнее». Тест падает, если stepMs задерёт минимум или округление.
  for (let count = 1; count <= 15; count++) {
    const paid = count * R.revealStepMs(count, false);
    const free = count * R.revealStepMs(count, true);
    assert.ok(paid <= R.WIN_REVEAL_BUDGET, `${count} паттернов: платный показ ${paid} мс > бюджета ${R.WIN_REVEAL_BUDGET}`);
    assert.ok(free <= R.WIN_REVEAL_FREE_BUDGET, `${count} паттернов: бесплатный показ ${free} мс > бюджета ${R.WIN_REVEAL_FREE_BUDGET}`);
    assert.ok(paid + R.WIN_REVEAL_HOLD <= 2600, `${count} паттернов: весь платный каскад ${paid + R.WIN_REVEAL_HOLD} мс > 2,6 с`);
    const step = R.revealStepMs(count, false);
    assert.ok(step >= R.WIN_REVEAL_MIN_STEP && step <= R.WIN_REVEAL_STEP, `${count} паттернов: шаг ${step} вне границ`);
  }
});

test('сверх 15 попаданий шаг упирается в минимум — бюджет кончается, но не ломается тихо', () => {
  // Порог — первое число, на котором бюджет/число падает ниже минимума: здесь минимум становится главным.
  const paidFrom = Math.ceil(R.WIN_REVEAL_BUDGET / R.WIN_REVEAL_MIN_STEP);
  const freeFrom = Math.ceil(R.WIN_REVEAL_FREE_BUDGET / R.WIN_REVEAL_FREE_MIN_STEP);
  assert.equal(paidFrom, 20, 'платная: с 20 паттернов шаг — минимум');
  assert.equal(freeFrom, 16, 'бесплатная: с 16 паттернов шаг — минимум');
  assert.ok(R.revealStepMs(paidFrom, false) === R.WIN_REVEAL_MIN_STEP, 'платная у порога = минимум');
  assert.ok(R.revealStepMs(freeFrom, true) === R.WIN_REVEAL_FREE_MIN_STEP, 'бесплатная у порога = минимум');
  assert.equal(R.revealStepMs(1000, false), R.WIN_REVEAL_MIN_STEP, 'платная на россыпи = минимум');
  assert.equal(R.revealStepMs(1000, true), R.WIN_REVEAL_FREE_MIN_STEP, 'бесплатная на россыпи = минимум');
});

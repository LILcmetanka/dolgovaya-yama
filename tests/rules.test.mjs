// Тесты правил страховки и долга (node --test). Без Phaser и DOM.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const RULES = await import('../src/game/rules.ts');
const AMULETS = await import('../src/game/amulets.ts');
const { skullShareOf, symbolWeightOf } = await import('../src/game/skullShare.ts');
const { noEffects } = await import('../src/game/items.ts');

test('страховка: сработок в раунде — по числу копий, за каждую 75% сгоревшего', () => {
  assert.equal(AMULETS.insuranceRefund(1000, ['insurance'], 0), 750, 'одна копия, 0 сработок');
  assert.equal(AMULETS.insuranceRefund(1000, ['insurance'], 1), 0, 'одна копия, сработка уже была');
  assert.equal(AMULETS.insuranceRefund(1000, ['insurance', 'insurance'], 1), 750, 'две копии, первая сработка');
  assert.equal(AMULETS.insuranceRefund(1000, ['insurance', 'insurance'], 2), 0, 'две копии, обе сработали');
  assert.equal(AMULETS.insuranceRefund(1000, [], 0), 0, 'без амулета возврата нет');
  assert.equal(AMULETS.AMULETS.find((amulet) => amulet.id === 'insurance').maxCopies, 2, 'копий страховки — две');
});

test('доля черепов — по весам: риск поднимает её, фарт убирает черепа совсем', () => {
  const ctx = (effects) => ({ machineId: 'classic', amulets: [], effects });
  const calm = skullShareOf(1, 0, ctx(noEffects()));
  const risky = skullShareOf(1, 0, ctx({ ...noEffects(), risk: true }));
  const lucky = skullShareOf(1, 0, ctx({ ...noEffects(), luckSpin: true }));
  assert.ok(calm > 0, 'базовая доля черепов больше нуля: ' + calm);
  assert.ok(risky > calm, `риск поднимает долю черепов: ${risky} > ${calm}`);
  assert.equal(lucky, 0, 'фарт: черепов в прокрутке нет');
});

test('бесплатная прокрутка: черепа весят 0, платный символ — столько же, сколько в обычной', () => {
  const base = RULES.weightsForRound(20, () => 10); // к 20-му раунду в автомате есть и дорогие символы
  const ctx = { machineId: 'classic', amulets: [], effects: noEffects() };
  const skull = RULES.SYMBOLS.find((symbol) => RULES.isSkull(symbol));
  const paying = RULES.SYMBOLS.find(
    (symbol) => !RULES.isSkull(symbol) && !RULES.isDice(symbol) && !symbol.isEvil && symbolWeightOf(symbol, base, ctx, false) > 0,
  );
  assert.ok(skull && paying, 'в автомате есть и череп, и платный символ');
  assert.ok(symbolWeightOf(skull, base, ctx, false) > 0, 'в платной прокрутке череп весит');
  assert.equal(symbolWeightOf(skull, base, ctx, true), 0, 'в бесплатной прокрутке черепа нет');
  assert.equal(symbolWeightOf(paying, base, ctx, true), symbolWeightOf(paying, base, ctx, false), 'платный символ весит столько же');
});

test('провал спасения не растит долг: следующий раунд тот же', () => {
  assert.equal(RULES.FAILED_DEBT_ROUND_STEP, 1, 'провал: счёт не двигаем');
  for (const round of [1, 3, 7, 12]) {
    const next = Math.max(0, round - RULES.FAILED_DEBT_ROUND_STEP) + 1; // магазин прибавит единицу
    assert.equal(RULES.debtForRound(next), RULES.debtForRound(round), `раунд ${round}: долг не вырос`);
  }
});

test('долг раунда: формула от ручек gameConfig, округление до 10, рост строгий', async () => {
  const { GAME_CONFIG } = await import('../src/game/gameConfig.ts');
  // Проверяем формулу, а не конкретные числа: ручки баланса меняются (19.11.2026 старт 30 → 150, рост 1,8 → 3,6),
  // а правило «долг раунда N = старт × рост^(N−1), округлённый до 10» остаётся.
  for (let round = 1; round <= 12; round++) {
    const exact = GAME_CONFIG.debtStart * GAME_CONFIG.debtGrowth ** (round - 1);
    const expected = Math.round(exact / RULES.DEBT_ROUND_TO) * RULES.DEBT_ROUND_TO;
    assert.equal(RULES.debtForRound(round), expected, `раунд ${round}: долг = старт × рост^(N−1), округлённый до 10`);
    assert.equal(RULES.debtForRound(round) % RULES.DEBT_ROUND_TO, 0, `раунд ${round}: долг кратен ${RULES.DEBT_ROUND_TO}`);
  }
  // Рост строгий: долг растёт каждый раунд. Во сколько именно раз — это решение баланса (ручка debtGrowth в
  // gameConfig), а не свойство формулы, поэтому порог «не меньше ×1,5» здесь не проверяем.
  for (let round = 1; round <= 11; round++) {
    assert.ok(RULES.debtForRound(round + 1) > RULES.debtForRound(round), `раунд ${round}: долг растёт`);
  }
});

test('мягкий сброс серии: череп оставляет треть, но не ниже серии 0 (×1)', () => {
  assert.equal(RULES.streakAfterSkull(9), 3, '×10 → ×4');
  assert.equal(RULES.streakAfterSkull(3), 1, '×4 → ×2');
  assert.equal(RULES.streakAfterSkull(2), 0, '×3 → ×1');
  assert.equal(RULES.streakAfterSkull(1), 0, '×2 → ×1');
  assert.equal(RULES.streakAfterSkull(0), 0, '×1 остаётся ×1');
  assert.equal(RULES.streakAfterSkull(-2), 0, 'мусор не даёт отрицательной серии');
  assert.equal(Number.isNaN(RULES.streakAfterSkull(Number.NaN)), false, 'NaN не протекает');
  assert.equal(RULES.streakAfterSkull(Number.NaN), 0, 'NaN — мусор, серия 0');
  assert.equal(RULES.streakAfterSkull(Number.POSITIVE_INFINITY), 0, 'Infinity — мусор, серия 0');
});

// ---------- Колокольчик греет черепа (шаг 25) ----------
// Правило: каждое срабатывание 🔔 в раунде добавляет BELL_SKULL_STEP за копию к доле черепов, но не выше BELL_SKULL_MAX.
// hits — только то, что важно функции: symbol.id (как у настоящих паттернов, см. bellSpins).
const bellHits = (count) => Array.from({ length: count }, () => ({ symbol: { id: 'bell' } }));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≈ ${expected}`);

test('колокольчик: без амулета поправки нет, чужая current не тянет', () => {
  assert.equal(AMULETS.bellSkullDelta(bellHits(3), [], 0), 0, 'без амулета — 0');
  assert.equal(AMULETS.bellSkullDelta(bellHits(3), ['cherryPit', 'boost'], 0.5), 0, 'чужие амулеты не считаются');
});

test('колокольчик: одно срабатывание — +1 п.п. за копию', () => {
  near(AMULETS.bellSkullDelta(bellHits(1), ['bell'], 0), AMULETS.BELL_SKULL_STEP, 'одна копия, одно 🔔');
  near(AMULETS.bellSkullDelta(bellHits(2), ['bell'], 0), AMULETS.BELL_SKULL_STEP * 2, 'два 🔔 в одной прокрутке');
  near(AMULETS.bellSkullDelta(bellHits(1), ['bell'], 0.05), 0.05 + AMULETS.BELL_SKULL_STEP, 'поправка копится от current');
});

test('колокольчик: без срабатываний current не меняется', () => {
  near(AMULETS.bellSkullDelta([], ['bell'], 0.07), 0.07, 'паттернов нет — поправка на месте');
  near(AMULETS.bellSkullDelta([{ symbol: { id: 'cherry' } }], ['bell'], 0.07), 0.07, 'не-🔔 паттерн поправку не двигает');
});

test('колокольчик: потолок BELL_SKULL_MAX не превышается', () => {
  const big = AMULETS.bellSkullDelta(bellHits(100), ['bell'], 0);
  near(big, AMULETS.BELL_SKULL_MAX, 'сто срабатываний упираются в потолок');
  near(AMULETS.bellSkullDelta(bellHits(100), ['bell'], 10), AMULETS.BELL_SKULL_MAX, 'мусорная current сверх потолка тоже режется');
  let delta = 0;
  for (let i = 0; i < 200; i++) delta = AMULETS.bellSkullDelta(bellHits(1), ['bell'], delta);
  near(delta, AMULETS.BELL_SKULL_MAX, 'пошаговое накопление не перелезает потолок');
});

test('колокольчик: NaN, Infinity и минус в current — безопасно', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.4]) {
    const value = AMULETS.bellSkullDelta(bellHits(1), ['bell'], bad);
    assert.ok(Number.isFinite(value), `мусор ${bad} не протекает: ${value}`);
    near(value, AMULETS.BELL_SKULL_STEP, `мусор ${bad} считается с нуля`);
  }
  assert.ok(Number.isFinite(AMULETS.bellSkullDelta([], ['bell'], Number.NaN)), 'без срабатываний мусор тоже не протекает');
});

test('колокольчик: копии усиливают правило, но потолок общий', () => {
  near(AMULETS.bellSkullDelta(bellHits(1), ['bell', 'bell'], 0), AMULETS.BELL_SKULL_STEP * 2, 'две копии — вдвое');
  near(AMULETS.bellSkullDelta(bellHits(2), ['bell', 'bell'], 0), AMULETS.BELL_SKULL_STEP * 4, 'две копии и два 🔔');
  near(AMULETS.bellSkullDelta(bellHits(100), ['bell', 'bell'], 0), AMULETS.BELL_SKULL_MAX, 'потолок один для любых копий');
});

test('колокольчик: шаг срабатывания — ручка симулятора', () => {
  near(AMULETS.bellSkullDelta(bellHits(1), ['bell'], 0, 0), 0, 'step = 0 — поправка не растёт (правило выключено)');
  near(AMULETS.bellSkullDelta(bellHits(3), ['bell', 'bell'], 0.02, 0), 0.02, 'step = 0 — накопленное как есть');
  near(AMULETS.bellSkullDelta(bellHits(1), ['bell'], 0, 0.02), 0.02, 'step = 0.02 — ровно шаг за срабатывание');
  near(AMULETS.bellSkullDelta(bellHits(2), ['bell'], 0, 0.02), 0.04, 'step = 0.02 — за каждое срабатывание');
  near(AMULETS.bellSkullDelta(bellHits(1), ['bell', 'bell'], 0, 0.1), 0.2, 'step = 0.1 — за срабатывание и за копию');
  near(AMULETS.bellSkullDelta(bellHits(1), ['bell'], 0, 0.5), AMULETS.BELL_SKULL_MAX, 'step = 0.5 — потолок режет и чужой шаг');
  near(AMULETS.bellSkullDelta(bellHits(100), ['bell'], 0, 0.5), AMULETS.BELL_SKULL_MAX, 'потолок держит и чужой шаг');
});

test('колокольчик: мусор в step — работает константой игры', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.5]) {
    near(AMULETS.bellSkullDelta(bellHits(1), ['bell'], 0, bad), AMULETS.BELL_SKULL_STEP, `step ${bad} — как дефолт`);
  }
});

test('колокольчик: константы правила не ползут', () => {
  assert.equal(AMULETS.BELL_SKULL_STEP, 0.01, 'шаг — 1 п.п. за срабатывание за копию');
  assert.equal(AMULETS.BELL_SKULL_MAX, 0.3, 'потолок — +30 п.п. за раунд');
});

test('колокольчик: описание амулета называет рост черепов', () => {
  const bell = AMULETS.AMULETS.find((amulet) => amulet.id === 'bell');
  assert.ok(bell.description.ru.includes('череп'), 'в русском описании — про черепа: ' + bell.description.ru);
  assert.ok(bell.description.en.toLowerCase().includes('skull'), 'в английском — про skulls: ' + bell.description.en);
});

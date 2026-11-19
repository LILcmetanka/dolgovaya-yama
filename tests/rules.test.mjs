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

test('провал последнего шанса не растит долг: следующий раунд тот же', () => {
  assert.equal(RULES.FAILED_DEBT_ROUND_STEP, 1, 'провал: счёт не двигаем');
  assert.equal(RULES.WON_DEBT_ROUND_STEP, 2, 'выигранный шанс: счёт на один долг назад');
  for (const round of [1, 3, 7, 12]) {
    const next = Math.max(0, round - RULES.FAILED_DEBT_ROUND_STEP) + 1; // магазин прибавит единицу
    assert.equal(RULES.debtForRound(next), RULES.debtForRound(round), `раунд ${round}: долг не вырос`);
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

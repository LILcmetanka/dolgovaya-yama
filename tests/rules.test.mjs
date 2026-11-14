// Тесты правил замаха, страховки и долга (node --test). Без Phaser и DOM.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const RULES = await import('../src/game/rules.ts');
const AMULETS = await import('../src/game/amulets.ts');
const LEVERS = await import('../src/game/levers.ts');
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

test('заряд клампится: мусор и выход за границы не дают NaN или отрицательных весов', () => {
  const low = LEVERS.skullChargeFactor(-1);
  const high = LEVERS.skullChargeFactor(2);
  const nan = LEVERS.skullChargeFactor(Number.NaN);
  assert.equal(low, LEVERS.skullChargeFactor(0), '−1 = как 0');
  assert.equal(high, LEVERS.skullChargeFactor(1), '2 = как 1');
  assert.equal(nan, LEVERS.skullChargeFactor(LEVERS.CHARGE_NEUTRAL), 'NaN = середина');
  for (const value of [-1, 0, 0.5, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
    for (const factor of [LEVERS.skullChargeFactor(value), LEVERS.bigChargeFactor(value)]) {
      assert.ok(Number.isFinite(factor) && factor > 0, `множитель заряда ${value}: ${factor}`);
    }
  }
  assert.equal(LEVERS.chargeValue(-500), 0, 'время меньше нуля — заряд 0');
  assert.equal(LEVERS.chargeValue(Number.NaN), LEVERS.CHARGE_NEUTRAL, 'время NaN — середина');
  assert.equal(LEVERS.isRiskyCharge(Number.NaN), false, 'NaN не считается риском');
});

test('бесплатные прокрутки не получают зарядовых множителей', () => {
  const seven = RULES.SYMBOLS.find((symbol) => symbol.price >= LEVERS.CHARGE_BIG_PRICE);
  const base = RULES.weightsForRound(20, (symbol) => 10); // к 20-му раунду в автомате есть и дорогие символы
  const ctx = (charge) => ({ machineId: 'classic', amulets: [], effects: noEffects(), charge });
  const freeLow = symbolWeightOf(seven, base, ctx(0), true);
  const freeHigh = symbolWeightOf(seven, base, ctx(1), true);
  const paidLow = symbolWeightOf(seven, base, ctx(0), false);
  const paidHigh = symbolWeightOf(seven, base, ctx(1), false);
  assert.equal(freeLow, freeHigh, 'фриспины: заряд на вес не влияет');
  assert.ok(paidHigh > paidLow, 'платные: сильный замах поднимает вес дорогого символа');
  const shareFree = skullShareOf(1, 0, ctx(0));
  assert.ok(Number.isFinite(shareFree) && shareFree > 0, 'доля черепов считается');
});

test('жизненный цикл заряда: старт, отпускание, отмена', () => {
  LEVERS.startCharge(1000);
  assert.equal(LEVERS.chargeNow(1000), 0, 'только нажали — заряд 0');
  assert.equal(LEVERS.chargeNow(1600), 0.5, 'половина времени — половина заряда');
  assert.equal(LEVERS.releaseCharge(1600), 0.5, 'отпустили — вернулся накопленный заряд');
  assert.equal(LEVERS.lastCharge(), 0.5, 'заряд запомнен для шкалы');
  assert.equal(LEVERS.chargeNow(5000), 0.5, 'в покое шкала показывает прошлый заряд');
  LEVERS.startCharge(0);
  assert.equal(LEVERS.releaseCharge(99_999), 1, 'долгое удержание клампится в 1');
  LEVERS.startCharge(0);
  LEVERS.cancelCharge();
  assert.equal(LEVERS.lastCharge(), 0, 'отмена гасит заряд');
  assert.equal(LEVERS.chargeNow(500), 0, 'после отмены шкала пустая');
  assert.equal(LEVERS.releaseCharge(500), 0, 'отпускание после отмены даёт 0');
});

test('порог риска и кламп: 0,7 — граница, NaN — середина', () => {
  assert.equal(LEVERS.isRiskyCharge(0.7), true, 'ровно 0,7 — риск');
  assert.equal(LEVERS.isRiskyCharge(0.6999), false, 'чуть ниже — нет');
  assert.equal(LEVERS.clampCharge(Number.NaN), LEVERS.CHARGE_NEUTRAL, 'NaN — нейтральная середина');
  assert.equal(LEVERS.clampCharge(-5), 0, 'ниже нуля — 0');
  assert.equal(LEVERS.clampCharge(5), 1, 'выше единицы — 1');
});

test('провал последнего шанса не растит долг: следующий раунд тот же', () => {
  assert.equal(RULES.FAILED_DEBT_ROUND_STEP, 1, 'провал: счёт не двигаем');
  assert.equal(RULES.WON_DEBT_ROUND_STEP, 2, 'выигранный шанс: счёт на один долг назад');
  for (const round of [1, 3, 7, 12]) {
    const next = Math.max(0, round - RULES.FAILED_DEBT_ROUND_STEP) + 1; // магазин прибавит единицу
    assert.equal(RULES.debtForRound(next), RULES.debtForRound(round), `раунд ${round}: долг не вырос`);
  }
});

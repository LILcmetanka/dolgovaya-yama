// Тесты сделок Дилера (шаг 9): границы активности, кассета, сдвиг сроков, дубликат, «тихий раунд» и вес черепа.
// Сроки берутся из PACTS (pactSpec().rounds), а не из чисел в тесте: баланс крутится симулятором, тесты — про правила.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../src/game/dealerGame.ts');

const rounds = (id) => D.pactSpec(id).rounds;
const TAKEN = 5; // раунд, в котором берут сделку

test('срок сделки: первый и последний раунд (границы активности)', () => {
  const shop = D.pactOf('tickets-shop', TAKEN);
  const last = TAKEN + rounds('tickets-shop') - 1;
  assert.deepEqual(shop, { id: 'tickets-shop', untilRound: last }, `взяли в ${TAKEN}-м — последний раунд ${last}`);
  assert.equal(D.pactEffects([shop], TAKEN - 1).shopClosed, false, 'до взятия сделки нет');
  assert.equal(D.pactEffects([shop], TAKEN).shopClosed, true, 'раунд взятия — первый');
  assert.equal(D.pactEffects([shop], last).shopClosed, true, 'последний раунд');
  assert.equal(D.pactEffects([shop], last + 1).shopClosed, false, 'после срока сделки нет');
  assert.equal(D.pactEffects([], TAKEN).shopClosed, false, 'пустой список — ничего');
  assert.equal(D.pactEffects([{ id: 'tickets-shop', untilRound: 0 }], 1).shopClosed, false, 'битый срок (0) — сделка кончилась');
});

test('«тихий раунд»: первый раунд без черепов, второй — доля выше, дальше ничего', () => {
  const quiet = D.pactOf('quiet-round', TAKEN);
  const last = TAKEN + rounds('quiet-round') - 1;
  const first = D.pactEffects([quiet], TAKEN);
  assert.equal(first.noSkulls, true, 'в первом раунде черепов нет');
  assert.equal(first.skullShareDelta, 0, 'и доля не поднята');
  const second = D.pactEffects([quiet], last);
  assert.equal(second.noSkulls, false, 'во втором черепа есть');
  assert.equal(second.skullShareDelta, D.QUIET_SKULL_DELTA, 'во втором доля выше на QUIET_SKULL_DELTA');
  assert.ok(D.QUIET_SKULL_DELTA > 0, 'поправка положительная');
  const after = D.pactEffects([quiet], last + 1);
  assert.equal(after.noSkulls, false, 'после срока черепа обычные');
  assert.equal(after.skullShareDelta, 0, 'и поправки нет');
});

test('сроки сделок конечные: JSON не превратит их untilRound в null', () => {
  assert.ok(Number.isFinite(D.PACT_LAST_ROUNDS) && D.PACT_LAST_ROUNDS > 100, 'сентинел «до конца забега» — конечное число');
  for (const spec of D.PACTS) {
    assert.ok(Number.isFinite(spec.rounds) && spec.rounds >= 1, `${spec.id}: срок — целое число раундов`);
    const record = D.pactOf(spec.id, TAKEN);
    assert.ok(Number.isFinite(record.untilRound), `${spec.id}: untilRound конечный`);
    assert.equal(JSON.parse(JSON.stringify(record)).untilRound, record.untilRound, `${spec.id}: срок переживает JSON`);
  }
});

test('readPacts: мусор, неизвестный id, битый срок', () => {
  const read = D.readPacts([
    { id: 'quiet-round', untilRound: 5.9 },
    { id: 'drop-table', untilRound: 4 }, // такого id в игре нет
    { id: 'double-step', untilRound: 'мусор' },
    { id: 'tickets-shop', untilRound: Number.POSITIVE_INFINITY }, // старая плёнка: срок неизвестен
    { id: 'tickets-shop', untilRound: -3 },
    null,
    'строка',
    42,
  ]);
  assert.deepEqual(read, [
    { id: 'quiet-round', untilRound: 5 },
    { id: 'double-step', untilRound: 0 },
    { id: 'tickets-shop', untilRound: 0 }, // Infinity со старой плёнки
    { id: 'tickets-shop', untilRound: 0 }, // отрицательный срок
  ]);
  assert.deepEqual(D.readPacts(undefined), [], 'поля нет — сделок нет');
  assert.deepEqual(D.readPacts('мусор'), [], 'не массив — сделок нет');
});

test('shiftPacts: сроки едут со счётом раундов, что ушло за ноль — снимается', () => {
  const pacts = [
    { id: 'tickets-shop', untilRound: 6 },
    { id: 'quiet-round', untilRound: 8 },
  ];
  assert.deepEqual(D.shiftPacts(pacts, -2), [
    { id: 'tickets-shop', untilRound: 4 },
    { id: 'quiet-round', untilRound: 6 },
  ], 'назад на два раунда');
  assert.deepEqual(D.shiftPacts(pacts, 1), [
    { id: 'tickets-shop', untilRound: 7 },
    { id: 'quiet-round', untilRound: 9 },
  ], 'вперёд на раунд');
  assert.deepEqual(D.shiftPacts([{ id: 'tickets-shop', untilRound: 1 }], -1), [], 'срок ≤ 0 — сделки нет');
  assert.deepEqual(D.shiftPacts(pacts, 0), pacts, 'нулевой сдвиг ничего не меняет');
  assert.deepEqual(D.shiftPacts(pacts, Number.NaN), pacts, 'мусор в дельте сроки не двигает');
  assert.notEqual(D.shiftPacts(pacts, 0), pacts, 'возвращается новый массив, а не тот же');
});

test('откат счёта не прячет сделку: магазин закрыт и после сдвига', () => {
  // Взяли «магазин закрыт» в 6-м раунде. Провалили последний шанс — счёт 6 → 5 (WON_DEBT_ROUND_STEP = 2 в игре).
  const taken = D.pactOf('tickets-shop', 6);
  const last = 6 + rounds('tickets-shop') - 1;
  const before = 5;
  assert.equal(D.pactEffects([taken], before).shopClosed, false, 'без сдвига сделка спряталась бы (её первый раунд в будущем)');
  const shifted = D.shiftPacts([taken], before - 6); // срок едет вместе со счётом
  assert.equal(D.pactEffects(shifted, before).shopClosed, true, 'со сдвигом раунд снова первый');
  assert.equal(D.pactEffects(shifted, before + rounds('tickets-shop') - 1).shopClosed, true, 'и последний');
  assert.equal(D.pactEffects(shifted, before + rounds('tickets-shop')).shopClosed, false, 'а дальше кончилась');
  assert.equal(shifted[0].untilRound, last - 1, 'срок сдвинулся ровно на дельту счёта');
});

test('действующую сделку второй раз не берут: pactLive и один эффект на дубликат', () => {
  const shop = D.pactOf('tickets-shop', TAKEN);
  const last = TAKEN + rounds('tickets-shop') - 1;
  assert.equal(D.pactLive([shop], 'tickets-shop', TAKEN), true, 'в раунде взятия — живая');
  assert.equal(D.pactLive([shop], 'tickets-shop', last), true, 'и в последнем раунде');
  assert.equal(D.pactLive([shop], 'tickets-shop', last + 1), false, 'после срока — можно брать снова');
  assert.equal(D.pactLive([shop], 'quiet-round', TAKEN), false, 'другая сделка не мешает');
  // Даже если на кассете окажутся две записи, эффект один: магазин закрыт, но не «вдвойне».
  const twice = [shop, { id: 'tickets-shop', untilRound: last + 2 }];
  assert.equal(D.pactEffects(twice, TAKEN).shopClosed, true, 'магазин закрыт');
  assert.equal(D.pactEffects(twice, last + 2).shopClosed, true, 'и когда жива вторая запись');
  const steps = [D.pactOf('double-step', TAKEN), D.pactOf('double-step', TAKEN)];
  assert.equal(D.pactEffects(steps, TAKEN).multiplierStepMul, D.PACT_STEP_FACTOR, 'шаг ×2, а не ×4: сделка «вдвое»');
});

test('skullShareWeightMul: нет черепов, потолок, нулевая поправка', () => {
  assert.equal(D.skullShareWeightMul(0, D.QUIET_SKULL_DELTA), 1, 'черепов нет — двигать нечего');
  assert.equal(D.skullShareWeightMul(0.2, 0), 1, 'поправки нет — вес прежний');
  assert.equal(D.skullShareWeightMul(0.9, D.QUIET_SKULL_DELTA), 1, 'доля уже у потолка 0,9 — дальше не растёт');
  assert.equal(D.skullShareWeightMul(0.95, D.QUIET_SKULL_DELTA), 1, 'выше потолка — тоже 1');
  assert.equal(D.skullShareWeightMul(0.2, Number.NaN), 1, 'мусор в поправке — 1');
  const mul = D.skullShareWeightMul(0.2, D.QUIET_SKULL_DELTA);
  const share = (mul * 0.2) / (mul * 0.2 + 0.8);
  assert.ok(Math.abs(share - (0.2 + D.QUIET_SKULL_DELTA)) < 1e-12, 'доля 20% + поправка, получено ' + share.toFixed(4));
  assert.ok(Number.isFinite(mul) && mul > 1, 'множитель конечный и больше единицы');
});

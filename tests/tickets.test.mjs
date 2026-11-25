// Тесты билета за фишки (шаг 13): доля фишек на руках и её цена. Без Phaser и DOM.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const I = await import('../src/game/items.ts');

/** Доля — дробное число: 0,1 + 0,05 в двоичной арифметике даёт 0,15000000000000002, поэтому сравниваем с допуском. */
function share(actual, expected, what) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} вместо ${expected}`);
}

test('доля банка за билет растёт с покупками: 40/70/100%', () => {
  assert.equal(I.TICKET_SHARE_START, 0.4, 'первый билет — 40% банка');
  assert.equal(I.TICKET_SHARE_STEP, 0.3, 'каждый следующий — +30% банка');
  assert.equal(I.TICKET_SHARE_MAX, 1, 'потолок — 100% банка');
  share(I.ticketShare(0), 0.4, 'ещё не покупал');
  share(I.ticketShare(1), 0.7, 'после первого');
  share(I.ticketShare(2), 1, 'после второго');
});

test('доля упирается в потолок 100% и дальше не растёт', () => {
  for (const bought of [2, 3, 6, 10, 40, 1000]) share(I.ticketShare(bought), 1, `после ${bought} билетов`);
});

test('мусор в счётчике покупок — как первый билет (40%)', () => {
  for (const junk of [NaN, Infinity, -Infinity, -3, -0.5]) share(I.ticketShare(junk), 0.4, `bought = ${junk}`);
  share(I.ticketShare(1.9), 0.7, 'дробное число покупок считается целым вниз: 1,9 → 1');
});

test('цена билета — округление до 5 и минимум 5', () => {
  assert.equal(I.ticketForChips(1000, 0), 400, '40% от 1000');
  assert.equal(I.ticketForChips(1000, 1), 700, '70% от 1000');
  assert.equal(I.ticketForChips(1000, 2), 1000, 'на потолке — весь банк');
  assert.equal(I.ticketForChips(53, 0), 20, '21,2 округляется до 20');
  assert.equal(I.ticketForChips(78, 0), 30, '31,2 округляется до 30');
  assert.equal(I.ticketForChips(10, 0), 5, 'минимум 5 фишек: 40% от 10 — это 4');
});

test('balance 0, NaN, бесконечность или минус — билет стоит минимум', () => {
  for (const balance of [0, NaN, Infinity, -Infinity, -100]) assert.equal(I.ticketForChips(balance, 0), 5, `balance = ${balance}`);
  assert.equal(I.ticketForChips(0, 10), 5, 'с потолком доли и пустым банком — тоже 5');
});

test('скидка сделки Дилера применяется до округления', () => {
  assert.equal(I.ticketForChips(1000, 0, 0.8), 320, '40% от 1000 со скидкой 20% — 320');
  assert.equal(I.ticketForChips(1000, 2, 0.8), 800, '100% от 1000 со скидкой 20% — 800');
  assert.equal(I.ticketForChips(10, 0, 0.8), 5, 'скидка не опускает цену ниже 5');
});

test('цена растёт вместе с балансом и с каждой покупкой', () => {
  assert.ok(I.ticketForChips(10000, 0) > I.ticketForChips(1000, 0), 'банк больше — билет дороже');
  assert.ok(I.ticketForChips(1000, 1) > I.ticketForChips(1000, 0), 'следующий билет дороже при том же банке');
  assert.ok(I.ticketForChips(1000, 2) > I.ticketForChips(1000, 1), 'на потолке ещё дороже');
  assert.equal(I.ticketForChips(1000, 2), I.ticketForChips(1000, 10), 'за потолком цена та же');
});

// Потолок билетов за магазин — правило игры (ShopScene.buyTicket), а не политики бота. Саму покупку и погасший
// ряд проверяет браузерный сценарий .claude/skills/next-step/ticket-check.mjs: здесь только число.
// 0 — без потолка (как в симуляторе): продают, пока хватает фишек, ряд не гаснет.
test('потолок билетов за заход — целое число не меньше нуля', () => {
  assert.ok(Number.isInteger(I.TICKETS_PER_SHOP), 'целое: ' + I.TICKETS_PER_SHOP);
  assert.ok(I.TICKETS_PER_SHOP >= 0, 'ноль — без потолка, иначе хотя бы один билет за магазин: ' + I.TICKETS_PER_SHOP);
});

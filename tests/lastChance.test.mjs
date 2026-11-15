// Тесты докупки прокрутки в последнем шансе (шаг 14): доля фишек на руках, её цена и когда докупка закрыта.
// Без Phaser и DOM. Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const LC = await import('../src/game/lastChance.ts');

/** Доля — дробное число: 0,25 + 0,15 в двоичной арифметике может дать 0,39999999999999997, поэтому сравниваем с допуском. */
function share(actual, expected, what) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} вместо ${expected}`);
}

/** Цель тоже дробная: 500 × 0,2 / 25 не обязано лечь в двоичное число ровно. */
function near(actual, expected, what) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} вместо ${expected}`);
}

test('доли докупки: 25, 40, 55% и дальше потолок 55%', () => {
  assert.equal(LC.LAST_CHANCE_BUY_MAX, 3, 'докупок не больше трёх');
  assert.equal(LC.LAST_CHANCE_BUY_SHARE_START, 0.25, 'первая докупка — 25% фишек на руках');
  assert.equal(LC.LAST_CHANCE_BUY_SHARE_STEP, 0.15, 'каждая следующая — ещё на 15% банка дороже');
  assert.equal(LC.LAST_CHANCE_BUY_SHARE_MAX, 0.55, 'потолок доли — 55% банка');
  share(LC.lastChanceBuyShare(0), 0.25, 'ещё не докупал');
  share(LC.lastChanceBuyShare(1), 0.4, 'после первой');
  share(LC.lastChanceBuyShare(2), 0.55, 'после второй');
});

test('доля упирается в потолок 55% и дальше не растёт', () => {
  for (const bought of [3, 4, 10, 1000]) share(LC.lastChanceBuyShare(bought), 0.55, `после ${bought} докупок`);
});

test('мусор в счётчике докупок — как первая докупка (25%)', () => {
  for (const junk of [NaN, Infinity, -Infinity, -3, -0.5]) share(LC.lastChanceBuyShare(junk), 0.25, `bought = ${junk}`);
  share(LC.lastChanceBuyShare(1.9), 0.4, 'дробное число докупок считается целым вниз: 1,9 → 1');
});

test('цена докупки — доля банка, округление до 5 и минимум 5', () => {
  assert.equal(LC.lastChanceBuyPrice(1000, 0), 250, '25% от 1000');
  assert.equal(LC.lastChanceBuyPrice(380, 0), 95, '25% от 380');
  assert.equal(LC.lastChanceBuyPrice(380, 1), 150, '40% от 380 — 152 округляется до 150');
  // Так цена идёт в игре: после первой докупки банк уже 285, и вторая стоит 40% от него.
  assert.equal(LC.lastChanceBuyPrice(285, 1), 115, '40% от 285 — 114 округляется до 115');
  assert.equal(LC.lastChanceBuyPrice(10, 0), 5, 'минимум 5 фишек: 25% от 10 — это 2,5');
  assert.equal(LC.lastChanceBuyPrice(4, 0), 5, 'минимум 5: 25% от 4 — это 1');
});

test('balance 0, NaN, бесконечность или минус — докупка стоит минимум', () => {
  for (const balance of [0, NaN, Infinity, -Infinity, -100]) assert.equal(LC.lastChanceBuyPrice(balance, 0), 5, `balance = ${balance}`);
  assert.equal(LC.lastChanceBuyPrice(0, 2), 5, 'с потолком доли и пустым банком — тоже 5');
});

test('цена растёт вместе с банком и с каждой докупкой', () => {
  assert.ok(LC.lastChanceBuyPrice(10000, 0) > LC.lastChanceBuyPrice(1000, 0), 'банк больше — докупка дороже');
  assert.ok(LC.lastChanceBuyPrice(1000, 1) > LC.lastChanceBuyPrice(1000, 0), 'следующая докупка дороже при том же банке');
  assert.ok(LC.lastChanceBuyPrice(1000, 2) > LC.lastChanceBuyPrice(1000, 1), 'третья ещё дороже');
  assert.equal(LC.lastChanceBuyPrice(1000, 2), LC.lastChanceBuyPrice(1000, 10), 'за потолком доли цена та же');
});

// Б1: покупка — только когда бесплатные действия кончились. Это отдельное состояние правила, и оно первое:
// пока действия есть, неважно, что будет с лимитом, ценой и целью — покупать рано и списывать нечего.
test('пока действия есть, докупка закрыта состоянием early', () => {
  assert.equal(LC.lastChanceBuyVerdict(2, 0, 1000, 1), 'early', 'оба действия целы');
  assert.equal(LC.lastChanceBuyVerdict(1, 0, 1000, 1), 'early', 'осталось одно действие');
  assert.equal(LC.lastChanceBuyVerdict(1, 0, 3, 1), 'early', 'early раньше poor: банка нет, но покупать всё равно рано');
  assert.equal(LC.lastChanceBuyVerdict(1, LC.LAST_CHANCE_BUY_MAX, 1000, 1), 'early', 'early раньше limit');
  assert.equal(LC.lastChanceBuyVerdict(2, 0, 1000, LC.BEST_WITHOUT_JACKPOT), 'early', 'early раньше hopeless');
  assert.equal(LC.lastChanceBuyVerdict(NaN, 0, 1000, 1), 'early', 'мусор в остатке — как «действия есть»');
});

test('докупка закрыта лимитом: три покупки — и всё', () => {
  assert.equal(LC.lastChanceBuyVerdict(0, 0, 1000, 1), 'ok', 'первая доступна');
  assert.equal(LC.lastChanceBuyVerdict(0, 1, 1000, 1), 'ok', 'вторая доступна');
  assert.equal(LC.lastChanceBuyVerdict(0, 2, 1000, 1), 'ok', 'третья доступна');
  assert.equal(LC.lastChanceBuyVerdict(0, 3, 1000, 1), 'limit', 'четвёртой нет');
  assert.equal(LC.lastChanceBuyVerdict(0, 3, 3, 10), 'limit', 'лимит важнее остальных причин');
});

test('докупка закрыта, когда цена больше банка', () => {
  assert.equal(LC.lastChanceBuyVerdict(0, 0, 3, 1), 'poor', 'до минимума цены не хватает');
  assert.equal(LC.lastChanceBuyVerdict(0, 0, 0, 1), 'poor', 'пустой банк');
  assert.equal(LC.lastChanceBuyVerdict(0, 0, 5, 1), 'ok', 'ровно цена — можно: после покупки банк 0');
});

test('докупка закрыта у потолка цели: её бьёт только джекпот', () => {
  assert.equal(LC.lastChanceBuyVerdict(0, 0, 1000, LC.BEST_WITHOUT_JACKPOT), 'hopeless', 'цель ровно на потолке');
  assert.equal(LC.lastChanceBuyVerdict(0, 0, 1000, LC.BEST_WITHOUT_JACKPOT + 5), 'hopeless', 'цель выше потолка');
  assert.equal(LC.lastChanceBuyVerdict(0, 0, 1000, LC.BEST_WITHOUT_JACKPOT - 0.1), 'ok', 'чуть ниже потолка — можно');
});

// Н1: цель после докупки растёт на заплаченное. Здесь нет зеркала: цена докупки — числом, ожидаемая цель —
// по формуле брифа (lastChanceGoal: нехватка × доля / (цена символа × серия × множители выигрыша)), а не через ту же
// функцию, которой игра считает вход.
test('цель после докупки растёт ровно на заплаченное (цена числом, формула брифа)', () => {
  const need = 500; // нехватка фишек
  const price = 25; // цена платящего символа раунда (chancePrice)
  const shareOfNeed = 0.2; // LAST_CHANCE_GOAL_SHARE
  // Независимый расчёт: 500 × 0,2 / 25 = 4; докупка стоит 95 фишек (lastChanceBuyPrice(380, 0), записано числом),
  // нехватка после неё — 595, цель 595 × 0,2 / 25 = 4,76.
  near(LC.lastChanceGoal(need, price, 1, 1), (need * shareOfNeed) / price, 'цель до докупки');
  near(LC.lastChanceGoal(need + 95, price, 1, 1), ((need + 95) * shareOfNeed) / price, 'цель после докупки');
  near(LC.lastChanceGoal(need + 95, price, 1, 1) - LC.lastChanceGoal(need, price, 1, 1), (95 * shareOfNeed) / price, 'прирост цели — доля заплаченного');
  assert.ok(LC.lastChanceGoal(need + 95, price, 1, 1) < LC.BEST_WITHOUT_JACKPOT, 'в этом примере цель ещё достижима без джекпота');
});

// Правила шага 13/14 не двигаем: докупка добавляет действия, но сама цель остаётся «долей нехватки долга».
test('правила последнего шанса не изменились', () => {
  assert.equal(LC.LAST_CHANCE_ACTIONS, 2, 'действий по-прежнему два');
  assert.equal(LC.LAST_CHANCE_GOAL_SHARE, 0.2, 'цель — пятая часть нехватки долга');
  assert.ok(LC.LAST_CHANCE_BUY_MAX >= 1 && LC.LAST_CHANCE_BUY_MAX <= 3, 'докупок 1–3: ' + LC.LAST_CHANCE_BUY_MAX);
});

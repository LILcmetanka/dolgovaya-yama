// Тесты действий вне прокрутки (шаг 29): цены, эффекты, отказы, одноразовость, обмен весов и продажа символа.
// Без Phaser: всё, что здесь проверяется, — чистые функции actions.ts и хуки skullShare.ts, которыми пользуется
// и сцена, и симулятор. Числа сверяются с игра-функциями (roundPrice), а не копируются из той же строки.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const ACT = await import('../src/game/actions.ts');
const R = await import('../src/game/rules.ts');
const I = await import('../src/game/items.ts');
const SK = await import('../src/game/skullShare.ts');

const ctx = () => ({ machineId: 'classic', amulets: [], effects: I.noEffects() });
const symbolById = (id) => R.SYMBOLS.find((symbol) => symbol.id === id);

test('действия: шесть штук в порядке панели, свежее состояние пустое', () => {
  assert.deepEqual([...ACT.ACTION_IDS], ['exchange', 'lottery', 'service', 'theft', 'sale', 'debt']);
  const state = ACT.freshActions();
  assert.deepEqual(state.used, [], 'ничего не потрачено');
  assert.equal(state.exchange, null, 'обмена нет');
  assert.equal(state.lottery, null, 'лотереи нет');
  assert.equal(state.serviceRounds, 0, 'чистка не идёт');
  assert.deepEqual(state.sold, [], 'ничего не продано');
  assert.equal(state.debtCut, 0, 'долг не выкуплен');
});

test('одноразовость: действие помечается, второй раз его не берут', () => {
  const state = ACT.freshActions();
  assert.equal(ACT.actionUsed(state, 'theft'), false, 'сначала не потрачено');
  const after = ACT.useAction(state, 'theft');
  assert.equal(ACT.actionUsed(after, 'theft'), true, 'потрачено');
  assert.equal(ACT.actionUsed(state, 'theft'), false, 'старое состояние не меняется');
  const again = ACT.useAction(after, 'theft');
  assert.equal(again.used.filter((id) => id === 'theft').length, 1, 'повтор не добавляет вторую отметку');
  assert.deepEqual(state.used, [], 'исходное состояние не тронуто');
});

test('новый раунд: одноразовые снова доступны, обмен/лотерея/проданные гаснут, чистка тикает, выкуп долга ждёт магазина', () => {
  const state = {
    used: ['exchange', 'sale'],
    exchange: { from: 'cherry', to: 'seven' },
    lottery: ACT.LOTTERY_BUFFS[0],
    serviceRounds: 2,
    sold: ['lemon'],
    debtCut: 85,
  };
  const next = ACT.startRoundActions(state);
  assert.deepEqual(next.used, [], 'действия снова доступны');
  assert.equal(next.exchange, null, 'обмен жил до конца раунда');
  assert.equal(next.lottery, null, 'лотерея тоже');
  assert.deepEqual(next.sold, [], 'проданные символы вернулись в автомат');
  assert.equal(next.serviceRounds, 1, 'чистка куплена в этом раунде — ещё работает следующий');
  assert.equal(next.debtCut, 85, 'выкуп долга применит магазин, а не начало раунда');
  assert.equal(ACT.startRoundActions(next).serviceRounds, 0, 'через раунд чистка кончается');
  assert.equal(ACT.startRoundActions(ACT.startRoundActions(next)).serviceRounds, 0, 'ниже нуля не уходит');
});

test('обслуживание автомата: цена от долга, минимум, доля черепов на два раунда без повторной покупки', () => {
  // Шаг 38 (DONTLIKE п.3, решение СОЛО): обслуживание дороже — 20% долга и минимум 30 фишек.
  assert.equal(ACT.ACTION_SERVICE_SHARE, 0.2, 'доля долга 20%');
  assert.equal(ACT.ACTION_SERVICE_MIN, 30, 'минимум 30 фишек');
  assert.equal(ACT.servicePrice(150), 30, '20% от долга 150 — ровно минимум 30');
  assert.equal(ACT.servicePrice(7000), 1400, '20% от долга 7000 — 1400');
  assert.equal(ACT.servicePrice(0), ACT.ACTION_SERVICE_MIN, 'без долга — минимум');
  assert.equal(ACT.servicePrice(1200), 240, '20% от долга 1200 — 240');
  assert.equal(ACT.servicePrice(1202), I.roundPrice(240.4), 'округление то же, что у цен магазина');
  const state = ACT.freshActions();
  assert.equal(ACT.serviceAllowed(state), true, 'пока не чищено — можно');
  assert.equal(ACT.serviceSkullDelta(state), 0, 'без чистки поправки нет');
  const serviced = { ...state, serviceRounds: 2 };
  assert.equal(ACT.serviceAllowed(serviced), false, 'второй раз не берут, пока идёт чистка');
  assert.equal(ACT.serviceSkullDelta(serviced), ACT.ACTION_SERVICE_SKULL_DELTA, 'чистка опускает долю черепов');
  assert.equal(ACT.ACTION_SERVICE_SKULL_DELTA, -0.04, 'на 4 п.п.');
  assert.equal(ACT.ACTION_SERVICE_ROUNDS, 2, 'два раунда');
});

test('лотерея: три бафа и три дебафа, баф/дебаф пополам, числа по автору', () => {
  assert.equal(ACT.LOTTERY_BUFFS.length, 3, 'три бафа');
  assert.equal(ACT.LOTTERY_DEBUFFS.length, 3, 'три дебафа');
  assert.equal(ACT.LOTTERY_POOL.length, 6, 'в пуле шесть');
  assert.ok(ACT.LOTTERY_BUFFS.every((prize) => prize.buff), 'бафы помечены');
  assert.ok(ACT.LOTTERY_DEBUFFS.every((prize) => !prize.buff), 'дебафы тоже');
  const rolls = (first, second) => ACT.lotteryRoll(sequence([first, second]));
  assert.equal(rolls(0.1, 0.1).id, 'win-up', 'первый баф — выигрыш +25%');
  assert.equal(rolls(0.1, 0.1).winMul, 1.25, 'выигрыш +25%');
  assert.equal(rolls(0.1, 0.5).id, 'skull-down', 'второй баф — черепа реже');
  assert.equal(rolls(0.1, 0.5).skullDelta, -0.03, 'на 3 п.п.');
  assert.equal(rolls(0.1, 0.99).id, 'spins-up', 'третий баф — прокрутки');
  assert.equal(rolls(0.1, 0.99).spins, 2, '+2 прокрутки');
  assert.equal(rolls(0.9, 0.1).id, 'win-down', 'первый дебаф — выигрыш −20%');
  assert.equal(rolls(0.9, 0.5).id, 'skull-up', 'второй дебаф — черепа чаще');
  assert.equal(rolls(0.9, 0.99).id, 'spins-down', 'третий дебаф — минус прокрутка');
  assert.equal(rolls(0.9, 0.99).spins, -1, 'ровно одна');
  assert.equal(rolls(0.5, 0.5).buff, false, '0,5 — уже дебаф: пополам');
  assert.equal(ACT.lotteryRoll(sequence([0.1, 0.99])).buff, true, '0,1 — баф');
  assert.equal(ACT.lotteryRoll(sequence([Number.NaN, Number.NaN])).id, 'win-down', 'мусор — первый дебаф, без NaN');
  const state = { ...ACT.freshActions(), lottery: ACT.LOTTERY_BUFFS[0] };
  assert.equal(ACT.lotteryWinMul(state), 1.25, 'множитель выигрыша от лотереи');
  assert.equal(ACT.lotteryWinMul(ACT.freshActions()), 1, 'без лотереи — 1');
  assert.equal(ACT.actionSkullDelta(state), 0, 'у выигрыша поправки черепов нет');
  const skullLottery = { ...ACT.freshActions(), lottery: ACT.LOTTERY_BUFFS[1], serviceRounds: 1 };
  assert.equal(ACT.actionSkullDelta(skullLottery), -0.03 - 0.04, 'лотерея и чистка складываются');
});

test('кража: шанс растёт с раундом до потолка, успех платит долю долга, провал — провал', () => {
  // Шаг 38 (DONTLIKE п.14, решение СОЛО): начинать с малого и расти — 25% + 5 п.п. за раунд, потолок 60%.
  assert.equal(ACT.ACTION_THEFT_CHANCE_START, 0.25, 'первый раунд — 25%');
  assert.equal(ACT.ACTION_THEFT_CHANCE_STEP, 0.05, 'шаг 5 п.п.');
  assert.equal(ACT.ACTION_THEFT_CHANCE_MAX, 0.6, 'потолок 60%');
  assert.equal(ACT.theftChance(1), 0.25, 'в первом раунде 25%');
  assert.equal(ACT.theftChance(2), 0.3, 'во втором — на 5 п.п. выше');
  assert.equal(ACT.theftChance(5), 0.45, 'в пятом — 45%');
  assert.equal(ACT.theftChance(8), 0.6, 'в восьмом — потолок 60%');
  assert.equal(ACT.theftChance(40), ACT.ACTION_THEFT_CHANCE_MAX, 'выше потолка не растёт');
  assert.equal(ACT.theftChance(Number.NaN), ACT.ACTION_THEFT_CHANCE_START, 'мусор в раунде — как первый');
  assert.equal(ACT.theftReward(150), 40, 'доля маленького долга упирается в минимум 40');
  assert.equal(ACT.theftReward(7000), 1750, 'четверть долга 7000');
  assert.equal(ACT.theftSucceeds(1, () => 0.1), true, '0,1 меньше 25% — успех');
  assert.equal(ACT.theftSucceeds(1, () => 0.3), false, '0,3 в первом раунде — уже провал (шанс 25%)');
  assert.equal(ACT.theftSucceeds(2, () => 0.28), true, '0,28 во втором раунде — успех (шанс 30%)');
  assert.equal(ACT.theftSucceeds(8, () => 0.55), true, 'на потолке и 0,55 — успех');
  assert.equal(ACT.theftSucceeds(8, () => 0.9), false, '0,9 — провал даже на потолке');
  assert.equal(ACT.theftSucceeds(1, () => Number.NaN), false, 'мусор — провал, а не случайная смерть');
});

test('продажа символа: клетки на сетке, цена за клетку, неплатящий не продаётся', () => {
  const grid = [
    [symbolById('cherry'), symbolById('seven'), symbolById('cherry')],
    [symbolById('skull'), symbolById('cherry'), symbolById('lemon')],
    [symbolById('lemon'), symbolById('lemon'), symbolById('joker')],
  ];
  assert.equal(ACT.symbolCells(grid, 'cherry'), 3, 'три вишни');
  assert.equal(ACT.symbolCells(grid, 'lemon'), 3, 'три лимона');
  assert.equal(ACT.symbolCells(grid, 'skull'), 1, 'череп считается, но не продаётся');
  assert.equal(ACT.symbolCells(null, 'cherry'), 0, 'сетки ещё нет');
  assert.equal(ACT.salePrice(symbolById('cherry'), 3), 12, 'без множителя — вишня по 4 за клетку');
  assert.equal(ACT.salePrice(symbolById('seven'), 3), 75, 'семёрка по 25');
  // Шаг 38 (DONTLIKE п.4, решение СОЛО): цена × клетки × текущий множитель серии, с потолком цены.
  assert.equal(ACT.salePrice(symbolById('cherry'), 3, 5), 60, 'на ×5 — впятеро больше (4 × 3 × 5)');
  assert.equal(ACT.salePrice(symbolById('seven'), 3, 4), 300, 'семёрка на ×4 — 300');
  assert.equal(ACT.salePrice(symbolById('cherry'), 3, ACT.ACTION_SALE_MULT_CAP), 120, 'на потолке множителя — 10×');
  assert.equal(ACT.salePrice(symbolById('cherry'), 3, 25), 120, 'выше потолка множитель не растёт');
  assert.equal(ACT.salePrice(symbolById('cherry'), 3, 1.4), 17, 'дробный множитель считается: 4 × 3 × 1,4 = 16,8 → 17');
  assert.equal(ACT.salePrice(symbolById('cherry'), 3, 0.5), 12, 'множитель меньше 1 — как ×1 (разгон не штрафует)');
  assert.equal(ACT.salePrice(symbolById('cherry'), 3, 0), 12, 'ноль — как ×1, а не бесплатно');
  assert.equal(ACT.salePrice(symbolById('cherry'), 3, Number.NaN), 12, 'мусор — как ×1');
  assert.equal(ACT.salePrice(symbolById('skull'), 3, 9), 0, 'череп ничего не стоит — продать нельзя');
  assert.equal(ACT.salePrice(symbolById('joker'), 3), 0, 'джокер тоже');
  assert.equal(ACT.salePrice(symbolById('cherry'), 0, 9), 0, 'нет клеток — нет фишек');
});

test('долговая биржа: платишь меньше, чем срезаешь с долга следующего раунда', () => {
  assert.equal(ACT.debtBuyPrice(150), 20, '14% от 150 — 20');
  assert.equal(ACT.debtBuyCut(150), 25, '16% от 150 — 25');
  assert.equal(ACT.debtBuyPrice(540), 75, '14% от 540 — 75');
  assert.equal(ACT.debtBuyCut(540), 85, '16% от 540 — 85');
  assert.ok(ACT.debtBuyCut(540) > ACT.debtBuyPrice(540), 'срезается больше, чем платится');
  assert.ok(ACT.debtBuyCut(7000) > ACT.debtBuyPrice(7000), 'и на большом долге тоже');
  assert.equal(ACT.debtBuyPrice(0), ACT.ACTION_DEBT_PAY_MIN, 'без долга — минимум');
  assert.equal(ACT.debtBuyCut(0), ACT.ACTION_DEBT_CUT_MIN, 'и срез минимум');
});

test('обмен символа: только разные платящие символы, которые есть в автомате', () => {
  const cherry = symbolById('cherry');
  const seven = symbolById('seven');
  const skull = symbolById('skull');
  const inMachine = (symbol) => symbol.id !== 'grape';
  assert.equal(ACT.canExchange(cherry, seven, inMachine), true, 'вишню на семёрку можно');
  assert.equal(ACT.canExchange(cherry, cherry, inMachine), false, 'сам на себя — нельзя');
  assert.equal(ACT.canExchange(cherry, skull, inMachine), false, 'череп не платит');
  assert.equal(ACT.canExchange(cherry, symbolById('grape'), inMachine), false, 'закрытого символа в автомате нет');
  assert.equal(ACT.ACTION_EXCHANGE_TICKETS, 2, 'обмен — 2 билета');
  assert.equal(ACT.ACTION_LOTTERY_TICKETS, 1, 'лотерея — 1 билет');
});

test('вес символа: обмен меняет веса местами, проданный символ выпадает из автомата', () => {
  const base = R.weightsForRound(1);
  const cherry = SK.symbolWeightOf(symbolById('cherry'), base, ctx(), false);
  const lemon = SK.symbolWeightOf(symbolById('lemon'), base, ctx(), false);
  const seven = SK.symbolWeightOf(symbolById('seven'), base, ctx(), false);
  assert.ok(cherry > lemon && lemon > seven, 'базовые веса: вишня тяжелее лимона, лимон тяжелее семёрки');
  const swapped = { ...ctx(), swapSymbols: { from: 'cherry', to: 'seven' } };
  assert.equal(SK.symbolWeightOf(symbolById('cherry'), base, swapped, false), seven, 'вишня стала весить как семёрка');
  assert.equal(SK.symbolWeightOf(symbolById('seven'), base, swapped, false), cherry, 'семёрка — как вишня');
  assert.equal(SK.symbolWeightOf(symbolById('lemon'), base, swapped, false), lemon, 'остальные не тронуты');
  const dropped = { ...ctx(), dropSymbols: ['cherry'] };
  assert.equal(SK.symbolWeightOf(symbolById('cherry'), base, dropped, false), 0, 'проданная вишня не выпадает');
  assert.equal(SK.symbolWeightOf(symbolById('lemon'), base, dropped, false), lemon, 'а лимон остался');
  // Сумма весов при обмене не меняется — и доля черепов та же. А проданный символ её поднимает: платящих стало меньше.
  const shareBefore = SK.skullShareOf(1, 0, ctx());
  assert.equal(SK.skullShareOf(1, 0, swapped), shareBefore, 'обмен весов долю черепов не двигает');
  assert.ok(SK.skullShareOf(1, 0, dropped) > shareBefore, 'проданный символ — черепов стало больше');
});

/** Очередь «случайных» чисел: каждое следующее — из списка, дальше — последнее. */
function sequence(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

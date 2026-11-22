// Тесты раунда спасения (шаг 27): 5 прокруток, паттерн = выжил, долг не меняется, заморозка блокирует прокрутку.
// Без Phaser и DOM. Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const RESCUE = await import('../src/game/lastChance.ts');
const RULES = await import('../src/game/rules.ts');

const symbol = (id) => {
  const found = RULES.SYMBOLS.find((candidate) => candidate.id === id);
  assert.ok(found, `в автомате нет символа ${id}`);
  return found;
};

/** Сетка из одного символа: 5×3. */
const filled = (id) => Array.from({ length: RULES.GRID_ROWS }, () => Array.from({ length: RULES.GRID_COLUMNS }, () => symbol(id)));

/** Сетка без паттернов: у каждой клетки свой символ (разные платящие), черепа тоже не складываются. */
const checker = () => {
  const ids = ['cherry', 'lemon', 'bell', 'diamond', 'seven'];
  return Array.from({ length: RULES.GRID_ROWS }, (_, row) =>
    Array.from({ length: RULES.GRID_COLUMNS }, (_, col) => symbol(ids[(row * 2 + col) % ids.length])),
  );
};

test('константы спасения: 5 прокруток, одна заморозка за ход, доля черепов в авторских границах', () => {
  assert.equal(RESCUE.RESCUE_SPINS, 5, 'прокруток ровно пять');
  assert.equal(RESCUE.RESCUE_FREEZE_PER_SPIN, 1, 'за ход — одна заморозка или разморозка');
  assert.ok(RESCUE.RESCUE_SKULL_SHARE > 0 && RESCUE.RESCUE_SKULL_SHARE < 1, 'доля черепов — правильная дробь');
  assert.ok(RESCUE.RESCUE_SKULL_SHARE_MIN < RESCUE.RESCUE_SKULL_SHARE_MAX, 'границы доли не перевёрнуты');
  assert.ok(RESCUE.RESCUE_SKULL_SHARE_MAX <= 0.7, 'потолок из описания автора — не выше 70%');
  assert.equal(RESCUE.RESCUE_RULES.spins, RESCUE.RESCUE_SPINS);
  assert.equal(RESCUE.RESCUE_RULES.skullShare, RESCUE.RESCUE_SKULL_SHARE);
});

test('доля черепов зажимается в 10–70%, мусор — число игры', () => {
  assert.equal(RESCUE.rescueSkullShare(0.9), 0.7, 'выше потолка — потолок');
  assert.equal(RESCUE.rescueSkullShare(0.01), 0.1, 'ниже пола — пол');
  assert.equal(RESCUE.rescueSkullShare(0.55), 0.55, 'нормальная доля проходит как есть');
  for (const junk of [NaN, Infinity, -Infinity]) assert.equal(RESCUE.rescueSkullShare(junk), RESCUE.RESCUE_SKULL_SHARE, `доля ${junk}`);
});

test('веса спасения: черепа с заданной долей, платящие символы на месте, злые и билеты — нулевые', () => {
  const weight = RESCUE.rescueWeightOf(6, 0.5);
  let skull = 0;
  let others = 0;
  for (const item of RULES.SYMBOLS) {
    const value = weight(item);
    if (RULES.isSkull(item)) skull = value;
    else if (RULES.isPaying(item)) others += value;
    else assert.equal(value, 0, `символ ${item.id} в спасении не выпадает`);
  }
  assert.ok(skull > 0, 'черепа в спасении есть');
  assert.ok(others > 0, 'платящие символы в спасении есть');
  assert.ok(Math.abs(skull / (skull + others) - 0.5) < 1e-9, 'доля клеток-черепов ровно 0,5');
  const capped = RESCUE.rescueWeightOf(1, 5);
  const skullCapped = capped(symbol('skull'));
  let othersCapped = 0;
  for (const item of RULES.SYMBOLS) if (RULES.isPaying(item)) othersCapped += capped(item);
  assert.ok(Math.abs(skullCapped / (skullCapped + othersCapped) - 0.7) < 1e-9, 'мусорная доля 5 упирается в потолок 0,7');
});

test('паттерн = выжил: платящий паттерн считается, черепа и пустая сетка — нет', () => {
  assert.equal(RESCUE.rescueHasPattern(filled('cherry')), true, 'три вишни в ряд спасают');
  assert.equal(RESCUE.rescueHasPattern(filled('skull')), false, 'паттерн из черепов не спасает');
  assert.equal(RESCUE.rescueHasPattern(checker()), false, 'без паттерна — не спасён');
  const mixed = checker();
  mixed[0][0] = symbol('cherry');
  mixed[0][1] = symbol('cherry');
  mixed[0][2] = symbol('cherry');
  mixed[2][0] = symbol('skull');
  mixed[2][1] = symbol('skull');
  mixed[2][2] = symbol('skull');
  assert.equal(RESCUE.rescueHasPattern(mixed), true, 'черепа в другой линии платящий паттерн не отменяют');
});

test('итог: выжил / крутим дальше / умер', () => {
  assert.equal(RESCUE.rescueOutcome(filled('cherry'), 3), 'won', 'паттерн — победа даже при остатке прокруток');
  assert.equal(RESCUE.rescueOutcome(checker(), 1), 'continue', 'прокрутки ещё есть — играем дальше');
  assert.equal(RESCUE.rescueOutcome(checker(), 0), 'dead', 'прокрутки кончились без паттерна — смерть');
  assert.equal(RESCUE.rescueOutcome(checker(), NaN), 'dead', 'мусор в остатке — смерть, а не вечная игра');
});

test('прокрутки убывают, ниже нуля не уходят', () => {
  assert.equal(RESCUE.rescueSpinsAfter(5), 4);
  assert.equal(RESCUE.rescueSpinsAfter(1), 0);
  assert.equal(RESCUE.rescueSpinsAfter(0), 0);
  assert.equal(RESCUE.rescueSpinsAfter(-3), 0);
  assert.equal(RESCUE.rescueSpinsAfter(NaN), 0);
});

test('крутятся только незамороженные столбцы; мусор в списке не ломает сетку', () => {
  assert.deepEqual(RESCUE.rescueSpinningColumns([]), [0, 1, 2, 3, 4]);
  assert.deepEqual(RESCUE.rescueSpinningColumns([1, 3]), [0, 2, 4]);
  assert.deepEqual(RESCUE.rescueSpinningColumns([0, 1, 2, 3, 4]), [], 'всё заморожено — крутить нечего');
  assert.deepEqual(RESCUE.rescueSpinningColumns([-1, 9, 2.5, NaN]), [0, 1, 2, 3, 4], 'несуществующие столбцы отброшены');
});

test('заморозка: одна за ход, последний столбец морозить нельзя, разморозить можно всегда', () => {
  assert.equal(RESCUE.rescueFreezeVerdict([], 2), 'ok');
  assert.equal(RESCUE.rescueFreezeVerdict([], 2, true), 'used', 'действие в этом ходу уже потрачено');
  assert.equal(RESCUE.rescueFreezeVerdict([0, 1, 2, 3], 4), 'last', 'нельзя заморозить последний свободный столбец');
  assert.equal(RESCUE.rescueFreezeVerdict([0, 1, 3], 0), 'ok', 'разморозить замороженный можно');
  for (const bad of [-1, 5, 2.5, NaN]) assert.equal(RESCUE.rescueFreezeVerdict([], bad), 'bad', `столбца ${bad} нет`);
});

test('клик по столбцу морозит и размораживает, тратя ровно одно действие', () => {
  const first = RESCUE.rescueToggleFrozen([], 2, false);
  assert.deepEqual(first, { frozen: [2], used: true }, 'первый клик морозит столбец 2 и тратит ход');
  assert.equal(RESCUE.rescueToggleFrozen([2], 3, true), null, 'второй клик в том же ходу запрещён');
  assert.deepEqual(RESCUE.rescueToggleFrozen([2], 2, false), { frozen: [], used: true }, 'отдельным ходом столбец размораживается');
  assert.equal(RESCUE.rescueToggleFrozen([0, 1, 2, 3], 4, false), null, 'последний свободный столбец заморозить нельзя');
});

test('прокрутка не трогает замороженные столбцы и заполняет остальные', () => {
  const grid = filled('lemon');
  let next = 0;
  const sequence = ['cherry', 'bell', 'diamond', 'seven'];
  const weight = RESCUE.rescueWeightOf(1, 0.5);
  const after = RESCUE.rescueSpin(grid, [1, 3], weight, () => symbol(sequence[next++ % sequence.length]));
  for (let row = 0; row < RULES.GRID_ROWS; row++) {
    assert.equal(after[row][1].id, 'lemon', 'замороженный столбец 1 остался');
    assert.equal(after[row][3].id, 'lemon', 'замороженный столбец 3 остался');
    for (const col of [0, 2, 4]) assert.notEqual(after[row][col].id, 'lemon', `столбец ${col} прокрутился`);
  }
  assert.equal(grid[0][0].id, 'lemon', 'исходная сетка не изменилась: прокрутка возвращает новую');
});

test('первая прокрутка строится с пустой сетки, мусор в заморозке игнорируется', () => {
  const weight = RESCUE.rescueWeightOf(1, 0.5);
  const grid = RESCUE.rescueSpin(null, [NaN, -2, 7], weight, () => symbol('cherry'));
  assert.equal(grid.length, RULES.GRID_ROWS);
  for (const line of grid) {
    assert.equal(line.length, RULES.GRID_COLUMNS);
    for (const cell of line) assert.equal(cell.id, 'cherry', 'пустая сетка заполнена целиком');
  }
});

test('долг после спасения остаётся тем же: множитель даёт ровно текущий долг', () => {
  const debt = RULES.debtForRound(4);
  const nextDebt = RULES.debtForRound(5);
  assert.equal(debt, 7000);
  assert.equal(nextDebt, 25190);
  const mul = RESCUE.rescueDebtMul(debt, nextDebt);
  // ShopScene.takeDebtForRound делает pactDebt: Math.round(debt * mul / 10) * 10 — долг должен совпасть с текущим.
  assert.equal(Math.round((nextDebt * mul) / 10) * 10, debt, 'следующий долг не откатился и не вырос');
  assert.equal(Math.round((RULES.debtForRound(2) * RESCUE.rescueDebtMul(150, RULES.debtForRound(2))) / 10) * 10, 150, 'на первом раунде то же правило');
  for (const junk of [NaN, 0, -100, Infinity]) assert.equal(RESCUE.rescueDebtMul(junk, nextDebt), 1, `мусор в долге ${junk}`);
  assert.equal(RESCUE.rescueDebtMul(debt, 0), 1, 'нулевой следующий долг — обычная формула');
});

test('режим долга после спасения: в игре curve, испорченная ручка — frozen', () => {
  assert.equal(RESCUE.RESCUE_DEBT_MODE, 'curve', 'замер выбрал кривую: долг не замирает, а считается от номера раунда');
  assert.equal(RESCUE.rescueDebtModeOf(), 'curve', 'по умолчанию — число игры');
  assert.equal(RESCUE.rescueDebtModeOf('curve'), 'curve', 'ручка curve проходит');
  assert.equal(RESCUE.rescueDebtModeOf('frozen'), 'frozen', 'ручка frozen проходит');
  for (const junk of [null, 1, NaN, 'x']) assert.equal(RESCUE.rescueDebtModeOf(junk), 'frozen', `мусор ${String(junk)}`);
});

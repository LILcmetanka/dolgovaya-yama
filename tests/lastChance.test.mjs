// Тесты раунда спасения (шаг 27): 5 прокруток, паттерн = выжил, долг тот же и раунд заново, заморозка блокирует прокрутку,
// спасение одно за забег. Без Phaser и DOM. Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const RESCUE = await import('../src/game/lastChance.ts');
const RULES = await import('../src/game/rules.ts');
const DEALER = await import('../src/game/dealerGame.ts');
const SAVE = await import('../src/game/save.ts');

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

test('долг после выживания ровно тот же: «−10%» и «+8%» не теряются, «+20%» не тратится', () => {
  // Раунд 4: debtForRound(4) = 7000. Сделка №12 сначала режет текущий долг на 10%, потом ставит +20% следующему.
  const round = 4;
  const base = RULES.debtForRound(round);
  assert.equal(base, 7000, 'долг 4-го раунда не поехал');
  const cut = DEALER.pactDebt(base, DEALER.DEBT_CUT_MUL);
  assert.equal(cut, 6300, '«−10% сейчас» дало 6300');
  const replay = DEALER.shopDebt(cut, round, DEALER.DEBT_NEXT_MUL, true);
  assert.deepEqual(replay, { debt: 6300, debtNextMul: 1.2 }, 'повтор раунда: долг тот же, «+20%» ждёт следующего долга');
  assert.notEqual(replay.debt, 8400, 'не 8400: пересчёт стёр бы «−10%»');
  assert.equal(DEALER.shopDebt(base, round, DEALER.DEBT_NEXT_MUL).debt, 8400, 'пересчёт с «+20%» дал бы 8400 — так было до правки');
  // №2 «долг +8% сейчас»: повтором раунда долг тоже не двигается.
  const cheap = DEALER.pactDebt(base, DEALER.CHEAP_SHOP_DEBT_MUL);
  assert.deepEqual(DEALER.shopDebt(cheap, round, 1, true), { debt: cheap, debtNextMul: 1 }, '«+8%» сохранилось до спасения и после');
  // Новый раунд (не повтор) по-прежнему считает долг по формуле и тратит множитель ровно на один долг.
  assert.deepEqual(DEALER.shopDebt(cut, round + 1, DEALER.DEBT_NEXT_MUL), {
    debt: DEALER.pactDebt(RULES.debtForRound(round + 1), DEALER.DEBT_NEXT_MUL), debtNextMul: 1,
  });
});

test('shiftPacts(−1): сделка на 1 раунд не исчезает, длинная сдвигается вместе со счётом', () => {
  const round = 5;
  const one = DEALER.pactOf('debt-cut', round); // живёт ровно раунд 5
  const long = DEALER.pactOf('tickets-shop', round); // 4 раунда: 5–8
  assert.equal(one.untilRound, 5);
  assert.equal(long.untilRound, 8);
  const shifted = DEALER.shiftPacts([one, long], -1);
  assert.deepEqual(shifted.find((pact) => pact.id === 'debt-cut'), { id: 'debt-cut', untilRound: 4 }, 'срок на 1 раунд сдвинулся на 4');
  assert.deepEqual(shifted.find((pact) => pact.id === 'tickets-shop'), { id: 'tickets-shop', untilRound: 7 }, 'длинный срок сдвинулся на 7');
  assert.equal(DEALER.pactLive(shifted, 'debt-cut', 4), true, 'в раунде, куда сдвинули счёт, сделка на 1 раунд ещё действует');
  assert.equal(DEALER.pactEffects(shifted, 4).shopClosed, true, 'и долгая сделка в сдвинутом раунде тоже жива');
  assert.equal(DEALER.pactLive(shifted, 'debt-cut', 5), false, 'за своим сроком она уже не живёт');
  assert.deepEqual(DEALER.shiftPacts([{ id: 'debt-cut', untilRound: 1 }], -1), [], 'срок ушёл за нулевой раунд — снимается');
});

test('переигранный раунд — тот же: сделка на 1 раунд в нём действует, второй раз её не берут', () => {
  // CollectorScene.winRescue возвращает счёт на 1, магазин прибавляет 1 — номер раунда не меняется, и сроки
  // сделок не сдвигаются. Сделка, взятая в N, остаётся живой в N, а «текущий долг −10%» второй раз не выдаётся.
  const round = 6;
  const pacts = [DEALER.pactOf('debt-cut', round), DEALER.pactOf('skull-calm', round)];
  const replayed = round; // winRescue: счёт −1, а магазин встаёт перед исходным раундом (openShop(true, replayRound))
  assert.equal(replayed, round, 'магазин возвращает тот же номер раунда');
  assert.equal(DEALER.pactLive(pacts, 'debt-cut', replayed), true, '«долг −10%» ещё жив, значит второй раз его не взять');
  assert.ok(DEALER.pactEffects(pacts, replayed).skullShareDelta < 0, 'короткая «тише черепа» действует в переигранном раунде');
});

test('«магазин закрыт» проверяется по переигранному раунду, а не по предыдущему', () => {
  // CollectorScene.winRescue: счёт отступает на 1, а магазину отдаётся ИСХОДНЫЙ номер (ShopScene.openShop(true, replayRound)).
  const round = 6;
  const shop = DEALER.pactOf('tickets-shop', round); // 4 раунда: 6–9
  assert.equal(shop.untilRound, round + DEALER.TICKETS_SHOP_ROUNDS - 1, 'сделка живёт 4 раунда, считая раунд взятия');
  const stepBack = Math.max(0, round - RESCUE.WON_RESCUE_ROUND_STEP); // счёт после отката, как в winRescue
  const shopRound = DEALER.shopRoundOf(stepBack, round); // номер магазина: openShop получает исходный раунд
  assert.equal(shopRound, round, 'магазин встаёт перед переигранным раундом N');
  assert.equal(DEALER.pactEffects([shop], stepBack).shopClosed, false, 'по счёту после отката сделка ещё не началась — так магазин открывался зря');
  assert.equal(DEALER.pactEffects([shop], shopRound).shopClosed, true, 'в переигранном N сделка живёт — магазин закрыт, а не открыт');
  // Обратная ошибка того же счёта: сделка, кончившаяся перед N, закрыла бы магазин лишний раз.
  const expired = DEALER.pactOf('tickets-shop', round - DEALER.TICKETS_SHOP_ROUNDS); // 2–5
  assert.equal(DEALER.pactEffects([expired], round - 1).shopClosed, true, 'в N − 1 она ещё жива');
  assert.equal(DEALER.pactEffects([expired], round).shopClosed, false, 'в переигранном N кончилась — магазин открыт');
  // Повтор раунда не воскрешает и не съедает сделку: сроки те же, номер тот же.
  const debtCut = DEALER.pactOf('debt-cut', round); // ровно раунд 6
  assert.equal(DEALER.pactLive([debtCut], 'debt-cut', round), true, 'сделка на 1 раунд в переигранном раунде действует — второй раз её не взять');
  assert.equal(DEALER.shopRoundOf(round), round + 1, 'обычный заход (долг отдан) — магазин перед следующим раундом');
});

test('shopDebt: крайние раунды и мусор в «+20%»', () => {
  // Раунды 0 и 1: формула не упирается в ноль и не отдаёт мусор — долг обычное положительное число, кратное шагу.
  for (const round of [0, 1]) {
    const next = DEALER.shopDebt(1234, round, 1);
    assert.deepEqual(next, { debt: RULES.debtForRound(round), debtNextMul: 1 }, `раунд ${round}: долг по формуле, множитель сброшен`);
    assert.ok(Number.isFinite(next.debt) && next.debt > 0, `раунд ${round}: долг — обычное положительное число`);
    assert.equal(next.debt % RULES.DEBT_ROUND_TO, 0, `раунд ${round}: долг округлён до ${RULES.DEBT_ROUND_TO}`);
  }
  assert.ok(RULES.debtForRound(0) < RULES.debtForRound(1), 'раунд 0 дешевле первого: откат счёта долг не растит');
  // Мусор в множителе «следующий долг +20%» (dealerGame.pactDebt): долг считается без него, а множитель тратится.
  for (const junk of [NaN, Infinity, -Infinity]) {
    const next = DEALER.shopDebt(7000, 4, junk);
    assert.deepEqual(next, { debt: RULES.debtForRound(4), debtNextMul: 1 }, `множитель ${junk}: долг как есть, множитель сброшен`);
  }
  // Повтор раунда мусор не роняет: долг возвращается как есть, ничего не пересчитывается.
  for (const junk of [NaN, Infinity, -Infinity]) {
    const replay = DEALER.shopDebt(6300, 4, junk, true);
    assert.equal(replay.debt, 6300, `повтор раунда с множителем ${junk}: долг ровно тот же`);
  }
});

test('флаг спасения липкий на кассете: старая плёнка — «не было», плёнка до ямы не снимает текущий', () => {
  assert.equal(SAVE.rescueUsedOf({}), false, 'старая плёнка без поля — спасения не было');
  assert.equal(SAVE.rescueUsedOf({}, true), true, 'текущий флаг сильнее плёнки');
  assert.equal(SAVE.rescueUsedOf({ rescueUsed: true }, false), true, 'плёнка с ямой');
  assert.equal(SAVE.rescueUsedOf({ rescueUsed: false }, true), true, 'запись до ямы не возвращает вторую яму');
  assert.equal(SAVE.rescueUsedOf({ rescueUsed: 'да' }, false), false, 'мусор в поле — «не было»');
});

test('вторая нехватка фишек: спасения больше не дают, провал спасения — сразу смерть', () => {
  // Так же, как CollectorScene.callCollector: флаг с плёнки/текущий -> rescueAllowed решает, идти в спасение.
  assert.equal(RESCUE.rescueAllowed(SAVE.rescueUsedOf({}, false)), true, 'первая яма за забег даёт раунд спасения');
  assert.equal(RESCUE.rescueAllowed(SAVE.rescueUsedOf({}, true)), false, 'вторая яма — сразу KABOOM, без GOOD LUCK');
  assert.equal(RESCUE.rescueAllowed(SAVE.rescueUsedOf({ rescueUsed: true }, false)), false, 'плёнка до ямы тоже не прощает');
  // Провал спасения прощения не имеет (шаг 34): прокрутки кончились без паттерна — смерть, запаса нет.
  assert.equal(RESCUE.rescueOutcome(checker(), 0), 'dead', 'провал спасения — KABOOM сразу');
  assert.equal(Object.keys(SAVE).some((key) => key.toLowerCase().includes('secondwind')), false, 'в save.ts нет запаса прощения');
  // Старая плёнка с полем счётчика читается: лишнее поле игнорируется, флаг спасения работает как прежде.
  assert.equal(SAVE.rescueUsedOf({ rescueUsed: true, ['second' + 'WindLeft']: 0 }), true, 'плёнка со старым полем — прочитана');
});

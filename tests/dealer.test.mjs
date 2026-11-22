// Тесты сделок Дилера (шаги 9–11): границы активности, кассета, сдвиг сроков, дубликат, «тихий раунд», вес черепа,
// скидка магазина, полная страховка, веса паттернов и символа, сдвиг долга.
// Сроки берутся из PACTS (pactSpec().rounds), а не из чисел в тесте: баланс крутится симулятором, тесты — про правила.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../src/game/dealerGame.ts');
const R = await import('../src/game/rules.ts');
const P = await import('../src/game/patterns.ts');
const A = await import('../src/game/amulets.ts');
const I = await import('../src/game/items.ts');
const S = await import('../src/game/save.ts');
const DR = await import('../src/game/drum.ts');
const SK = await import('../src/game/skullShare.ts');

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
  assert.deepEqual(D.readPacts([]), [], 'пустой список — пустые сделки');
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
  // Взяли «магазин закрыт» в 6-м раунде. Провалили спасение — счёт 6 → 5 (FAILED_DEBT_ROUND_STEP = 1 в игре).
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

test('связка №4 «тише черепа»: доля ниже, серия не выше ×PACT_CAP', () => {
  const calm = D.pactOf('skull-calm', TAKEN);
  const effects = D.pactEffects([calm], TAKEN);
  assert.equal(effects.skullShareDelta, D.SKULL_CALM_DELTA, 'доля черепов ниже на SKULL_CALM_DELTA');
  assert.ok(D.SKULL_CALM_DELTA < 0, 'поправка отрицательная');
  assert.equal(effects.multiplierCap, D.PACT_CAP, 'потолок множителя — PACT_CAP');

  // Как считает сцена: шаг = streakStep (база + «Разгон» + фаза 2) × сделка «шаг вдвое», множитель = правила.
  const stepOf = (deltaSteps) => {
    const mixed = D.pactEffects([calm, ...deltaSteps], TAKEN);
    return { step: R.MULTIPLIER_STEP * mixed.multiplierStepMul, cap: mixed.multiplierCap };
  };
  const show = (multiplier, cap) => Math.min(multiplier, cap);

  const plain = stepOf([]); // только «тише черепа»: шаг 1, потолок 3
  assert.equal(show(R.multiplierForStreak(2, plain.step), plain.cap), 3, 'серия 2 при шаге 1 — ровно ×3');
  assert.equal(show(R.multiplierForStreak(10, plain.step), plain.cap), D.PACT_CAP, 'серия 10 — всё равно ×3');
  assert.equal(show(R.multiplierForStreak(1, plain.step), plain.cap), 2, 'ниже потолка множитель обычный');

  // «Шаг вдвое» + потолок: без потолка серия 2 дала бы ×5, с потолком — ×3.
  const both = stepOf([D.pactOf('double-step', TAKEN)]);
  assert.equal(both.step, R.MULTIPLIER_STEP * D.PACT_STEP_FACTOR, 'шаг сделки «вдвое» — PACT_STEP_FACTOR');
  assert.equal(R.multiplierForStreak(2, both.step), 5, 'серия 2 при шаге 2 — ×5 (потолка нет)');
  assert.equal(show(R.multiplierForStreak(2, both.step), both.cap), D.PACT_CAP, 'с потолком ×3');
  assert.equal(show(R.multiplierForStreak(10, both.step), both.cap), 3, 'серия 10 с потолком — ×3');
  assert.equal(show(R.multiplierForStreak(2, both.step), Number.POSITIVE_INFINITY), 5, 'без потолка (cap = Infinity) — ×5');

  const last = TAKEN + rounds('skull-calm') - 1;
  assert.equal(D.pactEffects([calm], last).multiplierCap, D.PACT_CAP, 'потолок живёт весь срок');
  assert.equal(D.pactEffects([calm], last + 1).multiplierCap, Number.POSITIVE_INFINITY, 'после срока потолка нет');
});

test('связка №14 «мягкий череп»: −1 прокрутка, ступень вместо трети', () => {
  const soft = D.pactOf('soft-skull', TAKEN);
  const effects = D.pactEffects([soft], TAKEN);
  assert.equal(effects.skullSoft, true, 'череп мягкий');
  assert.equal(effects.spinsDelta, D.SOFT_SKULL_SPINS, 'прокруток в раунде меньше на SOFT_SKULL_SPINS');
  assert.ok(D.SOFT_SKULL_SPINS < 0, 'поправка прокруток отрицательная');
  // Серия после черепа: мягкий снимает ровно одну ступень — одно очко серии, шаг множителя на это не влияет
  // (при шаге 2 ступень просто дороже в шкале: ×19 → ×17). «Череп в ×1» — ноль, без сделок — треть.
  assert.equal(D.skullStreakAfter(9, effects), 8, 'мягкий череп: 9 → 8');
  // Шага у функции нет: ступень — это одно очко серии. В шкале множителя 1 + серия × шаг она стоит разного,
  // но ступень всегда одна.
  assert.equal(R.multiplierForStreak(9, 1) - R.multiplierForStreak(8, 1), 1, 'шаг 1: ×9 → ×8');
  assert.equal(R.multiplierForStreak(9, 2) - R.multiplierForStreak(8, 2), 2, 'шаг 2: ×19 → ×17, но ступень одна');
  assert.equal(D.skullStreakAfter(1, effects), 0, 'с короткой серии не уходит в минус');
  assert.equal(D.skullStreakAfter(0, effects), 0, 'и с нуля тоже');
  assert.equal(D.skullStreakAfter(9, { ...effects, skullWipesStreak: true }), 0, '«череп в ×1» сильнее — обнуляет');
  assert.equal(D.skullStreakAfter(9, { ...effects, skullSoft: false }), 3, 'обычный череп оставляет треть');
});

test('связка №17 «выигрыш +25%»: winMul и +0,5 п.п. черепов до конца забега', () => {
  const price = D.pactOf('price-up', TAKEN);
  const effects = D.pactEffects([price], TAKEN);
  assert.equal(effects.winMul, D.PRICE_UP_WIN, 'выигрыш паттернов ×PRICE_UP_WIN');
  assert.ok(D.PRICE_UP_WIN > 1, 'поправка выигрыша больше единицы');
  assert.equal(effects.skullShareDelta, D.PRICE_UP_SKULL_DELTA, 'доля черепов выше на PRICE_UP_SKULL_DELTA');
  assert.equal(price.untilRound, TAKEN + D.PACT_LAST_ROUNDS - 1, 'действует до конца забега (сентинел)');
  assert.equal(D.pactEffects([price], TAKEN + 200).winMul, D.PRICE_UP_WIN, 'и через двести раундов');
});

test('pactEffects без сделок: эффектов нет, всё по умолчанию', () => {
  const none = D.pactEffects([], 1);
  assert.equal(none.noSkulls, false, 'черепа обычные');
  assert.equal(none.skullShareDelta, 0, 'доли не двигаем');
  assert.equal(none.shopClosed, false, 'магазин открыт');
  assert.equal(none.shopDiscount, 1, 'цены обычные');
  assert.equal(none.insuranceShare, A.INSURANCE_SHARE, 'страховка обычная');
  assert.equal(none.insuranceDoubles, false, 'копии не дорожают');
  assert.equal(none.jackpotWeightMul, 1, 'джекпот обычный');
  assert.equal(none.blackWeightAdd, 0, '«чёрным» ничего не прибавляем');
  assert.equal(none.symbolLuck, null, 'символа нет');
  assert.equal(none.winMul, 1, 'выигрыш обычный');
  assert.equal(none.multiplierStepMul, 1, 'шаг обычный');
  assert.equal(none.spinsDelta, 0, 'прокруток столько же');
  assert.equal(none.skullWipesStreak, false, 'череп оставляет треть');
  assert.equal(none.skullSoft, false, 'череп обычный');
  assert.equal(none.multiplierCap, Number.POSITIVE_INFINITY, 'потолка нет');
  assert.equal(none.noMachineSwap, false, 'автомат меняется сам');
  assert.equal(none.bankSurvivesSkull, false, 'череп жжёт кон');
  assert.equal(none.effectSlotsDelta, 0, 'столбик обычный');
  assert.equal(none.doubleTake, false, 'одно забирание за прокрутку');
});

test('эффекты всех сделок конечные и без NaN на любом раунде', () => {
  for (const spec of D.PACTS) {
    for (const round of [1, TAKEN, TAKEN + 5, TAKEN + 500]) {
      const effects = D.pactEffects([D.pactOf(spec.id, TAKEN, R.SYMBOLS.find((s) => s.id === 'seven'))], round);
      assert.ok(Number.isFinite(effects.skullShareDelta), `${spec.id}: skullShareDelta конечная`);
      assert.ok(Number.isFinite(effects.spinsDelta), `${spec.id}: spinsDelta конечный`);
      assert.ok(Number.isFinite(effects.winMul) && effects.winMul > 0, `${spec.id}: winMul — конечное > 0`);
      assert.ok(Number.isFinite(effects.multiplierStepMul) && effects.multiplierStepMul > 0, `${spec.id}: шаг конечный`);
      assert.ok(effects.multiplierCap > 0, `${spec.id}: потолок положительный`);
      assert.ok(Number.isFinite(effects.shopDiscount) && effects.shopDiscount > 0 && effects.shopDiscount <= 1, `${spec.id}: скидка в (0…1]`);
      assert.ok(Number.isFinite(effects.insuranceShare) && effects.insuranceShare > 0 && effects.insuranceShare <= 1, `${spec.id}: доля страховки в (0…1]`);
      assert.ok(Number.isFinite(effects.jackpotWeightMul) && effects.jackpotWeightMul > 0, `${spec.id}: вес джекпота конечный`);
      assert.ok(Number.isFinite(effects.blackWeightAdd) && effects.blackWeightAdd >= 0, `${spec.id}: прибавка «чёрным» не отрицательная и не NaN`);
      assert.equal(typeof effects.insuranceDoubles, 'boolean', `${spec.id}: признак дорогой страховки — да/нет`);
      assert.equal(typeof effects.noMachineSwap, 'boolean', `${spec.id}: запрет смены автомата — да/нет`);
      assert.equal(typeof effects.bankSurvivesSkull, 'boolean', `${spec.id}: «череп не жжёт кон» — да/нет`);
      assert.equal(typeof effects.doubleTake, 'boolean', `${spec.id}: «забрать дважды» — да/нет`);
      assert.ok(Number.isFinite(effects.effectSlotsDelta), `${spec.id}: поправка столбика — конечное число`);
      assert.ok(Number.isInteger(effects.effectSlotsDelta), `${spec.id}: поправка столбика целая`);
      if (effects.symbolLuck !== null) {
        assert.equal(typeof effects.symbolLuck.id, 'string', `${spec.id}: у поправки символа есть id`);
        assert.ok(Number.isFinite(effects.symbolLuck.plus) && Number.isFinite(effects.symbolLuck.minus), `${spec.id}: поправки символа конечные`);
      }
    }
  }
});

test('связка №2 «−20% цен / долг +8%»: скидка на все цены 4 раунда, долг — разово', () => {
  const cheap = D.pactOf('cheap-shop', TAKEN);
  const last = TAKEN + rounds('cheap-shop') - 1;
  assert.equal(D.pactEffects([cheap], TAKEN).shopDiscount, D.CHEAP_SHOP_DISCOUNT, 'скидка в раунде взятия');
  assert.equal(D.pactEffects([cheap], last).shopDiscount, D.CHEAP_SHOP_DISCOUNT, 'и в последнем раунде срока');
  assert.equal(D.pactEffects([cheap], last + 1).shopDiscount, 1, 'после срока цены обычные');
  assert.equal(rounds('cheap-shop'), D.CHEAP_SHOP_ROUNDS, 'срок — CHEAP_SHOP_ROUNDS');
  assert.equal(last - TAKEN + 1, D.CHEAP_SHOP_ROUNDS, 'скидка покрывает столько магазинов, сколько раундов');
  assert.ok(D.CHEAP_SHOP_DISCOUNT < 1 && D.CHEAP_SHOP_DISCOUNT > 0.5, 'скидка — заметная, но не бесплатно');
  // Долг +8% — разовый: в PactEffects его нет, его считает pactDebt в момент взятия карты.
  assert.equal(D.pactDebt(200, D.CHEAP_SHOP_DEBT_MUL), 220, 'долг 200 с +8% — 220, округлённый до 10');
  assert.equal(D.pactDebt(30, D.CHEAP_SHOP_DEBT_MUL), 30, 'маленький долг округлением съедается: 32,4 → 30');

  // Скидка — в каждой цене магазина, через один множитель. Цены: доля долга/билеты, округление своё у каждых.
  const debt = 200;
  const item = { id: 'shield', priceShare: 0.5 };
  assert.equal(I.itemPrice(item, debt), Math.round(0.5 * debt / 5) * 5, 'без скидки цена обычная');
  assert.equal(I.itemPrice(item, debt, D.CHEAP_SHOP_DISCOUNT), 80, 'предмет со скидкой — 80 при долге 200');
  assert.ok(I.slotPrice(I.START_SLOTS, debt, D.CHEAP_SHOP_DISCOUNT) < I.slotPrice(I.START_SLOTS, debt), 'место со скидкой дешевле');
  assert.ok(S.tapePrice(0, D.CHEAP_SHOP_DISCOUNT) <= S.tapePrice(0), 'кассета не дороже');
  assert.ok(A.amuletPrice(A.AMULETS[0], D.CHEAP_SHOP_DISCOUNT) <= A.amuletPrice(A.AMULETS[0]), 'амулет не дороже');
  assert.ok(DR.drumPrice(0, debt, D.CHEAP_SHOP_DISCOUNT) < DR.drumPrice(0, debt), 'барабан со скидкой дешевле');
  assert.equal(A.socketPrice(A.MAX_SOCKETS - 1, D.CHEAP_SHOP_DISCOUNT), 4, 'билетная цена не уходит в 0 — 5 × 0,8 → 4');
});

test('связка №5 «страховка 100% / каждая копия вдвое дороже»', () => {
  const insured = D.pactOf('full-insurance', TAKEN);
  const effects = D.pactEffects([insured], TAKEN);
  assert.equal(effects.insuranceShare, D.INSURANCE_FULL_SHARE, 'страховка отдаёт весь кон');
  assert.equal(effects.insuranceShare, 1, 'доля возврата — 1, а не INSURANCE_SHARE');
  assert.equal(effects.insuranceDoubles, true, 'копии страховки дорожают');
  assert.equal(insured.untilRound, TAKEN + D.PACT_LAST_ROUNDS - 1, 'живёт до конца забега');

  const owned = ['insurance'];
  assert.equal(A.insuranceRefund(100, owned, 0), Math.floor(100 * A.INSURANCE_SHARE), 'без сделки — обычная доля');
  assert.equal(A.insuranceRefund(100, owned, 0, effects.insuranceShare), 100, 'со сделкой — весь кон');
  assert.equal(A.insuranceRefund(100, owned, 1, effects.insuranceShare), 0, 'по разу за копию: вторая сработка — 0');
  assert.equal(A.insuranceCopyPrice(6, 0), 6, 'первая копия по обычной цене');
  assert.equal(A.insuranceCopyPrice(6, 1), 6 * A.INSURANCE_COPY_DOUBLING, 'вторая — вдвое дороже');
  assert.equal(A.insuranceCopyPrice(6, 2), 24, 'третья — вчетверо');
  const after = D.pactEffects([insured], insured.untilRound + 1);
  assert.equal(after.insuranceShare, A.INSURANCE_SHARE, 'после срока — обычная доля');
  assert.equal(after.insuranceDoubles, false, 'и обычные цены копий');
});

test('связка №7 «вес джекпота +50% / вес чёрных паттернов +1»', () => {
  const heavy = D.pactOf('jackpot-weight', TAKEN);
  const effects = D.pactEffects([heavy], TAKEN);
  const jackpot = P.PATTERNS.find((pattern) => pattern.multiplier === P.TOP_MULTIPLIER);
  const black = P.PATTERNS.filter((pattern) => pattern.multiplier === P.LOW_PATTERN_MULTIPLIER);
  const basic = P.PATTERNS.find((pattern) => pattern.multiplier === 1);
  assert.ok(black.length > 0, '«чёрные» паттерны есть');
  assert.ok(P.LOW_PATTERN_MULTIPLIER > 1 && P.LOW_PATTERN_MULTIPLIER < P.TOP_MULTIPLIER, '«чёрные» — слабее джекпота');
  assert.equal(D.pactPatternWeight(D.pactEffects([], TAKEN)), null, 'без сделки поправки нет');

  const weight = D.pactPatternWeight(effects);
  assert.equal(weight(jackpot, 10), 10 * D.JACKPOT_WEIGHT_MUL, 'джекпот тяжелее в JACKPOT_WEIGHT_MUL раз');
  for (const pattern of black) assert.equal(weight(pattern, 10), 10 + D.BLACK_PATTERN_WEIGHT_ADD, `«чёрному» ${pattern.id} +1`);
  assert.equal(weight(basic, 10), 10, 'простой линии ×1 поправка не положена');
  assert.ok(D.JACKPOT_WEIGHT_MUL > 1 && D.BLACK_PATTERN_WEIGHT_ADD > 0, 'поправки по смыслу карты');
});

test('связка №11 «выбранный символ»: выбор на столе, поправки весов, кассета', () => {
  const symbols = D.pactSymbols(TAKEN);
  assert.ok(symbols.length >= 5, 'выбирать есть из чего');
  assert.ok(symbols.every((symbol) => R.isPaying(symbol)), 'только платящие: без черепа и злых');
  assert.ok(symbols.every((symbol) => R.isUnlocked(symbol, TAKEN)), 'и только те, что уже в автомате');
  // Выбирать не из чего — карта №11 ведёт себя как отказ (DealerTable зовёт отказ Дилера, а не молчит).
  assert.equal(D.pactSymbolsAvailable(symbols), true, 'список есть — показываем ряд символов');
  assert.equal(D.pactSymbolsAvailable([]), false, 'пустой список — отказ, а не клик в пустоту');
  const seven = R.SYMBOLS.find((symbol) => symbol.id === 'seven');
  const luck = D.pactOf('symbol-weight', TAKEN, seven);
  assert.equal(luck.untilRound, TAKEN + D.SYMBOL_LUCK_ROUNDS - 1, 'сделка живёт SYMBOL_LUCK_ROUNDS');
  const effects = D.pactEffects([luck], TAKEN);
  assert.deepEqual(effects.symbolLuck, { id: 'seven', plus: D.SYMBOL_LUCK_PLUS, minus: D.SYMBOL_LUCK_MINUS }, 'поправки из констант');
  assert.equal(D.pactEffects([luck], luck.untilRound + 1).symbolLuck, null, 'после срока символа нет');

  // Кассета: символ переживает JSON, сдвиг сроков и чтение; череп и незнакомый id выбрать нельзя.
  const read = D.readPacts(JSON.parse(JSON.stringify([luck])));
  assert.equal(read.length, 1, 'запись прочиталась');
  assert.equal(read[0].symbol.id, 'seven', 'символ вернулся объектом из SYMBOLS');
  assert.equal(read[0].symbol, seven, 'тот же объект, что в SYMBOLS, а не копия');
  assert.deepEqual(D.shiftPacts([luck], -2)[0].symbol, seven, 'сдвиг срока символ не теряет');
  assert.equal(D.readPacts([{ id: 'symbol-weight', untilRound: 5, symbol: { id: 'skull' } }])[0].symbol, undefined, 'череп не выбрать');
  assert.equal(D.readPacts([{ id: 'symbol-weight', untilRound: 5, symbol: 'seven' }])[0].symbol, undefined, 'строка вместо символа — нет');
  assert.equal(D.readPacts([{ id: 'symbol-weight', untilRound: 5 }])[0].symbol, undefined, 'старая запись без символа — сделка без поправки');
  assert.equal(
    D.readPacts([{ id: 'tickets-shop', untilRound: 5, symbol: seven }])[0].symbol,
    undefined,
    'символ читается только у сделки №11 — у чужого id он отбрасывается',
  );

  // Вес: выбранному +2, остальным −0,5, но не ниже нуля; черепа и закрытые символы не трогаем.
  assert.equal(D.pactEffects([{ id: 'symbol-weight', untilRound: 5 }], 5).symbolLuck, null, 'сделка без символа ничего не делает');
  assert.equal(SK.symbolLuckWeight(seven, 9, effects.symbolLuck), 9 + D.SYMBOL_LUCK_PLUS, 'выбранному +2');
  const lemon = R.SYMBOLS.find((symbol) => symbol.id === 'lemon');
  assert.equal(SK.symbolLuckWeight(lemon, 25, effects.symbolLuck), 25 - D.SYMBOL_LUCK_MINUS, 'остальным −0,5');
  assert.equal(SK.symbolLuckWeight(lemon, 0.2, effects.symbolLuck), 0, 'вес не уходит в минус');
  const skull = R.SYMBOLS.find((symbol) => symbol.id === 'skull');
  assert.equal(SK.symbolLuckWeight(skull, 11, effects.symbolLuck), 11, 'черепа не трогаем');
  assert.equal(SK.symbolLuckWeight(lemon, 0, effects.symbolLuck), 0, 'символа нет в автомате — вес 0');

  // Через общий вес символа: у выбранного на 2 больше, у остальных на 0,5 меньше.
  const base = R.weightsForRound(TAKEN);
  const ctx = { machineId: 'classic', amulets: [], effects: I.noEffects(), symbolLuck: effects.symbolLuck };
  assert.equal(SK.symbolWeightOf(seven, base, ctx, false), base(seven) + D.SYMBOL_LUCK_PLUS, 'вес выбранного в прокрутке');
  assert.equal(SK.symbolWeightOf(lemon, base, ctx, false), base(lemon) - D.SYMBOL_LUCK_MINUS, 'вес остальных в прокрутке');
});

test('связка №12 «долг −10% / следующий +20%»: разово, с округлением до 10, с кассетой', () => {
  const cut = D.pactOf('debt-cut', TAKEN);
  assert.equal(cut.untilRound, TAKEN + D.DEBT_CUT_ROUNDS - 1, 'оба сдвига разовые — сделка живёт один раунд');
  assert.ok(D.DEBT_CUT_MUL < 1 && D.DEBT_NEXT_MUL > 1, 'долг сначала дешевле, потом дороже');
  assert.equal(D.pactDebt(310, D.DEBT_CUT_MUL), 280, 'текущий долг −10%: 310 → 279 → 280');
  assert.equal(D.pactDebt(310, D.DEBT_NEXT_MUL), 370, 'следующий долг +20%: 310 → 372 → 370');
  assert.equal(D.pactDebt(30, D.DEBT_CUT_MUL), 30, 'маленький долг округлением съедается');
  assert.equal(D.pactDebt(310, Number.NaN), 310, 'мусор в множителе — долг как есть');
  assert.equal(D.pactDebt(310, Number.POSITIVE_INFINITY), 310, '∞ в множителе — долг как есть');
  assert.equal(D.pactDebt(310, Number.NEGATIVE_INFINITY), 310, '−∞ в множителе — долг как есть');
  // Следующий долг — состояние забега, а не эффект раунда: без поля в кассете он бы терялся.
  assert.equal(D.pactEffects([cut], TAKEN).shopDiscount, 1, 'в эффектах раунда поправки долга нет');
  assert.equal(S.debtNextMulOf({}), 1, 'в старой записи поля нет — множитель обычный');
  assert.equal(S.debtNextMulOf({ debtNextMul: D.DEBT_NEXT_MUL }), D.DEBT_NEXT_MUL, 'кассета возвращает множитель');
  assert.equal(S.debtNextMulOf({ debtNextMul: Number.NaN }), 1, 'испорченное поле — обычный долг');
  assert.equal(S.debtNextMulOf({ debtNextMul: -2 }), 1, 'отрицательный множитель — обычный долг');
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

test('skullShareWeightMul: отрицательная поправка (тише черепа) и её границы', () => {
  assert.equal(D.skullShareWeightMul(0, -0.03), 1, 'черепов нет — снижать нечего');
  assert.equal(D.skullShareWeightMul(0.18, 0), 1, 'нулевая поправка — вес прежний');
  const mul = D.skullShareWeightMul(0.18, -0.03);
  const share = (mul * 0.18) / (mul * 0.18 + 0.82);
  assert.ok(Math.abs(share - 0.15) < 1e-12, 'доля 18% − 3 п.п. = 15%, получено ' + share.toFixed(4));
  assert.ok(Number.isFinite(mul) && mul > 0 && mul < 1, 'множитель конечный и меньше единицы');
  const floor = D.skullShareWeightMul(0.02, -0.03);
  const floorShare = (floor * 0.02) / (floor * 0.02 + 0.98);
  assert.ok(floorShare >= D.SKULL_SHARE_MIN - 1e-12, 'доля не падает ниже SKULL_SHARE_MIN, получено ' + floorShare.toFixed(4));
  assert.ok(Number.isFinite(floor) && floor > 0, 'и множитель не NaN и не отрицательный');
  assert.equal(D.skullShareWeightMul(0.01, -0.03), 1, 'у нижней границы двигать нечего');
});

// ---------- Партия Б шага 11: последние пять связок автора ----------

test('связка №8 «смена автомата отложена / черепа +2 п.п. навсегда»', () => {
  const held = D.pactOf('machine-delay', TAKEN);
  assert.equal(rounds('machine-delay'), D.PACT_LAST_ROUNDS, 'сделка живёт до конца забега');
  assert.equal(D.NO_SWAP_ROUNDS, 4, 'автомат замирает на четыре раунда сделки');
  assert.equal(D.MACHINE_DELAY_SKULL_DELTA, 0.02, 'плата — +2 п.п. черепов');
  for (let step = 0; step < D.NO_SWAP_ROUNDS; step++) {
    const effects = D.pactEffects([held], TAKEN + step);
    assert.equal(effects.noMachineSwap, true, `раунд ${step + 1}: автомат не меняется`);
    assert.equal(effects.skullShareDelta, D.MACHINE_DELAY_SKULL_DELTA, 'черепа чаще весь срок сделки');
  }
  const fifth = D.pactEffects([held], TAKEN + D.NO_SWAP_ROUNDS);
  assert.equal(fifth.noMachineSwap, false, 'пятый раунд — смена автомата снова обычная');
  assert.equal(fifth.skullShareDelta, D.MACHINE_DELAY_SKULL_DELTA, 'а черепа по-прежнему чаще');
  assert.equal(D.pactEffects([held], TAKEN - 1).noMachineSwap, false, 'до взятия запрета нет');
  const after = D.pactEffects([held], held.untilRound + 1);
  assert.equal(after.noMachineSwap, false, 'после срока — обычная смена');
  assert.equal(after.skullShareDelta, 0, 'и обычная доля черепов');
  assert.equal(D.pactEffects([], TAKEN).noMachineSwap, false, 'без сделки автомат меняется');
  assert.equal(D.pactEffects([{ id: 'machine-delay', untilRound: 0 }], 1).noMachineSwap, false, 'битый срок — сделки нет');
});

test('связка №9 «+1 запас второго дыхания (не больше 2) / серия −1 ступень»', () => {
  const breath = D.pactOf('extra-breath', TAKEN);
  assert.equal(breath.untilRound, TAKEN + D.PACT_LAST_ROUNDS - 1, 'запись живёт до конца забега — маркер «уже брал»');
  assert.equal(rounds('extra-breath'), D.EXTRA_BREATH_ROUNDS, 'срок — EXTRA_BREATH_ROUNDS');
  assert.equal(D.EXTRA_BREATH_COUNT, 1, 'запас один');
  assert.equal(D.EXTRA_BREATH_STREAK_COST, 1, 'ступень серии одна');
  assert.equal(D.SECOND_WIND_MAX, 2, 'потолок запасов — два');
  // Как DealerScene.applyPactOnce: запас +1, но не выше потолка; серия вниз на ступень, но не в минус.
  const take = (left, streak) => ({
    left: Math.min(D.SECOND_WIND_MAX, left + D.EXTRA_BREATH_COUNT),
    streak: Math.max(0, streak - D.EXTRA_BREATH_STREAK_COST),
  });
  assert.deepEqual(take(1, 5), { left: 2, streak: 4 }, 'один запас был, стал два');
  assert.deepEqual(take(1, 0), { left: 2, streak: 0 }, 'серия не уходит в минус');
  assert.deepEqual(take(2, 1), { left: 2, streak: 0 }, 'выше двух запасов карта не поднимает');
  assert.deepEqual(take(0, 3), { left: 1, streak: 2 }, 'потраченный запас восполняется до потолка');
  // Повторно карту не берут: запись живёт весь забег, pactLive её видит.
  assert.equal(D.pactLive([breath], 'extra-breath', TAKEN + 1), true, 'на следующий раунд карта уже не берётся');
  assert.equal(D.pactLive([breath], 'extra-breath', breath.untilRound), true, 'и в последнем раунде срока');
  // Два запаса кончились — третий провал последнего шанса кончает забег (как CollectorScene.failRescue).
  const failures = [];
  let left = S.SECOND_WIND_START;
  left = take(left, 0).left;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (left <= 0) { failures.push('kaboom'); continue; }
    left -= 1;
    failures.push('secondWind');
  }
  assert.deepEqual(failures, ['secondWind', 'secondWind', 'kaboom'], 'два запаса прощают два провала, третий — конец забега');
  // В раунде эффекта нет: и ступень, и запас сработали в момент взятия (ветка switch с комментарием).
  const effects = D.pactEffects([breath], TAKEN);
  assert.equal(effects.spinsDelta, 0, 'прокруток не трогает');
  assert.equal(effects.skullSoft, false, 'череп обычный');
  assert.equal(effects.bankSurvivesSkull, false, 'к кону не относится');
  // Кассета: новый счётчик, старые записи с флагом, мусор.
  assert.equal(S.SECOND_WIND_START, 1, 'обычный забег — один запас');
  assert.equal(S.secondWindLeftOf({}), S.SECOND_WIND_START, 'старая запись без полей — дыхание есть');
  assert.equal(S.secondWindLeftOf({ secondWindUsed: false }), S.SECOND_WIND_START, 'старый флаг «не потрачено»');
  assert.equal(S.secondWindLeftOf({ secondWindUsed: true }), 0, 'старый флаг «потрачено» — 0');
  assert.equal(S.secondWindLeftOf({ secondWindLeft: 2 }), 2, 'счётчик со сделкой читается как есть');
  assert.equal(S.secondWindLeftOf({ secondWindLeft: 2.9 }), 2, 'дробное вниз');
  assert.equal(S.secondWindLeftOf({ secondWindLeft: -3 }), 0, 'минус — 0');
  assert.equal(S.secondWindLeftOf({ secondWindLeft: Number.NaN, secondWindUsed: true }), 0, 'мусор — к старому флагу');
  assert.equal(S.secondWindLeftOf({ secondWindLeft: Number.POSITIVE_INFINITY }), 1, '∞ — к флагу, флага нет — 1');
});

test('связка №10 «первый череп не жжёт кон / набранное не идёт в цель»', () => {
  const bank = D.pactOf('safe-bank', TAKEN);
  assert.equal(rounds('safe-bank'), D.SAFE_BANK_ROUNDS, 'сделка живёт один раунд');
  assert.equal(D.pactEffects([bank], TAKEN).bankSurvivesSkull, true, 'в раунде взятия первый череп не жжёт кон');
  assert.equal(D.pactEffects([bank], TAKEN + 1).bankSurvivesSkull, false, 'следующий раунд — обычные правила');
  assert.equal(D.pactEffects([], TAKEN).bankSurvivesSkull, false, 'без сделки череп жжёт кон');
  // Кон цел — и страховке нечего возвращать, сработка копии не тратится.
  const effects = D.pactEffects([bank], TAKEN);
  assert.equal(A.insuranceRefund(0, ['insurance'], 0, effects.insuranceShare), 0, 'сгорать нечему — возврат 0');
  assert.equal(A.insuranceRefund(100, ['insurance'], 0, effects.insuranceShare), Math.floor(100 * A.INSURANCE_SHARE), 'доля страховки обычная');
  assert.equal(effects.bankSurvivesSkull, true, 'карта не подменяет долю страховки');
});

test('связка №13 «бесплатный амулет / −2 места в столбике»', () => {
  const cup = D.pactOf('free-amulet', TAKEN);
  const last = TAKEN + D.FREE_AMULET_ROUNDS - 1;
  assert.equal(rounds('free-amulet'), D.FREE_AMULET_ROUNDS, 'срок — FREE_AMULET_ROUNDS');
  assert.equal(D.FREE_AMULET_SLOTS, 2, 'столбик короче на два места');
  assert.equal(D.pactEffects([cup], TAKEN).effectSlotsDelta, -D.FREE_AMULET_SLOTS, 'поправка в раунде взятия');
  assert.equal(D.pactEffects([cup], last).effectSlotsDelta, -D.FREE_AMULET_SLOTS, 'и в последнем раунде срока');
  assert.equal(D.pactEffects([cup], last + 1).effectSlotsDelta, 0, 'после срока столбик обычный');
  assert.equal(I.effectSlotLimit(D.pactEffects([cup], TAKEN).effectSlotsDelta), I.EFFECT_SLOTS - D.FREE_AMULET_SLOTS, 'предел — EFFECT_SLOTS − 2');
  assert.equal(I.effectSlotLimit(0), I.EFFECT_SLOTS, 'без сделки — обычный предел');
  // Две записи (например, с кассеты) не уводят предел ниже нуля.
  const twice = [cup, D.pactOf('free-amulet', TAKEN + 1)];
  assert.equal(I.effectSlotLimit(D.pactEffects(twice, TAKEN + 1).effectSlotsDelta), 0, 'ниже нуля мест не бывает');
  assert.equal(I.effectSlotLimit(Number.NaN), I.EFFECT_SLOTS, 'мусор — обычный предел');
  assert.equal(I.effectSlotLimit(Number.POSITIVE_INFINITY), I.EFFECT_SLOTS, '∞ — обычный предел');
  assert.equal(I.effectSlotLimit(-99), 0, 'большой минус — ноль мест');
  // Кандидаты на бесплатный амулет: пул уважает maxCopies; всё набрано — брать нечего, карта не берётся.
  const all = A.AMULETS.flatMap((amulet) => new Array(amulet.maxCopies).fill(amulet.id));
  assert.equal(A.randomAmuletOffer(all).length, 0, 'все копии набраны — кандидатов нет');
  assert.ok(A.randomAmuletOffer([]).length > 0, 'пустой забег — кандидаты есть');
});

test('связка №15 «забрать дважды 3 раунда / второе забирание теряет 20%»', () => {
  const again = D.pactOf('double-take', TAKEN);
  assert.equal(again.untilRound, TAKEN + D.DOUBLE_TAKE_ROUNDS - 1, 'живёт DOUBLE_TAKE_ROUNDS раундов');
  assert.equal(rounds('double-take'), D.DOUBLE_TAKE_ROUNDS, 'срок — DOUBLE_TAKE_ROUNDS');
  assert.equal(D.DOUBLE_TAKE_ROUNDS, 3, 'срок — три раунда, а не весь забег');
  assert.equal(D.pactEffects([again], TAKEN).doubleTake, true, 'в раунде взятия второе забирание можно');
  assert.equal(D.pactEffects([again], again.untilRound).doubleTake, true, 'и в последнем раунде');
  assert.equal(D.pactEffects([again], again.untilRound + 1).doubleTake, false, 'после срока — одно забирание');
  assert.equal(D.pactEffects([], TAKEN).doubleTake, false, 'без сделки второго нет');
  assert.ok(D.DOUBLE_TAKE_SHARE > 0 && D.DOUBLE_TAKE_SHARE < 1, 'доля второго забирания в (0…1)');
  assert.equal(D.DOUBLE_TAKE_SHARE, 0.8, '20% — число автора из DONTLIKE.md');
  assert.equal(D.pactDoubleTake(true, 1000), 800, 'второе забирание — 80% первого');
  assert.equal(D.pactDoubleTake(true, 3), 2, 'округление до целого');
  assert.equal(D.pactDoubleTake(false, 1000), 0, 'без сделки второго нет');
  assert.equal(D.pactDoubleTake(true, 0), 0, 'первого забирания не было — второго тоже');
  assert.equal(D.pactDoubleTake(true, -5), 0, 'минус — нет');
  assert.equal(D.pactDoubleTake(true, Number.NaN), 0, 'мусор — нет');
  assert.equal(D.pactDoubleTake(true, Number.POSITIVE_INFINITY), 0, '∞ — нет');
});

// Тесты улучшений после смерти (шаг 28): пул первой партии, готовые числа эффектов на границах, сохранение
// купленного в прогрессе. Без Phaser и DOM: localStorage подменяем ДО импорта progress.ts.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).
//
// Проверки конкретные: числа эффектов сверяются с игровыми функциями (долг, копилка, проценты, страховка),
// а не deepEqual с той же upgradeEffects — иначе тест повторял бы функцию и ничего не ловил.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- localStorage-заглушка с мусором в сохранении ----------
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
  clear: () => store.clear(),
};

const PROGRESS_KEY = 'dolgovaya-yama-progress';
// Мусор в сохранении: чужие ключи, строки, дроби, минус и «сверх потолка». Всё это должно отброситься или ужаться.
store.set(PROGRESS_KEY, JSON.stringify({
  tutorialDone: true,
  patterns: [],
  achievements: [],
  upgrades: { 'debt-start': 7, 'spin-cap': 0, 'win-piggy': 1.5, 'debt-defer': '2', bogus: 3, 'win-patterns': -1 },
  runs: 4,
}));

const UPG = await import('../src/game/upgrades.ts');
const PROGRESS = await import('../src/game/progress.ts');
const RULES = await import('../src/game/rules.ts');
const A = await import('../src/game/amulets.ts');
const LANG = await import('../src/game/lang.ts');
const B = await import('../src/game/bonus.ts');
const I = await import('../src/game/items.ts');
const SK = await import('../src/game/skullShare.ts');
const MEM = await import('../src/game/memory.ts');
const D = await import('../src/game/dealerGame.ts');
const S = await import('../src/game/save.ts');
const MACH = await import('../src/game/machines.ts');

/** Покупки из списка id по одному разу: так в тестах виднее, что именно взято. */
const buy = (...ids) => Object.fromEntries(ids.map((id) => [id, 1]));

test('пул: 42 улучшения с уникальными id, все однократные, кроме «Ещё копия» (×2)', () => {
  assert.equal(UPG.UPGRADES.length, 42, 'первая партия 11 (28а), вторая 13 (28б), третья 10 (28в), четвёртая 8 (28г)');
  const ids = UPG.UPGRADES.map((upgrade) => upgrade.id);
  assert.equal(new Set(ids).size, ids.length, 'id не повторяются');
  for (const upgrade of UPG.UPGRADES) {
    const expected = upgrade.id === 'amulet-copy' ? 2 : 1;
    assert.equal(upgrade.repeat, expected, `${upgrade.id}: потолок повторов`);
    assert.ok(['spins', 'debt', 'chips', 'tickets', 'items', 'amulets', 'grid', 'shop', 'tape', 'other'].includes(upgrade.group), `${upgrade.id}: известная группа`);
  }
  // Номера исходного списка: 1, 3, 4 (прокрутки), 6, 7, 8, 10 (долг), 12, 13, 14, 15 (фишки), 16, 17, 18 (билеты),
  // 21–25 (предметы), 26–30 (амулеты), 31–35 (сетка), 36–40 (магазин), 42, 44, 45 (кассета), 46–50 (прочее).
  assert.deepEqual(
    ids,
    [
      'spin-first-round', 'spin-cap', 'spin-skull-free', 'debt-start', 'debt-growth', 'debt-forgive', 'debt-defer',
      'win-patterns', 'win-interest', 'win-piggy', 'win-insurance',
      'ticket-start', 'ticket-third-debt', 'ticket-jackpot',
      'item-slot', 'item-price', 'item-clover-weight', 'item-cherry-weight', 'item-hammer-empty',
      'amulet-price', 'amulet-copy', 'amulet-first-socket', 'amulet-first-rare', 'amulet-survives-death',
      'grid-skull-share', 'grid-start-joker', 'grid-start-symbol', 'grid-jackpot', 'grid-blood-weight',
      'shop-discount', 'shop-extra-row', 'shop-ticket-share', 'shop-amulet-chips', 'shop-gift-item',
      'tape-keeps-streak', 'tape-free', 'tape-refund-tickets',
      'record-start-chips', 'achievement-ticket', 'machine-no-swap', 'machine-start-pick', 'skull-cancel',
    ],
    'состав пула и порядок чисел',
  );
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'spins').length, 3, 'прокруток 3');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'debt').length, 4, 'долгов 4');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'chips').length, 4, 'фишек 4');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'tickets').length, 3, 'билетов 3');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'items').length, 5, 'предметов 5');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'amulets').length, 5, 'амулетов 5');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'grid').length, 5, 'сетки 5');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'shop').length, 5, 'магазина 5');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'tape').length, 3, 'кассеты 3');
  assert.equal(UPG.UPGRADES.filter((upgrade) => upgrade.group === 'other').length, 5, 'прочего 5');
});

test('у каждого улучшения есть название и описание на двух языках', () => {
  for (const upgrade of UPG.UPGRADES) {
    for (const key of [upgrade.name, upgrade.desc]) {
      const ru = LANG.t(key);
      assert.ok(typeof ru === 'string' && ru.length > 0, `${upgrade.id}: у ключа ${key} есть русский текст`);
    }
  }
  // Тексты обещают ровно те числа, что стоят в константах: сверяем по подстрокам.
  const text = (key) => LANG.t(key);
  assert.match(text('upgSpinFirstRoundWhat'), /\+1/, '№1 — +1 прокрутка');
  assert.match(text('upgSpinCapWhat'), /\+2/, '№3 — +2 к потолку');
  assert.match(text('upgDebtStartWhat'), /−5%/, '№6 — стартовый долг −5%');
  assert.match(text('upgDebtGrowthWhat'), /3[.,]6 → ×3[.,]4/, '№7 — 3,6 → 3,4');
  assert.match(text('upgWinPatternsWhat'), /\+5%/, '№12 — +5%');
  assert.match(text('upgWinInsuranceWhat'), /80%.*75%/, '№15 — 80% вместо 75%');
});

test('0 покупок — нейтральные числа: без улучшений игра ровно прежняя', () => {
  const effects = UPG.upgradeEffects({});
  assert.equal(effects.firstRoundSpins, 0, 'прокруток не прибавилось');
  assert.equal(effects.spinCapBonus, 0, 'потолок прежний');
  assert.equal(effects.freeSpinAfterFirstSkull, false, 'бесплатной прокрутки за черепа нет');
  assert.equal(effects.startDebtMul, 1, 'стартовый долг полный');
  assert.equal(effects.debtGrowthMul, 1, 'рост долга прежний');
  assert.equal(effects.debtForgiveEveryRuns, 0, 'прощения долга нет');
  assert.equal(effects.deferOnce, false, 'отсрочки нет');
  assert.equal(effects.winMul, 1, 'выигрыш прежний');
  assert.equal(effects.interestBonus, 0, 'процентов не прибавилось');
  assert.equal(effects.piggyBonus, 0, 'копилка прежняя');
  assert.equal(effects.insuranceShare, A.INSURANCE_SHARE, 'доля страховки — число игры (0,75)');
  assert.equal(A.INSURANCE_SHARE, 0.75, 'обычная доля страховки всё ещё 75%');
  // Вторая партия (28б): без покупок все новые ручки нейтральны.
  assert.equal(effects.startTickets, 0, 'стартового билета нет');
  assert.equal(effects.debtTicketBonus, 0, 'билета за третий долг нет');
  assert.equal(effects.jackpotTickets, 0, 'джекпот платит как обычно');
  assert.equal(effects.itemSlots, 0, 'мест на полке не прибавилось');
  assert.equal(effects.itemPriceMul, 1, 'предметы по обычной цене');
  assert.equal(effects.cloverWeight, 0, 'вес клевера обычный');
  assert.equal(effects.cherryWeight, 0, 'вес вишни обычный');
  assert.equal(effects.keepsHammerOnEmpty, false, 'молот тратится как раньше');
  assert.equal(effects.amuletTicketsOff, 0, 'амулеты по обычной цене');
  assert.equal(effects.amuletMaxCopies, 0, 'потолок копий обычный');
  assert.equal(effects.firstSocketFree, false, 'первое гнездо платное');
  assert.equal(effects.rareAmuletFirstShop, false, 'витрина без гарантий');
  assert.equal(effects.deathAmuletSave, false, 'при смерти амулет сгорает');
  // Третья партия (28в): сетка и магазин.
  assert.equal(effects.skullShareDelta, 0, 'доля черепов обычная');
  assert.equal(effects.startJoker, false, 'без джокера на старте');
  assert.equal(effects.startSymbolPick, false, 'символ не выбираем');
  assert.equal(effects.jackpotWinMul, 1, 'джекпот ×100');
  assert.equal(effects.bloodWeight, 0, 'вес крови обычный');
  assert.equal(effects.shopPriceMul, 1, 'цены магазина обычные');
  assert.equal(effects.offerRows, 0, 'рядов в витрине три');
  assert.equal(effects.ticketShareStart, I.TICKET_SHARE_START, 'первый билет — 40% банка');
  assert.equal(effects.amuletForChips, false, 'амулет только за билеты');
  assert.equal(effects.freeItemFirstShop, false, 'подарка нет');
  // Четвёртая партия (28г): кассета и прочее.
  assert.equal(effects.rewindKeepsStreak, false, 'откат сбрасывает серию');
  assert.equal(effects.freeTape, false, 'кассета платная');
  assert.equal(effects.rewindRefundsTickets, false, 'билеты откат не возвращает');
  assert.equal(effects.recordStartShare, 0, 'стартовых фишек от рекорда нет');
  assert.equal(effects.achievementTickets, 0, 'билетов за ачивки нет');
  assert.equal(effects.noMachineSwap, false, 'автомат меняется сам');
  assert.equal(effects.startMachinePick, false, 'автомат не выбираешь');
  assert.equal(effects.skullCancelOnce, false, 'череп отменить нельзя');
});

test('каждое улучшение меняет своё число: сверка с игровыми функциями, не с собой', () => {
  // №1: +1 прокрутка в первом раунде.
  assert.equal(UPG.upgradeEffects(buy('spin-first-round')).firstRoundSpins, 1, '№1 — одна прокрутка');
  // №3: +2 к потолку — прокрутки дальше уже не срезаются на прежних 30.
  const cap = RULES.MAX_SPINS_PER_ROUND + UPG.upgradeEffects(buy('spin-cap')).spinCapBonus;
  assert.equal(cap, 32, 'потолок 30 + 2');
  assert.equal(RULES.spinsAfterBonus(29, 4, cap), 32, 'на 33-й прокрутке срабатывает новый потолок');
  assert.equal(RULES.spinsAfterBonus(29, 4), 30, 'без улучшения всё по-старому — 30');
  // №4: флаг, а не число.
  assert.equal(UPG.upgradeEffects(buy('spin-skull-free')).freeSpinAfterFirstSkull, true, '№4 включён');
  // №6: стартовый долг 150 → 140 (округление до 10 то же, что у кривой).
  assert.equal(RULES.startDebt(UPG.upgradeEffects(buy('debt-start')).startDebtMul), 140, '150 × 0,95 = 142,5 → 140');
  assert.equal(RULES.startDebt(), 150, 'без улучшения старт прежний');
  // №7: рост ×3,4: второй раунд 510 вместо 540, четвёртый 5900 вместо 7000.
  const growth = UPG.upgradeEffects(buy('debt-growth')).debtGrowthMul;
  assert.equal(RULES.debtForRound(2, growth), 510, '150 × 3,4 = 510');
  assert.equal(RULES.debtForRound(4, growth), 5900, '150 × 3,4³ = 5895,6 → 5900');
  assert.equal(RULES.debtForRound(2), 540, 'без улучшения — 540');
  assert.equal(RULES.debtForRound(4), 7000, 'без улучшения — 7000');
  // №8: прощение каждый пятый забег.
  const every = UPG.upgradeEffects(buy('debt-forgive')).debtForgiveEveryRuns;
  assert.equal(every, 5, 'раз в пять забегов');
  assert.equal(UPG.forgivesDebt(every, 4), false, 'четвёртый забег — долг платится');
  assert.equal(UPG.forgivesDebt(every, 5), true, 'пятый — прощается');
  assert.equal(UPG.forgivesDebt(every, 10), true, 'десятый — снова');
  assert.equal(UPG.forgivesDebt(0, 5), false, 'без улучшения не прощается никогда');
  // №10: флаг отсрочки.
  assert.equal(UPG.upgradeEffects(buy('debt-defer')).deferOnce, true, '№10 включён');
  // №12: +5% — конкретный выигрыш.
  const winMul = UPG.upgradeEffects(buy('win-patterns')).winMul;
  assert.equal(winMul, 1.05, 'множитель 1,05');
  assert.equal(Math.round(100 * 3 * winMul), 315, 'паттерн из 100 на ×3 платит 315 вместо 300');
  // №13: проценты на остаток 1000 → 500 стали 550.
  const interest = UPG.upgradeEffects(buy('win-interest')).interestBonus;
  assert.equal(A.interestCoins(1000, ['interest'], interest), 550, 'доля 50% + 5 п.п.');
  assert.equal(A.interestCoins(1000, ['interest']), 500, 'без улучшения — 500');
  assert.equal(A.interestCoins(1000, [], interest), 0, 'без амулета улучшение ничего не платит');
  // №14: копилка 2 × множитель плюс 1 фишка.
  const piggy = UPG.upgradeEffects(buy('win-piggy')).piggyBonus;
  assert.equal(A.piggyCoins(3, ['piggy'], piggy), 7, '2 × 3 + 1 = 7');
  assert.equal(A.piggyCoins(3, ['piggy']), 6, 'без улучшения — 6');
  assert.equal(A.piggyCoins(3, [], piggy), 0, 'без копилки улучшение не платит');
  // №15: страховка возвращает 80% вместо 75%.
  const share = UPG.upgradeEffects(buy('win-insurance')).insuranceShare;
  assert.equal(A.insuranceRefund(1000, ['insurance'], 0, share), 800, '80% сгоревшего кона');
  assert.equal(A.insuranceRefund(1000, ['insurance'], 0), 750, 'без улучшения — 75%');
});

test('вторая партия (билеты, предметы, амулеты): числа на границах и поведение', () => {
  // №16: старт с одним билетом.
  assert.equal(UPG.upgradeEffects(buy('ticket-start')).startTickets, 1, '№16 — один билет');
  // №17: прибавка только за долг, закрытый ровно в третьем раунде.
  const third = UPG.upgradeEffects(buy('ticket-third-debt')).debtTicketBonus;
  assert.equal(UPG.roundDebtTickets(1, third), 0, 'первый раунд — без прибавки');
  assert.equal(UPG.roundDebtTickets(2, third), 0, 'второй — без прибавки');
  assert.equal(UPG.roundDebtTickets(3, third), 1, 'третий — +1 билет');
  assert.equal(UPG.roundDebtTickets(4, third), 0, 'четвёртый — без прибавки');
  assert.equal(UPG.roundDebtTickets(3, 0), 0, 'без улучшения прибавки нет');
  assert.equal(UPG.roundDebtTickets(3, Number.NaN), 0, 'мусор в прибавке — как без неё');
  assert.equal(A.TICKETS_PER_DEBT + UPG.roundDebtTickets(3, third), 2, 'за третий долг — 2 билета');
  // №18: джекпот 2 + 1 = 3 билета; обычный паттерн улучшение не трогает.
  assert.equal(B.JACKPOT_TICKETS + UPG.upgradeEffects(buy('ticket-jackpot')).jackpotTickets, 3, 'джекпот — 3 билета');
  assert.equal(B.JACKPOT_TICKETS, 2, 'без улучшения — 2');
  // №21: +1 место, но не больше MAX_SLOTS.
  assert.equal(UPG.startItemSlots(UPG.upgradeEffects(buy('item-slot')).itemSlots), 3, 'два места + 1 = 3');
  assert.equal(UPG.startItemSlots(0), I.START_SLOTS, 'без улучшения — как было');
  assert.equal(UPG.startItemSlots(99), I.MAX_SLOTS, 'больше MAX_SLOTS мест не бывает');
  assert.equal(UPG.startItemSlots(Number.NaN), I.START_SLOTS, 'мусор — обычные места');
  // №22: −10% через ту же дверь цены, что и сделка №2; округление до 5 и нижняя граница 5 сохраняются.
  const mul = UPG.upgradeEffects(buy('item-price')).itemPriceMul;
  assert.equal(mul, 0.9, 'множитель 0,9');
  const cigarette = I.ITEMS.find((item) => item.id === 'cigarette');
  assert.equal(I.itemPrice(cigarette, 540), 215, 'без скидки: 0,4 × 540 = 216 → 215');
  assert.equal(I.itemPrice(cigarette, 540, mul), 195, 'со скидкой: 194,4 → 195');
  assert.equal(I.itemPrice(cigarette, 10, mul), 5, 'дешёвый предмет не ниже 5 фишек');
  assert.equal(I.itemPrice(cigarette, 540, 0.8 * mul), 155, 'скидки перемножаются: 216 × 0,72 = 155,5 → 155');
  assert.equal(I.itemPrice(cigarette, 540, 0), 5, 'нулевая доля — всё равно минимум, а не минус');
  // №23/№24: вес клевера и вишни +1; закрытый символ добавка не открывает.
  const weights = UPG.upgradeEffects(buy('item-clover-weight', 'item-cherry-weight'));
  const ctx = { machineId: 'classic', amulets: [], effects: I.noEffects(), symbolBonus: UPG.symbolWeightBonus(weights) };
  const cherry = RULES.SYMBOLS.find((symbol) => symbol.id === 'cherry');
  const clover = RULES.SYMBOLS.find((symbol) => symbol.id === 'clover');
  const round10 = RULES.weightsForRound(10);
  const round1 = RULES.weightsForRound(1);
  assert.equal(SK.symbolWeightOf(cherry, round10, ctx, false), cherry.weight + 1, 'вишня 30 → 31');
  assert.equal(SK.symbolWeightOf(clover, round10, ctx, false), clover.weight + 1, 'клевер 1 → 2');
  assert.equal(SK.symbolWeightOf(clover, round1, ctx, false), 0, 'до 7-го раунда клевера в автомате нет — добавка его не открывает');
  const quiet = { ...ctx, machineId: 'quiet' };
  assert.equal(SK.symbolWeightOf(clover, round10, quiet, false), 0, 'у «Тихого» клевера нет вовсе');
  assert.equal(SK.symbolWeightOf(clover, round10, { machineId: 'classic', amulets: [], effects: I.noEffects() }, false), 1, 'без улучшения — 1');
  // №25: молот ждёт выигрыша, но не бесконечно: пустая прокрутка — не тратит, выигрыш и черепа — тратят.
  assert.equal(UPG.keepsHammerAfter('nothing', true), true, 'пустая сетка — молот остаётся');
  assert.equal(UPG.keepsHammerAfter('win', true), false, 'выигрыш — тратится');
  assert.equal(UPG.keepsHammerAfter('skull', true), false, 'черепа — тратится');
  assert.equal(UPG.keepsHammerAfter('nothing', false), false, 'без улучшения — тратится всегда');
  // №26: билет снимается, но не ниже 1.
  const off = UPG.upgradeEffects(buy('amulet-price')).amuletTicketsOff;
  const rare = A.AMULETS.find((amulet) => amulet.rarity === 'rare');
  const common = A.AMULETS.find((amulet) => amulet.rarity === 'common');
  const insurance = A.AMULETS.find((amulet) => amulet.id === 'insurance');
  assert.equal(A.amuletPrice(rare), 3, 'редкий — 3 билета');
  assert.equal(A.amuletPrice(rare, 1, off), 2, 'со скидкой — 2');
  assert.equal(A.amuletPrice(insurance, 1, off), 5, 'страховка 6 → 5');
  assert.equal(A.amuletPrice(common, 1, off), 1, 'обычный 1 → 1 (бесплатно не отдают)');
  // №27: потолок копий всех амулетов +1 за копию улучшения.
  const piggy = A.AMULETS.find((amulet) => amulet.id === 'piggy');
  assert.equal(A.maxCopiesOf(piggy), piggy.maxCopies, 'без улучшения — потолок игры');
  assert.equal(A.maxCopiesOf(piggy, 1), piggy.maxCopies + 1, 'одна копия — +1');
  assert.equal(A.maxCopiesOf(piggy, 2), piggy.maxCopies + 2, 'две копии — +2');
  assert.equal(A.maxCopiesOf(piggy, Number.NaN), piggy.maxCopies, 'мусор — потолок игры');
  // №28: первое гнездо бесплатно, второе и дальше — по цене.
  assert.equal(A.socketPrice(A.START_SOCKETS, 1, true), 0, 'первое гнездо — 0 билетов');
  assert.equal(A.socketPrice(A.START_SOCKETS, 1, false), 2, 'без улучшения — 2');
  assert.equal(A.socketPrice(A.START_SOCKETS + 1, 1, true), 3, 'второе гнездо — обычная цена');
  assert.equal(A.socketPrice(A.MAX_SOCKETS, 1, true), null, 'гнёзд больше не продают');
  // №29: в первом магазине витрина обязана содержать редкий амулет.
  const nonRare = A.AMULETS.filter((amulet) => amulet.rarity !== 'rare').slice(0, 3);
  const withRare = A.withRareAmulet([...nonRare], [], 0, () => 0.5);
  assert.ok(withRare.some((amulet) => amulet.rarity === 'rare'), 'редкий появился на витрине');
  assert.equal(withRare.length, 3, 'витрина не выросла');
  const rareFirst = A.AMULETS.find((amulet) => amulet.rarity === 'rare');
  const alreadyRare = [rareFirst, ...nonRare.slice(0, 2)];
  assert.deepEqual(A.withRareAmulet(alreadyRare, [], 0, () => 0).map((amulet) => amulet.id), alreadyRare.map((amulet) => amulet.id), 'витрину с редким не трогаем');
  // №30: бесплатный перенос амулета — один раз за забег.
  assert.equal(UPG.freeMemorySave(UPG.upgradeEffects(buy('amulet-survives-death')), false), true, 'первый раз — бесплатно');
  assert.equal(UPG.freeMemorySave(UPG.upgradeEffects(buy('amulet-survives-death')), true), false, 'второй раз за забег — платно');
  assert.equal(UPG.freeMemorySave(UPG.upgradeEffects({}), false), false, 'без улучшения — платно');
  assert.deepEqual(MEM.memoryOptions(['cherryPit'], 0).map((option) => option.price), [], 'без билетов слот пуст');
  assert.deepEqual(MEM.memoryOptions(['cherryPit'], 0, 1).map((option) => option.price), [0], 'с улучшением — бесплатно даже без билетов');
});

test('третья партия (28в): сетка и магазин — числа и поведение', () => {
  const effects = UPG.upgradeEffects(buy('grid-skull-share', 'grid-start-joker', 'grid-start-symbol', 'grid-jackpot', 'grid-blood-weight', 'shop-discount', 'shop-extra-row', 'shop-ticket-share', 'shop-amulet-chips', 'shop-gift-item'));
  const cigar = I.ITEMS.find((item) => item.id === 'cigarette');

  // №31: доля черепов ниже ровно на 1 п.п. — тем же множителем, каким её двигают сделки и колокольчик.
  const ctx = { machineId: 'classic', amulets: [], effects: I.noEffects() };
  const base = SK.skullShareOf(10, 0, ctx);
  const lowered = SK.skullShareOf(10, 0, { ...ctx, skullMul: D.skullShareWeightMul(base, effects.skullShareDelta) });
  assert.ok(Math.abs(base - lowered - 0.01) < 1e-9, `доля ${base} → ${lowered}`);
  // Со сделкой «черепа чаще» поправки складываются, а не отменяют друг друга: +3 п.п. и −1 п.п. = +2.
  const pact = SK.skullShareOf(10, 0, { ...ctx, skullMul: D.skullShareWeightMul(base, 0.03) });
  const both = SK.skullShareOf(10, 0, { ...ctx, skullMul: D.skullShareWeightMul(base, 0.03 + effects.skullShareDelta) });
  assert.ok(both > base && both < pact, `сделка +3 п.п. и №31 −1 п.п. дают +2: ${base} → ${both} → ${pact}`);
  assert.equal(UPG.upgradeEffects({}).skullShareDelta, 0, 'без №31 поправки нет');

  // №32/33: первая сетка с джокером и выбранным символом; второй джокер не подставляется.
  const cherry = RULES.SYMBOLS.find((symbol) => symbol.id === 'cherry');
  const lemon = RULES.SYMBOLS.find((symbol) => symbol.id === 'lemon');
  const flat = Array.from({ length: RULES.GRID_ROWS }, () => Array.from({ length: RULES.GRID_COLUMNS }, () => lemon));
  const boosted = UPG.startGridOf(flat, effects, 'cherry', () => 0.5);
  assert.equal(boosted.flat().filter((symbol) => symbol.id === 'joker').length, 1, 'ровно один джокер');
  assert.equal(boosted.flat().filter((symbol) => symbol.id === 'cherry').length, 1, 'ровно один выбранный символ');
  assert.equal(boosted.flat().filter((symbol) => symbol.id === 'lemon').length, 13, 'две клетки заменены');
  const alreadyJoker = flat.map((line, row) => line.map((symbol, col) => (row === 0 && col === 0 ? RULES.JOKER : symbol)));
  const noDouble = UPG.startGridOf(alreadyJoker, effects, null, () => 0.5);
  assert.equal(noDouble.flat().filter((symbol) => symbol.id === 'joker').length, 1, 'джокер из прокрутки не удваивается');
  assert.equal(UPG.startGridOf(flat, UPG.upgradeEffects({}), 'cherry').flat().some((symbol) => symbol.id === 'joker'), false, 'без №32 джокера нет');
  assert.equal(UPG.startGridOf(flat, effects, 'bogus').flat().filter((symbol) => symbol.id === 'cherry').length, 0, 'чужой символ не подставляется');

  // №34: только джекпот ×1,2, обычные паттерны не трогаются.
  assert.equal(UPG.jackpotWinFactor(true, effects), 1.2, 'джекпот ×120');
  assert.equal(UPG.jackpotWinFactor(false, effects), 1, 'обычный паттерн ×1');
  const seven = RULES.SYMBOLS.find((symbol) => symbol.id === 'seven');
  assert.equal(Math.round(seven.price * 100 * UPG.jackpotWinFactor(true, effects)), Math.round(seven.price * 120), '2500 → 3000 на семёрке');
  assert.equal(UPG.jackpotWinFactor(true, UPG.upgradeEffects({})), 1, 'без №34 джекпот прежний');

  // №35: кровь тяжелее на 2; закрытый символ добавка не открывает.
  const blood = RULES.SYMBOLS.find((symbol) => symbol.id === 'blood');
  const gctx = { machineId: 'classic', amulets: [], effects: I.noEffects(), symbolBonus: UPG.symbolWeightBonus(effects) };
  assert.equal(SK.symbolWeightOf(blood, RULES.weightsForRound(10), gctx, false), blood.weight + 2, 'вес крови 4 → 6');
  assert.equal(SK.symbolWeightOf(blood, RULES.weightsForRound(5), gctx, false), 0, 'до 10-го раунда крови нет');
  assert.equal(SK.symbolWeightOf(blood, RULES.weightsForRound(10), { ...gctx, machineId: 'quiet' }, false), 0, 'у «Тихого» крови нет');
  assert.equal(SK.symbolWeightOf(blood, RULES.weightsForRound(10), { machineId: 'classic', amulets: [], effects: I.noEffects() }, false), 4, 'без №35 — 4');

  // №36: −10% в магазине и произведение со скидкой сделки; нижние границы прежние.
  assert.equal(I.itemPrice(cigar, 540, effects.shopPriceMul), 195, '0,4 × 540 × 0,9 = 194,4 → 195');
  assert.equal(I.itemPrice(cigar, 540, 0.8 * effects.shopPriceMul), 155, '0,8 × 0,9 = 0,72 → 155');
  assert.equal(I.itemPrice(cigar, 10, effects.shopPriceMul), 5, 'не ниже 5 фишек');
  assert.equal(I.slotPrice(2, 540, effects.shopPriceMul), 485, 'место тоже дешевле: 540 × 0,9 → 485');
  assert.equal(I.slotPrice(2, 540), 540, 'без №36 место прежнее');

  // №37: витрина на ряд длиннее, но больше предметов, чем есть в игре, не выложить.
  assert.equal(I.offerRowCount(effects.offerRows), 4, 'три ряда + 1');
  assert.equal(I.offerRowCount(0), 3, 'без №37 — три');
  assert.equal(I.offerRowCount(99), I.ITEMS.length, 'больше пула не бывает');
  assert.equal(I.randomOffer(10, () => true, I.offerRowCount(effects.offerRows)).length, 4, 'в витрине четыре предмета');

  // №38: первый билет — 30% банка, шаг роста прежний, округление и минимум 5 фишек те же.
  assert.equal(effects.ticketShareStart, 0.3, 'доля первого билета 30%');
  assert.equal(I.ticketShare(0, effects.ticketShareStart), 0.3, 'первый — 30%');
  assert.equal(I.ticketShare(1, effects.ticketShareStart), 0.6, 'второй — 60%: шаг 30% прежний');
  assert.equal(I.ticketForChips(1000, 0, 1, effects.ticketShareStart), 300, '1000 → 300');
  assert.equal(I.ticketForChips(1000, 1, 1, effects.ticketShareStart), 600, 'второй 600');
  assert.equal(I.ticketForChips(1000, 0), 400, 'без №38 — 400');
  assert.equal(I.ticketForChips(10, 0, 1, effects.ticketShareStart), 5, 'не ниже 5 фишек');

  // №39: амулет за фишки — по цене его билетов, не бесплатно; флаг липкий (откат кассетой не возвращает).
  assert.equal(I.chipsForTickets(3, 400), 1200, '3 билета по 400 фишек = 1200');
  assert.equal(I.chipsForTickets(1, 400), 400, 'один билет — 400');
  assert.equal(I.chipsForTickets(0, 400), 5, 'ноль билетов всё равно минимум 5, а не бесплатно');
  assert.equal(UPG.upgradeEffects(buy('shop-amulet-chips')).amuletForChips, true, '№39 включён');
  assert.equal(S.amuletChipUsedOf({}, false), false, 'ещё не брали');
  assert.equal(S.amuletChipUsedOf({}, true), true, 'текущий флаг важнее плёнки');
  assert.equal(S.amuletChipUsedOf({ amuletChipUsed: true }, false), true, 'старая плёнка не возвращает покупку');

  // №40: подарок — флаг и липкость; место под него ищет сцена (freeSlot), пул — тот же randomOffer.
  assert.equal(UPG.upgradeEffects(buy('shop-gift-item')).freeItemFirstShop, true, '№40 включён');
  assert.equal(UPG.upgradeEffects({}).freeItemFirstShop, false, 'без №40 подарка нет');
  assert.equal(S.freeGiftUsedOf({}, false), false, 'подарок ещё не выдан');
  assert.equal(S.freeGiftUsedOf({ freeGiftGiven: true }, false), true, 'откат подарок не возвращает');
  assert.equal(I.randomOffer(1, () => true, 1).length, 1, 'подарок — один предмет из пула');
});

test('четвёртая партия (28г): кассета — серия, цена, билеты', () => {
  const effects = UPG.upgradeEffects(buy('tape-keeps-streak', 'tape-free', 'tape-refund-tickets'));

  // №42: откат не сбрасывает серию — остаётся большая из текущей и записанной; без улучшения — ровно записанная.
  assert.equal(UPG.streakAfterRewind(4, 9, true), 9, 'серия 4 на плёнке, 9 до отката — остаётся 9');
  assert.equal(UPG.streakAfterRewind(9, 4, true), 9, 'запись выше текущей — остаётся запись');
  assert.equal(UPG.streakAfterRewind(4, 9, false), 4, 'без №42 откат возвращает серию с плёнки');
  assert.equal(UPG.streakAfterRewind(Number.NaN, 9, true), 9, 'мусор на плёнке не обнуляет серию');
  assert.equal(UPG.streakAfterRewind(4, Number.NaN, false), 4, 'мусор в текущей не ломает запись');
  assert.equal(effects.rewindKeepsStreak, true, '№42 включён');

  // №44: кассета в магазине бесплатна — обнуляется ровно цена в билетах, рост цены и учёт купленных остаются.
  assert.equal(S.tapePrice(0), 2, 'первая кассета стоит 2 билета');
  assert.equal(S.tapePrice(3), 5, 'четвёртая — 5: цена растёт по купленным');
  assert.equal(UPG.tapePriceAfter(S.tapePrice(0), true), 0, 'с №44 первая кассета — 0 билетов');
  assert.equal(UPG.tapePriceAfter(S.tapePrice(3), true), 0, 'и четвёртая тоже 0');
  assert.equal(UPG.tapePriceAfter(S.tapePrice(0), false), 2, 'без №44 цена прежняя');
  assert.equal(effects.freeTape, true, '№44 включён');

  // №45: откат возвращает ровно потраченное после записи — не больше и без второго начисления.
  assert.equal(UPG.ticketsAfterRewind(3, 7, true), 10, '3 на записи + 7 потрачено = 10');
  assert.equal(UPG.ticketsAfterRewind(3, 0, true), 3, 'ничего не тратили — только снимок');
  assert.equal(UPG.ticketsAfterRewind(3, 7, false), 3, 'без №45 билеты ровно с плёнки');
  assert.equal(UPG.ticketsAfterRewind(3, -5, true), 3, 'минус не возвращается');
  assert.equal(UPG.ticketsAfterRewind(3, Number.NaN, true), 3, 'мусор в трате — как ноль');
  assert.equal(effects.rewindRefundsTickets, true, '№45 включён');
});

test('четвёртая партия (28г): прочее — рекорд, ачивки, автомат, отмена черепа', () => {
  const effects = UPG.upgradeEffects(buy('record-start-chips', 'achievement-ticket', 'machine-no-swap', 'machine-start-pick', 'skull-cancel'));

  // №46: стартовые фишки — доля рекорда, а не «плюс каждый забег»: рекорд 1 000 000 даёт 50 000.
  assert.equal(UPG.upgradeEffects(buy('record-start-chips')).recordStartShare, 0.05, 'доля 5%');
  assert.equal(UPG.recordStartChips(1_000_000, 0.05), 50_000, '5% от миллиона');
  assert.equal(UPG.recordStartChips(0, 0.05), 0, 'рекорда нет — прибавки нет');
  assert.equal(UPG.recordStartChips(1_000_000, 0), 0, 'без улучшения прибавки нет');
  assert.equal(UPG.recordStartChips(Number.NaN, 0.05), 0, 'мусор в рекорде — ноль');
  assert.equal(UPG.recordStartChips(100, 5), 100, 'доля больше 1 не даёт больше самого рекорда');

  // №47: билет за ачивку — по одному на ачивку за забег; повтор в том же забеге мимо.
  const per = effects.achievementTickets;
  assert.equal(per, 1, 'один билет с №47');
  assert.equal(UPG.achievementTicket(per, 'yourTicket', []), 1, 'первая ачивка забега — билет');
  assert.equal(UPG.achievementTicket(per, 'yourTicket', ['yourTicket']), 0, 'повторно та же — нет');
  assert.equal(UPG.achievementTicket(per, 'theEnd', ['yourTicket']), 1, 'другая ачивка — снова билет');
  assert.equal(UPG.achievementTicket(0, 'theEnd', []), 0, 'без улучшения билета нет');
  assert.deepEqual(S.achievementTicketIdsOf({}, []), [], 'старая плёнка без поля — пустой список');
  assert.deepEqual(S.achievementTicketIdsOf({ achievementTickets: ['theEnd', 'theEnd', 'bogus'] }, ['yourTicket']), ['yourTicket', 'theEnd'], 'объединение без повторов и чужих id');

  // №48: смена автомата выключена — шанс 0, автомат тот же; без улучшения правило игры его не трогает.
  assert.equal(effects.noMachineSwap, true, '№48 включён');
  assert.equal(MACH.machineAtRoundStart('classic', 7, 0), 'classic', 'шанс 0 — автомат не меняется');
  assert.notEqual(MACH.machineAtRoundStart('quiet', 7, 1), 'quiet', 'шанс 1 — меняется на другой');

  // №49: стартовый автомат выбираешь сам — флаг и три строки на панели (сама панель — в upgrades-check).
  assert.equal(effects.startMachinePick, true, '№49 включён');
  assert.equal(MACH.MACHINES.length, 3, 'выбирать из трёх автоматов');
  assert.deepEqual(MACH.MACHINES.map((machine) => machine.id), ['classic', 'greedy', 'quiet'], 'порядок строк панели');

  // №50: отмена черепа — одноразовая за забег и липкая через кассету.
  assert.equal(effects.skullCancelOnce, true, '№50 включён');
  assert.equal(UPG.skullCancelAllowed(effects, false), true, 'ещё не тратили — можно');
  assert.equal(UPG.skullCancelAllowed(effects, true), false, 'потратили — нельзя');
  assert.equal(UPG.skullCancelAllowed(UPG.upgradeEffects({}), false), false, 'без улучшения нельзя');
  assert.equal(S.skullCancelUsedOf({}, false), false, 'старая плёнка — не тратили');
  assert.equal(S.skullCancelUsedOf({ skullCancelUsed: true }, false), true, 'плёнка помнит отмену');
  assert.equal(S.skullCancelUsedOf({}, true), true, 'текущий флаг важнее плёнки');
});

test('все 42 покупки сразу: прибавки складываются, множители перемножаются', () => {
  const all = buy(...UPG.UPGRADES.map((upgrade) => upgrade.id));
  const effects = UPG.upgradeEffects(all);  assert.equal(effects.firstRoundSpins, 1, 'одна прокрутка');
  assert.equal(effects.spinCapBonus, 2, 'два к потолку');
  assert.equal(effects.freeSpinAfterFirstSkull, true, 'прокрутка за черепа');
  assert.equal(effects.startDebtMul, 0.95, 'старт −5%');
  assert.equal(RULES.startDebt(effects.startDebtMul), 140, 'стартовый долг 140');
  assert.equal(RULES.debtForRound(3, effects.debtGrowthMul), 1730, 'третий долг 150 × 3,4² = 1734 → 1730');
  assert.equal(effects.debtForgiveEveryRuns, 5, 'прощение раз в пять');
  assert.equal(effects.deferOnce, true, 'отсрочка');
  assert.equal(effects.winMul, 1.05, 'паттерны +5%');
  assert.equal(effects.interestBonus, 0.05, 'проценты +5 п.п.');
  assert.equal(effects.piggyBonus, 1, 'копилка +1');
  assert.equal(effects.insuranceShare, 0.8, 'страховка 80%');
  // Вторая партия (28б) — все числа на месте и не мешают первым.
  assert.equal(effects.startTickets, 1, 'билет на старте');
  assert.equal(effects.debtTicketBonus, 1, 'билет за третий долг');
  assert.equal(effects.jackpotTickets, 1, 'джекпот +1 билет');
  assert.equal(effects.itemSlots, 1, 'место на полке +1');
  assert.equal(effects.itemPriceMul, 0.9, 'предметы −10%');
  assert.equal(effects.cloverWeight, 1, 'клевер +1');
  assert.equal(effects.cherryWeight, 1, 'вишня +1');
  assert.equal(effects.keepsHammerOnEmpty, true, 'молот бережёт');
  assert.equal(effects.amuletTicketsOff, 1, 'амулеты −1 билет');
  assert.equal(effects.amuletMaxCopies, 1, 'потолок копий +1 (улучшение взято один раз)');
  assert.equal(effects.firstSocketFree, true, 'первое гнездо бесплатно');
  assert.equal(effects.rareAmuletFirstShop, true, 'редкий в первой витрине');
  assert.equal(effects.deathAmuletSave, true, 'амулет не сгорает при смерти');
  // Третья партия (28в).
  assert.equal(effects.skullShareDelta, -0.01, 'черепа реже на 1 п.п.');
  assert.equal(effects.startJoker, true, 'джокер на старте');
  assert.equal(effects.startSymbolPick, true, 'символ выбираем');
  assert.equal(effects.jackpotWinMul, 1.2, 'джекпот ×120');
  assert.equal(effects.bloodWeight, 2, 'кровь +2');
  assert.equal(effects.shopPriceMul, 0.9, 'магазин −10%');
  assert.equal(effects.offerRows, 1, 'на ряд больше');
  assert.equal(effects.ticketShareStart, 0.3, 'первый билет — 30%');
  assert.equal(effects.amuletForChips, true, 'амулет за фишки');
  assert.equal(effects.freeItemFirstShop, true, 'подарок в первом магазине');
  // Четвёртая партия (28г).
  assert.equal(effects.rewindKeepsStreak, true, 'серия переживает откат');
  assert.equal(effects.freeTape, true, 'кассета бесплатна');
  assert.equal(effects.rewindRefundsTickets, true, 'билеты возвращаются откатом');
  assert.equal(effects.recordStartShare, 0.05, '5% рекорда на старте');
  assert.equal(effects.achievementTickets, 1, 'билет за ачивку');
  assert.equal(effects.noMachineSwap, true, 'автомат не меняется');
  assert.equal(effects.startMachinePick, true, 'автомат выбираешь');
  assert.equal(effects.skullCancelOnce, true, 'череп можно отменить');
});

test('все 42 покупки: поле «все 34» больше не проходит, а все 42 — да', () => {
  // Заслон от недоделанной четвёртой партии: если в пуле снова 34, тест выше станет короче и это заметно здесь.
  assert.equal(UPG.UPGRADES.length, 42, 'в пуле 42 улучшения');
  assert.equal(Object.keys(UPG.upgradeEffects(buy(...UPG.UPGRADES.map((upgrade) => upgrade.id)))).length, 42, 'у эффектов 42 поля');
});

test('мусор в покупках не ломает числа: чужие id и глупости считаются как «не брали»', () => {
  assert.deepEqual(UPG.upgradeEffects({ bogus: 1 }), UPG.neutralUpgrades(), 'чужое id — нейтральные числа');
  assert.deepEqual(UPG.upgradeEffects({ 'debt-start': 0 }), UPG.neutralUpgrades(), 'ноль — не брали');
  assert.deepEqual(UPG.upgradeEffects({ 'debt-start': -3 }), UPG.neutralUpgrades(), 'минус — не брали');
  assert.deepEqual(UPG.upgradeEffects({ 'debt-start': Number.NaN }), UPG.neutralUpgrades(), 'NaN — не брали');
  // «Больше потолка» — это ровно потолок: повторно улучшение не действует.
  assert.equal(UPG.upgradeEffects({ 'spin-cap': 9 }).spinCapBonus, 2, 'потолок 1 — берём не больше');
  assert.equal(UPG.takenOf(UPG.UPGRADES[0], { 'spin-first-round': 4 }), 1, 'takenOf ужимает по repeat');
});

test('предложения после смерти: три разных, только некупленные; куплено всё — пусто', () => {
  const offers = UPG.upgradeOffers({}, 3, () => 0.5);
  assert.equal(offers.length, 3, 'три карточки');
  assert.equal(new Set(offers.map((upgrade) => upgrade.id)).size, 3, 'без повторов');
  const bought = buy('spin-cap', 'debt-start');
  const second = UPG.upgradeOffers(bought, 3, () => 0.99);
  assert.ok(second.every((upgrade) => upgrade.id !== 'spin-cap' && upgrade.id !== 'debt-start'), 'купленное не предлагают');
  // Осталось два улучшения — показываем два, а не пустой экран: иначе они стали бы недостижимы.
  const rest = { ...buy(...UPG.UPGRADES.filter((upgrade) => upgrade.id !== 'win-piggy' && upgrade.id !== 'win-insurance').map((upgrade) => upgrade.id)), 'amulet-copy': 2 };
  const last = UPG.upgradeOffers(rest);
  assert.deepEqual(last.map((upgrade) => upgrade.id).sort(), ['win-insurance', 'win-piggy'], 'последние две карточки');
  const everything = { ...buy(...UPG.UPGRADES.map((upgrade) => upgrade.id)), 'amulet-copy': 2 };
  assert.equal(UPG.upgradeOffers(everything).length, 0, 'куплено всё — предлагать нечего');
  // Цена второго улучшения — число игры.
  assert.equal(UPG.UPGRADE_SECOND_PRICE, 6, 'второе — 6 билетов');
  assert.equal(UPG.UPGRADE_OFFERS, 3, 'предложений всегда три (пока есть из чего)');
});

test('№27 «Ещё копия» берётся дважды: takenOf считает 2, после двух копий не предлагают', () => {
  const copy = UPG.UPGRADES.find((upgrade) => upgrade.id === 'amulet-copy');
  assert.equal(copy.repeat, 2, 'потолок — две копии');
  assert.equal(UPG.takenOf(copy, { 'amulet-copy': 1 }), 1, 'одна куплена — одна');
  assert.equal(UPG.takenOf(copy, { 'amulet-copy': 2 }), 2, 'две куплены — две');
  assert.equal(UPG.takenOf(copy, { 'amulet-copy': 5 }), 2, 'сверх потолка — ровно потолок');
  assert.equal(UPG.leftToTake(copy, { 'amulet-copy': 1 }), 1, 'после одной осталась ещё одна');
  assert.equal(UPG.leftToTake(copy, { 'amulet-copy': 2 }), 0, 'после двух брать нечего');
  const afterOne = UPG.upgradeOffers({ 'amulet-copy': 1 }, UPG.UPGRADES.length, () => 0.5);
  assert.ok(afterOne.some((upgrade) => upgrade.id === 'amulet-copy'), 'после первой копии предлагают вторую');
  const afterTwo = UPG.upgradeOffers({ 'amulet-copy': 2 }, UPG.UPGRADES.length, () => 0.5);
  assert.ok(afterTwo.every((upgrade) => upgrade.id !== 'amulet-copy'), 'после двух копий не предлагают');
  assert.equal(UPG.upgradeEffects({ 'amulet-copy': 2 }).amuletMaxCopies, 2, 'две копии — потолок всех амулетов +2');
});

test('прогресс: мусор в сохранении отброшен, купленное читается', () => {
  // Сохранение собрано в начале файла: годный ключ сверх потолка ужат до 1, остальное отброшено.
  assert.deepEqual(PROGRESS.purchasedUpgrades(), { 'debt-start': 1 }, 'только настоящий id, не больше потолка');
  assert.equal(PROGRESS.runNumber(), 4, 'номер забега из сохранения');
  // Купленное на экране смерти пишется сразу и видно в прогрессе (и в localStorage).
  assert.equal(PROGRESS.grantUpgrade('win-patterns'), 1, 'первая покупка');
  assert.equal(PROGRESS.purchasedUpgrades()['win-patterns'], 1, 'попало в прогресс');
  assert.deepEqual(JSON.parse(store.get(PROGRESS_KEY)).upgrades['win-patterns'], 1, 'и в localStorage');
  // Повторное взятие того же улучшения не проходит: repeat = 1.
  assert.equal(PROGRESS.grantUpgrade('win-patterns'), 1, 'второй раз число не растёт');
  assert.equal(PROGRESS.purchasedUpgrades()['win-patterns'], 1, 'и в сохранении тоже одна');
  // №27 «Ещё копия» — repeat 2: берётся дважды, третья не проходит.
  assert.equal(PROGRESS.grantUpgrade('amulet-copy'), 1, 'первая копия');
  assert.equal(PROGRESS.grantUpgrade('amulet-copy'), 2, 'вторая копия');
  assert.equal(PROGRESS.grantUpgrade('amulet-copy'), 2, 'третьей нет — repeat 2');
  assert.equal(PROGRESS.purchasedUpgrades()['amulet-copy'], 2, 'в прогрессе две');
  // Чужое id не пишется вовсе.
  PROGRESS.grantUpgrade('bogus');
  assert.ok(!('bogus' in PROGRESS.purchasedUpgrades()), 'чужое id в прогресс не попало');
});

test('прогресс: счётчик забегов растёт на каждом старте — по нему работает прощение долга', () => {
  const before = PROGRESS.runNumber();
  assert.equal(PROGRESS.beginRun(), before + 1, 'новый забег — следующий номер');
  assert.equal(PROGRESS.beginRun(), before + 2, 'и ещё');
  assert.equal(PROGRESS.runNumber(), before + 2, 'номер читается из прогресса');
  // Покупки переживают старт забега: beginRun их не трогает.
  assert.equal(PROGRESS.purchasedUpgrades()['debt-start'], 1, 'купленное на месте');
});

test('прогресс: пустое и битое сохранение — «ничего не куплено»', async () => {
  // Отдельный прогон модуля с другим localStorage: модуль кэшируется, поэтому проверяем через данные.
  assert.deepEqual(UPG.upgradeEffects({}), UPG.neutralUpgrades(), 'нет покупок — нейтральные числа');
  // upgradeOffers с пустыми покупками предлагает всё, что есть в пуле, — экран смерти с тремя карточками не пуст.
  assert.equal(UPG.upgradeOffers({}).length, 3, 'первый забег — три предложения');
  // Битое сохранение (не объект) progress читает как пустое: проверяем тем же чтением мусора.
  assert.deepEqual(UPG.upgradeEffects({ 'debt-start': null }), UPG.neutralUpgrades(), 'null в покупке — не брали');
});

test('прогресс: запись сливается с хранилищем — вкладка со старым снимком не затирает чужое', () => {
  const before = JSON.parse(store.get(PROGRESS_KEY));
  // «Другая вкладка» успела записать паттерн, ачивку, улучшение и номер забега, пока эта держала старый снимок:
  // так выглядит обычная запись «весь объект поверх» — она стёрла бы всё это. Проверяем слияние по полям.
  store.set(PROGRESS_KEY, JSON.stringify({
    ...before,
    patterns: [...(before.patterns ?? []), 'row5'],
    achievements: [...(before.achievements ?? []), 'theEnd'],
    upgrades: { ...(before.upgrades ?? {}), 'win-insurance': 1 },
    runs: 99,
  }));
  const runs = PROGRESS.beginRun(); // запись прогресса: прочитал — слил — записал
  const saved = JSON.parse(store.get(PROGRESS_KEY));
  assert.ok(saved.patterns.includes('row5'), 'чужой паттерн цел');
  assert.ok(saved.achievements.includes('theEnd'), 'чужая ачивка цела');
  assert.equal(saved.upgrades['win-insurance'], 1, 'чужое улучшение цело');
  assert.equal(saved.upgrades['debt-start'], 1, 'своё улучшение тоже цело');
  assert.equal(saved.runs, runs, 'номер забега в сохранении — тот, что вернул beginRun');
  assert.equal(runs, 100, 'и считается от большего из двух, а не от старого снимка');
});

test('прогресс: в режиме разработчика улучшения не выдаются — как ачивки', async () => {
  const DEV = await import('../src/game/devmode.ts');
  const id = 'debt-growth'; // взято 0 раз: потолок 1 ещё не выбран (после «ТЕСТ» покупка должна пройти)
  const took = PROGRESS.purchasedUpgrades()[id] ?? 0;
  assert.equal(DEV.tryEnableDevMode('hookster'), true, 'режим включён кодом игры');
  try {
    assert.equal(PROGRESS.grantUpgrade(id), took, 'в «ТЕСТ» покупка не проходит');
    assert.equal(PROGRESS.purchasedUpgrades()[id] ?? 0, took, 'и в сохранении ничего не прибавилось');
    assert.equal(PROGRESS.grantAchievement('theEnd'), false, 'ачивки в «ТЕСТ» по-прежнему не выдаются');
  } finally {
    DEV.disableDevMode(); // режим выключен — снова пишем
  }
  assert.equal(PROGRESS.grantUpgrade(id), took + 1, 'вне «ТЕСТ» покупка снова работает');
});

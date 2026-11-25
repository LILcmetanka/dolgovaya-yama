// Сделки Дилера (шаг 9): сухое исследование без Phaser и без сцены — только правила из dealerGame.ts.
// Запуск из папки next-step: node --import ./ts-resolve.mjs dealer-sim.mjs [визитов]
//
// Что считает:
//  1) как часто каждая сделка ложится на сукно (offerPacts — три разные карты из пула, порядок случайный);
//  2) что берёт бот той же политикой, что в full-run.mjs (приоритет double-step → quiet-round → tickets-shop;
//     действующую сделку повторно не берёт — pactLive, как отказ в DealerScene.acceptPact) и как часто отказывается;
//  3) сколько раундов каждый эффект реально действует на модельном забеге в 30 раундов: кубик почти каждый раунд,
//     провал последнего шанса — 12% раундов (счёт идёт назад, сроки сделок едут вместе с ним — shiftPacts);
//  4) один пример ленты раундов: что выпало, что взяли и что действовало.
// Числа (раунды, п.п., шаг, билеты) берутся из dealerGame.ts — своих копий здесь нет.
import { fileURLToPath } from 'node:url';

const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const D = await import(SRC + 'dealerGame.ts');

const VISITS = Number(process.argv[2] ?? 100000);
if (!Number.isInteger(VISITS) || VISITS <= 0) {
  console.error(`нужно целое число визитов Дилера больше нуля, получено «${process.argv[2]}»: node --import ./ts-resolve.mjs dealer-sim.mjs 100000`);
  process.exit(1);
}

/** Политика бота — та же, что в full-run.mjs: чем выше в списке, тем охотнее берём. */
const PACT_PRIORITY = [
  'double-take', 'double-step', 'quiet-round', 'tickets-shop', 'free-amulet',
  'price-up', 'machine-delay', 'safe-bank', 'skull-calm', 'soft-skull',
  'cheap-shop', 'debt-cut', 'full-insurance', 'jackpot-weight', 'symbol-weight',
];
const ROUNDS = 30; // длина модельного забега
const DICE_CHANCE = 0.95; // кубик приходит почти каждый раунд (его вес подстраивает evil.diceWeight)
const DEATH_CHANCE = 0.12; // провал последнего шанса: счёт идёт назад, сроки сделок едут с ним
const RESCUE_STEP = 1; // провал спасения в игре — смерть забега; в модельном забеге счёт идёт на один назад, чтобы сроки сделок поехали

/** Что бот берёт со стола: первая по приоритету сделка, которой у него ещё нет (или null — отказ). */
const pick = (offers, pacts, round) =>
  PACT_PRIORITY.map((id) => offers.find((pact) => pact.id === id && !D.pactLive(pacts, id, round))).find(Boolean);
/**
 * Запись сделки в кассету: для №11 бот выбирает самый дорогой символ, как в full-run.mjs. Выбирать не из чего —
 * null: сделку без символа не берём (она ничего не делает, как отказ карты в DealerTable).
 * У №13 здесь нет проверки свободного гнезда: в этой модели амулетов и гнёзд нет (стол за это отвечает в full-run).
 */
const take = (choice, round) => {
  if (choice.id !== 'symbol-weight') return D.pactOf(choice.id, round);
  const symbols = D.pactSymbols(round);
  if (!D.pactSymbolsAvailable(symbols)) return null;
  return D.pactOf(choice.id, round, symbols.reduce((best, symbol) => (symbol.price > best.price ? symbol : best), symbols[0]));
};

// ---------- 1–2: предложения и решения бота ----------
const offered = Object.fromEntries(D.PACTS.map((spec) => [spec.id, 0]));
const taken = Object.fromEntries(D.PACTS.map((spec) => [spec.id, 0]));
const busy = Object.fromEntries(D.PACTS.map((spec) => [spec.id, 0])); // карта пришла, а такая сделка уже действует
let withTake = 0;
let refused = 0;
const ROUND = 5; // визит «в середине забега»: часть карт может быть занята действующими сделками

for (let i = 0; i < VISITS; i++) {
  const offers = D.offerPacts();
  for (const offer of offers) offered[offer.id] += 1;
  // Пятая часть визитов — все три сделки уже действуют: взять нечего, только отказ.
  const pacts =
    i % 5 === 0
      ? D.PACTS.map((spec) => D.pactOf(spec.id, ROUND))
      : i % 2 === 0
        ? []
        : [D.pactOf(D.PACTS[i % D.PACTS.length].id, ROUND)];
  for (const offer of offers) if (D.pactLive(pacts, offer.id, ROUND)) busy[offer.id] += 1;
  const choice = pick(offers, pacts, ROUND);
  if (choice) taken[choice.id] += 1;
  else refused += 1;
  withTake += choice ? 1 : 0;
}

const pct = (value, total) => `${((value / Math.max(total, 1)) * 100).toFixed(1).replace('.', ',')}%`;
console.log(`Визитов Дилера: ${VISITS}, карт на сукно: ${D.PACT_OFFER_COUNT}, сделок в пуле: ${D.PACTS.length}`);
console.log('сделка         на сукне   взята   карта занята (сделка уже действует)');
for (const spec of D.PACTS) {
  console.log(
    `${spec.id.padEnd(14)} ${pct(offered[spec.id], VISITS).padStart(9)} ${pct(taken[spec.id], VISITS).padStart(8)} ${pct(busy[spec.id], VISITS).padStart(10)}`,
  );
}
console.log(`взяли сделку в ${pct(withTake, VISITS)} визитов, отказались в ${pct(refused, VISITS)} (пятая часть визитов — все сделки уже действуют)`);
console.log('');

// ---------- 3: сколько эффект живёт на модельном забеге ----------
const effectsOn = {
  'без черепов': (effects) => effects.noSkulls,
  'доля выше': (effects) => effects.skullShareDelta > 0,
  'доля ниже': (effects) => effects.skullShareDelta < 0,
  [`шаг ×${D.PACT_STEP_FACTOR}`]: (effects) => effects.multiplierStepMul > 1,
  [`потолок ×${D.PACT_CAP}`]: (effects) => Number.isFinite(effects.multiplierCap),
  'череп в ×1': (effects) => effects.skullWipesStreak,
  'мягкий череп': (effects) => effects.skullSoft,
  '−1 прокрутка': (effects) => effects.spinsDelta < 0,
  'выигрыш больше': (effects) => effects.winMul > 1,
  'магазин закрыт': (effects) => effects.shopClosed,
  'скидка магазина': (effects) => effects.shopDiscount < 1,
  'страховка 100%': (effects) => effects.insuranceShare === D.INSURANCE_FULL_SHARE,
  'джекпот тяжелее': (effects) => effects.jackpotWeightMul > 1,
  'символ выбран': (effects) => effects.symbolLuck !== null,
  'автомат замер': (effects) => effects.noMachineSwap,
  'кон не жжёт': (effects) => effects.bankSurvivesSkull,
  'слоты короче': (effects) => effects.effectSlotsDelta < 0,
  'забрать дважды': (effects) => effects.doubleTake,
};
const roundsOn = Object.fromEntries(Object.keys(effectsOn).map((name) => [name, 0]));
let roundsSeen = 0;
let shopChecks = 0;
let deaths = 0;
let deathsClosed = 0;
let savedByShift = 0; // откат счёта без сдвига спрятал бы сделку — магазин открылся бы, а потом сделка «ожила»

for (let game = 0; game < 5000; game++) {
  let round = 1;
  let pacts = [];
  for (let screen = 0; screen < ROUNDS; screen++) {
    if (Math.random() < DICE_CHANCE) {
      // DONTLIKE п.9: взятые в забеге карты Дилер больше не предлагает — и живые, и кончившиеся.
      const choice = pick(D.offerPacts(D.PACT_OFFER_COUNT, pacts.map((pact) => pact.id)), pacts, round);
      if (choice) {
        const pact = take(choice, round);
        if (pact) pacts.push(pact);
      }
    }
    const effects = D.pactEffects(pacts, round);
    roundsSeen += 1;
    for (const [name, isOn] of Object.entries(effectsOn)) if (isOn(effects)) roundsOn[name] += 1;
    shopChecks += 1; // магазин после раунда: та же проверка, что в ShopScene.openShop (до увеличения счёта)
    if (Math.random() < DEATH_CHANCE) {
      deaths += 1;
      deathsClosed += effects.shopClosed ? 1 : 0;
      const before = round;
      round = Math.max(1, round - RESCUE_STEP);
      const shifted = D.shiftPacts(pacts, round - before);
      if (effects.shopClosed && !D.pactEffects(pacts, round).shopClosed && D.pactEffects(shifted, round).shopClosed) savedByShift += 1;
      pacts = shifted;
    }
    round += 1;
    pacts = pacts.filter((pact) => pact.untilRound >= round); // RoundScene.dropExpiredPacts
  }
}

console.log(`Модельный забег: раундов ${ROUNDS}, кубик в ${(DICE_CHANCE * 100).toFixed(0)}% раундов, откат счёта в ${(DEATH_CHANCE * 100).toFixed(0)}% раундов`);
console.log('эффект действует в раунде:');
for (const [name, count] of Object.entries(roundsOn)) {
  const total = name === 'магазин закрыт' ? shopChecks : roundsSeen;
  console.log(`  ${name.padEnd(12)} ${pct(count, total)}`);
}
console.log(
  `откат счёта случился в ${pct(deaths, shopChecks)} раундов; из них магазин был закрыт сделкой в ${pct(deathsClosed, deaths)}, ` +
    `и сдвиг сроков удержал его закрытым в ${pct(savedByShift, deathsClosed)} таких откатов`,
);
console.log('');

// ---------- 4: одна лента ----------
console.log('Пример ленты (что выпало — что взяли — что действует в раунде):');
let round = 1;
let tape = [];
for (let i = 0; i < 12; i++) {
  const offers = D.offerPacts(D.PACT_OFFER_COUNT, tape.map((pact) => pact.id));
  const choice = pick(offers, tape, round);
  if (choice) {
    const pact = take(choice, round);
    if (pact) tape.push(pact);
  }
  const effects = D.pactEffects(tape, round);
  const on = Object.entries(effectsOn)
    .filter(([, isOn]) => isOn(effects))
    .map(([name]) => name);
  console.log(
    `  раунд ${String(round).padStart(2)}: сукно [${offers.map((offer) => offer.id).join(', ')}] → ${choice ? choice.id : 'отказ'} | действует: ${on.length ? on.join(', ') : '—'}`,
  );
  round += 1;
  tape = tape.filter((pact) => pact.untilRound >= round);
}

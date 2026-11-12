// Полный забег «Долговой ямы» на настоящих файлах логики (шаг 45: кассета «когда хочешь»; шаг 67: смена автомата событием;
// шаг 68: вместо рулетки у Коллектора — последний шанс, ОДИН за забег (lastChanceUsed), playLastChance из last-chance-sim.mjs).
// Запуск: node --import ./ts-resolve.mjs full-run.mjs [игр]   (из папки next-step/)
// Повторяет RoundScene, BonusScene, MachineScene, DealerScene, ShopScene (и барабан), CollectorScene и кассету.
import { playLastChance } from './last-chance-sim.mjs';

const SRC = process.env.SIM_SRC ?? '/home/lilcmetanka/Documents/VPN/claude-chats/Игры/dolgovaya-yama/src/game/';
const R = await import(SRC + 'rules.ts');
const P = await import(SRC + 'patterns.ts');
const A = await import(SRC + 'amulets.ts');
const I = await import(SRC + 'items.ts');
const E = await import(SRC + 'evil.ts');
const B = await import(SRC + 'bonus.ts');
const PH = await import(SRC + 'phases.ts');
const C = await import(SRC + 'characters.ts');
const D = await import(SRC + 'dealerGame.ts');
const DR = await import(SRC + 'drum.ts');
const LC = await import(SRC + 'lastChance.ts');

// Сила амулетов (шаг 7: забег с этим амулетом с первого раунда) — по ней игрок покупает.
const AMULET_POWER = { bones: 5.39, boost: 5.11, interest: 5.09, insurance: 5.02, cut: 4.88, cherryPit: 4.69, vest: 4.66, greed: 4.61, piggy: 4.43, skullPocket: 4.41, bell: 4.08 };
const ITEM_ORDER = ['garlic', 'triple', 'cigarette', 'shield', 'cherries', 'bells', 'diamonds', 'luck', 'shuffle', 'swap', 'risk', 'hammer', 'candle', 'luckSpin'];
// Расплата фишками — банкомат (~2,5 с). Последний шанс: GOOD LUCK 1,6 с и до 10 авто-прокруток по ~1,1 с с паузами.
const SECONDS = { spin: 2.5, take: 1, dealer: 6, collector: 2.5, lastChance: 13, shop: 10, rewind: 5, rec: 1 };

export const BASE_STRATEGY = {
  takeShare: 0.5, shieldShare: 0.25, boostShare: 0.25, dealerChance: 0.7, reserveShare: 0.5, drumShare: 0.5,
  rustSkulls: 2,
  // Кассета (шаг 45): когда покупать ('none' | 'first' — до амулетов | 'after'), когда записывать и когда откатываться.
  tape: 'first',
  rec: 'start', // 'start' — первой прокруткой раунда; 'pot' — когда кон ≥ recShare долга (перед риском)
  recShare: 0.5,
  recSpins: 4, // 'danger' — записать, когда осталось столько прокруток или меньше, а на долг не хватает
  play: 'burn', // 'burn' — откат между прокрутками, когда черепа сожгли кон ≥ burnShare; 'none' — кассету только записывать
  burnShare: 0.5,
};

/** Цена кассеты. old — шаг 31 (1 + закрытые долги, одна за забег). */
export function defaultEcon() {
  return { tapePrice: (bought, closed) => 1 + closed, tapeOnce: true, tapeAnytime: false };
}

const clone = (s) => structuredClone(s);
// Амулеты по копиям: в гнёздах лежат уникальные (s.amulets), а копии — счётчиком (шаг 62б).
const ids = (s) => A.amuletIdsFrom(s.amuletCounts);

function newRun() {
  return {
    round: 1, debt: R.debtForRound(1), balance: 0, tickets: 0, spinsLeft: R.SPINS_PER_ROUND, pot: 0, streak: 0,
    slots: I.START_SLOTS, shelf: new Array(I.START_SLOTS).fill(null), effects: I.noEffects(), sockets: A.START_SOCKETS,
    amulets: [], amuletCounts: {}, bones: 0, roundShields: 0, machine: C.ORDINARY, diceDrought: 0,
    isBloodNext: false, isLuckyNext: false, freeSpins: 0, phase: PH.PHASES[0], rustyColumn: null, lastGrid: null,
    lastChanceUsed: false, // последний шанс один за забег (шаг 68); в снимок кассеты попадает clone-ом — откат вернёт флаг как на записи
  };
}

function weightOf(s, isFree) {
  const base = R.weightsForRound(s.round, E.diceWeight(s.diceDrought));
  const owned = ids(s);
  return (symbol) => {
    const machined = C.characterWeight(symbol, A.amuletWeight(symbol, base(symbol), owned), s.machine);
    let weight = I.boostWeight(symbol, machined, s.effects); // чеснок и бусты символов (шаг 63а)
    if (s.effects.risk && R.isSkull(symbol)) weight *= I.RISK_SKULL_FACTOR;
    if (s.effects.luckSpin && R.isSkull(symbol)) weight = 0;
    const phased = PH.phaseWeight(symbol, weight, s.phase);
    return isFree ? B.freeSpinWeight(symbol, phased) : phased;
  };
}

const multiplier = (s) => R.multiplierForStreak(s.streak, A.multiplierStep(ids(s)) + s.phase.multiplierBonus);

function payPot(s) {
  let amount = s.pot;
  if (s.effects.tripleTakes > 0) { s.effects.tripleTakes -= 1; amount *= I.TRIPLE_TAKE_FACTOR; }
  s.balance += amount; s.pot = 0;
  if (s.effects.candle) s.effects.candle = false; // свеча: это «забрать» серию не режет
  else s.streak = R.streakAfterTake(s.streak);
}

function startRound(s, g) {
  const owned = ids(s);
  s.streak = 0; s.spinsLeft = A.spinsPerRound(R.SPINS_PER_ROUND, owned); s.roundShields = A.vestShields(owned);
  s.isBloodNext = false; // кровь не переходит в новый раунд (в игре её гасит startRound — последний шанс идёт после closeRound)
  s.phase = PH.phaseAt(s.round - 1);
  // Потолок бесплатных прокруток — на раунд. Счётчик живёт в g, как поле сцены: в снимок кассеты (RunSave) его нет.
  g.freeSpinsGiven = 0; g.freeInRound = 0;
  I.clearRoundEffects(s.effects); // бусты и флаги прошлого раунда не переходят в новый
}

function closeRound(s) {
  s.isBloodNext = false; s.isLuckyNext = false; s.rustyColumn = null;
  if (s.pot > 0) payPot(s);
  I.clearRoundEffects(s.effects);
  s.streak = 0;
}

/** Игра Дилера: ставка — кон (пустой — Дилер ставит), угадываем лучшей стрелкой, пока шанс ≥ dealerChance. */
function dealer(s, st, g) {
  g.time += SECONDS.dealer;
  let stake = D.dealerStake(s.pot, s.debt);
  let card = D.randomCard();
  for (let first = true; ; first = false) {
    const dir = D.guessChance(card, 'higher') >= D.guessChance(card, 'lower') ? 'higher' : 'lower';
    if (!first && D.guessChance(card, dir) < st.dealerChance) break;
    const next = D.randomCard();
    if (!D.isGuessRight(card, next, dir)) { s.pot = 0; return; }
    stake = Math.round(stake * D.winFactor(dir)); card = next;
  }
  s.pot = stake;
}

/**
 * Перемешка и подмена в симуляции (шаг 63б). В игре окно открывается после остановки сетки, до итога, и игрок видит сетку.
 * Подмена — джокер в лучшую клетку: это выбор, а не случайность, исход виден, поэтому перебираем все 15.
 * Перемешка — столбец, где больше всего неплатящих клеток, а новые символы случайные, как в игре; берём её, только если
 * в этом столбце хотя бы две неплатящие клетки и прокрутка пока не выигрывает. За прокрутку — не больше одного применения.
 * Грубо: игрок не сравнивает все столбцы и не считает, сколько ждать.
 */
function rerollGrid(grid, s, w, g) {
  const before = P.evaluateGrid(grid, { ignoreLocks: s.effects.hammer });
  if (s.effects.swap) {
    let best = null;
    let bestScore = before.win;
    for (let row = 0; row < R.GRID_ROWS; row++) {
      for (let col = 0; col < R.GRID_COLUMNS; col++) {
        const trial = grid.map((line, r) => line.map((cell, c) => (r === row && c === col ? R.JOKER : cell)));
        const got = P.evaluateGrid(trial, { ignoreLocks: s.effects.hammer });
        if (got.kind !== 'skull' && got.win > bestScore) { bestScore = got.win; best = trial; }
      }
    }
    if (best) { s.effects.swap = false; g.swapUsed += 1; return best; } // джокер пригодился
  }
  if (s.effects.shuffle) {
    let column = 0;
    let junk = -1;
    for (let col = 0; col < R.GRID_COLUMNS; col++) {
      const bad = grid.filter((line) => !R.isPaying(line[col])).length;
      if (bad > junk) { junk = bad; column = col; }
    }
    if (junk >= 2 && before.kind !== 'win') {
      const trial = grid.map((line) => line.slice());
      for (let row = 0; row < R.GRID_ROWS; row++) trial[row][column] = R.randomSymbol(w);
      s.effects.shuffle = false;
      g.shuffleUsed += 1;
      return trial;
    }
  }
  return grid; // не пригодилось — предмет остаётся заряженным до следующей платной прокрутки
}

/** Одна прокрутка (обычная или бесплатная) с итогом — как RoundScene.roll + finishSpin. Вернёт, сколько сгорело. */
function roll(s, st, g, isFree) {
  g.time += SECONDS.spin;
  const mult = multiplier(s);
  const w = weightOf(s, isFree);
  let grid = s.isLuckyNext ? B.luckyGrid(w) : R.spinGrid(w);
  s.isLuckyNext = false;
  if (s.rustyColumn !== null && s.lastGrid) { grid = C.jamGrid(grid, s.lastGrid, s.rustyColumn); s.rustyColumn = null; }
  if (!isFree) grid = rerollGrid(grid, s, w, g); // окно перемешки и подмены: только на платной прокрутке
  const result = P.evaluateGrid(grid, { ignoreLocks: s.effects.hammer }); // молот: замки не блокируют
  const isBloody = s.isBloodNext;
  s.isBloodNext = E.cellsOf(grid, 'blood').length > 0;
  if (result.tickets >= R.TICKET_SCATTER) s.tickets += 1;
  let burned = 0;
  const owned = ids(s);
  if (result.kind === 'skull') {
    s.bones += 1;
    if (s.roundShields > 0) { s.roundShields -= 1; s.streak += 1; }
    else if (s.effects.shields > 0) { s.effects.shields -= 1; s.streak += 1; }
    else {
      burned = s.pot;
      const refund = A.insuranceRefund(s.pot, owned);
      s.pot = 0; s.streak = 0; s.balance += refund;
      if (isBloody) s.balance -= E.bloodBurn(s.balance);
    }
  } else {
    s.streak += 1;
    if (result.kind === 'win') {
      const win = A.amuletPatternWin(result.hits, owned);
      const factor = A.winFactor(owned, s.bones) * (isBloody ? E.BLOOD_WIN : 1) * s.machine.winFactor * (s.effects.risk ? I.RISK_WIN_FACTOR : 1);
      s.pot += Math.round(win * mult * factor);
      s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, A.bellSpins(result.hits, owned)); // потолок прокруток за раунд
    } else s.pot += A.piggyCoins(mult, owned);
    s.pot -= E.spiderBite(s.pot, E.cellsOf(grid, 'spider').length);
  }
  const want = B.freeSpinsFor(B.countCrowns(grid)); // сколько корон дали бы без потолка
  const free = Math.min(want, B.MAX_FREE_SPINS_PER_ROUND - g.freeSpinsGiven); // потолок за раунд
  if (want > 0) g.crownEvents += 1;
  if (want > free) {
    // Потолок срезал цепочку: отдельно считаем, сколько раз это случилось без «удачи» (честная цепочка).
    g.freeCapped += 1;
    if (s.effects.symbolBoost.crown) g.capWithLuck += 1;
    else g.capNoLuck += 1;
  }
  if (free > 0) {
    s.freeSpins += free; g.freeSpinsGiven += free; g.freeInRound += free;
    g.freeMax = Math.max(g.freeMax, g.freeInRound);
  }
  if (B.hasClover(grid)) s.isLuckyNext = true;
  if (B.isJackpot(result)) { s.tickets += B.JACKPOT_TICKETS; s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, B.JACKPOT_SPINS); }
  s.lastGrid = grid;
  if (!(s.freeSpins > 0 || s.isLuckyNext || s.spinsLeft === 0)) s.rustyColumn = C.rustColumn(s.machine);
  s.effects.risk = false; // риск, молот и фарт — на одну прокрутку
  s.effects.hammer = false;
  s.effects.luckSpin = false;
  if (E.cellsOf(grid, 'dice').length > 0) { s.diceDrought = 0; dealer(s, st, g); } else s.diceDrought += 1;
  return burned;
}

/**
 * Решения игрока между прокрутками: предметы и «забрать».
 * Шаг 63а: бусты символов включаем, пока долг не добит; риск и фарт — перед трудной прокруткой (риск на пустом коне,
 * фарт — когда кон уже есть), молот — когда на прошлой сетке был замок, свечу — перед «забрать» на длинной серии.
 * Числа не подбирались: задача — чтобы симуляция считала новые эффекты.
 */
function beforeSpin(s, st, g) {
  const need = s.debt;
  // Включить предмет — как RoundScene.useItem: уже действующий второй отклоняется, риск с фартом несовместимы.
  const blocked = (id) => (id === 'risk' && s.effects.luckSpin) || (id === 'luckSpin' && s.effects.risk);
  const useSlot = (id) => {
    if (I.isItemOn(id, s.effects) || blocked(id)) return false;
    const i = s.shelf.findIndex((it) => it?.id === id);
    if (i < 0) return false;
    s.shelf[i] = null;
    return true;
  };
  if (useSlot('garlic')) s.effects.symbolBoost.skull = I.GARLIC_SKULL_FACTOR;
  // Бусты символов: пока на долг не хватает, лишние фишки на кон не помешают.
  for (const [item, symbol] of [['cherries', 'cherry'], ['bells', 'bell'], ['diamonds', 'diamond'], ['luck', 'clover']]) {
    if (s.balance < need && useSlot(item)) {
      s.effects.symbolBoost[symbol] = I.SYMBOL_BOOST_FACTOR;
      if (item === 'luck') s.effects.symbolBoost.crown = I.SYMBOL_BOOST_FACTOR; // в игре удача бустит и клевер, и короны
    }
  }
  if (s.balance < need && s.pot === 0 && s.streak <= 1 && useSlot('risk')) s.effects.risk = true; // риск на малом коне и серии
  // Шаг 63б: перемешка и подмена — на трудную прокрутку: пока на долг не хватает, сетку стоит переделать.
  if (s.balance + s.pot < need) {
    if (useSlot('shuffle')) s.effects.shuffle = true;
    if (useSlot('swap')) s.effects.swap = true;
  }
  if (s.balance < need && s.pot > st.shieldShare * need && useSlot('luckSpin')) s.effects.luckSpin = true; // кон бережём
  const hasLock = !!s.lastGrid && s.lastGrid.some((line) => line.some((cell) => R.isLock(cell)));
  if (hasLock && useSlot('hammer')) s.effects.hammer = true;
  if (s.pot >= st.shieldShare * need && s.effects.shields === 0 && useSlot('shield')) s.effects.shields += 1;
  if (s.pot >= st.boostShare * need && s.effects.tripleTakes === 0 && useSlot('triple')) s.effects.tripleTakes += 1;
  if (s.spinsLeft === 1 && s.balance + s.pot < need && s.spinsLeft < R.MAX_SPINS_PER_ROUND && useSlot('cigarette')) s.spinsLeft = R.spinsAfterBonus(s.spinsLeft, I.CIGARETTE_SPINS);
  let take = s.balance < need ? s.balance + s.pot >= need : s.pot >= st.takeShare * need;
  if (s.rustyColumn !== null && s.lastGrid) {
    const skulls = s.lastGrid.filter((line) => R.isSkull(line[s.rustyColumn])).length;
    if (skulls >= st.rustSkulls) take = true;
  }
  if (take && s.pot > 0 && s.streak >= 2 && !s.effects.candle && useSlot('candle')) s.effects.candle = true; // не режем серию
  if (take && s.pot > 0) { payPot(s); g.time += SECONDS.take; }
}

// ---------- Кассета ----------

/** Записать: снимок забега как есть. Кассета на видеомагнитофоне становится записанной. */
function record(s, g) {
  g.tape = 'recorded'; g.record = clone(s); g.recClosed = s.round - 1; g.time += SECONDS.rec; g.recs += 1;
}

/** Откатиться к записи: автомат съедает кассету. Вернёт новое состояние. */
function rewind(s, g) {
  const back = clone(g.record);
  g.tape = null; g.record = null; g.time += SECONDS.rewind; g.rewinds += 1;
  g.rewindFrom.push(s.round - 1); g.rewindBack.push(s.round - back.round);
  return back;
}

/**
 * Раунд с начала (или с середины — после отката к записи посреди раунда): прокрутки до конца.
 * Вернёт состояние — s может смениться после отката.
 */
function playRound(s, st, g, econ) {
  if (g.tape === 'bought') record(s, g); // кассета шага 31: начало раунда (уходя из магазина)
  for (;;) {
    while (s.freeSpins > 0) { s.freeSpins -= 1; roll(s, st, g, true); }
    if (s.spinsLeft === 0) return s;
    s.phase = PH.phaseAt(s.round - 1);
    if (g.tape === 'blank' && shouldRecord(s, st)) record(s, g);
    beforeSpin(s, st, g);
    s.spinsLeft -= 1;
    // Событие смены автомата (шаг 67): прокрутка уходит на сетку, выигрыша нет. Не после клевера и не на последней
    // прокрутке (spinsLeft уже уменьшен выше — 0 значит, что эта прокрутка последняя).
    if (s.freeSpins === 0 && !s.isLuckyNext && s.spinsLeft > 0 && C.machineChangeDue(s.round)) { machineChange(s, g); continue; }
    const burned = roll(s, st, g, false);
    if (econ.tapeAnytime && st.play === 'burn' && g.tape === 'recorded' && burned >= st.burnShare * s.debt && g.record.round === s.round) {
      s = rewind(s, g);
    }
  }
}

function shouldRecord(s, st) {
  if (st.rec === 'start') return true;
  if (st.rec === 'pot') return s.pot >= st.recShare * s.debt;
  if (st.rec === 'danger') return s.spinsLeft <= st.recSpins && s.balance + s.pot < s.debt; // дело плохо — записать сейчас
  return false;
}

/** Смена автомата событием (шаг 67): сетка крутится вхолостую, выигрыша нет, серия +1 (прокрутка пустая, но без черепов), ржавчина сходит. */
function machineChange(s, g) {
  g.time += SECONDS.spin;
  s.machine = C.randomCharacter(s.machine);
  s.rustyColumn = null;
  s.streak += 1;
  // Прокрутка ушла на событие: флаги «следующей прокрутки» сгорают, как и в обычной прокрутке.
  s.effects.risk = false;
  s.effects.hammer = false;
  s.effects.luckSpin = false;
  g.machineChanges += 1;
}

// ---------- Магазин ----------

function freeSlot(s) { return s.shelf.indexOf(null); }

function openShop(s, st, g, econ) {
  g.time += SECONDS.shop;
  s.round += 1;
  const base = R.debtForRound(s.round);
  s.debt = C.characterDebt(base, s.machine); // у каждого автомата свой множитель долга
  const offer = I.randomOffer(s.round); // молот в витрине только с 8-го раунда
  const amuletOffer = A.randomAmuletOffer(ids(s));
  const closed = s.round - 1;
  const reserve = () => s.balance - st.reserveShare * s.debt;
  const buyTape = () => {
    if (st.tape === 'none' || g.tape !== null || (econ.tapeOnce && g.tapesBought > 0)) return;
    const price = econ.tapePrice(g.tapesBought, closed);
    if (price > s.tickets) return;
    s.tickets -= price; g.tapesBought += 1; g.tape = econ.tapeAnytime ? 'blank' : 'bought';
    if (g.firstTapeAt === null) g.firstTapeAt = closed;
  };
  if (st.tape === 'first') buyTape();
  // Амулеты по силе; копия не требует свободного гнезда (шаг 62б), новому амулету — гнездо.
  // Гнездо занимается сразу, до всякой анимации (в игре push в ShopScene.buyAmulet): второй амулет его уже не получит.
  for (const amulet of [...amuletOffer].sort((a, b) => AMULET_POWER[b.id] - AMULET_POWER[a.id])) {
    const socket = s.amulets.findIndex((a) => a.id === amulet.id); // гнездо этого амулета; −1 — такого ещё нет
    const price = A.amuletPrice(amulet);
    if (price > s.tickets) continue;
    if (socket < 0 && s.amulets.length >= s.sockets) {
      const sp = A.socketPrice(s.sockets);
      if (sp === null || sp + price > s.tickets) continue; // гнездо с амулетом не по карману — этот не взять
      s.tickets -= sp; s.sockets += 1;
    }
    s.tickets -= price;
    A.addCopy(s.amuletCounts, amulet.id);
    if (socket < 0) s.amulets.push(amulet); // гнездо занято сразу: следующий амулет его не получит
  }
  if (st.tape === 'after') buyTape();
  // Предметы торгового автомата; нет места — место.
  for (const id of ITEM_ORDER) {
    const item = offer.find((it) => it.id === id);
    if (!item) continue;
    const price = I.itemPrice(item, s.debt);
    if (freeSlot(s) < 0) {
      const slot = I.slotPrice(s.slots, s.debt);
      if (slot === null || reserve() - slot - price < 0) continue;
      s.balance -= slot; s.slots += 1; s.shelf.push(null);
    }
    if (reserve() - price < 0) continue;
    s.balance -= price; s.shelf[freeSlot(s)] = item;
  }
  const tp = A.ticketPrice(s.debt);
  if (reserve() - tp >= 0) { s.balance -= tp; s.tickets += 1; }
  // Барабан.
  for (let spins = 0; ; spins++) {
    const price = DR.drumPrice(spins, s.debt);
    if (price > st.drumShare * s.debt || reserve() - price < 0) break;
    s.balance -= price;
    const available = DR.DRUM_SECTORS.map((prize) => DR.canWin(prize, freeSlot(s) >= 0, s.slots < I.MAX_SLOTS));
    const prize = DR.DRUM_SECTORS[DR.randomSector(available)];
    const item = DR.prizeItem(prize);
    if (item) s.shelf[freeSlot(s)] = item;
    else if (prize === 'ticket') s.tickets += 1;
    else if (prize === 'slot') { s.slots += 1; s.shelf.push(null); }
    else if (prize === 'chips') s.balance += DR.drumChips(price);
  }
}

// ---------- Коллектор ----------

/**
 * Расплата: 'paid' | 'survived' | 'dead'.
 * Фишек не хватило — последний шанс (шаг 68), и он ОДИН за забег (lastChanceUsed), как рулетка раньше:
 * автомат сам крутит до 10 прокруток, игрок забирает кон, когда тот взял порог. Выжил — чемодан платит долг,
 * фишки целы, счёт −1. Вторая нехватка в том же забеге кончает забег сразу: GOOD LUCK загорается второй раз,
 * но прокруток уже нет — сразу KABOOM.
 */
function collector(s, st, g, share) {
  g.time += SECONDS.collector;
  if (s.balance >= s.debt) {
    s.balance -= s.debt; s.balance += A.interestCoins(s.balance, ids(s)); s.tickets += A.TICKETS_PER_DEBT;
    return 'paid';
  }
  if (s.lastChanceUsed) return 'dead'; // шанс израсходован — вторая нехватка не переживается
  s.lastChanceUsed = true;
  g.time += SECONDS.lastChance;
  g.lastChances += 1;
  // Кривая нехватки для last-chance-sim: только приходы, где шанс действительно был (вторая нехватка — уже смерть).
  g.collectorSamples.push({ round: s.round, debt: s.debt, balance: s.balance, diceDrought: s.diceDrought });
  // Порог — доля нехватки (шаг 68). share передаётся подбором в last-chance-sim, по умолчанию — из lastChance.ts.
  // Порог в последнем шансе считается от остатка на табло: кровавые черепа его сжигают, поэтому он пересчитывается на ходу.
  s.share = share;
  const res = playLastChance(s);
  // endLastChance в игре: кон и серия обнуляются, иначе кон утёк бы в следующий раунд и оплатился там.
  s.pot = 0;
  s.streak = 0;
  if (res === 'survived') { g.survived += 1; return 'survived'; }
  return 'dead';
}

// ---------- Забег ----------

export function runGame(st = BASE_STRATEGY, econ = defaultEcon(), share = LC.LAST_CHANCE_SHARE) {
  const g = {
    time: 0, tape: null, record: null, tapesBought: 0, firstTapeAt: null, recs: 0, rewinds: 0, rewindFrom: [], rewindBack: [],
    lastChances: 0, survived: 0, machineChanges: 0, maxClosed: 0, collectorSamples: [],
    freeSpinsGiven: 0, freeInRound: 0, freeMax: 0, crownEvents: 0, freeCapped: 0, capWithLuck: 0, capNoLuck: 0, // потолок бесплатных прокруток за раунд
    shuffleUsed: 0, swapUsed: 0, // перемешка и подмена (шаг 63б): сколько раз применили
  };
  let s = newRun();
  startRound(s, g);
  for (let guard = 0; guard < 400; guard++) {
    s = playRound(s, st, g, econ);
    closeRound(s);
    const res = collector(s, st, g, share);
    if (res === 'dead') break;
    // шаг 68: чемодан платит долг целиком, фишки на табло целы, билета нет, счёт откатывается на один долг
    // (следующий раунд — N − 1: openShop прибавит единицу).
    if (res === 'survived') s.round = Math.max(0, s.round - 2);
    openShop(s, st, g, econ);
    g.maxClosed = Math.max(g.maxClosed, s.round - 1);
    startRound(s, g);
  }
  g.maxClosed = Math.max(g.maxClosed, s.round - 1);
  return { closed: s.round - 1, ...g, record: undefined };
}

/**
 * Кривая для last-chance-sim: сколько не хватало до долга (debt − balance), когда последний шанс действительно был, по раундам.
 * Вторая нехватка в том же забеге — уже смерть без шанса, в кривую не попадает (шаг 68: шанс один за забег).
 * Медиана: средняя кривая врёт из-за редких провалов. Map раунд → нехватка.
 */
function medianCurve(byRound) {
  const curve = new Map();
  for (const [round, list] of byRound) {
    list.sort((a, b) => a - b);
    curve.set(round, list[Math.floor(list.length / 2)]);
  }
  return curve;
}

/** Сводка по готовым забегам. */
export function summarizeRuns(runs) {
  const mean = (f) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const sorted = runs.map((r) => r.closed).sort((a, b) => a - b);
  const minutes = runs.map((r) => r.time / 60).sort((a, b) => a - b);
  const withRewind = runs.filter((r) => r.rewinds > 0);
  const back = runs.flatMap((r) => r.rewindBack);
  return {
    closed: mean((r) => r.closed), median: sorted[Math.floor(sorted.length / 2)], max: mean((r) => r.maxClosed),
    first: mean((r) => (r.closed >= 1 ? 1 : 0)), ten: mean((r) => (r.maxClosed >= 10 ? 1 : 0)), best: sorted.at(-1),
    minutes: mean((r) => r.time / 60), minutesMedian: minutes[Math.floor(minutes.length / 2)], over10: mean((r) => (r.time > 600 ? 1 : 0)),
    tapesBought: mean((r) => r.tapesBought), bought: mean((r) => (r.tapesBought > 0 ? 1 : 0)), rewinds: mean((r) => r.rewinds),
    back: back.length ? back.reduce((a, b) => a + b, 0) / back.length : 0,
    rewindMinutes: withRewind.length ? withRewind.reduce((a, r) => a + r.time / 60, 0) / withRewind.length : 0,
    survived: mean((r) => r.survived), lastChances: mean((r) => r.lastChances), machineChanges: mean((r) => r.machineChanges),
    crownEvents: mean((r) => r.crownEvents), freeCapped: mean((r) => r.freeCapped), freeMax: mean((r) => r.freeMax),
    capWithLuck: mean((r) => r.capWithLuck), capNoLuck: mean((r) => r.capNoLuck),
    runsCapped: runs.filter((r) => r.freeCapped > 0).length / runs.length,
  };
}

export function summarize(st, games, econ, share = LC.LAST_CHANCE_SHARE) {
  const runs = [];
  for (let i = 0; i < games; i++) runs.push(runGame(st, econ, share));
  return summarizeRuns(runs);
}

/**
 * Один проход на долю: сводка забегов и кривые нехватки и засухи кубика. Подбор доли (шаг 68) меряет длину забега
 * и выживаемость на одних и тех же забегах: порог влияет и на то, где Коллектор приходит с нехваткой.
 * Засуха (сколько прокруток подряд без 🎲) — чтобы last-chance-sim считал вес кубика как в настоящем раунде.
 */
export function study(games = 2000, share = LC.LAST_CHANCE_SHARE) {
  const runs = [];
  const byRound = new Map();
  const droughtByRound = new Map();
  for (let game = 0; game < games; game++) {
    const run = runGame(BASE_STRATEGY, defaultEcon(), share);
    runs.push(run);
    for (const sample of run.collectorSamples) {
      if (!byRound.has(sample.round)) byRound.set(sample.round, []);
      byRound.get(sample.round).push(sample.debt - sample.balance);
      if (!droughtByRound.has(sample.round)) droughtByRound.set(sample.round, []);
      droughtByRound.get(sample.round).push(sample.diceDrought);
    }
  }
  return { summary: summarizeRuns(runs), curve: medianCurve(byRound), drought: medianCurve(droughtByRound) };
}

export function report(name, x) {
  const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const pct = (n) => Math.round(n * 100) + '%';
  console.log(`${name.padEnd(44)} в конце ${f(x.closed)} (мед ${x.median}), лучшее ${f(x.max)}, 1-й ${pct(x.first)}, 10+ ${pct(x.ten)}, рекорд ${x.best} | ${f(x.minutes, 1)} мин (мед ${f(x.minutesMedian, 1)}, >10 ${pct(x.over10)}) | кассет ${f(x.tapesBought)} (берут ${pct(x.bought)}), откатов ${f(x.rewinds)}, назад ${f(x.back, 1)} р., с откатом ${f(x.rewindMinutes, 1)} мин | последних шансов ${f(x.lastChances)}, выжил ${f(x.survived)}, смен ${f(x.machineChanges)} | короны ${f(x.crownEvents)}, фриспинов до ${f(x.freeMax, 1)} за раунд, потолок срезал ${f(x.freeCapped)} раз (с удачей ${f(x.capWithLuck)}, без ${f(x.capNoLuck)}; у ${pct(x.runsCapped)} забегов)`);
}

if (import.meta.filename === process.argv[1]) {
  const games = Number(process.argv[2] ?? 5000);
  report('игра как есть (кассета шага 31)', summarize(BASE_STRATEGY, games, defaultEcon()));
  report('без кассеты', summarize({ ...BASE_STRATEGY, tape: 'none' }, games, defaultEcon()));
}

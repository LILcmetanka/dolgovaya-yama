// Полный забег «Долговой ямы» на настоящих файлах логики (шаг 45: кассета «когда хочешь»).
// Запуск: node --import ../ts-resolve.mjs full-run.mjs [игр]   (из папки sim/)
// Повторяет RoundScene, BonusScene, MachineScene, DealerScene, ShopScene (и барабан), CollectorScene, ShotScene и кассету.
const SRC = process.env.SIM_SRC ?? '/home/lilcmetanka/Documents/VPN/claude-chats/Игры/dolgovaya-yama/src/game/';
const R = await import(SRC + 'rules.ts');
const P = await import(SRC + 'patterns.ts');
const A = await import(SRC + 'amulets.ts');
const I = await import(SRC + 'items.ts');
const E = await import(SRC + 'evil.ts');
const B = await import(SRC + 'bonus.ts');
const PH = await import(SRC + 'phases.ts');
const C = await import(SRC + 'characters.ts');
const CG = await import(SRC + 'collectorGame.ts');
const D = await import(SRC + 'dealerGame.ts');
const DR = await import(SRC + 'drum.ts');
const SH = await import(SRC + 'shot.ts');

// Сила амулетов (шаг 7: забег с этим амулетом с первого раунда) — по ней игрок покупает и откупается самым слабым.
const AMULET_POWER = { bones: 5.39, boost: 5.11, interest: 5.09, insurance: 5.02, cut: 4.88, cherryPit: 4.69, vest: 4.66, greed: 4.61, piggy: 4.43, skullPocket: 4.41, falseStart: 4.24, bell: 4.08 };
const ITEM_ORDER = ['garlic', 'triple', 'cigarette', 'shield'];
const SECONDS = { spin: 2.5, take: 1, dealer: 6, collector: 6, shop: 10, rewind: 5, shot: 7, rec: 1 };

export const BASE_STRATEGY = {
  takeShare: 0.5, shieldShare: 0.25, boostShare: 0.25, dealerChance: 0.7, reserveShare: 0.5, drumShare: 0.5,
  rustSkulls: 2, bullet: 'first', bulletMax: 1,
  // Кассета (шаг 45): когда покупать ('none' | 'first' — до амулетов | 'after'), когда записывать и когда откатываться.
  tape: 'first',
  rec: 'start', // 'start' — первой прокруткой раунда; 'pot' — когда кон ≥ recShare долга (перед риском)
  recShare: 0.5,
  recSpins: 4, // 'danger' — записать, когда осталось столько прокруток или меньше, а на долг не хватает
  play: 'collector', // 'collector' — у Коллектора, когда не хватает; 'burn' — ещё и между прокрутками, когда черепа сожгли кон ≥ burnShare
  burnShare: 0.5,
  playBefore: 'roulette', // 'roulette' — кассета вместо рулетки; 'after' — только когда рулетки нет
};

/** Цена кассеты. old — шаг 31 (1 + закрытые долги, одна за забег). */
export function defaultEcon() {
  return { tapePrice: (bought, closed) => 1 + closed, tapeOnce: true, tapeAnytime: false };
}

const clone = (s) => structuredClone(s);
const ids = (s) => s.amulets.map((a) => a.id);

function newRun() {
  return {
    round: 1, debt: R.debtForRound(1), balance: 0, tickets: 0, spinsLeft: R.SPINS_PER_ROUND, pot: 0, streak: 0,
    slots: I.START_SLOTS, shelf: new Array(I.START_SLOTS).fill(null), effects: I.noEffects(), sockets: A.START_SOCKETS,
    amulets: [], bones: 0, roundShields: 0, roulettes: 0, bulletsBought: 0, machine: C.ORDINARY, diceDrought: 0,
    isBloodNext: false, isLuckyNext: false, freeSpins: 0, phase: PH.PHASES[0], rustyColumn: null, lastGrid: null,
    afterShot: false,
  };
}

function weightOf(s, isFree) {
  const base = R.weightsForRound(s.round, E.diceWeight(s.diceDrought));
  const owned = ids(s);
  return (symbol) => {
    const machined = C.characterWeight(symbol, A.amuletWeight(symbol, base(symbol), owned), s.machine);
    const phased = PH.phaseWeight(symbol, I.garlicWeight(symbol, machined, s.effects), s.phase);
    return isFree ? B.freeSpinWeight(symbol, phased) : phased;
  };
}

const multiplier = (s) => R.multiplierForStreak(s.streak, A.multiplierStep(ids(s)) + s.phase.multiplierBonus);

function payPot(s) {
  let amount = s.pot;
  if (s.effects.tripleTakes > 0) { s.effects.tripleTakes -= 1; amount *= I.TRIPLE_TAKE_FACTOR; }
  s.balance += amount; s.pot = 0; s.streak = R.streakAfterTake(s.streak);
}

function startRound(s) {
  const owned = ids(s);
  s.streak = A.startStreak(owned); s.spinsLeft = A.spinsPerRound(R.SPINS_PER_ROUND, owned); s.roundShields = A.vestShields(owned);
  s.phase = PH.phaseAt(s.round - 1);
}

function closeRound(s) {
  s.effects.isGarlicOn = false; s.isBloodNext = false; s.isLuckyNext = false; s.rustyColumn = null;
  if (s.pot > 0) payPot(s);
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

/** Одна прокрутка (обычная или бесплатная) с итогом — как RoundScene.roll + finishSpin. Вернёт, сколько сгорело. */
function roll(s, st, g, isFree) {
  g.time += SECONDS.spin;
  const mult = multiplier(s);
  const w = weightOf(s, isFree);
  let grid = s.isLuckyNext ? B.luckyGrid(w) : R.spinGrid(w);
  s.isLuckyNext = false;
  if (s.rustyColumn !== null && s.lastGrid) { grid = C.jamGrid(grid, s.lastGrid, s.rustyColumn); s.rustyColumn = null; }
  const result = P.evaluateGrid(grid);
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
      const factor = A.winFactor(owned, s.bones) * (isBloody ? E.BLOOD_WIN : 1) * s.machine.winFactor;
      s.pot += Math.round(win * mult * factor);
      s.spinsLeft += A.bellSpins(result.hits, owned);
    } else s.pot += A.piggyCoins(mult, owned);
    s.pot -= E.spiderBite(s.pot, E.cellsOf(grid, 'spider').length);
  }
  const free = B.freeSpinsFor(B.countCrowns(grid));
  s.freeSpins += free;
  if (B.hasClover(grid)) s.isLuckyNext = true;
  if (B.isJackpot(result)) { s.tickets += B.JACKPOT_TICKETS; s.spinsLeft += B.JACKPOT_SPINS; }
  s.lastGrid = grid;
  if (!(s.freeSpins > 0 || s.isLuckyNext || s.spinsLeft === 0)) s.rustyColumn = C.rustColumn(s.machine);
  if (E.cellsOf(grid, 'dice').length > 0) { s.diceDrought = 0; dealer(s, st, g); } else s.diceDrought += 1;
  return burned;
}

/** Решения игрока между прокрутками: предметы, «забрать», выстрел. Вернёт 'shot', если выстрелил. */
function beforeSpin(s, st, g) {
  const need = s.debt;
  const useSlot = (id) => { const i = s.shelf.findIndex((it) => it?.id === id); if (i < 0) return false; s.shelf[i] = null; return true; };
  if (!s.effects.isGarlicOn && useSlot('garlic')) s.effects.isGarlicOn = true;
  if (s.pot >= st.shieldShare * need && s.effects.shields === 0 && useSlot('shield')) s.effects.shields += 1;
  if (s.pot >= st.boostShare * need && s.effects.tripleTakes === 0 && useSlot('triple')) s.effects.tripleTakes += 1;
  if (s.spinsLeft === 1 && s.balance + s.pot < need && useSlot('cigarette')) s.spinsLeft += I.CIGARETTE_SPINS;
  if (s.spinsLeft === 1 && SH.canShoot(s.balance, s.pot, need) && useSlot('bullet')) return 'shot';
  let take = s.balance < need ? s.balance + s.pot >= need : s.pot >= st.takeShare * need;
  if (s.rustyColumn !== null && s.lastGrid) {
    const skulls = s.lastGrid.filter((line) => R.isSkull(line[s.rustyColumn])).length;
    if (skulls >= st.rustSkulls) take = true;
  }
  if (take && s.pot > 0) { payPot(s); g.time += SECONDS.take; }
  return null;
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
 * Вернёт { s, end: 'spins' | 'shot' } — s может смениться после отката.
 */
function playRound(s, st, g, econ) {
  if (g.tape === 'bought') record(s, g); // кассета шага 31: начало раунда (уходя из магазина)
  for (;;) {
    while (s.freeSpins > 0) { s.freeSpins -= 1; roll(s, st, g, true); }
    if (s.spinsLeft === 0) return { s, end: 'spins' };
    s.phase = PH.phaseAt(s.round - 1);
    if (g.tape === 'blank' && shouldRecord(s, st)) record(s, g);
    if (beforeSpin(s, st, g) === 'shot') return { s, end: 'shot' };
    s.spinsLeft -= 1;
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

// ---------- Магазин ----------

function freeSlot(s) { return s.shelf.indexOf(null); }

function openShop(s, st, g, econ) {
  g.time += SECONDS.shop;
  s.round += 1;
  const base = R.debtForRound(s.round);
  s.debt = s.afterShot ? SH.debtAfterShot(base) : C.characterDebt(base, s.machine);
  s.afterShot = false;
  const offer = I.randomOffer();
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
  const buyBullet = () => {
    if (st.bullet === 'none') return;
    const owned = s.shelf.filter((it) => it?.id === 'bullet').length;
    const price = SH.bulletPrice(s.bulletsBought);
    if (owned >= st.bulletMax || price > s.tickets || freeSlot(s) < 0) return;
    s.tickets -= price; s.bulletsBought += 1; s.shelf[freeSlot(s)] = SH.BULLET;
  };
  if (st.tape === 'first') buyTape();
  if (st.bullet === 'first') buyBullet();
  // Амулеты по силе; нет гнезда — гнездо.
  for (const amulet of [...amuletOffer].sort((a, b) => AMULET_POWER[b.id] - AMULET_POWER[a.id])) {
    if (s.amulets.length >= s.sockets) {
      const sp = A.socketPrice(s.sockets);
      if (sp === null || sp > s.tickets) break;
      s.tickets -= sp; s.sockets += 1;
    }
    const price = A.amuletPrice(amulet);
    if (price > s.tickets) continue;
    s.tickets -= price; s.amulets.push(amulet);
  }
  if (st.tape === 'after') buyTape();
  if (st.bullet === 'after') buyBullet();
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

function playRoulette(s) {
  s.roulettes += 1;
  const bullets = CG.loadCylinder(CG.randomLiveCount());
  let shooter = 'player';
  for (;;) {
    const target = shooter === 'player' ? 'collector' : CG.collectorTarget(bullets);
    const shot = bullets.shift();
    if (shot === 'live') return target === 'collector';
    shooter = CG.shooterAfterBlank(target);
  }
}

/** Расплата: 'paid' | 'traded' | 'survived' | 'rewind' | 'dead'. */
function collector(s, st, g) {
  g.time += SECONDS.collector;
  if (s.balance >= s.debt) {
    s.balance -= s.debt; s.balance += A.interestCoins(s.balance, ids(s)); s.tickets += A.TICKETS_PER_DEBT;
    return 'paid';
  }
  const tradable = s.amulets.filter((a) => CG.canTradeAmulet(A.amuletPrice(a), s.balance, s.debt))
    .sort((a, b) => AMULET_POWER[a.id] - AMULET_POWER[b.id]);
  if (tradable.length > 0) { s.amulets.splice(s.amulets.indexOf(tradable[0]), 1); s.balance = 0; g.trades += 1; return 'traded'; }
  const canRoulette = s.roulettes < CG.ROULETTES_PER_RUN;
  const hasTape = g.tape === 'recorded';
  if (hasTape && (st.playBefore === 'roulette' || !canRoulette)) return 'rewind';
  if (canRoulette) { const alive = playRoulette(s); g.roulettesPlayed += 1; if (alive) { g.survived += 1; return 'survived'; } return 'dead'; }
  return 'dead';
}

// ---------- Забег ----------

export function runGame(st = BASE_STRATEGY, econ = defaultEcon()) {
  const g = { time: 0, tape: null, record: null, tapesBought: 0, firstTapeAt: null, recs: 0, rewinds: 0, rewindFrom: [], rewindBack: [], trades: 0, roulettesPlayed: 0, survived: 0, shots: 0, maxClosed: 0 };
  let s = newRun();
  startRound(s);
  for (let guard = 0; guard < 400; guard++) {
    const out = playRound(s, st, g, econ);
    s = out.s;
    closeRound(s);
    if (out.end === 'shot') {
      g.time += SECONDS.shot; g.shots += 1;
      s.machine = C.randomCharacter(s.machine); s.afterShot = true;
      openShop(s, st, g, econ);
    } else {
      const res = collector(s, st, g);
      if (res === 'dead') break;
      if (res === 'rewind') { s = rewind(s, g); continue; }
      if (res === 'survived') { startRound(s); continue; }
      openShop(s, st, g, econ);
    }
    g.maxClosed = Math.max(g.maxClosed, s.round - 1);
    startRound(s);
  }
  g.maxClosed = Math.max(g.maxClosed, s.round - 1);
  return { closed: s.round - 1, ...g, record: undefined };
}

export function summarize(st, games, econ) {
  const runs = [];
  for (let i = 0; i < games; i++) runs.push(runGame(st, econ));
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
    survived: mean((r) => r.survived), trades: mean((r) => r.trades), shots: mean((r) => r.shots),
  };
}

export function report(name, x) {
  const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const pct = (n) => Math.round(n * 100) + '%';
  console.log(`${name.padEnd(44)} в конце ${f(x.closed)} (мед ${x.median}), лучшее ${f(x.max)}, 1-й ${pct(x.first)}, 10+ ${pct(x.ten)}, рекорд ${x.best} | ${f(x.minutes, 1)} мин (мед ${f(x.minutesMedian, 1)}, >10 ${pct(x.over10)}) | кассет ${f(x.tapesBought)} (берут ${pct(x.bought)}), откатов ${f(x.rewinds)}, назад ${f(x.back, 1)} р., с откатом ${f(x.rewindMinutes, 1)} мин | откуп ${f(x.trades)}, выжил ${f(x.survived)}, выстр ${f(x.shots)}`);
}

if (import.meta.filename === process.argv[1]) {
  const games = Number(process.argv[2] ?? 5000);
  report('игра как есть (кассета шага 31)', summarize(BASE_STRATEGY, games, defaultEcon()));
  report('без кассеты', summarize({ ...BASE_STRATEGY, tape: 'none' }, games, defaultEcon()));
}

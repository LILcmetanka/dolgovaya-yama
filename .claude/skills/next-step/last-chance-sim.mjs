// Шаг 68: последний шанс вместо рулетки — один за забег. Как часто он выживает и с каким коном.
// Запуск из этой папки: node --import ./ts-resolve.mjs last-chance-sim.mjs [проб] [забегов на долю]
// Правила — из настоящих файлов логики, как в full-run.mjs: lastChance, rules, patterns, amulets, evil, characters, phases, items.
// Порог считается от НЕХВАТКИ (долг − фишки на табло), а не от долга: кривую «сколько нехватало, когда случился
// последний шанс» по раундам даёт full-run.study — тот же движок, что и полный забег (шанс там один за забег).
const SRC = process.env.SIM_SRC ?? '/home/lilcmetanka/Documents/VPN/claude-chats/Игры/dolgovaya-yama/src/game/';
const LC = await import(SRC + 'lastChance.ts');
const R = await import(SRC + 'rules.ts');
const P = await import(SRC + 'patterns.ts');
const A = await import(SRC + 'amulets.ts');
const I = await import(SRC + 'items.ts');
const E = await import(SRC + 'evil.ts');
const C = await import(SRC + 'characters.ts');
const PH = await import(SRC + 'phases.ts');

/** Наборы амулетов для сравнения: пусто и типовой к 4–8-му раунду (разгон, бронежилет, копилка, кости). */
export const AMULET_SETS = {
  none: {},
  typical: { boost: 1, vest: 1, piggy: 1, bones: 1 },
};

/** Вес символа в последнем шансе — как full-run.mjs: раунд, характер автомата, амулеты, предметы (их нет), фаза. */
function weightOf(s) {
  const base = R.weightsForRound(s.round, E.diceWeight(s.diceDrought));
  const owned = A.amuletIdsFrom(s.amuletCounts);
  return (symbol) => {
    const machined = C.characterWeight(symbol, A.amuletWeight(symbol, base(symbol), owned), s.machine);
    const weighted = I.boostWeight(symbol, machined, s.effects);
    return PH.phaseWeight(symbol, weighted, s.phase);
  };
}

/**
 * Состояние забега перед последним шансом: раунд, его долг, фишки на табло и доля порога.
 * shortfall — сколько до долга не хватало (debt − balance), когда пришёл Коллектор; по умолчанию — весь долг.
 * share — доля НЕХВАТКИ для порога: по умолчанию LAST_CHANCE_SHARE из lastChance.ts, своя нужна подбору числа.
 * diceDrought — сколько прокруток подряд не было 🎲 к приходу Коллектора: от него вес кубика (как в раунде).
 */
export function newLastChanceState(round, counts = {}, machine = C.ORDINARY, share = LC.LAST_CHANCE_SHARE, shortfall = null, diceDrought = 0) {
  const debt = C.characterDebt(R.debtForRound(round), machine); // долг раунда — как в магазине (full-run.openShop)
  const missing = Math.max(0, Math.min(debt, shortfall ?? debt));
  const owned = A.amuletIdsFrom(counts);
  return {
    round, debt, machine, balance: debt - missing, share,
    pot: 0, streak: 0, bones: 0, diceDrought,
    roundShields: A.vestShields(owned), // бронежилет: в начале раунда щитов полный запас
    amuletCounts: { ...counts }, effects: I.noEffects(), phase: PH.phaseAt(round - 1),
  };
}

/**
 * Последний шанс: кон 0, серия 0, до LAST_CHANCE_SPINS прокруток. Прокрутка считается как в игре (evaluateLastChance):
 * черепа — бронежилет отбивает паттерн, иначе кон сгорает (страховка оставляет его на кону, не на табло), а кровавые
 * черепа жгут ещё и фишки на табло; выигрыш — цена паттернов × множитель серии × множитель амулетов и характера
 * (кровавая прокрутка — ещё ×BLOOD_WIN); пустая — копилка; пауки съедают долю кона; серия +1 за прокрутку без черепов.
 * Автомат встаёт, как только кон взял порог: это верхняя граница человеческой игры — живой игрок видит кон и ждёт ровно столько.
 * st и g — как у остальных шагов full-run: решений игрок здесь не принимает (ставка не нужна), в g копится, сколько
 * прокруток автомат успел сделать. Возвращает 'survived' | 'dead'. Экспорт для full-run.mjs: обратного импорта нет, цикла не будет.
 */
export function playLastChance(s, st, g) {
  s.pot = 0;
  s.streak = 0;
  const owned = A.amuletIdsFrom(s.amuletCounts);
  // Щиты тратятся в том же порядке, что RoundScene.onSkulls: сначала остаток бронежилета этого раунда, потом щит
  // с полки. Остаток пишется обратно в состояние — щит, сгоревший в шансе, не должен ждать следующего раунда.
  const hasShield = () => (s.roundShields ?? 0) + (s.effects?.shields ?? 0) > 0;
  const spendShield = () => {
    if ((s.roundShields ?? 0) > 0) s.roundShields -= 1;
    else if ((s.effects?.shields ?? 0) > 0) s.effects.shields -= 1;
  };
  const share = s.share ?? LC.LAST_CHANCE_SHARE;
  const need = () => Math.ceil(share * Math.max(0, s.debt - s.balance)); // табло могло сгореть — порог растёт
  let spins = 0;
  let won = false;
  for (; spins < LC.LAST_CHANCE_SPINS; spins++) {
    const mult = R.multiplierForStreak(s.streak, A.multiplierStep(owned) + s.phase.multiplierBonus);
    const grid = R.spinGrid(weightOf(s));
    const isBloody = s.isBloodNext; // кровь была в прошлой прокрутке — эта кровавая
    s.isBloodNext = E.cellsOf(grid, 'blood').length > 0;
    const result = P.evaluateGrid(grid);
    if (result.kind === 'skull') {
      s.bones += 1; // черепа идут в кости — как в раунде
      if (hasShield()) { spendShield(); s.streak += 1; } // отбил щит
      else {
        s.pot = A.insuranceRefund(s.pot, owned); // страховка оставляет кон на кону
        s.streak = 0;
        if (isBloody) s.balance -= E.bloodBurn(s.balance); // кровавые черепа жгут ещё и табло (burnBoard)
      }
    } else {
      s.streak += 1;
      if (result.kind === 'win') {
        const win = A.amuletPatternWin(result.hits, owned);
        const factor = A.winFactor(owned, s.bones) * (isBloody ? E.BLOOD_WIN : 1) * s.machine.winFactor;
        s.pot += Math.round(win * mult * factor);
      } else s.pot += A.piggyCoins(mult, owned);
      s.pot -= E.spiderBite(s.pot, E.cellsOf(grid, 'spider').length);
    }
    if (s.pot >= need()) { won = true; spins += 1; break; }
  }
  if (g) g.lastChanceSpins = spins; // сколько прокруток автомат успел сделать — пригодится в сводке забега
  return won ? 'survived' : 'dead';
}

/** Ячейка таблицы: доля выживших и средний кон в порогах за trials шансов. */
function cell(round, counts, trials, pickMachine, shortfall, share = LC.LAST_CHANCE_SHARE, diceDrought = 0) {
  let survived = 0;
  let pot = 0;
  let debt = 0;
  let need = 0;
  for (let i = 0; i < trials; i++) {
    const s = newLastChanceState(round, counts, pickMachine(), share, shortfall, diceDrought);
    debt = s.debt;
    if (playLastChance(s) === 'survived') survived += 1;
    need = Math.ceil(share * Math.max(0, s.debt - s.balance)); // после кровавых черепов табло могло сгореть
    pot += need > 0 ? s.pot / need : 1;
  }
  return { survived: survived / trials, pot: pot / trials, debt, need };
}

/** Автомат проб: обычный — как в начале забега. */
const ORDINARY = () => C.ORDINARY;
/** Автомат проб: любой за забег — к 4–8-му раунду обычный успевает смениться (характеры приходят событием). */
const ANY_MACHINE = () => [C.ORDINARY, ...C.CHARACTERS][Math.floor(Math.random() * (C.CHARACTERS.length + 1))];

const pct = (n) => `${Math.round(n * 100)}%`;
const f = (n, d = 2) => n.toFixed(d).replace('.', ',');
const perAttempt = (x) => (x.lastChances > 0 ? x.survived / x.lastChances : 0); // выжил на попытку, а не на забег

async function report(trials, games) {
  const rounds = [3, 4, 5, 6, 7, 8, 9, 10, 11];
  // Кривая из полного забега: сколько не хватало, когда последний шанс был (шанс один за забег, шаг 68).
  // Импорт динамический: full-run.mjs сам импортирует playLastChance отсюда — статический дал бы цикл.
  const F = await import('./full-run.mjs');
  const chosen = F.study(games, LC.LAST_CHANCE_SHARE);
  const curve = chosen.curve;
  const drought = chosen.drought; // медиана «сколько прокруток без кубика» к приходу Коллектора — вес 🎲 в последнем шансе
  const actual = rounds.filter((round) => curve.has(round)); // раунды, где шанс действительно случается

  console.log(`последний шанс, доля нехватки ${f(LC.LAST_CHANCE_SHARE, 3)}, прокруток ${LC.LAST_CHANCE_SPINS}, ${trials} проб на ячейку, обычный автомат`);
  console.log(`кривая нехватки из full-run, ${games} забегов: ${actual.map((round) => `${round}: ${curve.get(round)}`).join(', ')}`);
  console.log(`забег: ${f(chosen.summary.closed)} долгов, ${f(chosen.summary.minutes, 1)} мин; шансов ${f(chosen.summary.lastChances)}, выжил ${pct(perAttempt(chosen.summary))} из них`);
  console.log(`${'раунд'.padEnd(6)}${'долг'.padEnd(7)}${'нехватка'.padEnd(10)}${'порог'.padEnd(8)}без амулетов            типовой набор (boost, vest, piggy, bones)`);
  for (const round of actual) {
    const line = [`${String(round).padEnd(6)}`];
    const parts = [];
    let debt = 0;
    let need = 0;
    for (const [, counts] of Object.entries(AMULET_SETS)) {
      const got = cell(round, counts, trials, ORDINARY, curve.get(round), LC.LAST_CHANCE_SHARE, drought.get(round) ?? 0);
      debt = got.debt;
      need = got.need;
      parts.push(`${pct(got.survived)} выжил (${f(got.pot, 1)} порога)`.padEnd(24));
    }
    line.push(`${String(debt).padEnd(7)}${String(curve.get(round)).padEnd(10)}${String(need).padEnd(8)}`, ...parts);
    console.log(line.join(''));
  }

  // Подбор доли (шаг 68): длина забега и выживаемость на попытку — на одних и тех же забегах (full-run.study).
  // Цели: забег 6,5–8,5 долгов, 8–13 мин, выжил 65–75% попыток.
  console.log(`\nподбор доли нехватки (порог = доля × (долг − фишки)), по ${games} забегов и 1000 проб на раунд:`);
  const sweep = [0.02, 0.03, 0.05, 0.1, 0.15, 0.2];
  for (const share of sweep) {
    const { summary, curve: own, drought: ownDrought } = F.study(games, share);
    const ownRounds = rounds.filter((round) => own.has(round));
    const byRound = ownRounds.map((round) => Math.round(cell(round, AMULET_SETS.typical, 1000, ORDINARY, own.get(round), share, ownDrought.get(round) ?? 0).survived * 100));
    const mark = share === LC.LAST_CHANCE_SHARE ? ' ←' : '';
    console.log(
      `доля ${f(share)}  забег ${f(summary.closed)} (мед ${summary.median}), ${f(summary.minutes, 1)} мин | шансов ${f(summary.lastChances)}, выжил ${pct(perAttempt(summary))} | типовой по раундам ${ownRounds.map((round, i) => `${round}: ${byRound[i]}`).join(' ')}${mark}`,
    );
  }

  console.log('\nвыбранная доля на любом автомате забега, 5000 проб, раунды 4–11:');
  for (const [name, counts] of Object.entries(AMULET_SETS)) {
    const byRound = [];
    for (const round of rounds) byRound.push(curve.has(round) ? pct(cell(round, counts, 5000, ANY_MACHINE, curve.get(round), LC.LAST_CHANCE_SHARE, drought.get(round) ?? 0).survived) : '—');
    console.log(`  ${name.padEnd(8)} ${byRound.join(' ')}`);
  }
}

if (import.meta.filename === process.argv[1]) void report(Number(process.argv[2] ?? 20000), Number(process.argv[3] ?? 2000));

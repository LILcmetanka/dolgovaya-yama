// Игра Дилера: карты 1..10 с равным шансом (каждая следующая — независимо). «<» / «>» — ×1,5, ничья — проигрыш.
// «=» — ×K (шанс 1 из 10), после него карта та же, можно играть дальше. Первая ставка обязательна.
// Единицы — ставка (кон). Считаем: сколько в среднем выходит из игры на 1 фишку кона.
const ARROW = 1.5;
const cards = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const pHigher = (c) => (10 - c) / 10, pLower = (c) => (c - 1) / 10;

// Оптимум по среднему: V(c) — ценность 1 фишки, если можно остановиться; F(c) — если первый ход обязателен.
function optimal(K) {
  let V = Object.fromEntries(cards.map((c) => [c, 1]));
  for (let it = 0; it < 500; it++) {
    const nv = {};
    for (const c of cards) {
      const hi = ARROW * cards.filter((n) => n > c).reduce((s, n) => s + V[n], 0) / 10;
      const lo = ARROW * cards.filter((n) => n < c).reduce((s, n) => s + V[n], 0) / 10;
      const eq = K ? (K * V[c]) / 10 : 0;
      nv[c] = Math.max(1, hi, lo, eq);
    }
    V = nv;
  }
  const first = (c) => {
    const hi = ARROW * cards.filter((n) => n > c).reduce((s, n) => s + V[n], 0) / 10;
    const lo = ARROW * cards.filter((n) => n < c).reduce((s, n) => s + V[n], 0) / 10;
    const eq = K ? (K * V[c]) / 10 : 0;
    const best = Math.max(hi, lo, eq);
    return { best, pick: best === eq ? '=' : best === hi ? '>' : '<' };
  };
  const F = cards.map(first);
  return { avg: F.reduce((s, f) => s + f.best, 0) / 10, picks: F.map((f) => f.pick).join(' ') };
}

// Человек: «<» / «>» туда, где шанс больше; дальше играет, пока шанс ≥ threshold. eqRule — когда жмёт «=».
function human(K, threshold, eqRule, N = 300000) {
  let out = 0, zero = 0, eqPresses = 0, eqHits = 0;
  for (let i = 0; i < N; i++) {
    let c = 1 + Math.floor(Math.random() * 10), stake = 1, first = true;
    for (;;) {
      const chance = Math.max(pHigher(c), pLower(c));
      const useEq = K && eqRule(c, first);
      if (!first && !useEq && chance < threshold) break;
      const n = 1 + Math.floor(Math.random() * 10);
      first = false;
      if (useEq) {
        eqPresses++;
        if (n === c) { stake *= K; eqHits++; continue; }
        stake = 0; break;
      }
      const right = pHigher(c) >= pLower(c) ? n > c : n < c;
      if (!right) { stake = 0; break; }
      stake *= ARROW; c = n;
    }
    out += stake; if (stake === 0) zero++;
  }
  return `в среднем ×${(out / N).toFixed(2)}, ушёл ни с чем ${((zero / N) * 100).toFixed(0)}%, «=» жал ${(eqPresses / N).toFixed(2)} раза за игру`;
}

console.log('Оптимум по среднему (ходы на первой карте 1..10):');
for (const K of [0, 6, 8, 9, 10, 12]) {
  const o = optimal(K);
  console.log(`  ${K ? '«=» ×' + K : 'без «=» (сейчас)'}: ×${o.avg.toFixed(3)}  [${o.picks}]`);
}
const mid = (c, first) => first && (c === 5 || c === 6); // «=» только когда обязан ходить и карта в середине
const once = (() => { let used = false; return null; })();
console.log('\nЧеловек, играет пока шанс ≥ 70%:');
for (const K of [0, 8, 10]) {
  console.log(`  ${K ? '«=» ×' + K : 'без «=»'}, «=» на первой 5/6: ${human(K, 0.7, mid)}`);
}
console.log('\nЧеловек-азартный: «=» на первом ходе всегда:');
for (const K of [8, 10]) console.log(`  «=» ×${K}: ${human(K, 0.7, (c, first) => first)}`);

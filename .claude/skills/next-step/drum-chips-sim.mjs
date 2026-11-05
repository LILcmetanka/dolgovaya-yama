// Только фишки барабана: сколько приходит назад при старом (0,25 долга) и новом (цена прокрутки ×K) правиле.
// Единицы — доли долга следующего раунда. Цена k-й прокрутки (k с нуля): 0,25 · 2^k. Секторов 9, «фишки» — 2 (всегда доступны).
const P_CHIPS = 2 / 9, N = 400000;
const price = (k) => 0.25 * 2 ** k;
const rules = { 'старое: 0,25 долга': () => 0.25, 'новое ×2': (k) => 2 * price(k), 'новое ×1,5': (k) => 1.5 * price(k) };
for (const [name, prize] of Object.entries(rules)) {
  console.log('\n' + name);
  for (const spins of [1, 2, 3, 4]) {
    let paid = 0, back = 0, worst = 1e9, best = -1e9, lossRuns = 0;
    for (let i = 0; i < N; i++) {
      let p = 0, b = 0;
      for (let k = 0; k < spins; k++) { p += price(k); if (Math.random() < P_CHIPS) b += prize(k); }
      paid += p; back += b; worst = Math.min(worst, b - p); best = Math.max(best, b - p);
      if (b < p) lossRuns++;
    }
    console.log(`  ${spins} прокр.: платит ${(paid / N).toFixed(2)}, фишки назад ${(back / N).toFixed(2)} (${((back / paid) * 100).toFixed(0)}% цены), чистыми ${((back - paid) / N).toFixed(2)}, лучший ${best.toFixed(2)}, в минусе по фишкам ${((lossRuns / N) * 100).toFixed(0)}%`);
  }
}

// Шаг 45: кассета «когда хочешь» — цена × когда покупать × когда записывать и откатываться.
// УСТАРЕЛО (2026-11-13): симулятор переписан под текущие правила. `econ.tapeOnce: false` ещё работает
// («сколько угодно кассет»), а `tapeAnytime` больше не читается: запись — ручное действие между прокрутками,
// то есть всегда «когда хочешь». Поэтому варианты с `any(price)` различаются только ценой.
// Запуск из этой папки: for i in $(seq 0 23); do node --import ./ts-resolve.mjs tape45-sim.mjs $i 200 > /tmp/.../t45_$i.txt & done; wait
// С сидом (прогон повторяется): SIM_SEED=1 node --import ./ts-resolve.mjs tape45-sim.mjs 2 200
// (200, не 20000: забеги после шага 68б длятся десятки раундов, 20 000 забегов идут часами)
import { BASE_STRATEGY as B, defaultEcon, summarize, report } from './full-run.mjs';
const any = (price) => ({ tapePrice: price, tapeOnce: false });
const prices = { 'всегда 2': () => 2, 'всегда 3': () => 3, '2,3,4…': (b) => 2 + b, '3,4,5…': (b) => 3 + b, '1 + долги': (b, c) => 1 + c };
const players = {
  'сразу, запись в начале': { ...B, rec: 'start' },
  'сразу, запись при коне, откат после черепов': { ...B, rec: 'pot', play: 'burn' },
  'сразу, запись в беде (≤4)': { ...B, rec: 'danger' },
  'после амулетов, запись в беде': { ...B, rec: 'danger', tape: 'after' },
  'после амулетов, запись в начале': { ...B, rec: 'start', tape: 'after' },
};
export const VARIANTS = [
  { name: 'без кассеты', strategy: { ...B, tape: 'none' }, econ: defaultEcon() },
  { name: 'шаг 31 (как было)', strategy: B, econ: defaultEcon() },
];
for (const [pn, p] of Object.entries(prices)) for (const [sn, st] of Object.entries(players)) VARIANTS.push({ name: `${pn} | ${sn}`, strategy: st, econ: any(p) });
if (import.meta.filename === process.argv[1]) {
  const [i, games] = process.argv.slice(2).map(Number);
  report(VARIANTS[i].name, summarize(VARIANTS[i].strategy, games, VARIANTS[i].econ));
}

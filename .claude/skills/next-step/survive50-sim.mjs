// Шаг 50: что делать с выжившим в рулетке. Запуск из этой папки: node --import ./ts-resolve.mjs survive50-sim.mjs [игр]
import { BASE_STRATEGY, defaultEcon, report, summarize } from './full-run.mjs';
const games = Number(process.argv[2] ?? 20000);
for (const [name, survive] of [['same: тот же долг, фишки остаются (как было)', 'same'], ['back: чемодан доплатил нехватку, счёт −1, долг N−1', 'back'], ['keep: чемодан = весь долг, фишки целы, счёт −1', 'keep']]) {
  report(name, summarize(BASE_STRATEGY, games, { ...defaultEcon(), survive }));
}

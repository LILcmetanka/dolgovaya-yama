// Шаг 50: что делать с выжившим. Раньше было три варианта (same / back / keep), но шаг 68 убрал выбор:
// исход последнего шанса теперь один (чемодан платит долг, счёт −1), и full-run.mjs опцию survive не читает.
// Запуск из этой папки: node --import ./ts-resolve.mjs survive50-sim.mjs [игр]
import { BASE_STRATEGY, defaultEcon, report, summarize } from './full-run.mjs';
const games = Number(process.argv[2] ?? 20000);
report('последний шанс (шаг 68): как в игре', summarize(BASE_STRATEGY, games, defaultEcon()));

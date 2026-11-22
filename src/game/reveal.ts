import { amuletPatternWin, type AmuletId } from './amulets';
import type { PatternHit } from './patterns';
import type { SlotSymbol } from './rules';

/**
 * Поэтапный показ выигравших паттернов (DONTLIKE 19.11, «Улучшения» п.1, как в Clover Pit): сетка встала, а паттерны
 * не загораются все сразу — сначала первая линия, потом ещё одна, диагональ, фигура повыше, и с каждой новой рамкой
 * в окошке выплаты прибавляется её доля. Здесь только арифметика показа и тайминги — без Phaser, чтобы проверить тестами.
 *
 * Числа не меняются: показанная на шаге i сумма — это winGain(hits[0..i], …) — ровно та же формула, по которой
 * addToPot кладёт весь выигрыш. Поэтому последний шаг телескопирует в прежний gain побитово:
 * те же слагаемые в том же порядке, то же умножение. Порядок hits НЕ сортируем: сортировка сломала бы и телескоп,
 * и порядок каскада (он идёт как findPatterns — от простых линий к большим фигурам).
 */

/** Сколько горит одна новая рамка (и её попап), мс: предел, когда паттернов мало. */
export const WIN_REVEAL_STEP = 340;

/** Короче одной рамки не бывает, даже если паттернов на сетке целая россыпь, мс. */
export const WIN_REVEAL_MIN_STEP = 110;

/** На весь показ в платной прокрутке — столько, мс: паттернов больше — шаг короче, но не меньше минимума. */
export const WIN_REVEAL_BUDGET = 2200;

/** То же для бесплатной прокрутки: она идёт сама, задерживать её показ нельзя, мс. */
export const WIN_REVEAL_FREE_BUDGET = 1100;

/**
 * Минимум шага бесплатной прокрутки: 15 × 73 = 1095 мс — бюджет 1,1 с держится на любом числе попаданий,
 * какое вообще бывает (на сетке 5×3 всего 15 клеток, больше паттернов не собрать). С прежними 90 мс те же
 * 15 попаданий давали 1350 мс — бюджет врал.
 */
export const WIN_REVEAL_FREE_MIN_STEP = 73;

/** Пауза после последнего шага, прежде чем прозвучит итог (+gain и брызги фишек), мс. У бесплатной — 0. */
export const WIN_REVEAL_HOLD = 320;

/**
 * Доля шага, за которую рамка гаснет. Рамки не копятся: шаг i горит один, а последние 45% его времени уходят
 * на alpha 1 → 0, чтобы к началу шага i+1 на сетке не осталось ничего. У последнего шага тушение тянется
 * ещё и на паузу WIN_REVEAL_HOLD, поэтому рамка тает до самого итога, а не висит рывком.
 */
export const WIN_REVEAL_FADE_SHARE = 0.45;

/** Один шаг каскада: какой паттерн загорается и сколько на кону после него. */
export interface RevealStep {
  hit: PatternHit; // паттерн этого шага — единственный, чья рамка загорается сейчас
  shown: number; // сколько всего на кону после этого шага (это и пишем в окошко выплаты)
  delta: number; // сколько прибавил именно этот шаг: shown − прошлый shown
}

/**
 * Сколько платят выигравшие паттерны в деньгах: сумма «цена символа × множитель паттерна» с амулетами (amuletPatternWin),
 * × множитель серии × множитель амулетов, автомата и сделок (factor), округлённая до целых фишек.
 *
 * Одна формула на всю игру: её зовут и addToPot (начисление кона), и revealSteps (показ по шагам). Пока формула жила
 * в двух местах, число в окошке и число на кону могли разойтись от одной правки в одном из них.
 */
export function winGain(
  hits: PatternHit[],
  owned: AmuletId[],
  multiplier: number,
  factor: number,
  payMul?: (symbol: SlotSymbol) => number,
): number {
  return Math.round(amuletPatternWin(hits, owned, payMul) * multiplier * factor);
}

/**
 * Шаги каскада: на шаге i показываем hits[0..i] и ту сумму, которую они дают вместе. delta — прибавка шага.
 * Рамки не копятся: шаг отдаёт только свой hit, прошлую рамку снимает SlotScreen.startWinStep, — а shown считаем
 * по всему префиксу, потому что в окошке копятся показанные суммы: так последнее число совпадает с начисленным.
 */
export function revealSteps(
  hits: PatternHit[],
  owned: AmuletId[],
  multiplier: number,
  factor: number,
  payMul?: (symbol: SlotSymbol) => number,
): RevealStep[] {
  const steps: RevealStep[] = [];
  let previous = 0;
  for (let i = 0; i < hits.length; i++) {
    // Тот же расчёт, что в addToPot: число на шаге — это выигрыш первых i+1 паттернов целиком.
    const shown = winGain(hits.slice(0, i + 1), owned, multiplier, factor, payMul);
    steps.push({ hit: hits[i], shown, delta: shown - previous });
    previous = shown;
  }
  return steps;
}

/**
 * Сколько держится одна рамка: бюджет на весь показ делим на число паттернов, но не дольше WIN_REVEAL_STEP
 * и не короче минимума. Бесплатная прокрутка идёт сама — у неё свой, короткий бюджет.
 */
export function revealStepMs(count: number, isFree: boolean): number {
  const budget = isFree ? WIN_REVEAL_FREE_BUDGET : WIN_REVEAL_BUDGET;
  const min = isFree ? WIN_REVEAL_FREE_MIN_STEP : WIN_REVEAL_MIN_STEP;
  const step = budget / Math.max(1, count); // count 0 — показывать нечего, ограничитель ниже всё равно вернёт предел
  return Math.min(WIN_REVEAL_STEP, Math.max(min, step));
}

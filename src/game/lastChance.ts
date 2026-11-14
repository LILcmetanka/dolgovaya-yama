import { PATTERNS, TOP_MULTIPLIER, type SpinResult } from './patterns';
import { isPaying, SYMBOLS, weightsForRound, type SlotSymbol } from './rules';

/**
 * Последний шанс: фишек на долг не хватило — на экране банкомата GOOD LUCK, автомат делает ОДНУ прокрутку сам,
 * но чистую: без черепов и злых символов (🕷 🔒 🩸 🎲), чтобы дальше решал игрок, а не удача.
 * Сетка остаётся, и у игрока два действия: перекрутить столбец или поставить джокера в клетку (заморозка столбца —
 * бесплатно, она действий не тратит). Собрал паттерн, который оплачивает долю нехватки фишек (см. LAST_CHANCE_GOAL_SHARE), —
 * чемодан платит долг, фишки целы, билета нет, счёт на один долг назад. Не собрал — провал: первый за забег даёт
 * «второе дыхание» (счёт −1 и магазин), второй — KABOOM.
 * Здесь только числа и маленькие правила; как идут прокрутки и окно действий — в CollectorScene. Без Phaser.
 */

/** Символы, которых в последнем шансе нет: иначе игрок ничего не решает — всё сожгут черепа или злые знаки. */
export const LAST_CHANCE_BANNED = ['skull', 'dice', 'spider', 'lock', 'blood'];

/** Сколько действий у игрока: перекрут столбца или джокер. Заморозка столбца бесплатная и сюда не входит. */
export const LAST_CHANCE_ACTIONS = 2;

/** Столько горит GOOD LUCK на экране банкомата (столько же мигают красные огни автомата), прежде чем начнётся прокрутка, мс. */
export const GOOD_LUCK_TIME = 1600;

/**
 * Доля нехватки фишек, которую должен оплатить паттерн последнего шанса: закрываем не весь долг, а пятую часть
 * того, чего не хватило. Доля выбрана автором 2026-11-14 по симуляции (1000 забегов на сид): 0,2 — спасено 71–72 %
 * нехваток, 0,5 — 53 %, 1,0 (весь долг) — 35 %. Прежнее правило «побей свой же паттерн» спасало 95 %, и забег не кончался.
 */
export const LAST_CHANCE_GOAL_SHARE = 0.2;

/**
 * Самый сильный паттерн без джекпота. Победа требует best > goal, поэтому цель выше этого потолка недостижима:
 * закрыть её может только джекпот, а рассчитывать на него нельзя. Сюда же обрезается цель (lastChanceGoal).
 */
export const BEST_WITHOUT_JACKPOT = Math.max(
  ...PATTERNS.filter((pattern) => pattern.id !== 'jackpot').map((pattern) => pattern.multiplier),
);

/** Бывает ли символ в чистой прокрутке последнего шанса. */
export function isLastChanceSymbol(symbol: SlotSymbol): boolean {
  return !LAST_CHANCE_BANNED.includes(symbol.id);
}

/**
 * Цена символа, по которой считается цель: самая дорогая платящая клетка, которая бывает в автомате в этом раунде.
 * Считается по таблице символов и весам раунда, чтобы не разойтись с ними, если символы начнут входить позже или
 * подорожают; сейчас цена постоянна — 25 (7 входит с 1-го раунда и дороже всех), поэтому параметр round на неё не влияет.
 */
export function chancePrice(round: number): number {
  const weightOf = weightsForRound(round);
  let price = 0;
  for (const symbol of SYMBOLS) {
    if (isPaying(symbol) && weightOf(symbol) > 0 && symbol.price > price) price = symbol.price;
  }
  return price;
}

/**
 * Цель последнего шанса: какой множитель паттерна оплачивает долю share нехватки фишек.
 * Паттерн платит цену символа × множитель (patterns.ts), на кон выигрыш ложится × множитель серии и × множители
 * выигрыша (амулеты и автомат — как в addToPot RoundScene): goal = need × share / (price × streak × factor).
 * Нехватки нет — цель 0. Выше BEST_WITHOUT_JACKPOT цель не поднимается: там её закрывает только джекпот.
 */
export function lastChanceGoal(
  need: number,
  price: number,
  streakMultiplier: number,
  winFactorValue: number,
  share = LAST_CHANCE_GOAL_SHARE,
): number {
  if (need <= 0) return 0;
  const goal = (need * share) / (Math.max(price, 1) * Math.max(streakMultiplier, 1) * Math.max(winFactorValue, 1));
  return Math.min(goal, BEST_WITHOUT_JACKPOT);
}

/** Наименьший множитель паттерна, который бьёт цель: выше цели — победа. Такого нет — остаётся джекпот (TOP_MULTIPLIER). */
export function goalPattern(goal: number): number {
  const beating = PATTERNS.filter((pattern) => pattern.multiplier > goal).map((pattern) => pattern.multiplier);
  return beating.length > 0 ? Math.min(...beating) : TOP_MULTIPLIER;
}

/**
 * Лучший множитель среди паттернов сетки: 0 — паттернов нет, иначе самый сильный из собранных.
 * Джекпот (все 15 клеток) — TOP_MULTIPLIER, сильнее него не бывает.
 */
export function bestMultiplier(result: SpinResult): number {
  return result.hits.reduce((best, hit) => Math.max(best, hit.pattern.multiplier), 0);
}

/**
 * Достигнута ли цель: собрать паттерн сильнее порога из нехватки фишек (lastChanceGoal).
 * Цель 0 значит «хоть какой-нибудь паттерн», и это тот же счёт: best > 0.
 */
export function isLastChanceGoalMet(best: number, goal: number): boolean {
  return best > goal;
}

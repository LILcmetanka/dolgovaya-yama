import { roundPrice } from './items';
import { PATTERNS, TOP_MULTIPLIER, type SpinResult } from './patterns';
import { isPaying, SYMBOLS, weightsForRound, type SlotSymbol } from './rules';

/**
 * Последний шанс: фишек на долг не хватило — на экране банкомата GOOD LUCK, автомат делает ОДНУ прокрутку сам,
 * но чистую: без черепов и злых символов (🕷 🔒 🩸 🎲), чтобы дальше решал игрок, а не удача.
 * Сетка остаётся, и у игрока два действия: перекрутить столбец или поставить джокера в клетку (заморозка столбца —
 * бесплатно, она действий не тратит). Действия кончились, цель не взята — можно докупить ещё одно действие за долю
 * фишек на руках (шаг 14, до LAST_CHANCE_BUY_MAX раз, каждая следующая докупка дороже).
 * Собрал паттерн, который оплачивает долю нехватки фишек (см. LAST_CHANCE_GOAL_SHARE), —
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

// Докупка прокрутки (шаг 14): действия кончились, цель не взята — можно купить ещё одно действие,
// заплатив долю фишек НА РУКАХ. Доля растёт с каждой докупкой, поэтому третья заметно дороже первой,
// и скупать действия без счёта невыгодно. Решения автора 15.11.2026: платим фишками (не билетами),
// цена — процент от текущего банка, докупок 1–3, цель остаётся «нехватка долга» (LAST_CHANCE_GOAL_SHARE).
/** Сколько докупок прокрутки можно сделать за один последний шанс. */
export const LAST_CHANCE_BUY_MAX = 3;
/** Доля фишек на руках за первую докупку. */
export const LAST_CHANCE_BUY_SHARE_START = 0.25;
/** Насколько доля растёт с каждой следующей докупкой. */
export const LAST_CHANCE_BUY_SHARE_STEP = 0.15;
/** Потолок доли: больше 55% фишек на руках за одну докупку не берут. */
export const LAST_CHANCE_BUY_SHARE_MAX = 0.55;

/**
 * Числа докупки одним объектом: симулятор подменяет их ручками SIM_LC_BUY_*, чтобы замерить другую цену
 * без правки констант (так же, как SIM_LC_SHARE подменяет долю цели). В игре — всегда LAST_CHANCE_BUY_RULES.
 */
export interface LastChanceBuyRules {
  max: number;
  start: number;
  step: number;
  maxShare: number;
}

export const LAST_CHANCE_BUY_RULES: LastChanceBuyRules = {
  max: LAST_CHANCE_BUY_MAX,
  start: LAST_CHANCE_BUY_SHARE_START,
  step: LAST_CHANCE_BUY_SHARE_STEP,
  maxShare: LAST_CHANCE_BUY_SHARE_MAX,
};

/** Доля фишек на руках за докупку после bought покупок: 25, 40, 55% и дальше 55%. Мусор и минус — первая доля. */
export function lastChanceBuyShare(bought: number, rules: LastChanceBuyRules = LAST_CHANCE_BUY_RULES): number {
  if (!Number.isFinite(bought) || bought < 0) return rules.start;
  return Math.min(rules.maxShare, rules.start + rules.step * Math.floor(bought));
}

/** Цена докупки при balance фишек на руках: доля банка, округлённая до 5, но не меньше 5 (items.roundPrice). */
export function lastChanceBuyPrice(balance: number, bought: number, rules: LastChanceBuyRules = LAST_CHANCE_BUY_RULES): number {
  const bank = Number.isFinite(balance) && balance > 0 ? balance : 0;
  return roundPrice(bank * lastChanceBuyShare(bought, rules));
}

/**
 * Почему докупка недоступна: early — действия ещё не кончились (докупать рано), limit — докупки кончились,
 * poor — цена больше банка, hopeless — цель у потолка (её бьёт только джекпот).
 */
export type LastChanceBuyVerdict = 'ok' | 'early' | 'limit' | 'poor' | 'hopeless';

/**
 * Единственное правило докупки — чистая функция, её зовут сцена и симулятор, своих копий условия они не держат.
 * Докупать можно только когда бесплатные действия кончились: при actionsLeft > 0 — early (покупка не нужна,
 * ничего не списывается). Дальше по порядку: limit — докупки кончились; poor — цена больше банка;
 * hopeless — цель у потолка, покупка только ухудшит (действие добавится, а цель останется недостижимой без джекпота).
 */
export function lastChanceBuyVerdict(
  actionsLeft: number,
  bought: number,
  balance: number,
  goal: number,
  rules: LastChanceBuyRules = LAST_CHANCE_BUY_RULES,
): LastChanceBuyVerdict {
  if (!Number.isFinite(actionsLeft) || actionsLeft > 0) return 'early';
  if (bought >= rules.max) return 'limit';
  const bank = Number.isFinite(balance) ? balance : 0;
  if (lastChanceBuyPrice(bank, bought, rules) > bank) return 'poor';
  if (goal >= BEST_WITHOUT_JACKPOT) return 'hopeless';
  return 'ok';
}

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

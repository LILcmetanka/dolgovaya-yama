import { findPatterns } from './patterns';
import { GRID_COLUMNS, GRID_ROWS, isPaying, randomSymbol, skullRatioFromShare, SYMBOLS, weightsForRound, type Grid, type SlotSymbol, type WeightOf } from './rules';

/**
 * Раунд спасения (шаг 27; правила переделаны 22.11.2026) — вместо старого «последнего шанса» с докупкой действий.
 * Автор описал механику словами (DONTLIKE §1, 22.11.2026): долг оплатить нечем, на экране банкомата GOOD LUCK,
 * всё уходит в красный, даётся 5 прокруток, доля черепов 50–70%, надо собрать хотя бы один паттерн.
 * После прокрутки можно заморозить или разморозить один столбец (не больше одного действия за ход);
 * прокручиваются только незамороженные столбцы, поэтому последняя прокрутка может идти по одному столбцу.
 * Собрал паттерн — выжил: за выживание не дают ни фишек, ни билетов, а долг остаётся прежним — раунд играется
 * заново (WON_RESCUE_ROUND_STEP). Не собрал — смерть. Спасение одно за забег (rescueAllowed), и откат кассетой
 * этого не снимает. Амулеты и предметы в раунде спасения заморожены: их правила сюда не входят вовсе.
 * Здесь только числа и маленькие правила; как идут прокрутки, заставка на экране автомата, сообщения на стекле
 * и красный свет — в CollectorScene, Atmosphere, SlotScreen и Collector. Без Phaser.
 */

/** Сколько прокруток даётся в раунде спасения. */
export const RESCUE_SPINS = 5;

/**
 * Доля клеток-черепов в раунде спасения. Автор просил 50–70%. Замер `full-run.mjs` (шаг 27, 300 забегов, сид 1):
 * при 50% спасение выживает 53% (реальный риск), при 10% — 92% (спасение становится формальностью).
 * Промежуточной доли, которая держит и риск, и 1 млн, нет: 1 млн требовали ~45 раундов.
 * После правки правил 22.11.2026 (одна яма за забег, долг тот же, раунд заново) выживание 55–61%, но забег теперь
 * кончается на второй нехватке фишек — до 1 млн доходит 0%, 10+ 0% (медиана 2 закрытых долга). Долю не трогали:
 * это решение автора, а не следствие правки. Значение калибруется SIM_RESCUE_SKULL.
 */
export const RESCUE_SKULL_SHARE = 0.5;
/** Потолок доли черепов из описания автора: выше 70% паттерн почти не собрать. */
export const RESCUE_SKULL_SHARE_MAX = 0.7;
/** Нижняя граница: доля меньше 10% делает спасение почти гарантированным. */
export const RESCUE_SKULL_SHARE_MIN = 0.1;

/**
 * Сколько заморозок/разморозок разрешено между двумя прокрутками.
 * Замер (шаг 27, ветка feature/layout-fullscreen): гипотеза «жёсткость от того, что за 5 прокруток замораживаются
 * только 4 столбца» проверена ручкой SIM_RESCUE_FREEZE при авторских числах (5 прокруток, 50% черепов, долг тот же,
 * раунд заново, 300 забегов, сид 1). Выживание в спасении — 53 / 53 / 53%, до 1 млн — 0 / 0 / 0%, медиана 5,8 / 5,9 / 5,8 мин
 * при 1 / 2 / 3 заморозках. Бот морозит в среднем 0,93 / 1,09 / 1,12 столбца за спасение: заморозок и так тратится
 * около одной, потому что при 50% черепов почти нет столбцов без черепа и с парой — морозить нечего, а лишняя
 * заморозка только сокращает число крутящихся столбцов. Жадная политика (морозить любой столбец без черепа)
 * на FREEZE 1…4 тоже упирается в ~1,5 столбца и даёт 47–48% выживания. Значит заморозки не лимит:
 * риск задаёт плотность черепов (RESCUE_SKULL_SHARE), а его трогать — решение автора. Оставлено авторское 1.
 */
export const RESCUE_FREEZE_PER_SPIN = 1;

/** Столько горит GOOD LUCK на экране банкомата, прежде чем начнётся раунд спасения, мс. */
export const GOOD_LUCK_TIME = 1600;

/**
 * На сколько счёт раунда откатывается, когда спасение выиграно. Магазин встанет перед исходным номером
 * (ShopScene.openShop(true, replayRound)) и не пересчитает долг: откат на 1 возвращает тот же номер раунда
 * и РОВНО то же число долга, что было до ямы — выживание долг не прощает, но и не растит, раунд играется заново
 * (решение автора 22.11.2026).
 */
export const WON_RESCUE_ROUND_STEP = 1;

/**
 * Можно ли ещё спасать забег: спасение одно за забег (решение автора 22.11.2026).
 * Флаг `rescueUsed` в RunSave липкий — откат кассетой его не снимает, иначе яму можно было бы фармить перемоткой
 * (так же устроен devUsed). Второй раз фишек на долг не хватило — сразу KABOOM, без GOOD LUCK и раунда спасения.
 * Правило одно для сцены (CollectorScene.callCollector) и симулятора.
 */
export function rescueAllowed(used: boolean): boolean {
  return !used;
}

/** Числа раунда спасения одним объектом: симулятор подменяет их ручками SIM_RESCUE_SKULL и SIM_RESCUE_FREEZE для замера. */
export interface RescueRules {
  spins: number;
  skullShare: number;
  freezePerSpin: number;
}

export const RESCUE_RULES: RescueRules = {
  spins: RESCUE_SPINS,
  skullShare: RESCUE_SKULL_SHARE,
  freezePerSpin: RESCUE_FREEZE_PER_SPIN,
};

/** Доля черепов в допустимых границах: мусор — число игры, иначе зажимаем в 10–70%. */
export function rescueSkullShare(share = RESCUE_SKULL_SHARE): number {
  if (!Number.isFinite(share)) return RESCUE_SKULL_SHARE;
  return Math.min(RESCUE_SKULL_SHARE_MAX, Math.max(RESCUE_SKULL_SHARE_MIN, share));
}

/**
 * Веса сетки спасения: платящие символы раунда плюс черепа с заданной долей клеток. Злых символов, кубика, билетов,
 * короны, клевера и джокера здесь нет: в спасении игрок собирает паттерн из обычных символов, а единственная
 * опасность — череп. Доля черепов задаётся тем же skullRatioFromShare, что и в обычной прокрутке.
 */
export function rescueWeightOf(round: number, share = rescueSkullShare()): WeightOf {
  const base = weightsForRound(round);
  let others = 0;
  for (const symbol of SYMBOLS) {
    if (isPaying(symbol) && base(symbol) > 0) others += base(symbol);
  }
  const skullWeight = others * skullRatioFromShare(rescueSkullShare(share));
  return (symbol: SlotSymbol): number => {
    if (symbol.id === 'skull') return skullWeight;
    return isPaying(symbol) && base(symbol) > 0 ? base(symbol) : 0;
  };
}

/**
 * Собран ли в сетке хотя бы один платящий паттерн. Паттерн из черепов паттерном не считается: он не спасает,
 * а именно от него и убегают. Джекпот (все 15 клеток) сюда входит — он тоже платящий.
 */
export function rescueHasPattern(grid: Grid): boolean {
  return findPatterns(grid).some((hit) => isPaying(hit.symbol));
}

/** Итог после прокрутки: собрал паттерн — выжил; прокрутки кончились — умер; иначе крутим дальше. */
export type RescueOutcome = 'won' | 'continue' | 'dead';

export function rescueOutcome(grid: Grid, spinsLeft: number): RescueOutcome {
  if (rescueHasPattern(grid)) return 'won';
  return Number.isFinite(spinsLeft) && spinsLeft > 0 ? 'continue' : 'dead';
}

/**
 * Столбцы, которые крутятся: все, кроме замороженных. Значения вне 0…4 и мусор отбрасываются — испорченный вход
 * не должен оставить спасение без прокрутки. Пустой список значит «крутить нечего»: сцена и симулятор это
 * проверяют и не дают заморозить последний столбец (rescueFreezeVerdict).
 */
export function rescueSpinningColumns(frozen: readonly number[] = []): number[] {
  const kept = new Set<number>();
  for (const col of frozen) {
    if (Number.isInteger(col) && col >= 0 && col < GRID_COLUMNS) kept.add(col);
  }
  const columns: number[] = [];
  for (let col = 0; col < GRID_COLUMNS; col++) if (!kept.has(col)) columns.push(col);
  return columns;
}

/** Почему заморозку/разморозку нельзя: ok — можно; used — ход уже потрачен; last — нельзя заморозить последний столбец; bad — нет такого. */
export type RescueFreezeVerdict = 'ok' | 'used' | 'last' | 'bad';

/**
 * Одно правило заморозки — для сцены и симулятора: за ход разрешено ровно одно действие (used),
 * последний незамороженный столбец морозить нельзя (иначе прокручивать нечего), несуществующий — нельзя (bad).
 * Разморозить можно в любой момент, пока действие не потрачено: это тоже одно действие.
 */
export function rescueFreezeVerdict(frozen: readonly number[], col: number, used = false): RescueFreezeVerdict {
  if (!Number.isInteger(col) || col < 0 || col >= GRID_COLUMNS) return 'bad';
  if (used) return 'used';
  const isFrozen = frozen.includes(col);
  if (!isFrozen && rescueSpinningColumns(frozen).length <= 1) return 'last';
  return 'ok';
}

/** Новый список замороженных после клика. null — ход нельзя (см. rescueFreezeVerdict). */
export function rescueToggleFrozen(
  frozen: readonly number[],
  col: number,
  used = false,
): { frozen: number[]; used: boolean } | null {
  if (rescueFreezeVerdict(frozen, col, used) !== 'ok') return null;
  const next = new Set(frozen.filter((value) => Number.isInteger(value) && value >= 0 && value < GRID_COLUMNS));
  if (next.has(col)) next.delete(col);
  else next.add(col);
  return { frozen: [...next].sort((a, b) => a - b), used: true };
}

/**
 * Прокрутка спасения: незамороженные столбцы получают новые символы, замороженные остаются как были.
 * Пустая сетка (первая прокрутка) строится целиком. symbolAt можно подменить в тестах — тогда результат
 * детерминирован; в игре это randomSymbol с весами rescueWeightOf.
 */
export function rescueSpin(
  grid: Grid | null,
  frozen: readonly number[],
  weightOf: WeightOf,
  symbolAt: () => SlotSymbol = () => randomSymbol(weightOf),
): Grid {
  const next: Grid = [];
  for (let row = 0; row < GRID_ROWS; row++) next.push([]);
  const frozenSet = new Set(frozen.filter((value) => Number.isInteger(value) && value >= 0 && value < GRID_COLUMNS));
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col++) {
      const old = grid?.[row]?.[col];
      next[row][col] = frozenSet.has(col) && old ? old : symbolAt();
    }
  }
  return next;
}

/** Сколько прокруток останется после одной: не ниже нуля, мусор — 0. */
export function rescueSpinsAfter(spinsLeft: number): number {
  return Number.isFinite(spinsLeft) ? Math.max(0, Math.floor(spinsLeft) - 1) : 0;
}

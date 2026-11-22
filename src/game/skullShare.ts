import { amuletWeight, type AmuletId } from './amulets';
import { freeSpinWeight } from './bonus';
import type { SymbolLuck } from './dealerGame';
import { diceWeight } from './evil';
import { boostWeight, RISK_SKULL_FACTOR, type ItemEffects } from './items';
import { machineSkullFactor, machineSymbolAllowed, type MachineId } from './machines';
import { isDice, isSkull, SYMBOLS, weightsForRound, type SlotSymbol, type WeightOf } from './rules';

/**
 * Вес символа в прокрутке и доля черепов — те же числа, что видит игрок на плашке «💀 N%» и по которым крутится сетка.
 * Вынесено из RoundScene отдельным модулем (без Phaser), чтобы долю считали одним и тем же кодом сцена,
 * плашка и ачивка «50 на 50», а не три раза по-своему. Сюда входят только правила: ни звука, ни картинок.
 */

/** Всё, от чего зависит вес символа, кроме самого символа и базовых весов раунда. */
export interface WeightContext {
  machineId: MachineId;
  amulets: readonly AmuletId[];
  effects: ItemEffects;
  skullMul?: number; // поправка веса черепа от сделки Дилера (dealerGame.skullShareWeightMul); без неё — 1
  symbolLuck?: SymbolLuck; // сделка №11: выбранному символу +, остальным −; без неё веса обычные
  symbolBonus?: Partial<Record<string, number>>; // улучшения №23/24: клеверу и вишне + к весу (upgrades.symbolWeightBonus)
  // Действия вне прокрутки (шаг 29): обмен весов двух символов (№2) и проданные символы (№8) — до конца раунда.
  // Через них же считается доля черепов на плашке, поэтому прокрутка и плашка показывают одно число.
  swapSymbols?: { from: string; to: string } | null;
  dropSymbols?: readonly string[];
}

/**
 * Вес символа с поправкой сделки №11: выбранному +plus, каждому другому −minus, но не ниже нуля.
 * Черепа не трогаем (сделка про символы), а символа, которого в автомате нет (вес 0), тоже — иначе сделка
 * открыла бы закрытый символ или прибавила вес тому, чего в этом автомате не бывает.
 */
export function symbolLuckWeight(symbol: SlotSymbol, weight: number, luck: SymbolLuck): number {
  if (isSkull(symbol) || !(weight > 0)) return weight;
  if (symbol.id === luck.id) return weight + luck.plus;
  return Math.max(0, weight - luck.minus);
}

/**
 * Вес символа в этой прокрутке: обычный вес раунда, его меняют амулеты (огранка, череп в кармане), автомат,
 * бусты предметов (чеснок, вишни…) и риск. isFree — бесплатная прокрутка: в ней нет черепов, кубика, пауков,
 * замков и крови.
 */
export function symbolWeightOf(symbol: SlotSymbol, base: WeightOf, ctx: WeightContext, isFree: boolean): number {
  // Автомат: у «Тихого» нет паука, замка, крови и клевера, у «Жадного» черепа тяжелее.
  if (!machineSymbolAllowed(ctx.machineId, symbol)) return 0;
  // Действия раунда (шаг 29): проданного символа (№8) в автомате нет, а обмен (№2) меняет веса местами —
  // и в прокрутке, и на плашке доли черепов. Меняются веса базы: амулеты и бусты символа остаются его собственными.
  const baseWeight = actionBaseWeight(symbol, base, ctx);
  const skullFactor = isSkull(symbol) ? machineSkullFactor(ctx.machineId) : 1;
  const machined = amuletWeight(symbol, baseWeight, [...ctx.amulets]) * skullFactor;
  // Улучшения №23/24 (шаг 28б): клевер и вишня тяжелее на 1. Символ, которого в автомате нет (вес 0), добавка
  // не открывает — иначе клевер выпадал бы до 7-го раунда, а у «Тихого» появился бы вовсе.
  const bonus = ctx.symbolBonus?.[symbol.id] ?? 0;
  const withBonus = bonus > 0 && machined > 0 ? machined + bonus : machined;
  let weight = boostWeight(symbol, withBonus, ctx.effects); // чеснок: череп легче, вишни: вишня тяжелее
  if (ctx.symbolLuck !== undefined) weight = symbolLuckWeight(symbol, weight, ctx.symbolLuck); // сделка №11
  if (ctx.skullMul !== undefined && isSkull(symbol)) weight *= ctx.skullMul; // сделка Дилера: черепов больше
  if (ctx.effects.risk && isSkull(symbol)) weight *= RISK_SKULL_FACTOR; // риск: черепа втрое чаще
  if (ctx.effects.luckSpin && isSkull(symbol)) weight = 0; // фарт: на этой прокрутке черепов нет
  return isFree ? freeSpinWeight(symbol, weight) : weight;
}

/**
 * Базовый вес символа с поправками действий раунда: проданный символ (№8) весит 0, а обмен (№2) меняет
 * базовые веса двух символов местами. Функция — одна на прокрутку и на плашку доли черепов:
 * `skullShareOf` ходит тем же путём, поэтому числа не разъезжаются.
 */
function actionBaseWeight(symbol: SlotSymbol, base: WeightOf, ctx: WeightContext): number {
  if (ctx.dropSymbols?.includes(symbol.id)) return 0;
  const swap = ctx.swapSymbols;
  if (swap) {
    if (symbol.id === swap.to) return base(symbolOf(swap.from) ?? symbol);
    if (symbol.id === swap.from) return base(symbolOf(swap.to) ?? symbol);
  }
  return base(symbol);
}

/** Символ по id (для обмена весов): в SYMBOLS все символы автомата, других не бывает. */
function symbolOf(id: string): SlotSymbol | undefined {
  return SYMBOLS.find((symbol) => symbol.id === id);
}

/**
 * Доля клеток-черепов в следующей платной прокрутке: черепа / все символы, кроме кубика. Считается по тем же весам,
 * что и прокрутка (symbolWeightOf), поэтому амулеты на черепа, автомат и предметы уже внутри.
 * Бесплатные прокрутки сюда не входят: черепов в них нет всегда.
 */
export function skullShareOf(round: number, diceDrought: number, ctx: WeightContext): number {
  const base = weightsForRound(round, diceWeight(diceDrought));
  let skull = 0;
  let others = 0;
  for (const symbol of SYMBOLS) {
    const weight = symbolWeightOf(symbol, base, ctx, false);
    if (isSkull(symbol)) skull = weight;
    else if (!isDice(symbol)) others += weight;
  }
  return skull + others > 0 ? skull / (skull + others) : 0;
}

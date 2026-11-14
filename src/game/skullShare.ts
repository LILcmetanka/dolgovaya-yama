import { amuletWeight, type AmuletId } from './amulets';
import { freeSpinWeight } from './bonus';
import { diceWeight } from './evil';
import { boostWeight, RISK_SKULL_FACTOR, type ItemEffects } from './items';
import { bigChargeFactor, skullChargeFactor, CHARGE_BIG_PRICE } from './levers';
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
  charge: number; // замах рычага 0…1: двигает вес черепа и дорогих символов
}

/**
 * Вес символа в этой прокрутке: обычный вес раунда, его меняют амулеты (огранка, череп в кармане), автомат,
 * бусты предметов (чеснок, вишни…), риск, фарт и замах рычага. isFree — бесплатная прокрутка: в ней
 * нет черепов, кубика, пауков, замков и крови.
 */
export function symbolWeightOf(symbol: SlotSymbol, base: WeightOf, ctx: WeightContext, isFree: boolean): number {
  // Автомат: у «Тихого» нет паука, замка, крови и клевера, у «Жадного» черепа тяжелее.
  if (!machineSymbolAllowed(ctx.machineId, symbol)) return 0;
  const skullFactor = isSkull(symbol) ? machineSkullFactor(ctx.machineId) : 1;
  const machined = amuletWeight(symbol, base(symbol), [...ctx.amulets]) * skullFactor;
  let weight = boostWeight(symbol, machined, ctx.effects); // чеснок: череп легче, вишни: вишня тяжелее
  if (ctx.effects.risk && isSkull(symbol)) weight *= RISK_SKULL_FACTOR; // риск: черепа втрое чаще
  if (ctx.effects.luckSpin && isSkull(symbol)) weight = 0; // фарт: на этой прокрутке черепов нет
  // Замах рычага: сильный — черепа чаще и крупные символы тоже, слабый — тихо и безопасно.
  // Выплаты заряд не меняет: двигаются только веса (DONTLIKE п. 8).
  // Бесплатные прокрутки заряд не спрашивают вовсе: у них свои правила, и ослаблять их корону нельзя.
  if (!isFree) {
    if (isSkull(symbol)) weight *= skullChargeFactor(ctx.charge);
    else if (symbol.price >= CHARGE_BIG_PRICE) weight *= bigChargeFactor(ctx.charge);
  }
  return isFree ? freeSpinWeight(symbol, weight) : weight;
}

/**
 * Доля клеток-черепов в следующей платной прокрутке: черепа / все символы, кроме кубика. Считается по тем же весам,
 * что и прокрутка (symbolWeightOf), поэтому амулеты на черепа, автомат, предметы и замах с рычага уже внутри.
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

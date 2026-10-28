import { GAME_CONFIG } from './gameConfig';
import { isSkull, type SlotSymbol } from './rules';

/**
 * Фазы забега: правила меняются по ходу забега. Фаза 1 — знакомство. Фаза 2 «автомат злится» — черепов больше,
 * но и множитель серии растёт быстрее: риск и награда, выбор «крутить или забрать» острее.
 * Фаза наступает по прогрессу игрока — по числу закрытых долгов (это и есть счёт). Без Phaser.
 */

/** Фаза: с какого прогресса она идёт и что меняет. */
export interface Phase {
  number: number; // номер — его показывает новость «ФАЗА 2»
  fromDebts: number; // условие: с какого числа закрытых долгов (счёта) идёт фаза
  skullFactor: number; // параметр 1: вес черепа во столько раз больше
  multiplierBonus: number; // параметр 2: множитель серии растёт на столько больше за прокрутку
}

/** Все фазы по порядку. Фаза 1 ничего не меняет; числа фазы 2 — ручки в gameConfig.ts (подобраны симуляцией). */
export const PHASES: Phase[] = [
  { number: 1, fromDebts: 0, skullFactor: 1, multiplierBonus: 0 },
  {
    number: 2,
    fromDebts: GAME_CONFIG.phase2Debts, // после первого долга
    skullFactor: GAME_CONFIG.phase2SkullFactor, // паттерн из черепов 16% → 29% прокруток
    multiplierBonus: GAME_CONFIG.phase2MultiplierBonus, // множитель ×1, ×3, ×5…
  },
];

/** Какая фаза идёт, когда закрыто closedDebts долгов: последняя из тех, что уже начались. */
export function phaseAt(closedDebts: number): Phase {
  let current = PHASES[0];
  for (const phase of PHASES) {
    if (closedDebts >= phase.fromDebts) current = phase;
  }
  return current;
}

/** Вес символа в фазе: черепов больше в skullFactor раз. */
export function phaseWeight(symbol: SlotSymbol, weight: number, phase: Phase): number {
  return isSkull(symbol) ? weight * phase.skullFactor : weight;
}

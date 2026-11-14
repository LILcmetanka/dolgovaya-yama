import { GAME_CONFIG } from './gameConfig';

/**
 * Фазы забега: правила меняются по ходу забега. Фаза 1 — знакомство. Фаза 2 «автомат злится» — в раунде на одну
 * прокрутку больше: игрок получает запас на долг, но черепа к этому времени уже стали чаще сами по себе
 * (skullShare в rules.ts растёт с каждым раундом) — замечание 19.
 * Фаза наступает по прогрессу игрока — по числу закрытых долгов (это и есть счёт). Без Phaser.
 */

/** Фаза: с какого прогресса она идёт и что меняет. */
export interface Phase {
  number: number; // номер — его показывает новость «ФАЗА 2»
  fromDebts: number; // условие: с какого числа закрытых долгов (счёта) идёт фаза
  multiplierBonus: number; // параметр 1: множитель серии растёт на столько больше за прокрутку (0 — шаг остаётся 1)
  bonusSpins: number; // параметр 2: столько прокруток добавляется в начале раунда
}

/** Все фазы по порядку. Фаза 1 ничего не меняет; числа фазы 2 — ручки в gameConfig.ts. */
export const PHASES: Phase[] = [
  { number: 1, fromDebts: 0, multiplierBonus: 0, bonusSpins: 0 },
  {
    number: 2,
    fromDebts: GAME_CONFIG.phase2Debts, // после первого долга
    multiplierBonus: GAME_CONFIG.phase2MultiplierBonus, // 0: шаг множителя 1, окно показывает ×1, ×2, ×3
    bonusSpins: GAME_CONFIG.phase2BonusSpins, // +1 прокрутка в раунде вместо прежнего роста веса черепа
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

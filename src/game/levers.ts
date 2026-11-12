import { GAME_CONFIG } from './gameConfig';
import { isDice, isSkull, type SlotSymbol } from './rules';

/**
 * «Три ручки» (шаг 70): липкий режим платной прокрутки, а не кнопка на каждый ход.
 * Обычная — как есть; «риск» — черепа чаще и выигрыш больше; «спокойно» — ни черепов, ни кубика, ни выплат, только серия +1.
 * Выбор запоминается в localStorage и переключается между прокрутками. Бесплатные прокрутки, смена автомата
 * и последний шанс идут обычными правилами — они режим не спрашивают.
 * Без Phaser (как progress.ts): модуль грузится и в браузере, и в Node-симуляторе.
 */

export type SpinMode = 'normal' | 'risk' | 'calm';

/** Все режимы по кругу — в этом порядке переключает клавиша T. */
export const SPIN_MODES: readonly SpinMode[] = ['normal', 'risk', 'calm'];

const MODE_KEY = 'dolgovaya-yama-spin-mode'; // ключ выбранного режима в localStorage

let mode: SpinMode = loadMode();

/** Режим из localStorage; нет его, битое или чужое значение — «обычно». */
function loadMode(): SpinMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === 'risk' || saved === 'calm' ? saved : 'normal';
  } catch {
    return 'normal'; // хранилище запрещено — режим по умолчанию
  }
}

/** Какой режим выбран сейчас (он же и у следующей платной прокрутки). */
export function spinMode(): SpinMode {
  return mode;
}

/** Выбрать режим и запомнить его. */
export function setSpinMode(next: SpinMode): void {
  mode = next;
  try {
    localStorage.setItem(MODE_KEY, next);
  } catch {
    // не запомнили — в следующий раз снова «обычно»
  }
}

/** Следующий режим по кругу: обычно → риск → спокойно → обычно. */
export function nextSpinMode(): SpinMode {
  const index = SPIN_MODES.indexOf(mode);
  return SPIN_MODES[(index + 1) % SPIN_MODES.length];
}

/**
 * Вес символа в этой прокрутке с поправкой на режим. «Спокойно» убирает черепа и кубик совсем (вес 0),
 * «риск» делает череп тяжелее, обычная прокрутка не меняет ничего.
 */
export function modeWeight(symbol: SlotSymbol, weight: number, mode: SpinMode): number {
  if (mode === 'calm') return isSkull(symbol) || isDice(symbol) ? 0 : weight;
  if (mode === 'risk' && isSkull(symbol)) return weight * GAME_CONFIG.modeSkullFactor;
  return weight;
}

/** Во сколько раз режим увеличивает выигрыш: «риск» — ×2, «спокойно» — ничего не платит (0), обычный — ×1. */
export function winModeFactor(mode: SpinMode): number {
  if (mode === 'calm') return 0;
  if (mode === 'risk') return GAME_CONFIG.modeWinFactor;
  return 1;
}

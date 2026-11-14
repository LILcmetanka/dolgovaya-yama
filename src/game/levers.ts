/**
 * Замах рычага (DONTLIKE п. 8, вариант А): вместо трёх режимов прокрутки — заряд 0…1.
 * Держишь рычаг (пробел, Enter или мышь) — шкала идёт от CHARGE_MIN до CHARGE_MAX за CHARGE_FULL_TIME,
 * отпускаешь — прокрутка с этим зарядом. Сильный замах: черепа чаще, дорогие символы (а с ними крупные
 * паттерны ×2/×3) выпадают чаще. Слабый — тихо и безопасно. Выплаты, множители и цель заряд не трогает:
 * он пересчитывает только веса символов. Бесплатные прокрутки, смена автомата и последний шанс идут зарядом 0.
 * Без Phaser: модуль грузится и в браузере, и в Node-симуляторе.
 */

export type ChargeSource = 'key' | 'lever'; // чем начали замах: клавишей или мышью по рычагу

export const CHARGE_MIN = 0; // отпустил сразу — заряд 0: тихо и безопасно
export const CHARGE_MAX = 1; // полный замах
export const CHARGE_FULL_TIME = 1200; // мс: столько держать рычаг до полного заряда
export const RISK_CHARGE = 0.7; // с этого заряда прокрутка считается «рискованной» (ачивки про риск)
export const CHARGE_SKULL_SWING = 0.3; // вес черепа: 0,7× на нуле — 1,0× в середине — 1,3× на полном
export const CHARGE_BIG_SWING = 0.5; // дорогие символы: 0,75× на нуле — 1,0× в середине — 1,25× на полном
export const CHARGE_BIG_PRICE = 9; // с этой цены символ считается «крупным» (🔔 9, 💎 15, 7 25)
export const CHARGE_NEUTRAL = 0.5; // на этом заряде веса символов такие же, как без замаха

/** Заряд в допустимых границах: NaN и мусор снаружи — нейтральная середина, иначе вес символа стал бы NaN. */
export function clampCharge(charge: number): number {
  if (!Number.isFinite(charge)) return CHARGE_NEUTRAL;
  return Math.min(CHARGE_MAX, Math.max(CHARGE_MIN, charge));
}

/** Заряд по времени удержания рычага: 0…1, полный — ровно за CHARGE_FULL_TIME. */
export function chargeValue(elapsed: number): number {
  return clampCharge(elapsed / CHARGE_FULL_TIME);
}

/** Множитель веса черепа от заряда: слабый замах — черепов меньше базы, сильный — больше. */
export function skullChargeFactor(charge: number): number {
  return 1 + CHARGE_SKULL_SWING * (2 * clampCharge(charge) - 1);
}

/** Множитель веса дорогого символа от заряда: сильный замах чаще даёт крупные паттерны. */
export function bigChargeFactor(charge: number): number {
  return 1 + CHARGE_BIG_SWING * (clampCharge(charge) - CHARGE_NEUTRAL);
}

/** Считается ли прокрутка «рискованной»: заряд выше порога (ачивки про риск). */
export function isRiskyCharge(charge: number): boolean {
  return clampCharge(charge) >= RISK_CHARGE;
}

// Текущий замах. Часы — performance.now(): он есть и в браузере, и в Node.
let startedAt = 0; // когда нажали рычаг
let charging = false; // рычаг держат прямо сейчас
let last = 0; // заряд прошлой прокрутки: его показывает шкала в покое и читают ачивки

/** Начали держать рычаг. */
export function startCharge(now = performance.now()): void {
  startedAt = now;
  charging = true;
}

/** Заряд сейчас: пока держат — по времени, в покое — заряд прошлой прокрутки (для шкалы). */
export function chargeNow(now = performance.now()): number {
  return charging ? chargeValue(now - startedAt) : last;
}

/** Отпустили рычаг: вернуть заряд этой прокрутки и запомнить его для шкалы. */
export function releaseCharge(now = performance.now()): number {
  const value = chargeNow(now);
  charging = false;
  last = value;
  return value;
}

/** Заряд прошлой прокрутки (0 — ещё ни разу не тянули или тянули в самом начале). */
export function lastCharge(): number {
  return last;
}

/**
 * Отменить замах без прокрутки: рычаг отпущен, заряд 0. Одна дверь и для смены состояния (пауза, магазин,
 * планшет), и для нового забега с откатом кассетой — поведение у них одно и то же.
 */
export function cancelCharge(): void {
  charging = false;
  startedAt = 0;
  last = 0;
}

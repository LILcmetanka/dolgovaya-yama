/**
 * Игра Дилера «больше или меньше»: на экране выпал кубик 🎲 — Дилер открывает карту, угадай,
 * следующая больше или меньше. Угадал — кон ×DEALER_WIN_FACTOR (×1,5), можно остановиться или играть дальше.
 * Не угадал — кон сгорает; ничья — тоже проигрыш: ничья за Дилером. Отказаться нельзя: первая ставка обязательна.
 * На кону пусто — ставит Дилер (DEALER_STAKE_SHARE долга): тогда первый раз рискуешь ничем.
 * Без Phaser — только числа и маленькие функции.
 */

export const CARD_MIN = 1;
export const CARD_MAX = 10;
export const DEALER_WIN_FACTOR = 1.5; // угадал — кон во столько раз больше (×2 делал Дилера слишком щедрым — симуляция)
export const DEALER_STAKE_SHARE = 0.1; // пустой кон: Дилер ставит такую долю долга
const STAKE_ROUND_TO = 5;

export type Guess = 'higher' | 'lower';

/** Случайная карта от CARD_MIN до CARD_MAX. */
export function randomCard(): number {
  return CARD_MIN + Math.floor(Math.random() * (CARD_MAX - CARD_MIN + 1));
}

/** Угадал ли: следующая карта больше (или меньше) этой. Ничья — не угадал. */
export function isGuessRight(card: number, next: number, guess: Guess): boolean {
  return guess === 'higher' ? next > card : next < card;
}

/** Шанс угадать: сколько карт из колоды подходят. Для симуляции: игрок в ней решает по шансу, играть ли дальше. */
export function guessChance(card: number, guess: Guess): number {
  const cards = CARD_MAX - CARD_MIN + 1;
  const fitting = guess === 'higher' ? CARD_MAX - card : card - CARD_MIN;
  return fitting / cards;
}

/** Что на кону в игре Дилера: кон или, если он пустой, ставка Дилера. */
export function dealerStake(pot: number, debt: number): number {
  if (pot > 0) return pot;
  return Math.max(STAKE_ROUND_TO, Math.round((debt * DEALER_STAKE_SHARE) / STAKE_ROUND_TO) * STAKE_ROUND_TO);
}

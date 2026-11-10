/**
 * Игра Дилера «больше, равно или меньше»: на экране выпал кубик 🎲 — Дилер открывает карту, угадай,
 * следующая больше, меньше или такая же. «>» и «<» угадал — кон ×DEALER_WIN_FACTOR (×1,5), ничья при них — проигрыш:
 * ничья за Дилером. «=» угадал (шанс 1 из 10) — кон ×DEALER_EQUAL_FACTOR (×8). Угадал — можно остановиться или играть дальше.
 * Не угадал — кон сгорает. Отказаться нельзя: первая ставка обязательна.
 * На кону пусто — ставит Дилер (DEALER_STAKE_SHARE долга): тогда первый раз рискуешь ничем.
 * Без Phaser — только числа и маленькие функции.
 */

export const CARD_MIN = 1;
export const CARD_MAX = 10;
export const DEALER_WIN_FACTOR = 1.5; // угадал «>» или «<» — кон во столько раз больше (×2 делал Дилера слишком щедрым — симуляция)
// Угадал «=» — кон во столько раз больше. Честно было бы ×10 (шанс 1 из 10); ×8 — лотерея чуть хуже стрелок, но на средней карте,
// где у стрелок шанс 50%, «=» сразу выгоднее (0,8 против 0,75). ×12 и больше — «=» выгоднее всего, всегда (симуляция шага 42).
export const DEALER_EQUAL_FACTOR = 8;
export const DEALER_STAKE_SHARE = 0.1; // пустой кон: Дилер ставит такую долю долга
const STAKE_ROUND_TO = 5;

export type Guess = 'higher' | 'lower' | 'equal';

/** Случайная карта от CARD_MIN до CARD_MAX. */
export function randomCard(): number {
  return CARD_MIN + Math.floor(Math.random() * (CARD_MAX - CARD_MIN + 1));
}

/** Угадал ли: следующая карта больше, меньше или такая же. Ничья при «>» и «<» — не угадал. */
export function isGuessRight(card: number, next: number, guess: Guess): boolean {
  if (guess === 'equal') return next === card;
  return guess === 'higher' ? next > card : next < card;
}

/** Во сколько раз растёт кон, если угадал. */
export function winFactor(guess: Guess): number {
  return guess === 'equal' ? DEALER_EQUAL_FACTOR : DEALER_WIN_FACTOR;
}

/** Шанс угадать: сколько карт из колоды подходят. Для симуляции: игрок в ней решает по шансу, играть ли дальше. */
export function guessChance(card: number, guess: Guess): number {
  const cards = CARD_MAX - CARD_MIN + 1;
  if (guess === 'equal') return 1 / cards;
  const fitting = guess === 'higher' ? CARD_MAX - card : card - CARD_MIN;
  return fitting / cards;
}

/** Может ли выбор выиграть: у самой маленькой карты «<» не выиграет никогда, у самой большой — «>». Такой выбор тусклый. */
export function canGuessWin(card: number, guess: Guess): boolean {
  return guessChance(card, guess) > 0;
}

/** Что на кону в игре Дилера: кон или, если он пустой, ставка Дилера. */
export function dealerStake(pot: number, debt: number): number {
  if (pot > 0) return pot;
  return Math.max(STAKE_ROUND_TO, Math.round((debt * DEALER_STAKE_SHARE) / STAKE_ROUND_TO) * STAKE_ROUND_TO);
}

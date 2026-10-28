import type { Cell } from './patterns';
import type { Grid } from './rules';

/**
 * Злые символы и кубик Дилера — что они делают, когда лежат на экране. Без Phaser.
 * 🕷 паук съедает часть кона; 🔒 замок блокирует свой столбец (правило — в patterns.ts);
 * 🩸 кровь: следующая прокрутка ×3, но черепа в ней сжигают ещё и часть табло;
 * 🎲 кубик: Дилер предлагает игру (dealerGame.ts). Пока кубика нет, его шанс растёт — «подстраховка».
 */

export const SPIDER_BITE = 0.1; // каждый паук на экране съедает такую долю кона
export const BLOOD_WIN = 3; // кровавая прокрутка: выигрыш во столько раз больше (с ×2 риск того не стоил)…
export const BLOOD_BOARD_BURN = 0.25; // …а паттерн из черепов в ней сжигает ещё такую долю фишек на табло
export const DICE_BASE_WEIGHT = 0.5; // вес кубика сразу после того, как он выпал
export const DICE_WEIGHT_STEP = 0.1; // каждая прокрутка без кубика — вес на столько больше
export const DICE_MAX_WEIGHT = 2; // так игра Дилера — примерно раз за раунд

/** Клетки, где лежит символ id. */
export function cellsOf(grid: Grid, id: string): Cell[] {
  const cells: Cell[] = [];
  grid.forEach((line, row) => line.forEach((symbol, col) => {
    if (symbol.id === id) cells.push([row, col]);
  }));
  return cells;
}

/** Сколько фишек съедают пауки: каждый — SPIDER_BITE кона, но не больше всего кона. */
export function spiderBite(pot: number, spiders: number): number {
  return Math.min(pot, Math.floor(pot * SPIDER_BITE * spiders));
}

/** Вес кубика в следующей прокрутке: drought — сколько прокруток подряд его не было. */
export function diceWeight(drought: number): number {
  return Math.min(DICE_MAX_WEIGHT, DICE_BASE_WEIGHT + drought * DICE_WEIGHT_STEP);
}

/** Сколько фишек с табло сжигают черепа в кровавой прокрутке. */
export function bloodBurn(balance: number): number {
  return Math.floor(balance * BLOOD_BOARD_BURN);
}

import type { Words } from './lang';
import { GRID_COLUMNS, type Grid } from './rules';

/**
 * Мелкие правила, которые касаются сетки и автомата, но не его спеки (спеки — в machines.ts):
 * ржавчина столбца и формат множителей для подсказок. Три автомата со своими характерами живут в machines.ts
 * и меняются сами в начале раунда — игрок их не выбирает.
 * Ржавчина оставлена на будущее: механика рабочая, но у всех трёх автоматов rustChance = 0, и она не включается.
 * Без Phaser — чтобы проверить симуляцией.
 */

/** «×1,5» по-русски и «×1.5» по-английски: числа в описаниях — из констант (machines.ts, panel.ts). */
export function times(factor: number): Words {
  return { ru: `×${String(factor).replace('.', ',')}`, en: `×${factor}` };
}

/**
 * Заржавеет ли столбец после прокрутки: его номер или null. chance — из спеки автомата (machines.ts).
 * На будущее: у всех трёх автоматов он 0, и тогда случайность не тратится.
 */
export function rustColumn(chance: number): number | null {
  if (chance === 0 || Math.random() >= chance) return null;
  return Math.floor(Math.random() * GRID_COLUMNS);
}

/** Прокрутка с заржавевшим столбцом column: в нём остаются символы прошлой прокрутки previous, остальное — из новой сетки grid. */
export function jamGrid(grid: Grid, previous: Grid, column: number): Grid {
  return grid.map((cells, row) => cells.map((symbol, col) => (col === column ? previous[row][col] : symbol)));
}

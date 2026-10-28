import type { Words } from './lang';
import { DEBT_ROUND_TO, GRID_COLUMNS, type Grid, type SlotSymbol } from './rules';

/**
 * Автоматы «с характером». Первый автомат забега — обычный. Выстрелил в автомат — приходит другой, со своим характером:
 * свои веса символов, свои выплаты и одно особое правило. Он стоит до следующего выстрела.
 * Характер видно по цвету корпуса и значку на нём; что автомат делает — в подсказке значка. Без Phaser — чтобы проверить симуляцией.
 */

export type CharacterId = 'ordinary' | 'greedy' | 'fruity' | 'lucky' | 'rusty';

export interface MachineCharacter {
  id: CharacterId;
  sign: string; // значок на корпусе
  name: Words; // название — в новости, когда автомат пришёл, и в подсказке значка
  description: Words; // что автомат делает — в подсказке значка
  color: number; // цвет корпуса
  weights: Partial<Record<string, number>>; // id символа → во сколько раз чаще он выпадает (0,5 — вдвое реже)
  winFactor: number; // все выигрыши во столько раз больше
  debtFactor: number; // долги во столько раз больше
  rustChance: number; // после прокрутки один столбец ржавеет с таким шансом: в следующей прокрутке он не крутится
}

// Числа характеров. Подобраны симуляцией.
export const GREEDY_SKULLS = 1.5; // Жадный: черепов во столько раз больше…
export const GREEDY_WIN = 2.5; // …зато все выигрыши во столько раз больше
export const FRUITY_FRUITS = 2; // Фруктовый: 🍒 🍋 🍇 выпадают во столько раз чаще…
export const FRUITY_RARE = 0.5; // …💎 и 7 — реже (0,5 — вдвое)…
export const FRUITY_WIN = 0.5; // …и все выигрыши меньше: часто, но мелко
export const LUCKY_SKULLS = 0.8; // Счастливый: черепов меньше…
export const LUCKY_DEBT = 1.5; // …но долги во столько раз больше
export const RUST_CHANCE = 0.25; // Ржавый: после прокрутки столбец ржавеет с таким шансом

/** «×1,5» по-русски и «×1.5» по-английски: числа в описаниях — из констант выше. */
function times(factor: number): Words {
  return { ru: `×${String(factor).replace('.', ',')}`, en: `×${factor}` };
}

/** Обычный автомат: с него начинается забег, ничего не меняет. Значка у него нет. */
export const ORDINARY: MachineCharacter = {
  id: 'ordinary',
  sign: '',
  name: { ru: 'Обычный', en: 'Ordinary' },
  description: { ru: 'Обычный автомат', en: 'An ordinary machine' },
  color: 0x4c1111,
  weights: {},
  winFactor: 1,
  debtFactor: 1,
  rustChance: 0,
};

/** Автоматы с характером — приходят после выстрела, по одному случайно. */
export const CHARACTERS: MachineCharacter[] = [
  {
    id: 'greedy',
    sign: '💰',
    name: { ru: 'Жадный', en: 'Greedy' },
    description: {
      ru: `Черепов ${times(GREEDY_SKULLS).ru}, зато все выигрыши ${times(GREEDY_WIN).ru}`,
      en: `Skulls ${times(GREEDY_SKULLS).en}, but all wins ${times(GREEDY_WIN).en}`,
    },
    color: 0x7d5e0b,
    weights: { skull: GREEDY_SKULLS },
    winFactor: GREEDY_WIN,
    debtFactor: 1,
    rustChance: 0,
  },
  {
    id: 'fruity',
    sign: '🍉',
    name: { ru: 'Фруктовый', en: 'Fruity' },
    description: {
      ru: `🍒 🍋 🍇 выпадают ${times(FRUITY_FRUITS).ru}, 💎 и 7 — ${times(FRUITY_RARE).ru}, все выигрыши ${times(FRUITY_WIN).ru}`,
      en: `🍒 🍋 🍇 drop ${times(FRUITY_FRUITS).en}, 💎 and 7 ${times(FRUITY_RARE).en}, all wins ${times(FRUITY_WIN).en}`,
    },
    color: 0x1d4d1f,
    weights: { cherry: FRUITY_FRUITS, lemon: FRUITY_FRUITS, grape: FRUITY_FRUITS, diamond: FRUITY_RARE, seven: FRUITY_RARE },
    winFactor: FRUITY_WIN,
    debtFactor: 1,
    rustChance: 0,
  },
  {
    id: 'lucky',
    sign: '⭐',
    name: { ru: 'Счастливый', en: 'Lucky' },
    description: {
      ru: `Черепов ${times(LUCKY_SKULLS).ru}, но долги ${times(LUCKY_DEBT).ru}`,
      en: `Skulls ${times(LUCKY_SKULLS).en}, but debts ${times(LUCKY_DEBT).en}`,
    },
    color: 0x17365c,
    weights: { skull: LUCKY_SKULLS },
    winFactor: 1,
    debtFactor: LUCKY_DEBT,
    rustChance: 0,
  },
  {
    id: 'rusty',
    sign: '🔩',
    name: { ru: 'Ржавый', en: 'Rusty' },
    description: {
      ru: 'Иногда столбец ржавеет: в следующей прокрутке он не крутится',
      en: "Sometimes a column rusts: it won't spin next time",
    },
    color: 0x6e3b1c,
    weights: {},
    winFactor: 1,
    debtFactor: 1,
    rustChance: RUST_CHANCE,
  },
];

/** Вес символа на этом автомате: характер делает одни символы чаще, другие реже. */
export function characterWeight(symbol: SlotSymbol, weight: number, character: MachineCharacter): number {
  return weight * (character.weights[symbol.id] ?? 1);
}

/** Долг на этом автомате: обычный долг × debtFactor, округлённый, как все долги. */
export function characterDebt(debt: number, character: MachineCharacter): number {
  if (character.debtFactor === 1) return debt;
  return Math.round((debt * character.debtFactor) / DEBT_ROUND_TO) * DEBT_ROUND_TO;
}

/** Новый автомат после выстрела: случайный характер, но не тот, что был. */
export function randomCharacter(current: MachineCharacter): MachineCharacter {
  const others = CHARACTERS.filter((character) => character.id !== current.id);
  return others[Math.floor(Math.random() * others.length)];
}

/** Заржавеет ли столбец после прокрутки: его номер или null. Автомат без ржавчины случайность не тратит. */
export function rustColumn(character: MachineCharacter): number | null {
  if (character.rustChance === 0 || Math.random() >= character.rustChance) return null;
  return Math.floor(Math.random() * GRID_COLUMNS);
}

/** Прокрутка с заржавевшим столбцом column: в нём остаются символы прошлой прокрутки previous, остальное — из новой сетки grid. */
export function jamGrid(grid: Grid, previous: Grid, column: number): Grid {
  return grid.map((cells, row) => cells.map((symbol, col) => (col === column ? previous[row][col] : symbol)));
}

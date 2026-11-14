import { times } from './characters';
import type { Words } from './lang';

/**
 * Автоматы: три спеки со своими характерами, без прокачки и без выбора. Без Phaser — чтобы проверить симуляцией.
 * Забег начинается на классическом; в начале раунда стоящий автомат с редким шансом (MACHINE_SWAP_CHANCE)
 * сам меняется на один из двух других. Числа отсюда читают RoundScene (веса и выплаты) и MachineScene
 * (значок, ржавчина и смена), смена в раунде — machineAtRoundStart.
 */

export type MachineId = 'classic' | 'greedy' | 'quiet';

/** Паспорт автомата: что он даёт, чем платишь и как его рисовать. */
export interface MachineSpec {
  id: MachineId;
  sign: string; // значок на корпусе; у классического его нет — как у обычного автомата раньше
  name: Words;
  description: Words; // одной строкой: значок на корпусе и вкладка «Кто есть кто»
  color: number; // цвет корпуса
  winFactor: number; // все выигрыши во столько раз больше
  skullFactor: number; // вес черепа во столько раз больше
  banned: string[]; // id символов, которых в этом автомате не бывает
  rustChance: number; // шанс, что после прокрутки заедает столбец; на будущее: у всех трёх 0, механика ждёт своего автомата
}

// Числа автоматов.
export const GREEDY_WIN = 1.5; // Жадный: все выигрыши во столько раз больше…
export const GREEDY_SKULLS = 1.5; // …но и черепов во столько раз больше
export const QUIET_WIN = 0.7; // Тихий: выигрыши меньше…
export const QUIET_BANNED = ['spider', 'lock', 'blood', 'clover']; // …зато нет паука, замка, крови и клевера
export const MACHINE_SWAP_CHANCE = 0.1; // 10% (в диапазоне 5–10% по просьбе автора); константа для настройки: в начале раунда автомат может смениться сам

/** Классический: как обычный автомат — ничего не меняет. С него начинается забег. */
const CLASSIC: MachineSpec = {
  id: 'classic',
  sign: '',
  name: { ru: 'Классический', en: 'Classic' },
  description: { ru: 'Без бонусов и без подвоха', en: 'No bonuses, no tricks' },
  color: 0x4c1111,
  winFactor: 1,
  skullFactor: 1,
  banned: [],
  rustChance: 0,
};

/** Жадный: выигрыши больше, но черепа сыплются чаще. */
const GREEDY: MachineSpec = {
  id: 'greedy',
  sign: '💰',
  name: { ru: 'Жадный', en: 'Greedy' },
  description: {
    ru: `Все выигрыши ${times(GREEDY_WIN).ru}, но черепов ${times(GREEDY_SKULLS).ru}`,
    en: `All wins ${times(GREEDY_WIN).en}, but skulls ${times(GREEDY_SKULLS).en}`,
  },
  color: 0x7d5e0b,
  winFactor: GREEDY_WIN,
  skullFactor: GREEDY_SKULLS,
  banned: [],
  rustChance: 0,
};

/** Тихий: без злых символов и клевера, зато платит меньше. */
const QUIET: MachineSpec = {
  id: 'quiet',
  sign: '🌙',
  name: { ru: 'Тихий', en: 'Quiet' },
  description: {
    ru: `Нет 🕷 🔒 🩸 🍀, выигрыши ${times(QUIET_WIN).ru}`,
    en: `No 🕷 🔒 🩸 🍀, wins ${times(QUIET_WIN).en}`,
  },
  color: 0x17365c,
  winFactor: QUIET_WIN,
  skullFactor: 1,
  banned: QUIET_BANNED,
  rustChance: 0,
};

/** Все автоматы в том порядке, в каком они стоят строками в «Кто есть кто». Первый — с него начинается забег. */
export const MACHINES: MachineSpec[] = [CLASSIC, GREEDY, QUIET];

/** Спека автомата по id: цвет, значок, паспорт. Мусорный id — классический. */
export function machineSpec(id: MachineId): MachineSpec {
  return MACHINES.find((machine) => machine.id === id) ?? CLASSIC;
}

/** Автомат в начале раунда round: иногда меняется сам на один из двух других. Первый раунд — всегда текущий. */
export function machineAtRoundStart(current: MachineId, round: number, chance = MACHINE_SWAP_CHANCE): MachineId {
  if (round <= 1 || Math.random() >= chance) return current;
  const others = MACHINES.filter((machine) => machine.id !== current); // ровно два других
  return others[Math.floor(Math.random() * others.length)].id;
}

/** Во сколько раз больше все выигрыши: характер автомата. */
export function machineWinFactor(id: MachineId): number {
  return machineSpec(id).winFactor;
}

/** Множитель веса черепа: характер автомата. */
export function machineSkullFactor(id: MachineId): number {
  return machineSpec(id).skullFactor;
}

/** Бывает ли такой символ в этом автомате: у «Тихого» нет паука, замка, крови и клевера. */
export function machineSymbolAllowed(id: MachineId, symbol: { id: string }): boolean {
  return !machineSpec(id).banned.includes(symbol.id);
}

/**
 * Стоит ли предлагать предмет в этом автомате: «Удача» бесполезна там, где нет клевера, «Молот» — где нет замков
 * (у «Тихого» нет ни того, ни другого).
 */
export function machineItemAllowed(id: MachineId, item: { id: string }): boolean {
  if (item.id === 'luck') return machineSymbolAllowed(id, { id: 'clover' });
  if (item.id === 'hammer') return machineSymbolAllowed(id, { id: 'lock' });
  return true;
}

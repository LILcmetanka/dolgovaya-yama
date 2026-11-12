import { times } from './characters';
import type { Words } from './lang';

/**
 * Автоматы: три спеки, что стоит сейчас, и прокачка за билеты. Без Phaser — чтобы проверить симуляцией.
 * Автомат выбирают в магазине (бесплатно), он встаёт на место со следующего раунда; уровень 2 и 3 покупаются
 * за билеты, на третьем уровне — одна из двух веток. Числа отсюда читают RoundScene (веса и выплаты),
 * MachineScene (значок и ржавчина) и выбор в магазине (MachinePicker).
 */

export type MachineId = 'classic' | 'greedy' | 'quiet';
export type MachineLevel = 1 | 2 | 3;
export type MachineBranch = 'skull' | 'spin';

/** Что стоит сейчас: какой автомат, до какого уровня прокачан и какая ветка выбрана на третьем. */
export interface MachineState {
  id: MachineId;
  level: MachineLevel;
  branch: MachineBranch | null; // только на 3-м уровне: без ветки третьего бонуса нет
}

/** Паспорт автомата: что он даёт, чем платишь и как его рисовать. */
export interface MachineSpec {
  id: MachineId;
  sign: string; // значок на корпусе; у классического его нет — как у обычного автомата раньше
  name: Words;
  description: Words; // одной строкой: значок на корпусе и вкладка «Кто есть кто»
  plus: Words; // паспорт в выборе: что хорошо
  minus: Words; // паспорт в выборе: чем платишь
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
export const LEVEL_WIN_BONUS = 1.1; // 2-й уровень: +10% к выплатам
export const SKULL_BRANCH_FACTOR = 0.9; // ветка «череп» на 3-м: вес черепа −10%
export const SPIN_BRANCH_BONUS = 1; // ветка «прокрутка» на 3-м: +1 прокрутка в раунде

/** Цена прокачки в билетах: с 1-го уровня на 2-й и со 2-го на 3-й. */
export const MACHINE_UPGRADE_PRICES: Record<1 | 2, number> = { 1: 1, 2: 3 };

/** Классический: как обычный автомат — ничего не меняет. С него начинается забег. */
const CLASSIC: MachineSpec = {
  id: 'classic',
  sign: '',
  name: { ru: 'Классический', en: 'Classic' },
  description: { ru: 'Без бонусов и без подвоха', en: 'No bonuses, no tricks' },
  plus: { ru: 'Всё как обычно', en: 'Everything as usual' },
  minus: { ru: 'Ничего не прибавляет', en: 'Adds nothing' },
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
  plus: { ru: `Выплаты ${times(GREEDY_WIN).ru}`, en: `Wins ${times(GREEDY_WIN).en}` },
  minus: { ru: `Черепа ${times(GREEDY_SKULLS).ru}`, en: `Skulls ${times(GREEDY_SKULLS).en}` },
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
  plus: { ru: 'Нет 🕷 🔒 🩸 🍀', en: 'No 🕷 🔒 🍀 🩸' },
  // Минус как есть: злых символов нет, но черепов больше (они считаются от всего пула) и платят меньше.
  // Коротко: строка должна влезть в паспорт выбора рядом с ценником.
  minus: { ru: `Черепа чаще, выплаты ${times(QUIET_WIN).ru}`, en: `More skulls, wins ${times(QUIET_WIN).en}` },
  color: 0x17365c,
  winFactor: QUIET_WIN,
  skullFactor: 1,
  banned: QUIET_BANNED,
  rustChance: 0,
};

/** Все автоматы в том порядке, в каком они стоят строками в выборе. Первый — с него начинается забег. */
export const MACHINES: MachineSpec[] = [CLASSIC, GREEDY, QUIET];

/** Названия веток третьего уровня — кнопки в выборе. */
export const BRANCH_NAMES: Record<MachineBranch, Words> = {
  skull: { ru: '−10% черепа', en: '−10% skulls' },
  spin: { ru: '+1 прокрутка', en: '+1 spin' },
};

/** Спека автомата по состоянию: цвет, значок, паспорт. */
export function machineSpec(state: MachineState): MachineSpec {
  return MACHINES.find((machine) => machine.id === state.id) ?? CLASSIC;
}

/** Свежий автомат: первый уровень, ветки нет. С него начинается забег. */
export function newMachineState(): MachineState {
  return freshMachineState('classic');
}

/** Тот же автомат с нуля: так его получаешь, выбрав в магазине другой. */
export function freshMachineState(id: MachineId): MachineState {
  return { id, level: 1, branch: null };
}

/** Копия состояния: запись кассеты не должна делить объект с игрой. */
export function copyMachineState(state: MachineState): MachineState {
  return { id: state.id, level: state.level, branch: state.branch };
}

/** Все три автомата с их уровнями и ветками: живут весь забег, сбрасываются только новым забегом (KABOOM). */
export type MachineSet = Record<MachineId, MachineState>;

/** Свежая запись: все трое с первого уровня — так начинается забег. */
export function newMachineSet(): MachineSet {
  const set = {} as MachineSet;
  for (const machine of MACHINES) set[machine.id] = freshMachineState(machine.id);
  return set;
}

/** Копия всей записи: кассета и игра не должны делить объекты. */
export function copyMachineSet(set: MachineSet): MachineSet {
  const copy = {} as MachineSet;
  for (const machine of MACHINES) copy[machine.id] = copyMachineState(set[machine.id]);
  return copy;
}

/** Запись из одного состояния (старая кассета знала только один автомат): он со своим уровнем, остальные с первого. */
export function machineStatesFrom(state: MachineState): MachineSet {
  const set = newMachineSet();
  set[state.id] = copyMachineState(state);
  return set;
}

/** Один и тот же автомат с тем же уровнем и веткой. */
export function isSameMachine(a: MachineState, b: MachineState): boolean {
  return a.id === b.id && a.level === b.level && a.branch === b.branch;
}

/** Тот же автомат на уровень выше (выше третьего не бывает). */
export function upgradedMachine(state: MachineState): MachineState {
  const level = (state.level < 3 ? state.level + 1 : 3) as MachineLevel;
  return { id: state.id, level, branch: state.branch };
}

/** Цена следующего уровня в билетах; третий — последний, дальше null. */
export function machineUpgradePrice(state: MachineState): number | null {
  if (state.level === 1) return MACHINE_UPGRADE_PRICES[1];
  if (state.level === 2) return MACHINE_UPGRADE_PRICES[2];
  return null; // третий — последний
}

/** Во сколько раз больше все выигрыши: характер автомата и 2-й уровень (+10%). */
export function machineWinFactor(state: MachineState): number {
  return machineSpec(state).winFactor * (state.level >= 2 ? LEVEL_WIN_BONUS : 1);
}

/** Множитель веса черепа: характер автомата и ветка «череп» на 3-м уровне. */
export function machineSkullFactor(state: MachineState): number {
  return machineSpec(state).skullFactor * (state.branch === 'skull' ? SKULL_BRANCH_FACTOR : 1);
}

/** Сколько прокруток прибавляет ветка «прокрутка» на 3-м уровне. */
export function machineBonusSpins(state: MachineState): number {
  return state.branch === 'spin' ? SPIN_BRANCH_BONUS : 0;
}

/** Бывает ли такой символ в этом автомате: у «Тихого» нет паука, замка, крови и клевера. */
export function machineSymbolAllowed(state: MachineState, symbol: { id: string }): boolean {
  return !machineSpec(state).banned.includes(symbol.id);
}

/**
 * Стоит ли предлагать предмет в этом автомате: «Удача» бесполезна там, где нет клевера, «Молот» — где нет замков
 * (у «Тихого» нет ни того, ни другого).
 */
export function machineItemAllowed(state: MachineState, item: { id: string }): boolean {
  if (item.id === 'luck') return machineSymbolAllowed(state, { id: 'clover' });
  if (item.id === 'hammer') return machineSymbolAllowed(state, { id: 'lock' });
  return true;
}

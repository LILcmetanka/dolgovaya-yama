import { MAX_SOCKETS, owns, type AmuletCounts, type AmuletId } from './amulets';
import { CHIP_GOAL, CHIP_RECORD } from './gameConfig';
import type { Item, ItemEffects, ItemId } from './items';
import type { TextKey } from './lang';
import { isRiskyCharge } from './levers';

/**
 * Ачивки: без награды, только след в прогрессе и показ на экране (решение автора).
 * Здесь данные и условия, без Phaser: сцена спрашивает `earnedAchievements(снимок)`, а выдачу и картинку делает
 * BaseScene + parts/achievementWindow.ts. Названия и описания — в lang.ts (RU/EN), у ачивки только ключи.
 * Порядок простых — как у автора: сперва 14 предметов (как в items.ts), потом 11 амулетов (как в amulets.ts).
 */

/** Группа: от неё ничего не зависит, кроме порядка в данных и будущего списка ачивок. */
export type AchievementGroup = 'secret' | 'hard' | 'simple';

export type AchievementId =
  // простые: 14 предметов, в порядке items.ts
  | 'noSmoke' | 'protectedShield' | 'calm' | 'muchTriple' | 'manyBerries'
  | 'ding' | 'manyDiamonds' | 'luckyMe' | 'whatTheHell' | 'damnLock'
  | 'freebie' | 'noSkulls' | 'luckyShuffle' | 'swapJackpot'
  // простые: 11 амулетов, в порядке amulets.ts
  | 'moreBerries' | 'pseudoInfinity' | 'soSo' | 'insured' | 'boostSpeed'
  | 'vestOn' | 'moreDiamonds' | 'strangeSchemes' | 'immoral' | 'skeletonPack' | 'greedyWins'
  // простые: все гнёзда заняты
  | 'occupied'
  // сложные
  | 'wrongGame' | 'infinity' | 'skeletonKing' | 'cheapAndAngry' | 'whereAreSkulls'
  | 'skullsAreSoLastCentury' | 'bank' | 'smoker' | 'luckyOne' | 'nope' | 'fiftyFifty' | 'myGold' | 'duplicate'
  // секретные
  | 'theEnd' | 'notTheEnd' | 'yourTicket' | 'iAmSpeed' | 'bloodSpill';

/** Одна ачивка: id для прогресса, группа, эмодзи-иконка и два ключа в lang.ts (название и описание одной строкой). */
export interface Achievement {
  id: AchievementId;
  group: AchievementGroup;
  icon: string;
  name: TextKey;
  what: TextKey;
}

/** Все ачивки игры. Формулировки автора сохранены в названиях. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  // ---------- Простые: предметы (items.ts по порядку) ----------
  { id: 'noSmoke', group: 'simple', icon: '🚬', name: 'achNoSmoke', what: 'achNoSmokeWhat' },
  { id: 'protectedShield', group: 'simple', icon: '🛡', name: 'achProtectedShield', what: 'achProtectedShieldWhat' },
  { id: 'calm', group: 'simple', icon: '🧄', name: 'achCalm', what: 'achCalmWhat' },
  { id: 'muchTriple', group: 'simple', icon: '×3', name: 'achMuchTriple', what: 'achMuchTripleWhat' },
  { id: 'manyBerries', group: 'simple', icon: '🍒', name: 'achManyBerries', what: 'achManyBerriesWhat' },
  { id: 'ding', group: 'simple', icon: '🔔', name: 'achDing', what: 'achDingWhat' },
  { id: 'manyDiamonds', group: 'simple', icon: '💎', name: 'achManyDiamonds', what: 'achManyDiamondsWhat' },
  { id: 'luckyMe', group: 'simple', icon: '🍀', name: 'achLuckyMe', what: 'achLuckyMeWhat' },
  { id: 'whatTheHell', group: 'simple', icon: '💀', name: 'achWhatTheHell', what: 'achWhatTheHellWhat' },
  { id: 'damnLock', group: 'simple', icon: '🔨', name: 'achDamnLock', what: 'achDamnLockWhat' },
  { id: 'freebie', group: 'simple', icon: '🕯', name: 'achFreebie', what: 'achFreebieWhat' },
  { id: 'noSkulls', group: 'simple', icon: '✨', name: 'achNoSkulls', what: 'achNoSkullsWhat' },
  { id: 'luckyShuffle', group: 'simple', icon: '🔀', name: 'achLuckyShuffle', what: 'achLuckyShuffleWhat' },
  { id: 'swapJackpot', group: 'simple', icon: '🃏', name: 'achSwapJackpot', what: 'achSwapJackpotWhat' },
  // ---------- Простые: амулеты (amulets.ts по порядку) ----------
  { id: 'moreBerries', group: 'simple', icon: '🍒', name: 'achMoreBerries', what: 'achMoreBerriesWhat' },
  { id: 'pseudoInfinity', group: 'simple', icon: '🔔', name: 'achPseudoInfinity', what: 'achPseudoInfinityWhat' },
  { id: 'soSo', group: 'simple', icon: '🐷', name: 'achSoSo', what: 'achSoSoWhat' },
  { id: 'insured', group: 'simple', icon: '📄', name: 'achInsured', what: 'achInsuredWhat' },
  { id: 'boostSpeed', group: 'simple', icon: '⚡', name: 'achBoostSpeed', what: 'achBoostSpeedWhat' },
  { id: 'vestOn', group: 'simple', icon: '🦺', name: 'achVestOn', what: 'achVestOnWhat' },
  { id: 'moreDiamonds', group: 'simple', icon: '💎', name: 'achMoreDiamonds', what: 'achMoreDiamondsWhat' },
  { id: 'strangeSchemes', group: 'simple', icon: '📈', name: 'achStrangeSchemes', what: 'achStrangeSchemesWhat' },
  { id: 'immoral', group: 'simple', icon: '🦴', name: 'achImmoral', what: 'achImmoralWhat' },
  { id: 'skeletonPack', group: 'simple', icon: '💀', name: 'achSkeletonPack', what: 'achSkeletonPackWhat' },
  { id: 'greedyWins', group: 'simple', icon: '💰', name: 'achGreedyWins', what: 'achGreedyWinsWhat' },
  // ---------- Простые: гнёзда ----------
  { id: 'occupied', group: 'simple', icon: '🧩', name: 'achOccupied', what: 'achOccupiedWhat' },
  // ---------- Сложные ----------
  { id: 'wrongGame', group: 'hard', icon: '🃏', name: 'achWrongGame', what: 'achWrongGameWhat' },
  { id: 'infinity', group: 'hard', icon: '♾️', name: 'achInfinity', what: 'achInfinityWhat' },
  { id: 'skeletonKing', group: 'hard', icon: '💀', name: 'achSkeletonKing', what: 'achSkeletonKingWhat' },
  { id: 'cheapAndAngry', group: 'hard', icon: '🍒', name: 'achCheapAndAngry', what: 'achCheapAndAngryWhat' },
  { id: 'whereAreSkulls', group: 'hard', icon: '🧄', name: 'achWhereAreSkulls', what: 'achWhereAreSkullsWhat' },
  { id: 'skullsAreSoLastCentury', group: 'hard', icon: '💎', name: 'achSkullsAreSoLastCentury', what: 'achSkullsAreSoLastCenturyWhat' },
  { id: 'bank', group: 'hard', icon: '🏦', name: 'achBank', what: 'achBankWhat' },
  { id: 'smoker', group: 'hard', icon: '🚬', name: 'achSmoker', what: 'achSmokerWhat' },
  { id: 'luckyOne', group: 'hard', icon: '🍀', name: 'achLuckyOne', what: 'achLuckyOneWhat' },
  { id: 'nope', group: 'hard', icon: '🙅', name: 'achNope', what: 'achNopeWhat' },
  { id: 'fiftyFifty', group: 'hard', icon: '🎲', name: 'achFiftyFifty', what: 'achFiftyFiftyWhat' },
  { id: 'myGold', group: 'hard', icon: '👑', name: 'achMyGold', what: 'achMyGoldWhat' },
  { id: 'duplicate', group: 'hard', icon: '♊', name: 'achDuplicate', what: 'achDuplicateWhat' },
  // ---------- Секретные ----------
  { id: 'theEnd', group: 'secret', icon: '🏁', name: 'achTheEnd', what: 'achTheEndWhat' },
  { id: 'notTheEnd', group: 'secret', icon: '🌀', name: 'achNotTheEnd', what: 'achNotTheEndWhat' },
  { id: 'yourTicket', group: 'secret', icon: '🎟', name: 'achYourTicket', what: 'achYourTicketWhat' },
  { id: 'iAmSpeed', group: 'secret', icon: '⚡', name: 'achIAmSpeed', what: 'achIAmSpeedWhat' },
  { id: 'bloodSpill', group: 'secret', icon: '🩸', name: 'achBloodSpill', what: 'achBloodSpillWhat' },
];

/** Сколько живёт окно ачивки на экране автомата, мс. Пока оно живо, следующая ачивка ждёт в очереди. */
export const ACHIEVEMENT_TIME = 2500;
/** Сколько окно тает, мс. */
export const ACHIEVEMENT_FADE = 250;

/** Пороги секретных ачивок: билетов на табло и множителя серии. */
export const ACHIEVEMENT_TICKETS = 20;
export const ACHIEVEMENT_SPEED = 50;
/** «До конца раунда осталось 2 прокрутки» — для «Я пролью много крови». */
export const ACHIEVEMENT_LAST_SPINS = 2;
/** Столько сигарет в одном раунде — «Курильщик». */
export const CIGARETTES_FOR_ACHIEVEMENT = 3;
/** Доля черепов, при которой выигранный паттерн даёт «50 на 50»: половина и больше. */
export const ACHIEVEMENT_SKULL_SHARE = 0.5;

const BY_ID = new Map<AchievementId, Achievement>(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

/** Ачивка по id (id всегда свой — типы это держат; чужие отбрасывают прогресс и сохранение). */
export function achievementById(id: AchievementId): Achievement {
  return BY_ID.get(id) ?? ACHIEVEMENTS[0];
}

/** Все id — по нему прогресс отбрасывает чужое в сохранении. */
export const ACHIEVEMENT_IDS: readonly string[] = ACHIEVEMENTS.map((achievement) => achievement.id);

/** Существует ли такая ачивка: чужие и битые id в прогресс не пускаем. */
export function isAchievementId(id: unknown): id is AchievementId {
  return typeof id === 'string' && BY_ID.has(id as AchievementId);
}

/** Полученные ачивки из сохранения: не массив — пусто, чужие id и повторы отбрасываем. */
export function achievementsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const id of value) if (isAchievementId(id) && !result.includes(id)) result.push(id);
  return result;
}

/** Простые ачивки предметов: первое включение предмета за всё время (выдаёт RoundScene.activateItem). */
export const ITEM_ACHIEVEMENTS: Partial<Record<ItemId, AchievementId>> = {
  cigarette: 'noSmoke',
  shield: 'protectedShield',
  garlic: 'calm',
  triple: 'muchTriple',
  cherries: 'manyBerries',
  bells: 'ding',
  diamonds: 'manyDiamonds',
  luck: 'luckyMe',
  risk: 'whatTheHell',
  hammer: 'damnLock',
  candle: 'freebie',
  luckSpin: 'noSkulls',
  shuffle: 'luckyShuffle',
  swap: 'swapJackpot',
};

/** Простые ачивки амулетов: амулет получен впервые (куплен в витрине или выдан). */
export const AMULET_ACHIEVEMENTS: Partial<Record<AmuletId, AchievementId>> = {
  cherryPit: 'moreBerries',
  bell: 'pseudoInfinity',
  piggy: 'soSo',
  insurance: 'insured',
  boost: 'boostSpeed',
  vest: 'vestOn',
  cut: 'moreDiamonds',
  interest: 'strangeSchemes',
  bones: 'immoral',
  skullPocket: 'skeletonPack',
  greed: 'greedyWins',
};

/**
 * «Я пролью много крови»: прокрутка спустила счётчик вниз и остановилась ровно на двух — вместе с «жадностью».
 * Считаем переход (было больше двух → стало два), а не «сейчас два»: иначе ачивка ловила бы и подъём
 * с 1 до 2 (сигарета), где никакого «конца близко» нет. Зовёт RoundScene.spin, где прокрутки убывают.
 */
export function isBloodSpill(before: number, after: number, amulets: readonly AmuletId[]): boolean {
  return after === ACHIEVEMENT_LAST_SPINS && before > ACHIEVEMENT_LAST_SPINS && owns([...amulets], 'greed');
}

/**
 * Что нужно проверить в этот момент: текущее состояние забега. Ачивки «за всё время» (первый предмет, первый амулет)
 * выдаются не здесь — их ловят свои места в сцене.
 */
export interface AchievementState {
  charge: number; // замах прошлой прокрутки 0…1: «риск» — это высокий заряд (isRiskyCharge)
  effects: ItemEffects; // включённые предметы
  amulets: readonly AmuletId[]; // амулеты в гнёздах: их получение и комбинации
  amuletCounts: AmuletCounts; // их копии
  shelf: readonly (Item | null)[]; // полка: «Моё золото»
  tickets: number; // билеты на табло: «Ваш билетик!»
  earned: number; // набрано за забег: «Конец?» и «Это не конец...»
  multiplier: number; // множитель серии: «Я скорость»
  skullShare: number; // доля черепов, как на плашке «💀 N%»: «50 на 50»
  isFree: boolean; // прокрутка бесплатная (за короны): черепов в ней быть не может — «50 на 50» за неё не даём
  isWin: boolean; // в этой прокрутке выиграл паттерн (для «50 на 50» и «Везунчика»)
}

/** Все ачивки, которые заслуживает это состояние: сцена выдаёт каждую и показывает. */
export function earnedAchievements(state: AchievementState): AchievementId[] {
  const amulets = state.amulets;
  const has = (id: AmuletId): boolean => owns([...amulets], id);
  const boosts = state.effects.symbolBoost;
  const garlic = boosts.skull !== undefined; // череп легче вдвое — только чеснок
  const risk = isRiskyCharge(state.charge); // сильный замах = «риск» для ачивок
  const earned: AchievementId[] = [];

  // Простые: амулет получен впервые (в этом забеге он уже стоит в гнезде). Список — уникальные гнёзда,
  // копии сюда не попадают; повтор id всё равно не страшен: выдачу гасит прогресс.
  const sockets = [...new Set(amulets)];
  for (const amulet of sockets) {
    const achievement = AMULET_ACHIEVEMENTS[amulet];
    if (achievement !== undefined) earned.push(achievement);
  }
  // «ЗАНЯТО!» — заняты все шесть гнёзд: считаем гнёзда, а не копии (3 амулета × 2 копии — это три гнезда).
  if (sockets.length >= MAX_SOCKETS) earned.push('occupied');
  // «Дубликат»: у любого амулета уже две копии (копии копятся счётчиком, гнёзд не занимают).
  if (Object.values(state.amuletCounts).some((count) => count >= 2)) earned.push('duplicate');

  // Сложные: два и больше условий одновременно.
  if (risk && has('skullPocket')) earned.push('wrongGame');
  if (boosts.bell !== undefined && has('bell')) earned.push('infinity');
  if (has('bones') && has('skullPocket')) earned.push('skeletonKing');
  if (has('cherryPit') && boosts.cherry !== undefined) earned.push('cheapAndAngry');
  if (garlic && (has('cherryPit') || has('bell') || has('cut'))) earned.push('whereAreSkulls');
  if (garlic && boosts.diamond !== undefined && has('cut')) earned.push('skullsAreSoLastCentury');
  if (has('insurance') && has('interest')) earned.push('bank');
  if (risk && state.effects.luckSpin) earned.push('nope');
  if (risk && has('skullPocket') && state.effects.tripleTakes > 0 && state.isWin) earned.push('luckyOne');
  // «50 на 50» — доля черепов с плашки (с амулетами, автоматом, предметами и режимом), а не базовая доля раунда.
  if (state.isWin && !state.isFree && state.skullShare >= ACHIEVEMENT_SKULL_SHARE) earned.push('fiftyFifty');
  const first = state.shelf[0];
  // «Моё золото»: все слоты полки забиты одним и тем же предметом. С одним слотом это было бы слишком просто.
  if (first && state.shelf.length > 1 && state.shelf.every((item) => item !== null && item.id === first.id)) earned.push('myGold');

  // Секретные.
  if (state.earned >= CHIP_GOAL) earned.push('theEnd');
  if (state.earned >= CHIP_RECORD) earned.push('notTheEnd');
  if (state.tickets >= ACHIEVEMENT_TICKETS) earned.push('yourTicket');
  if (state.multiplier >= ACHIEVEMENT_SPEED) earned.push('iAmSpeed');
  return earned;
}

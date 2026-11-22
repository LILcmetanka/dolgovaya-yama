/**
 * Прогресс между забегами: что игрок уже видел. Живёт дольше сцены — в localStorage. Без Phaser.
 * По нему первый забег идёт с тьмой (reveal.ts), а дальше её уже нет.
 * Магазин открывается не по забегам, а по закрытым долгам (BaseScene: amuletsUnlocked и остальные).
 */

import { AMULETS, type AmuletId } from './amulets';
import { PATTERNS } from './patterns';
import { achievementsOf, isAchievementId, type AchievementId } from './achievements';
import { isDevMode } from './devmode';

export interface Progress {
  tutorialDone: boolean; // первый забег с тьмой пройден — больше её не показываем
  patterns: string[]; // какие паттерны уже выпадали: на стекле видно только их (кассета возвращает набор с записи)
  achievements: string[]; // какие ачивки получены: копятся навсегда, «Заново» и конец забега их не сбрасывают
  memoryAmulet: AmuletId | null; // амулет, выбранный после смерти: стоит в гнезде следующего забега; null — памяти нет
}

const PROGRESS_KEY = 'dolgovaya-yama-progress'; // ключ прогресса в localStorage
const DEFAULT_PROGRESS: Progress = { tutorialDone: false, patterns: [], achievements: [], memoryAmulet: null }; // новый игрок: тьма в первом забеге, стекло пустое, ачивок и памяти нет

/**
 * Id всех паттернов — по нему отбрасываем чужое в сохранении (и там, где читают запись кассеты).
 * Объявлен раньше progress: loadProgress читает его через patternsOf, а в TDZ это ReferenceError и сброс прогресса.
 */
const PATTERN_IDS = new Set(PATTERNS.map((pattern) => pattern.id));

/** Существует ли такой паттерн в игре: чужие и битые id в прогресс и в запись кассеты не пускаем. */
export function isPatternId(id: unknown): id is string {
  return typeof id === 'string' && PATTERN_IDS.has(id);
}

/** Id всех амулетов — память после смерти хранит только настоящие амулеты игры. */
const AMULET_IDS = new Set<string>(AMULETS.map((amulet) => amulet.id));

/** Существует ли такой амулет: чужое id в память не пускаем. */
function isAmuletId(id: unknown): id is AmuletId {
  return typeof id === 'string' && AMULET_IDS.has(id);
}

let progress: Progress = loadProgress();

/** Открытые паттерны из сохранения: не массив — пусто, чужие id и повторы отбрасываем. */
function patternsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const id of value) if (isPatternId(id) && !result.includes(id)) result.push(id);
  return result;
}

/** Прогресс из localStorage; нет его или он битый — по умолчанию. */
function loadProgress(): Progress {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULT_PROGRESS, patterns: [], achievements: [] };
    const { tutorialDone, patterns, achievements, memoryAmulet } = saved as {
      tutorialDone?: unknown;
      patterns?: unknown;
      achievements?: unknown;
      memoryAmulet?: unknown;
    };
    return {
      tutorialDone: typeof tutorialDone === 'boolean' ? tutorialDone : DEFAULT_PROGRESS.tutorialDone,
      patterns: patternsOf(patterns),
      achievements: achievementsOf(achievements),
      // Старый ключ без поля читается как «памяти нет»: память появилась шагом 26.
      memoryAmulet: isAmuletId(memoryAmulet) ? memoryAmulet : null,
    };
  } catch {
    return { ...DEFAULT_PROGRESS, patterns: [], achievements: [] }; // хранилище запрещено или в нём не JSON
  }
}

function saveProgress(): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // не запомнили — в следующий раз прогресс с начала
  }
}

/** Обучение в первом забеге (тьма) уже пройдено. */
export function isTutorialDone(): boolean {
  return progress.tutorialDone;
}

/** Запомнить, что обучение пройдено: в следующих забегах тьмы нет. */
export function markTutorialDone(): void {
  progress.tutorialDone = true;
  saveProgress();
}

/** Какие паттерны уже открыты: их схемы видно на стекле. Копия — менять набор снаружи нельзя. */
export function openedPatterns(): readonly string[] {
  return [...progress.patterns];
}

/**
 * Этот паттерн уже открывался раньше (хоть в прошлом забеге, хоть в этом)? По нему стекло пишет «ПАТТЕРН ×N» без «новый»:
 * после отката кассетой схема могла пропасть с плёнки, но открытой навсегда она уже осталась.
 */
export function hasPattern(id: string): boolean {
  return progress.patterns.includes(id);
}

/** Паттерн выпал впервые: открыть его навсегда — «Заново» и конец забега открытое не сбрасывают. */
export function markPatternOpen(id: string): void {
  if (!isPatternId(id) || progress.patterns.includes(id)) return;
  progress.patterns.push(id);
  saveProgress();
}

/** Какие ачивки уже получены: их не сбрасывает ни «Заново», ни конец забега. Копия — менять набор снаружи нельзя. */
export function obtainedAchievements(): readonly string[] {
  return [...progress.achievements];
}

/** Эта ачивка получена раньше (в любом забеге)? */
export function hasAchievement(id: AchievementId): boolean {
  return progress.achievements.includes(id);
}

/**
 * Выдать ачивку навсегда. Уже была — false: повторно её не показываем. Режим разработчика — тоже false:
 * при нём ачивки не выдаются и не пишутся, иначе тестовые кнопки «+1» раздавали бы их пачками.
 * true — ачивка новая, сцена показывает её игроку.
 */
export function grantAchievement(id: AchievementId): boolean {
  if (isDevMode() || !isAchievementId(id) || hasAchievement(id)) return false;
  progress.achievements.push(id);
  saveProgress();
  return true;
}

/** Какой амулет перенесён из погибшего забега в следующий (экран смерти, шаг 26). null — памяти нет. */
export function rememberedAmulet(): AmuletId | null {
  return progress.memoryAmulet;
}

/**
 * Запомнить амулет для следующего забега. Память одна: новый выбор заменяет старый, null стирает её.
 * Чужое id не пишем — читалось бы как «память есть», а выдать было бы нечего.
 */
export function setRememberedAmulet(id: AmuletId | null): void {
  const next = isAmuletId(id) ? id : null;
  if (progress.memoryAmulet === next) return; // уже так — лишняя запись в localStorage каждый забег ни к чему
  progress.memoryAmulet = next;
  saveProgress();
}

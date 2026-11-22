/**
 * Прогресс между забегами: что игрок уже видел. Живёт дольше сцены — в localStorage. Без Phaser.
 * По нему первый забег идёт с тьмой (reveal.ts), а дальше её уже нет.
 * Магазин открывается не по забегам, а по закрытым долгам (BaseScene: amuletsUnlocked и остальные).
 */

import { AMULETS, type AmuletId } from './amulets';
import { PATTERNS } from './patterns';
import { achievementsOf, isAchievementId, type AchievementId } from './achievements';
import { isDevMode } from './devmode';
import { isUpgradeId, upgradeById, type PurchasedUpgrades, type UpgradeId } from './upgrades';

export interface Progress {
  tutorialDone: boolean; // первый забег с тьмой пройден — больше её не показываем
  patterns: string[]; // какие паттерны уже выпадали: на стекле видно только их (кассета возвращает набор с записи)
  achievements: string[]; // какие ачивки получены: копятся навсегда, «Заново» и конец забега их не сбрасывают
  memoryAmulet: AmuletId | null; // амулет, выбранный после смерти: стоит в гнезде следующего забега; null — памяти нет
  upgrades: PurchasedUpgrades; // улучшения после смерти (шаг 28): что куплено и по сколько раз
  runs: number; // сколько забегов начато: по нему улучшение №8 прощает первый долг каждый пятый забег
}

const PROGRESS_KEY = 'dolgovaya-yama-progress'; // ключ прогресса в localStorage
const DEFAULT_PROGRESS: Progress = { tutorialDone: false, patterns: [], achievements: [], memoryAmulet: null, upgrades: {}, runs: 0 }; // новый игрок: тьма в первом забеге, стекло пустое, ачивок, памяти и улучшений нет

/**
 * Свежий прогресс нового игрока. Копия, а не общий DEFAULT_PROGRESS: у него внутри массивы и объект улучшений,
 * поверхностная копия оставила бы те же ссылки, и grantUpgrade писал бы в константу.
 */
function freshProgress(): Progress {
  return { ...DEFAULT_PROGRESS, patterns: [], achievements: [], upgrades: {} };
}

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
    return parseProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null'));
  } catch {
    return freshProgress(); // хранилище запрещено или в нём не JSON
  }
}

/**
 * Разобрать сохранение в Progress. Чужое и битое молча отбрасывается по полям: старые ключи игры без новых полей
 * читаются как «так и не было». Общая дверь у загрузки и у слияния перед записью.
 */
function parseProgress(saved: unknown): Progress {
  if (typeof saved !== 'object' || saved === null) return freshProgress();
  const { tutorialDone, patterns, achievements, memoryAmulet, upgrades, runs } = saved as {
    tutorialDone?: unknown;
    patterns?: unknown;
    achievements?: unknown;
    memoryAmulet?: unknown;
    upgrades?: unknown;
    runs?: unknown;
  };
  return {
    tutorialDone: typeof tutorialDone === 'boolean' ? tutorialDone : DEFAULT_PROGRESS.tutorialDone,
    patterns: patternsOf(patterns),
    achievements: achievementsOf(achievements),
    // Старый ключ без поля читается как «памяти нет»: память появилась шагом 26.
    memoryAmulet: isAmuletId(memoryAmulet) ? memoryAmulet : null,
    // Улучшения появились шагом 28: старая запись без них читается как «ничего не куплено».
    upgrades: upgradesOf(upgrades),
    // Счётчик забегов — тоже шаг 28; мусор в нём считается нулём (тогда прощения долга просто не будет).
    runs: typeof runs === 'number' && Number.isFinite(runs) && runs > 0 ? Math.floor(runs) : 0,
  };
}

/**
 * Купленные улучшения из сохранения: только настоящие id, только целые положительные числа, не больше потолка
 * повторений из пула. Мусор (чужие ключи, строки, дроби, минус) молча отбрасывается — играется как без них.
 */
function upgradesOf(value: unknown): PurchasedUpgrades {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: PurchasedUpgrades = {};
  for (const [id, count] of Object.entries(value as Record<string, unknown>)) {
    if (!isUpgradeId(id)) continue;
    const upgrade = upgradeById(id);
    if (!upgrade) continue;
    if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) continue;
    result[id] = Math.min(upgrade.repeat, count);
  }
  return result;
}

/** Память амулета стёрли в этой вкладке (её уже забрал новый забег): чужую при слиянии не возвращаем. */
let memoryConsumed = false;

/** Прогресс, который сейчас лежит в хранилище (может быть от другой вкладки). Нет или битый — null. */
function readStoredProgress(): Progress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw === null ? null : parseProgress(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Слить прогресс этой вкладки с тем, что уже в хранилище: вкладка со старым снимком не должна затирать чужие
 * достижения целиком. Правило по полям — так, чтобы ничего не терялось:
 *   • обучение — «пройдено», если пройдено хоть где;
 *   • паттерны и ачивки — объединение: открытое навсегда не откатывается;
 *   • улучшения — по каждому id большая из двух покупок (потолок один, upgrades.upgradesOf его и держит);
 *   • номер забега — большее число: счётчик забегов не идёт назад;
 *   • память амулета — своя, если она непустая или здесь её уже забрали; иначе чужая.
 */
function mergeProgress(mine: Progress, stored: Progress): Progress {
  const patterns = [...mine.patterns];
  for (const id of stored.patterns) if (!patterns.includes(id)) patterns.push(id);
  const achievements = [...mine.achievements];
  for (const id of stored.achievements) if (!achievements.includes(id)) achievements.push(id);
  const upgrades: PurchasedUpgrades = { ...stored.upgrades };
  for (const [id, count] of Object.entries(mine.upgrades)) {
    if (typeof count !== 'number') continue;
    const other = upgrades[id as UpgradeId] ?? 0;
    upgrades[id as UpgradeId] = Math.max(other, count);
  }
  return {
    tutorialDone: mine.tutorialDone || stored.tutorialDone,
    patterns,
    achievements,
    memoryAmulet: mine.memoryAmulet !== null ? mine.memoryAmulet : memoryConsumed ? null : stored.memoryAmulet,
    upgrades,
    runs: Math.max(mine.runs, stored.runs),
  };
}

/**
 * Прочитать хранилище и слить со своим. Нужен перед тем, как двигать счётчики (номер забега): иначе вкладка
 * со старым снимком посчитала бы номер от своего числа и записала меньшее.
 */
function pullProgress(): void {
  const stored = readStoredProgress();
  if (stored) progress = mergeProgress(progress, stored);
}

/**
 * Запись прогресса: прочитали — слили — записали. Обычная запись «весь объект поверх» затирала бы всё, что успела
 * получить другая вкладка (открытая давно сцена помнит старый снимок). Не записали — в следующий раз прогресс с начала.
 */
function saveProgress(): void {
  pullProgress();
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // не запомнили — в следующий раз прогресс с начала
  }
}

// Другая вкладка что-то записала — перечитываем и сливаем со своим, не дожидаясь следующей записи:
// купленное на экране смерти там не должно пропасть, пока здесь лежит старый снимок.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== PROGRESS_KEY) return;
    const stored = readStoredProgress();
    if (stored) progress = mergeProgress(progress, stored);
  });
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
  memoryConsumed = next === null; // память забрали — при слиянии с другой вкладкой её не вернём
  if (progress.memoryAmulet === next) return; // уже так — лишняя запись в localStorage каждый забег ни к чему
  progress.memoryAmulet = next;
  saveProgress();
}

// ---------- Улучшения после смерти (шаг 28) ----------

/** Что уже куплено: копия — менять набор снаружи нельзя. Действует со следующего забега (BaseScene.resetState). */
export function purchasedUpgrades(): PurchasedUpgrades {
  return { ...progress.upgrades };
}

/**
 * Купить улучшение навсегда (экран после смерти). Чужое id и «сверх потолка repeat» не пишутся.
 * Вернёт число копий после покупки: 0 — не взяли (чужое id или потолок).
 * Режим разработчика — как у ачивок (grantAchievement): ничего не выдаём и не пишем, иначе вкладка «ТЕСТ» после
 * смерти раздавала бы улучшения пачками. Забег, который трогали в «ТЕСТ», сцена проверяет сама: у неё есть
 * липкий devUsedThisRun, а прогресс о забеге не знает.
 */
export function grantUpgrade(id: UpgradeId): number {
  const upgrade = upgradeById(id);
  if (!upgrade || isDevMode()) return takenUpgrade(id);
  const taken = takenUpgrade(id);
  if (taken >= upgrade.repeat) return taken;
  progress.upgrades[id] = taken + 1;
  saveProgress();
  return taken + 1;
}

/** Сколько копий улучшения куплено (0 — не брали). */
function takenUpgrade(id: UpgradeId): number {
  const count = progress.upgrades[id];
  return typeof count === 'number' && count > 0 ? count : 0;
}

/** Номер текущего забега: 0 — забегов ещё не начинали. По нему улучшение №8 прощает долг каждый пятый забег. */
export function runNumber(): number {
  return progress.runs;
}

/**
 * Начать новый забег: счётчик забегов +1, вернёт его номер (1 у первого забега). Зовётся из resetState — но только
 * когда забег правда новый. Откат кассетой номер не двигает (GameScene.create передаёт BaseScene флаг isTapeRestart,
 * сцена берёт runNumber): это тот же забег с того же места, иначе «каждый пятый забег» (№8) съезжал бы на перемотках.
 */
export function beginRun(): number {
  pullProgress(); // другая вкладка могла уйти вперёд: номер считаем от большего, а не от своего старого
  progress.runs += 1;
  saveProgress();
  return progress.runs;
}

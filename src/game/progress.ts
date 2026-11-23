/**
 * Прогресс между забегами: что игрок уже видел. Живёт дольше сцены — в localStorage. Без Phaser.
 * По нему первый забег идёт с тьмой (reveal.ts), а дальше её уже нет.
 * Магазин открывается не по забегам, а по закрытым долгам (BaseScene: amuletsUnlocked и остальные).
 */

import { AMULETS, type AmuletId } from './amulets';
import { MEMORY_PICKS_BASE } from './memory';
import { PATTERNS } from './patterns';
import { achievementsOf, isAchievementId, type AchievementId } from './achievements';
import { isDevMode } from './devmode';
import { isUpgradeId, upgradeById, type PurchasedUpgrades, type UpgradeId } from './upgrades';

export interface Progress {
  tutorialDone: boolean; // первый забег с тьмой пройден — больше её не показываем
  patterns: string[]; // какие паттерны уже выпадали: на стекле видно только их (кассета возвращает набор с записи)
  achievements: string[]; // какие ачивки получены: копятся навсегда, «Заново» и конец забега их не сбрасывают
  runAmulets: AmuletId[]; // амулеты последнего законченного забега: из них игрок выбирает память на старте (шаг 38)
  runAmuletPicks: number; // сколько из них можно взять бесплатно: 1 обычный, больше — №30 и сделка №34
  upgrades: PurchasedUpgrades; // улучшения после смерти (шаг 28): что куплено и по сколько раз
  runs: number; // сколько забегов начато: по нему улучшение №8 прощает первый долг каждый пятый забег
}

const PROGRESS_KEY = 'dolgovaya-yama-progress'; // ключ прогресса в localStorage
// Новый игрок: тьма в первом забеге, стекло пустое, ачивок, памяти и улучшений нет. Памяти нет — и списка амулетов нет.
const DEFAULT_PROGRESS: Progress = { tutorialDone: false, patterns: [], achievements: [], runAmulets: [], runAmuletPicks: MEMORY_PICKS_BASE, upgrades: {}, runs: 0 };

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

/** Список амулетов из сохранения: не массив — пусто, чужие id и повторы отбрасываются. */
function amuletIdsOf(value: unknown): AmuletId[] {
  if (!Array.isArray(value)) return [];
  const result: AmuletId[] = [];
  for (const id of value) if (isAmuletId(id) && !result.includes(id)) result.push(id);
  return result;
}

/** Сколько амулетов из прошлого забега можно взять: целое ≥ 1, мусор — один (правило игры). */
function picksOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < MEMORY_PICKS_BASE) return MEMORY_PICKS_BASE;
  return Math.floor(value);
}

/**
 * Разобрать сохранение в Progress. Чужое и битое молча отбрасывается по полям: старые ключи игры без новых полей
 * читаются как «так и не было». Общая дверь у загрузки и у слияния перед записью.
 */
function parseProgress(saved: unknown): Progress {
  if (typeof saved !== 'object' || saved === null) return freshProgress();
  const { tutorialDone, patterns, achievements, runAmulets, runAmuletPicks, memoryAmulet, upgrades, runs } = saved as {
    tutorialDone?: unknown;
    patterns?: unknown;
    achievements?: unknown;
    runAmulets?: unknown;
    runAmuletPicks?: unknown;
    memoryAmulet?: unknown;
    upgrades?: unknown;
    runs?: unknown;
  };
  // Старая память (одно поле memoryAmulet до шага 38) читается как список из одного амулета: игрок не теряет выбор.
  const legacy = isAmuletId(memoryAmulet) ? [memoryAmulet] : [];
  const amulets = amuletIdsOf(runAmulets);
  return {
    tutorialDone: typeof tutorialDone === 'boolean' ? tutorialDone : DEFAULT_PROGRESS.tutorialDone,
    patterns: patternsOf(patterns),
    achievements: achievementsOf(achievements),
    runAmulets: amulets.length > 0 ? amulets : legacy,
    runAmuletPicks: picksOf(runAmuletPicks),
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

/**
 * Память амулетов записала эта вкладка (забег закончился здесь). После этого её снимок главнее хранилища —
 * иначе пустой список (забег без амулетов) при слиянии снова подхватил бы старый чужой и предлагал устаревшее.
 */
let memoryWritten = false;

/** Прогресс, который сейчас лежит в хранилище (может быть от другой вкладки). Нет или битый — null. */function readStoredProgress(): Progress | null {
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
 *   • память амулетов — своя, если список непустой; иначе чужая (этот забег кончился без амулетов).
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
  const mineMemory = memoryWritten || mine.runAmulets.length > 0;
  return {
    tutorialDone: mine.tutorialDone || stored.tutorialDone,
    patterns,
    achievements,
    runAmulets: mineMemory ? mine.runAmulets : stored.runAmulets,
    runAmuletPicks: mineMemory ? mine.runAmuletPicks : stored.runAmuletPicks,
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

/** Память амулетов следующего забега: амулеты последнего законченного забега и сколько из них можно взять. */
export interface RunMemory {
  amulets: AmuletId[];
  picks: number;
}

/** Какие амулеты прошлого забега предложить новому — и сколько из них можно взять (шаг 38). Копия. */
export function nextRunMemory(): RunMemory {
  return { amulets: [...progress.runAmulets], picks: progress.runAmuletPicks };
}

/**
 * Запомнить амулеты закончившегося забега (зовут CollectorScene.kaboom и startVictory). Новый забег раздаёт их
 * на старте: один бесплатно, больше — с №30 и сделкой №34. Чужие id не пишем — выдавать было бы нечего.
 */
export function setNextRunMemory(amulets: readonly AmuletId[], picks: number): void {
  memoryWritten = true;
  const list = amuletIdsOf([...amulets]);
  progress.runAmulets = list;
  progress.runAmuletPicks = picksOf(picks);
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

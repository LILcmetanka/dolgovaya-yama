/**
 * Прогресс между забегами: что игрок уже видел. Живёт дольше сцены — в localStorage. Без Phaser.
 * По нему первый забег идёт с тьмой (reveal.ts), а дальше её уже нет.
 */

export interface Progress {
  tutorialDone: boolean; // первый забег с тьмой пройден — больше её не показываем
  runs: number; // сколько забегов закончено (пригодится шагу 66: амулеты, барабан, кассета)
}

const PROGRESS_KEY = 'dolgovaya-yama-progress'; // ключ прогресса в localStorage
const DEFAULT_PROGRESS: Progress = { tutorialDone: false, runs: 0 }; // новый игрок: тьма в первом забеге

let progress: Progress = loadProgress();

/** Прогресс из localStorage; нет его или он битый — по умолчанию. */
function loadProgress(): Progress {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULT_PROGRESS };
    const { tutorialDone, runs } = saved as Progress;
    return {
      tutorialDone: typeof tutorialDone === 'boolean' ? tutorialDone : DEFAULT_PROGRESS.tutorialDone,
      runs: typeof runs === 'number' && Number.isFinite(runs) && runs >= 0 ? Math.floor(runs) : DEFAULT_PROGRESS.runs,
    };
  } catch {
    return { ...DEFAULT_PROGRESS }; // хранилище запрещено или в нём не JSON
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

/** Забег закончился: счётчик забегов растёт. */
export function finishRun(): void {
  progress.runs += 1;
  saveProgress();
}

// Что открыто по числу законченных забегов (шаг 66). Значение берём из модульной переменной,
// а не из localStorage заново: она уже прочитана при загрузке и обновляется finishRun().
export function hasAmulets(): boolean {
  return progress.runs >= 1; // амулеты — со второго забега
}

export function hasDrum(): boolean {
  return progress.runs >= 2; // барабан — с третьего забега
}

export function hasCassette(): boolean {
  return progress.runs >= 3; // кассета — с четвёртого забега
}

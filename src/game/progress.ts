/**
 * Прогресс между забегами: что игрок уже видел. Живёт дольше сцены — в localStorage. Без Phaser.
 * По нему первый забег идёт с тьмой (reveal.ts), а дальше её уже нет.
 * Магазин открывается не по забегам, а по закрытым долгам (BaseScene: amuletsUnlocked и остальные).
 */

export interface Progress {
  tutorialDone: boolean; // первый забег с тьмой пройден — больше её не показываем
}

const PROGRESS_KEY = 'dolgovaya-yama-progress'; // ключ прогресса в localStorage
const DEFAULT_PROGRESS: Progress = { tutorialDone: false }; // новый игрок: тьма в первом забеге

let progress: Progress = loadProgress();

/** Прогресс из localStorage; нет его или он битый — по умолчанию. */
function loadProgress(): Progress {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULT_PROGRESS };
    const { tutorialDone } = saved as Progress;
    return {
      tutorialDone: typeof tutorialDone === 'boolean' ? tutorialDone : DEFAULT_PROGRESS.tutorialDone,
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

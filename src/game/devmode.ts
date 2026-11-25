/**
 * Режим разработчика: скрытый раздел «?» на планшете (WallScreen), код hookster включает его.
 * Флаг живёт в localStorage и переживает перезагрузку страницы — как прогресс (progress.ts) и настройки.
 * Пока режим включён, на планшете есть вкладка «ТЕСТ»: любые предметы, амулеты и фишки, а рекорд фишек не пишется.
 * Без Phaser — чтобы сцену и планшет можно было проверить отдельно.
 */

const DEV_MODE_KEY = 'dolgovaya-yama-devmode'; // ключ режима разработчика в localStorage
const DEV_CODE = 'hookster'; // что вводят в строке раздела «?», регистр не важен

/** Сколько фишек и билетов даёт вкладка «ТЕСТ» одной кнопкой. */
export const DEV_CHIPS = 10_000;
export const DEV_TICKETS = 1000;

/** Флаг из localStorage. Хранилище недоступно или там мусор — режим выключен. */
function loadDevMode(): boolean {
  try {
    return localStorage.getItem(DEV_MODE_KEY) === '1';
  } catch {
    return false; // хранилище запрещено — режим до перезагрузки страницы
  }
}

let devMode = loadDevMode();

/** Включён ли режим разработчика (переживает перезагрузку страницы). */
export function isDevMode(): boolean {
  return devMode;
}

/**
 * Ввели код code: верно (регистр и пробелы по краям не важны) — режим включён и запомнен.
 * Неверно — ничего не меняется, игра работает как обычно.
 */
export function tryEnableDevMode(code: string): boolean {
  if (code.trim().toLowerCase() !== DEV_CODE) return false;
  devMode = true;
  try {
    localStorage.setItem(DEV_MODE_KEY, '1');
  } catch {
    // не запомнили — режим останется до перезагрузки страницы
  }
  return true;
}

/** Выключить режим и убрать флаг: вкладка «ТЕСТ» с планшета пропадает. */
export function disableDevMode(): void {
  devMode = false;
  try {
    localStorage.removeItem(DEV_MODE_KEY);
  } catch {
    // хранилище недоступно — и так выключен
  }
}

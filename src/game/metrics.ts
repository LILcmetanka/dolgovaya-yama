/**
 * Метрики игры: Яндекс Метрика, цели-события важных моментов забега.
 *
 * Номер счётчика живёт здесь (COUNTER_ID), а сам скрипт Метрики грузит index.html.
 * Пока COUNTER_ID = 0, ничего не отправляется и initMetrics ничего не делает — игра работает как обычно.
 *
 * Что не отправляем: персональные данные, тексты, координаты. В параметрах — только игровые числа,
 * id карты/действия и случайный id попытки (attempt): по нему события одного забега связываются между собой.
 */

type Params = Record<string, string | number | boolean>;

type Metrika = (id: number, method: 'reachGoal', goal: string, params: Params) => void;

/** Номер счётчика Яндекс Метрики. 0 — Метрика выключена; замените на номер счётчика. */
const COUNTER_ID = 114661822;

/** Версия игры в параметрах событий. Обновлять вместе с version в package.json. */
export const GAME_VERSION = '0.5.0';

/** Функция Метрики в окне: до загрузки tag.js — очередь вызовов, после — сама Метрика. */
function getMetrika(): Metrika | undefined {
  return (window as Window & { ym?: Metrika }).ym;
}

/**
 * Событие-цель игры: ym(COUNTER_ID, 'reachGoal', event, params).
 * Безопасно всегда: нет ym (адблок, COUNTER_ID = 0), Метрика бросила — только предупреждение в консоли.
 */
export function track(event: string, params: Params = {}) {
  const data = { ...params, game_version: GAME_VERSION };
  if (import.meta.env.DEV) console.log('[analytics]', event, data);
  const ym = getMetrika();
  if (typeof ym === 'function') {
    try {
      ym(COUNTER_ID, 'reachGoal', event, data);
    } catch (error) {
      console.warn('Analytics error', error);
    }
  }
}

/**
 * Инициализация счётчика: ym(COUNTER_ID, 'init', {...}). Один раз на старте игры (config.ts).
 * В Metrika перечислен только 'reachGoal', поэтому для init — приведение к тому же вызову с другой целью.
 */
export function initMetrics(): void {
  if (COUNTER_ID <= 0) return;
  const ym = getMetrika();
  if (typeof ym !== 'function') return;
  try {
    (ym as unknown as (id: number, method: 'init', params: Params) => void)(COUNTER_ID, 'init', {
      clickmap: false,
      trackLinks: false,
      accurateTrackBounce: false,
      webvisor: false,
      game_version: GAME_VERSION,
    });
  } catch (error) {
    console.warn('Analytics error', error);
  }
}

/** Короткий случайный id попытки: время + четыре символа. Без персональных данных, живёт до конца забега. */
export function newAttemptId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

import { SCREEN } from './layout';

/**
 * «Богатый» текст на экране автомата: тон куска и общие размеры. Без Phaser: цвета и кегли нужны и чистым данным
 * (tutorial.ts), и Node-тестам. Phaser рисует по этим числам, но сам сюда не тянется.
 */

/** Тон куска строки: обычный (жёлтый LED) и цветные — для смысловых акцентов. */
export type ScreenTone = 'normal' | 'red' | 'white' | 'purple' | 'blue' | 'green' | 'orange';

/**
 * Цвет тона. Значения — те же, что цвета надписей в theme.ts (LED_COLOR, RED_TEXT, PURPLE_TEXT, BLUE_TEXT,
 * GREEN_TEXT, ORANGE_TEXT), продублированы здесь: theme.ts тянет Phaser, а этот модуль импортируют чистые данные и тесты.
 */
export const SCREEN_TONE_COLORS: Record<ScreenTone, string> = {
  normal: '#fbbf24', // LED_COLOR
  red: '#f87171', // RED_TEXT
  white: '#ffffff',
  purple: '#c084fc', // PURPLE_TEXT
  blue: '#38bdf8', // BLUE_TEXT
  green: '#4ade80', // GREEN_TEXT
  orange: '#fb923c', // ORANGE_TEXT
};

/** Размытие свечения под куском своего тона: чем ярче акцент, тем шире ореол. */
export const SCREEN_TONE_BLUR: Record<ScreenTone, number> = {
  normal: 12, // как у LED_STYLE в theme.ts
  red: 14,
  white: 10,
  purple: 14,
  blue: 14,
  green: 14,
  orange: 14,
};

/** Кегль строк обучения: крупно, но несколько строк ещё влезают в экран автомата. */
export const TUTORIAL_SCREEN_FONT = 36;
/** Ниже этого кегля не ужимаем: строка дальше ужимается масштабом по X. */
export const TUTORIAL_SCREEN_FONT_MIN = 18;
/** Ширина строки, в которую она обязана влезть: окно экрана за вычетом полей по 16. */
export const TUTORIAL_SCREEN_MAX_WIDTH = SCREEN.width - 32; // 428: 460 − 32

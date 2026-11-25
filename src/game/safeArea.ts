/**
 * Безопасная зона телефона («челка», скруглённые углы, домашняя полоска) в единицах раскладки.
 * Значения приходят из CSS-переменных --safe-* (style.css: env(safe-area-inset-*)); холст вписан в окно,
 * поэтому пиксели переводим в единицы раскладки по его масштабу. Если поле вокруг холста (letterbox) уже
 * шире отступа — отступ равен нулю: на компьютере и в обычном окне раскладка не сдвигается.
 */
import { VIEW_HEIGHT, VIEW_WIDTH } from './layout';

export interface SafeInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const NONE: SafeInsets = { left: 0, top: 0, right: 0, bottom: 0 };
let cache: SafeInsets | null = null;

/** Пиксели безопасной зоны из CSS-переменной корня (готовая величина env(), а не имя). */
function cssPixels(name: string): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

/** Отступы в единицах раскладки. Считается один раз до следующего поворота или входа в полный экран. */
export function safeInsets(): SafeInsets {
  cache ??= measure();
  return cache;
}

/** Окно повернули, вошли в полный экран или поменяли масштаб — перемерить при следующем обращении. */
export function forgetSafeInsets(): void {
  cache = null;
}

function measure(): SafeInsets {
  const canvas = document.querySelector('canvas');
  if (!canvas) return NONE;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return NONE;
  const kx = rect.width / VIEW_WIDTH; // пиксель окна → единица раскладки по ширине
  const ky = rect.height / VIEW_HEIGHT; // и по высоте
  return {
    left: Math.max(0, (cssPixels('--safe-left') - rect.left) / kx),
    top: Math.max(0, (cssPixels('--safe-top') - rect.top) / ky),
    right: Math.max(0, (cssPixels('--safe-right') - (window.innerWidth - rect.right)) / kx),
    bottom: Math.max(0, (cssPixels('--safe-bottom') - (window.innerHeight - rect.bottom)) / ky),
  };
}

window.addEventListener('resize', forgetSafeInsets);
window.addEventListener('orientationchange', forgetSafeInsets);
document.addEventListener('fullscreenchange', forgetSafeInsets);

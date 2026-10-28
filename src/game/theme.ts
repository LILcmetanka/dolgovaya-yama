import Phaser from 'phaser';

/**
 * Общий вид частей автомата: шрифт, цвета, стили надписей и слои.
 * Логики игры здесь нет — только то, как всё выглядит, и два маленьких помощника для надписей.
 */

/** Шрифт игры: в нём есть шрифты эмодзи. */
export const FONT = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

/** Огни и лампочки. */
export const LAMP_OFF = 0x431407; // выключенная лампочка
export const LAMP_GOLD = 0xfde047;
export const LAMP_RED = 0xef4444;
export const LAMP_GREEN = 0x4ade80;
export const LAMP_BLUE = 0x38bdf8; // щит отбил черепа
export const LAMP_GARLIC = 0xd9f99d; // пока действует чеснок, огни в покое бледно-зелёные
export const LAMP_BLOOD = 0x991b1b; // следующая прокрутка кровавая — огни в покое тёмно-красные
export const LAMP_ANGRY = 0xf97316; // фаза 2 «автомат злится» — огни в покое оранжевые
export const LAMP_PURPLE = 0xa855f7; // игра Дилера
export const LAMP_LUCK = 0x22c55e; // клевер: следующая прокрутка с паттерном — огни в покое ярко-зелёные

/** Цвета надписей. */
export const GOLD_TEXT = '#fde047';
export const GREEN_TEXT = '#4ade80';
export const RED_TEXT = '#f87171';
export const BLUE_TEXT = '#38bdf8';
export const PURPLE_TEXT = '#c084fc'; // паук съел часть кона
export const HINT_TEXT = 'rgba(255, 255, 255, 0.55)'; // подсказки клавиш
export const LED_COLOR = '#fbbf24';

/** Слои: чем больше число, тем выше лежит объект. */
export const CHIP_DEPTH = 5; // брызги фишек
export const POPUP_DEPTH = 10; // всплывающие надписи
export const TOOLTIP_DEPTH = 25; // подсказка при наведении — поверх всего, кроме экрана DEATH
export const GAME_OVER_DEPTH = 30; // экран DEATH — конец забега

/** Всплывающие надписи жирные и с тёмной обводкой, чтобы читались поверх сетки. */
export const POPUP_STYLE = { fontSize: '36px', fontStyle: 'bold', stroke: '#0f172a', strokeThickness: 6 };
/** Цифры табло и окошек светятся, как на LED-табло. */
export const LED_STYLE = {
  fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
  fontSize: '32px',
  fontStyle: 'bold',
  color: LED_COLOR,
  shadow: { color: '#f59e0b', blur: 12, fill: true },
};

/**
 * Во сколько раз крупнее рисуются надписи и запечённые картинки (decor.ts): камера увеличивает вид до Full HD
 * (layout.ts, ZOOM), и крупно нарисованное остаётся чётким. На экране они стоят в прежнем размере.
 */
export const TEXTURE_SCALE = 2;

/** scene.add.text с нашим шрифтом (в нём есть шрифты эмодзи), нарисованный чётко для Full HD. */
export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontFamily: FONT, resolution: TEXTURE_SCALE, ...style });
}

/**
 * Телефон или планшет: мыши нет, наведения нет — управляют пальцем. Тогда клавиатуры нет и подсказки клавиш не нужны,
 * а подсказка вещи появляется от долгого нажатия (tooltip.ts). Это CSS-запрос: главный указатель не умеет наводиться
 * и он грубый (палец). Одного «не наводится» мало: так отвечает и компьютер совсем без мыши.
 */
export const IS_TOUCH_ONLY = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/** Текст подсказки клавиши («Пробел», «1»…). На телефоне клавиатуры нет — пусто. */
export function keyHint(key: string): string {
  return IS_TOUCH_ONLY ? '' : key;
}

/** Подсказка клавиши — мелкая серая надпись с серединой в (x, y). На телефоне она пустая. */
export function addKeyHint(scene: Phaser.Scene, x: number, y: number, key: string, fontSize = '13px'): Phaser.GameObjects.Text {
  return addText(scene, x, y, keyHint(key), { fontSize, color: HINT_TEXT }).setOrigin(0.5);
}

/** Надпись или картинка коротко пульсирует: увеличивается в scale раз и возвращается к обычному размеру base. */
export function pulse(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Text | Phaser.GameObjects.Image,
  scale = 1.25,
  base = 1,
): void {
  scene.tweens.killTweensOf(target);
  target.setScale(base);
  scene.tweens.add({ targets: target, scale: base * scale, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
}

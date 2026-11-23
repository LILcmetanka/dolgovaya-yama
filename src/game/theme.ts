import Phaser from 'phaser';
import type { ActionId } from './actions';
import type { UpgradeGroup } from './upgrades';

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
export const LAMP_PURPLE = 0xa855f7; // стол Дилера
export const LAMP_LUCK = 0x22c55e; // клевер: следующая прокрутка с паттерном — огни в покое ярко-зелёные

/** Цвета надписей. */
export const GOLD_TEXT = '#fde047';
export const GREEN_TEXT = '#4ade80';
export const RED_TEXT = '#f87171';
export const BLUE_TEXT = '#38bdf8';
export const PURPLE_TEXT = '#c084fc'; // паук съел часть кона
export const HINT_TEXT = 'rgba(255, 255, 255, 0.55)'; // бледный значок в углу (🔇)
export const LED_COLOR = '#fbbf24';

/** Слои: чем больше число, тем выше лежит объект. */
export const CHIP_DEPTH = 5; // брызги фишек
export const SHOP_PANEL_DEPTH = 9; // панель магазина: выше корпуса и сетки (0–2) и трещин (8), ниже фишек-перелётов и всплывашек (10)
export const SHOP_FLY_DEPTH = 10; // перелёты, рождённые в магазине
export const POPUP_DEPTH = 10; // всплывающие надписи
export const REVEAL_DEPTH = 12; // тьма первого забега (reveal.ts): над частями и фишками (5), под подсказкой (25) и паузой
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

/**
 * Экранный список (шаг 41): корпус, стекло, шапка, строки и плашка кнопки. Числа — в единицах раскладки
 * (их камера увеличивает в ZOOM раз), цвета — те же бронза/латунь/стекло, что у автомата. Один набор на все
 * списки: действия, улучшения, память амулетов, выбор автомата и символа, отмена черепа, — поэтому они и
 * выглядят одинаково.
 */
export const SCREEN_UI = {
  // 1. Корпус: хромированная окантовка вокруг стекла и заклёпки по углам.
  frame: 7, // толщина окантовки, px
  outerRadius: 22, // скругление внешнего края окантовки — как у рамки экрана автомата (decor.ts)
  glassRadius: 16, // скругление стекла — ровно как у экрана автомата
  chromeTop: 0x7c8794,
  chromeMid: 0x4b545f,
  chromeBottom: 0x333a44,
  chromeEdgeLight: 0xaab4c0, // светлая верхняя кромка
  chromeEdgeLightAlpha: 0.9,
  chromeEdgeDark: 0x1b1f26, // тёмная нижняя кромка
  rivetRadius: 2.5, // заклёпка 5 px
  rivetInset: 9, // от края окантовки до центра заклёпки
  rivetLight: 0xc9d2dc,
  rivetDark: 0x5b636d,
  rivetOutline: 0x1b1f26,
  // 2. Стекло: радиальный градиент, тёплая виньетка, сканлайны, внутренняя тень.
  glassCenter: 0x121a24,
  glassEdge: 0x070b11,
  glassVignette: 0x2a1408,
  glassVignetteAlpha: 0.35,
  scanline: 0xffffff,
  scanlineAlpha: 0.03,
  scanlineStep: 3, // линия каждые 3 px
  innerShadow: 0x000000,
  innerShadowAlpha: 0.6,
  innerShadowWidth: 2,
  // 3. Шапка: гравированная полоска, название и подпись.
  headerHeight: 46,
  headerPlateAlpha: 0.35,
  headerPlateRadius: 6,
  headerPlateInset: 6,
  headerLine: 0xf59e0b,
  headerLineAlpha: 0.25,
  titleColor: '#fde047',
  titleFont: 14,
  titleSpacing: 1,
  titleMinFont: 10,
  captionColor: '#b8a48a',
  captionFont: 11,
  captionMinFont: 9,
  headerTitleY: 16, // середина названия от верха стекла
  headerCaptionY: 32, // середина подписи от верха стекла
  // 4. Строки: у всех списков один ритм — название 17, описание 12 в одну-две строки, строка 56.
  rowHeight: 56, // не меньше минимума 44: палец попадает
  divider: 0xf59e0b,
  dividerAlpha: 0.12,
  rowTitleColor: '#f6e7c1',
  rowTitleFont: 17,
  rowTitleMinFont: 11,
  rowTitleY: 16, // середина первой строки текста от верха строки
  rowDescColor: '#9c8f80',
  rowDescFont: 12,
  rowDescMinFont: 11, // ниже почти не ужимается: ритм списка не пляшет; 11 — только самое длинное описание
  rowDescMaxLines: 2,
  rowDescTop: 27, // верх описания от верха строки: строка 17 + две строки 12 помещаются в 56
  rowDescLineSpacing: -1,
  rowTextInset: 6, // от левого края строки до значка/названия
  rowIconSlot: 30, // ширина места под значок: название идёт правее, описание — во всю ширину
  rowIconFont: 20,
  dangerTitleColor: '#f87171',
  dangerDescColor: 'rgba(248, 113, 113, 0.85)',
  hoverBar: 0xf59e0b,
  hoverBarWidth: 3,
  hoverFillAlpha: 0.1,
  disabledAlpha: 0.45, // недоступная строка: название, значок и описание вполнакала
  reasonColor: '#8d8174', // причина рядом с плашкой — серым
  reasonFont: 11,
  reasonMinFont: 9,
  reasonGap: 8,
  // 4а. Пустые окна автомата, пока открыт список: мягкая накатка, чтобы чёрное стекло не читалось дырой.
  quietFill: 0xb9ad9c,
  quietAlpha: 0.3,
  quietEdge: 0x000000,
  quietEdgeAlpha: 0.22,
  quietRadius: 8,
  // 4б. Стрелка «ещё есть» внизу стекла, когда под видимыми строками остались ещё.
  moreArrowHalf: 7,
  moreArrowHeight: 5,
  moreArrowInset: 8,
  moreArrowGlowAlpha: 0.18, // мягкое свечение вокруг стрелки
  // 5. Штампованная плашка кнопки.
  buttonWidth: 92,
  buttonHeight: 30,
  buttonRadius: 4,
  buttonTop: 0x4a3414,
  buttonBottom: 0x241a0b,
  buttonPressedTop: 0x6b4c1d,
  buttonPressedBottom: 0x33250f,
  buttonDisabledTop: 0x2a2418,
  buttonBorder: 0xa16207,
  buttonDisabledBorder: 0x3a3a3a,
  buttonText: '#fbbf24',
  buttonDisabledText: '#6b6357',
  buttonDangerText: '#f87171',
  buttonFont: 13,
  buttonMinFont: 9,
  buttonTextInset: 7,
  buttonIconGap: 3,
  buttonPressShift: 2, // нажатая плашка уходит вниз на 2 px
  chipIconSize: 13, // значок фишки в ценнике
  ticketIconFont: 13, // значок билета в ценнике
  // 6. Прокрутка: рельса, ползунок, стрелки и мягкое затемнение снизу.
  railWidth: 3,
  railInset: 6, // от правого края стекла до середины рельсы
  railColor: 0x3b2a12,
  railThumb: 0xb4832a,
  railMinThumb: 14,
  arrowSize: 4,
  arrowColor: 0xb4832a,
  arrowDimAlpha: 0.28,
  fadeHeight: 28, // затемнение внизу стекла: мягкий край вместо обрезанной строки
  fadeAlpha: 0.55,
  // Поля и кнопки шапки.
  padLeft: 10,
  padRight: 14, // место под рельсу прокрутки
  padBottom: 6,
  headerButtonSize: 26, // латунная шайба «✕» / «←»
  headerButtonRadius: 6,
  headerButtonFill: 0x1f1a12,
  headerButtonBorder: 0xa16207,
  headerButtonText: '#fbbf24',
  headerButtonFont: 16,
  headerButtonInset: 6, // от правого края стекла до шайбы
  headerButtonStep: 46, // от «✕» до «←»
  touchSize: 44, // зона нажатия шапки: палец тоже попадает
} as const;

/**
 * Значки списков (шаг 42): системные эмодзи, как символы игры, — без внешних картинок.
 * У действий — свой знак, у улучшений — по группе: списки читаются с одного взгляда.
 */
export const ACTION_ICONS: Record<ActionId, string> = {
  exchange: '⇄',
  lottery: '🎲',
  service: '🔧',
  theft: '✋',
  sale: '💰',
  debt: '📉',
};

export const UPGRADE_GROUP_ICONS: Record<UpgradeGroup, string> = {
  spins: '🎰',
  debt: '📉',
  chips: '💰',
  tickets: '🎟',
  items: '📦',
  amulets: '🔮',
  grid: '🎯',
  shop: '🏪',
  tape: '📼',
  other: '⚙',
};

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
 * Телефон или планшет: мыши нет, наведения нет — управляют пальцем. Тогда подсказка вещи появляется от долгого нажатия
 * (tooltip.ts). Это CSS-запрос: главный указатель не умеет наводиться и он грубый (палец). Одного «не наводится» мало: так отвечает и компьютер совсем без мыши.
 */
export const IS_TOUCH_ONLY = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/**
 * Вписать надпись в maxWidth: сначала кегль уменьшается от maxFontSize до minFontSize, а если и на нём не влезло —
 * надпись ужимается масштабом. updateText зовём явно перед каждой проверкой: ширина должна быть от свежих букв,
 * иначе длинный ценник «× 101200» вылезает за тёмную табличку и стекло (DONTLIKE з.10).
 */
export function fitTextWidth(
  text: Phaser.GameObjects.Text,
  value: string,
  maxWidth: number,
  maxFontSize: number,
  minFontSize: number,
): void {
  text.setText(value).setScale(1);
  let size = maxFontSize;
  text.setFontSize(size);
  text.updateText();
  while (text.width > maxWidth && size > minFontSize) {
    size -= 1;
    text.setFontSize(size);
    text.updateText();
  }
  if (text.width > maxWidth) text.setScale(maxWidth / text.width);
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

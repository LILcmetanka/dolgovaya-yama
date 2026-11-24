import Phaser from 'phaser';
import { CHIP_TEXTURE } from '../decor';
import { SCREEN } from '../layout';
import { addText, fitTextWidth, GAME_OVER_DEPTH, SCREEN_UI as UI, TEXTURE_SCALE } from '../theme';

/**
 * Экранный список (шаг 37, корпус — шаг 41): единственное место, где игрок выбирает что-то из нового. Живёт НА
 * экране автомата (SCREEN, 460×288) — там же, где GOOD LUCK, KABOOM и ПАТТЕРН СОБРАН, — а не в отдельном окне
 * поверх игры. Никакого затемнения на весь вид: рычаг и корпус автомата остаются видны.
 *
 * Как он выглядит (шаг 41): не дебаг-консоль, а стекло автомата. Вокруг стекла — хромированная окантовка
 * с заклёпками по углам, под ней тёмное стекло с радиальным градиентом, тёплой виньеткой и сканлайнами. Сверху
 * гравированная шапка с названием и подписью, строки с разделителями и значками, справа — штампованная плашка
 * кнопки (цена с иконкой фишки/билета или «ВЗЯТЬ»), справа по стеклу — рельса прокрутки. Все цвета, толщины и
 * градиенты — SCREEN_UI в theme.ts: один набор на все списки.
 *
 * Содержимое не вылезает за рамку: ширины считаются от поля стекла, длинные названия ужимаются fitTextWidth,
 * описания переносятся, а по внутреннему периметру поверх строк лежит тень — она же закрывает край. Phaser 4
 * в WebGL не умеет маску-геометрию (setMask оттуда убран), поэтому обрезка сделана раскладкой и этой тенью.
 * Строка показывается только целиком (частичной строки на краю нет), а снизу — полоса мягкого затемнения и
 * маленькая стрелка «ещё есть».
 *
 * Список листается колесом мыши, свайпом и стрелками ↑/↓; рельса справа показывает, что строки не все влезли.
 * Строки — 56 px в единицах раскладки (не меньше минимума 44), видно столько, сколько влезает по высоте стекла.
 *
 * Недоступная строка погашена: название, значок и описание вполнакала, плашка в неактивной палитре, а причина —
 * серой подписью у кнопки; наведения на такую строку нет.
 *
 * Часть только показывает готовые строки и сообщает о нажатии: цены, доступность и эффекты считает сцена.
 * Клавиши по-прежнему работают (1–6 — строки, 0 — назад или закрыть), но подсказок про них на экране нет.
 */
// Список — не окно поверх игры, а САМ экран автомата: тот же прямоугольник SCREEN, без своей рамки.
// Поэтому он лежит над корпусом и сеткой (2), но под новостями на стекле (10), магазином (9), планшетом (25)
// и паузой (30) — ничего не «наслаивается».
const DEPTH = 13; // над тьмой обучения (12): выбор автомата в первом забеге должен быть виден
export const SCREEN_LIST_OVER_DEATH_DEPTH = GAME_OVER_DEPTH + 2; // экран улучшений — поверх затемнения смерти (30)
const CLOSE_KEY_INDEX = 9; // клавиша «0»: закрыть список (в выборе — назад)
const DRAG_STEP = 24; // столько нужно провести пальцем, чтобы список сдвинулся на строку

// Стекло списка — ровно SCREEN: рамку с лампочками рисует корпус автомата (decor.ts), своей рамки у
// списка нет, он просто заменяет экран (DONTLIKE п.3, п.4).
const GLASS_LEFT = SCREEN.x - SCREEN.width / 2;
const GLASS_TOP = SCREEN.y - SCREEN.height / 2;
const GLASS_RIGHT = SCREEN.x + SCREEN.width / 2;
const GLASS_BOTTOM = SCREEN.y + SCREEN.height / 2;
const GLASS_WIDTH = SCREEN.width;
const GLASS_HEIGHT = SCREEN.height;
const ROWS_TOP = GLASS_TOP + UI.headerHeight;
const ROWS_BOTTOM = GLASS_BOTTOM - UI.padBottom;
const ROW_LEFT = GLASS_LEFT + UI.padLeft;
const ROW_RIGHT = GLASS_RIGHT - UI.padRight;
const ROW_WIDTH = ROW_RIGHT - ROW_LEFT;
const ROW_STEP = UI.rowHeight;
// Шапка: латунные шайбы «✕» и «←» у правого края стекла, зоны нажатия — 44×44.
const CLOSE_X = GLASS_RIGHT - UI.headerButtonInset - UI.headerButtonSize / 2;
const BACK_X = CLOSE_X - UI.headerButtonStep;
const HEADER_BUTTON_Y = GLASS_TOP + (UI.headerHeight - 2) / 2;
// Плашка кнопки в строке: правое поле — уже за ней оставлено место под рельсу прокрутки.
const PLATE_RIGHT = ROW_RIGHT - 3;
const PLATE_LEFT = PLATE_RIGHT - UI.buttonWidth;
// Текст строки: название идёт за значком, описание — во всю ширину до плашки (иначе длинное не влезает в две строки).
const ROW_TEXT_LEFT = ROW_LEFT + UI.rowTextInset;
const DESC_WIDTH = PLATE_LEFT - 8 - ROW_TEXT_LEFT;
// Рельса прокрутки — внутри стекла, у правого края.
const RAIL_X = GLASS_RIGHT - UI.railInset - UI.railWidth / 2;
const RAIL_TOP = ROWS_TOP + UI.arrowSize * 2 + 2;
const RAIL_BOTTOM = ROWS_BOTTOM - UI.arrowSize * 2 - 2;

const PANEL_TEXTURE = 'screen-list-panel'; // стекло списка, запечённое один раз (без своей рамки)
const PANEL_WIDTH = GLASS_WIDTH;
const PANEL_HEIGHT = GLASS_HEIGHT;
const BUTTON_TEXTURE = 'screen-list-button'; // штампованная плашка: обычная, нажатая, недоступная
const BUTTON_PRESSED_TEXTURE = 'screen-list-button-pressed';
const BUTTON_OFF_TEXTURE = 'screen-list-button-off';
const HOVER_BANDS = 12; // подсветка строки: ступени затухания слева направо
const FADE_BANDS = 6; // мягкое затемнение снизу: ступени по высоте

/** Цвет числа — в строку canvas. */
function colorOf(value: number): string {
  return '#' + value.toString(16).padStart(6, '0');
}

/** Цвет числа с прозрачностью — в строку canvas. */
function rgbaOf(value: number, alpha: number): string {
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Прямоугольник со скруглёнными углами — путь на canvas 2D (ctx.roundRect есть не везде). */
function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Стекло: радиальный градиент, тёплая виньетка по углам, сканлайны и внутренняя тень по периметру. */
function drawGlass(ctx: CanvasRenderingContext2D): void {
  const gx = 0;
  const gy = 0;
  const cx = gx + GLASS_WIDTH / 2;
  const cy = gy + GLASS_HEIGHT / 2;
  ctx.save();
  roundedPath(ctx, gx, gy, GLASS_WIDTH, GLASS_HEIGHT, UI.glassRadius);
  ctx.clip();
  const glass = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(SCREEN.width, SCREEN.height) * 0.72);
  glass.addColorStop(0, colorOf(UI.glassCenter));
  glass.addColorStop(1, colorOf(UI.glassEdge));
  ctx.fillStyle = glass;
  ctx.fillRect(gx, gy, GLASS_WIDTH, GLASS_HEIGHT);
  const vignetteRadius = Math.min(GLASS_WIDTH, GLASS_HEIGHT) * 0.62;
  const corners: Array<[number, number]> = [
    [gx, gy],
    [gx + GLASS_WIDTH, gy],
    [gx, gy + GLASS_HEIGHT],
    [gx + GLASS_WIDTH, gy + GLASS_HEIGHT],
  ];
  for (const [px, py] of corners) {
    const vignette = ctx.createRadialGradient(px, py, 0, px, py, vignetteRadius);
    vignette.addColorStop(0, rgbaOf(UI.glassVignette, UI.glassVignetteAlpha));
    vignette.addColorStop(1, rgbaOf(UI.glassVignette, 0));
    ctx.fillStyle = vignette;
    ctx.fillRect(gx, gy, GLASS_WIDTH, GLASS_HEIGHT);
  }
  ctx.fillStyle = rgbaOf(UI.scanline, UI.scanlineAlpha);
  for (let y = gy; y < gy + GLASS_HEIGHT; y += UI.scanlineStep) ctx.fillRect(gx, y, GLASS_WIDTH, 1);
  ctx.strokeStyle = rgbaOf(UI.innerShadow, UI.innerShadowAlpha);
  ctx.lineWidth = UI.innerShadowWidth;
  roundedPath(ctx, gx + 1, gy + 1, GLASS_WIDTH - 2, GLASS_HEIGHT - 2, UI.glassRadius - 1);
  ctx.stroke();
  ctx.restore();
}

/** Описание строки: перенос до двух строк; если текст длинный — кегль мельче на шаг, но слова не теряются. */
function fitDescLines(
  text: Phaser.GameObjects.Text,
  value: string,
  width: number,
  maxFont: number,
  minFont: number,
  maxLines: number,
): void {
  text.setFontSize(maxFont).setWordWrapWidth(width).setText(value);
  let size = maxFont;
  while (size > minFont && text.getWrappedText(value).length > maxLines) {
    size -= 1;
    text.setFontSize(size);
  }
}

/** Запечь корпус и стекло списка — один раз на игру. */
function createPanelTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PANEL_TEXTURE)) return;
  const canvas = scene.textures.createCanvas(PANEL_TEXTURE, PANEL_WIDTH * TEXTURE_SCALE, PANEL_HEIGHT * TEXTURE_SCALE);
  if (!canvas) return;
  const ctx = canvas.context;
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  drawGlass(ctx);
  canvas.refresh();
  canvas.source[0].resolution = TEXTURE_SCALE;
  canvas.get().setTrim(PANEL_WIDTH, PANEL_HEIGHT, 0, 0, PANEL_WIDTH, PANEL_HEIGHT);
}

/**
 * Запечь плашку кнопки: вертикальный градиент, рамка 1 px и светлая внутренняя кромка — «штамповка».
 * Градиентом на canvas, а не fillGradientStyle: у Graphics он ложится ступенями и цвет плывёт.
 */
function createButtonTexture(scene: Phaser.Scene, key: string, top: number, bottom: number, border: number): void {
  if (scene.textures.exists(key)) return;
  const width = UI.buttonWidth;
  const height = UI.buttonHeight;
  const canvas = scene.textures.createCanvas(key, width * TEXTURE_SCALE, height * TEXTURE_SCALE);
  if (!canvas) return;
  const ctx = canvas.context;
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  roundedPath(ctx, 0.5, 0.5, width - 1, height - 1, UI.buttonRadius);
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colorOf(top));
  gradient.addColorStop(1, colorOf(bottom));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = colorOf(border);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(UI.buttonRadius, 2, width - UI.buttonRadius * 2, 1);
  canvas.refresh();
  canvas.source[0].resolution = TEXTURE_SCALE;
  canvas.get().setTrim(width, height, 0, 0, width, height);
}

/** Все три вида плашки: обычная, нажатая (светлее) и недоступная (серая рамка). */
function createButtonTextures(scene: Phaser.Scene): void {
  createButtonTexture(scene, BUTTON_TEXTURE, UI.buttonTop, UI.buttonBottom, UI.buttonBorder);
  createButtonTexture(scene, BUTTON_PRESSED_TEXTURE, UI.buttonPressedTop, UI.buttonPressedBottom, UI.buttonBorder);
  createButtonTexture(scene, BUTTON_OFF_TEXTURE, UI.buttonDisabledTop, UI.buttonBottom, UI.buttonDisabledBorder);
}

/** Одна строка списка: название, подпись, значок и плашка кнопки справа. */
export interface ScreenRow {
  title: string;
  desc?: string;
  icon?: string; // знак символа, амулета, автомата или группы улучшений — слева в строке, на одной линии с названием
  right?: string; // текст на плашке справа: «ВЗЯТЬ», «ВЫБРАТЬ», цена, риск
  cost?: 'chips' | 'tickets'; // цена: перед числом значок фишки или билета
  enabled?: boolean; // false — плашка серая, строка вполнакала, нажатие отвечает отказом (onDeny)
  deny?: string; // причина, почему нельзя: серой подписью у кнопки (только у недоступной строки)
  danger?: boolean; // красная строка (кража, череп)
}

/** Что сцена говорит списку при показе. Клавиша «0»: onBack, иначе onClose. */
export interface ScreenListOptions {
  title: string;
  caption?: string;
  onPick: (index: number) => void;
  onDeny?: (index: number) => void;
  onClose?: () => void;
  onBack?: () => void;
}

/** Нарисованная строка: её зона нажатия, надписи, значок и верх строки для перерисовки плашки. */
interface RowView {
  zone: Phaser.GameObjects.Zone;
  plate: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Text | null;
  title: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text | null;
  right: Phaser.GameObjects.Text | null;
  costIcon: Phaser.GameObjects.Text | Phaser.GameObjects.Image | null;
  reason: Phaser.GameObjects.Text | null;
  enabled: boolean;
  danger: boolean;
  top: number;
}

export class ScreenList {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  /** Всё нарисованное: сценарий проверки обходит этот набор. */
  readonly parts: Phaser.GameObjects.GameObject[] = [];
  /** Зоны строк по порядку: сценарий щёлкает по их границам. */
  readonly rows: Phaser.GameObjects.Zone[] = [];
  private views: RowView[] = [];
  private data: ScreenRow[] = [];
  private options: ScreenListOptions | null = null;
  private topIndex = 0;
  private open = false;
  private hoverIndex: number | null = null;
  private pressedIndex: number | null = null;
  private dragStart: number | null = null;
  private dragMoved = false;
  /** Строки и рельса — отдельным слоем: при наведении и нажатии перерисовывается только он. */
  private strips: Phaser.GameObjects.Graphics | null = null;
  /** Тень по периметру стекла и затемнение снизу — поверх строк: ничего не выглядывает за рамку. */
  private overlay: Phaser.GameObjects.Graphics | null = null;
  /** Крестик в шапке: у него своя зона 44×44 (сценарий проверки нажимает по ней). */
  closeZone: Phaser.GameObjects.Rectangle | null = null;
  /** Стрелка «назад» в шапке — в выборе символа и в списке действий. */
  backZone: Phaser.GameObjects.Rectangle | null = null;

  constructor(scene: Phaser.Scene, depth = DEPTH) {
    this.scene = scene;
    this.depth = depth;
    scene.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (this.open) this.scroll(dy > 0 ? 1 : -1);
    });
    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.startDrag(pointer));
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.drag(pointer));
    scene.input.on('pointerup', () => this.releasePress());
  }

  /** Список на виду: клавиши и клики идут ему, а не игре. */
  get isOpen(): boolean {
    return this.open;
  }

  /** То же, что rows: так удобнее сценариям, которые раньше искали кнопки. */
  get buttons(): Phaser.GameObjects.Zone[] {
    return this.rows;
  }

  /** Сколько строк влезает в стекло целиком — по его высоте, а не «магическим» числом. */
  private get visibleCount(): number {
    return Math.max(1, Math.floor((ROWS_BOTTOM - ROWS_TOP) / ROW_STEP));
  }

  show(rows: readonly ScreenRow[], options: ScreenListOptions): void {
    this.clear();
    if (rows.length === 0) return;
    this.open = true;
    this.data = [...rows];
    this.options = options;
    this.topIndex = 0;
    this.drawFrame(options);
    rows.forEach((row, index) => this.addRow(row, index));
    this.layout();
  }

  /** Клавиша 1–9 или 0: строка по номеру, «0» — назад (если есть) или закрыть. */
  press(index: number): boolean {
    if (!this.open || !this.options) return false;
    if (index === CLOSE_KEY_INDEX) {
      if (this.options.onBack) this.options.onBack();
      else this.options.onClose?.();
      return true;
    }
    const row = this.data[index];
    if (!row) return true;
    if (row.enabled === false) this.options.onDeny?.(index);
    else this.options.onPick(index);
    return true;
  }

  /** Прокрутить на delta строк: колесо, свайп и стрелки ↑/↓. */
  scroll(delta: number): void {
    if (!this.open) return;
    const max = Math.max(0, this.data.length - this.visibleCount);
    const next = Phaser.Math.Clamp(this.topIndex + delta, 0, max);
    if (next === this.topIndex) return;
    this.topIndex = next;
    this.layout();
  }

  close(): void {
    this.clear();
  }

  /** Корпус со стеклом, шапка и две кнопки в ней: «✕» и, если можно вернуться, «←». */
  private drawFrame(options: ScreenListOptions): void {
    createPanelTexture(this.scene);
    createButtonTextures(this.scene);
    const panel = this.scene.add.image(SCREEN.x, SCREEN.y, PANEL_TEXTURE).setDepth(this.depth);
    const strips = this.scene.add.graphics().setDepth(this.depth + 0.01);
    const overlay = this.scene.add.graphics().setDepth(this.depth + 0.03);
    this.strips = strips;
    this.overlay = overlay;
    this.parts.push(panel, strips, overlay);

    const titleMax = (options.onBack ? BACK_X - UI.headerButtonSize / 2 : CLOSE_X - UI.headerButtonSize / 2) - ROW_LEFT - 8;
    const title = addText(this.scene, ROW_LEFT, GLASS_TOP + (options.caption ? UI.headerTitleY : UI.headerHeight / 2 - 1), options.title.toUpperCase(), {
      fontSize: `${UI.titleFont}px`,
      color: UI.titleColor,
      fontStyle: 'bold',
      letterSpacing: UI.titleSpacing,
      shadow: { color: '#f59e0b', blur: 6, fill: true },
    })
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 0.02);
    fitTextWidth(title, options.title.toUpperCase(), titleMax, UI.titleFont, UI.titleMinFont);
    this.parts.push(title);
    if (options.caption) {
      const caption = addText(this.scene, ROW_LEFT, GLASS_TOP + UI.headerCaptionY, options.caption, {
        fontSize: `${UI.captionFont}px`,
        color: UI.captionColor,
        fontStyle: 'normal',
        shadow: { color: '#000000', blur: 2, fill: true },
      })
        .setOrigin(0, 0.5)
        .setDepth(this.depth + 0.02);
      fitTextWidth(caption, options.caption, titleMax, UI.captionFont, UI.captionMinFont);
      this.parts.push(caption);
    }
    if (options.onBack) this.addHeaderButton(BACK_X, '←', () => options.onBack?.(), 'back');
    if (options.onClose) this.addHeaderButton(CLOSE_X, '✕', () => options.onClose?.(), 'close');
  }

  /** Латунная шайба в шапке: «✕» или «←». Зона нажатия — 44×44, шайба нарисована в слое строк. */
  private addHeaderButton(x: number, text: string, action: () => void, kind: 'close' | 'back'): void {
    const label = addText(this.scene, x, HEADER_BUTTON_Y, text, {
      fontSize: `${UI.headerButtonFont}px`,
      color: UI.headerButtonText,
      fontStyle: 'bold',
      shadow: { color: '#000000', blur: 3, fill: true },
    })
      .setOrigin(0.5)
      .setDepth(this.depth + 0.02);
    const zone = this.scene.add
      .rectangle(x, HEADER_BUTTON_Y, UI.touchSize, UI.touchSize, 0x000000, 0)
      .setDepth(this.depth + 0.04)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (!this.dragMoved) action();
    });
    if (kind === 'close') this.closeZone = zone;
    else this.backZone = zone;
    this.parts.push(label, zone);
  }

  /** Одна строка: значок, название, описание и плашка справа. Вся строка — одна зона нажатия. */
  private addRow(row: ScreenRow, index: number): void {
    const enabled = row.enabled !== false;
    const zone = this.scene.add
      .zone(SCREEN.x, SCREEN.y, ROW_WIDTH, UI.rowHeight)
      .setDepth(this.depth + 0.04)
      .setInteractive({ useHandCursor: enabled });
    zone.on('pointerover', () => this.setHover(index));
    zone.on('pointerout', () => {
      if (this.hoverIndex === index) this.setHover(null);
    });
    zone.on('pointerdown', () => this.pressRow(index));
    zone.on('pointerup', () => {
      this.releasePress();
      if (this.dragMoved) return;
      if (enabled) this.options?.onPick(index);
      else this.options?.onDeny?.(index);
    });

    const plate = this.scene.add
      .image(PLATE_RIGHT - UI.buttonWidth / 2, ROWS_TOP, enabled ? BUTTON_TEXTURE : BUTTON_OFF_TEXTURE)
      .setDepth(this.depth + 0.015);
    const icon = row.icon
      ? addText(this.scene, 0, 0, row.icon, {
          fontSize: `${UI.rowIconFont}px`,
          color: '#ffffff',
        })
          .setOrigin(0.5)
          .setDepth(this.depth + 0.02)
      : null;
    // Причина у недоступной строки: серая подпись у кнопки, на линии названия.
    const reasonText = !enabled && row.deny ? row.deny : '';
    const reason = reasonText
      ? addText(this.scene, 0, 0, reasonText, {
          fontSize: `${UI.reasonFont}px`,
          color: UI.reasonColor,
          fontStyle: 'normal',
          shadow: { color: '#000000', blur: 2, fill: true },
        })
          .setOrigin(1, 0.5)
          .setDepth(this.depth + 0.02)
      : null;
    if (reason) fitTextWidth(reason, reasonText, DESC_WIDTH * 0.55, UI.reasonFont, UI.reasonMinFont);
    const iconWidth = row.icon ? UI.rowIconSlot : 0;
    const titleWidth = DESC_WIDTH - iconWidth - (reason ? reason.displayWidth + UI.reasonGap : 0);
    const title = addText(this.scene, 0, 0, row.title, {
      fontSize: `${UI.rowTitleFont}px`,
      color: row.danger ? UI.dangerTitleColor : UI.rowTitleColor,
      fontStyle: 'bold',
      shadow: { color: '#000000', blur: 3, fill: true },
    })
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 0.02);
    fitTextWidth(title, row.title, titleWidth, UI.rowTitleFont, UI.rowTitleMinFont);
    const desc = row.desc
      ? addText(this.scene, 0, 0, row.desc, {
          fontSize: `${UI.rowDescFont}px`,
          color: row.danger ? UI.dangerDescColor : UI.rowDescColor,
          fontStyle: 'normal',
          wordWrap: { width: DESC_WIDTH },
          maxLines: UI.rowDescMaxLines,
          lineSpacing: UI.rowDescLineSpacing,
          shadow: { color: '#000000', blur: 2, fill: true },
        })
          .setOrigin(0, 0)
          .setDepth(this.depth + 0.02)
      : null;
    if (desc) fitDescLines(desc, row.desc ?? '', DESC_WIDTH, UI.rowDescFont, UI.rowDescMinFont, UI.rowDescMaxLines);
    const plateTextWidth = UI.buttonWidth - UI.buttonTextInset * 2 - (row.cost ? UI.chipIconSize + UI.buttonIconGap : 0);
    const right = row.right
      ? addText(this.scene, 0, 0, row.right, {
          fontSize: `${UI.buttonFont}px`,
          color: !enabled ? UI.buttonDisabledText : row.danger ? UI.buttonDangerText : UI.buttonText,
          fontStyle: 'bold',
          shadow: { color: '#000000', blur: 3, fill: true },
        })
          .setOrigin(1, 0.5)
          .setDepth(this.depth + 0.02)
      : null;
    if (right) fitTextWidth(right, row.right ?? '', plateTextWidth, UI.buttonFont, UI.buttonMinFont);
    const costIcon = row.cost ? this.addCostIcon(row.cost, enabled) : null;
    if (!enabled) {
      // Погашенная строка: название, значок и описание вполнакала — видно, что нажать нельзя, ещё до плашки.
      title.setAlpha(UI.disabledAlpha);
      icon?.setAlpha(UI.disabledAlpha);
      desc?.setAlpha(UI.disabledAlpha);
    }

    const texts = [icon, title, desc, right, costIcon, reason].filter(
      (part): part is Phaser.GameObjects.Text | Phaser.GameObjects.Image => part !== null,
    );
    this.views.push({ zone, plate, icon, title, desc, right, costIcon, reason, enabled, danger: row.danger === true, top: ROWS_TOP });
    this.rows.push(zone);
    this.parts.push(zone, plate, ...texts);
  }

  /** Значок цены: фишка игры (её текстура) или билет — эмодзи 🎟, как на табло. */
  private addCostIcon(cost: 'chips' | 'tickets', enabled: boolean): Phaser.GameObjects.Text | Phaser.GameObjects.Image {
    if (cost === 'chips' && this.scene.textures.exists(CHIP_TEXTURE)) {
      const chip = this.scene.add
        .image(0, 0, CHIP_TEXTURE)
        .setDisplaySize(UI.chipIconSize, UI.chipIconSize)
        .setOrigin(1, 0.5)
        .setDepth(this.depth + 0.02);
      if (!enabled) chip.setAlpha(UI.disabledAlpha);
      return chip;
    }
    const ticket = addText(this.scene, 0, 0, '🎟', { fontSize: `${UI.ticketIconFont}px`, color: '#ffffff' })
      .setOrigin(1, 0.5)
      .setDepth(this.depth + 0.02);
    if (!enabled) ticket.setAlpha(UI.disabledAlpha);
    return ticket;
  }

  /** Наведение: слева янтарная полоса и затухающая заливка строки (рамок и плашек не прибавляем). */
  private setHover(index: number | null): void {
    if (this.hoverIndex === index) return;
    this.hoverIndex = index;
    this.drawStrips();
  }

  /** Нажатие: плашка светлеет и уходит вниз на 2 px; отпустили — строка решает сама. */
  private pressRow(index: number): void {
    if (this.pressedIndex === index) return;
    this.pressedIndex = index;
    this.layout();
  }

  private releasePress(): void {
    if (this.pressedIndex !== null) {
      this.pressedIndex = null;
      if (this.open) this.layout();
    }
    this.dragStart = null;
    this.dragMoved = false;
  }

  /**
   * Разложить строки по стеклу: первые visibleCount — на виду, остальные спрятаны. Прокрутка целыми строками,
   * поэтому обрезанных строк на краях нет и список не вылезает за экран.
   */
  private layout(): void {
    const from = this.topIndex;
    const visible = this.visibleCount;
    this.views.forEach((view, index) => {
      const top = ROWS_TOP + (index - from) * ROW_STEP;
      view.top = top;
      const onScreen = index >= from && index < from + visible;
      if (!onScreen) {
        view.zone.setVisible(false);
        if (view.zone.input) view.zone.disableInteractive();
        view.plate.setVisible(false);
        view.icon?.setVisible(false);
        view.title.setVisible(false);
        view.desc?.setVisible(false);
        view.right?.setVisible(false);
        view.costIcon?.setVisible(false);
        view.reason?.setVisible(false);
        return;
      }
      view.zone.setPosition((ROW_LEFT + ROW_RIGHT) / 2, top + UI.rowHeight / 2).setVisible(true);
      if (!view.zone.input || !view.zone.input.enabled) view.zone.setInteractive({ useHandCursor: view.enabled });
      const pressedShift = this.pressedIndex === index ? UI.buttonPressShift : 0;
      const centerY = top + UI.rowHeight / 2;
      // Название и значок стоят на одной линии (у строки с описанием — выше описания), описание — во всю ширину.
      const lineY = view.desc ? top + UI.rowTitleY : centerY;
      const titleLeft = ROW_TEXT_LEFT + (view.icon ? UI.rowIconSlot : 0);
      view.plate
        .setTexture(!view.enabled ? BUTTON_OFF_TEXTURE : pressedShift > 0 ? BUTTON_PRESSED_TEXTURE : BUTTON_TEXTURE)
        .setPosition(PLATE_RIGHT - UI.buttonWidth / 2, centerY + pressedShift)
        .setVisible(true);
      view.icon?.setPosition(ROW_TEXT_LEFT + UI.rowIconSlot / 2, lineY).setVisible(true);
      view.title.setPosition(titleLeft, lineY).setVisible(true);
      view.desc?.setPosition(ROW_TEXT_LEFT, top + UI.rowDescTop).setVisible(true);
      view.reason?.setPosition(PLATE_LEFT - 8, lineY).setVisible(true);
      const labelX = PLATE_RIGHT - UI.buttonTextInset;
      view.right?.setPosition(labelX, centerY + pressedShift).setVisible(true);
      if (view.costIcon) {
        const labelWidth = view.right?.displayWidth ?? 0;
        view.costIcon.setPosition(labelX - labelWidth - (view.right ? UI.buttonIconGap : 0), centerY + pressedShift).setVisible(true);
      }
    });
    this.drawStrips();
    this.drawOverlay();
  }

  /** Шапка, разделители, подсветка строк, латунные шайбы и рельса прокрутки — одним слоем поверх стекла. */
  private drawStrips(): void {
    const g = this.strips;
    if (!g) return;
    g.clear();
    // Гравированная полоска шапки и янтарная линия под ней.
    const plateX = GLASS_LEFT + UI.headerPlateInset;
    const plateWidth = GLASS_WIDTH - UI.headerPlateInset * 2;
    g.fillStyle(0x000000, UI.headerPlateAlpha);
    g.fillRoundedRect(plateX, GLASS_TOP + 2, plateWidth, UI.headerHeight - 6, UI.headerPlateRadius);
    g.fillStyle(UI.headerLine, UI.headerLineAlpha);
    g.fillRect(plateX, GLASS_TOP + UI.headerHeight - 4, plateWidth, 1);
    if (this.closeZone) this.drawHeaderButton(g, CLOSE_X);
    if (this.backZone) this.drawHeaderButton(g, BACK_X);

    const from = this.topIndex;
    const last = Math.min(this.views.length, from + this.visibleCount);
    for (let index = from; index < last; index++) {
      const view = this.views[index];
      const top = view.top;
      if (index > from) {
        g.fillStyle(UI.divider, UI.dividerAlpha);
        g.fillRect(ROW_LEFT, top, ROW_WIDTH, 1);
      }
      if (this.hoverIndex === index && view.enabled) this.drawHover(g, top);
    }
    this.drawRail(g);
  }

  /** Подсветка строки: янтарная полоса слева и затухающая вправо заливка — ступенями, без градиентов Graphics. */
  private drawHover(g: Phaser.GameObjects.Graphics, top: number): void {
    const band = ROW_WIDTH / HOVER_BANDS;
    for (let step = 0; step < HOVER_BANDS; step++) {
      g.fillStyle(UI.hoverBar, UI.hoverFillAlpha * (1 - step / HOVER_BANDS));
      g.fillRect(ROW_LEFT + step * band, top, band + 0.5, UI.rowHeight);
    }
    g.fillStyle(UI.hoverBar, 0.9);
    g.fillRect(ROW_LEFT, top, UI.hoverBarWidth, UI.rowHeight);
  }

  /** Латунная шайба кнопки шапки: заливка, рамка (сам значок — отдельная надпись). */
  private drawHeaderButton(g: Phaser.GameObjects.Graphics, x: number): void {
    const size = UI.headerButtonSize;
    g.fillStyle(UI.headerButtonFill, 1);
    g.fillRoundedRect(x - size / 2, HEADER_BUTTON_Y - size / 2, size, size, UI.headerButtonRadius);
    g.lineStyle(1, UI.headerButtonBorder, 1);
    g.strokeRoundedRect(x - size / 2, HEADER_BUTTON_Y - size / 2, size, size, UI.headerButtonRadius);
  }

  /** Рельса прокрутки: тёмный жёлоб, янтарный ползунок и стрелки у краёв. */
  private drawRail(g: Phaser.GameObjects.Graphics): void {
    const max = Math.max(0, this.data.length - this.visibleCount);
    const trackLeft = RAIL_X - UI.railWidth / 2;
    g.fillStyle(UI.railColor, 1);
    g.fillRect(trackLeft, RAIL_TOP, UI.railWidth, RAIL_BOTTOM - RAIL_TOP);
    const share = Math.min(1, this.visibleCount / Math.max(1, this.data.length));
    const thumb = Math.max(UI.railMinThumb, (RAIL_BOTTOM - RAIL_TOP) * share);
    const offset = max > 0 ? ((RAIL_BOTTOM - RAIL_TOP - thumb) * this.topIndex) / max : 0;
    g.fillStyle(UI.railThumb, 1);
    g.fillRect(trackLeft, RAIL_TOP + offset, UI.railWidth, thumb);
    const up = this.topIndex > 0;
    const down = this.topIndex < max;
    g.fillStyle(UI.arrowColor, up ? 0.9 : UI.arrowDimAlpha);
    g.fillTriangle(RAIL_X - UI.arrowSize, RAIL_TOP - 2, RAIL_X + UI.arrowSize, RAIL_TOP - 2, RAIL_X, RAIL_TOP - 2 - UI.arrowSize);
    g.fillStyle(UI.arrowColor, down ? 0.9 : UI.arrowDimAlpha);
    g.fillTriangle(
      RAIL_X - UI.arrowSize,
      RAIL_BOTTOM + 2,
      RAIL_X + UI.arrowSize,
      RAIL_BOTTOM + 2,
      RAIL_X,
      RAIL_BOTTOM + 2 + UI.arrowSize,
    );
  }

  /**
   * Поверх строк: тень по внутреннему периметру стекла (край не «расползается» и ничего не выглядывает за рамку)
   * и мягкое затемнение снизу, если под видимыми строками есть ещё: к низу оно плотнее, у первой полосы —
   * прозрачное, чтобы последняя полная строка не выглядела обрезанной. Ниже — маленькая стрелка «ещё есть».
   */
  private drawOverlay(): void {
    const g = this.overlay;
    if (!g) return;
    g.clear();
    const inset = UI.innerShadowWidth / 2;
    g.lineStyle(UI.innerShadowWidth, UI.innerShadow, UI.innerShadowAlpha);
    g.strokeRoundedRect(GLASS_LEFT + inset, GLASS_TOP + inset, GLASS_WIDTH - inset * 2, GLASS_HEIGHT - inset * 2, UI.glassRadius - inset);
    const max = Math.max(0, this.data.length - this.visibleCount);
    if (this.topIndex < max) {
      const band = UI.fadeHeight / FADE_BANDS;
      for (let step = 0; step < FADE_BANDS; step++) {
        g.fillStyle(UI.innerShadow, (UI.fadeAlpha * step) / FADE_BANDS);
        g.fillRect(ROW_LEFT, ROWS_BOTTOM - UI.fadeHeight + step * band, ROW_WIDTH, band + 0.5);
      }
      this.drawMoreArrow(g);
    }
  }

  /** Стрелка «ещё есть»: маленькая галочка по центру низа стекла — со свечением и тенью, видно, что список длиннее. */
  private drawMoreArrow(g: Phaser.GameObjects.Graphics): void {
    const x = (ROW_LEFT + ROW_RIGHT) / 2;
    const y = ROWS_BOTTOM - UI.moreArrowInset;
    const chevron = (dy: number): void => {
      g.beginPath();
      g.moveTo(x - UI.moreArrowHalf, y + dy);
      g.lineTo(x, y + dy + UI.moreArrowHeight);
      g.lineTo(x + UI.moreArrowHalf, y + dy);
      g.strokePath();
    };
    for (const [width, color, alpha, dy] of [
      [5, UI.arrowColor, UI.moreArrowGlowAlpha, 0],
      [1, UI.innerShadow, 0.85, 1],
      [2, UI.arrowColor, 0.95, 0],
    ] as const) {
      g.lineStyle(width, color, alpha);
      chevron(dy);
    }
  }

  /** Свайп: палец (или мышь) тянет список вверх-вниз — одна строка за DRAG_STEP. */
  private startDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.open || !this.inScreen(pointer)) return;
    this.dragStart = pointer.worldY;
    this.dragMoved = false;
  }

  private drag(pointer: Phaser.Input.Pointer): void {
    if (!this.open || this.dragStart === null) return;
    // Свайп — только с зажатой кнопкой: обычное движение мыши после неудачного нажатия не листает список.
    if (!pointer.isDown) {
      this.dragStart = null;
      this.dragMoved = false;
      return;
    }
    const dy = pointer.worldY - this.dragStart;
    if (Math.abs(dy) < DRAG_STEP) return;
    this.scroll(dy > 0 ? -1 : 1);
    this.dragStart = pointer.worldY;
    this.dragMoved = true;
  }

  /** Точка внутри экрана автомата: только там список и живёт. */
  private inScreen(pointer: Phaser.Input.Pointer): boolean {
    return (
      Math.abs(pointer.worldX - SCREEN.x) <= SCREEN.width / 2 && Math.abs(pointer.worldY - SCREEN.y) <= SCREEN.height / 2
    );
  }

  private clear(): void {
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
    this.rows.length = 0;
    this.views = [];
    this.data = [];
    this.options = null;
    this.topIndex = 0;
    this.hoverIndex = null;
    this.pressedIndex = null;
    this.closeZone = null;
    this.backZone = null;
    this.strips = null;
    this.overlay = null;
    this.dragStart = null;
    this.dragMoved = false;
    this.open = false;
  }
}

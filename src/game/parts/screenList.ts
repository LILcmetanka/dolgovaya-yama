import Phaser from 'phaser';
import { SCREEN } from '../layout';
import { addText, GAME_OVER_DEPTH, GOLD_TEXT, LED_STYLE, RED_TEXT } from '../theme';

/**
 * Экранный список (шаг 37): единственное место, где игрок выбирает что-то из нового. Живёт НА экране автомата
 * (SCREEN, 460×288) — там же, где GOOD LUCK, KABOOM и ПАТТЕРН СОБРАН, — а не в отдельном окне поверх игры.
 * Никакого затемнения на весь вид: список рисуется только внутри экрана, рычаг и корпус автомата остаются видны.
 *
 * Строки — LED-надписи того же шрифта, что и дисплей («ВНИМАНИЕ», суммы на табло). Рамок, карточек и окон нет:
 * слева название и подпись, справа текстовая кнопка (цена или «ВЗЯТЬ») — она тоже просто кликабельна.
 * Список листается колесом мыши, свайпом и стрелками ↑/↓; внизу значок ▲▼, если строки не все влезли.
 * Строки — 52 px в единицах раскладки (не меньше игрового минимума 44), видно сразу четыре.
 *
 * Часть только показывает готовые строки и сообщает о нажатии: цены, доступность и эффекты считает сцена.
 * Клавиши по-прежнему работают (1–6 — строки, 0 — назад или закрыть), но подсказок про них на экране нет.
 */
const DEPTH = GAME_OVER_DEPTH - 1; // выше игры и всплывашек, ниже паузы (30): Esc её открывает и закрывает
export const SCREEN_LIST_OVER_DEATH_DEPTH = GAME_OVER_DEPTH + 2; // экран улучшений — поверх затемнения смерти (30)
const CLOSE_KEY_INDEX = 9; // клавиша «0»: закрыть список (в выборе — назад)
const PAD = 10; // поле от края экрана
const HEADER_HEIGHT = 40; // заголовок и подпись над строками
const ROW_HEIGHT = 52; // строка целиком — одна кнопка: на телефоне попадает палец
const ROW_GAP = 2;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;
const TITLE_FONT = 15;
const DESC_FONT = 10;
const RIGHT_FONT = 13;
const HEADER_FONT = 13;
const CAPTION_FONT = 10;
const SCROLL_FONT = 10;
const CLOSE_FONT = 18;
const CLOSE_SIZE = 44; // зона крестика: палец тоже попадает
const RIGHT_WIDTH = 96; // сколько справа занимает текстовая кнопка
const TITLE_WIDTH = SCREEN.width - PAD * 2 - RIGHT_WIDTH - 8;
const DESC_WIDTH = SCREEN.width - PAD * 2 - RIGHT_WIDTH - 8;
const DISABLED_ALPHA = 0.45;
const DRAG_STEP = 24; // столько нужно провести пальцем, чтобы список сдвинулся на строку
const FILL = 0x050505;
const FILL_ALPHA = 1;
const HOVER_TITLE = '#ffffff';
const HOVER_RIGHT = '#ffffff';
const DESC_COLOR = 'rgba(255, 255, 255, 0.72)';
const DESC_DANGER = 'rgba(248, 113, 113, 0.85)';
const RIGHT_COLOR = '#a7f3d0';

/** Одна строка списка. Всё — готовыми строками: название, подпись под ним и текстовая кнопка справа. */
export interface ScreenRow {
  title: string;
  desc?: string;
  right?: string; // текст справа: цена, «ВЗЯТЬ»; кликается вместе со всей строкой
  enabled?: boolean; // false — строка бледная, нажатие отвечает отказом (onDeny)
  danger?: boolean; // красная строка (кража)
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

/** Нарисованная строка: её зона нажатия, надписи и их спокойные цвета. */
interface RowView {
  zone: Phaser.GameObjects.Zone;
  title: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text | null;
  right: Phaser.GameObjects.Text | null;
  titleColor: string;
  descColor: string;
  rightColor: string;
  enabled: boolean;
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
  private more: Phaser.GameObjects.Text | null = null;
  private dragStart: number | null = null;
  private dragMoved = false;
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
  }

  /** Список на виду: клавиши и клики идут ему, а не игре. */
  get isOpen(): boolean {
    return this.open;
  }

  /** То же, что rows: так удобнее сценариям, которые раньше искали кнопки. */
  get buttons(): Phaser.GameObjects.Zone[] {
    return this.rows;
  }

  /** Сколько строк влезает в экран целиком. */
  private get visibleCount(): number {
    return Math.max(1, Math.floor((SCREEN.height - HEADER_HEIGHT - PAD) / ROW_STEP));
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

  /** Затемнение самого экрана (не вида), заголовок, подпись и текстовые кнопки в шапке. */
  private drawFrame(options: ScreenListOptions): void {
    const backdrop = this.scene.add
      .rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, FILL, FILL_ALPHA)
      .setRounded(16)
      .setDepth(this.depth);
    this.parts.push(backdrop);
    const left = SCREEN.x - SCREEN.width / 2 + PAD;
    const top = SCREEN.y - SCREEN.height / 2;
    const title = addText(this.scene, left, top + 13, options.title, {
      ...LED_STYLE,
      fontSize: `${HEADER_FONT}px`,
      color: GOLD_TEXT,
      fontStyle: 'bold',
      shadow: { color: '#f59e0b', blur: 6, fill: true },
    })
      .setOrigin(0, 0.5)
      .setDepth(this.depth);
    this.parts.push(title);
    if (options.caption) {
      const caption = addText(this.scene, left, top + 29, options.caption, {
        ...LED_STYLE,
        fontSize: `${CAPTION_FONT}px`,
        color: DESC_COLOR,
        fontStyle: 'normal',
        shadow: { color: '#000000', blur: 2, fill: true },
      })
        .setOrigin(0, 0.5)
        .setDepth(this.depth);
      this.parts.push(caption);
    }
    const right = SCREEN.x + SCREEN.width / 2 - PAD;
    if (options.onBack) this.addHeaderButton(right - CLOSE_SIZE - 8, top + 20, '←', () => options.onBack?.(), 'back');
    if (options.onClose) this.addHeaderButton(right - CLOSE_SIZE / 2, top + 20, '✕', () => options.onClose?.(), 'close');
    this.more = addText(this.scene, right, top + SCREEN.height - 6, '', {
      ...LED_STYLE,
      fontSize: `${SCROLL_FONT}px`,
      color: DESC_COLOR,
      fontStyle: 'normal',
      shadow: { color: '#000000', blur: 2, fill: true },
    })
      .setOrigin(1, 1)
      .setDepth(this.depth)
      .setVisible(false);
    this.parts.push(this.more);
  }

  /** Текстовая кнопка в шапке: «✕» или «←», без рамки и окна; зона нажатия — 44×44. */
  private addHeaderButton(x: number, y: number, text: string, action: () => void, kind: 'close' | 'back'): void {
    const label = addText(this.scene, x, y, text, {
      ...LED_STYLE,
      fontSize: `${CLOSE_FONT}px`,
      color: GOLD_TEXT,
      fontStyle: 'bold',
      shadow: { color: '#f59e0b', blur: 6, fill: true },
    })
      .setOrigin(0.5)
      .setDepth(this.depth);
    const zone = this.scene.add
      .rectangle(x, y, CLOSE_SIZE, CLOSE_SIZE, 0x000000, 0)
      .setDepth(this.depth + 0.01)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (!this.dragMoved) action();
    });
    if (kind === 'close') this.closeZone = zone;
    else this.backZone = zone;
    this.parts.push(label, zone);
  }

  /** Одна строка: название, подпись, текстовая кнопка справа. Вся строка — одна зона нажатия. */
  private addRow(row: ScreenRow, index: number): void {
    const enabled = row.enabled !== false;
    const zone = this.scene.add
      .zone(SCREEN.x, SCREEN.y, SCREEN.width - PAD * 2, ROW_HEIGHT)
      .setDepth(this.depth)
      .setInteractive({ useHandCursor: enabled });
    zone.on('pointerover', () => this.hover(index, true));
    zone.on('pointerout', () => this.hover(index, false));
    zone.on('pointerup', () => {
      if (this.dragMoved) return;
      if (enabled) this.options?.onPick(index);
      else this.options?.onDeny?.(index);
    });
    const accent = row.danger ? RED_TEXT : GOLD_TEXT;
    const title = addText(this.scene, 0, 0, row.title, {
      ...LED_STYLE,
      fontSize: `${TITLE_FONT}px`,
      color: accent,
      fontStyle: 'bold',
      wordWrap: { width: TITLE_WIDTH },
      maxLines: 1,
      shadow: { color: '#000000', blur: 3, fill: true },
    })
      .setOrigin(0, 0.5)
      .setDepth(this.depth);
    const desc = row.desc
      ? addText(this.scene, 0, 0, row.desc, {
          ...LED_STYLE,
          fontSize: `${DESC_FONT}px`,
          color: row.danger ? DESC_DANGER : DESC_COLOR,
          fontStyle: 'normal',
          wordWrap: { width: DESC_WIDTH },
          maxLines: 2,
          shadow: { color: '#000000', blur: 2, fill: true },
        })
          .setOrigin(0, 0)
          .setDepth(this.depth)
      : null;
    const right = row.right
      ? addText(this.scene, 0, 0, row.right, {
          ...LED_STYLE,
          fontSize: `${RIGHT_FONT}px`,
          color: row.danger ? RED_TEXT : RIGHT_COLOR,
          fontStyle: 'bold',
          shadow: { color: '#000000', blur: 3, fill: true },
        })
          .setOrigin(1, 0.5)
          .setDepth(this.depth)
      : null;
    const texts = [title, ...(desc ? [desc] : []), ...(right ? [right] : [])];
    if (!enabled) for (const text of texts) text.setAlpha(DISABLED_ALPHA);
    this.views.push({
      zone,
      title,
      desc,
      right,
      titleColor: accent,
      descColor: row.danger ? DESC_DANGER : DESC_COLOR,
      rightColor: row.danger ? RED_TEXT : RIGHT_COLOR,
      enabled,
    });
    this.rows.push(zone);
    this.parts.push(zone, ...texts);
  }

  /** Наведение: строка светлеет — видно, что она нажимается (рамок и плашек не прибавляем). */
  private hover(index: number, on: boolean): void {
    const view = this.views[index];
    if (!view || !view.enabled) return;
    view.title.setColor(on ? HOVER_TITLE : view.titleColor);
    view.right?.setColor(on ? HOVER_RIGHT : view.rightColor);
  }

  /**
   * Разложить строки по экрану: первые visibleCount — на виду, остальные спрятаны. Прокрутка целыми строками,
   * поэтому обрезанных строк на краях нет и список не вылезает за экран.
   */
  private layout(): void {
    const top = SCREEN.y - SCREEN.height / 2 + HEADER_HEIGHT;
    const from = this.topIndex;
    const to = from + this.visibleCount;
    this.views.forEach((view, index) => {
      const visible = index >= from && index < to;
      const slot = index - from;
      const y = top + slot * ROW_STEP + ROW_HEIGHT / 2;
      const left = SCREEN.x - SCREEN.width / 2 + PAD;
      if (!visible) {
        view.zone.setVisible(false);
        view.zone.disableInteractive();
        view.title.setVisible(false);
        view.desc?.setVisible(false);
        view.right?.setVisible(false);
        return;
      }
      view.zone.setPosition(SCREEN.x, y).setVisible(true);
      if (!view.zone.input || !view.zone.input.enabled) view.zone.setInteractive({ useHandCursor: view.enabled });
      view.title.setPosition(left, y - 11).setVisible(true);
      view.desc?.setPosition(left, y - 1).setVisible(true);
      view.right?.setPosition(SCREEN.x + SCREEN.width / 2 - PAD, y).setVisible(true);
    });
    const max = Math.max(0, this.data.length - this.visibleCount);
    if (this.more) {
      const marks = `${this.topIndex > 0 ? '▲' : ''}${this.topIndex < max ? '▼' : ''}`;
      this.more.setText(marks).setVisible(marks !== '');
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
    this.more = null;
    this.closeZone = null;
    this.backZone = null;
    this.dragStart = null;
    this.dragMoved = false;
    this.open = false;
  }
}

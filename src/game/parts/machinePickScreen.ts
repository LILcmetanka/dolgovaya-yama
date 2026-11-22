import Phaser from 'phaser';
import { t } from '../lang';
import { CENTER_X, CENTER_Y, VIEW_HEIGHT, VIEW_WIDTH } from '../layout';
import type { MachineSpec } from '../machines';
import { addText, fitTextWidth, GAME_OVER_DEPTH, GOLD_TEXT } from '../theme';

/**
 * Выбор стартового автомата (улучшение №49, шаг 28г): панель в том же стиле, что выбор первого символа (№33) —
 * затемнение, заголовок, подпись и три строки с автоматами. Клик по строке выбирает автомат и закрывает панель;
 * крестика и таймаута нет — автомат выбрать обязаны (панель обязана пережить первый раунд). Часть только рисует:
 * что делать с выбором, решает сцена. Слой — выше игры и окна улучшений, но ниже паузы (Esc на выборе её открывает).
 */
const DEPTH = GAME_OVER_DEPTH - 1; // как у выбора символа: выше игры, ниже паузы
const PANEL_WIDTH = 660;
const PANEL_HEIGHT = 350;
const PANEL_Y = 300;
const PANEL_FILL = 0x0b0f19;
const PANEL_BORDER = 0xb45309;
const PANEL_ALPHA = 0.96;
const SCRIM_ALPHA = 0.84;
const TITLE_Y = -144;
const TITLE_FONT = '28px';
const CAPTION_Y = -110;
const CAPTION_FONT = '16px';
const ROW_WIDTH = 560;
const ROW_HEIGHT = 64;
const ROW_GAP = 10;
const ROW_TOP = -62; // середина первой строки от центра панели
const ROW_FILL = 0x131a26;
const ROW_HOVER = 0x1f2a3a;
const SIGN_FONT = '28px';
const NAME_FONT = '19px';
const DESC_FONT = '14px';
const TEXT_LEFT = -ROW_WIDTH / 2 + 62; // название и описание — правее значка
const TEXT_WIDTH = ROW_WIDTH - 84;

/** Что сцена говорит экрану: выбранный автомат (крестика и таймаута нет — отменить нельзя). */
export interface MachinePickOptions {
  caption: string;
  onPick: (machine: MachineSpec) => void;
}

export class MachinePickScreen {
  private readonly scene: Phaser.Scene;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private options: MachineSpec[] = [];
  private onPick: ((machine: MachineSpec) => void) | null = null;
  private open = false;
  /** Кликабельные строки по порядку: сценарий проверки щёлкает по их границам. */
  readonly rows: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(options: readonly MachineSpec[], config: MachinePickOptions): void {
    this.clear();
    if (options.length === 0) return;
    this.open = true;
    this.options = [...options];
    this.onPick = config.onPick;
    const backdrop = this.scene.add
      .rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, SCRIM_ALPHA)
      .setDepth(DEPTH);
    backdrop.setInteractive(); // ловит клики: игра под панелью не нажимается
    const panel = this.scene.add
      .rectangle(CENTER_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, PANEL_FILL, PANEL_ALPHA)
      .setRounded(12)
      .setStrokeStyle(3, PANEL_BORDER)
      .setDepth(DEPTH);
    panel.setInteractive(); // клик по панели не проваливается к затемнению
    this.parts.push(backdrop, panel);
    const title = t('machinePickTitle');
    const titleText = addText(this.scene, CENTER_X, PANEL_Y + TITLE_Y, title, {
      fontSize: TITLE_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5).setDepth(DEPTH);
    fitTextWidth(titleText, title, PANEL_WIDTH - 80, 28, 18);
    const caption = addText(this.scene, CENTER_X, PANEL_Y + CAPTION_Y, config.caption, {
      fontSize: CAPTION_FONT,
      color: 'rgba(255, 255, 255, 0.75)',
    }).setOrigin(0.5).setDepth(DEPTH);
    fitTextWidth(caption, config.caption, PANEL_WIDTH - 100, 16, 11);
    this.parts.push(titleText, caption);
    options.forEach((machine, index) => this.addRow(machine, index));
  }

  /** Клавиша 1–3: нажать строку по номеру. Пока панель открыта, клавиши игры молчат. */
  press(index: number): boolean {
    if (!this.open) return false;
    if (index < this.options.length) this.onPick?.(this.options[index]);
    return true;
  }

  close(): void {
    this.clear();
  }

  private clear(): void {
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.options = [];
    this.onPick = null;
    this.rows.length = 0;
    this.open = false;
  }

  /** Строка: значок автомата, название и что он делает. Вся строка — одна кнопка; цвет рамки — цвет автомата. */
  private addRow(machine: MachineSpec, index: number): void {
    const y = PANEL_Y + ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
    const box = this.scene.add
      .rectangle(CENTER_X, y, ROW_WIDTH, ROW_HEIGHT, ROW_FILL)
      .setRounded(8)
      .setStrokeStyle(2, machine.color || 0x2dd4bf)
      .setDepth(DEPTH);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerover', () => box.setFillStyle(ROW_HOVER));
    box.on('pointerout', () => box.setFillStyle(ROW_FILL));
    box.on('pointerdown', () => this.onPick?.(machine));
    const left = CENTER_X - ROW_WIDTH / 2;
    // У классического автомата значка нет — на строке ставим нейтральный ◈, чтобы строка не была пустой.
    const sign = addText(this.scene, left + 34, y, machine.sign === '' ? '◈' : machine.sign, {
      fontSize: SIGN_FONT,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(DEPTH);
    const name = addText(this.scene, left + TEXT_LEFT, y - 11, t(machine.name), {
      fontSize: NAME_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0, 0.5).setDepth(DEPTH);
    const desc = addText(this.scene, left + TEXT_LEFT, y + 12, t(machine.description), {
      fontSize: DESC_FONT,
      color: '#e2e8f0',
      wordWrap: { width: TEXT_WIDTH },
      maxLines: 1,
    }).setOrigin(0, 0.5).setDepth(DEPTH);
    this.rows.push(box);
    this.parts.push(box, sign, name, desc);
  }
}

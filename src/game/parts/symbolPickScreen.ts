import Phaser from 'phaser';
import { t } from '../lang';
import { CENTER_X, CENTER_Y, VIEW_HEIGHT, VIEW_WIDTH } from '../layout';
import { addText, fitTextWidth, GAME_OVER_DEPTH, GOLD_TEXT } from '../theme';
import type { SlotSymbol } from '../rules';

/**
 * Выбор первого символа забега (улучшение №33, шаг 28в): минимальная панель в стиле экрана улучшений —
 * затемнение, заголовок, подпись и список символов с их текущими весами и ценами. Клик по строке выбирает символ
 * и закрывает панель; крестика и таймаута нет — символ выбрать обязаны. Часть только рисует: что делать с выбором,
 * решает сцена. Слой — выше экрана DEATH и экрана улучшений: пока он открыт, игра ждёт.
 */
const DEPTH = GAME_OVER_DEPTH - 1; // выше игры, но ниже паузы (30): Esc на выборе открывает видимую паузу
const PANEL_WIDTH = 660;
const PANEL_HEIGHT = 410;
const PANEL_Y = 300;
const PANEL_FILL = 0x0b0f19;
const PANEL_BORDER = 0xb45309;
const PANEL_ALPHA = 0.96;
const SCRIM_ALPHA = 0.84;
const TITLE_Y = -174;
const TITLE_FONT = '28px';
const CAPTION_Y = -140;
const CAPTION_FONT = '16px';
const ROW_WIDTH = 560;
const ROW_HEIGHT = 48;
const ROW_GAP = 8;
const ROW_TOP = -104; // середина первой строки от центра панели
const ROW_FILL = 0x131a26;
const ROW_HOVER = 0x1f2a3a;
const ROW_BORDER = 0x2dd4bf; // бирюза — цвет группы «сетка»
const SIGN_FONT = '28px';
const TEXT_FONT = '18px';
const WEIGHT_X = ROW_WIDTH / 2 - 150;
const PRICE_X = ROW_WIDTH / 2 - 46;

/** Строка списка: символ и его вес в первой сетке (цена — из symbol.price). */
export interface SymbolOption {
  symbol: SlotSymbol;
  weight: number;
}

/** Что сцена говорит экрану: выбранный символ (крестика и таймаута нет — отменить нельзя). */
export interface SymbolPickOptions {
  caption: string;
  onPick: (symbol: SlotSymbol) => void;
}

export class SymbolPickScreen {
  private readonly scene: Phaser.Scene;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private options: SymbolOption[] = [];
  private onPick: ((symbol: SlotSymbol) => void) | null = null;
  private open = false;
  /** Кликабельные строки по порядку: сценарий проверки щёлкает по их границам. */
  readonly rows: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(options: SymbolOption[], config: SymbolPickOptions): void {
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
    const title = t('symbolPickTitle');
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
    options.forEach((option, index) => this.addRow(option, index));
  }

  /** Клавиша 1–5: нажать строку по номеру. Пока панель открыта, клавиши игры молчат. */
  press(index: number): boolean {
    if (!this.open) return false;
    if (index < this.options.length) this.onPick?.(this.options[index].symbol);
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

  /** Строка: знак, вес, цена. Вся строка — одна кнопка. */
  private addRow(option: SymbolOption, index: number): void {
    const y = PANEL_Y + ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
    const box = this.scene.add
      .rectangle(CENTER_X, y, ROW_WIDTH, ROW_HEIGHT, ROW_FILL)
      .setRounded(8)
      .setStrokeStyle(2, ROW_BORDER)
      .setDepth(DEPTH);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerover', () => box.setFillStyle(ROW_HOVER));
    box.on('pointerout', () => box.setFillStyle(ROW_FILL));
    box.on('pointerdown', () => this.onPick?.(option.symbol));
    const left = CENTER_X - ROW_WIDTH / 2;
    const sign = addText(this.scene, left + 34, y, option.symbol.sign, {
      fontSize: SIGN_FONT,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(DEPTH);
    const weight = addText(this.scene, left + WEIGHT_X, y, t('symbolPickWeight', Math.round(option.weight)), {
      fontSize: TEXT_FONT,
      color: '#a7f3d0',
    }).setOrigin(0.5).setDepth(DEPTH);
    const price = addText(this.scene, left + PRICE_X, y, t('symbolPickPrice', option.symbol.price), {
      fontSize: TEXT_FONT,
      color: 'rgba(255, 255, 255, 0.7)',
    }).setOrigin(0.5).setDepth(DEPTH);
    this.rows.push(box);
    this.parts.push(box, sign, weight, price);
  }
}

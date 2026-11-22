import Phaser from 'phaser';
import type { ActionId } from '../actions';
import { t } from '../lang';
import { CENTER_X, CENTER_Y, VIEW_HEIGHT, VIEW_WIDTH } from '../layout';
import { addText, fitTextWidth, GAME_OVER_DEPTH, GOLD_TEXT, RED_TEXT } from '../theme';
import type { SlotSymbol } from '../rules';

/**
 * Панель действий вне прокрутки (шаг 29): тёмная панель в стиле экрана улучшений — заголовок, подпись,
 * шесть строк (обмен, лотерея, обслуживание, кража, продажа, биржа) с ценой и короткой подсказкой.
 * Второй режим — выбор символа: из чего менять и что продать.
 *
 * Часть только рисует и сообщает о нажатии: цены, доступность и эффекты считает сцена. Клавиши — по образцу
 * магазина: 1–6 — строка, «0» — закрыть (или вернуться из выбора символов), ✕ и Esc — закрыть панель.
 * Слой — выше игры, ниже паузы.
 */
const DEPTH = GAME_OVER_DEPTH - 1; // выше автомата и GOOD LUCK, ниже паузы (30)
const PANEL_WIDTH = 880;
const PANEL_HEIGHT = 500;
const PANEL_Y = 320; // 50…590: целиком в виде (640) и на телефоне
const PANEL_FILL = 0x0b0f19;
const PANEL_BORDER = 0xb45309;
const PANEL_ALPHA = 0.96;
const SCRIM_ALPHA = 0.84;
const TITLE_Y = -218; // от середины панели
const TITLE_FONT = '28px';
const CAPTION_Y = -186;
const CAPTION_FONT = '15px';
const ROW_WIDTH = 780;
const ROW_HEIGHT = 56;
const ROW_GAP = 8;
const ROW_TOP = -140; // середина первой строки от центра панели
const ROW_FILL = 0x131a26;
const ROW_HOVER = 0x1f2a3a;
const ROW_BORDER = 0x2dd4bf; // бирюза — как у строк выбора символа в №33
const ROW_BORDER_DANGER = 0xef4444; // кража: явное предупреждение
const ROW_BORDER_OFF = 0x334155;
const OFF_ALPHA = 0.45;
const KEY_FONT = '15px';
const TITLE_TEXT_FONT = '18px';
const DESC_FONT = '13px';
const PRICE_FONT = '15px';
const TEXT_LEFT = -ROW_WIDTH / 2 + 54;
const DESC_WIDTH = ROW_WIDTH - 200;
const PRICE_RIGHT = ROW_WIDTH / 2 - 20;
const CLOSE_FONT = '22px';
const CLOSE_HIT = 44;
const CLOSE_KEY_INDEX = 9; // клавиша «0»: закрыть панель / вернуться из выбора
// Режим выбора символа: строки ниже — символы сетки.
const PICK_ROW_HEIGHT = 44;
const PICK_ROW_GAP = 6;
const PICK_TOP = -126; // ниже подписи: она стоит на CAPTION_Y и не должна прятаться под первой строкой
const PICK_SIGN_FONT = '26px';
const PICK_NOTE_FONT = '15px';

/** Строка панели: действие, его цена и подсказка. Всё — готовыми строками из lang.ts. */
export interface ActionRow {
  id: ActionId;
  title: string;
  desc: string;
  price: string; // готовая подпись цены: «2 🎟», «120 фишек», «риск»
  enabled: boolean; // можно ли нажать (не хватает денег, уже было в раунде, нечего выбирать…)
  danger?: boolean; // красная рамка и красное предупреждение (кража)
}

/** Что сцена говорит панели при показе списка действий. */
export interface ActionPanelOptions {
  caption: string;
  onPick: (id: ActionId) => void;
  onDeny: () => void; // нажали недоступную строку: сцена играет отказ, ничего не тратится
  onClose: () => void;
}

/** Символ в списке выбора: значок, подпись (вес, цена, клетки) и можно ли его выбрать. */
export interface ActionChoice {
  symbol: SlotSymbol;
  note: string;
  enabled?: boolean;
}

/** Что сцена говорит панели при выборе символа: «0» — назад к списку действий, ✕ — закрыть всю панель. */
export interface ActionPickOptions {
  caption: string;
  onPick: (symbol: SlotSymbol) => void;
  onDeny: () => void;
  onBack: () => void;
  onClose: () => void;
}

export class ActionPanel {
  private readonly scene: Phaser.Scene;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private rows: ActionRow[] = [];
  private choices: ActionChoice[] = [];
  private onPick: ((id: ActionId) => void) | null = null;
  private onPickSymbol: ((symbol: SlotSymbol) => void) | null = null;
  private onDeny: (() => void) | null = null;
  private onClose: (() => void) | null = null;
  private onBack: (() => void) | null = null;
  private open = false;
  /** Кликабельные строки по порядку: сценарий проверки щёлкает по их границам. */
  readonly buttons: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Панель на виду: клавиши и клики идут ей, а не игре. */
  get isOpen(): boolean {
    return this.open;
  }

  /** Список действий: шесть строк с ценой и подсказкой. */
  show(rows: readonly ActionRow[], options: ActionPanelOptions): void {
    this.clear();
    this.open = true;
    this.rows = [...rows];
    this.onPick = options.onPick;
    this.onDeny = options.onDeny;
    this.onClose = options.onClose;
    this.drawFrame(t('actionsTitle'), options.caption);
    rows.forEach((row, index) => this.addActionRow(row, index));
  }

  /** Выбор символа (обмен и продажа): строки-символы, «0» — назад к действиям. */
  showChoices(choices: readonly ActionChoice[], options: ActionPickOptions): void {
    this.clear();
    this.open = true;
    this.choices = [...choices];
    this.onPickSymbol = options.onPick;
    this.onDeny = options.onDeny;
    this.onBack = options.onBack;
    this.onClose = options.onClose;
    this.drawFrame(t('actionsTitle'), options.caption);
    choices.forEach((choice, index) => this.addChoiceRow(choice, index));
  }

  /**
   * Клавиша 1–9 или 0: строка по номеру, «0» — закрыть панель (в выборе символов — назад к действиям).
   * Вернёт true — нажатие ушло в панель (игра его не должна получать).
   */
  press(index: number): boolean {
    if (!this.open) return false;
    if (index === CLOSE_KEY_INDEX) {
      if (this.onBack) this.onBack();
      else this.onClose?.();
      return true;
    }
    if (this.onPickSymbol) {
      const choice = this.choices[index];
      if (choice && choice.enabled !== false) this.onPickSymbol(choice.symbol);
      else this.onDeny?.();
      return true;
    }
    const row = this.rows[index];
    if (row && row.enabled) this.onPick?.(row.id);
    else if (row) this.onDeny?.();
    return true;
  }

  /** Закрыть панель: все нарисованные объекты уничтожаются. */
  close(): void {
    this.clear();
  }

  private clear(): void {
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.rows = [];
    this.choices = [];
    this.onPick = null;
    this.onPickSymbol = null;
    this.onDeny = null;
    this.onClose = null;
    this.onBack = null;
    this.buttons.length = 0;
    this.open = false;
  }

  /** Затемнение, панель, заголовок, подпись и крестик. */
  private drawFrame(title: string, caption: string): void {
    const backdrop = this.scene.add
      .rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, SCRIM_ALPHA)
      .setDepth(DEPTH);
    backdrop.setInteractive(); // клики до игры не доходят: под панелью ничего не нажимается
    backdrop.on('pointerdown', () => this.onClose?.()); // клик мимо панели закрывает — как у магазина
    const panel = this.scene.add
      .rectangle(CENTER_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, PANEL_FILL, PANEL_ALPHA)
      .setRounded(12)
      .setStrokeStyle(3, PANEL_BORDER)
      .setDepth(DEPTH);
    panel.setInteractive();
    this.parts.push(backdrop, panel);
    const titleText = addText(this.scene, CENTER_X, PANEL_Y + TITLE_Y, title, {
      fontSize: TITLE_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5).setDepth(DEPTH);
    fitTextWidth(titleText, title, PANEL_WIDTH - 160, 28, 18);
    const captionText = addText(this.scene, CENTER_X, PANEL_Y + CAPTION_Y, caption, {
      fontSize: CAPTION_FONT,
      color: 'rgba(255, 255, 255, 0.75)',
    }).setOrigin(0.5).setDepth(DEPTH);
    fitTextWidth(captionText, caption, PANEL_WIDTH - 140, 15, 11);
    this.parts.push(titleText, captionText);
    this.addClose();
  }

  /** Крестик в шапке: панель закрывается (и с клавиатуры — «0» и Esc). */
  private addClose(): void {
    const x = CENTER_X + PANEL_WIDTH / 2 - 30;
    const y = PANEL_Y + TITLE_Y;
    const close = addText(this.scene, x, y, '✕', { fontSize: CLOSE_FONT, fontStyle: 'bold', color: GOLD_TEXT })
      .setOrigin(0.5)
      .setDepth(DEPTH);
    const hit = this.scene.add.rectangle(x, y, CLOSE_HIT, CLOSE_HIT, 0x000000, 0).setDepth(DEPTH);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.onClose?.());
    this.parts.push(close, hit);
  }

  /** Строка действия: номер клавиши, название, подсказка и цена. Вся строка — одна кнопка. */
  private addActionRow(row: ActionRow, index: number): void {
    const y = PANEL_Y + ROW_TOP + index * (ROW_HEIGHT + ROW_GAP);
    const border = row.danger ? ROW_BORDER_DANGER : row.enabled ? ROW_BORDER : ROW_BORDER_OFF;
    const box = this.scene.add
      .rectangle(CENTER_X, y, ROW_WIDTH, ROW_HEIGHT, ROW_FILL)
      .setRounded(8)
      .setStrokeStyle(2, border)
      .setDepth(DEPTH);
    box.setInteractive({ useHandCursor: row.enabled });
    if (row.enabled) {
      box.on('pointerover', () => box.setFillStyle(ROW_HOVER));
      box.on('pointerout', () => box.setFillStyle(ROW_FILL));
      box.on('pointerdown', () => this.onPick?.(row.id));
    } else {
      box.on('pointerdown', () => this.onDeny?.());
    }
    const left = CENTER_X + TEXT_LEFT;
    const key = addText(this.scene, left - 26, y, String(index + 1), {
      fontSize: KEY_FONT,
      fontStyle: 'bold',
      color: 'rgba(255, 255, 255, 0.55)',
    }).setOrigin(0.5).setDepth(DEPTH);
    const title = addText(this.scene, left, y - 11, row.title, {
      fontSize: TITLE_TEXT_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0, 0.5).setDepth(DEPTH);
    const desc = addText(this.scene, left, y + 11, row.desc, {
      fontSize: DESC_FONT,
      color: row.danger ? RED_TEXT : '#e2e8f0',
      wordWrap: { width: DESC_WIDTH },
      maxLines: 2,
    }).setOrigin(0, 0.5).setDepth(DEPTH);
    const price = addText(this.scene, CENTER_X + PRICE_RIGHT, y, row.price, {
      fontSize: PRICE_FONT,
      fontStyle: 'bold',
      color: row.danger ? RED_TEXT : '#a7f3d0',
    }).setOrigin(1, 0.5).setDepth(DEPTH);
    if (!row.enabled) {
      for (const part of [key, title, desc, price]) part.setAlpha(OFF_ALPHA);
    }
    this.buttons.push(box);
    this.parts.push(box, key, title, desc, price);
  }

  /** Строка выбора символа: значок, подпись (вес, цена, клетки). */
  private addChoiceRow(choice: ActionChoice, index: number): void {
    const y = PANEL_Y + PICK_TOP + index * (PICK_ROW_HEIGHT + PICK_ROW_GAP);
    const enabled = choice.enabled !== false;
    const box = this.scene.add
      .rectangle(CENTER_X, y, ROW_WIDTH, PICK_ROW_HEIGHT, ROW_FILL)
      .setRounded(8)
      .setStrokeStyle(2, enabled ? ROW_BORDER : ROW_BORDER_OFF)
      .setDepth(DEPTH);
    box.setInteractive({ useHandCursor: enabled });
    box.on('pointerdown', () => (enabled ? this.onPickSymbol?.(choice.symbol) : this.onDeny?.()));
    if (enabled) {
      box.on('pointerover', () => box.setFillStyle(ROW_HOVER));
      box.on('pointerout', () => box.setFillStyle(ROW_FILL));
    }
    const left = CENTER_X + TEXT_LEFT;
    const key = addText(this.scene, left - 26, y, String(index + 1), {
      fontSize: KEY_FONT,
      fontStyle: 'bold',
      color: 'rgba(255, 255, 255, 0.55)',
    }).setOrigin(0.5).setDepth(DEPTH);
    const sign = addText(this.scene, left, y, choice.symbol.sign, { fontSize: PICK_SIGN_FONT }).setOrigin(0, 0.5).setDepth(DEPTH);
    const note = addText(this.scene, left + 50, y, choice.note, {
      fontSize: PICK_NOTE_FONT,
      color: '#e2e8f0',
    }).setOrigin(0, 0.5).setDepth(DEPTH);
    if (!enabled) for (const part of [key, sign, note]) part.setAlpha(OFF_ALPHA);
    this.buttons.push(box);
    this.parts.push(box, key, sign, note);
  }
}

import Phaser from 'phaser';
import { VIEW_CENTER_X, VIEW_HEIGHT } from '../layout';
import { addText, GOLD_TEXT, TOOLTIP_DEPTH } from '../theme';

// Табличка подсказки.
const PADDING = 10; // поля внутри таблички
const LINE_GAP = 2; // между названием и описанием
const MIN_WIDTH = 120;
const BOTTOM_MARGIN = 8; // табличка внизу по центру экрана: её низ — на столько выше края
const LONG_PRESS_TIME = 400; // палец держат на вещи столько мс — показать подсказку вместо нажатия

/** Подсказка: показать название и что делает вещь или спрятать. Её отдают частям с подсказками. */
export interface Hint {
  show(title: string, text: string): void;
  hide(): void;
}

/**
 * Подсказка при наведении мыши (на телефоне — при долгом нажатии): тёмная табличка с названием (золотом) и описанием.
 * Всегда в одном месте — внизу по центру экрана, на какую бы вещь ни навели.
 * Текста на экране минимум — подсказка видна, только пока мышь или палец над вещью.
 */
export class Tooltip implements Hint {
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly text: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.box = scene.add.rectangle(0, 0, MIN_WIDTH, 40, 0x0b0f19, 0.95).setStrokeStyle(2, 0xb45309).setOrigin(0.5, 1);
    this.title = addText(scene, 0, 0, '', { fontSize: '15px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0.5, 0);
    this.text = addText(scene, 0, 0, '', { fontSize: '14px', color: '#e2e8f0' }).setOrigin(0.5, 0);
    this.container = scene.add.container(VIEW_CENTER_X, VIEW_HEIGHT - BOTTOM_MARGIN, [this.box, this.title, this.text]);
    this.container.setScrollFactor(0, 0, true).setDepth(TOOLTIP_DEPTH).setVisible(false); // приклеена к экрану: вид поворачивается — она на месте
  }

  /** Табличка внизу по центру экрана: её низ на месте, а высота и ширина — по надписям. */
  show(title: string, text: string): void {
    this.title.setText(title);
    this.text.setText(text);
    const width = Math.max(MIN_WIDTH, this.title.width, this.text.width) + 2 * PADDING;
    const height = this.title.height + LINE_GAP + this.text.height + 2 * PADDING;
    this.box.setSize(width, height);
    this.title.setY(-height + PADDING);
    this.text.setY(-height + PADDING + this.title.height + LINE_GAP);
    this.container.setVisible(true);
  }

  hide(): void {
    this.container.setVisible(false);
  }
}

/**
 * Повесить на вещь подсказку и нажатие press (если вещь можно нажать: купить, включить, отдать).
 * Мышь: навёл — табличка внизу экрана, убрал — пропала; клик — press() сразу.
 * Палец (на телефоне наведения нет): короткое касание — press(), долгое — только табличка, пока палец на вещи.
 * getHint возвращает [название, что делает] или null — тогда подсказки нет (например, клетка пуста).
 */
export function attachHint(
  target: Phaser.GameObjects.Image,
  hint: Hint,
  getHint: () => [string, string] | null,
  press?: () => void,
): void {
  const show = (): void => {
    const texts = getHint();
    if (texts) hint.show(texts[0], texts[1]);
  };
  let holdTimer: Phaser.Time.TimerEvent | null = null; // палец держат: через LONG_PRESS_TIME — подсказка
  let isHeld = false; // палец лёг на эту вещь
  let isLongPress = false; // держали долго — это была подсказка, а не нажатие
  target.on('pointerover', (pointer: Phaser.Input.Pointer) => {
    if (!pointer.wasTouch) show();
  });
  target.on('pointerout', () => {
    holdTimer?.remove();
    hint.hide();
  });
  target.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (!pointer.wasTouch) {
      press?.();
      return;
    }
    isHeld = true;
    isLongPress = false;
    holdTimer = target.scene.time.delayedCall(LONG_PRESS_TIME, () => {
      isLongPress = true;
      show();
    });
  });
  target.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    if (!pointer.wasTouch || !isHeld) return;
    isHeld = false;
    holdTimer?.remove();
    hint.hide();
    if (!isLongPress) press?.();
  });
}

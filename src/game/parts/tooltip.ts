import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH, ZOOM } from '../layout';
import { addText, GOLD_TEXT, TOOLTIP_DEPTH } from '../theme';

// Табличка подсказки.
const PADDING = 10; // поля внутри таблички
const LINE_GAP = 2; // между названием и описанием
const MIN_WIDTH = 120;
const POINTER_OFFSET = 14; // табличка отстоит от курсора вправо и вниз на столько
const FINGER_OFFSET = 36; // палец закрывает вещь под собой — табличка выше него
const EDGE_MARGIN = 8; // от края экрана до таблички
const LONG_PRESS_TIME = 400; // палец держат на вещи столько мс — показать подсказку вместо нажатия

/** Подсказка: показать название и что делает вещь или спрятать. Её отдают частям с подсказками. */
export interface Hint {
  show(title: string, text: string): void;
  hide(): void;
}

/**
 * Подсказка при наведении мыши (на телефоне — при долгом нажатии): тёмная табличка с названием (золотом) и описанием.
 * Табличка справа снизу от курсора и ходит за мышью; у правого края она встаёт слева от курсора, у нижнего — над ним.
 * Под пальцем (долгое нажатие) табличка — над пальцем по центру, чтобы его не закрывать.
 * Текста на экране минимум — подсказка видна, только пока мышь или палец над вещью.
 */
export class Tooltip implements Hint {
  private readonly scene: Phaser.Scene;
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly text: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.box = scene.add.rectangle(0, 0, MIN_WIDTH, 40, 0x0b0f19, 0.95).setStrokeStyle(2, 0xb45309).setOrigin(0, 0);
    this.title = addText(scene, 0, 0, '', { fontSize: '15px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0.5, 0);
    this.text = addText(scene, 0, 0, '', { fontSize: '14px', color: '#e2e8f0' }).setOrigin(0.5, 0);
    this.container = scene.add.container(0, 0, [this.box, this.title, this.text]);
    this.container.setScrollFactor(0, 0, true).setDepth(TOOLTIP_DEPTH).setVisible(false); // приклеена к экрану: вид поворачивается — она на месте
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.container.visible) this.place(pointer);
    });
  }

  /** Табличка у курсора: размер — по надписям, место — рядом с указателем. */
  show(title: string, text: string): void {
    this.title.setText(title);
    this.text.setText(text);
    const width = Math.max(MIN_WIDTH, this.title.width, this.text.width) + 2 * PADDING;
    const height = this.title.height + LINE_GAP + this.text.height + 2 * PADDING;
    this.box.setSize(width, height);
    this.title.setPosition(width / 2, PADDING);
    this.text.setPosition(width / 2, PADDING + this.title.height + LINE_GAP);
    this.place(this.scene.input.activePointer);
    this.container.setVisible(true);
  }

  /** Табличка справа снизу от указателя; не помещается справа — слева, не помещается снизу — сверху. Палец — над ним. */
  private place(pointer: Phaser.Input.Pointer): void {
    const { width, height } = this.box;
    const pointerX = pointer.x / ZOOM; // экранные пиксели → единицы раскладки (табличка приклеена к экрану)
    const pointerY = pointer.y / ZOOM;
    let x: number;
    let y: number;
    if (pointer.wasTouch) {
      x = pointerX - width / 2;
      y = pointerY - FINGER_OFFSET - height;
    } else {
      x = pointerX + POINTER_OFFSET;
      y = pointerY + POINTER_OFFSET;
      if (x + width > VIEW_WIDTH - EDGE_MARGIN) x = pointerX - POINTER_OFFSET - width;
      if (y + height > VIEW_HEIGHT - EDGE_MARGIN) y = pointerY - POINTER_OFFSET - height;
    }
    this.container.setPosition(
      Phaser.Math.Clamp(x, EDGE_MARGIN, VIEW_WIDTH - EDGE_MARGIN - width),
      Phaser.Math.Clamp(y, EDGE_MARGIN, VIEW_HEIGHT - EDGE_MARGIN - height),
    );
  }

  hide(): void {
    this.container.setVisible(false);
  }
}

/**
 * Повесить на вещь подсказку и нажатие press (если вещь можно нажать: купить, включить, отдать).
 * Мышь: навёл — табличка у курсора, убрал — пропала; клик — press() сразу.
 * Палец (на телефоне наведения нет): короткое касание — press(), долгое — только табличка, пока палец на вещи.
 * getHint возвращает [название, что делает] или null — тогда подсказки нет (например, клетка пуста).
 */
export function attachHint(
  target: Phaser.GameObjects.GameObject,
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

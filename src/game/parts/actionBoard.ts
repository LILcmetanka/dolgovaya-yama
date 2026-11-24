import Phaser from 'phaser';
import { t } from '../lang';
import { ACTION_BOARD } from '../layout';
import { addText } from '../theme';
import { attachHint, type Hint } from './tooltip';

/**
 * Кнопка «ДЕЙСТВИЯ» слева от экрана автомата (шаг 29; перенос — DONTLIKE п.5): вход в панель действий вне прокрутки.
 * Сделана как маленький экран автомата: тёмное стекло со сканлайнами, хромированная окантовка и надпись
 * «Д Е Й С Т В И Я» столбиком — по одной букве в строке, в стиле LED-табло. Не наклейка поверх корпуса:
 * стоит в левой полосе, прижата к рамке экрана и не выпирает за корпус.
 * До первой смерти кнопка закрыта совсем (обучение): буквы погашены, нажатие отвечает отказом.
 * Клик или клавиша A открывают панель — что дальше, решает сцена.
 */
const GLASS_FILL = 0x04121a; // почти чёрное стекло, как у экрана слотов
const FRAME_COLOR = 0x7c8794; // хромированная окантовка
const SCANLINE = 0xffffff; // сканлайны — как на стекле списка
const SCANLINE_ALPHA = 0.035;
const SCANLINE_STEP = 4;
const LETTERS_COLOR = '#d8ae4e'; // приглушённое золото — не бьёт в глаза
const LETTER_GLOW = '#8a5a1a'; // слабое свечение вокруг букв
const LETTER_FONT = '18px';
const LETTER_LINE = 2;
const LED_FONT = 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace';
const ON_ALPHA = 1;
const OFF_ALPHA = 0.4; // действовать нельзя: кнопка погашена

export class ActionBoard {
  /** Пластина кнопки: по ней сценарии нажимают и меряют, где кнопка. */
  readonly box: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private unlocked = false; // первая смерть позади: до неё на экране нет надписи

  /** press — нажали кнопку (сцена открывает панель или говорит «нельзя»). hint — подсказка при наведении. */
  constructor(scene: Phaser.Scene, press: () => void, hint: Hint) {
    const { x, y, width, height } = ACTION_BOARD;
    const left = x - width / 2;
    const top = y - height / 2;
    const glass = scene.add.graphics();
    glass.fillStyle(GLASS_FILL);
    glass.fillRoundedRect(left, top, width, height, 8);
    glass.fillStyle(SCANLINE, SCANLINE_ALPHA);
    for (let line = top + 4; line < top + height - 4; line += SCANLINE_STEP) glass.fillRect(left + 3, line, width - 6, 1);
    glass.lineStyle(1.5, FRAME_COLOR, 0.9);
    glass.strokeRoundedRect(left, top, width, height, 8);
    glass.fillStyle(0xffffff, 0.05);
    glass.fillRoundedRect(left + 4, top + 3, width - 8, 3, 1.5); // блик по верхней кромке
    // Зона нажатия — невидимая пластина поверх стекла: у Graphics нет своего размера для попадания.
    const plate = scene.add.rectangle(x, y, width, height, 0x000000, 0).setInteractive({ useHandCursor: true });
    // Надпись столбиком: по одной букве в строке.
    const letters = verticalText(t('actionsSign'));
    const label = addText(scene, x, y, letters, {
      fontFamily: LED_FONT,
      fontSize: LETTER_FONT,
      fontStyle: 'bold',
      color: LETTERS_COLOR,
      align: 'center',
      lineSpacing: LETTER_LINE,
      shadow: { color: LETTER_GLOW, blur: 4, fill: true }, // слабое свечение, как у цифр LED-табло
    }).setOrigin(0.5);
    this.box = plate;
    this.label = label;
    // Подсказка и нажатие — на пластине: мышью клик, пальцем — по отпусканию (долгое — подсказка).
    attachHint(plate, hint, () => [t('actionsTitle'), t('actionsWhat')], press);
  }

  /**
   * Состояние кнопки. unlocked — первая смерть позади: до неё на экране просто пустое стекло без надписи,
   * действие закрыто (обучение). available — действовать можно сейчас (не крутится, не магазин, не спасение).
   */
  setState(available: boolean, unlocked: boolean): void {
    this.unlocked = unlocked;
    this.label.setText(unlocked ? verticalText(t('actionsSign')) : '');
    // Гаснет только надпись: стекло и рамка остаются на месте, даже когда рычаг крутится (DONTLIKE).
    this.label.setAlpha(available ? ON_ALPHA : OFF_ALPHA);
  }

  /** Сменили язык (L): надпись кнопки — на новом (если она вообще открыта). */
  relabel(): void {
    this.label.setText(this.unlocked ? verticalText(t('actionsSign')) : '');
  }
}

/** Надпись столбиком: каждая буква с новой строки. */
function verticalText(text: string): string {
  return [...text].join('\n');
}

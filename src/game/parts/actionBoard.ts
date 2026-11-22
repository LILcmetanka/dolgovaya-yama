import Phaser from 'phaser';
import { t } from '../lang';
import { ACTION_BOARD } from '../layout';
import { addText, GOLD_TEXT, HINT_TEXT } from '../theme';
import { attachHint, type Hint } from './tooltip';

/**
 * Табличка «ДЕЙСТВИЯ» на стене (шаг 29): вход в панель действий вне прокрутки. Висит под телевизором
 * справа от автомата и видна всегда; когда действовать нельзя (крутится, магазин, спасение), она тускнеет.
 * Клик или клавиша A открывают панель — что дальше, решает сцена.
 */
const BOARD_FILL = 0x1c1408;
const BOARD_BORDER = 0xb45309;
const BOARD_RADIUS = 8;
const TITLE_FONT = '15px';
const KEY_FONT = '12px';
const KEY_BADGE = 22; // сторона кружка с клавишей A — палец тоже попадает
const ON_ALPHA = 1;
const OFF_ALPHA = 0.45; // действовать нельзя: табличка бледная

export class ActionBoard {
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly labels: Phaser.GameObjects.Text[];
  private available = true;

  /** press — нажали табличку (сцена открывает панель или говорит «нельзя»). hint — подсказка при наведении. */
  constructor(scene: Phaser.Scene, press: () => void, hint: Hint) {
    const { x, y, width, height } = ACTION_BOARD;
    this.box = scene.add
      .rectangle(x, y, width, height, BOARD_FILL, 0.92)
      .setRounded(BOARD_RADIUS)
      .setStrokeStyle(2, BOARD_BORDER);
    this.box.setInteractive({ useHandCursor: true }); // клик и подсказка (attachHint) — на самой плашке
    const title = addText(scene, x - width / 2 + 12, y - 6, t('actionsSign'), {
      fontSize: TITLE_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0, 0.5);
    const sub = addText(scene, x - width / 2 + 12, y + 12, t('actionsSignHint'), {
      fontSize: KEY_FONT,
      color: 'rgba(255, 255, 255, 0.6)',
    }).setOrigin(0, 0.5);
    this.title = title;
    this.sub = sub;
    // Клавиша A — в кружке, как номер клавиши на карточках улучшений.
    const badge = scene.add.circle(x + width / 2 - KEY_BADGE / 2 - 8, y, KEY_BADGE / 2, 0x000000, 0.55).setStrokeStyle(1, BOARD_BORDER);
    const key = addText(scene, badge.x, y, 'A', { fontSize: KEY_FONT, fontStyle: 'bold', color: HINT_TEXT }).setOrigin(0.5);
    this.labels = [title, sub, key];
    // Подсказка и нажатие — одним помощником: мышью клик по нажатию, пальцем — по отпусканию (долгое — подсказка).
    attachHint(this.box, hint, () => [t('actionsTitle'), t('actionsWhat')], press);
  }

  /** Действовать можно — табличка яркая; нельзя (крутится, магазин, спасение) — бледная и не врёт. */
  setAvailable(available: boolean): void {
    if (available === this.available) return;
    this.available = available;
    this.box.setAlpha(available ? ON_ALPHA : OFF_ALPHA);
    for (const label of this.labels) label.setAlpha(available ? ON_ALPHA : OFF_ALPHA);
  }

  /** Сменили язык (L): надписи таблички — на новом. */
  relabel(): void {
    this.title.setText(t('actionsSign'));
    this.sub.setText(t('actionsSignHint'));
  }
}

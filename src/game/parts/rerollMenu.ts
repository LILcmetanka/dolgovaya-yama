import Phaser from 'phaser';
import { itemTexture } from '../decor';
import { ITEMS, type RerollId } from '../items';
import { t } from '../lang';
import { PAYOUT_WINDOW } from '../layout';
import { addText, GOLD_TEXT, POPUP_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Полоса встаёт на место окошка выплаты (layout.ts) — там, где глаз ищет итог прокрутки. Все числа — от PAYOUT_WINDOW.
const BAND_ALPHA = 0.96; // корпус под полосой должен читаться еле-еле
const BAND_STROKE = 2;
const PADDING = 6; // от штриха полосы до заголовка, кнопок и ✕
// Правее оправы кнопки «забрать» полосе делать нечего: оправа 36 px при x = 664 (646…682), мягкое свечение — с 640
// (payoutWindow.ts). Полоса кончается на 642: 4 px до оправы и не заходит на кнопку.
const BEZEL_LEFT = 642;
const TITLE_ROOM = 12; // на столько полоса выше окошка выплаты: там заголовок, а ещё выше — ряд лампочек прокруток (кончается на ~501)
const BAND_LEFT = PAYOUT_WINDOW.x - PAYOUT_WINDOW.width / 2; // 420 — левый край окошка выплаты
const BAND_RIGHT = BEZEL_LEFT; // 642
const BAND_TOP = PAYOUT_WINDOW.y - PAYOUT_WINDOW.height / 2 - TITLE_ROOM; // 505
const BAND_BOTTOM = PAYOUT_WINDOW.y + PAYOUT_WINDOW.height / 2; // 587 — низ окошка выплаты
const BAND_X = (BAND_LEFT + BAND_RIGHT) / 2; // 531
const BAND_Y = (BAND_TOP + BAND_BOTTOM) / 2; // 546
const BAND_WIDTH = BAND_RIGHT - BAND_LEFT; // 222
const BAND_HEIGHT = BAND_BOTTOM - BAND_TOP; // 82
const TITLE_STYLE = { fontSize: '15px', fontStyle: 'bold', color: GOLD_TEXT };
const TITLE_X = BAND_X;
const TITLE_Y = BAND_TOP + PADDING; // 511: заголовок внутри полосы, от верхнего штриха ровно на отступ
// ✕ — пропустить, предмет остаётся заряженным до следующей платной прокрутки.
const SKIP_SIZE = 30;
const SKIP_STYLE = { fontSize: '20px', fontStyle: 'bold', color: '#e2e8f0' };
const SKIP_FILL = 0x1f2937;
const SKIP_STROKE = 0x64748b;
// Кнопки-иконки заряженных предметов — под заголовком; ряд по центру свободного места справа от ✕.
const BUTTON_SIZE = 44;
const BUTTON_STEP = 54; // между центрами соседних кнопок
const BUTTONS_X = (BAND_LEFT + PADDING + SKIP_SIZE + PADDING + (BAND_RIGHT - PADDING)) / 2; // 549
const BUTTONS_Y = BAND_BOTTOM - PADDING - BUTTON_SIZE / 2; // 559: от нижнего штриха — PADDING
const SKIP_X = BAND_LEFT + PADDING + SKIP_SIZE / 2; // 441
const SKIP_Y = BUTTONS_Y;
const BUTTON_IDS: RerollId[] = ['shuffle', 'swap']; // порядок кнопок в полосе
const OPEN_TIME = 160; // полоса проявляется, мс

/**
 * Меню перемешки и подмены (шаг 63б): встаёт на место окошка выплаты, когда сетка уже встала, а итог ещё не посчитан.
 * Сверху заголовок — «ПОМЕНЯТЬ СЕТКУ?», «КАКОЙ СТОЛБЕЦ?» или «КАКАЯ КЛЕТКА?»; в полосе — иконки заряженных предметов
 * и ✕. Выбрали предмет — сцена просит кликнуть столбец или клетку (SlotScreen.beginPick), полоса ждёт с заголовком.
 */
export class RerollMenu {
  private readonly scene: Phaser.Scene;
  private readonly band: Phaser.GameObjects.Rectangle; // тёмная полоса на месте окошка выплаты
  private readonly title: Phaser.GameObjects.Text; // вопрос в полосе, над кнопками
  private readonly buttons = new Map<RerollId, Phaser.GameObjects.Image>(); // иконки заряженных предметов
  private readonly skip: Phaser.GameObjects.Container; // ✕: пропустить, предмет не тратится
  private readonly window: Phaser.GameObjects.Container; // всё вместе: открыть — видно, закрыть — нет
  private mode: RerollId | null = null; // выбранный предмет; null — ещё спрашиваем «поменять сетку?»

  /** use — что делать, когда нажали иконку предмета; skip — когда нажали ✕. */
  constructor(scene: Phaser.Scene, use: (id: RerollId) => void, skip: () => void, hint: Hint) {
    this.scene = scene;
    this.band = scene.add
      .rectangle(BAND_X, BAND_Y, BAND_WIDTH, BAND_HEIGHT, 0x0b0f19, BAND_ALPHA)
      .setRounded(10)
      .setStrokeStyle(BAND_STROKE, 0xb45309);
    this.title = addText(scene, TITLE_X, TITLE_Y, '', TITLE_STYLE).setOrigin(0.5, 0);
    const skipPlate = scene.add.rectangle(0, 0, SKIP_SIZE, SKIP_SIZE, SKIP_FILL).setRounded(6).setStrokeStyle(BAND_STROKE, SKIP_STROKE);
    const skipSign = addText(scene, 0, 0, '✕', SKIP_STYLE).setOrigin(0.5);
    this.skip = scene.add.container(SKIP_X, SKIP_Y, [skipPlate, skipSign]);
    skipPlate.setSize(SKIP_SIZE, SKIP_SIZE).setInteractive({ useHandCursor: true });
    skipPlate.on('pointerdown', skip);
    attachHint(skipPlate, hint, () => [t('rerollSkip'), '']);

    const parts: Phaser.GameObjects.GameObject[] = [this.band, this.title, this.skip];
    for (const id of BUTTON_IDS) {
      const item = ITEMS.find((candidate) => candidate.id === id) ?? ITEMS[0];
      const icon = scene.add.image(0, BUTTONS_Y, itemTexture(item)).setDisplaySize(BUTTON_SIZE, BUTTON_SIZE).setVisible(false);
      icon.setInteractive({ useHandCursor: true });
      attachHint(icon, hint, () => [t(item.name), t(item.description)], () => use(id));
      this.buttons.set(id, icon);
      parts.push(icon);
    }
    this.window = scene.add.container(0, 0, parts).setDepth(POPUP_DEPTH - 3).setVisible(false);
  }

  /** Окно открылось: иконки только заряженных предметов, ряд по центру свободного места справа от ✕. */
  open(armed: RerollId[]): void {
    this.mode = null;
    this.title.setText(t('rerollAsk'));
    for (const [id, icon] of this.buttons) {
      const index = armed.indexOf(id);
      icon.setPosition(BUTTONS_X + (index - (armed.length - 1) / 2) * BUTTON_STEP, BUTTONS_Y);
      icon.setVisible(index >= 0);
    }
    this.skip.setVisible(true);
    this.scene.tweens.killTweensOf(this.window);
    this.window.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.window, alpha: 1, duration: OPEN_TIME });
  }

  /** Предмет выбран: спрашиваем, столбец или клетку. Иконки уходят — выбор идёт на сетке. */
  ask(mode: RerollId): void {
    this.mode = mode;
    this.title.setText(this.titleText());
    for (const icon of this.buttons.values()) icon.setVisible(false);
    this.skip.setVisible(true);
  }

  /** Сменили язык: заголовок — заново по текущему режиму. Подсказки берут язык сами: их текст считается при показе. */
  relabel(): void {
    this.title.setText(this.titleText());
  }

  /** Надпись полосы по режиму: спрашиваем предмет, столбец или клетку. */
  private titleText(): string {
    if (!this.mode) return t('rerollAsk');
    return t(this.mode === 'shuffle' ? 'rerollColumn' : 'rerollCell');
  }

  /** Окно закрылось: сетка отдана итогу. */
  close(): void {
    this.scene.tweens.killTweensOf(this.window);
    this.window.setVisible(false);
  }
}

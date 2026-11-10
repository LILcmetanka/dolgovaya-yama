import Phaser from 'phaser';
import { CHIP_TEXTURE, createChipTextures, createTakeButtonTextures, TAKE_BEZEL_TEXTURE, TAKE_DOME_TEXTURE, TAKE_SHINE_TEXTURE } from '../decor';
import { BOARD_CHIP_X, DISPLAY } from '../layout';
import {
  addText,
  CHIP_DEPTH,
  GREEN_TEXT,
  LAMP_GOLD,
  LAMP_RED,
  LED_COLOR,
  LED_STYLE,
  POPUP_DEPTH,
  POPUP_STYLE,
  pulse,
  RED_TEXT,
} from '../theme';

// Что где в окошке.
const CHIP_X = 452; // фишка слева от суммы
const CHIP_Y = 552; // фишка и «× 400» — посередине окошка
const PAYOUT_TEXT_X = 474; // «× 400» — правее фишки
// Кнопка «забрать» на самом табло — небольшая кнопка в металлической оправе без слов: купол светится золотым (черепа — красным).
const BUTTON_X = 664;
const BUTTON_Y = 552;
const BUTTON_GLOW_RADIUS = 24; // мягкое свечение вокруг кнопки
const BUTTON_GLOW_ALPHA = 0.25;
const BUTTON_HIT_SIZE = 46; // нажимать можно чуть шире самой кнопки
const BUTTON_SHINE_OFFSET = { x: -3, y: -5 }; // блик на куполе — сверху слева
// Сколько фишек летит в табло при «забрать»: одна и ещё по одной за каждый порог — долю долга, которую набрал кон.
const CHIP_STEPS = [0.25, 0.5, 1, 2, 4];
// Анимации, мс.
const FLICKER_TIME = 70; // окошко загорается: мигает FLICKER_TIMES раз по столько, как лампа
const FLICKER_TIMES = 3;
const BUTTON_POP_TIME = 250; // кнопка вспыхивает
const FADE_TIME = 250; // окошко гаснет
const CHIPS_FLY_TIME = 500; // фишки летят из окошка в табло
const CHIPS_FLY_STAGGER = 70; // фишки взлетают друг за другом
const BURN_TIME = 450; // черепа: столько окошко горит красным, потом гаснет
const AMOUNT_FLY_TIME = 500; // «+36» летит в табло
const AMOUNT_FADE_DELAY = 350; // через столько «+36» начинает таять
const BUTTON_PRESS_SCALE = 0.85; // нажатая кнопка чуть уменьшается — «вдавливается»
const BURN_COLOR = 0xff5a1f; // фишка в окошке горит огнём

/** Сколько фишек летит в табло: одна и ещё по одной за каждый порог CHIP_STEPS. */
function chipsForPot(pot: number, debt: number): number {
  return 1 + CHIP_STEPS.filter((step) => pot >= step * debt).length;
}

/**
 * Окошко выплаты на корпусе — электронное табло. Кона нет — оно погашено, виден только тёмный контур кнопки.
 * Кон есть — горят фишка, «× сумма» и кнопка «забрать» — круг света без слов. Кнопка погашена — виден только тёмный контур.
 */
export class PayoutWindow {
  private readonly scene: Phaser.Scene;
  private readonly lit: Phaser.GameObjects.Container; // всё, что горит, пока на кону что-то есть: фишка, сумма, кнопка
  private readonly chip: Phaser.GameObjects.Image; // фишка слева от суммы
  private readonly payoutText: Phaser.GameObjects.Text; // «× 400» — сколько фишек на кону
  private readonly button: Phaser.GameObjects.Container; // кнопка «забрать»: свечение, купол и блик, без надписей (оправа стоит под ней и видна всегда)
  private readonly buttonGlow: Phaser.GameObjects.Arc; // свечение вокруг
  private readonly buttonDome: Phaser.GameObjects.Image; // купол — краснеет вместе с суммой при черепах
  private flyingChips = 1; // сколько фишек полетит при «забрать»
  private isLit = false; // окошко горит (или загорается)

  /** take — что делать, когда нажали кнопку «забрать» (Enter сцена ловит сама). */
  constructor(scene: Phaser.Scene, take: () => void) {
    this.scene = scene;
    createChipTextures(scene);
    createTakeButtonTextures(scene);

    // Погашенная кнопка: пустая оправа с тёмным гнездом — видно, где она, но не горит. Не интерактивна.
    scene.add.image(BUTTON_X, BUTTON_Y, TAKE_BEZEL_TEXTURE);
    this.chip = scene.add.image(CHIP_X, CHIP_Y, CHIP_TEXTURE);
    this.payoutText = addText(scene, PAYOUT_TEXT_X, CHIP_Y, '', { ...LED_STYLE, fontSize: '26px' }).setOrigin(0, 0.5);
    this.buttonGlow = scene.add.circle(0, 0, BUTTON_GLOW_RADIUS, LAMP_GOLD, BUTTON_GLOW_ALPHA);
    this.buttonDome = scene.add.image(0, 0, TAKE_DOME_TEXTURE).setTint(LAMP_GOLD);
    const shine = scene.add.image(BUTTON_SHINE_OFFSET.x, BUTTON_SHINE_OFFSET.y, TAKE_SHINE_TEXTURE).setAngle(-25);
    this.button = scene.add.container(BUTTON_X, BUTTON_Y, [this.buttonGlow, this.buttonDome, shine]);
    this.button.setSize(BUTTON_HIT_SIZE, BUTTON_HIT_SIZE);
    this.button.setInteractive({ useHandCursor: true });
    this.button.on('pointerdown', take);
    // Всё горящее — в одном слое: погасло окошко — слой невидим, и кнопку не нажать.
    this.lit = scene.add.container(0, 0, [this.chip, this.payoutText, this.button]).setVisible(false);
  }

  /**
   * Окошко показывает кон: есть что забрать — горят «× сумма» и кнопка, нет — гаснет.
   * Сцена зовёт это при каждом обновлении приборов, поэтому окошко не останется погашенным, когда на кону что-то есть.
   */
  showPot(pot: number, debt: number): void {
    if (pot === 0) {
      this.turnOff(0);
      return;
    }
    this.payoutText.setText(`× ${pot}`);
    this.flyingChips = chipsForPot(pot, debt);
    this.turnOn();
  }

  /** Пока крутится или идёт расплата — кнопка тусклее. */
  setEnabled(enabled: boolean): void {
    this.button.setAlpha(enabled ? 1 : 0.5);
  }

  /** Кнопка коротко вдавливается. */
  press(): void {
    this.scene.tweens.killTweensOf(this.button);
    this.button.setScale(1);
    this.scene.tweens.add({ targets: this.button, scale: BUTTON_PRESS_SCALE, duration: 70, yoyo: true });
  }

  /** Выигрыш лёг на кон: окошко загорается (если было погашено), сумма подпрыгивает. */
  addWin(pot: number, debt: number): void {
    this.showPot(pot, debt);
    pulse(this.scene, this.payoutText, 1.2);
  }

  /** Окошко загорается — мигнув, как лампа, — и вспыхивает кнопка. Уже горит — ничего не меняется. */
  private turnOn(): void {
    if (this.isLit) return;
    this.isLit = true;
    this.chip.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); // после черепов фишка и сумма снова обычного цвета
    this.payoutText.setColor(LED_COLOR);
    this.paintButton(LAMP_GOLD);
    this.scene.tweens.killTweensOf(this.lit);
    this.lit.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.lit, alpha: { from: 0, to: 1 }, duration: FLICKER_TIME, repeat: FLICKER_TIMES - 1 });
    this.scene.tweens.add({ targets: this.button, scale: { from: 0.4, to: 1 }, duration: BUTTON_POP_TIME, ease: 'Back.easeOut' });
  }

  /**
   * Окошко гаснет: ещё delay мс горит в полную силу, потом тает. Уже погашено — ничего не меняется.
   * В полную силу — даже если только начало загораться: так видно и выигрыш, который сразу забирается (последняя прокрутка).
   */
  private turnOff(delay: number): void {
    if (!this.isLit) return;
    this.isLit = false;
    this.scene.tweens.killTweensOf(this.lit);
    this.lit.setAlpha(1);
    this.scene.tweens.add({
      targets: this.lit,
      alpha: 0,
      delay,
      duration: FADE_TIME,
      onComplete: () => this.lit.setVisible(false),
    });
  }

  /** Кнопка светится этим цветом: золотой — можно забрать, красный — черепа. */
  private paintButton(color: number): void {
    this.buttonGlow.setFillStyle(color, BUTTON_GLOW_ALPHA);
    this.buttonDome.setTint(color);
  }

  /**
   * «Забрали»: из окошка в табло друг за другом летят фишки — по одной за каждый порог кона, следом «+36».
   * Окошко гаснет, когда взлетит последняя фишка. landed — когда «+36» долетит до табло.
   */
  takeAll(amount: number, landed: () => void): void {
    const chips = this.flyingChips;
    for (let index = 0; index < chips; index++) this.flyChip(index * CHIPS_FLY_STAGGER);
    this.flyAmount(amount, landed);
    this.turnOff(chips * CHIPS_FLY_STAGGER);
  }

  /** Фишка через delay мс вылетает из окошка в табло; долетела — исчезает. */
  private flyChip(delay: number): void {
    const chip = this.scene.add.image(CHIP_X, CHIP_Y, CHIP_TEXTURE).setDepth(CHIP_DEPTH);
    this.scene.tweens.add({
      targets: chip,
      x: BOARD_CHIP_X,
      y: DISPLAY.y,
      delay,
      duration: CHIPS_FLY_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => chip.destroy(),
    });
  }

  /** «+36» летит из окошка в табло; долетело — landed(). */
  private flyAmount(amount: number, landed: () => void): void {
    const label = addText(this.scene, PAYOUT_TEXT_X + 40, CHIP_Y, `+${amount}`, { ...POPUP_STYLE, color: GREEN_TEXT })
      .setOrigin(0.5)
      .setDepth(POPUP_DEPTH);
    this.scene.tweens.add({
      targets: label,
      x: DISPLAY.x,
      y: DISPLAY.y,
      alpha: { value: 0, delay: AMOUNT_FADE_DELAY, duration: AMOUNT_FLY_TIME - AMOUNT_FADE_DELAY },
      duration: AMOUNT_FLY_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        label.destroy();
        landed();
      },
    });
  }

  /** Черепа: фишка в окошке вспыхивает огнём, сумма и кнопка краснеют, потом окошко гаснет. */
  burn(): void {
    this.chip.setTint(BURN_COLOR).setTintMode(Phaser.TintModes.FILL);
    this.payoutText.setColor(RED_TEXT);
    this.paintButton(LAMP_RED);
    this.turnOff(BURN_TIME);
  }
}

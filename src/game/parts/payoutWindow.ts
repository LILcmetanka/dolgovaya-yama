import Phaser from 'phaser';
import { CHIP_TEXTURE, createChipTextures, createRedButtonTexture, RED_BUTTON_TEXTURE } from '../decor';
import { BOARD_CHIP_X, DISPLAY, PAYOUT_WINDOW } from '../layout';
import {
  addKeyHint,
  addText,
  CHIP_DEPTH,
  GREEN_TEXT,
  LAMP_GOLD,
  LAMP_GREEN,
  LAMP_OFF,
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
const CHIP_Y = 543; // фишка и «× 400» — в верхней части окошка, под ними огоньки
const PAYOUT_TEXT_X = 474; // «× 400» — правее фишки
const RED_BUTTON_X = 664;
const RED_BUTTON_Y = 554;
// Огоньки под суммой — сколько кона относительно долга раунда (раньше это показывала стопка фишек).
// Горит один и ещё по одному за каждый порог — долю долга, которую набрал кон. Шесть — больше не бывает (кон вчетверо больше долга).
const LIGHT_STEPS = [0.25, 0.5, 1, 2, 4];
const LIGHTS_ENOUGH = 4; // столько огоньков — кона уже хватает на долг: четвёртый и дальше зелёные
const LIGHTS_X = 452; // первый огонёк, следующие правее
const LIGHTS_Y = 571;
const LIGHT_STEP = 17;
const LIGHT_RADIUS = 5;
// Анимации, мс.
const FLICKER_TIME = 70; // окошко загорается: мигает FLICKER_TIMES раз по столько, как лампа
const FLICKER_TIMES = 3;
const BUTTON_POP_TIME = 250; // красная кнопка выскакивает
const LIGHT_POP_TIME = 250; // новый огонёк вспыхивает
const FADE_TIME = 250; // окошко гаснет
const CHIPS_FLY_TIME = 500; // фишки летят из окошка в табло
const CHIPS_FLY_STAGGER = 70; // фишки взлетают друг за другом
const BURN_TIME = 450; // черепа: столько окошко горит красным, потом гаснет
const AMOUNT_FLY_TIME = 500; // «+36» летит в табло
const AMOUNT_FADE_DELAY = 350; // через столько «+36» начинает таять
const RED_BUTTON_PRESS_SCALE = 0.88; // нажатая красная кнопка чуть уменьшается — «вдавливается»
const BURN_COLOR = 0xff5a1f; // фишка в окошке горит огнём

/** Сколько огоньков горит: один и ещё по одному за каждый порог LIGHT_STEPS — долю долга, которую набрал кон. */
function lightsForPot(pot: number, debt: number): number {
  return 1 + LIGHT_STEPS.filter((step) => pot >= step * debt).length;
}

/** Цвет огонька номер index (с нуля): пока кона не хватает на долг — жёлтый, дальше — зелёный. */
function lightColor(index: number): number {
  return index < LIGHTS_ENOUGH - 1 ? LAMP_GOLD : LAMP_GREEN;
}

/**
 * Окошко выплаты на корпусе — электронное табло. Кона нет — оно погашено, видны только тёмные огоньки.
 * Кон есть — горят фишка, «× сумма» и огоньки (сколько кона относительно долга), выскакивает красная кнопка «забрать».
 */
export class PayoutWindow {
  private readonly scene: Phaser.Scene;
  private readonly lit: Phaser.GameObjects.Container; // всё, что горит, пока на кону что-то есть: фишка, сумма, кнопка, подсказка
  private readonly chip: Phaser.GameObjects.Image; // фишка слева от суммы
  private readonly payoutText: Phaser.GameObjects.Text; // «× 400» — сколько фишек на кону
  private readonly redButton: Phaser.GameObjects.Image; // красная кнопка «забрать» — без надписей
  private readonly lights: Phaser.GameObjects.Arc[] = []; // огоньки под суммой, слева направо
  private litLights = 0; // сколько огоньков горит
  private isLit = false; // окошко горит (или загорается)

  /** take — что делать, когда нажали красную кнопку (Enter сцена ловит сама). */
  constructor(scene: Phaser.Scene, take: () => void) {
    this.scene = scene;
    createChipTextures(scene);
    createRedButtonTexture(scene);

    for (let index = 0; index <= LIGHT_STEPS.length; index++) {
      this.lights.push(scene.add.circle(LIGHTS_X + index * LIGHT_STEP, LIGHTS_Y, LIGHT_RADIUS, LAMP_OFF));
    }
    this.chip = scene.add.image(CHIP_X, CHIP_Y, CHIP_TEXTURE);
    this.payoutText = addText(scene, PAYOUT_TEXT_X, CHIP_Y, '', { ...LED_STYLE, fontSize: '26px' }).setOrigin(0, 0.5);
    this.redButton = scene.add.image(RED_BUTTON_X, RED_BUTTON_Y, RED_BUTTON_TEXTURE);
    this.redButton.setInteractive({ useHandCursor: true });
    this.redButton.on('pointerdown', take);
    const hintY = PAYOUT_WINDOW.y + PAYOUT_WINDOW.height / 2 + 12;
    const hint = addKeyHint(scene, RED_BUTTON_X, hintY, 'Enter'); // подсказка под окошком
    // Всё горящее — в одном слое: погасло окошко — слой невидим, и кнопку не нажать.
    this.lit = scene.add.container(0, 0, [this.chip, this.payoutText, this.redButton, hint]).setVisible(false);
  }

  /**
   * Окошко показывает кон: есть что забрать — горят «× сумма» и огоньки, нет — гаснет.
   * Сцена зовёт это при каждом обновлении приборов, поэтому окошко не останется погашенным, когда на кону что-то есть.
   */
  showPot(pot: number, debt: number): void {
    if (pot === 0) {
      this.turnOff(0);
      return;
    }
    this.payoutText.setText(`× ${pot}`);
    this.showLights(lightsForPot(pot, debt));
    this.turnOn();
  }

  /** Пока крутится или идёт расплата — красная кнопка тусклее. */
  setEnabled(enabled: boolean): void {
    this.redButton.setAlpha(enabled ? 1 : 0.6);
  }

  /** Красная кнопка коротко вдавливается. */
  press(): void {
    this.scene.tweens.killTweensOf(this.redButton);
    this.redButton.setScale(1);
    this.scene.tweens.add({ targets: this.redButton, scale: RED_BUTTON_PRESS_SCALE, duration: 70, yoyo: true });
  }

  /** Выигрыш лёг на кон: окошко загорается (если было погашено), огоньки — по новому кону, сумма подпрыгивает. */
  addWin(pot: number, debt: number): void {
    this.showPot(pot, debt);
    pulse(this.scene, this.payoutText, 1.2);
  }

  /** Окошко загорается — мигнув, как лампа, — и выскакивает красная кнопка. Уже горит — ничего не меняется. */
  private turnOn(): void {
    if (this.isLit) return;
    this.isLit = true;
    this.chip.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); // после черепов фишка и сумма снова обычного цвета
    this.payoutText.setColor(LED_COLOR);
    this.scene.tweens.killTweensOf(this.lit);
    this.lit.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.lit, alpha: { from: 0, to: 1 }, duration: FLICKER_TIME, repeat: FLICKER_TIMES - 1 });
    this.scene.tweens.add({ targets: this.redButton, scale: { from: 0.4, to: 1 }, duration: BUTTON_POP_TIME, ease: 'Back.easeOut' });
  }

  /**
   * Окошко гаснет: ещё delay мс горит в полную силу, потом тает, огоньки гаснут. Уже погашено — ничего не меняется.
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
      onComplete: () => {
        this.lit.setVisible(false);
        this.showLights(0);
      },
    });
  }

  /** Горят первые count огоньков, остальные погашены. Новый огонёк вспыхивает. */
  private showLights(count: number): void {
    this.lights.forEach((light, index) => {
      light.setFillStyle(index < count ? lightColor(index) : LAMP_OFF);
      const isNew = index >= this.litLights && index < count;
      if (isNew) this.scene.tweens.add({ targets: light, scale: { from: 1.8, to: 1 }, duration: LIGHT_POP_TIME, ease: 'Quad.easeOut' });
    });
    this.litLights = count;
  }

  /**
   * «Забрали»: из окошка в табло друг за другом летят фишки — по одной на огонёк, следом «+36».
   * Огоньки гаснут сразу, окошко — когда взлетит последняя фишка. landed — когда «+36» долетит до табло.
   */
  takeAll(amount: number, landed: () => void): void {
    const chips = Math.max(1, this.litLights);
    for (let index = 0; index < chips; index++) this.flyChip(index * CHIPS_FLY_STAGGER);
    this.showLights(0);
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

  /** Черепа: фишка в окошке вспыхивает огнём, сумма и огоньки краснеют, потом окошко гаснет. */
  burn(): void {
    this.chip.setTint(BURN_COLOR).setTintMode(Phaser.TintModes.FILL);
    this.payoutText.setColor(RED_TEXT);
    this.lights.forEach((light, index) => {
      if (index < this.litLights) light.setFillStyle(LAMP_RED);
    });
    this.turnOff(BURN_TIME);
  }
}

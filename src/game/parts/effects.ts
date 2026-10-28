import Phaser from 'phaser';
import { CHIP_TEXTURE, createChipTextures } from '../decor';
import { CENTER_X, DISPLAY, GRID_Y } from '../layout';
import { addText, CHIP_DEPTH, POPUP_DEPTH, POPUP_STYLE } from '../theme';

// Брызги фишек: чем больше выигрыш, тем больше фишек.
const BURST_MIN_CHIPS = 6; // столько фишек брызгает даже от маленького выигрыша
const BURST_GAIN_PER_CHIP = 5; // плюс одна фишка за каждые столько фишек выигрыша
const BURST_MAX_CHIPS = 40;
const BOARD_BURST_CHIPS = 8; // столько фишек брызгает из табло, когда туда долетели деньги
// Всплывающая надпись над сеткой.
const POPUP_RISE = 60; // на столько px поднимается
const POPUP_TIME = 1100; // столько летит, мс
const POPUP_FADE_DELAY = 600; // через столько начинает таять

/** Общие эффекты поверх автомата: брызги фишек, всплывающие надписи над сеткой, вспышка с тряской. */
export class Effects {
  private readonly scene: Phaser.Scene;
  private readonly chipEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    createChipTextures(scene);
    // Фишки-частицы: сами не летят, только по команде explode() — веером вверх, потом падают.
    this.chipEmitter = scene.add
      .particles(0, 0, CHIP_TEXTURE, {
        speed: { min: 180, max: 380 },
        angle: { min: 210, max: 330 },
        gravityY: 700,
        lifespan: 1000,
        scale: { start: 1, end: 0.5 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(CHIP_DEPTH);
  }

  /** Фишки брызгают из сетки: чем больше выигрыш, тем больше фишек (но не больше BURST_MAX_CHIPS). */
  burstFromGrid(gain: number): void {
    const count = Math.min(BURST_MIN_CHIPS + Math.floor(gain / BURST_GAIN_PER_CHIP), BURST_MAX_CHIPS);
    this.chipEmitter.explode(count, CENTER_X, GRID_Y);
  }

  /** Фишки брызгают из табло: туда только что долетели деньги. */
  burstFromBoard(): void {
    this.chipEmitter.explode(BOARD_BURST_CHIPS, DISPLAY.x, DISPLAY.y);
  }

  /** Надпись всплывает над сеткой: поднимается и тает. */
  popup(text: string, color: string): void {
    this.popupAt(CENTER_X, GRID_Y - 30, text, color);
  }

  /** Надпись всплывает в точке (x, y): поднимается и тает. */
  popupAt(x: number, y: number, text: string, color: string): void {
    const label = addText(this.scene, x, y, text, { ...POPUP_STYLE, color })
      .setOrigin(0.5)
      .setDepth(POPUP_DEPTH);
    this.scene.tweens.add({
      targets: label,
      y: y - POPUP_RISE,
      alpha: { value: 0, delay: POPUP_FADE_DELAY, duration: POPUP_TIME - POPUP_FADE_DELAY },
      duration: POPUP_TIME,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Удар черепов: красная вспышка и лёгкая тряска экрана. */
  flashAndShake(): void {
    const camera = this.scene.cameras.main;
    camera.flashEffect.alpha = 0.5; // полупрозрачная вспышка, а не сплошной красный экран
    camera.flash(300, 239, 68, 68);
    camera.shake(250, 0.008);
  }
}

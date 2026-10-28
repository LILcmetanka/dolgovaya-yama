import Phaser from 'phaser';
import { createCrackTexture, CRACK_TEXTURE } from '../decor';
import { SCREEN, SHOT_HOLE } from '../layout';
import { POPUP_DEPTH } from '../theme';

const BROKEN_DEPTH = POPUP_DEPTH - 2; // поверх сетки, под GOOD LUCK и всплывающими надписями
const SCREEN_CORNER = 16; // скругление экрана
const DARK_ALPHA = 0.88; // экран погас: сетку почти не видно
const CRACK_START_SCALE = 0.6; // трещины разбегаются от дыры
const FLICKER_ALPHA = 0.3; // новый автомат: экран мигает, загораясь
// Искры и дымок из дыры.
const SPARKS = 9; // искр за раз
const SPARK_SIZE = 3;
const SPARK_COLORS = [0xfde047, 0xf59e0b, 0xffffff];
const SPARK_DISTANCE = { min: 18, max: 60 }; // как далеко разлетаются
const SPARK_FALL = 40; // и падают вниз
const SMOKE_RADIUS = 6;
const SMOKE_COLOR = 0x6b7280;
const SMOKE_ALPHA = 0.35;
const SMOKE_RISE = 50;
const SMOKE_SCALE = 3;
// Анимации, мс.
const FLASH_TIME = 280; // стекло вспыхивает от попадания
const CRACK_TIME = 140;
const SPARK_TIME = { min: 350, max: 650 };
const SPARK_PAUSE = { min: 1200, max: 2600 }; // пока автомат сломан, искры сыплются снова через столько
const SMOKE_TIME = 1600;
const FLICKER_TIME = 70;
const LIGHT_UP_TIME = 300; // экран загорается

/**
 * Сломанный автомат: пуля попала в экран — стекло вспыхивает, по нему дыра и трещины, экран гаснет, из дыры сыплются искры и идёт дымок.
 * Пришёл новый автомат — экран загорается, мигнув. Случайность искр — Phaser.Math.RND, не Math.random: эффекты идут сами
 * и не должны съедать очередь Math.random в проверочных сценариях.
 */
export class BrokenScreen {
  private readonly scene: Phaser.Scene;
  private readonly dark: Phaser.GameObjects.Rectangle; // погасший экран
  private readonly crack: Phaser.GameObjects.Image; // дыра и трещины
  private sparkTimer: Phaser.Time.TimerEvent | null = null; // следующие искры
  private broken = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    createCrackTexture(scene);
    this.dark = scene.add
      .rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0x000000) // прозрачность — у самого прямоугольника: она и мигает
      .setRounded(SCREEN_CORNER)
      .setDepth(BROKEN_DEPTH)
      .setVisible(false);
    this.crack = scene.add.image(SHOT_HOLE.x, SHOT_HOLE.y, CRACK_TEXTURE).setDepth(BROKEN_DEPTH).setVisible(false);
  }

  /** Сломан ли автомат. */
  isBroken(): boolean {
    return this.broken;
  }

  /** Пуля попала: стекло вспыхивает, дыра и трещины, экран гаснет, искры и дымок — и потом снова, пока не придёт новый автомат. */
  shatter(): void {
    this.broken = true;
    const flash = this.scene.add
      .rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0xffffff, 0.9)
      .setRounded(SCREEN_CORNER)
      .setDepth(BROKEN_DEPTH);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: FLASH_TIME, onComplete: () => flash.destroy() });
    this.scene.tweens.killTweensOf(this.dark);
    this.dark.setVisible(true).setAlpha(DARK_ALPHA);
    this.crack.setVisible(true).setScale(CRACK_START_SCALE);
    this.scene.tweens.add({ targets: this.crack, scale: 1, duration: CRACK_TIME, ease: 'Back.easeOut' });
    this.sparkle();
  }

  /** Искры и дымок из дыры; пока автомат сломан — следующие через случайную паузу. */
  private sparkle(): void {
    for (let index = 0; index < SPARKS; index++) this.addSpark();
    this.addSmoke();
    const pause = Phaser.Math.RND.between(SPARK_PAUSE.min, SPARK_PAUSE.max);
    this.sparkTimer = this.scene.time.delayedCall(pause, () => this.sparkle());
  }

  /** Одна искра: вылетает из дыры в случайную сторону, падает и гаснет. */
  private addSpark(): void {
    const color = Phaser.Math.RND.pick(SPARK_COLORS);
    const spark = this.scene.add.rectangle(SHOT_HOLE.x, SHOT_HOLE.y, SPARK_SIZE, SPARK_SIZE, color).setDepth(BROKEN_DEPTH);
    const angle = Phaser.Math.RND.realInRange(0, Math.PI * 2);
    const distance = Phaser.Math.RND.between(SPARK_DISTANCE.min, SPARK_DISTANCE.max);
    this.scene.tweens.add({
      targets: spark,
      x: SHOT_HOLE.x + Math.cos(angle) * distance,
      y: SHOT_HOLE.y + Math.sin(angle) * distance + SPARK_FALL,
      alpha: 0,
      duration: Phaser.Math.RND.between(SPARK_TIME.min, SPARK_TIME.max),
      ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
    });
  }

  /** Дымок: серое облачко поднимается из дыры, растёт и тает. */
  private addSmoke(): void {
    const smoke = this.scene.add.circle(SHOT_HOLE.x, SHOT_HOLE.y, SMOKE_RADIUS, SMOKE_COLOR, SMOKE_ALPHA).setDepth(BROKEN_DEPTH);
    this.scene.tweens.add({
      targets: smoke,
      y: SHOT_HOLE.y - SMOKE_RISE,
      scale: SMOKE_SCALE,
      alpha: 0,
      duration: SMOKE_TIME,
      ease: 'Sine.easeOut',
      onComplete: () => smoke.destroy(),
    });
  }

  /** Пришёл новый автомат: трещин и искр больше нет, экран загорается, мигнув. Автомат цел — ничего. */
  repair(): void {
    if (!this.broken) return;
    this.broken = false;
    this.sparkTimer?.remove();
    this.sparkTimer = null;
    this.crack.setVisible(false);
    this.scene.tweens.add({
      targets: this.dark,
      alpha: FLICKER_ALPHA,
      duration: FLICKER_TIME,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.scene.tweens.add({ targets: this.dark, alpha: 0, duration: LIGHT_UP_TIME, onComplete: () => this.dark.setVisible(false) });
      },
    });
  }
}

import Phaser from 'phaser';
import { DARKNESS } from '../layout';

// Коллектор в тени: лица не видно, только красные глаза и тонкая улыбка. Стоит там, где раньше была его рука.
const FACE_X = DARKNESS.x + 32;
const FACE_Y = 268;
const EYE_STEP = 28; // от середины лица до глаза
const EYE_WIDTH = 22;
const EYE_HEIGHT = 9;
const EYE_COLOR = 0xef4444;
const GLOW_COLOR = 0xdc2626;
const GLOW_ALPHA = 0.28;
const SMILE_RADIUS = 26;
const SMILE_Y = FACE_Y + 22; // улыбка ниже глаз
const SMILE_WIDTH = 3;
const SMILE_ALPHA = 0.85;
const FADE_TIME = 400; // из темноты проступают глаза
const BLINK_EVERY = 2800; // моргает примерно раз в 3 секунды
const BLINK_TIME = 90;

/** Красные глаза и улыбка Коллектора в тёмной комнате: проступают, моргают, гаснут. */
export class ShadowFace {
  private readonly scene: Phaser.Scene;
  private readonly parts: (Phaser.GameObjects.Ellipse | Phaser.GameObjects.Graphics)[];
  private readonly eyes: Phaser.GameObjects.Ellipse[];
  private blinkTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const glows = [-1, 1].map((side) => scene.add.ellipse(FACE_X + side * EYE_STEP, FACE_Y, EYE_WIDTH * 2, EYE_HEIGHT * 2.4, GLOW_COLOR, GLOW_ALPHA));
    this.eyes = [-1, 1].map((side) => scene.add.ellipse(FACE_X + side * EYE_STEP, FACE_Y, EYE_WIDTH, EYE_HEIGHT, EYE_COLOR));
    const smile = scene.add.graphics();
    smile.lineStyle(SMILE_WIDTH, GLOW_COLOR, SMILE_ALPHA);
    smile.beginPath();
    smile.arc(FACE_X, SMILE_Y - SMILE_RADIUS * 0.6, SMILE_RADIUS, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(150));
    smile.strokePath();
    this.parts = [...glows, ...this.eyes, smile];
    for (const part of this.parts) part.setAlpha(0); // пока Коллектор не пришёл, его не видно
  }

  /** Глаза проступают из темноты и начинают моргать. Проступили — done(). */
  show(done: () => void): void {
    this.scene.tweens.killTweensOf(this.parts);
    this.scene.tweens.add({ targets: this.parts, alpha: 1, duration: FADE_TIME, onComplete: done });
    this.blinkTimer?.remove();
    this.blinkTimer = this.scene.time.addEvent({ delay: BLINK_EVERY, loop: true, callback: () => this.blink() });
  }

  /** Глаза гаснут в темноте. */
  hide(): void {
    this.blinkTimer?.remove();
    this.blinkTimer = null;
    this.scene.tweens.killTweensOf(this.parts);
    this.scene.tweens.add({ targets: this.parts, alpha: 0, duration: FADE_TIME });
  }

  private blink(): void {
    this.scene.tweens.add({ targets: this.eyes, scaleY: 0.1, duration: BLINK_TIME, yoyo: true });
  }
}

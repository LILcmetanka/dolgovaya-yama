import Phaser from 'phaser';
import { COLLECTOR_X } from '../layout';

// Лицо Коллектора в тёмной комнате: на силуэте (decor.ts, `drawCollectorSilhouette`) светятся только красные глаза и улыбка с зубами.
const FACE_X = COLLECTOR_X;
const FACE_Y = 258; // глаза — на уровне головы силуэта
const EYE_STEP = 17; // от середины лица до глаза
const EYE_WIDTH = 17;
const EYE_HEIGHT = 6.5;
const EYE_COLOR = 0xef4444;
const GLOW_COLOR = 0xdc2626;
const GLOW_ALPHA = 0.3;
const SMILE_RADIUS = 24;
const SMILE_CENTER_Y = FACE_Y + 14; // центр дуги улыбки: она ниже глаз
const SMILE_FROM = 28; // дуга от 28° до 152° (вниз)
const SMILE_TO = 152;
const SMILE_WIDTH = 3;
const SMILE_ALPHA = 0.9;
const TEETH_ANGLES = [42, 54, 66, 78, 90, 102, 114, 126, 138]; // зубы вдоль дуги
const TEETH_COLOR = 0xe7e5d3;
const TEETH_ALPHA = 0.85;
const FRONT_DEPTH = 1; // поверх комнаты (картинка комнаты лежит на глубине 0 над автоматом)
const FADE_TIME = 400; // из темноты проступают глаза
const BLINK_EVERY = 2800; // моргает примерно раз в 3 секунды
const BLINK_TIME = 90;

/** Красные глаза и улыбка Коллектора на силуэте: проступают, моргают, гаснут. */
export class ShadowFace {
  private readonly scene: Phaser.Scene;
  private readonly parts: (Phaser.GameObjects.Ellipse | Phaser.GameObjects.Graphics)[];
  private readonly eyes: Phaser.GameObjects.Ellipse[];
  private blinkTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const glows = [-1, 1].map((side) => scene.add.ellipse(FACE_X + side * EYE_STEP, FACE_Y, EYE_WIDTH * 2.2, EYE_HEIGHT * 2.8, GLOW_COLOR, GLOW_ALPHA));
    this.eyes = [-1, 1].map((side) => scene.add.ellipse(FACE_X + side * EYE_STEP, FACE_Y, EYE_WIDTH, EYE_HEIGHT, EYE_COLOR));
    const smile = scene.add.graphics();
    smile.lineStyle(SMILE_WIDTH, GLOW_COLOR, SMILE_ALPHA);
    smile.beginPath();
    smile.arc(FACE_X, SMILE_CENTER_Y, SMILE_RADIUS, Phaser.Math.DegToRad(SMILE_FROM), Phaser.Math.DegToRad(SMILE_TO));
    smile.strokePath();
    smile.fillStyle(TEETH_COLOR, TEETH_ALPHA);
    for (const angle of TEETH_ANGLES) {
      const radians = Phaser.Math.DegToRad(angle);
      smile.fillRect(FACE_X + SMILE_RADIUS * Math.cos(radians) - 1.3, SMILE_CENTER_Y + SMILE_RADIUS * Math.sin(radians) - 1, 2.6, 4.5); // зуб под дугой
    }
    this.parts = [...glows, ...this.eyes, smile];
    for (const part of this.parts) part.setAlpha(0).setDepth(FRONT_DEPTH); // пока Коллектор не пришёл, его не видно
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

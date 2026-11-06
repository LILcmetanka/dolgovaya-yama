import Phaser from 'phaser';
import { CHIP_TEXTURE, createChipTextures, createTicketTexture, TICKET_TEXTURE } from '../decor';
import { DARKNESS, DISPLAY } from '../layout';
import { addText, LAMP_GOLD, LED_COLOR, LED_STYLE, RED_TEXT } from '../theme';

// Банкомат Коллектора: в него закидывают фишки в уплату долга, он печатает купон (тот же билет 🎟).
// Выезжает из темноты справа от комнаты на место, где раньше протягивалась рука.
const ATM_Y = 330;
const ATM_IN_X = DARKNESS.x + 360; // спрятан в темноте за правым краем вида
const ATM_OUT_X = DARKNESS.x - 38; // выехал к игроку
const BODY_WIDTH = 200;
const BODY_HEIGHT = 320;
const BODY_COLOR = 0x2b3544;
const BODY_BORDER = 0x0f172a;
const SCREEN_Y = -82; // экран с «× долг» — выше середины корпуса
const SLOT_Y = 52; // щель для фишек
const COUPON_SLOT_Y = 104; // щель, из которой выходит купон
const COUPON_OUT = 40; // купон выезжает вниз на столько px
const SLOT_GLOW_MIN = 0.35;
// Анимации, мс.
const SLIDE_TIME = 450;
const CHIPS_COUNT = 6; // сколько фишек летит в щель (для красоты: сумма может быть любой)
const CHIP_FLY_TIME = 500;
const CHIP_STAGGER = 70;
const PRINT_TIME = 450; // купон выезжает из щели
const PRINT_HOLD = 250; // и задерживается, пока вылетают билеты

/** Банкомат: корпус, экран с суммой долга, щель для фишек (светится: «бросай сюда») и принтер купона. */
export class Atm {
  private readonly scene: Phaser.Scene;
  private readonly box: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Rectangle;
  private readonly slot: Phaser.GameObjects.Rectangle;
  private readonly demand: Phaser.GameObjects.Text;

  /** pay — что делать, когда кликнули по банкомату (Enter сцена ловит сама). */
  constructor(scene: Phaser.Scene, pay: () => void) {
    this.scene = scene;
    createChipTextures(scene);
    createTicketTexture(scene);

    this.body = scene.add.rectangle(0, 0, BODY_WIDTH, BODY_HEIGHT, BODY_COLOR).setStrokeStyle(4, BODY_BORDER).setRounded(14);
    this.body.setInteractive({ useHandCursor: true });
    this.body.on('pointerdown', pay);
    const topLamp = scene.add.rectangle(0, -BODY_HEIGHT / 2 + 24, 120, 14, 0x16a34a).setRounded(7);
    const screenFrame = scene.add.rectangle(0, SCREEN_Y, 160, 70, 0x000000).setStrokeStyle(3, 0x475569).setRounded(8);
    const chip = scene.add.image(-52, SCREEN_Y, CHIP_TEXTURE).setScale(0.9);
    this.demand = addText(scene, -30, SCREEN_Y, '', { ...LED_STYLE, fontSize: '30px' }).setOrigin(0, 0.5);
    this.slot = scene.add.rectangle(0, SLOT_Y, 124, 16, 0x000000).setStrokeStyle(3, LAMP_GOLD).setRounded(6);
    const couponSlot = scene.add.rectangle(0, COUPON_SLOT_Y, 110, 10, 0x000000).setStrokeStyle(2, 0x475569).setRounded(4);
    const keys: Phaser.GameObjects.Rectangle[] = []; // кнопки: просто для вида
    for (let index = 0; index < 6; index++) {
      const x = ((index % 3) - 1) * 40;
      const y = -22 + Math.floor(index / 3) * 24;
      keys.push(scene.add.rectangle(x, y, 28, 16, 0x1e293b).setStrokeStyle(2, 0x475569).setRounded(4));
    }
    this.box = scene.add.container(ATM_IN_X, ATM_Y, [this.body, topLamp, screenFrame, chip, this.demand, ...keys, this.slot, couponSlot]);
  }

  /** Выехать из темноты: на экране «× долг» (красный — не хватает), щель светится. Выехал — ready(). */
  slideIn(debt: number, isEnough: boolean, ready: () => void): void {
    this.demand.setText(`${debt}`).setColor(isEnough ? LED_COLOR : RED_TEXT);
    this.scene.tweens.add({ targets: this.box, x: ATM_OUT_X, duration: SLIDE_TIME, ease: 'Cubic.easeOut', onComplete: ready });
    this.glowSlot();
  }

  /** Уехать обратно в темноту — потом done(). */
  slideOut(done: () => void): void {
    this.scene.tweens.killTweensOf(this.slot);
    this.slot.setAlpha(1);
    this.scene.tweens.add({ targets: this.box, x: ATM_IN_X, duration: SLIDE_TIME, ease: 'Cubic.easeIn', onComplete: done });
  }

  /** Спрятать мгновенно (конец забега, перезапуск вида). */
  hide(): void {
    this.scene.tweens.killTweensOf([this.box, this.slot]);
    this.slot.setAlpha(1);
    this.box.setX(ATM_IN_X);
  }

  /** Где щель для фишек — в мире: туда летят фишки с табло. */
  slotPosition(): { x: number; y: number } {
    return { x: this.box.x, y: this.box.y + SLOT_Y };
  }

  /**
   * Фишки летят с табло в щель, потом банкомат печатает купон: paid(x, y) — с места щели купона
   * (оттуда сцена пускает билеты). Всё — потом done().
   */
  swallowAndPrint(paid: (x: number, y: number) => void, done: () => void): void {
    const slot = this.slotPosition();
    for (let index = 0; index < CHIPS_COUNT; index++) {
      const chip = this.scene.add.image(DISPLAY.x, DISPLAY.y, CHIP_TEXTURE).setScale(1.3);
      this.scene.tweens.add({
        targets: chip,
        x: slot.x,
        y: slot.y,
        scale: 0.6,
        delay: index * CHIP_STAGGER,
        duration: CHIP_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => chip.destroy(),
      });
    }
    this.scene.time.delayedCall(CHIPS_COUNT * CHIP_STAGGER + CHIP_FLY_TIME, () => {
      this.scene.tweens.add({ targets: this.box, scale: 1.03, duration: 100, yoyo: true }); // дрогнул: проглотил фишки
      this.printCoupon(paid, done);
    });
  }

  /** Купон выезжает из щели вниз; когда он вышел — paid(x, y), потом он тает. */
  private printCoupon(paid: (x: number, y: number) => void, done: () => void): void {
    const x = this.box.x;
    const y = this.box.y + COUPON_SLOT_Y;
    const coupon = this.scene.add.image(x, y, TICKET_TEXTURE).setScale(0.9).setAlpha(0);
    this.scene.tweens.add({
      targets: coupon,
      y: y + COUPON_OUT,
      alpha: 1,
      duration: PRINT_TIME,
      ease: 'Sine.easeOut',
      onComplete: () => {
        paid(x, y + COUPON_OUT);
        this.scene.tweens.add({ targets: coupon, alpha: 0, delay: PRINT_HOLD, duration: 200, onComplete: () => coupon.destroy() });
        this.scene.time.delayedCall(PRINT_HOLD, done);
      },
    });
  }

  /** Щель мигает золотым: «бросай сюда». */
  private glowSlot(): void {
    this.scene.tweens.add({ targets: this.slot, alpha: SLOT_GLOW_MIN, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
}

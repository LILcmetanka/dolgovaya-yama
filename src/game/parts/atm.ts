import Phaser from 'phaser';
import { CHIP_TEXTURE, createChipTextures, createTicketTexture, TICKET_TEXTURE } from '../decor';
import { DISPLAY, VIEW_WIDTH } from '../layout';
import { addText, LED_COLOR, LED_STYLE, RED_TEXT } from '../theme';
import { fitBoardNumber } from './panel';

// Банкомат Коллектора: в него закидывают фишки в уплату долга, он печатает купон (тот же билет 🎟).
// Выезжает справа от автомата, камера не поворачивается: встаёт перед телевизором, правее рычага.
const ATM_Y = 330;
const ATM_IN_X = VIEW_WIDTH + 120; // спрятан за правым краем вида
const ATM_OUT_X = 1024; // выехал к игроку — перед телевизором
const BODY_WIDTH = 200;
const BODY_HEIGHT = 320;
const BODY_COLOR = 0x2b3544;
const BODY_BORDER = 0x0f172a;
const SCREEN_Y = -82; // экран с «× долг» — выше середины корпуса
const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 84; // выше прежнего: над числом теперь стоит значок фишки
const DEMAND_Y = SCREEN_Y + 16; // число — по центру нижней части экрана, под фишкой
const DEMAND_MAX_WIDTH = 136; // шире число не бывает: дальше шрифт уменьшается (fitBoardNumber)
const CHIP_Y = SCREEN_Y - 24; // фишка над числом
const CHIP_SCALE = 0.62;
const GOOD_LUCK_FONT = '24px'; // GOOD LUCK — по центру экрана, крупнее прежнего
// Монетоприёмник: вертикальная накладка справа на корпусе, в её щель летят фишки. Щель — вровень с блоком
// псевдокнопок и длиной с него (два ряда): приёмник больше не торчит ниже кнопок.
const COIN_SLOT_DX = 58; // от середины банкомата
const COIN_SLOT_DY = -10; // середина блока псевдокнопок (ряды -22 и +2)
const COIN_BODY = { width: 36, height: 56 }; // корпус приёмника
const COIN_SLIT = { width: 16, height: 40 }; // внутренняя щель — как весь блок кнопок
const COIN_BOLT_DX = 11; // болты — по углам накладки рядом со щелью…
const COIN_BOLT_DY = 23;
const COIN_BOLT_RADIUS = 2.5;
const COIN_LED_RADIUS = 3; // …светодиод — под щелью
const CHROME = 0x5b6675; // металл приёмника ближе к корпусу: не выбивается из банкомата
const CHROME_DARK = 0x334155;
const COUPON_SLOT_Y = 104; // щель, из которой выходит купон
const COUPON_OUT = 40; // купон выезжает вниз на столько px
// Анимации, мс.
const SLIDE_TIME = 450;
const CHIPS_COUNT = 6; // сколько фишек летит в щель (для красоты: сумма может быть любой)
const CHIP_FLY_TIME = 500;
const CHIP_STAGGER = 70;
const PRINT_TIME = 450; // купон выезжает из щели
const PRINT_HOLD = 250; // и задерживается, пока вылетают билеты

/** Банкомат: корпус, экран с суммой долга, монетоприёмник с тёмной щелью (вровень с кнопками) и принтер купона. */
export class Atm {
  private readonly scene: Phaser.Scene;
  private readonly box: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Rectangle;
  private readonly demand: Phaser.GameObjects.Text;
  private readonly chip: Phaser.GameObjects.Image; // фишка над суммой на экране

  /** pay — что делать, когда кликнули по банкомату (Enter сцена ловит сама). */
  constructor(scene: Phaser.Scene, pay: () => void) {
    this.scene = scene;
    createChipTextures(scene);
    createTicketTexture(scene);

    this.body = scene.add.rectangle(0, 0, BODY_WIDTH, BODY_HEIGHT, BODY_COLOR).setStrokeStyle(4, BODY_BORDER).setRounded(14);
    this.body.setInteractive({ useHandCursor: true });
    this.body.on('pointerdown', pay);
    const topLamp = scene.add.rectangle(0, -BODY_HEIGHT / 2 + 24, 120, 14, 0x16a34a).setRounded(7);

    // Экран: фишка сверху, число под ней — по центру, длинное число мельче (fitBoardNumber).
    const screenFrame = scene.add.rectangle(0, SCREEN_Y, SCREEN_WIDTH, SCREEN_HEIGHT, 0x000000).setStrokeStyle(3, 0x475569).setRounded(8);
    this.chip = scene.add.image(0, CHIP_Y, CHIP_TEXTURE).setScale(CHIP_SCALE);
    this.demand = addText(scene, 0, DEMAND_Y, '', { ...LED_STYLE, fontSize: '30px' }).setOrigin(0.5, 0.5);

    const keys: Phaser.GameObjects.Rectangle[] = []; // кнопки: просто для вида, приёмник их не задевает
    for (let index = 0; index < 6; index++) {
      const x = ((index % 3) - 1.5) * 36;
      const y = -22 + Math.floor(index / 3) * 24;
      keys.push(scene.add.rectangle(x, y, 28, 16, 0x1e293b).setStrokeStyle(2, 0x475569).setRounded(4));
    }

    // Монетоприёмник: хромированная накладка, вертикальная щель, два болта и светодиод.
    const coinPlate = scene.add
      .rectangle(COIN_SLOT_DX, COIN_SLOT_DY, COIN_BODY.width, COIN_BODY.height, CHROME)
      .setStrokeStyle(3, CHROME_DARK)
      .setRounded(7);
    // Щель не светится: приёмник читается тёмным провалом, горит только маленький светодиод.
    const slot = scene.add
      .rectangle(COIN_SLOT_DX, COIN_SLOT_DY, COIN_SLIT.width, COIN_SLIT.height, 0x000000)
      .setStrokeStyle(3, CHROME_DARK)
      .setRounded(8);
    const bolts = [-1, 1].map((side) => scene.add.circle(COIN_SLOT_DX + side * COIN_BOLT_DX, COIN_SLOT_DY - COIN_BOLT_DY, COIN_BOLT_RADIUS, 0x94a3b8));
    const led = scene.add.circle(COIN_SLOT_DX, COIN_SLOT_DY + COIN_BOLT_DY, COIN_LED_RADIUS, 0x22d3ee);
    const couponSlot = scene.add.rectangle(0, COUPON_SLOT_Y, 110, 10, 0x000000).setStrokeStyle(2, 0x475569).setRounded(4);

    this.box = scene.add.container(ATM_IN_X, ATM_Y, [
      this.body, topLamp, screenFrame, this.chip, this.demand, ...keys, coinPlate, slot, ...bolts, led, couponSlot,
    ]);
    this.box.setVisible(false);
  }

  /**
   * Выехать: хватает фишек — на экране долг, щель светится; не хватает — на экране красное мигающее GOOD LUCK.
   * Выехал — ready(); после GOOD LUCK сцена начинает последний шанс (CollectorScene).
   */
  slideIn(debt: number, isEnough: boolean, ready: () => void): void {
    this.scene.tweens.killTweensOf(this.demand);
    this.box.setVisible(true);
    this.demand.setAlpha(1);
    this.demand.setOrigin(0.5, 0.5); // и число, и GOOD LUCK — по центру экрана
    if (isEnough) {
      this.chip.setVisible(true);
      this.demand.setPosition(0, DEMAND_Y).setColor(LED_COLOR);
      fitBoardNumber(this.demand, debt, DEMAND_MAX_WIDTH); // длинное число мельче — за экран не вылезает
    } else {
      this.chip.setVisible(false);
      this.demand.setPosition(0, SCREEN_Y).setFontSize(GOOD_LUCK_FONT).setText('GOOD LUCK').setColor(RED_TEXT);
      this.scene.tweens.add({ targets: this.demand, alpha: 0.3, duration: 500, yoyo: true, repeat: -1 });
    }
    this.scene.tweens.add({ targets: this.box, x: ATM_OUT_X, duration: SLIDE_TIME, ease: 'Cubic.easeOut', onComplete: ready });
  }

  /** Уехать обратно в темноту — потом done(). */
  slideOut(done: () => void): void {
    this.scene.tweens.killTweensOf(this.demand);
    this.scene.tweens.add({
      targets: this.box,
      x: ATM_IN_X,
      duration: SLIDE_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.box.setVisible(false); // «за краем» — внутри вида: спрятанный банкомат не должен торчать на экране
        done();
      },
    });
  }

  /** Спрятать мгновенно (конец забега). */
  hide(): void {
    this.scene.tweens.killTweensOf([this.box, this.demand]);
    this.box.setX(ATM_IN_X).setVisible(false);
  }

  /** Где щель монетоприёмника — в мире: туда летят фишки с табло. */
  slotPosition(): { x: number; y: number } {
    return { x: this.box.x + COIN_SLOT_DX, y: this.box.y + COIN_SLOT_DY };
  }

  /** Банкомат выехал к игроку или ещё едет (виден и не спрятан за правым краем). */
  get isOut(): boolean {
    return this.box.visible && this.box.x < ATM_IN_X;
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
  private printCoupon(paid: (x: number, y: number) => void, done: () => void): void {    const x = this.box.x;
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
}

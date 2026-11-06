import Phaser from 'phaser';
import {
  CRATE_TEXTURE,
  createCrateTexture,
  createRewindTextures,
  createTapeTextures,
  createTicketTexture,
  createVcrTexture,
  PLAY_SIGN_TEXTURE,
  REEL_TEXTURE,
  REWIND_SIGN_TEXTURE,
  TAPE_REEL_DX,
  TAPE_REEL_DY,
  TAPE_SIZE,
  TAPE_TEXTURE,
  TICKET_TEXTURE,
  VCR_REC_LAMP,
  VCR_SLOT_DX,
  VCR_TEXTURE,
  VCR_WINDOW,
} from '../decor';
import { t } from '../lang';
import { BOARD_TICKET_X, DISPLAY, SAVE_TAPE, VCR, VCR_CRATE, VIEW_HEIGHT, VIEW_WIDTH } from '../layout';
import { addText, CHIP_DEPTH, LAMP_GOLD, LED_COLOR, LED_STYLE, RED_TEXT, TOOLTIP_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Кассета на стене магазина.
const PRICE_Y = SAVE_TAPE.y + 38; // ценник «билет × 2» — под кассетой
const PRICE_ICON_SCALE = 0.6;
const TICKETS_FLYING = 3; // купили: столько билетов летит с табло в кассету (для красоты: цена может быть любой)
// Видеомагнитофон: купленная кассета стоит на нём над щелью.
const TAPE_Y = VCR.y - VCR.height / 2 - TAPE_SIZE.height / 2 + 1;
const REC_X = VCR.x + VCR_SLOT_DX; // чистая кассета стоит над щелью REC…
const PLAY_X = VCR.x + VCR_WINDOW.dx; // …записанная — над окошком PLAY
const TAPE_ON_VCR = { x: REC_X, y: TAPE_Y };
const GLOW_PAD = 7; // свечение кассеты, которую можно вставить, шире её на столько с каждой стороны
const GLOW_MIN = 0.4; // свечение пульсирует: гаснет до такой яркости и разгорается снова
const REC_ON = 0xef4444; // лампочка записи горит
const REC_OFF = 0x3f0a0a;
const REC_RADIUS = 2.5;
const WINDOW_SIGN_SCALE = 0.32; // «◀◀» в окошке видеомагнитофона
const WINDOW_SIGN_TINT = 0xf59e0b; // янтарное, как цифры табло
const PLAY_MARK_TINT = 0x71717a; // тусклое «▶» в окошке PLAY, пока кассета не вставлена
const PLAY_MARK_ALPHA = 0.6;
const INSERT_DROP = 30; // вставленная кассета уходит вниз, в видеомагнитофон, на столько
// Перемотка: поверх всего вида — «◀◀» (после отката — «▶») в левом верхнем углу, как на экране видеомагнитофона, и полосы помех.
const REWIND_DEPTH = TOOLTIP_DEPTH - 1; // над игрой и GOOD LUCK, под подсказкой
const SIGN_POSITION = { x: 64, y: 54 }; // в координатах вида
const NOISE_BARS = 5;
const NOISE_MIN_HEIGHT = 4;
const NOISE_MAX_HEIGHT = 26;
const NOISE_ALPHA = 0.18;
const REWIND_SHAKE = 0.004; // вид мелко трясётся, пока плёнка перематывается
// Анимации, мс.
const PAY_FLY_TIME = 450; // билеты летят с табло в кассету
const PAY_STAGGER = 90;
const LEAVE_TIME = 500; // купленная кассета уезжает к видеомагнитофону
const REC_BLINK_TIME = 250; // запись: лампочка мигает
const REC_BLINKS = 4;
const REEL_TURN_TIME = 700; // катушка делает оборот
const GLOW_TIME = 600;
const SHAKE_TIME = 50; // один рывок тряски
const INSERT_TIME = 450; // кассета уходит в видеомагнитофон
const MOVE_DELAY = 1400; // записали: кассета переезжает из REC в PLAY, когда докрутятся катушки
const MOVE_TIME = 400;
const RIBBON_WIDTH = 3; // плёнка, которую жуёт автомат
const RIBBON_LENGTH = 46;
const RIBBON_COLOR = 0x1c1917;
const RIBBON_STRETCH_TIME = 1000; // лента вылезает…
const RIBBON_SNAP_TIME = 500; // …рвётся, обрывки падают
const REWIND_TIME = 1700; // плёнка перематывается
const FADE_TIME = 400; // вид гаснет перед откатом и загорается после
const SIGN_BLINK_TIME = 350;
const NOISE_PASS_TIME = 500; // полоса помех проходит вид сверху вниз
const PLAY_TIME = 1600; // после отката «▶» горит столько, потом тает

/**
 * Кассета (шаг 45). В магазине она висит на стене над кнопкой «назад», под ней цена в билетах:
 * клик (или 9 — её ловит сцена) — купить, при наведении — подсказка. Купили — кассета уезжает к видеомагнитофону
 * (он стоит на ящике у монитора) и ложится в отделение REC (слева). Клик (или 9) — она записывает забег: мигает лампочка записи,
 * катушки крутятся, кассета переезжает в отделение PLAY (справа). Записанная светится, когда её можно вставить: клик (или 9) —
 * она уходит в видеомагнитофон, поверх вида — «◀◀» и полосы помех, автомат жуёт плёнку, и она рвётся; вид гаснет — тут сцена
 * перезапускается с записью, а потом показывает «▶». Когда что можно, решает сцена.
 */
export class Cassette {
  private readonly scene: Phaser.Scene;
  private readonly shopTape: Phaser.GameObjects.Image[]; // кассета на стене магазина и её катушки
  private readonly priceIcon: Phaser.GameObjects.Image; // ценник: билет…
  private readonly priceText: Phaser.GameObjects.Text; // …и «× 2»
  private readonly glow: Phaser.GameObjects.Rectangle; // свечение кассеты на видеомагнитофоне: её можно вставить
  private readonly vcrTape: Phaser.GameObjects.Image; // кассета на видеомагнитофоне — по ней кликают
  private readonly vcrReels: Phaser.GameObjects.Image[]; // её катушки
  private readonly recLamp: Phaser.GameObjects.Arc; // лампочка записи
  private readonly windowSign: Phaser.GameObjects.Image; // «◀◀» в окошке видеомагнитофона
  private readonly playMark: Phaser.GameObjects.Image; // тусклое «▶» в окошке PLAY
  private isOnVcr = false; // кассета лежит на видеомагнитофоне
  private isRecorded = false; // она записана: стоит над окошком PLAY
  private isMoving = false; // записанная кассета переезжает из REC в PLAY
  private isUsable = false; // кассетой можно воспользоваться (записать или вставить) — она светится
  private wantsUsable = false; // что просила сцена, пока кассета переезжала

  /** isForSale — кассету сейчас продают (после отката её съел автомат — снова продают); buy — кликнули по ней в магазине, use — по видеомагнитофону с ней. */
  constructor(scene: Phaser.Scene, isForSale: boolean, buy: () => void, use: () => void, hint: Hint) {
    this.scene = scene;
    createTapeTextures(scene);
    createTicketTexture(scene);
    createVcrTexture(scene, VCR.width, VCR.height);
    createCrateTexture(scene, VCR_CRATE.width, VCR_CRATE.height);
    createRewindTextures(scene);

    // Кассета на стене магазина, под ней ценник.
    const tape = scene.add.image(SAVE_TAPE.x, SAVE_TAPE.y, TAPE_TEXTURE);
    tape.setInteractive({ useHandCursor: true });
    attachHint(tape, hint, () => [t('tape'), t('tapeWhat')], buy);
    this.shopTape = [tape, ...this.addReels(SAVE_TAPE.x, SAVE_TAPE.y)];
    this.priceIcon = scene.add.image(SAVE_TAPE.x - 18, PRICE_Y, TICKET_TEXTURE).setScale(PRICE_ICON_SCALE);
    this.priceText = addText(scene, SAVE_TAPE.x - 6, PRICE_Y, '', { ...LED_STYLE, fontSize: '16px' }).setOrigin(0, 0.5);
    if (!isForSale) this.hideShopTape();

    // Ящик и видеомагнитофон на нём. Кассета создаётся раньше корпуса: вставленная, она уходит за его лицевую панель.
    scene.add.image(VCR_CRATE.x, VCR_CRATE.y, CRATE_TEXTURE);
    this.glow = scene.add
      .rectangle(TAPE_ON_VCR.x, TAPE_ON_VCR.y, TAPE_SIZE.width + 2 * GLOW_PAD, TAPE_SIZE.height + 2 * GLOW_PAD, LAMP_GOLD, 0.35)
      .setRounded(8)
      .setStrokeStyle(2, LAMP_GOLD)
      .setVisible(false);
    this.vcrTape = scene.add.image(TAPE_ON_VCR.x, TAPE_ON_VCR.y, TAPE_TEXTURE).setVisible(false);
    this.vcrTape.setInteractive({ useHandCursor: true });
    attachHint(this.vcrTape, hint, () => [t('tape'), this.tapeText()], use);
    this.vcrReels = this.addReels(TAPE_ON_VCR.x, TAPE_ON_VCR.y).map((reel) => reel.setVisible(false));
    const vcr = scene.add.image(VCR.x, VCR.y, VCR_TEXTURE).setInteractive();
    attachHint(vcr, hint, () => [t('vcr'), this.vcrText()], use);
    this.recLamp = scene.add.circle(VCR.x + VCR_REC_LAMP.dx, VCR.y + VCR_REC_LAMP.dy, REC_RADIUS, REC_OFF);
    this.windowSign = scene.add
      .image(VCR.x + VCR_WINDOW.dx, VCR.y + VCR_WINDOW.dy, REWIND_SIGN_TEXTURE)
      .setScale(WINDOW_SIGN_SCALE)
      .setTint(WINDOW_SIGN_TINT)
      .setVisible(false);
    this.playMark = scene.add
      .image(VCR.x + VCR_WINDOW.dx, VCR.y + VCR_WINDOW.dy, PLAY_SIGN_TEXTURE)
      .setScale(WINDOW_SIGN_SCALE)
      .setTint(PLAY_MARK_TINT)
      .setAlpha(PLAY_MARK_ALPHA);
  }

  /** Две катушки в окошке кассеты с серединой (x, y). */
  private addReels(x: number, y: number): Phaser.GameObjects.Image[] {
    return [-1, 1].map((side) => this.scene.add.image(x + side * TAPE_REEL_DX, y + TAPE_REEL_DY, REEL_TEXTURE));
  }

  /** Подсказка кассеты на видеомагнитофоне: чистая — запиши, записанная — вернись к записи. */
  private tapeText(): string {
    return t(this.isRecorded ? 'tapeRecorded' : 'tapeBlank');
  }

  /** Подсказка видеомагнитофона: на нём кассета — что она делает; пусто — где её взять. */
  private vcrText(): string {
    return this.isOnVcr ? this.tapeText() : t('vcrWhat');
  }

  /** Где кассета стоит сейчас: над щелью REC или над окошком PLAY. */
  private get tapeX(): number {
    return this.isRecorded ? PLAY_X : REC_X;
  }

  // ---------- В магазине ----------

  /** Цена кассеты в билетах; не хватает билетов — красная. */
  showPrice(price: number, canAfford: boolean): void {
    this.priceText.setText(`× ${price}`).setColor(canAfford ? LED_COLOR : RED_TEXT);
  }

  /** Не хватает билетов — ценник трясётся. */
  deny(): void {
    this.shake([this.priceText], [SAVE_TAPE.x - 6]);
  }

  /** Кассету купили: билеты летят с табло в неё, она уезжает вправо — к видеомагнитофону у монитора — и ложится на него. */
  sell(): void {
    const [tape] = this.shopTape;
    for (let index = 0; index < TICKETS_FLYING; index++) {
      const ticket = this.scene.add.image(BOARD_TICKET_X, DISPLAY.y, TICKET_TEXTURE).setDepth(CHIP_DEPTH);
      this.scene.tweens.add({
        targets: ticket,
        x: tape.x,
        y: tape.y,
        scale: 0.5,
        delay: index * PAY_STAGGER,
        duration: PAY_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => ticket.destroy(),
      });
    }
    tape.disableInteractive();
    for (const part of [this.priceIcon, this.priceText]) part.setVisible(false);
    this.scene.tweens.add({
      targets: this.shopTape,
      x: `+=${VIEW_WIDTH}`, // за край вида — туда, где стоит видеомагнитофон
      alpha: 0,
      delay: TICKETS_FLYING * PAY_STAGGER + PAY_FLY_TIME,
      duration: LEAVE_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => this.hideShopTape(),
    });
    this.isOnVcr = true;
    for (const part of [this.vcrTape, ...this.vcrReels]) part.setVisible(true);
  }

  /** Кассеты в магазине больше нет: куплена или уже израсходована. */
  private hideShopTape(): void {
    this.shopTape[0].disableInteractive();
    for (const part of [...this.shopTape, this.priceIcon, this.priceText]) part.setVisible(false);
  }

  // ---------- Видеомагнитофон ----------

  /** Кассета записывает забег: лампочка записи мигает, катушки крутятся, потом она переезжает из REC в PLAY. */
  record(): void {
    this.isRecorded = true;
    this.isMoving = true;
    this.showUsable(false); // пока кассета переезжает, не светится
    this.scene.tweens.add({ targets: this.vcrReels, angle: 360, duration: REEL_TURN_TIME, repeat: 1 });
    this.recLamp.setFillStyle(REC_ON);
    this.scene.tweens.add({
      targets: this.recLamp,
      alpha: 0.2,
      duration: REC_BLINK_TIME,
      yoyo: true,
      repeat: REC_BLINKS - 1,
      onComplete: () => this.recLamp.setFillStyle(REC_OFF).setAlpha(1),
    });
    this.scene.tweens.add({
      targets: [this.vcrTape, ...this.vcrReels],
      x: `+=${PLAY_X - REC_X}`,
      delay: MOVE_DELAY,
      duration: MOVE_TIME,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        this.isMoving = false;
        this.showUsable(this.wantsUsable);
      },
    });
  }

  /** Можно ли воспользоваться кассетой (записать или вставить): да — она светится (свечение пульсирует); нет — свечение гаснет. */
  showUsable(isUsable: boolean): void {
    this.wantsUsable = isUsable;
    if (this.isMoving && isUsable) return; // дождёмся, пока кассета доедет
    if (isUsable === this.isUsable) return;
    this.isUsable = isUsable;
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.setX(this.tapeX).setVisible(isUsable).setAlpha(1);
    if (!isUsable) return;
    this.scene.tweens.add({ targets: this.glow, alpha: GLOW_MIN, duration: GLOW_TIME, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** Сейчас нельзя ни записать, ни вставить (идёт прокрутка, рулетка…) — кассета трясётся. */
  denyUse(): void {
    if (this.isMoving) return;
    this.shake([this.vcrTape, ...this.vcrReels], [this.tapeX, this.tapeX - TAPE_REEL_DX, this.tapeX + TAPE_REEL_DX]);
  }

  /**
   * Кассету вставили: она уходит в видеомагнитофон, в его окошке и в углу вида — «◀◀», по виду бегут полосы помех,
   * вид трясётся и гаснет — тогда done(): сцена перезапускается с записью.
   */
  rewind(done: () => void): void {
    this.isMoving = false;
    this.showUsable(false);
    this.isOnVcr = false;
    const tape = [this.vcrTape, ...this.vcrReels];
    this.scene.tweens.killTweensOf(tape);
    this.scene.tweens.add({ targets: this.vcrReels, angle: -360, duration: REEL_TURN_TIME, repeat: -1 });
    this.scene.tweens.add({ targets: tape, y: `+=${INSERT_DROP}`, alpha: 0, duration: INSERT_TIME, ease: 'Quad.easeIn' });
    this.scene.time.delayedCall(INSERT_TIME, () => this.playBackwards(done));
  }

  /** Плёнка перематывается: «◀◀» мигает в окошке и в углу вида, полосы помех, тряска; потом вид гаснет — done(). */
  private playBackwards(done: () => void): void {
    const sign = this.addScreenSign(REWIND_SIGN_TEXTURE);
    this.playMark.setVisible(false);
    this.windowSign.setVisible(true);
    this.eatTape();
    this.scene.tweens.add({ targets: [sign, this.windowSign], alpha: 0.3, duration: SIGN_BLINK_TIME, yoyo: true, repeat: -1 });
    this.addNoise();
    const camera = this.scene.cameras.main;
    camera.shake(REWIND_TIME, REWIND_SHAKE);
    this.scene.time.delayedCall(REWIND_TIME, () => {
      camera.fadeOut(FADE_TIME, 0, 0, 0);
      camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, done);
    });
  }

  /** Автомат жуёт плёнку: из щели PLAY вылезает лента, натягивается и рвётся — обрывки падают. */
  private eatTape(): void {
    const x = VCR.x + VCR_WINDOW.dx;
    const y = VCR.y + VCR.height / 2;
    const ribbon = this.scene.add.rectangle(x, y, RIBBON_WIDTH, RIBBON_LENGTH, RIBBON_COLOR).setOrigin(0.5, 0).setScale(1, 0.05);
    this.scene.tweens.add({
      targets: ribbon,
      scaleY: 1,
      angle: { from: -4, to: 4 },
      duration: RIBBON_STRETCH_TIME,
      ease: 'Sine.easeOut',
      onComplete: () => {
        ribbon.destroy();
        for (const side of [-1, 1]) {
          const piece = this.scene.add.rectangle(x, y + RIBBON_LENGTH / 2, RIBBON_WIDTH, RIBBON_LENGTH / 2, RIBBON_COLOR);
          this.scene.tweens.add({
            targets: piece,
            x: x + side * 14,
            y: y + RIBBON_LENGTH + 24,
            angle: side * 70,
            alpha: 0,
            duration: RIBBON_SNAP_TIME,
            ease: 'Quad.easeIn',
            onComplete: () => piece.destroy(),
          });
        }
      },
    });
  }

  /** После отката: вид загорается, в углу — «▶», полосы помех; через PLAY_TIME всё это тает. */
  showPlay(): void {
    this.scene.cameras.main.fadeIn(FADE_TIME, 0, 0, 0);
    const parts = [this.addScreenSign(PLAY_SIGN_TEXTURE), ...this.addNoise()];
    this.scene.tweens.add({
      targets: parts,
      alpha: 0,
      delay: PLAY_TIME,
      duration: FADE_TIME,
      onComplete: () => {
        this.scene.tweens.killTweensOf(parts);
        for (const part of parts) part.destroy();
      },
    });
  }

  /** Знак видеомагнитофона («◀◀» или «▶») в левом верхнем углу вида — приклеен к экрану. */
  private addScreenSign(texture: string): Phaser.GameObjects.Image {
    return this.scene.add.image(SIGN_POSITION.x, SIGN_POSITION.y, texture).setScrollFactor(0).setDepth(REWIND_DEPTH);
  }

  /** Полосы помех поперёк вида: каждая снова и снова проходит его сверху вниз. Случайность — Phaser.Math.RND, не Math.random. */
  private addNoise(): Phaser.GameObjects.Rectangle[] {
    const rnd = Phaser.Math.RND;
    const bars: Phaser.GameObjects.Rectangle[] = [];
    for (let index = 0; index < NOISE_BARS; index++) {
      const height = rnd.between(NOISE_MIN_HEIGHT, NOISE_MAX_HEIGHT);
      const alpha = NOISE_ALPHA * rnd.realInRange(0.5, 1.5);
      const bar = this.scene.add.rectangle(VIEW_WIDTH / 2, rnd.between(0, VIEW_HEIGHT), VIEW_WIDTH, height, 0xffffff, alpha);
      bar.setScrollFactor(0).setDepth(REWIND_DEPTH);
      this.scene.tweens.add({
        targets: bar,
        y: { from: -height, to: VIEW_HEIGHT + height },
        delay: rnd.between(0, NOISE_PASS_TIME),
        duration: NOISE_PASS_TIME * rnd.realInRange(0.6, 1.6),
        repeat: -1,
      });
      bars.push(bar);
    }
    return bars;
  }

  /** Тряска «нельзя»: вещи дёргаются вбок и возвращаются на свои места homes (x). */
  private shake(parts: (Phaser.GameObjects.Image | Phaser.GameObjects.Text)[], homes: number[]): void {
    this.scene.tweens.killTweensOf(parts);
    parts.forEach((part, index) => part.setX(homes[index]));
    this.scene.tweens.add({
      targets: parts,
      x: '+=6',
      duration: SHAKE_TIME,
      yoyo: true,
      repeat: 2,
      onComplete: () => parts.forEach((part, index) => part.setX(homes[index])),
    });
  }
}

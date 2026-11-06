import Phaser from 'phaser';
import {
  CHIP_TEXTURE,
  createChipTextures,
  createHandTextures,
  createNoteGlowTexture,
  drawNoteTexture,
  HAND_FIST_TEXTURE,
  HAND_OPEN_TEXTURE,
  NOTE_GLOW_TEXTURE,
  NOTE_TEXTURE,
} from '../decor';
import { t } from '../lang';
import { Atm } from './atm';
import { ShadowFace } from './shadowFace';
import { CENTER_X, CENTER_Y, DARKNESS, DISPLAY, HOME_SCROLL, NOTE, NOTE_ANGLE, SCREEN, TURN_SCROLL, VIEW_WIDTH } from '../layout';
import { addText, GAME_OVER_DEPTH, GOLD_TEXT, LED_STYLE, POPUP_DEPTH, pulse, RED_TEXT } from '../theme';

// Записка светится, когда долг можно отдать раньше: клик по ней или D.
const NOTE_GLOW_MIN = 0.3; // свечение пульсирует: гаснет до такой яркости и разгорается снова
const NOTE_GLOW_TIME = 700; // мс
// Коллектор в темноте справа от комнаты: лица не видно, только глаза; рука появляется, когда он берёт оружие или принимает амулет.
const HAND_Y = 330;
const HAND_IN_X = DARKNESS.x + 360; // рука спрятана в темноте за правым краем вида
const HAND_OUT_X = DARKNESS.x - 30; // рука протянута к игроку
const HAND_PALM_X = HAND_OUT_X - 58; // ладонь протянутой руки — сюда летят фишки
const HAND_PALM_Y = HAND_Y - 22;
const ATM_LEAVE_TIME = 450; // банкомат уезжает в темноту, потом вид возвращается (то же время, что SLIDE_TIME в atm.ts)
const PAYMENT_CHIPS = 6; // сколько фишек летит в ладонь при расплате (для красоты: сумма может быть любой)
// Надписи на чёрном экране автомата: GOOD LUCK — фишек не хватило, дальше игра с Коллектором; DEATH — конец забега.
const SCREEN_TITLE_STYLE = { ...LED_STYLE, fontSize: '64px', color: RED_TEXT, shadow: { color: '#ef4444', blur: 18, fill: true } };
const GOOD_LUCK_DEPTH = POPUP_DEPTH - 1; // GOOD LUCK — над сеткой, под всплывающими надписями
const HIT_COLOR = 0x991b1b; // Коллектор ранен: красная вспышка в темноте
const HIT_ALPHA = 0.6;
// Взрыв автомата (KABOOM): вспышка и огненные шары из экрана.
const EXPLOSION_BALLS = 18;
const EXPLOSION_COLORS = [0xfde047, 0xf97316, 0xdc2626, 0xffffff];
const EXPLOSION_MIN_DISTANCE = 140;
const EXPLOSION_MAX_DISTANCE = 380;
const EXPLOSION_MIN_TIME = 500;
const EXPLOSION_MAX_TIME = 950;
const EXPLOSION_FLASH_TIME = 700;
// Экран DEATH: счёт и кнопка «ЗАНОВО» под экраном автомата.
const DEATH_SCORE_Y = 500;
const DEATH_BUTTON_Y = 566;
const BUTTON_WIDTH = 170;
const BUTTON_HEIGHT = 60;
const BUTTON_SHADOW = 6; // тень кнопки сдвинута вниз на столько px
const BUTTON_COLOR = 0xea580c;
const BUTTON_BORDER = 0xfbbf24;
// Анимации, мс.
const NOTE_FLIP_TIME = 140; // половина переворота записки
const TURN_TIME = 600; // вид уезжает вбок или возвращается
const HAND_MOVE_TIME = 450; // рука выдвигается из темноты или уходит обратно
const HAND_GRIP_TIME = 300; // рука выходит из темноты взять оружие или уходит обратно
const HAND_HOLD_TIME = 300; // кулак с фишками задерживается, прежде чем уйти
const PAYMENT_FLY_TIME = 500; // фишки летят с табло в ладонь
const PAYMENT_FLY_STAGGER = 70; // фишки взлетают друг за другом
const BLACKOUT_TIME = 700; // экран гаснет и загорается снова
const TITLE_BLINK_TIME = 500; // GOOD LUCK и DEATH мигают
const GOOD_LUCK_FADE_TIME = 400; // GOOD LUCK гаснет — экран автомата снова горит
const HIT_TIME = 250; // Коллектор ранен: рука отдёргивается в темноту за столько
const HIT_FLASH_TIME = 500; // и столько гаснет красная вспышка

/** Кнопка: тень стоит на месте, а «лицо» — контейнер с корпусом, бликом и надписями. */
interface Button {
  shadow: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Container;
}

/**
 * Всё про долг: записка на стене (фишек хватает — она светится, и по ней можно отдать долг раньше),
 * темнота справа от комнаты, в ней банкомат (платишь долг: фишки в щель, на выходе купон) и рука Коллектора
 * (когда фишек не хватает), поворот вида, GOOD LUCK на экране автомата, затемнение и экран DEATH.
 */
export class Collector {
  private readonly scene: Phaser.Scene;
  private readonly note: Phaser.GameObjects.Image; // записка с долгом: бумажка с надписями одной картинкой
  private readonly noteGlow: Phaser.GameObjects.Image; // свечение вокруг записки: долг можно отдать раньше
  private readonly hand: Phaser.GameObjects.Image; // рука Коллектора: когда фишек не хватает
  private readonly atm: Atm; // банкомат: когда фишек хватает, долг платят в него
  private isAtmOut = false; // банкомат выехал (а не рука)
  private readonly face: ShadowFace; // красные глаза и улыбка в тени
  private isNoteChecked = false; // на записке галочка: фишек на табло хватает на долг
  private noteDebt = 0; // что нарисовано на записке: долг, фишки на табло и на кону — для полоски долга
  private noteBalance = 0;
  private notePot = 0;
  private isPayable = false; // записка светится: по ней можно кликнуть и отдать долг раньше
  private goodLuck: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] = []; // GOOD LUCK на экране автомата

  /**
   * pay — что делать, когда кликнули по протянутой руке (Enter сцена ловит сама);
   * payEarly — когда кликнули по светящейся записке (D сцена ловит сама).
   */
  constructor(scene: Phaser.Scene, debt: number, pay: () => void, payEarly: () => void) {
    this.scene = scene;
    createChipTextures(scene);
    createHandTextures(scene);
    createNoteGlowTexture(scene, NOTE.width, NOTE.height);

    // Записка: бумажка, «ДОЛГ» и сумма — одна картинка из decor.ts.
    // Надписи нарисованы прямо на бумажке: Phaser 4 обрезает текст в повёрнутом контейнере, а картинку — нет.
    // Под запиской — свечение: его видно, когда долг можно отдать раньше; тогда по записке можно кликнуть.
    this.noteGlow = scene.add.image(NOTE.x, NOTE.y, NOTE_GLOW_TEXTURE).setAngle(NOTE_ANGLE).setVisible(false);
    this.noteDebt = debt;
    this.redrawNote(false);
    this.note = scene.add.image(NOTE.x, NOTE.y, NOTE_TEXTURE).setAngle(NOTE_ANGLE);
    this.note.setInteractive({ useHandCursor: true }).disableInteractive();
    this.note.on('pointerdown', payEarly);

    // Темнота справа от комнаты и спрятанная в ней рука; над ладонью — «фишка × долг».
    scene.add.rectangle(DARKNESS.x, DARKNESS.y, DARKNESS.width, DARKNESS.height, 0x000000);
    this.hand = scene.add.image(HAND_IN_X, HAND_Y, HAND_OPEN_TEXTURE);
    this.hand.setInteractive({ useHandCursor: true });
    this.hand.on('pointerdown', pay);
    this.atm = new Atm(scene, pay);
    this.face = new ShadowFace(scene);
  }

  /** Галочка на записке появляется, как только фишек на табло хватает на долг. Записка при этом подпрыгивает. */
  markNote(debt: number, isEnough: boolean): void {
    if (isEnough === this.isNoteChecked) return;
    this.isNoteChecked = isEnough;
    this.noteDebt = debt;
    this.redrawNote(isEnough);
    pulse(this.scene, this.note, 1.12);
  }

  /**
   * Полоска долга на записке: сколько долга уже на табло и сколько лежит на кону (заберёшь — будет на табло).
   * Зовёт refreshHud при любом изменении, поэтому перерисовываем, только если числа сменились.
   */
  showProgress(debt: number, balance: number, pot: number): void {
    if (balance === this.noteBalance && pot === this.notePot) return;
    this.noteBalance = balance;
    this.notePot = pot;
    // Долг на записке меняет только переворот (flipNote): до него число не трогаем, переворот сам нарисует полоску.
    if (debt === this.noteDebt) this.redrawNote(this.isNoteChecked);
  }

  /** Нарисовать записку заново по запомненным числам. */
  private redrawNote(isEnough: boolean): void {
    const paid = Math.min(1, this.noteBalance / this.noteDebt);
    const pending = Math.min(1 - paid, this.notePot / this.noteDebt);
    drawNoteTexture(this.scene, NOTE.width, NOTE.height, this.noteDebt, isEnough, paid, pending);
  }

  /**
   * Можно ли отдать долг раньше: да — записка светится (свечение пульсирует), курсор над ней — рука;
   * нет — свечение гаснет и кликнуть нельзя.
   */
  showPayable(isPayable: boolean): void {
    if (isPayable === this.isPayable) return;
    this.isPayable = isPayable;
    this.scene.tweens.killTweensOf(this.noteGlow);
    this.noteGlow.setVisible(isPayable).setAlpha(1);
    if (!isPayable) {
      this.note.disableInteractive(true); // и курсор-рука пропадает, даже если мышь над запиской
      return;
    }
    this.note.setInteractive();
    this.scene.tweens.add({
      targets: this.noteGlow,
      alpha: NOTE_GLOW_MIN,
      duration: NOTE_GLOW_TIME,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** Новый долг: записка переворачивается, и на обороте — новая сумма (и галочка, если фишек уже хватает). */
  flipNote(debt: number, isEnough: boolean): void {
    this.scene.tweens.killTweensOf(this.note);
    this.note.setScale(1);
    this.scene.tweens.add({
      targets: this.note,
      scaleX: 0,
      duration: NOTE_FLIP_TIME,
      yoyo: true,
      ease: 'Quad.easeIn',
      onYoyo: () => {
        this.isNoteChecked = isEnough;
        this.noteDebt = debt;
        this.redrawNote(isEnough);
      },
    });
  }

  /**
   * Вид уезжает вбок. Фишек хватает — из темноты выезжает банкомат с долгом на экране; не хватает — в темноте
   * проступают красные глаза Коллектора. Вышел — ready().
   */
  reachOut(debt: number, isEnough: boolean, ready: () => void): void {
    this.scene.tweens.add({
      targets: this.scene.cameras.main,
      scrollX: TURN_SCROLL,
      duration: TURN_TIME,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (isEnough) {
          this.isAtmOut = true;
          this.atm.slideIn(debt, isEnough, ready);
          return;
        }
        this.face.show(ready);
      },
    });
  }

  /**
   * Долг отдан. Банкомат: фишки летят с табло в щель, он печатает купон — тогда paid(x, y) с места купона
   * (оттуда сцена пускает билеты), уезжает, вид возвращается. Рука: фишки летят в ладонь — paid(x, y) с места ладони,
   * рука сжимает их и уходит. Вид вернулся к автомату — done().
   */
  takePayment(paid: (x: number, y: number) => void, done: () => void): void {
    if (this.isAtmOut) {
      this.atm.swallowAndPrint(paid, () => this.leave(done));
      return;
    }
    for (let index = 0; index < PAYMENT_CHIPS; index++) {
      const chip = this.scene.add.image(DISPLAY.x, DISPLAY.y, CHIP_TEXTURE).setScale(1.3);
      this.scene.tweens.add({
        targets: chip,
        x: HAND_PALM_X,
        y: HAND_PALM_Y,
        scale: 0.8,
        delay: index * PAYMENT_FLY_STAGGER,
        duration: PAYMENT_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => chip.destroy(),
      });
    }
    this.scene.time.delayedCall(PAYMENT_CHIPS * PAYMENT_FLY_STAGGER + PAYMENT_FLY_TIME, () => {
      paid(HAND_PALM_X, HAND_PALM_Y);
      this.leave(done);
    });
  }

  /** Где ладонь протянутой руки — туда летит то, что отдают Коллектору. */
  palmPosition(): { x: number; y: number } {
    return { x: HAND_PALM_X, y: HAND_PALM_Y };
  }

  /** Рука выходит из темноты ладонью вверх: принять амулет (откуп) или фишки. */
  stretchHand(): void {
    this.hand.setTexture(HAND_OPEN_TEXTURE);
    this.moveHand(HAND_OUT_X);
  }

  private moveHand(x: number): void {
    this.scene.tweens.killTweensOf(this.hand);
    this.scene.tweens.add({ targets: this.hand, x, duration: HAND_GRIP_TIME, ease: 'Cubic.easeOut' });
  }

  /** Рука сжимается и уходит, вид возвращается к автомату — потом done(). Без расплаты: за амулет или после игры. */
  goAway(done: () => void): void {
    this.leave(done);
  }

  /** Банкомат уезжает в темноту или рука сжимает фишки в кулак и уходит, вид возвращается к автомату — потом done(). */
  private leave(done: () => void): void {
    if (this.isAtmOut) {
      this.isAtmOut = false;
      this.atm.slideOut(() => {});
      this.scene.tweens.add({
        targets: this.scene.cameras.main,
        scrollX: HOME_SCROLL,
        delay: ATM_LEAVE_TIME,
        duration: TURN_TIME,
        ease: 'Sine.easeInOut',
        onComplete: done,
      });
      return;
    }
    this.hand.setTexture(HAND_FIST_TEXTURE);
    this.face.hide();
    this.scene.tweens.add({ targets: this.hand, x: HAND_IN_X, delay: HAND_HOLD_TIME, duration: HAND_MOVE_TIME, ease: 'Cubic.easeIn' });
    this.scene.tweens.add({
      targets: this.scene.cameras.main,
      scrollX: HOME_SCROLL,
      delay: HAND_HOLD_TIME + HAND_MOVE_TIME,
      duration: TURN_TIME,
      ease: 'Sine.easeInOut',
      onComplete: done,
    });
  }

  /** Коллектор берёт оружие: из темноты выходит рука в кулак; отпустил — рука уходит обратно. Ход Коллектора в рулетке. */
  grip(isHolding: boolean): void {
    if (isHolding) this.hand.setTexture(HAND_FIST_TEXTURE);
    this.moveHand(isHolding ? HAND_OUT_X : HAND_IN_X);
  }

  /** Коллектор ранен: в темноте красная вспышка, рука отдёргивается и уходит, вид возвращается к автомату — потом done(). */
  recoil(done: () => void): void {
    const hit = this.scene.add.rectangle(DARKNESS.x, DARKNESS.y, DARKNESS.width, DARKNESS.height, HIT_COLOR, HIT_ALPHA);
    this.scene.tweens.add({ targets: hit, alpha: 0, duration: HIT_FLASH_TIME, onComplete: () => hit.destroy() });
    this.scene.tweens.add({ targets: this.hand, x: HAND_IN_X, duration: HIT_TIME, ease: 'Cubic.easeOut' });
    this.face.hide();
    this.scene.tweens.add({
      targets: this.scene.cameras.main,
      scrollX: HOME_SCROLL,
      delay: HIT_FLASH_TIME,
      duration: TURN_TIME,
      ease: 'Sine.easeInOut',
      onComplete: done,
    });
  }

  /** Фишек не хватает: экран автомата гаснет, на нём мигает красное GOOD LUCK — впереди игра с Коллектором (или KABOOM). */
  warnGoodLuck(text = 'GOOD LUCK'): void {
    this.goodLuck = this.screenTitle(text, GOOD_LUCK_DEPTH);
  }

  /** Автомат взрывается: белая вспышка на весь вид и огненные шары из экрана в разные стороны. */
  explode(): void {
    const flash = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0xffffff, 0.9).setDepth(POPUP_DEPTH + 1);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: EXPLOSION_FLASH_TIME, onComplete: () => flash.destroy() });
    for (let index = 0; index < EXPLOSION_BALLS; index++) {
      const radius = Phaser.Math.RND.between(14, 30);
      const color = Phaser.Math.RND.pick(EXPLOSION_COLORS);
      const ball = this.scene.add.circle(SCREEN.x, SCREEN.y, radius, color, 0.95).setDepth(POPUP_DEPTH);
      const angle = Phaser.Math.RND.realInRange(0, Math.PI * 2);
      const distance = Phaser.Math.RND.between(EXPLOSION_MIN_DISTANCE, EXPLOSION_MAX_DISTANCE);
      this.scene.tweens.add({
        targets: ball,
        x: SCREEN.x + distance * Math.cos(angle),
        y: SCREEN.y + distance * Math.sin(angle) * 0.8,
        scale: { from: 0.6, to: 2.6 },
        alpha: 0,
        duration: Phaser.Math.RND.between(EXPLOSION_MIN_TIME, EXPLOSION_MAX_TIME),
        ease: 'Cubic.easeOut',
        onComplete: () => ball.destroy(),
      });
    }
  }

  /** Игра с Коллектором кончилась, а забег идёт: GOOD LUCK тает, экран автомата снова горит. */
  clearGoodLuck(): void {
    const parts = this.goodLuck;
    this.goodLuck = [];
    this.scene.tweens.killTweensOf(parts);
    this.scene.tweens.add({ targets: parts, alpha: 0, duration: GOOD_LUCK_FADE_TIME, onComplete: () => parts.forEach((part) => part.destroy()) });
  }

  /** Чёрный экран автомата с красной мигающей надписью text на слое depth. */
  private screenTitle(text: string, depth: number): (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[] {
    const screen = this.scene.add.rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0x000000).setRounded(16);
    const title = addText(this.scene, SCREEN.x, SCREEN.y, text, SCREEN_TITLE_STYLE).setOrigin(0.5);
    for (const part of [screen, title]) part.setDepth(depth);
    this.scene.tweens.add({ targets: title, alpha: 0.3, duration: TITLE_BLINK_TIME, yoyo: true, repeat: -1 }); // мигает
    return [screen, title];
  }

  /** Конец забега: экран трясётся и гаснет. В темноте вид возвращается — dark(), потом экран загорается. */
  blackout(dark: () => void): void {
    const camera = this.scene.cameras.main;
    camera.shake(300, 0.01);
    camera.fadeOut(BLACKOUT_TIME, 0, 0, 0);
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      camera.setScroll(HOME_SCROLL, 0); // вид снова на автомате
      this.hand.setX(HAND_IN_X);
      this.atm.hide();
      this.isAtmOut = false;
      this.face.hide();
      dark();
      camera.fadeIn(BLACKOUT_TIME);
    });
  }

  /** Конец забега: всё темнеет, экран автомата чёрный, на нём мигает title (DEATH или KABOOM). Ниже — счёт, рекорд и «ЗАНОВО». */
  showDeath(closedDebts: number, record: number, restart: () => void, title = 'DEATH'): void {
    const shade = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0x000000, 0.6); // на весь вид у автомата
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const scoreText = `${t('debtsPaid')}: ${closedDebts} · ${t('best')}: ${record}`;
    const score = addText(this.scene, CENTER_X, DEATH_SCORE_Y, scoreText, { fontSize: '20px', color: GOLD_TEXT }).setOrigin(0.5);
    const button = this.makeButton(CENTER_X, DEATH_BUTTON_Y, t('again'), restart);
    for (const part of [shade, score, button.shadow, button.face]) part.setDepth(GAME_OVER_DEPTH);
    this.screenTitle(title, GAME_OVER_DEPTH);
  }

  /** Кнопка: тень, корпус с золотой рамкой, блик сверху и крупная надпись. Нажимается и мышью, и пальцем. */
  private makeButton(x: number, y: number, text: string, onPress: () => void): Button {
    const shadow = this.scene.add.rectangle(x, y + BUTTON_SHADOW, BUTTON_WIDTH, BUTTON_HEIGHT, 0x000000, 0.45).setRounded(18);
    // Всё остальное рисуем относительно центра кнопки и кладём в контейнер.
    const box = this.scene.add
      .rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_COLOR)
      .setRounded(18)
      .setStrokeStyle(3, BUTTON_BORDER);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', onPress);
    const gloss = this.scene.add
      .rectangle(0, -BUTTON_HEIGHT / 4, BUTTON_WIDTH - 16, BUTTON_HEIGHT / 2 - 8, 0xffffff, 0.16)
      .setRounded(12);
    const label = addText(this.scene, 0, 0, text, {
      fontSize: '22px',
      fontStyle: 'bold',
      stroke: 'rgba(0, 0, 0, 0.35)',
      strokeThickness: 3,
    }).setOrigin(0.5);
    const face = this.scene.add.container(x, y, [box, gloss, label]);
    return { shadow, face };
  }
}

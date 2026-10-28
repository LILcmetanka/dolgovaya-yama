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
import { CENTER_X, CENTER_Y, DARKNESS, DISPLAY, HOME_SCROLL, NOTE, NOTE_ANGLE, SCREEN, TURN_SCROLL, VIEW_WIDTH } from '../layout';
import { addKeyHint, addText, GAME_OVER_DEPTH, GOLD_TEXT, keyHint, LED_COLOR, LED_STYLE, POPUP_DEPTH, pulse, RED_TEXT } from '../theme';

// Записка светится, когда долг можно отдать раньше: клик по ней или D.
const NOTE_GLOW_MIN = 0.3; // свечение пульсирует: гаснет до такой яркости и разгорается снова
const NOTE_GLOW_TIME = 700; // мс
const PAY_KEY_X = NOTE.x + 52; // подсказка «D» — под запиской, ближе к правому краю
const PAY_KEY_Y = NOTE.y + NOTE.height / 2 + 14;
// Рука Коллектора в темноте справа от комнаты.
const HAND_Y = 330;
const HAND_IN_X = DARKNESS.x + 360; // рука спрятана в темноте за правым краем вида
const HAND_OUT_X = DARKNESS.x - 30; // рука протянута к игроку
const HAND_PALM_X = HAND_OUT_X - 58; // ладонь протянутой руки — сюда летят фишки
const HAND_PALM_Y = HAND_Y - 22;
const DEMAND_Y = HAND_Y - 100; // над ладонью: «фишка × долг»
const PAYMENT_CHIPS = 6; // сколько фишек летит в ладонь при расплате (для красоты: сумма может быть любой)
// Надписи на чёрном экране автомата: GOOD LUCK — фишек не хватило, дальше игра с Коллектором; DEATH — конец забега.
const SCREEN_TITLE_STYLE = { ...LED_STYLE, fontSize: '64px', color: RED_TEXT, shadow: { color: '#ef4444', blur: 18, fill: true } };
const GOOD_LUCK_DEPTH = POPUP_DEPTH - 1; // GOOD LUCK — над сеткой, под всплывающими надписями
const HIT_COLOR = 0x991b1b; // Коллектор ранен: красная вспышка в темноте
const HIT_ALPHA = 0.6;
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
 * темнота справа от комнаты и рука Коллектора в ней, поворот вида к руке, GOOD LUCK на экране автомата,
 * затемнение и экран DEATH.
 */
export class Collector {
  private readonly scene: Phaser.Scene;
  private readonly note: Phaser.GameObjects.Image; // записка с долгом: бумажка с надписями одной картинкой
  private readonly noteGlow: Phaser.GameObjects.Image; // свечение вокруг записки: долг можно отдать раньше
  private readonly payKey: Phaser.GameObjects.Text; // «D» под запиской
  private readonly hand: Phaser.GameObjects.Image; // рука Коллектора
  private readonly demandChip: Phaser.GameObjects.Image; // над ладонью: фишка…
  private readonly demandText: Phaser.GameObjects.Text; // …и «× долг»
  private isNoteChecked = false; // на записке галочка: фишек на табло хватает на долг
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
    // Под запиской — свечение, под ней — «D»: их видно, когда долг можно отдать раньше; тогда по записке можно кликнуть.
    this.noteGlow = scene.add.image(NOTE.x, NOTE.y, NOTE_GLOW_TEXTURE).setAngle(NOTE_ANGLE).setVisible(false);
    drawNoteTexture(scene, NOTE.width, NOTE.height, debt, false);
    this.note = scene.add.image(NOTE.x, NOTE.y, NOTE_TEXTURE).setAngle(NOTE_ANGLE);
    this.note.setInteractive({ useHandCursor: true }).disableInteractive();
    this.note.on('pointerdown', payEarly);
    this.payKey = addKeyHint(scene, PAY_KEY_X, PAY_KEY_Y, 'D').setVisible(false);

    // Темнота справа от комнаты и спрятанная в ней рука; над ладонью — «фишка × долг».
    scene.add.rectangle(DARKNESS.x, DARKNESS.y, DARKNESS.width, DARKNESS.height, 0x000000);
    this.hand = scene.add.image(HAND_IN_X, HAND_Y, HAND_OPEN_TEXTURE);
    this.hand.setInteractive({ useHandCursor: true });
    this.hand.on('pointerdown', pay);
    this.demandChip = scene.add.image(HAND_PALM_X - 44, DEMAND_Y, CHIP_TEXTURE).setScale(1.2).setAlpha(0);
    this.demandText = addText(scene, HAND_PALM_X - 24, DEMAND_Y, '', { ...LED_STYLE, fontSize: '28px' })
      .setOrigin(0, 0.5)
      .setAlpha(0);
  }

  /** Галочка на записке появляется, как только фишек на табло хватает на долг. Записка при этом подпрыгивает. */
  markNote(debt: number, isEnough: boolean): void {
    if (isEnough === this.isNoteChecked) return;
    this.isNoteChecked = isEnough;
    drawNoteTexture(this.scene, NOTE.width, NOTE.height, debt, isEnough);
    pulse(this.scene, this.note, 1.12);
  }

  /**
   * Можно ли отдать долг раньше: да — записка светится (свечение пульсирует), курсор над ней — рука, под ней — «D»;
   * нет — свечение гаснет и кликнуть нельзя.
   */
  showPayable(isPayable: boolean): void {
    if (isPayable === this.isPayable) return;
    this.isPayable = isPayable;
    this.payKey.setVisible(isPayable);
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
        drawNoteTexture(this.scene, NOTE.width, NOTE.height, debt, isEnough);
      },
    });
  }

  /** Вид уезжает вбок, из темноты выдвигается рука ладонью вверх, над ней — сколько отдать. Рука вышла — ready(). */
  reachOut(debt: number, isEnough: boolean, ready: () => void): void {
    this.scene.tweens.add({
      targets: this.scene.cameras.main,
      scrollX: TURN_SCROLL,
      duration: TURN_TIME,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.hand.setTexture(HAND_OPEN_TEXTURE);
        this.demandText.setText(`× ${debt}`).setColor(isEnough ? LED_COLOR : RED_TEXT);
        this.scene.tweens.add({ targets: this.hand, x: HAND_OUT_X, duration: HAND_MOVE_TIME, ease: 'Cubic.easeOut' });
        this.scene.tweens.add({ targets: [this.demandChip, this.demandText], alpha: 1, delay: HAND_MOVE_TIME, duration: 200 });
        this.scene.time.delayedCall(HAND_MOVE_TIME, ready);
      },
    });
  }

  /**
   * Долг отдан: фишки летят с табло в ладонь — тогда paid(x, y) с места ладони (оттуда сцена пускает билеты);
   * рука сжимает фишки и уходит, вид возвращается к автомату — потом done().
   */
  takePayment(paid: (x: number, y: number) => void, done: () => void): void {
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

  /** Над ладонью больше не нужно «фишка × долг» — Коллектор предлагает игру. */
  hideDemand(): void {
    this.scene.tweens.add({ targets: [this.demandChip, this.demandText], alpha: 0, duration: 200 });
  }

  /** Рука сжимается и уходит, вид возвращается к автомату — потом done(). Без расплаты: за амулет или после игры. */
  goAway(done: () => void): void {
    this.leave(done);
  }

  /** Рука сжимает фишки в кулак и уходит в темноту, вид возвращается к автомату — потом done(). */
  private leave(done: () => void): void {
    this.hand.setTexture(HAND_FIST_TEXTURE);
    this.scene.tweens.add({ targets: [this.demandChip, this.demandText], alpha: 0, duration: 200 });
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

  /** Рука держит револьвер (кулак) или снова ладонью вверх: ход Коллектора в рулетке. */
  grip(isHolding: boolean): void {
    this.hand.setTexture(isHolding ? HAND_FIST_TEXTURE : HAND_OPEN_TEXTURE);
  }

  /** Коллектор ранен: в темноте красная вспышка, рука отдёргивается и уходит, вид возвращается к автомату — потом done(). */
  recoil(done: () => void): void {
    const hit = this.scene.add.rectangle(DARKNESS.x, DARKNESS.y, DARKNESS.width, DARKNESS.height, HIT_COLOR, HIT_ALPHA);
    this.scene.tweens.add({ targets: hit, alpha: 0, duration: HIT_FLASH_TIME, onComplete: () => hit.destroy() });
    this.scene.tweens.add({ targets: this.hand, x: HAND_IN_X, duration: HIT_TIME, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({
      targets: this.scene.cameras.main,
      scrollX: HOME_SCROLL,
      delay: HIT_FLASH_TIME,
      duration: TURN_TIME,
      ease: 'Sine.easeInOut',
      onComplete: done,
    });
  }

  /** Фишек не хватает: экран автомата гаснет, на нём мигает красное GOOD LUCK — впереди игра с Коллектором. */
  warnGoodLuck(): void {
    this.goodLuck = this.screenTitle('GOOD LUCK', GOOD_LUCK_DEPTH);
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

  /** Конец забега: рука сжимается в кулак, экран трясётся и гаснет. В темноте вид возвращается — dark(), потом экран загорается. */
  blackout(dark: () => void): void {
    this.hand.setTexture(HAND_FIST_TEXTURE);
    const camera = this.scene.cameras.main;
    camera.shake(300, 0.01);
    camera.fadeOut(BLACKOUT_TIME, 0, 0, 0);
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      camera.setScroll(HOME_SCROLL, 0); // вид снова на автомате
      this.hand.setX(HAND_IN_X);
      this.demandChip.setAlpha(0);
      this.demandText.setAlpha(0);
      dark();
      camera.fadeIn(BLACKOUT_TIME);
    });
  }

  /** Конец забега: всё темнеет, экран автомата чёрный, на нём мигает DEATH. Ниже — счёт, рекорд и «ЗАНОВО». */
  showDeath(closedDebts: number, record: number, restart: () => void): void {
    const shade = this.scene.add.rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, 640, 0x000000, 0.6); // на весь вид у автомата
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const scoreText = `${t('debtsPaid')}: ${closedDebts} · ${t('best')}: ${record}`;
    const score = addText(this.scene, CENTER_X, DEATH_SCORE_Y, scoreText, { fontSize: '20px', color: GOLD_TEXT }).setOrigin(0.5);
    const button = this.makeButton(CENTER_X, DEATH_BUTTON_Y, t('again'), keyHint(`R / ${t('space')}`), restart);
    for (const part of [shade, score, button.shadow, button.face]) part.setDepth(GAME_OVER_DEPTH);
    this.screenTitle('DEATH', GAME_OVER_DEPTH);
  }

  /** Кнопка: тень, корпус с золотой рамкой, блик сверху, крупная надпись и под ней клавиша (на телефоне — без неё). Нажимается и мышью, и пальцем. */
  private makeButton(x: number, y: number, text: string, keyLabel: string, onPress: () => void): Button {
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
    const label = addText(this.scene, 0, keyLabel ? -9 : 0, text, {
      fontSize: '22px',
      fontStyle: 'bold',
      stroke: 'rgba(0, 0, 0, 0.35)',
      strokeThickness: 3,
    }).setOrigin(0.5);
    const key = addText(this.scene, 0, 21, keyLabel, { fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }).setOrigin(0.5);
    const face = this.scene.add.container(x, y, [box, gloss, label, key]);
    return { shadow, face };
  }
}

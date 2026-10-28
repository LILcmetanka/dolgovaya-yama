import Phaser from 'phaser';
import {
  ARROW_DOWN_TEXTURE,
  ARROW_UP_TEXTURE,
  CARD_BACK_TEXTURE,
  cardTexture,
  CHIP_STACK_TEXTURE,
  createDealerTextures,
  DEALER_FELT_TEXTURE,
  STAKE_GLOW_TEXTURE,
} from '../decor';
import { CARD_MAX, CARD_MIN, type Guess } from '../dealerGame';
import { SCREEN } from '../layout';
import type { Sfx } from '../sound';
import { addKeyHint, addText, LED_COLOR, LED_STYLE, POPUP_DEPTH, pulse, RED_TEXT } from '../theme';

// Где что на столе (поверх экрана автомата).
const CARD_LEFT_X = SCREEN.x - 90; // открытая карта
const CARD_RIGHT_X = SCREEN.x + 90; // следующая — рубашкой вверх
const CARD_Y = SCREEN.y + 14;
const ARROW_X = SCREEN.x;
const ARROW_UP_Y = SCREEN.y - 24;
const ARROW_DOWN_Y = SCREEN.y + 52;
// Ставка сверху: стопка фишек, правее — «× 30».
const STACK_X = SCREEN.x - 52;
const STACK_Y = SCREEN.y - 76; // нижняя фишка стопки
const STACK_STEP = 6; // каждая следующая фишка в стопке выше на столько
const STACK_START = 2; // столько фишек в стопке, когда Дилер садится за стол
const STACK_MAX = 6; // за каждую угаданную карту — ещё фишка, но не больше этого
const STACK_JUMP = 10; // угадал — стопка подпрыгивает на столько
const GLOW_Y = STACK_Y - 12; // свечение — под серединой стопки
const GLOW_MIN = 0.45; // свечение пульсирует: гаснет до такой яркости и разгорается снова
const STAKE_TEXT_X = STACK_X + 26;
const STAKE_TEXT_Y = STACK_Y - 10;
const STOP_KEY_Y = STACK_Y + 22; // «Enter» под стопкой
const BURN_COLOR = 0xff5a1f; // не угадал — фишки стопки горят огнём (как фишка в окошке выплаты)
const DEPTH = POPUP_DEPTH - 1; // под всплывающими надписями, но над сеткой
// Анимации, мс.
const FLIP_TIME = 160; // половина переворота карты
const SLIDE_TIME = 300; // угаданная карта уезжает на место открытой
const APPEAR_TIME = 250;
const GLOW_TIME = 600; // свечение от яркого до тусклого
const JUMP_TIME = 120; // стопка подпрыгивает — вверх, столько же вниз
const CHIP_SLIDE_TIME = 450; // остановился — фишки стопки съезжают на кон
const CHIP_SLIDE_STAGGER = 70; // друг за другом, сверху стопки

/**
 * Игра Дилера поверх экрана автомата: фиолетовое сукно, открытая карта и карта рубашкой вверх,
 * стрелки «больше» и «меньше», сверху — ставка: стопка фишек и «× 30».
 * Угадал — стопка светится: клик по ней (или Enter — его ловит сцена) — остановиться, фишки съезжают на кон.
 */
export class DealerTable {
  private readonly scene: Phaser.Scene;
  private readonly felt: Phaser.GameObjects.Image;
  private readonly openCard: Phaser.GameObjects.Image; // открытая карта
  private readonly nextCard: Phaser.GameObjects.Image; // следующая карта: рубашкой вверх, при угадывании переворачивается
  private readonly stackGlow: Phaser.GameObjects.Image; // свечение под стопкой — можно остановиться; клик по нему — стоп
  private readonly stack: Phaser.GameObjects.Container; // стопка фишек — ставка
  private readonly stackChips: Phaser.GameObjects.Image[] = []; // фишки стопки, снизу вверх
  private readonly stakeText: Phaser.GameObjects.Text; // «× 30»
  private readonly stopKey: Phaser.GameObjects.Text; // «Enter» под стопкой
  private readonly arrows: Phaser.GameObjects.Image[]; // ▲ и ▼
  private readonly hints: Phaser.GameObjects.Text[]; // ↑ и ↓ у стрелок
  private readonly sfx: Sfx;
  private chipsShown = STACK_START; // сколько фишек в стопке сейчас

  /** guess(dir) — кликнули по стрелке, stop() — по светящейся стопке. */
  constructor(scene: Phaser.Scene, guess: (dir: Guess) => void, stop: () => void, sfx: Sfx) {
    this.scene = scene;
    this.sfx = sfx;
    createDealerTextures(scene, CARD_MIN, CARD_MAX, SCREEN);
    this.felt = scene.add.image(SCREEN.x, SCREEN.y, DEALER_FELT_TEXTURE);
    this.openCard = scene.add.image(CARD_LEFT_X, CARD_Y, CARD_BACK_TEXTURE);
    this.nextCard = scene.add.image(CARD_RIGHT_X, CARD_Y, CARD_BACK_TEXTURE);
    this.stackGlow = scene.add.image(STACK_X, GLOW_Y, STAKE_GLOW_TEXTURE).setDepth(DEPTH).setVisible(false);
    this.stackGlow.setInteractive({ useHandCursor: true }).disableInteractive();
    this.stackGlow.on('pointerdown', stop);
    for (let index = 0; index < STACK_MAX; index++) {
      this.stackChips.push(scene.add.image(0, -index * STACK_STEP, CHIP_STACK_TEXTURE));
    }
    this.stack = scene.add.container(STACK_X, STACK_Y, this.stackChips);
    this.stakeText = addText(scene, STAKE_TEXT_X, STAKE_TEXT_Y, '', LED_STYLE).setOrigin(0, 0.5);
    this.stopKey = addKeyHint(scene, STACK_X, STOP_KEY_Y, 'Enter').setDepth(DEPTH).setVisible(false);
    this.arrows = [];
    this.hints = [];
    for (const [dir, texture, y, key] of [
      ['higher', ARROW_UP_TEXTURE, ARROW_UP_Y, '↑'],
      ['lower', ARROW_DOWN_TEXTURE, ARROW_DOWN_Y, '↓'],
    ] as const) {
      const arrow = scene.add.image(ARROW_X, y, texture);
      arrow.setInteractive({ useHandCursor: true });
      arrow.on('pointerdown', () => guess(dir));
      this.arrows.push(arrow);
      this.hints.push(addKeyHint(scene, ARROW_X - 40, y, key, '16px'));
    }
    for (const object of this.objects()) object.setDepth(DEPTH).setVisible(false);
  }

  /** Всё, что есть на столе, пока Дилер за ним сидит (свечение и «Enter» — только когда можно остановиться). */
  private objects(): (Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Container)[] {
    return [this.felt, this.openCard, this.nextCard, this.stack, this.stakeText, ...this.arrows, ...this.hints];
  }

  /** Дилер садится за стол: ставка (стопка и «× 30»), открытая карта card и карта рубашкой вверх. */
  open(stake: number, card: number): void {
    for (const object of this.objects()) object.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.objects(), alpha: 1, duration: APPEAR_TIME });
    this.stakeText.setText(`× ${stake}`).setColor(LED_COLOR);
    this.showChips(STACK_START);
    this.openCard.setTexture(cardTexture(card)).setPosition(CARD_LEFT_X, CARD_Y).setScale(1);
    this.nextCard.setTexture(CARD_BACK_TEXTURE).setPosition(CARD_RIGHT_X, CARD_Y).setScale(1).setAngle(0);
  }

  /** В стопке count фишек, обычного цвета (после проигрыша они горели). */
  private showChips(count: number): void {
    this.chipsShown = count;
    this.stackChips.forEach((chip, index) => chip.setVisible(index < count).clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
  }

  /**
   * Можно остановиться (угадал): стопка подпрыгивает и светится, курсор над ней — рука, под ней «Enter».
   * Нельзя (открывается карта, Дилер уходит) — свечение гаснет.
   */
  showStoppable(isStoppable: boolean): void {
    this.stopKey.setVisible(isStoppable);
    this.scene.tweens.killTweensOf(this.stackGlow);
    this.stackGlow.setVisible(isStoppable).setAlpha(1);
    if (!isStoppable) {
      this.stackGlow.disableInteractive(true); // и курсор-рука пропадает, даже если мышь над стопкой
      return;
    }
    this.stackGlow.setInteractive();
    this.scene.tweens.add({ targets: this.stackGlow, alpha: GLOW_MIN, duration: GLOW_TIME, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.scene.tweens.add({ targets: this.stack, y: STACK_Y - STACK_JUMP, duration: JUMP_TIME, yoyo: true, ease: 'Quad.easeOut' });
  }

  /**
   * Открыть следующую карту next. Угадал — ставка подпрыгивает с новым числом, в стопке на фишку больше,
   * открытая карта сменяется следующей, справа — новая рубашка. Не угадал — карта трясётся, ставка горит. Потом done().
   */
  reveal(next: number, isRight: boolean, stake: number, done: () => void): void {
    this.sfx.play('card');
    this.sfx.play(isRight ? 'cardWin' : 'cardLose', FLIP_TIME * 2 / 1000);
    this.scene.tweens.add({
      targets: this.nextCard,
      scaleX: 0,
      duration: FLIP_TIME,
      yoyo: true,
      onYoyo: () => this.nextCard.setTexture(cardTexture(next)),
      onComplete: () => (isRight ? this.win(next, stake, done) : this.lose(done)),
    });
  }

  /** Угадал: открытая карта — та, что открыли; справа новая рубашка; ставка выросла — и стопка тоже. */
  private win(next: number, stake: number, done: () => void): void {
    this.stakeText.setText(`× ${stake}`);
    pulse(this.scene, this.stakeText, 1.3);
    this.showChips(Math.min(STACK_MAX, this.chipsShown + 1));
    this.scene.tweens.add({
      targets: this.nextCard,
      x: CARD_LEFT_X,
      duration: SLIDE_TIME,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        this.openCard.setTexture(cardTexture(next));
        this.nextCard.setTexture(CARD_BACK_TEXTURE).setX(CARD_RIGHT_X);
        done();
      },
    });
  }

  /** Не угадал: открытая карта трясётся, ставка краснеет, фишки стопки горят. */
  private lose(done: () => void): void {
    this.stakeText.setColor(RED_TEXT);
    for (const chip of this.stackChips) chip.setTint(BURN_COLOR).setTintMode(Phaser.TintModes.FILL);
    this.scene.tweens.add({ targets: this.nextCard, angle: 8, duration: 60, yoyo: true, repeat: 3 });
    this.scene.time.delayedCall(700, done);
  }

  /** Остановился: свечение гаснет, фишки стопки друг за другом, сверху, съезжают со стола в (x, y) — на кон. Доехала последняя — done(). */
  slideStake(x: number, y: number, done: () => void): void {
    this.showStoppable(false);
    this.stack.setVisible(false);
    const count = this.chipsShown;
    for (let index = 0; index < count; index++) {
      const fromY = STACK_Y - (count - 1 - index) * STACK_STEP; // первой съезжает верхняя
      this.slideChip(fromY, x, y, index * CHIP_SLIDE_STAGGER, index === count - 1 ? done : undefined);
    }
  }

  /** Фишка стопки через delay мс съезжает с высоты fromY в (x, y); доехала — исчезает (и arrived(), если он есть). */
  private slideChip(fromY: number, x: number, y: number, delay: number, arrived?: () => void): void {
    const chip = this.scene.add.image(STACK_X, fromY, CHIP_STACK_TEXTURE).setDepth(DEPTH);
    this.scene.tweens.add({
      targets: chip,
      x,
      y,
      delay,
      duration: CHIP_SLIDE_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        chip.destroy();
        arrived?.();
      },
    });
  }

  /** Дилер уходит: стол тает. */
  close(): void {
    this.showStoppable(false);
    this.scene.tweens.add({
      targets: this.objects(),
      alpha: 0,
      duration: APPEAR_TIME,
      onComplete: () => {
        for (const object of this.objects()) object.setVisible(false);
      },
    });
  }
}

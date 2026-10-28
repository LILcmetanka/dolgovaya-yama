import Phaser from 'phaser';
import {
  CHIP_TEXTURE,
  createChipTextures,
  createCrownLampTexture,
  createLeverTextures,
  createTicketTexture,
  CROWN_LAMP_TEXTURE,
  LEVER_BALL_TEXTURE,
  LEVER_ROD_TEXTURE,
  TICKET_TEXTURE,
} from '../decor';
import { t } from '../lang';
import {
  BOARD_CHIP_X,
  BOARD_CHIPS_MAX_WIDTH,
  BOARD_CHIPS_TEXT_X,
  BOARD_TICKET_X,
  BOARD_TICKETS_TEXT_X,
  CENTER_X,
  DISPLAY,
  GLASS,
  LEVER_MOUNT,
  MULTIPLIER_WINDOW,
  PHASE_SIGNS_Y,
  SPIN_LAMPS_Y,
} from '../layout';
import { SPINS_PER_ROUND } from '../rules';
import {
  addKeyHint,
  addText,
  keyHint,
  LAMP_GOLD,
  LAMP_OFF,
  LAMP_RED,
  LED_COLOR,
  LED_STYLE,
  POPUP_DEPTH,
  POPUP_STYLE,
  pulse,
  RED_TEXT,
} from '../theme';

// Лампочки прокруток под экраном: по одной на прокрутку. Сигарета добавляет лампочки — тогда они стоят теснее.
const SPIN_LAMP_STEP = 26;
const SPIN_LAMPS_MAX_WIDTH = 460; // шире ряд не бывает: панель под экраном 500 px
const SPIN_LAMP_RADIUS = 8;
const SPIN_LAMP_RIM = 0x1c1917; // ободок лампочки
const LOW_SPINS = 3; // столько прокруток или меньше — оставшиеся лампочки красные
// Долг собран — оставшиеся лампочки подмигивают волной; долг отдают раньше — гаснут по одной справа налево.
const WINK_SCALE = 1.6;
const WINK_TIME = 160; // лампочка вырастает за столько мс, столько же — обратно
const WINK_TIMES = 2; // волна проходит дважды
const LAMP_STAGGER = 45; // каждая следующая лампочка — на столько мс позже
const BURN_OUT_TIME = 300; // лампочка гаснет, мс
// Табло.
const BOARD_FONT_SIZE = 32; // число фишек; длинное — мельче, чтобы влезло
const BOARD_MIN_FONT_SIZE = 18;
const TICKET_FLY_TIME = 600; // полученные билеты летят на табло, мс
const TICKET_FLY_STAGGER = 120;
// Окошко множителя.
const MULTIPLIER_FLASH_TIME = 600; // сколько окошко горит красным после черепов, мс
const MULTIPLIER_DROP_SCALE = 0.7; // «забрать» уменьшило множитель — число сжимается до такого размера и возвращается
// Знаки фазы 2 — что изменилось: черепов больше, множитель растёт быстрее. Сначала крупно на стекле под «ФАЗА 2»,
// потом улетают под окошко множителя и остаются там до конца забега.
const PHASE_SIGNS = [
  { text: '💀▲', style: { ...POPUP_STYLE, color: RED_TEXT } },
  { text: '×▲', style: LED_STYLE }, // светится, как «×N» в окошке множителя
];
const PHASE_SIGN_FONT_SIZE = '26px';
const PHASE_SIGN_STEP = 90; // на стекле: от знака до знака
const PHASE_SIGN_SMALL = 0.5; // под окошком множителя знаки во столько раз меньше…
const PHASE_SIGN_SMALL_STEP = 44; // …и стоят теснее
const PHASE_SIGNS_HOME_Y = MULTIPLIER_WINDOW.y + MULTIPLIER_WINDOW.height / 2 + 13; // под окошком множителя
const PHASE_SIGNS_HOLD = 2200; // столько мс знаки видны на стекле
const PHASE_SIGNS_FLY_TIME = 700;
// Рычаг: низ штанги — точка вращения, на конце штанги — шарик.
const LEVER_ROD_LENGTH = 142;
const LEVER_PULL_SCALE = -0.4; // рычаг дёрнули: штанга переворачивается, шарик уходит вниз «на игрока»
const LEVER_PULL_TIME = 130; // рывок вниз, столько же — обратно, мс
const LEVER_HOLD_TIME = 60; // сколько рычаг держится внизу, мс
const LEVER_BALL_GROW = 0.15; // внизу шарик ближе к игроку — на столько крупнее (на каждую единицу укорочения штанги)

/** Цвет горящих лампочек прокруток: когда их мало — красные. */
function spinLampColor(spinsLeft: number): number {
  return spinsLeft <= LOW_SPINS ? LAMP_RED : LAMP_GOLD;
}

/** Приборы на корпусе автомата: табло с фишками, окошко множителя серии, лампочки прокруток и рычаг справа. */
export class MachinePanel {
  private readonly scene: Phaser.Scene;
  private readonly boardText: Phaser.GameObjects.Text; // табло: сколько у тебя фишек
  private readonly ticketsText: Phaser.GameObjects.Text; // табло: сколько у тебя билетов
  private readonly multiplierText: Phaser.GameObjects.Text; // окошко множителя серии
  private readonly spinLamps: Phaser.GameObjects.Arc[] = []; // лампочки прокруток: одна на прокрутку
  private freeLamps: Phaser.GameObjects.Image[] = []; // бесплатные прокрутки за короны — короны в конце ряда лампочек
  private readonly leverRod: Phaser.GameObjects.Image; // штанга рычага, низ — точка вращения
  private readonly leverBall: Phaser.GameObjects.Image; // шарик на конце штанги
  private readonly leverHint: Phaser.GameObjects.Text; // «Пробел» под рычагом
  private phaseSigns: Phaser.GameObjects.Text[] = []; // знаки фазы 2 под окошком множителя; в фазе 1 их нет

  /** pullLever — что делать, когда рычаг дёрнули кликом (Пробел сцена ловит сама). */
  constructor(scene: Phaser.Scene, pullLever: () => void) {
    this.scene = scene;
    createChipTextures(scene);
    createTicketTexture(scene);
    createCrownLampTexture(scene);
    createLeverTextures(scene, LEVER_ROD_LENGTH);

    // Табло сверху: слева фишки (сюда летит забранное, отсюда отдаётся долг), справа билеты (на амулеты).
    scene.add.image(BOARD_CHIP_X, DISPLAY.y, CHIP_TEXTURE).setScale(1.1);
    this.boardText = addText(scene, BOARD_CHIPS_TEXT_X, DISPLAY.y, '', LED_STYLE).setOrigin(0, 0.5);
    scene.add.image(BOARD_TICKET_X, DISPLAY.y, TICKET_TEXTURE).setScale(0.9);
    this.ticketsText = addText(scene, BOARD_TICKETS_TEXT_X, DISPLAY.y, '', { ...LED_STYLE, fontSize: '22px' }).setOrigin(0, 0.5);

    this.addSpinLamps(SPINS_PER_ROUND);
    // Окошко множителя серии: «×3» — с таким множителем пойдёт следующая прокрутка.
    this.multiplierText = addText(scene, MULTIPLIER_WINDOW.x, MULTIPLIER_WINDOW.y, '', LED_STYLE).setOrigin(0.5);

    // Рычаг справа: штанга и шарик на её конце, под креплением — подсказка клавиши.
    this.leverRod = scene.add.image(LEVER_MOUNT.x, LEVER_MOUNT.y, LEVER_ROD_TEXTURE).setOrigin(0.5, 1);
    this.leverBall = scene.add.image(LEVER_MOUNT.x, LEVER_MOUNT.y, LEVER_BALL_TEXTURE);
    this.placeLeverBall();
    for (const part of [this.leverRod, this.leverBall]) {
      part.setInteractive({ useHandCursor: true });
      part.on('pointerdown', pullLever);
    }
    const hintY = LEVER_MOUNT.y + LEVER_MOUNT.height / 2 + 14;
    this.leverHint = addKeyHint(scene, LEVER_MOUNT.x, hintY, t('space'));
  }

  /** Сменился язык: подсказка клавиши под рычагом — на новом. */
  relabel(): void {
    this.leverHint.setText(keyHint(t('space')));
  }

  /** Ещё count лампочек прокруток в конец ряда; весь ряд снова по центру. pop — новые появляются с подскоком. */
  private addSpinLamps(count: number, pop = false): void {
    for (let index = 0; index < count; index++) {
      const lamp = this.scene.add.circle(0, SPIN_LAMPS_Y, SPIN_LAMP_RADIUS, LAMP_OFF).setStrokeStyle(3, SPIN_LAMP_RIM);
      if (pop) this.scene.tweens.add({ targets: lamp, scale: { from: 0.2, to: 1 }, duration: 300, ease: 'Back.easeOut' });
      this.spinLamps.push(lamp);
    }
    this.placeSpinLamps();
  }

  /** Ряд лампочек (и корон бесплатных прокруток за ними) по центру под экраном. Если их много — они стоят теснее, чтобы влезть на панель. */
  private placeSpinLamps(): void {
    const lamps = [...this.spinLamps, ...this.freeLamps];
    const count = lamps.length;
    const step = Math.min(SPIN_LAMP_STEP, SPIN_LAMPS_MAX_WIDTH / (count - 1));
    lamps.forEach((lamp, index) => lamp.setX(CENTER_X + (index - (count - 1) / 2) * step));
  }

  /**
   * Бесплатные прокрутки за короны — золотые короны в конце ряда лампочек: новые выскакивают по очереди,
   * а когда бесплатная прокрутка пошла — последняя корона вспыхивает и тает. Ряд снова по центру.
   */
  showFreeSpins(count: number): void {
    if (count === this.freeLamps.length) return;
    while (this.freeLamps.length < count) {
      const crown = this.scene.add.image(0, SPIN_LAMPS_Y, CROWN_LAMP_TEXTURE).setScale(0.2);
      this.scene.tweens.add({ targets: crown, scale: 1, delay: this.freeLamps.length * LAMP_STAGGER, duration: 300, ease: 'Back.easeOut' });
      this.freeLamps.push(crown);
    }
    for (const crown of this.freeLamps.splice(count)) {
      this.scene.tweens.killTweensOf(crown);
      this.scene.tweens.add({ targets: crown, scale: WINK_SCALE, alpha: 0, duration: BURN_OUT_TIME, onComplete: () => crown.destroy() });
    }
    this.placeSpinLamps();
  }

  /** Табло: сколько у тебя фишек. Длинное число — мельче, чтобы не вылезло из табло. */
  showBalance(balance: number): void {
    this.boardText.setText(String(balance));
    let size = BOARD_FONT_SIZE;
    this.boardText.setFontSize(size);
    while (this.boardText.width > BOARD_CHIPS_MAX_WIDTH && size > BOARD_MIN_FONT_SIZE) {
      size -= 2;
      this.boardText.setFontSize(size);
    }
  }

  /** Табло: сколько у тебя билетов. */
  showTickets(tickets: number): void {
    this.ticketsText.setText(String(tickets));
  }

  /** Билеты летят на табло из (fromX, fromY) — от руки Коллектора или из витрины; долетели — число подпрыгивает. */
  flyTickets(count: number, fromX: number, fromY: number): void {
    for (let index = 0; index < count; index++) {
      const ticket = this.scene.add.image(fromX, fromY, TICKET_TEXTURE).setScale(1.4).setDepth(POPUP_DEPTH);
      this.scene.tweens.add({
        targets: ticket,
        x: BOARD_TICKET_X,
        y: DISPLAY.y,
        scale: 0.9,
        angle: 360,
        delay: index * TICKET_FLY_STAGGER,
        duration: TICKET_FLY_TIME,
        ease: 'Cubic.easeInOut',
        onComplete: () => {
          ticket.destroy();
          pulse(this.scene, this.ticketsText);
        },
      });
    }
  }

  /** Табло подпрыгивает: в него долетели фишки. */
  pulseBoard(): void {
    pulse(this.scene, this.boardText);
  }

  /** Окошко множителя: с каким множителем пойдёт следующая прокрутка. */
  showMultiplier(multiplier: number): void {
    this.multiplierText.setText(`×${multiplier}`);
  }

  /** Множитель вырос — окошко подпрыгивает. */
  pulseMultiplier(): void {
    pulse(this.scene, this.multiplierText);
  }

  /** «Забрать» уменьшило множитель — число в окошке сжимается и возвращается (черепа — flashMultiplierRed). */
  dropMultiplier(): void {
    pulse(this.scene, this.multiplierText, MULTIPLIER_DROP_SCALE);
  }

  /**
   * Началась фаза 2: знаки «что изменилось» (PHASE_SIGNS) крупно на стекле под «ФАЗА 2», через PHASE_SIGNS_HOLD
   * они улетают под окошко множителя, уменьшаются и остаются там до конца забега; окошко подпрыгивает.
   */
  flyPhaseSigns(): void {
    for (const sign of this.phaseSigns) sign.destroy();
    this.phaseSigns = PHASE_SIGNS.map((sign, index) => {
      const offset = index - (PHASE_SIGNS.length - 1) / 2; // знаки по бокам от середины
      const style = { ...sign.style, fontSize: PHASE_SIGN_FONT_SIZE };
      const text = addText(this.scene, GLASS.x + offset * PHASE_SIGN_STEP, PHASE_SIGNS_Y, sign.text, style);
      text.setOrigin(0.5).setDepth(POPUP_DEPTH + 1); // поверх тёмной полосы новости на стекле
      this.scene.tweens.add({
        targets: text,
        x: MULTIPLIER_WINDOW.x + offset * PHASE_SIGN_SMALL_STEP,
        y: PHASE_SIGNS_HOME_Y,
        scale: PHASE_SIGN_SMALL,
        delay: PHASE_SIGNS_HOLD,
        duration: PHASE_SIGNS_FLY_TIME,
        ease: 'Cubic.easeInOut',
        onComplete: () => {
          if (index === 0) pulse(this.scene, this.multiplierText); // знаки долетели — окошко подпрыгивает (один раз)
        },
      });
      return text;
    });
  }

  /** Черепа оборвали серию: окошко множителя вспыхивает красным. */
  flashMultiplierRed(): void {
    this.multiplierText.setColor(RED_TEXT);
    pulse(this.scene, this.multiplierText);
    this.scene.time.delayedCall(MULTIPLIER_FLASH_TIME, () => this.multiplierText.setColor(LED_COLOR));
  }

  /** Горит столько лампочек, сколько прокруток осталось. Когда их мало — оставшиеся красные. Прокруток больше лампочек — лампочки добавляются. */
  showSpinsLeft(spinsLeft: number): void {
    if (spinsLeft > this.spinLamps.length) this.addSpinLamps(spinsLeft - this.spinLamps.length, true);
    const litColor = spinLampColor(spinsLeft);
    this.spinLamps.forEach((lamp, index) => lamp.setFillStyle(index < spinsLeft ? litColor : LAMP_OFF));
  }

  /** Лампочка этой прокрутки гаснет со вспышкой. */
  blinkSpinLamp(index: number): void {
    const lamp = this.spinLamps[index];
    if (!lamp) return;
    this.scene.tweens.add({ targets: lamp, scale: { from: 1.6, to: 1 }, duration: 250, ease: 'Quad.easeOut' });
  }

  /** Долг собран: оставшиеся spinsLeft лампочек подмигивают волной слева направо — эти прокрутки ещё твои. */
  winkSpinLamps(spinsLeft: number): void {
    this.spinLamps.slice(0, spinsLeft).forEach((lamp, index) => {
      this.scene.tweens.add({
        targets: lamp,
        scale: WINK_SCALE,
        delay: index * LAMP_STAGGER,
        duration: WINK_TIME,
        yoyo: true,
        repeat: WINK_TIMES - 1,
        ease: 'Quad.easeOut',
      });
    });
  }

  /**
   * Долг отдают раньше: оставшиеся count лампочек гаснут по одной справа налево — эти прокрутки пропали.
   * Сами лампочки уже погашены (showSpinsLeft), над ними гаснут их горящие копии.
   */
  burnOutSpinLamps(count: number): void {
    const color = spinLampColor(count);
    this.spinLamps.slice(0, count).forEach((lamp, index) => {
      const flame = this.scene.add.circle(lamp.x, lamp.y, SPIN_LAMP_RADIUS, color);
      this.scene.tweens.add({
        targets: flame,
        scale: WINK_SCALE,
        alpha: 0,
        delay: (count - 1 - index) * LAMP_STAGGER,
        duration: BURN_OUT_TIME,
        onComplete: () => flame.destroy(),
      });
    });
  }

  /** Новый раунд: лишние лампочки (от сигарет) убираются, остальные загораются по очереди слева направо. */
  popSpinLamps(): void {
    for (const lamp of this.spinLamps.splice(SPINS_PER_ROUND)) lamp.destroy();
    this.placeSpinLamps();
    this.spinLamps.forEach((lamp, index) => {
      this.scene.tweens.add({ targets: lamp, scale: { from: 0.3, to: 1 }, delay: index * 40, duration: 180, ease: 'Back.easeOut' });
    });
  }

  /** Рычаг дёргается: штанга переворачивается (шарик уходит вниз «на игрока») и возвращается. Шарик едет за концом штанги. */
  pullLever(): void {
    this.scene.tweens.killTweensOf(this.leverRod);
    this.leverRod.setScale(1);
    this.scene.tweens.add({
      targets: this.leverRod,
      scaleY: LEVER_PULL_SCALE,
      duration: LEVER_PULL_TIME,
      hold: LEVER_HOLD_TIME,
      yoyo: true,
      ease: 'Quad.easeIn',
      onUpdate: () => this.placeLeverBall(),
      onComplete: () => this.placeLeverBall(),
    });
  }

  /** Шарик всегда на конце штанги: штанга короче — шарик ниже. Внизу он ближе к игроку — чуть крупнее. */
  private placeLeverBall(): void {
    const stretch = this.leverRod.scaleY; // 1 — рычаг поднят, LEVER_PULL_SCALE — дёрнут до конца
    this.leverBall.setY(LEVER_MOUNT.y - LEVER_ROD_LENGTH * stretch);
    this.leverBall.setScale(1 + LEVER_BALL_GROW * (1 - stretch));
  }
}

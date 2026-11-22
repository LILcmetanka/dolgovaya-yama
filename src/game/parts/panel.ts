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
import {
  BOARD_CHIP_X,
  BOARD_CHIPS_MAX_WIDTH,
  BOARD_CHIPS_TEXT_X,
  BOARD_CHIP_HEIGHT,
  BOARD_TICKET_HEIGHT,
  BOARD_TICKET_X,
  BOARD_TICKETS_MAX_WIDTH,
  BOARD_TICKETS_TEXT_X,
  CENTER_X,
  DISPLAY,
  GLASS,
  LEVER_MOUNT,
  MULTIPLIER_WINDOW,
  PHASE_SIGNS_Y,
  SKULL_SCREEN,
  SPIN_LAMPS_Y,
} from '../layout';
import { t } from '../lang';
import { SPINS_PER_ROUND } from '../rules';
import {
  addText,
  LAMP_GOLD,
  LAMP_OFF,
  LAMP_RED,
  LED_COLOR,
  LED_STYLE,
  POPUP_DEPTH,
  pulse,
  RED_TEXT,
} from '../theme';
import { attachHint, type Hint } from './tooltip';

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
const BOARD_FONT_SIZE = 30; // числа фишек и билетов — одним шрифтом; длинное — мельче, чтобы влезло
const BOARD_MIN_FONT_SIZE = 18;
const TICKET_FLY_TIME = 600; // полученные билеты летят на табло, мс
const TICKET_FLY_STAGGER = 120;
// Окошко множителя.
const MULTIPLIER_FLASH_TIME = 600; // сколько окошко горит красным после черепов, мс
const MULTIPLIER_DROP_SCALE = 0.7; // «забрать» уменьшило множитель — число сжимается до такого размера и возвращается
// Знак фазы 2 — что изменилось: одна прокрутка в раунде прибавилась. Автор попросил убрать его графически
// («× и жёлтый треугольник», DONTLIKE б.1): черепов фаза 2 и так не множит (замечание 19), а лишнюю прокрутку видно
// по лампочкам. Набор пуст — flyPhaseSigns ничего не ставит, но механику оставляем: вернуть знак — одна строка.
const PHASE_SIGN_FONT = 26; // шрифт знака на стекле
const PHASE_SIGN_FONT_SIZE = `${PHASE_SIGN_FONT}px`;
const PHASE_SIGN_STEP = 90; // на стекле: от знака до знака
const PHASE_SIGN_SMALL = 0.5; // под окошком множителя знак во столько раз меньше…
const PHASE_SIGN_SMALL_STEP = 44; // …и стоят теснее
const PHASE_SIGNS_HOME_Y = MULTIPLIER_WINDOW.y + MULTIPLIER_WINDOW.height / 2 + 13; // под окошком множителя
const PHASE_SIGN_HOME_X = MULTIPLIER_WINDOW.x + PHASE_SIGN_SMALL_STEP / 2; // чуть правее середины окошка
const PHASE_SIGNS: { text: string; style: Phaser.Types.GameObjects.Text.TextStyle }[] = [];
// Строка доли клеток-черепов — на своём экранчике справа, над гнёздами включённых предметов (SKULL_SCREEN, layout.ts): значок 💀 сверху,
// процент под ним. Экранчик узкий, поэтому в две строки. Долю считает сцена, здесь только показ.
// Подсказку вешаем на пустую зону во весь экранчик: текст меняется, и мерить его ширину для наведения не надо.
const SHARE_ICON_SIZE = '12px'; // 💀 — мельче процента, чтобы влезал в узкое окно
const SHARE_FONT_SIZE = '13px'; // процент: «96%» моноширинным ≈ 23-24 px, по ~8 px поля с каждой стороны от 40
const SHARE_ICON_Y = SKULL_SCREEN.y - 9; // 💀 — в верхней половине экранчика (центром 196 при окне 184…226)…
const SHARE_PERCENT_Y = SKULL_SCREEN.y + 9; // …процент — в нижней (центром 214)
const SHARE_WARN = 0.27; // с такой доли клеток-черепов процент красный — предупреждение
const SHARE_HINT_WIDTH = SKULL_SCREEN.width; // подсказка — по всему экранчику
const SHARE_HINT_HEIGHT = SKULL_SCREEN.height;
const PHASE_SIGNS_HOLD = 2200; // столько мс знаки видны на стекле
const PHASE_SIGNS_FLY_TIME = 700;
// Знаки — поверх полосы новости «ФАЗА 2» (она на POPUP_DEPTH). Над панелью магазина их не видно: пока магазин
// открыт, сцена их прячет (setPhaseSignsVisible), а после закрытия возвращает.
const PHASE_SIGN_DEPTH = POPUP_DEPTH + 1;
// Рычаг: низ штанги — точка вращения, на конце штанги — шарик.
const LEVER_ROD_LENGTH = 142;
const LEVER_PULL_SCALE = -0.4; // рычаг дёрнули: штанга переворачивается, шарик уходит вниз «на игрока»
const LEVER_PULL_TIME = 130; // рывок вниз, столько же — обратно, мс
const LEVER_HOLD_TIME = 60; // сколько рычаг держится внизу, мс
const LEVER_CALL_RADIUS = 34; // кольцо вокруг шарика, пока ни разу не крутили: «потяни меня»
const LEVER_CALL_GROW = 1.25; // кольцо расходится до такого размера и гаснет
const LEVER_CALL_TIME = 900; // один «вздох» кольца, мс
const LEVER_BALL_GROW = 0.15; // внизу шарик ближе к игроку — на столько крупнее (на каждую единицу укорочения штанги)

/** Число на табло: шрифт BOARD_FONT_SIZE, а длинное число — мельче, чтобы не вылезло шире maxWidth. Тем же набирают шапку панели магазина. */
export function fitBoardNumber(text: Phaser.GameObjects.Text, value: number, maxWidth: number): void {
  text.setText(String(value));
  let size = BOARD_FONT_SIZE;
  text.setFontSize(size);
  while (text.width > maxWidth && size > BOARD_MIN_FONT_SIZE) {
    size -= 2;
    text.setFontSize(size);
  }
}

/** Цвет горящих лампочек прокруток: когда их мало — красные. */
function spinLampColor(spinsLeft: number): number {
  return spinsLeft <= LOW_SPINS ? LAMP_RED : LAMP_GOLD;
}

/** Приборы на корпусе автомата: табло с фишками, окошко множителя серии, лампочки прокруток и рычаг справа. */
export class MachinePanel {
  private readonly scene: Phaser.Scene;
  private readonly hint: Hint; // подсказки приборов: экранчик доли черепов и знак фазы 2
  private readonly boardText: Phaser.GameObjects.Text; // табло: сколько у тебя фишек
  private readonly ticketsText: Phaser.GameObjects.Text; // табло: сколько у тебя билетов
  private readonly ticketScale: number; // билет на табло во столько раз больше своей картинки — туда долетают билеты
  private readonly multiplierText: Phaser.GameObjects.Text; // окошко множителя серии
  private readonly skullShareText: Phaser.GameObjects.Text; // процент доли клеток-черепов на экранчике справа, над гнёздами
  private readonly spinLamps: Phaser.GameObjects.Arc[] = []; // лампочки прокруток: одна на прокрутку
  private freeLamps: Phaser.GameObjects.Image[] = []; // бесплатные прокрутки за короны — короны в конце ряда лампочек
  private readonly leverRod: Phaser.GameObjects.Image; // штанга рычага, низ — точка вращения
  private readonly leverBall: Phaser.GameObjects.Image; // шарик на конце штанги
  private leverCall: Phaser.GameObjects.Arc | null = null; // кольцо вокруг шарика: рычаг зовёт, пока не крутили
  private phaseSigns: Phaser.GameObjects.Text[] = []; // знаки фазы 2 под окошком множителя; в фазе 1 их нет

  /** pressLever — нажали рычаг: сцена сразу крутит (Пробел и Enter она ловит сама). */
  constructor(scene: Phaser.Scene, pressLever: () => void, hint: Hint) {
    this.scene = scene;
    this.hint = hint;
    createChipTextures(scene);
    createTicketTexture(scene);
    createCrownLampTexture(scene);
    createLeverTextures(scene, LEVER_ROD_LENGTH);

    // Табло сверху: слева фишки (сюда летит забранное, отсюда отдаётся долг), справа билеты (на амулеты).
    // Фишка и билет на глаз одного размера, числа — одним шрифтом.
    const chip = scene.add.image(BOARD_CHIP_X, DISPLAY.y, CHIP_TEXTURE);
    chip.setScale(BOARD_CHIP_HEIGHT / chip.height);
    this.boardText = addText(scene, BOARD_CHIPS_TEXT_X, DISPLAY.y, '', LED_STYLE).setOrigin(0, 0.5);
    const ticket = scene.add.image(BOARD_TICKET_X, DISPLAY.y, TICKET_TEXTURE);
    this.ticketScale = BOARD_TICKET_HEIGHT / ticket.height;
    ticket.setScale(this.ticketScale);
    this.ticketsText = addText(scene, BOARD_TICKETS_TEXT_X, DISPLAY.y, '', LED_STYLE).setOrigin(0, 0.5);

    this.addSpinLamps(SPINS_PER_ROUND);
    // Окошко множителя серии: «×3» — с таким множителем пойдёт следующая прокрутка.
    this.multiplierText = addText(scene, MULTIPLIER_WINDOW.x, MULTIPLIER_WINDOW.y, '', LED_STYLE).setOrigin(0.5);
    // Доля клеток-черепов — всегда на виду на экранчике справа, над гнёздами предметов: 💀 сверху, процент под ним.
    addText(scene, SKULL_SCREEN.x, SHARE_ICON_Y, '💀', { fontSize: SHARE_ICON_SIZE }).setOrigin(0.5);
    this.skullShareText = addText(scene, SKULL_SCREEN.x, SHARE_PERCENT_Y, '', { fontSize: SHARE_FONT_SIZE }).setOrigin(0.5);
    // Зона подсказки — пустая Zone: у неё нет картинки, но она ловит наведение (у прозрачного прямоугольника — нет).
    const shareZone = scene.add.zone(SKULL_SCREEN.x, SKULL_SCREEN.y, SHARE_HINT_WIDTH, SHARE_HINT_HEIGHT);
    shareZone.setInteractive();
    attachHint(shareZone, hint, () => [t('skullShareTitle'), t('skullShareWhat')]);

    // Рычаг справа: штанга и шарик на её конце.
    this.leverRod = scene.add.image(LEVER_MOUNT.x, LEVER_MOUNT.y, LEVER_ROD_TEXTURE).setOrigin(0.5, 1);
    this.leverBall = scene.add.image(LEVER_MOUNT.x, LEVER_MOUNT.y, LEVER_BALL_TEXTURE);
    this.placeLeverBall();
    for (const part of [this.leverRod, this.leverBall]) {
      part.setInteractive({ useHandCursor: true });
      part.on('pointerdown', pressLever);
    }
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

  /** Табло: сколько у тебя фишек. */
  showBalance(balance: number): void {
    fitBoardNumber(this.boardText, balance, BOARD_CHIPS_MAX_WIDTH);
  }

  /** Табло: сколько у тебя билетов. */
  showTickets(tickets: number): void {
    fitBoardNumber(this.ticketsText, tickets, BOARD_TICKETS_MAX_WIDTH);
  }

  /** Билеты летят на табло из (fromX, fromY) — от руки Коллектора или из витрины; долетели — число подпрыгивает. onLanded — когда долетел последний. */
  flyTickets(count: number, fromX: number, fromY: number, onLanded?: () => void): void {
    if (count <= 0) {
      onLanded?.(); // лететь нечему — число меняется сразу
      return;
    }
    for (let index = 0; index < count; index++) {
      const ticket = this.scene.add.image(fromX, fromY, TICKET_TEXTURE).setScale(1.4).setDepth(POPUP_DEPTH);
      this.scene.tweens.add({
        targets: ticket,
        x: BOARD_TICKET_X,
        y: DISPLAY.y,
        scale: this.ticketScale,
        angle: 360,
        delay: index * TICKET_FLY_STAGGER,
        duration: TICKET_FLY_TIME,
        ease: 'Cubic.easeInOut',
        onComplete: () => {
          ticket.destroy();
          if (index === count - 1) onLanded?.(); // последний долетел — можно менять число
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

  /**
   * Экранчик доли черепов: процент клеток-черепов в следующей платной прокрутке — доля растёт, и игрок это видит.
   * Долю считает сцена (RoundScene.skullShareNext — по тем же весам, что и прокрутка), здесь только показ:
   * с SHARE_WARN и выше — красным, как предупреждение.
   */
  showSkullShare(share: number): void {
    this.skullShareText.setText(`${Math.round(share * 100)}%`);
    this.skullShareText.setColor(share >= SHARE_WARN ? RED_TEXT : LED_COLOR);
  }

  /** «Забрать» уменьшило множитель — число в окошке сжимается и возвращается (черепа — flashMultiplierRed). */
  dropMultiplier(): void {
    pulse(this.scene, this.multiplierText, MULTIPLIER_DROP_SCALE);
  }

  /**
   * Началась фаза 2. Раньше на стекле под «ФАЗА 2» появлялся знак ×▲ и улетал под окошко множителя; автор попросил
   * убрать его графически (DONTLIKE б.1), поэтому набор знаков пуст и ставить нечего. Окошко множителя всё равно
   * подпрыгивает — это и есть отметка, что фаза началась. Механика знаков осталась целой: вернуть знак — добавить
   * его в PHASE_SIGNS, и он снова полетит, а подсказка (phase2Title/phase2What) заработает.
   */
  flyPhaseSigns(): void {
    for (const sign of this.phaseSigns) sign.destroy();
    this.phaseSigns = PHASE_SIGNS.map((sign, index) => {
      const offset = index - (PHASE_SIGNS.length - 1) / 2; // знак по середине стекла (сейчас он один)
      const style = { ...sign.style, fontSize: PHASE_SIGN_FONT_SIZE };
      const text = addText(this.scene, GLASS.x + offset * PHASE_SIGN_STEP, PHASE_SIGNS_Y, sign.text, style);
      text.setOrigin(0.5).setDepth(PHASE_SIGN_DEPTH); // поверх тёмной полосы новости на стекле
      text.setInteractive();
      attachHint(text, this.hint, () => [t('phase2Title'), t('phase2What')]); // резерв: знаков нет — подсказки нет
      this.scene.tweens.add({
        targets: text,
        x: PHASE_SIGN_HOME_X,
        y: PHASE_SIGNS_HOME_Y,
        scale: PHASE_SIGN_SMALL,
        delay: PHASE_SIGNS_HOLD,
        duration: PHASE_SIGNS_FLY_TIME,
        ease: 'Cubic.easeInOut',
      });
      return text;
    });
    // Знаков может не быть вовсе (их убрал автор) — окошко множителя всё равно подпрыгивает, отмечая начало фазы.
    pulse(this.scene, this.multiplierText);
  }

  /** Пока магазин открыт, знаков фазы 2 не видно: они не должны торчать поверх витрины. Закрыли — снова на месте. */
  setPhaseSignsVisible(visible: boolean): void {
    for (const sign of this.phaseSigns) sign.setVisible(visible);
  }

  /** Фаза откатилась к первой (откат кассетой или провал спасения): знаков фазы 2 больше нет — их убираем совсем. */
  clearPhaseSigns(): void {
    this.hint.hide(); // табличка могла висеть на знаке — знака не станет
    for (const sign of this.phaseSigns) {
      this.scene.tweens.killTweensOf(sign); // откат во время полёта знака не должен оставить твин на уничтоженном объекте
      sign.destroy();
    }
    this.phaseSigns = [];
  }

  /** Черепа срезали серию: окошко множителя вспыхивает красным. */
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

  /**
   * Новый раунд: лишние лампочки (от сигарет) убираются, недостающие (фаза 2 даёт прокрутку) появляются сразу,
   * остальные загораются по очереди слева направо. count — сколько прокруток в раунде: иначе лишняя лампочка
   * выскочила бы вторым «попом» из showSpinsLeft, вне общей волны.
   */
  popSpinLamps(count = SPINS_PER_ROUND): void {
    if (count > this.spinLamps.length) this.addSpinLamps(count - this.spinLamps.length);
    for (const lamp of this.spinLamps.splice(count)) lamp.destroy(); // лишние — только сверх прокруток раунда
    this.placeSpinLamps();
    this.spinLamps.forEach((lamp, index) => {
      this.scene.tweens.add({ targets: lamp, scale: { from: 0.3, to: 1 }, delay: index * 40, duration: 180, ease: 'Back.easeOut' });
    });
  }

  /** Рычаг дёргается: штанга переворачивается (шарик уходит вниз «на игрока») и возвращается. Шарик едет за концом штанги. */
  pullLever(): void {
    this.stopCallingLever();
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

  /**
   * Рычаг зовёт: вокруг шарика расходится золотое кольцо — первый раз игрок видит, что тянуть надо сюда.
   * Гаснет с первой же прокруткой (pullLever).
   */
  callLever(): void {
    if (this.leverCall) return;
    const ring = this.scene.add.circle(this.leverBall.x, this.leverBall.y, LEVER_CALL_RADIUS);
    ring.setStrokeStyle(4, LAMP_GOLD).setFillStyle(LAMP_GOLD, 0.15);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 1, to: LEVER_CALL_GROW },
      alpha: { from: 1, to: 0 },
      duration: LEVER_CALL_TIME,
      repeat: -1,
      ease: 'Sine.easeOut',
    });
    this.leverCall = ring;
  }

  /** Кольцо вокруг шарика убрать. */
  private stopCallingLever(): void {
    if (!this.leverCall) return;
    this.scene.tweens.killTweensOf(this.leverCall);
    this.leverCall.destroy();
    this.leverCall = null;
  }

  /** Шарик всегда на конце штанги: штанга короче — шарик ниже. Внизу он ближе к игроку — чуть крупнее. */
  private placeLeverBall(): void {
    const stretch = this.leverRod.scaleY; // 1 — рычаг поднят, LEVER_PULL_SCALE — дёрнут до конца
    this.leverBall.setY(LEVER_MOUNT.y - LEVER_ROD_LENGTH * stretch);
    this.leverBall.setScale(1 + LEVER_BALL_GROW * (1 - stretch));
  }
}

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
  CHARGE_ANCHOR,
  MULTIPLIER_WINDOW,
  PHASE_SIGNS_Y,
  SKULL_SCREEN,
  SPIN_LAMPS_Y,
} from '../layout';
import { t } from '../lang';
import { clampCharge, CHARGE_FULL_TIME, RISK_CHARGE } from '../levers';
import { SPINS_PER_ROUND } from '../rules';
import {
  addText,
  GOLD_TEXT,
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
// Строка доли клеток-черепов — теперь на своём экранчике слева от сетки (SKULL_SCREEN, layout.ts): значок 💀 сверху,
// процент под ним. Экранчик узкий, поэтому в две строки. Долю считает сцена, здесь только показ.
// Подсказку вешаем на пустую зону во весь экранчик: текст меняется, и мерить его ширину для наведения не надо.
const SHARE_FONT_SIZE = '15px';
const SHARE_ICON_Y = SKULL_SCREEN.y - 14; // 💀 — в верхней половине экранчика…
const SHARE_PERCENT_Y = SKULL_SCREEN.y + 13; // …процент — в нижней
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
// Шкала замаха у рычага (DONTLIKE п. 8): рамка на месте прежнего переключателя режимов и полоска внутри.
const CHARGE_FRAME = { width: 108, height: 114 }; // рамка шкалы (там же, где раньше стоял переключатель режимов)
const CHARGE_TRACK = { width: 20, height: 78 }; // жёлоб шкалы
const CHARGE_FILL_INSET = 4; // зазор между жёлобом и заливкой
const CHARGE_FILL = 0x1c1917; // тёмная заливка рамки — как у кнопок в настройках
const CHARGE_BRONZE = 0xb45309; // бронзовая окантовка автомата
const CHARGE_TRACK_COLOR = 0x0b0f19; // жёлоб — почти чёрный
const CHARGE_TEXT_Y = 42; // процент под шкалой
const CHARGE_FONT_SIZE = '13px';
const CHARGE_LOW = 0x4ade80; // слабый замах — зелёный
const CHARGE_MID = 0xfde047; // середина — жёлтый
const CHARGE_HIGH = 0xef4444; // сильный — красный
const CHARGE_MID_AT = 0.5; // с какого заряда заливка жёлтая
const CHARGE_HIGH_AT = RISK_CHARGE; // и с какого — красная: ровно порог «риска», чтобы игрок видел его цветом
const CHARGE_LOCK_TIME = 260; // на отпускании шкала коротко вспыхивает, мс

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
  private readonly skullShareText: Phaser.GameObjects.Text; // процент доли клеток-черепов на экранчике слева от сетки
  private readonly spinLamps: Phaser.GameObjects.Arc[] = []; // лампочки прокруток: одна на прокрутку
  private freeLamps: Phaser.GameObjects.Image[] = []; // бесплатные прокрутки за короны — короны в конце ряда лампочек
  private readonly leverRod: Phaser.GameObjects.Image; // штанга рычага, низ — точка вращения
  private readonly leverBall: Phaser.GameObjects.Image; // шарик на конце штанги
  private leverCall: Phaser.GameObjects.Arc | null = null; // кольцо вокруг шарика: рычаг зовёт, пока не крутили
  private phaseSigns: Phaser.GameObjects.Text[] = []; // знаки фазы 2 под окошком множителя; в фазе 1 их нет
  private chargeFrame!: Phaser.GameObjects.Rectangle; // рамка шкалы замаха у рычага
  private chargeTrack!: Phaser.GameObjects.Rectangle; // жёлоб шкалы
  private chargeFill!: Phaser.GameObjects.Rectangle; // заливка: высота = заряд
  private chargeText!: Phaser.GameObjects.Text; // процент заряда под шкалой

  /** pressLever — нажали рычаг (сцена начинает замах; Пробел и Enter она ловит сама). */
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
    // Доля клеток-черепов — всегда на виду на экранчике слева от сетки: 💀 сверху, процент под ним.
    addText(scene, SKULL_SCREEN.x, SHARE_ICON_Y, '💀', { fontSize: SHARE_FONT_SIZE }).setOrigin(0.5);
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

    // Шкала замаха — рядом с рычагом, там же, где раньше стояли плашки режимов.
    this.addChargeBar(hint);
  }

  /**
   * Шкала замаха: рамка у рычага, внутри жёлоб и заливка снизу вверх. Пока рычаг держат — заливка растёт
   * от 0 до 100% (сцена зовёт showCharge каждый кадр), на отпускании коротко вспыхивает и остаётся на заряде
   * прошлой прокрутки. Цвет: зелёный → жёлтый → красный. Подписи нет — процент и цвет понятны без языка.
   */
  private addChargeBar(hint: Hint): void {
    this.chargeFrame = this.scene.add
      .rectangle(CHARGE_ANCHOR.x, CHARGE_ANCHOR.y, CHARGE_FRAME.width, CHARGE_FRAME.height, CHARGE_FILL, 0.9)
      .setStrokeStyle(2, CHARGE_BRONZE)
      .setRounded(8);
    this.chargeTrack = this.scene.add
      .rectangle(CHARGE_ANCHOR.x, CHARGE_ANCHOR.y - 8, CHARGE_TRACK.width, CHARGE_TRACK.height, CHARGE_TRACK_COLOR)
      .setStrokeStyle(0)
      .setRounded(6);
    this.chargeFill = this.scene.add.rectangle(CHARGE_ANCHOR.x, CHARGE_ANCHOR.y - 8, CHARGE_TRACK.width - 2 * CHARGE_FILL_INSET, 1, CHARGE_LOW).setOrigin(0.5, 1).setRounded(4);
    this.chargeText = addText(this.scene, CHARGE_ANCHOR.x, CHARGE_ANCHOR.y + CHARGE_TEXT_Y, '0%', {
      fontSize: CHARGE_FONT_SIZE,
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5);
    attachHint(this.chargeFrame, hint, () => [t('chargeTitle'), t('chargeWhat', (CHARGE_FULL_TIME / 1000).toFixed(1))]);
    this.showCharge(0);
  }

  /** Заряд на шкале: value 0…1. Высота заливки, её цвет и процент. locked — короткая вспышка на отпускании. */
  showCharge(value: number, locked = false): void {
    const charge = clampCharge(value); // NaN и мусор — нейтральная середина, а не NaN-высота
    const height = Math.max(1, (CHARGE_TRACK.height - 2 * CHARGE_FILL_INSET) * charge);
    const color = charge >= CHARGE_HIGH_AT ? CHARGE_HIGH : charge >= CHARGE_MID_AT ? CHARGE_MID : CHARGE_LOW;
    this.chargeFill.setSize(CHARGE_TRACK.width - 2 * CHARGE_FILL_INSET, height).setFillStyle(color);
    this.chargeText.setText(`${Math.round(charge * 100)}%`);
    if (!locked) return;
    this.scene.tweens.killTweensOf(this.chargeFrame);
    this.scene.tweens.add({ targets: this.chargeFrame, scale: { from: 1, to: 1.08 }, duration: CHARGE_LOCK_TIME / 2, yoyo: true });
  }

  /** Спрятать шкалу: банкомат Коллектора выезжает как раз на её место. */
  setChargeVisible(visible: boolean): void {
    this.chargeFrame.setVisible(visible);
    this.chargeTrack.setVisible(visible);
    this.chargeFill.setVisible(visible);
    this.chargeText.setVisible(visible);
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

  /** Фаза откатилась к первой (последний шанс вернул счёт назад): знаков фазы 2 больше нет — их убираем совсем. */
  clearPhaseSigns(): void {
    this.hint.hide(); // табличка могла висеть на знаке — знака не станет
    for (const sign of this.phaseSigns) {
      this.scene.tweens.killTweensOf(sign); // откат во время полёта знака не должен оставить твин на уничтоженном объекте
      sign.destroy();
    }
    this.phaseSigns = [];
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

import Phaser from 'phaser';
import { CROWNS_FOR_FREE_SPINS, FREE_SPINS, JACKPOT_SPINS, JACKPOT_TICKETS } from '../bonus';
import {
  createKioskTexture,
  drawMonitorScreen,
  KIOSK_GLOW,
  KIOSK_TEXTURE,
  MONITOR_SCREEN_TEXTURE,
  type MonitorNote,
  type MonitorPrice,
} from '../decor';
import { BLOOD_WIN, SPIDER_BITE } from '../evil';
import { t } from '../lang';
import { HOME_SCROLL, MONITOR_KIOSK, MONITOR_SCREEN, MONITOR_SCROLL } from '../layout';
import { isPaying, isUnlocked, symbolsUnlockedAt, SYMBOLS, TICKET_SCATTER, type SlotSymbol } from '../rules';
import { addKeyHint, keyHint, LAMP_GOLD, LAMP_OFF } from '../theme';

const DIM_ALPHA = 0.2; // от автомата экран притушен: видно, что там что-то есть, а читать — повернувшись
const LAMP_Y = MONITOR_KIOSK.y - MONITOR_KIOSK.height / 2 + 12; // лампочка над экраном: мигает, пока новое не прочитано
const LAMP_RADIUS = 5;
const KEY_Y = MONITOR_SCREEN.y + MONITOR_SCREEN.height / 2 + 15; // подсказка клавиши — под экраном
// Анимации, мс.
const TURN_TIME = 600; // вид поворачивается к монитору или обратно
const POWER_TIME = 300; // экран разгорается или тускнеет
const BLINK_TIME = 400;

/** Что делает особый символ — надпись монитора; числа в ней — из правил, поэтому монитор не врёт, даже если их поменять. */
function symbolNote(symbol: SlotSymbol): string {
  switch (symbol.id) {
    case 'skull':
      return t('skullNote');
    case 'ticket':
      return t('ticketNote', TICKET_SCATTER);
    case 'joker':
      return t('jokerNote');
    case 'dice':
      return t('diceNote');
    case 'spider':
      return t('spiderNote', Math.round(SPIDER_BITE * 100));
    case 'clover':
      return t('cloverNote');
    case 'lock':
      return t('lockNote');
    case 'crown':
      return t('crownNote', FREE_SPINS.map((_, index) => CROWNS_FOR_FREE_SPINS + index).join(' / '), FREE_SPINS.join(' / '));
    case 'blood':
      return t('bloodNote', BLOOD_WIN);
    default:
      return '';
  }
}

/**
 * Монитор символов — терминал у правой стены. На экране: сколько платит паттерн ×1 из каждого платящего символа,
 * что делают особые символы и что даёт джекпот. Символы появляются, когда входят в автомат: в этом раунде — в золотой рамке,
 * а лампочка над экраном мигает, пока к монитору не повернёшься. От автомата экран притушен.
 * Клик по монитору (→ ловит сцена) — повернуться к нему или обратно; что можно сейчас, решает сцена.
 */
export class SymbolMonitor {
  private readonly scene: Phaser.Scene;
  private readonly kiosk: Phaser.GameObjects.Image; // корпус терминала — по нему кликают
  private readonly screen: Phaser.GameObjects.Image; // экран: цены и описания одной картинкой
  private readonly lamp: Phaser.GameObjects.Arc; // лампочка над экраном
  private readonly key: Phaser.GameObjects.Text; // «→» у автомата, «Пробел» у монитора
  private round = 0; // для какого раунда нарисован экран
  private isOpen = false; // вид повёрнут к монитору (или поворачивается)
  private isEnabled = true; // по монитору можно кликнуть
  private isHovered = false; // мышь над монитором — курсор-рука его

  /** round — какой раунд идёт: на экране символы, которые уже есть в автомате; toggle — кликнули по монитору. */
  constructor(scene: Phaser.Scene, round: number, toggle: () => void) {
    this.scene = scene;
    createKioskTexture(scene, MONITOR_KIOSK, MONITOR_SCREEN);
    this.kiosk = scene.add.image(MONITOR_KIOSK.x, MONITOR_KIOSK.y, KIOSK_TEXTURE);
    // Картинка шире корпуса (отсвет на стене) — кликать можно только по самому терминалу.
    const body = new Phaser.Geom.Rectangle(KIOSK_GLOW, KIOSK_GLOW, MONITOR_KIOSK.width, MONITOR_KIOSK.height);
    this.kiosk.setInteractive({ hitArea: body, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.kiosk.on('pointerdown', toggle);
    this.kiosk.on('pointerover', () => (this.isHovered = true));
    this.kiosk.on('pointerout', () => (this.isHovered = false));
    this.lamp = scene.add.circle(MONITOR_KIOSK.x, LAMP_Y, LAMP_RADIUS, LAMP_OFF);
    this.showRound(round); // рисует экран на canvas — до картинки экрана
    this.screen = scene.add.image(MONITOR_SCREEN.x, MONITOR_SCREEN.y, MONITOR_SCREEN_TEXTURE).setAlpha(DIM_ALPHA);
    this.key = addKeyHint(scene, MONITOR_KIOSK.x, KEY_Y, '→');
    this.blinkLamp(); // в начале забега (и после кассеты) монитор ещё не видели
  }

  /** Идёт раунд round: на экране — символы, которые есть в автомате. Вошли новые — они в рамке, лампочка мигает. */
  showRound(round: number): void {
    if (round === this.round) return;
    this.round = round;
    this.redraw();
    if (symbolsUnlockedAt(round).length > 0) this.blinkLamp();
  }

  /** Сменился язык: надписи на экране и подсказка клавиши — на новом. */
  relabel(): void {
    this.redraw();
    this.key.setText(keyHint(this.isOpen ? t('space') : '→'));
  }

  /**
   * Можно ли сейчас кликнуть по монитору (нельзя — и курсор над ним не рука). Сцена зовёт это при каждом обновлении приборов,
   * а меняется что-то, только когда «можно» сменилось. Курсор сбрасываем, только если мышь над монитором:
   * иначе рука — чужая (рычаг, красная кнопка), и сброс её бы погасил.
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.isEnabled) return;
    this.isEnabled = enabled;
    if (enabled) {
      this.kiosk.setInteractive();
      return;
    }
    this.kiosk.disableInteractive(this.isHovered);
    this.isHovered = false; // выключенный монитор не узнает, что мышь ушла, — когда включится, Phaser скажет снова
  }

  /** Вид поворачивается к монитору; повернулся — экран разгорается. Лампочка гаснет: новое прочитано. */
  open(): void {
    this.isOpen = true;
    this.key.setText(keyHint(t('space')));
    this.stopLamp();
    this.turnTo(MONITOR_SCROLL, () => {
      this.scene.tweens.add({ targets: this.screen, alpha: 1, duration: POWER_TIME });
    });
  }

  /** Экран тускнеет, вид возвращается к автомату — потом done(). */
  close(done: () => void): void {
    this.isOpen = false;
    this.key.setText(keyHint('→'));
    this.scene.tweens.killTweensOf(this.screen);
    this.scene.tweens.add({ targets: this.screen, alpha: DIM_ALPHA, duration: POWER_TIME });
    this.turnTo(HOME_SCROLL, done);
  }

  /** Повернуть вид: камера плавно уезжает до scrollX — потом done(). Поворот, который ещё идёт, отменяется. */
  private turnTo(scrollX: number, done: () => void): void {
    const camera = this.scene.cameras.main;
    this.scene.tweens.killTweensOf(camera);
    this.scene.tweens.add({ targets: camera, scrollX, duration: TURN_TIME, ease: 'Sine.easeInOut', onComplete: done });
  }

  /** Экран заново: цены — от дешёвых к дорогим, особые символы — в том порядке, как входили в автомат. */
  private redraw(): void {
    const fresh = symbolsUnlockedAt(this.round);
    const inMachine = SYMBOLS.filter((symbol) => isUnlocked(symbol, this.round));
    const prices: MonitorPrice[] = inMachine
      .filter(isPaying)
      .sort((a, b) => a.price - b.price)
      .map((symbol) => ({ symbol, price: symbol.price, isNew: fresh.includes(symbol) }));
    const notes: MonitorNote[] = inMachine
      .filter((symbol) => !isPaying(symbol))
      .sort((a, b) => a.unlockRound - b.unlockRound)
      .map((symbol) => ({ symbol, text: symbolNote(symbol), isNew: fresh.includes(symbol) }));
    const jackpot = t('jackpotNote', JACKPOT_TICKETS, JACKPOT_SPINS);
    drawMonitorScreen(this.scene, MONITOR_SCREEN.width, MONITOR_SCREEN.height, prices, notes, jackpot);
  }

  /** Лампочка над экраном мигает: на мониторе есть то, чего ты ещё не видел. */
  private blinkLamp(): void {
    this.scene.tweens.killTweensOf(this.lamp);
    this.lamp.setFillStyle(LAMP_GOLD).setAlpha(1);
    this.scene.tweens.add({ targets: this.lamp, alpha: 0.2, duration: BLINK_TIME, yoyo: true, repeat: -1 });
  }

  /** Лампочка гаснет: монитор прочитан. */
  private stopLamp(): void {
    this.scene.tweens.killTweensOf(this.lamp);
    this.lamp.setFillStyle(LAMP_OFF).setAlpha(1);
  }
}

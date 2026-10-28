import Phaser from 'phaser';
import { MAGNIFIER } from '../collectorGame';
import {
  CHIP_TEXTURE,
  createChipTextures,
  createDrumTextures,
  createItemTextures,
  drawDrumWheel,
  DRUM_BACK_TEXTURE,
  DRUM_GLOW_TEXTURE,
  DRUM_POINTER_TEXTURE,
  DRUM_WHEEL_TEXTURE,
  type DrumFace,
} from '../decor';
import { DRUM_PRICE_GROWTH, DRUM_SECTORS, prizeItem, type DrumPrize } from '../drum';
import { ITEMS } from '../items';
import { t } from '../lang';
import { BOARD_CHIP_X, DISPLAY, DRUM_RADIUS, DRUM_WHEEL, ITEM_SIZE } from '../layout';
import type { Sfx } from '../sound';
import { addKeyHint, addText, CHIP_DEPTH, LED_COLOR, LED_STYLE, RED_TEXT } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Где что: стрелка — над колесом (остриё заходит за обод), ценник — под колесом, номер клавиши — над стрелкой.
const POINTER_BOTTOM = DRUM_WHEEL.y - DRUM_RADIUS + 8;
const PRICE_Y = DRUM_WHEEL.y + DRUM_RADIUS + 24;
const PRICE_PLATE = { width: 78, height: 26 }; // тёмная табличка под ценником
const PRICE_ICON_SCALE = 0.75;
const KEY_Y = DRUM_WHEEL.y - DRUM_RADIUS - 30;
const PRIZE_AT = 0.62; // приз вылетает оттуда, где нарисована его картинка: такая доля радиуса от середины колеса
// Анимации.
const SPIN_TURNS = 3; // колесо делает столько полных оборотов, прежде чем встать
const SPIN_TIME = 2600; // мс
const LAND_JITTER = 0.3; // колесо встаёт не точно серединой сектора: до такой доли сектора в сторону
const GLOW_TIME = 450; // выпавший сектор вспыхивает, потом приз вылетает, мс
const PAY_CHIPS = 4; // столько фишек летит с табло в колесо и из колеса на табло (для красоты: сумма может быть любой)
const CHIP_FLY_TIME = 420; // мс
const CHIP_STAGGER = 70; // фишки летят друг за другом, мс
const SHAKE_TIME = 50; // один рывок тряски «не хватает фишек», мс

/** Картинка сектора: предмет — его коробочка, остальное нарисовано по имени приза. */
function faceOf(prize: DrumPrize): DrumFace {
  if (prize === 'ticket' || prize === 'slot' || prize === 'chips') return prize;
  return prizeItem(prize) ?? ITEMS[0];
}

/**
 * «Барабан» в магазине — колесо на стене справа от торгового автомата: на секторах предметы, билет, место на полке и фишки.
 * Клик по колесу (или 0, её ловит сцена) — крутить; цена — на табличке под колесом. Колесо делает несколько оборотов,
 * стрелка щёлкает о штырьки и останавливает его на секторе, который сцена выбрала заранее. Сектора, которые выпасть не могут, затемнены.
 */
export class Drum {
  private readonly scene: Phaser.Scene;
  private readonly sfx: Sfx;
  private readonly faces: DrumFace[] = DRUM_SECTORS.map(faceOf);
  private readonly wheel: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image; // вспышка выпавшего сектора
  private readonly priceText: Phaser.GameObjects.Text; // «× 15» под колесом
  private available: boolean[] = []; // какие сектора сейчас могут выпасть — так нарисовано колесо

  /** spin — кликнули по колесу; sfx — щелчки стрелки, пока колесо крутится. */
  constructor(scene: Phaser.Scene, spin: () => void, hint: Hint, sfx: Sfx) {
    this.scene = scene;
    this.sfx = sfx;
    createChipTextures(scene);
    createItemTextures(scene, [...ITEMS, MAGNIFIER], ITEM_SIZE);
    createDrumTextures(scene, DRUM_RADIUS, DRUM_SECTORS.length);
    scene.add.image(DRUM_WHEEL.x, DRUM_WHEEL.y, DRUM_BACK_TEXTURE);
    this.showAvailable(DRUM_SECTORS.map(() => true));
    this.wheel = scene.add.image(DRUM_WHEEL.x, DRUM_WHEEL.y, DRUM_WHEEL_TEXTURE);
    this.wheel.setInteractive({ useHandCursor: true });
    attachHint(this.wheel, hint, () => [t('drum'), t('drumWhat', DRUM_PRICE_GROWTH)], spin);
    this.glow = scene.add.image(DRUM_WHEEL.x, DRUM_WHEEL.y, DRUM_GLOW_TEXTURE).setOrigin(0.5, 1).setAlpha(0);
    scene.add.image(DRUM_WHEEL.x, POINTER_BOTTOM, DRUM_POINTER_TEXTURE).setOrigin(0.5, 1);
    addKeyHint(scene, DRUM_WHEEL.x, KEY_Y, '0');

    scene.add.rectangle(DRUM_WHEEL.x, PRICE_Y, PRICE_PLATE.width, PRICE_PLATE.height, 0x020617).setRounded(5);
    scene.add.image(DRUM_WHEEL.x - 22, PRICE_Y, CHIP_TEXTURE).setScale(PRICE_ICON_SCALE);
    this.priceText = addText(scene, DRUM_WHEEL.x - 8, PRICE_Y, '', { ...LED_STYLE, fontSize: '17px' }).setOrigin(0, 0.5);
  }

  /** Какие сектора могут выпасть (по сектору): остальные затемнены. Поменялось — колесо перерисовывается. */
  showAvailable(available: boolean[]): void {
    if (available.every((isOpen, sector) => isOpen === this.available[sector])) return;
    this.available = [...available];
    drawDrumWheel(this.scene, this.faces, this.available, DRUM_RADIUS);
  }

  /** Цена прокрутки; не хватает фишек — красная. */
  showPrice(price: number, canAfford: boolean): void {
    this.priceText.setText(`× ${price}`).setColor(canAfford ? LED_COLOR : RED_TEXT);
  }

  /** Не хватает фишек — ценник трясётся. */
  deny(): void {
    const homeX = DRUM_WHEEL.x - 8;
    this.scene.tweens.killTweensOf(this.priceText);
    this.priceText.setX(homeX);
    this.scene.tweens.add({
      targets: this.priceText,
      x: homeX + 6,
      duration: SHAKE_TIME,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.priceText.setX(homeX),
    });
  }

  /**
   * Крутить: фишки летят с табло в колесо, колесо делает SPIN_TURNS оборотов и встаёт сектором sector под стрелкой
   * (стрелка щёлкает на каждом штырьке), сектор вспыхивает — тогда landed(x, y): оттуда вылетает приз.
   */
  spin(sector: number, landed: (x: number, y: number) => void): void {
    this.flyChips(BOARD_CHIP_X, DISPLAY.y, DRUM_WHEEL.x, DRUM_WHEEL.y);
    const step = 360 / this.faces.length;
    const jitter = Phaser.Math.RND.realInRange(-LAND_JITTER, LAND_JITTER) * step; // не Math.random: его очередь — для призов
    const start = this.wheel.angle;
    const turn = (((jitter - sector * step - start) % 360) + 360) % 360; // сколько ещё повернуть, чтобы сектор встал наверх
    let underPointer = this.sectorAtTop();
    this.scene.tweens.add({
      targets: this.wheel,
      angle: start + SPIN_TURNS * 360 + turn,
      duration: SPIN_TIME,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const now = this.sectorAtTop();
        if (now === underPointer) return;
        underPointer = now;
        this.sfx.play('drumTick'); // под стрелкой — следующий сектор: она щёлкнула о штырёк
      },
      onComplete: () => this.land(jitter, landed),
    });
  }

  /** Какой сектор сейчас под стрелкой. Колесо повёрнуто на angle — наверху его угол −angle. */
  private sectorAtTop(): number {
    const step = 360 / this.faces.length;
    const top = (((-this.wheel.angle) % 360) + 360) % 360;
    return Math.round(top / step) % this.faces.length;
  }

  /** Колесо встало (сектор наверху, отклонён на jitter градусов): сектор вспыхивает, потом приз вылетает — landed(x, y). */
  private land(jitter: number, landed: (x: number, y: number) => void): void {
    this.glow.setAngle(jitter).setAlpha(0);
    this.scene.tweens.add({ targets: this.glow, alpha: 1, duration: GLOW_TIME / 2, yoyo: true, repeat: 1 });
    const angle = Phaser.Math.DegToRad(jitter);
    const x = DRUM_WHEEL.x + Math.sin(angle) * DRUM_RADIUS * PRIZE_AT;
    const y = DRUM_WHEEL.y - Math.cos(angle) * DRUM_RADIUS * PRIZE_AT;
    this.scene.time.delayedCall(GLOW_TIME, () => landed(x, y));
  }

  /** Выпали фишки: они летят из (x, y) на табло — потом done(). */
  payOut(x: number, y: number, done: () => void): void {
    this.flyChips(x, y, BOARD_CHIP_X, DISPLAY.y, done);
  }

  /** PAY_CHIPS фишек друг за другом летят из (fromX, fromY) в (toX, toY); долетела последняя — done(). */
  private flyChips(fromX: number, fromY: number, toX: number, toY: number, done?: () => void): void {
    for (let index = 0; index < PAY_CHIPS; index++) {
      const chip = this.scene.add.image(fromX, fromY, CHIP_TEXTURE).setDepth(CHIP_DEPTH);
      const isLast = index === PAY_CHIPS - 1;
      this.scene.tweens.add({
        targets: chip,
        x: toX,
        y: toY,
        delay: index * CHIP_STAGGER,
        duration: CHIP_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          chip.destroy();
          if (isLast) done?.();
        },
      });
    }
  }
}

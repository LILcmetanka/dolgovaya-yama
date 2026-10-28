import Phaser from 'phaser';
import {
  amuletTexture,
  CHIP_TEXTURE,
  createAmuletTextures,
  createChipTextures,
  createSocketCapTexture,
  createTicketTexture,
  SOCKET_CAP_TEXTURE,
  TICKET_TEXTURE,
} from '../decor';
import { AMULET_OFFER_SIZE, AMULETS, type Amulet } from '../amulets';
import { t } from '../lang';
import {
  AMULET_CASE_ICON_Y,
  AMULET_CASE_KEY_Y,
  AMULET_CASE_PLACES,
  AMULET_CASE_PRICE_Y,
  AMULET_SIZE,
  amuletCaseX,
  BOARD_CHIP_X,
  BOARD_TICKET_X,
  DISPLAY,
  SOCKET_RADIUS,
} from '../layout';
import { addKeyHint, addText, CHIP_DEPTH, LED_COLOR, LED_STYLE, RED_TEXT } from '../theme';
import { attachHint, type Hint } from './tooltip';

/** Места в витрине: сначала амулеты, потом билет за фишки и гнездо за билеты. */
export const TICKET_PLACE = AMULET_OFFER_SIZE;
export const SOCKET_PLACE = AMULET_OFFER_SIZE + 1;
// Размеры: амулет и билет в витрине крупнее, чем в гнезде и на табло.
const GOOD_SCALES = { amulet: 1.35, ticket: 1.5, socket: 1.15 };
const PRICE_ICON_SCALE = 0.6;
const DIM_ALPHA = 0.4; // амулет некуда поставить — он тусклый
// Анимации, мс.
const PAY_FLY_TIME = 400; // билеты или фишки летят с табло в витрину
const PAY_STAGGER = 70;
const SHAKE_TIME = 50; // один рывок тряски «не хватает»

/** Что лежит в витрине. */
export interface CaseStock {
  amulets: Amulet[]; // амулеты по местам; если их меньше AMULET_OFFER_SIZE — места пустые
  amuletPrices: number[]; // их цены в билетах
  ticketPrice: number | null; // билет в фишках; null — уже купили
  socketPrice: number | null; // гнездо в билетах; null — гнёзд больше не продают
}

/** Чем платят за место: за амулеты и гнездо — билетами, за билет — фишками. */
function paysWithChips(place: number): boolean {
  return place === TICKET_PLACE;
}

/**
 * Витрина амулетов на стене над торговым автоматом: 2 амулета, билет и гнездо.
 * Клик по месту (или клавиша с номером, её ловит сцена) — купить. При наведении — подсказка.
 */
export class AmuletCase {
  private readonly scene: Phaser.Scene;
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит на месте
  private readonly priceIcons: Phaser.GameObjects.Image[] = []; // ценник: билет или фишка…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 2»
  private prices: (number | null)[] = []; // цена места; null — место пустое
  private amulets: (Amulet | null)[] = []; // какой амулет на каком месте

  /** buy(place) — кликнули по месту витрины. */
  constructor(scene: Phaser.Scene, buy: (place: number) => void, hint: Hint) {
    this.scene = scene;
    createChipTextures(scene);
    createTicketTexture(scene);
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    createSocketCapTexture(scene, SOCKET_RADIUS);
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      const x = amuletCaseX(place, AMULET_CASE_PLACES);
      const good = scene.add.image(x, AMULET_CASE_ICON_Y, this.textureFor(place)).setScale(this.scaleFor(place)).setVisible(false);
      good.setInteractive({ useHandCursor: true });
      attachHint(good, hint, () => this.hintFor(place), () => buy(place));
      this.goods.push(good);
      const icon = paysWithChips(place) ? CHIP_TEXTURE : TICKET_TEXTURE;
      this.priceIcons.push(scene.add.image(x - 18, AMULET_CASE_PRICE_Y, icon).setScale(PRICE_ICON_SCALE).setVisible(false));
      this.priceTexts.push(addText(scene, x - 6, AMULET_CASE_PRICE_Y, '', { ...LED_STYLE, fontSize: '16px' }).setOrigin(0, 0.5));
      addKeyHint(scene, x, AMULET_CASE_KEY_Y, String(place + 5)); // клавиши 5–8
    }
  }

  /** Картинка места: амулет, билет или заглушка гнезда. */
  private textureFor(place: number): string {
    if (place === TICKET_PLACE) return TICKET_TEXTURE;
    if (place === SOCKET_PLACE) return SOCKET_CAP_TEXTURE;
    const amulet = this.amulets[place];
    return amulet ? amuletTexture(amulet) : amuletTexture(AMULETS[0]);
  }

  private scaleFor(place: number): number {
    if (place === TICKET_PLACE) return GOOD_SCALES.ticket;
    if (place === SOCKET_PLACE) return GOOD_SCALES.socket;
    return GOOD_SCALES.amulet;
  }

  /** Подсказка места: что это и что делает. */
  private hintFor(place: number): [string, string] | null {
    if (this.prices[place] === null) return null;
    if (place === TICKET_PLACE) return [t('ticket'), t('ticketWhat')];
    if (place === SOCKET_PLACE) return [t('socket'), t('socketWhat')];
    const amulet = this.amulets[place];
    return amulet ? [t(amulet.name), t(amulet.description)] : null;
  }

  /** Разложить товар. Амулетов может быть меньше мест — тогда место пустое. */
  fill(stock: CaseStock): void {
    this.amulets = [];
    this.prices = [];
    for (let place = 0; place < AMULET_OFFER_SIZE; place++) {
      const amulet = stock.amulets[place] ?? null;
      this.amulets.push(amulet);
      this.prices.push(amulet ? stock.amuletPrices[place] : null);
    }
    this.prices.push(stock.ticketPrice, stock.socketPrice);
    for (let place = 0; place < AMULET_CASE_PLACES; place++) this.showPlace(place);
  }

  /** Место как есть: товар и ценник; пустое место — ничего. */
  private showPlace(place: number): void {
    const price = this.prices[place];
    const isEmpty = price === null;
    const good = this.goods[place];
    good.setTexture(this.textureFor(place)).setScale(this.scaleFor(place));
    good.setPosition(amuletCaseX(place, AMULET_CASE_PLACES), AMULET_CASE_ICON_Y).setAlpha(1).setVisible(!isEmpty);
    this.priceIcons[place].setVisible(!isEmpty);
    this.priceTexts[place].setText(isEmpty ? '' : `× ${price}`);
  }

  /**
   * Ценники: хватает (фишек для билета, билетов для остального) — жёлтые, нет — красные.
   * Нет свободного гнезда — амулеты тусклые. socketPrice — цена следующего гнезда (или null).
   */
  refresh(balance: number, tickets: number, hasFreeSocket: boolean, socketPrice: number | null): void {
    if (socketPrice !== this.prices[SOCKET_PLACE]) {
      this.prices[SOCKET_PLACE] = socketPrice;
      this.showPlace(SOCKET_PLACE);
    }
    this.prices.forEach((price, place) => {
      if (price === null) return;
      const money = paysWithChips(place) ? balance : tickets;
      this.priceTexts[place].setColor(price <= money ? LED_COLOR : RED_TEXT);
      const isAmulet = place < AMULET_OFFER_SIZE;
      this.goods[place].setAlpha(isAmulet && !hasFreeSocket ? DIM_ALPHA : 1);
    });
  }

  /** Купили место place: с табло в витрину летят билеты (или фишки — за билет), товар исчезает — landed(x, y) с его места. */
  sell(place: number, landed: (x: number, y: number) => void): void {
    const good = this.goods[place];
    const { x, y } = good;
    const fromX = paysWithChips(place) ? BOARD_CHIP_X : BOARD_TICKET_X;
    const texture = paysWithChips(place) ? CHIP_TEXTURE : TICKET_TEXTURE;
    const count = 3; // для красоты: цена может быть любой
    for (let index = 0; index < count; index++) {
      const coin = this.scene.add.image(fromX, DISPLAY.y, texture).setDepth(CHIP_DEPTH);
      this.scene.tweens.add({
        targets: coin,
        x,
        y,
        scale: 0.5,
        delay: index * PAY_STAGGER,
        duration: PAY_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => coin.destroy(),
      });
    }
    // Ценник пропадает сразу, товар — когда до него долетит оплата. Новое гнездо (его покажет refresh) не прячем.
    this.prices[place] = null;
    this.priceIcons[place].setVisible(false);
    this.priceTexts[place].setText('');
    this.scene.time.delayedCall(count * PAY_STAGGER + PAY_FLY_TIME, () => {
      if (this.prices[place] === null) good.setVisible(false);
      landed(x, y);
    });
  }

  /** Не хватает: ценник места трясётся. */
  deny(place: number): void {
    const text = this.priceTexts[place];
    const homeX = amuletCaseX(place, AMULET_CASE_PLACES) - 6;
    this.scene.tweens.killTweensOf(text);
    text.setX(homeX);
    this.scene.tweens.add({ targets: text, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => text.setX(homeX) });
  }
}

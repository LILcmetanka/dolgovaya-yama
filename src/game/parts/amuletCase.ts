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
  AMULET_CASE,
  AMULET_CASE_ICON_Y,
  AMULET_CASE_PLACES,
  AMULET_CASE_PRICE_Y,
  AMULET_SIZE,
  amuletCaseX,
  BOARD_CHIP_X,
  BOARD_TICKET_X,
  DISPLAY,
  SOCKET_RADIUS,
} from '../layout';
import { addText, CHIP_DEPTH, LED_COLOR, LED_STYLE, RED_TEXT } from '../theme';
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
// Чемодан: выезжает сверху, крышка откидывается, вещи появляются по одной.
const SLIDE_FROM = 260; // с какой высоты выезжает
const SLIDE_DELAY = 350; // ждёт, пока вид повернётся к магазину
const SLIDE_TIME = 450;
const LID_TIME = 350; // крышка открывается
const POP_TIME = 220;
const POP_STAGGER = 90;
const LID_RAISED = 44; // высота откинутой крышки над чемоданом
// Слои: корпус (с закрытой крышкой), потом вещи и ценники — их показывают, когда крышка уже открыта.
const BODY_DEPTH = 1;
const GOODS_DEPTH = 2;
const LEATHER = 0x6b3f1d;
const LEATHER_LIGHT = 0x8a5a2b;
const GOLD = 0xd4a62a;

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
 * Чемодан с амулетами на стене над торговым автоматом: 2 амулета, билет и гнездо.
 * При входе в магазин он выезжает сверху закрытым, крышка откидывается, вещи появляются по одной.
 * Клик по месту (или клавиша с номером, её ловит сцена) — купить, когда чемодан открыт. При наведении — подсказка.
 */
export class AmuletCase {
  private readonly scene: Phaser.Scene;
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит на месте
  private readonly priceIcons: Phaser.GameObjects.Image[] = []; // ценник: билет или фишка…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 2»
  private prices: (number | null)[] = []; // цена места; null — место пустое
  private amulets: (Amulet | null)[] = []; // какой амулет на каком месте
  private readonly suitcase: Phaser.GameObjects.Container; // корпус и обе крышки — выезжают вместе
  private readonly lidFront: Phaser.GameObjects.Container; // закрытая крышка: закрывает вещи
  private readonly lidBack: Phaser.GameObjects.Container; // откинутая крышка: стоит над чемоданом
  private open = false; // крышка откинута, вещи на местах — можно покупать

  /** Чемодан открыт — можно покупать. */
  get isOpen(): boolean {
    return this.open;
  }

  /** buy(place) — кликнули по месту витрины. */
  constructor(scene: Phaser.Scene, buy: (place: number) => void, hint: Hint) {
    this.scene = scene;
    createChipTextures(scene);
    createTicketTexture(scene);
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    createSocketCapTexture(scene, SOCKET_RADIUS);
    const { suitcase, lidFront, lidBack } = this.buildSuitcase();
    this.suitcase = suitcase;
    this.lidFront = lidFront;
    this.lidBack = lidBack;
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      const x = amuletCaseX(place, AMULET_CASE_PLACES);
      const good = scene.add.image(x, AMULET_CASE_ICON_Y, this.textureFor(place)).setScale(this.scaleFor(place)).setVisible(false);
      good.setInteractive({ useHandCursor: true }).setDepth(GOODS_DEPTH);
      attachHint(good, hint, () => (this.open ? this.hintFor(place) : null), () => buy(place));
      this.goods.push(good);
      const icon = paysWithChips(place) ? CHIP_TEXTURE : TICKET_TEXTURE;
      this.priceIcons.push(scene.add.image(x - 18, AMULET_CASE_PRICE_Y, icon).setScale(PRICE_ICON_SCALE).setDepth(GOODS_DEPTH).setVisible(false));
      this.priceTexts.push(addText(scene, x - 6, AMULET_CASE_PRICE_Y, '', { ...LED_STYLE, fontSize: '16px' }).setOrigin(0, 0.5).setDepth(GOODS_DEPTH));
    }
  }

  /** Чемодан из частей: корпус с красной подкладкой и табличками под ценники, закрытая крышка с замками, откинутая крышка. */
  private buildSuitcase(): { suitcase: Phaser.GameObjects.Container; lidFront: Phaser.GameObjects.Container; lidBack: Phaser.GameObjects.Container } {
    const scene = this.scene;
    const { x, y, width, height } = AMULET_CASE;
    const left = x - width / 2;
    const top = y - height / 2;

    const body = scene.add.graphics();
    body.fillStyle(0x000000, 0.5);
    body.fillRoundedRect(left + 10, top + 8, width, height, 10); // тень на стене
    body.fillStyle(LEATHER);
    body.fillRoundedRect(left, top, width, height, 10); // корпус
    body.fillStyle(0x3f0a0a);
    body.fillRoundedRect(left + 10, top + 8, width - 20, height - 16, 6); // красная подкладка
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      const placeX = amuletCaseX(place, AMULET_CASE_PLACES);
      body.fillStyle(0x000000, 0.35);
      body.fillEllipse(placeX, AMULET_CASE_ICON_Y + 27, 48, 10); // тень под вещью
      body.fillStyle(0x1c0505);
      body.fillRoundedRect(placeX - 34, AMULET_CASE_PRICE_Y - 12, 68, 24, 5); // табличка для ценника
    }
    body.fillStyle(GOLD);
    for (const corner of [left + 4, left + width - 16]) body.fillRect(corner, top + height - 14, 12, 10); // уголки внизу

    const lidFront = scene.add.container(x, top); // от верхнего края корпуса вниз: сжимается вверх
    const front = scene.add.graphics();
    front.fillStyle(LEATHER_LIGHT);
    front.fillRoundedRect(-width / 2, 0, width, height, 10);
    front.lineStyle(2, 0x3b2412, 0.8);
    front.strokeRoundedRect(-width / 2 + 8, 8, width - 16, height - 16, 6); // строчка
    front.fillStyle(0x3b2412);
    front.fillRect(-width / 2, height * 0.55, width, 6); // ремень
    front.fillStyle(GOLD);
    for (const latchX of [-width / 3, width / 3]) front.fillRoundedRect(latchX - 14, height * 0.55 - 5, 28, 16, 3); // замки
    front.lineStyle(5, 0x2a1a0e);
    front.strokeRoundedRect(-24, -7, 48, 16, 6); // ручка
    lidFront.add(front);

    const lidBack = scene.add.container(x, top).setScale(1, 0); // от верхнего края корпуса вверх: растёт вверх
    const back = scene.add.graphics();
    back.fillStyle(LEATHER);
    back.fillRoundedRect(-width / 2 + 6, -LID_RAISED, width - 12, LID_RAISED + 4, { tl: 8, tr: 8, bl: 0, br: 0 });
    back.fillStyle(0x5a1010);
    back.fillRoundedRect(-width / 2 + 14, -LID_RAISED + 7, width - 28, LID_RAISED - 6, 4); // подкладка крышки
    lidBack.add(back);

    const suitcase = scene.add.container(0, 0, [lidBack, body]);
    suitcase.setDepth(BODY_DEPTH);
    suitcase.add(lidFront); // едет вместе с корпусом, закрытая крышка рисуется поверх корпуса
    return { suitcase, lidFront, lidBack };
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
    this.open = false;
    for (let place = 0; place < AMULET_CASE_PLACES; place++) this.showPlace(place);
    this.playOpening();
  }

  /** Чемодан выезжает закрытым, крышка откидывается, вещи появляются по одной — потом можно покупать. */
  private playOpening(): void {
    const tweens = this.scene.tweens;
    for (const target of [this.suitcase, this.lidFront, this.lidBack, ...this.goods]) tweens.killTweensOf(target);
    this.suitcase.setY(-SLIDE_FROM);
    this.lidFront.setScale(1, 1);
    this.lidBack.setScale(1, 0);
    tweens.add({
      targets: this.suitcase,
      y: 0,
      delay: SLIDE_DELAY,
      duration: SLIDE_TIME,
      ease: 'Back.easeOut',
      onComplete: () => {
        tweens.add({ targets: this.lidFront, scaleY: 0, duration: LID_TIME, ease: 'Sine.easeInOut' });
        tweens.add({ targets: this.lidBack, scaleY: 1, duration: LID_TIME, ease: 'Sine.easeInOut', onComplete: () => this.popGoods() });
      },
    });
  }

  /** Вещи и ценники появляются по одной, пустые места пропускаем. */
  private popGoods(): void {
    this.open = true;
    let shown = 0;
    this.prices.forEach((price, place) => {
      if (price === null) return;
      const good = this.goods[place];
      const scale = this.scaleFor(place);
      const delay = shown++ * POP_STAGGER;
      good.setVisible(true).setScale(0);
      this.scene.tweens.add({ targets: good, scale, delay, duration: POP_TIME, ease: 'Back.easeOut' });
      for (const tag of [this.priceIcons[place], this.priceTexts[place]]) {
        tag.setVisible(true).setAlpha(0);
        this.scene.tweens.add({ targets: tag, alpha: 1, delay, duration: POP_TIME });
      }
    });
  }

  /** Место как есть: товар и ценник; пустое место — ничего. */
  private showPlace(place: number): void {
    const price = this.prices[place];
    const isEmpty = price === null;
    const good = this.goods[place];
    good.setTexture(this.textureFor(place)).setScale(this.scaleFor(place));
    const isShown = !isEmpty && this.open; // пока чемодан закрыт, вещи прячутся: их покажет popGoods
    good.setPosition(amuletCaseX(place, AMULET_CASE_PLACES), AMULET_CASE_ICON_Y).setAlpha(1).setVisible(isShown);
    this.priceIcons[place].setVisible(isShown);
    this.priceTexts[place].setText(isEmpty ? '' : `× ${price}`).setVisible(isShown);
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

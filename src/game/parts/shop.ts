import Phaser from 'phaser';
import {
  CHIP_TEXTURE,
  createChipTextures,
  createItemTextures,
  createLeaveButtonTexture,
  createShelfTextures,
  createTicketTexture,
  drawShopPanel,
  itemTexture,
  LEAVE_BUTTON_TEXTURE,
  SHELF_CELL_TEXTURE,
  TICKET_TEXTURE,
} from '../decor';
import { ITEMS, OFFER_SIZE, type Item } from '../items';
import { t } from '../lang';
import {
  ITEM_SIZE,
  SHELF_CELL,
  SHOP_CLOSED_Y,
  SHOP_HUD,
  SHOP_HUD_CHIPS_MAX_WIDTH,
  SHOP_HUD_CHIP_HEIGHT,
  SHOP_HUD_TICKETS_MAX_WIDTH,
  SHOP_HUD_TICKET_HEIGHT,
  SHOP_LEAVE,
  VENDING_BIN,
  VENDING_COIN_SLOT,
  VENDING_GOOD_X,
  VENDING_PRICE_X,
  vendingRowY,
} from '../layout';
import { addText, LED_COLOR, LED_STYLE, POPUP_DEPTH, pulse, RED_TEXT, SHOP_FLY_DEPTH, SHOP_PANEL_DEPTH } from '../theme';
import { fitBoardNumber } from './panel';
import { attachHint, type Hint } from './tooltip';

/** Нижний ряд торгового автомата — не предмет, а ещё одно место на полке. */
export const SLOT_ROW = OFFER_SIZE;
const ROWS = OFFER_SIZE + 1;
// Что где в ряду: предмет слева, ценник справа.
const GOOD_SCALE = 0.9; // предмет в спирали
const SLOT_GOOD_SCALE = 0.72; // пустая клетка полки «на продажу»
const PRICE_TEXT_OFFSET = 14; // «× 20» — правее фишки ценника
const DIM_ALPHA = 0.4; // предмет некуда положить — он тусклый
// Анимации, мс.
const SLIDE_TIME = 480; // панель съезжает сверху и уезжает обратно, как рольставня
const PAY_CHIPS = 5; // столько фишек летит с табло в щель (для красоты: цена может быть любой)
const PAY_FLY_TIME = 450;
const PAY_STAGGER = 60; // фишки летят друг за другом
const DROP_TIME = 350; // покупка падает в лоток
const SHAKE_TIME = 50; // один рывок тряски «не хватает фишек»
const TICKET_FLY_TIME = 600; // билет летит в шапку панели

/**
 * Магазин: панель поверх комнаты (съезжает сверху, как жалюзи, и так же уезжает), на ней торговый автомат с предметами
 * и ценниками, в нижнем ряду — место на полке, в шапке — сколько у тебя фишек и билетов. Чемодан с амулетами
 * (его рисует AmuletCase), барабан и кассета — тоже на панели.
 * Клик по ряду (или клавиша с его номером, её ловит сцена) — купить. При наведении — подсказка.
 */
export class Shop {
  private readonly scene: Phaser.Scene;
  private readonly shopLayer: Phaser.GameObjects.Container; // панель: её вещи и вещи AmuletCase, Drum, Cassette
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит в ряду; в нижнем — клетка полки
  private readonly priceChips: Phaser.GameObjects.Image[] = []; // ценник: фишка…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 20»
  private prices: (number | null)[] = []; // цена ряда; null — ряд пуст: купили или больше не продаётся
  private items: (Item | null)[] = []; // какой предмет в каком ряду
  private readonly hudChipsText: Phaser.GameObjects.Text; // шапка панели: сколько фишек
  private readonly hudTicketsText: Phaser.GameObjects.Text; // шапка панели: сколько билетов
  private readonly hudTicketScale: number; // билет в полёте — такого размера, как значок в шапке

  /** Слой панели: в него кладут свои вещи AmuletCase, Drum и Cassette. */
  get layer(): Phaser.GameObjects.Container {
    return this.shopLayer;
  }

  /** buy(row) — кликнули по ряду, leave — по кнопке «назад к автомату». */
  constructor(scene: Phaser.Scene, buy: (row: number) => void, leave: () => void, hint: Hint) {
    this.scene = scene;
    // Панель — первым: AmuletCase, Drum и Cassette создаются после Shop и кладут свои вещи в этот слой.
    this.shopLayer = scene.add.container(0, SHOP_CLOSED_Y).setDepth(SHOP_PANEL_DEPTH).setVisible(false);
    createChipTextures(scene);
    createTicketTexture(scene);
    createItemTextures(scene, ITEMS, ITEM_SIZE);
    createShelfTextures(scene, SHELF_CELL);
    createLeaveButtonTexture(scene);
    const [panelBackground, machine] = drawShopPanel(scene, ROWS);
    panelBackground.setInteractive(); // панель ловит клики: они не проходят сквозь неё на рычаг, телевизор и полку
    this.shopLayer.add([panelBackground, machine]);

    // Табло панели: сколько фишек и билетов — корпус с табло за панелью не виден. Числа — как на табло корпуса.
    const hudChip = scene.add.image(SHOP_HUD.chipX, SHOP_HUD.y, CHIP_TEXTURE);
    hudChip.setScale(SHOP_HUD_CHIP_HEIGHT / hudChip.height);
    const hudTicket = scene.add.image(SHOP_HUD.ticketX, SHOP_HUD.y, TICKET_TEXTURE);
    this.hudTicketScale = SHOP_HUD_TICKET_HEIGHT / hudTicket.height;
    hudTicket.setScale(this.hudTicketScale);
    this.hudChipsText = addText(scene, SHOP_HUD.chipsX, SHOP_HUD.y, '', LED_STYLE).setOrigin(0, 0.5);
    this.hudTicketsText = addText(scene, SHOP_HUD.ticketsX, SHOP_HUD.y, '', LED_STYLE).setOrigin(0, 0.5);
    this.shopLayer.add([hudChip, hudTicket, this.hudChipsText, this.hudTicketsText]);

    for (let row = 0; row < ROWS; row++) {
      const y = vendingRowY(row, ROWS);
      const texture = row === SLOT_ROW ? SHELF_CELL_TEXTURE : itemTexture(ITEMS[0]);
      const good = scene.add.image(VENDING_GOOD_X, y, texture).setScale(row === SLOT_ROW ? SLOT_GOOD_SCALE : GOOD_SCALE).setVisible(false);
      good.setInteractive({ useHandCursor: true });
      attachHint(good, hint, () => this.hintFor(row), () => buy(row));
      this.goods.push(good);
      const priceChip = scene.add.image(VENDING_PRICE_X, y, CHIP_TEXTURE).setScale(0.75).setVisible(false);
      this.priceChips.push(priceChip);
      const priceStyle = { ...LED_STYLE, fontSize: '19px' };
      const priceText = addText(scene, VENDING_PRICE_X + PRICE_TEXT_OFFSET, y, '', priceStyle).setOrigin(0, 0.5);
      this.priceTexts.push(priceText);
      this.shopLayer.add([good, priceChip, priceText]);
    }

    // Кнопка «назад к игровому автомату» — стрелка вправо.
    const leaveButton = scene.add.image(SHOP_LEAVE.x, SHOP_LEAVE.y, LEAVE_BUTTON_TEXTURE);
    leaveButton.setInteractive({ useHandCursor: true });
    leaveButton.on('pointerdown', leave);
    this.shopLayer.add(leaveButton);
  }

  /** Подсказка ряда: что за предмет и что он делает. */
  private hintFor(row: number): [string, string] | null {
    if (this.prices[row] === null) return null;
    if (row === SLOT_ROW) return [t('shelfSlot'), t('shelfSlotWhat')];
    const item = this.items[row];
    return item ? [t(item.name), t(item.description)] : null;
  }

  /** Разложить товар (prices — цены предметов, slotPrice — места; null — мест больше не продают) и открыть панель. Панель опустилась — ready(). */
  open(offer: Item[], prices: number[], slotPrice: number | null, ready: () => void): void {
    this.items = [];
    this.prices = [];
    for (let row = 0; row < OFFER_SIZE; row++) {
      const item = offer[row] ?? null;
      this.items.push(item);
      this.prices.push(item ? prices[row] : null);
      if (item) this.goods[row].setTexture(itemTexture(item));
    }
    this.prices.push(slotPrice);
    for (let row = 0; row < ROWS; row++) this.showRow(row);
    this.show(ready);
  }

  /** Ряд как есть: предмет в спирали и ценник справа; пустой ряд — ничего. */
  private showRow(row: number): void {
    const price = this.prices[row];
    const isEmpty = price === null;
    this.goods[row].setPosition(VENDING_GOOD_X, vendingRowY(row, ROWS)).setAlpha(1).setVisible(!isEmpty);
    this.priceChips[row].setVisible(!isEmpty);
    this.priceTexts[row].setText(isEmpty ? '' : `× ${price}`);
  }

  /**
   * Ценники по фишкам на табло: хватает — жёлтые, нет — красные. Некуда положить предмет — предметы тусклые.
   * slotPrice — цена следующего места: после покупки места в нижнем ряду появляется следующее (или ряд пустеет).
   */
  refresh(balance: number, hasFreeSlot: boolean, slotPrice: number | null): void {
    if (slotPrice !== this.prices[SLOT_ROW]) {
      this.prices[SLOT_ROW] = slotPrice;
      this.showRow(SLOT_ROW);
    }
    this.prices.forEach((price, row) => {
      if (price === null) return;
      this.priceTexts[row].setColor(price <= balance ? LED_COLOR : RED_TEXT);
      this.goods[row].setAlpha(row === SLOT_ROW || hasFreeSlot ? 1 : DIM_ALPHA);
    });
  }

  /** Купили ряд row: фишки летят с табло в щель, покупка падает в лоток — тогда landed(x, y) с места лотка. */
  sell(row: number, landed: (x: number, y: number) => void): void {
    const good = this.goods[row];
    const falling = this.scene.add.image(good.x, good.y, good.texture.key).setScale(good.scaleX).setDepth(POPUP_DEPTH);
    this.prices[row] = null;
    this.showRow(row); // ряд опустел
    this.payChips();
    this.scene.tweens.add({
      targets: falling,
      y: VENDING_BIN.y,
      delay: PAY_CHIPS * PAY_STAGGER + PAY_FLY_TIME, // сначала фишки, потом покупка
      duration: DROP_TIME,
      ease: 'Quad.easeIn',
      onComplete: () => {
        falling.destroy();
        landed(VENDING_BIN.x, VENDING_BIN.y);
      },
    });
  }

  /** Фишки летят с табло панели (а не с закрытого корпусом) в щель торгового автомата. */
  private payChips(): void {
    for (let index = 0; index < PAY_CHIPS; index++) {
      const chip = this.scene.add.image(SHOP_HUD.chipX, SHOP_HUD.y, CHIP_TEXTURE).setScale(1.1).setDepth(SHOP_FLY_DEPTH);
      this.scene.tweens.add({
        targets: chip,
        x: VENDING_COIN_SLOT.x,
        y: VENDING_COIN_SLOT.y,
        scale: 0.6,
        delay: index * PAY_STAGGER,
        duration: PAY_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => chip.destroy(),
      });
    }
  }

  /** Сколько у тебя фишек и билетов — числа в шапке панели. Их ставят вместе с табло корпуса (refreshHud). */
  showMoney(chips: number, tickets: number): void {
    fitBoardNumber(this.hudChipsText, chips, SHOP_HUD_CHIPS_MAX_WIDTH);
    fitBoardNumber(this.hudTicketsText, tickets, SHOP_HUD_TICKETS_MAX_WIDTH);
  }

  /** В шапку долетели фишки — число подпрыгивает. */
  pulseChips(): void {
    pulse(this.scene, this.hudChipsText);
  }

  /** Билет летит из (fromX, fromY) в шапку панели — к числу билетов; долетел — число подпрыгивает. */
  flyTicket(fromX: number, fromY: number): void {
    const ticket = this.scene.add.image(fromX, fromY, TICKET_TEXTURE).setScale(1.4).setDepth(SHOP_FLY_DEPTH);
    this.scene.tweens.add({
      targets: ticket,
      x: SHOP_HUD.ticketX,
      y: SHOP_HUD.y,
      scale: this.hudTicketScale,
      angle: 360,
      duration: TICKET_FLY_TIME,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        ticket.destroy();
        pulse(this.scene, this.hudTicketsText);
      },
    });
  }

  /** Не хватает фишек: ценник ряда row трясётся. */
  deny(row: number): void {
    const text = this.priceTexts[row];
    const homeX = VENDING_PRICE_X + PRICE_TEXT_OFFSET;
    this.scene.tweens.killTweensOf(text);
    text.setX(homeX);
    this.scene.tweens.add({ targets: text, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => text.setX(homeX) });
  }

  /** Панель уехала наверх — done(): новый раунд. */
  close(done: () => void): void {
    this.hide(done);
  }

  /** Открыть панель: она съезжает сверху, как рольставня, и закрывает комнату; опустилась — ready(). Пока едет, покупать нельзя. */
  show(ready: () => void): void {
    const tweens = this.scene.tweens;
    tweens.killTweensOf(this.shopLayer);
    this.shopLayer.setVisible(true).setY(SHOP_CLOSED_Y);
    tweens.add({ targets: this.shopLayer, y: 0, duration: SLIDE_TIME, ease: 'Cubic.easeOut', onComplete: ready });
  }

  /** Закрыть панель: она уезжает вверх; уехала — её не видно и она не ловит клики, done(). */
  hide(done: () => void): void {
    const tweens = this.scene.tweens;
    tweens.killTweensOf(this.shopLayer);
    tweens.add({
      targets: this.shopLayer,
      y: SHOP_CLOSED_Y,
      duration: SLIDE_TIME,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.shopLayer.setVisible(false);
        done();
      },
    });
  }
}

import Phaser from 'phaser';
import {
  CHIP_TEXTURE,
  createChipTextures,
  createItemTextures,
  createTicketTexture,
  drawShopPanel,
  itemTexture,
  TICKET_TEXTURE,
} from '../decor';
import { ITEMS, OFFER_SIZE, type Item } from '../items';
import { t } from '../lang';
import {
  ITEM_SIZE,
  SHOP_CLOSED_Y,
  SHOP_CROSS,
  SHOP_HANDLE,
  SHOP_HUD,
  SHOP_HUD_CHIPS_MAX_WIDTH,
  SHOP_HUD_CHIP_HEIGHT,
  SHOP_HUD_TICKETS_MAX_WIDTH,
  SHOP_HUD_TICKET_HEIGHT,
  VENDING_BIN,
  VENDING_COIN_SLOT,
  VENDING_GOOD_X,
  VENDING_PRICE_X,
  vendingRowY,
} from '../layout';
import { addText, LED_COLOR, LED_STYLE, POPUP_DEPTH, pulse, RED_TEXT, SHOP_FLY_DEPTH, SHOP_PANEL_DEPTH } from '../theme';
import { fitBoardNumber } from './panel';
import { attachHint, type Hint } from './tooltip';

const ROWS = OFFER_SIZE; // ряды торгового автомата: все — предметы
// Что где в ряду: предмет слева, ценник справа.
const GOOD_SCALE = 0.9; // предмет в спирали
const PRICE_TEXT_OFFSET = 14; // «× 20» — правее фишки ценника
const DIM_ALPHA = 0.4; // предмет некуда положить — он тусклый
// Анимации, мс.
const SLIDE_TIME = 480; // панель съезжает сверху и уезжает обратно, как рольставня
const PAY_CHIPS = 5; // столько фишек летит с табло в щель (для красоты: цена может быть любой)
const PAY_FLY_TIME = 450;
const PAY_STAGGER = 60; // фишки летят друг за другом
const DROP_TIME = 350; // покупка падает в лоток
const REFILL_TIME = 220; // новый предмет на месте купленного появляется с подскоком
const SHAKE_TIME = 50; // один рывок тряски «не хватает фишек»
const TICKET_FLY_TIME = 600; // билет летит в шапку панели

/**
 * Магазин: панель поверх комнаты (съезжает сверху, как жалюзи, и так же уезжает), на ней торговый автомат с предметами
 * и ценниками, в шапке — сколько у тебя фишек и билетов. Чемодан с амулетами (его рисует AmuletCase), маленький
 * автомат с местом на полке и гнездом (MiniShop), барабан и кассета — тоже на панели.
 * Клик по ряду (или клавиша с его номером, её ловит сцена) — купить. При наведении — подсказка.
 */
export class Shop {
  private readonly scene: Phaser.Scene;
  private readonly shopLayer: Phaser.GameObjects.Container; // панель: её вещи и вещи AmuletCase, Drum, Cassette
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит в ряду
  private readonly priceChips: Phaser.GameObjects.Image[] = []; // ценник: фишка…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 20»
  private prices: (number | null)[] = []; // цена ряда; null — ряд пуст: купили или в пуле ничего не осталось
  private items: (Item | null)[] = []; // какой предмет в каком ряду
  private readonly hudChipsText: Phaser.GameObjects.Text; // шапка панели: сколько фишек
  private readonly hudTicketsText: Phaser.GameObjects.Text; // шапка панели: сколько билетов
  private readonly hudTicketScale: number; // билет в полёте — такого размера, как значок в шапке

  /** Слой панели: в него кладут свои вещи AmuletCase, Drum и Cassette. */
  get layer(): Phaser.GameObjects.Container {
    return this.shopLayer;
  }

  /** buy(row) — кликнули по ряду, leave — по ручке жалюзи или крестику: назад к автомату. */
  constructor(scene: Phaser.Scene, buy: (row: number) => void, leave: () => void, hint: Hint) {
    this.scene = scene;
    // Панель — первым: AmuletCase, Drum и Cassette создаются после Shop и кладут свои вещи в этот слой.
    this.shopLayer = scene.add.container(0, SHOP_CLOSED_Y).setDepth(SHOP_PANEL_DEPTH).setVisible(false);
    createChipTextures(scene);
    createTicketTexture(scene);
    createItemTextures(scene, ITEMS, ITEM_SIZE);
    const [panelBackground, machine, spirals, glass] = drawShopPanel(scene, ROWS);
    panelBackground.setInteractive(); // панель ловит клики: они не проходят сквозь неё на рычаг, телевизор и полку
    this.shopLayer.add([panelBackground, machine]);

    // Порядок в витрине: корпус → товар → спираль → стекло. Предмет лежит за спиралью и стеклом, а не поверх корпуса.
    for (let row = 0; row < ROWS; row++) {
      const y = vendingRowY(row, ROWS);
      const good = scene.add.image(VENDING_GOOD_X, y, itemTexture(ITEMS[0])).setScale(GOOD_SCALE).setVisible(false);
      good.setInteractive({ useHandCursor: true });
      attachHint(good, hint, () => this.hintFor(row), () => buy(row));
      this.goods.push(good);
      const priceChip = scene.add.image(VENDING_PRICE_X, y, CHIP_TEXTURE).setScale(0.75).setVisible(false);
      this.priceChips.push(priceChip);
      const priceStyle = { ...LED_STYLE, fontSize: '19px' };
      const priceText = addText(scene, VENDING_PRICE_X + PRICE_TEXT_OFFSET, y, '', priceStyle).setOrigin(0, 0.5);
      this.priceTexts.push(priceText);
      this.shopLayer.add(good); // только товар: спираль и стекло лягут поверх него
    }
    this.shopLayer.add([spirals, glass]);

    // Ценники и шапка — поверх стекла: их читают сквозь витрину и снаружи.
    this.shopLayer.add([...this.priceChips, ...this.priceTexts]);
    const hudChip = scene.add.image(SHOP_HUD.chipX, SHOP_HUD.y, CHIP_TEXTURE);
    hudChip.setScale(SHOP_HUD_CHIP_HEIGHT / hudChip.height);
    const hudTicket = scene.add.image(SHOP_HUD.ticketX, SHOP_HUD.y, TICKET_TEXTURE);
    this.hudTicketScale = SHOP_HUD_TICKET_HEIGHT / hudTicket.height;
    hudTicket.setScale(this.hudTicketScale);
    this.hudChipsText = addText(scene, SHOP_HUD.chipsX, SHOP_HUD.y, '', LED_STYLE).setOrigin(0, 0.5);
    this.hudTicketsText = addText(scene, SHOP_HUD.ticketsX, SHOP_HUD.y, '', LED_STYLE).setOrigin(0, 0.5);
    this.shopLayer.add([hudChip, hudTicket, this.hudChipsText, this.hudTicketsText]);

    this.buildHandle(leave); // ручка-язычок жалюзи внизу панели…
    this.buildCross(leave); // …и крестик в её правом верхнем углу
  }

  /**
   * Ручка-язычок жалюзи внизу панели: тёмная планка с двумя прорезями и маленькой стрелкой вверх. Клик — уход
   * из магазина; зона нажатия — своя, потому что у Graphics нет размера для попадания.
   */
  private buildHandle(leave: () => void): void {
    const { x, y, width, height } = SHOP_HANDLE;
    const left = x - width / 2;
    const top = y - height / 2;
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(left + 3, top + 4, width, height, 6); // тень на панели
    g.fillStyle(0x1c1108);
    g.fillRoundedRect(left, top, width, height, 6); // планка язычка
    g.lineStyle(2, 0x5b3a1e);
    g.strokeRoundedRect(left + 2, top + 2, width - 4, height - 4, 5);
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(left + 16, top + 8, width - 32, 3, 2); // прорезь
    g.fillRoundedRect(left + 16, top + 15, width - 32, 3, 2); // вторая прорезь
    g.fillStyle(0xc9a227);
    g.fillTriangle(x, top - 9, x - 7, top - 1, x + 7, top - 1); // стрелка вверх: панель уедет туда же
    this.shopLayer.add(g);
    this.shopLayer.add(this.buildLeaveZone(x, y, width, height + 12, leave));
  }

  /** Тонкий крестик в правом верхнем углу панели: второй, привычный способ уйти из магазина. */
  private buildCross(leave: () => void): void {
    const { x, y, width, height } = SHOP_CROSS;
    const arm = width / 2 - 4;
    const g = this.scene.add.graphics();
    g.lineStyle(2, 0xf5f5f4, 0.8);
    g.lineBetween(x - arm, y - arm, x + arm, y + arm);
    g.lineBetween(x - arm, y + arm, x + arm, y - arm);
    this.shopLayer.add(g);
    this.shopLayer.add(this.buildLeaveZone(x, y, width, height, leave));
  }

  /** Прозрачная зона нажатия с курсором-рукой: у Graphics своего размера нет, по нему не кликнуть. */
  private buildLeaveZone(x: number, y: number, width: number, height: number, leave: () => void): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', leave);
    return zone;
  }

  /** Подсказка ряда: что за предмет и что он делает. */
  private hintFor(row: number): [string, string] | null {
    if (this.prices[row] === null) return null;
    const item = this.items[row];
    return item ? [t(item.name), t(item.description)] : null;
  }

  /** Разложить товар (prices — цены предметов) и открыть панель. Панель опустилась — ready(). */
  open(offer: Item[], prices: number[], ready: () => void): void {
    this.items = [];
    this.prices = [];
    for (let row = 0; row < OFFER_SIZE; row++) {
      const item = offer[row] ?? null;
      this.items.push(item);
      this.prices.push(item ? prices[row] : null);
      if (item) this.goods[row].setTexture(itemTexture(item));
    }
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

  /** Ценники по фишкам на табло: хватает — жёлтые, нет — красные. Некуда положить предмет — предметы тусклые. */
  refresh(balance: number, hasFreeSlot: boolean): void {
    this.prices.forEach((price, row) => {
      if (price === null) return;
      this.priceTexts[row].setColor(price <= balance ? LED_COLOR : RED_TEXT);
      this.goods[row].setAlpha(hasFreeSlot ? 1 : DIM_ALPHA);
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

  /**
   * На место купленного ряда встаёт новый предмет: цена — от нового долга, остальные ряды не трогаются.
   * Появляется с подскоком, как вещи в чемодане амулетов. Его ценник и цвет ставит refresh сцены.
   */
  refill(row: number, item: Item, price: number): void {
    this.items[row] = item;
    this.prices[row] = price;
    const good = this.goods[row];
    good.setTexture(itemTexture(item)).setPosition(VENDING_GOOD_X, vendingRowY(row, ROWS)).setAlpha(1).setVisible(true).setScale(0);
    this.priceChips[row].setVisible(true);
    this.priceTexts[row].setText(`× ${price}`);
    this.scene.tweens.add({ targets: good, scale: GOOD_SCALE, duration: REFILL_TIME, ease: 'Back.easeOut' });
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

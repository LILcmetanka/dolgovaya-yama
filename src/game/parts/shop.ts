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
  vendingShelfY,
} from '../layout';
import { addText, fitTextWidth, LED_COLOR, LED_STYLE, POPUP_DEPTH, pulse, RED_TEXT, SHOP_FLY_DEPTH, SHOP_PANEL_DEPTH } from '../theme';
import { fitBoardNumber } from './panel';
import { attachHint, type Hint } from './tooltip';

const ROWS = OFFER_SIZE + 1; // ряды торгового автомата: три с предметами и четвёртый — билеты за фишки (шаг 13)
/** Ряд билетов: последний. Номера клавиши у него нет — все десять заняты, покупка только кликом. */
export const TICKET_ROW = OFFER_SIZE;
// Что где в ряду: предмет слева, ценник справа.
const GOOD_SCALE = 0.9; // предмет в спирали
const TICKET_GOOD_WIDTH = 46; // билет в ряду — шириной с предмет в соседних рядах (он вытянутый, поэтому по ширине)
const PRICE_TEXT_OFFSET = 14; // «× 20» — правее фишки ценника
const PRICE_FONT_SIZE = 19; // цена в ряду…
const PRICE_MIN_FONT_SIZE = 13; // …длинная уменьшается, чтобы не вылезти за тёмную табличку и стекло…
const PRICE_MAX_WIDTH = 77; // …а если и этого мало — ужимается по ширине: от подписи до края стекла витрины (табличка шире на 8)
const DIM_ALPHA = 0.4; // предмет некуда положить — он тусклый
// Предмет стоит в ряду на самой полке (goodY): его низ лежит на линии полки (vendingShelfY, тот же расчёт, что в
// decor.ts, drawVendingMachine) — тогда виток спирали проходит по его низу и держит товар, как настоящая пружина.
// Ценники остаются на середине ряда (vendingRowY).
const EXIT_BORDER = 0xc9a227; // рамка кнопки выхода в шапке панели — золото, как у кнопок победы
const EXIT_INK = '#fde047';
const EXIT_FONT_SIZE = 20; // кегль надписи «К СЛОТ-МАШИНЕ ✕»…
const EXIT_FONT_MIN = 13; // …длинная уменьшается, чтобы не вылезти за золотую рамку
const EXIT_TEXT_PAD = 24; // поле внутри плашки: надпись шире этого — ужимается (fitTextWidth)
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
 * и ценниками и четвёртым рядом — билетом за фишки, в шапке — сколько у тебя фишек и билетов. Чемодан с амулетами
 * (его рисует AmuletCase), маленький автомат с местом на полке и гнездом (MiniShop), барабан и кассета — тоже на панели.
 * Клик по ряду (или клавиша с его номером, её ловит сцена) — купить. При наведении — подсказка.
 */
export class Shop {
  private readonly scene: Phaser.Scene;
  private readonly shopLayer: Phaser.GameObjects.Container; // панель: её вещи и вещи AmuletCase, Drum, Cassette
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит в ряду
  private readonly goodHeights: number[] = []; // высота товара в его итоговом масштабе — чтобы посадить низ на полку
  private readonly priceChips: Phaser.GameObjects.Image[] = []; // ценник: фишка…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 20»
  private prices: (number | null)[] = []; // цена ряда; null — ряд пуст: купили или в пуле ничего не осталось (у ряда билетов цена есть всегда после refresh)
  private items: (Item | null)[] = []; // какой предмет в каком ряду
  private ticketsExhausted = false; // билеты за фишки в этом магазине кончились (потолок items.TICKETS_PER_SHOP)
  private readonly hudChipsText: Phaser.GameObjects.Text; // шапка панели: сколько фишек
  private readonly hudTicketsText: Phaser.GameObjects.Text; // шапка панели: сколько билетов
  private readonly hudTicketScale: number; // билет в полёте — такого размера, как значок в шапке
  private exitLabel!: Phaser.GameObjects.Text; // надпись кнопки выхода: её переставляют при смене языка (relabel)

  /** Слой панели: в него кладут свои вещи AmuletCase, Drum и Cassette. */
  get layer(): Phaser.GameObjects.Container {
    return this.shopLayer;
  }

  /** buy(row) — кликнули по ряду, leave — по кнопке выхода в шапке: назад к автомату. */
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
      const isTicket = row === TICKET_ROW;
      const good = scene.add.image(VENDING_GOOD_X, y, isTicket ? TICKET_TEXTURE : itemTexture(ITEMS[0])).setVisible(false);
      good.setScale(isTicket ? TICKET_GOOD_WIDTH / good.width : GOOD_SCALE); // билет — размером с предмет в соседних рядах
      this.goodHeights.push(good.displayHeight); // высота — уже в выставленном масштабе, а не в 1
      good.setY(vendingShelfY(row, ROWS) - good.displayHeight / 2); // низ товара — на линии полки, как у билета
      good.setInteractive({ useHandCursor: true });
      attachHint(good, hint, () => this.hintFor(row), () => buy(row));
      this.goods.push(good);
      const priceChip = scene.add.image(VENDING_PRICE_X, y, CHIP_TEXTURE).setScale(0.75).setVisible(false);
      this.priceChips.push(priceChip);
      const priceStyle = { ...LED_STYLE, fontSize: `${PRICE_FONT_SIZE}px` };
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

    this.buildExit(leave); // кнопка выхода в шапке, правее чемодана с амулетами — единственный выход из магазина
  }

  /**
   * Кнопка выхода в шапке панели — правее чемодана с амулетами: тёмная плашка в золотой рамке с надписью
   * «К СЛОТ-МАШИНЕ ✕». Кнопку видно сразу, и она не похожа на случайную линию в углу. Клик — уход из магазина;
   * зона нажатия — своя, потому что у Graphics нет размера для попадания.
   */
  private buildExit(leave: () => void): void {
    const { x, y, width, height } = SHOP_LEAVE;
    const left = x - width / 2;
    const top = y - height / 2;
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(left + 3, top + 4, width, height, 8); // тень на панели
    g.fillStyle(0x2a1608);
    g.fillRoundedRect(left, top, width, height, 8); // плашка кнопки
    g.lineStyle(3, EXIT_BORDER);
    g.strokeRoundedRect(left + 2, top + 2, width - 4, height - 4, 7); // золотая рамка — как у других кнопок игры
    this.shopLayer.add(g);
    this.exitLabel = addText(this.scene, x, y, '', { fontSize: `${EXIT_FONT_SIZE}px`, fontStyle: 'bold', color: EXIT_INK }).setOrigin(0.5);
    fitTextWidth(this.exitLabel, `${t('shopLeave')} ✕`, width - EXIT_TEXT_PAD, EXIT_FONT_SIZE, EXIT_FONT_MIN);
    this.shopLayer.add(this.exitLabel);
    this.shopLayer.add(this.buildLeaveZone(x, y, width, height, leave));
  }

  /** Сменился язык (L или RU/EN): надпись кнопки выхода — на новом, снова вписана в плашку. Origin и позиция те же. */
  relabel(): void {
    fitTextWidth(this.exitLabel, `${t('shopLeave')} ✕`, SHOP_LEAVE.width - EXIT_TEXT_PAD, EXIT_FONT_SIZE, EXIT_FONT_MIN);
  }

  /** Прозрачная зона нажатия с курсором-рукой: у Graphics своего размера нет, по нему не кликнуть. */
  private buildLeaveZone(x: number, y: number, width: number, height: number, leave: () => void): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', leave);
    return zone;
  }

  /** Подсказка ряда: что за предмет и что он делает. У ряда билетов — что это за билет (или почему он погас). */
  private hintFor(row: number): [string, string] | null {
    if (row === TICKET_ROW) {
      // Потолок покупок за заход выбран: ряд тусклый, а подсказка говорит, где взять следующий билет.
      if (this.ticketsExhausted) return [t('shopTicket'), t('shopTicketSold')];
      return [t('shopTicket'), t('shopTicketWhat')];
    }
    if (this.prices[row] === null) return null;
    const item = this.items[row];
    return item ? [t(item.name), t(item.description)] : null;
  }

  /** Разложить товар (prices — цены предметов) и открыть панель. Панель опустилась — ready(). */
  open(offer: Item[], prices: number[], ready: () => void): void {
    this.items = [];
    this.prices = [];
    this.ticketsExhausted = false; // новый заход — билеты за фишки снова продаются
    for (let row = 0; row < OFFER_SIZE; row++) {
      const item = offer[row] ?? null;
      this.items.push(item);
      this.prices.push(item ? prices[row] : null);
      if (item) this.goods[row].setTexture(itemTexture(item));
    }
    this.items.push(null); // ряд билетов: предмета нет, он на витрине всегда
    this.prices.push(null); // цену билета ставит refresh — она зависит от фишек на руках
    for (let row = 0; row < ROWS; row++) this.showRow(row);
    this.show(ready);
  }

  /** Ряд как есть: предмет в спирали и ценник справа; пустой ряд — ничего. Билет с витрины не пропадает никогда. */
  private showRow(row: number): void {
    const price = this.prices[row];
    const isEmpty = price === null && row !== TICKET_ROW; // билет остаётся, даже когда цена ещё не посчитана
    this.goods[row].setPosition(VENDING_GOOD_X, this.goodY(row)).setAlpha(1).setVisible(!isEmpty);
    this.setPriceShown(row, price);
  }

  /** Где стоит предмет ряда row: центр на полку минус половина высоты — низ товара лежит на линии полки, как у билета. */
  private goodY(row: number): number {
    return vendingShelfY(row, ROWS) - this.goodHeights[row] / 2;
  }

  /** Значок ценника и «× 170» — только вместе: нет цены, нет и половины ценника (пустой значок читается как поломка). */
  private setPriceShown(row: number, price: number | null): void {
    this.priceChips[row].setVisible(price !== null);
    this.setPriceText(row, price);
  }

  /** Цена в ряду: «× 170». Длинная цена мельче, а если и этого мало — ужимается по ширине: за табличку и стекло не выходит. */
  private setPriceText(row: number, price: number | null): void {
    const text = this.priceTexts[row];
    if (price === null) {
      text.setText('');
      return;
    }
    fitTextWidth(text, `× ${price}`, PRICE_MAX_WIDTH, PRICE_FONT_SIZE, PRICE_MIN_FONT_SIZE);
  }

  /**
   * Ценники по фишкам на табло: хватает — жёлтые, нет — красные. Некуда положить предмет — предметы тусклые.
   * ticketPrice — цена билета сейчас (items.ticketForChips): она меняется с фишками на руках и покупками за забег.
   * Ряд билетов, распроданный за этот заход, цены не получает: он тусклый до следующего магазина.
   */
  refresh(balance: number, hasFreeSlot: boolean, ticketPrice: number): void {
    if (!this.ticketsExhausted) {
      this.prices[TICKET_ROW] = ticketPrice; // ряд билетов: цена — доля банка, её считает сцена
      this.setPriceShown(TICKET_ROW, ticketPrice);
    }
    this.prices.forEach((price, row) => {
      if (price === null) return;
      this.priceTexts[row].setColor(price <= balance ? LED_COLOR : RED_TEXT);
      if (row !== TICKET_ROW) this.goods[row].setAlpha(hasFreeSlot ? 1 : DIM_ALPHA); // билет на полку не ложится — он не тускнеет
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
    good.setTexture(itemTexture(item)).setPosition(VENDING_GOOD_X, this.goodY(row)).setAlpha(1).setVisible(true).setScale(0);
    this.setPriceShown(row, price);
    this.scene.tweens.add({ targets: good, scale: GOOD_SCALE, duration: REFILL_TIME, ease: 'Back.easeOut' });
  }

  /**
   * Купили билет: фишки летят в щель, билет — из ряда в шапку панели, к числу билетов. Ряд не пустеет,
   * пока магазин не продал свою норму (items.TICKETS_PER_SHOP): её сторожит сцена, а гаснет ряд — soldOutTickets.
   */
  sellTicket(): void {
    this.payChips();
    this.flyTicket(VENDING_GOOD_X, this.goodY(TICKET_ROW));
  }

  /**
   * Билеты за фишки в этом магазине кончились: ряд тускнеет и теряет ценник до следующего захода (open его снова
   * зажигает). Тусклый билет можно навести, и подсказка скажет, почему больше не продают (ShopScene.showTicketLimit).
   */
  soldOutTickets(): void {
    this.ticketsExhausted = true;
    this.prices[TICKET_ROW] = null;
    this.goods[TICKET_ROW].setAlpha(DIM_ALPHA);
    this.setPriceShown(TICKET_ROW, null); // ценника нет целиком: значок без числа читается как поломка
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


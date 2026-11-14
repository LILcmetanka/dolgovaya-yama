import Phaser from 'phaser';
import {
  CHIP_TEXTURE,
  createChipTextures,
  createShelfTextures,
  createSocketCapTexture,
  createTicketTexture,
  drawGlassPane,
  SHELF_CELL_TEXTURE,
  SOCKET_CAP_TEXTURE,
  TICKET_TEXTURE,
} from '../decor';
import { t } from '../lang';
import {
  MINI_SHOP,
  MINI_SHOP_COIN_SLOT,
  MINI_SHOP_GLASS,
  MINI_SHOP_GOOD_X,
  MINI_SHOP_PRICE_X,
  MINI_SHOP_ROW_Y,
  SHELF_CELL,
  SHOP_HUD,
  SOCKET_RADIUS,
} from '../layout';
import { addText, fitTextWidth, LED_COLOR, LED_STYLE, POPUP_DEPTH, RED_TEXT, SHOP_FLY_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

/** Ряды маленького автомата: 0 — место на полке за фишки, 1 — гнездо амулета за билеты. */
export const SLOT_ROW = 0;
export const SOCKET_ROW = 1;
const ROWS = 2;
// Что где в ряду: клетка полки или заглушка гнезда — слева, ценник — справа. Плашки товаров одного размера (≈43 px):
// ряд читается как витрина, а не как наклейки в разных углах.
const GOOD_SCALES = [0.62, 1.03];
const PRICE_ICON_SCALE = 0.6;
const PRICE_TEXT_OFFSET = 11; // «× 20» — правее значка ценника
const PRICE_FONT_SIZE = 14; // цена в ряду…
const PRICE_MIN_FONT_SIZE = 10; // …длинная уменьшается, чтобы не вылезти за тёмную табличку и стекло…
const PRICE_MAX_WIDTH = 46; // …а если и этого мало — ужимается по ширине: шире таблички ценник не бывает
const PLATE_INSET = 12; // табличка ценника шире значка на столько с каждой стороны
const PLATE_GAP = 5; // и не доходит до края витрины на столько
// Анимации, мс.
const PAY_FLYING = 4; // столько значков оплаты летит из шапки панели в щель (для красоты: цена может быть любой)
const PAY_FLY_TIME = 400;
const PAY_STAGGER = 60;
const TAKE_TIME = 260; // покупка гаснет, когда оплата долетела
const SHAKE_TIME = 50; // один рывок тряски «не хватает»

/**
 * Маленький автомат на панели магазина, слева от торгового: два ряда — место на полке за фишки и гнездо амулета
 * за билеты. Лотка нет: место открывается на полке, гнездо — на корпусе, за панелью. Покупку делает сцена
 * (ShopScene.buySlot и buySocket) — здесь только показ, оплата и «не хватает».
 */
export class MiniShop {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container; // слой магазина: автомат, покупки и ценники на нём
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит в ряду
  private readonly priceIcons: Phaser.GameObjects.Image[] = []; // ценник: фишка или билет…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 20»
  private readonly prices: (number | null)[] = [null, null]; // цена ряда; null — ряд не продаётся
  private isOpen = false; // панель встала — товар на витрине

  /** buy(row) — кликнули по ряду; layer — слой магазина, куда кладётся автомат и его товар. */
  constructor(scene: Phaser.Scene, buy: (row: number) => void, hint: Hint, layer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.layer = layer;
    createChipTextures(scene);
    createTicketTexture(scene);
    createShelfTextures(scene, SHELF_CELL);
    createSocketCapTexture(scene, SOCKET_RADIUS);
    this.buildMachine();
    // Порядок в витрине: корпус (с табличками) → товар → стекло → ценники. Товар лежит за стеклом, ценники читаются поверх.
    for (let row = 0; row < ROWS; row++) {
      const good = scene.add.image(MINI_SHOP_GOOD_X, MINI_SHOP_ROW_Y[row], this.textureFor(row)).setScale(GOOD_SCALES[row]).setVisible(false);
      good.setInteractive({ useHandCursor: true });
      attachHint(good, hint, () => this.hintFor(row), () => buy(row));
      this.goods.push(good);
      this.layer.add(good);
    }
    this.layer.add(this.buildGlass());
    for (let row = 0; row < ROWS; row++) {
      const y = MINI_SHOP_ROW_Y[row];
      const priceIcon = scene.add.image(MINI_SHOP_PRICE_X, y, this.priceTexture(row)).setScale(PRICE_ICON_SCALE).setVisible(false);
      this.priceIcons.push(priceIcon);
      const priceText = addText(scene, MINI_SHOP_PRICE_X + PRICE_TEXT_OFFSET, y, '', { ...LED_STYLE, fontSize: `${PRICE_FONT_SIZE}px` })
        .setOrigin(0, 0.5)
        .setVisible(false);
      this.priceTexts.push(priceText);
      this.layer.add([priceIcon, priceText]);
    }
    this.clear();
  }

  /** Сам автомат: корпус, витрина с двумя полками и табличками ценников, щель для оплаты на правой панели. */
  private buildMachine(): void {
    const g = this.scene.add.graphics();
    const left = MINI_SHOP.x - MINI_SHOP.width / 2;
    const top = MINI_SHOP.y - MINI_SHOP.height / 2;
    const { width, height } = MINI_SHOP;
    const glassLeft = MINI_SHOP_GLASS.x - MINI_SHOP_GLASS.width / 2;
    const glassTop = MINI_SHOP_GLASS.y - MINI_SHOP_GLASS.height / 2;

    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(left + 10, top + 8, width, height, 16); // тень на стене
    g.fillStyle(0x0f172a);
    g.fillRoundedRect(left, top, width, height, 16); // корпус
    g.fillStyle(0x1e293b);
    g.fillRoundedRect(left + 12, top, width - 12, height, 16); // лицевая часть
    g.lineStyle(3, 0x475569);
    g.strokeRoundedRect(left + 18, top + 8, width - 30, height - 16, 12); // окантовка

    g.fillStyle(0x94a3b8);
    g.fillRoundedRect(glassLeft - 5, glassTop - 5, MINI_SHOP_GLASS.width + 10, MINI_SHOP_GLASS.height + 10, 10); // хромированная рамка
    g.fillStyle(0x071a24);
    g.fillRoundedRect(glassLeft, glassTop, MINI_SHOP_GLASS.width, MINI_SHOP_GLASS.height, 6); // стекло витрины
    const plateLeft = MINI_SHOP_PRICE_X - PLATE_INSET;
    const plateWidth = glassLeft + MINI_SHOP_GLASS.width - PLATE_GAP - plateLeft; // табличка — до края витрины
    for (const y of MINI_SHOP_ROW_Y) {
      g.fillStyle(0x334155);
      g.fillRect(glassLeft + 5, y + 24, MINI_SHOP_GLASS.width - 10, 4); // полка ряда
      g.fillStyle(0x020617);
      g.fillRoundedRect(plateLeft, y - 12, plateWidth, 24, 5); // табличка ценника
    }

    // Правая панель: щель для оплаты и лампочка.
    g.fillStyle(0x94a3b8);
    g.fillRoundedRect(MINI_SHOP_COIN_SLOT.x - 9, MINI_SHOP_COIN_SLOT.y - 20, 18, 40, 5);
    g.fillStyle(0x020617);
    g.fillRect(MINI_SHOP_COIN_SLOT.x - 3, MINI_SHOP_COIN_SLOT.y - 14, 6, 28); // щель
    g.fillStyle(0x22d3ee);
    g.fillCircle(MINI_SHOP_COIN_SLOT.x, MINI_SHOP_COIN_SLOT.y + 64, 4); // холодная лампочка, как вывеска торгового

    this.layer.add(g);
  }

  /** Стекло витрины: та же плёнка с бликом, что у торгового автомата, — товар читается за стеклом. */
  private buildGlass(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    drawGlassPane(g, MINI_SHOP_GLASS);
    return g;
  }

  /** Картинка ряда: клетка полки или заглушка гнезда. */
  private textureFor(row: number): string {
    return row === SLOT_ROW ? SHELF_CELL_TEXTURE : SOCKET_CAP_TEXTURE;
  }

  /** Чем платят за ряд: место — фишками, гнездо — билетами. */
  private priceTexture(row: number): string {
    return row === SLOT_ROW ? CHIP_TEXTURE : TICKET_TEXTURE;
  }

  /** Подсказка ряда: что это и что даёт. */
  private hintFor(row: number): [string, string] | null {
    if (this.prices[row] === null) return null;
    return row === SLOT_ROW ? [t('shelfSlot'), t('shelfSlotWhat')] : [t('socket'), t('socketWhat')];
  }

  /** Панель поехала: товар и ценники прошлого захода убираются сразу, чтобы на съезде не мелькал старый магазин. */
  clear(): void {
    this.isOpen = false;
    for (let row = 0; row < ROWS; row++) this.showRow(row);
  }

  /** Панель встала: товар на витрине — можно покупать. */
  open(): void {
    this.isOpen = true;
    for (let row = 0; row < ROWS; row++) this.showRow(row);
  }

  /** Ряд как есть: покупка и ценник справа; пустой ряд — ничего. */
  private showRow(row: number): void {
    const price = this.prices[row];
    const isShown = price !== null && this.isOpen;
    this.goods[row].setPosition(MINI_SHOP_GOOD_X, MINI_SHOP_ROW_Y[row]).setScale(GOOD_SCALES[row]).setVisible(isShown);
    this.priceIcons[row].setVisible(isShown);
    this.priceTexts[row].setX(MINI_SHOP_PRICE_X + PRICE_TEXT_OFFSET).setVisible(isShown);
    this.paintPrice(row);
  }

  /** Цена в ряду: «× 170». Длинная цена мельче, а если и этого мало — ужимается по ширине: за тёмную табличку и стекло витрины не выходит. */
  private paintPrice(row: number): void {
    const price = this.prices[row];
    const text = this.priceTexts[row];
    if (price === null) {
      text.setText('');
      return;
    }
    fitTextWidth(text, `× ${price}`, PRICE_MAX_WIDTH, PRICE_FONT_SIZE, PRICE_MIN_FONT_SIZE);
  }

  /**
   * Ценники: место — в фишках, гнездо — в билетах. Хватает — жёлтый, нет — красный.
   * Цена null — больше не продаётся (мест на полке или гнёзд уже MAX_SLOTS/MAX_SOCKETS), ряд пустеет.
   */
  refresh(balance: number, tickets: number, slotPrice: number | null, socketPrice: number | null): void {
    [slotPrice, socketPrice].forEach((price, row) => {
      if (price !== this.prices[row]) {
        this.prices[row] = price;
        this.showRow(row);
      }
      if (price === null) return;
      this.priceTexts[row].setColor(price <= (row === SLOT_ROW ? balance : tickets) ? LED_COLOR : RED_TEXT);
    });
  }

  /** Купили ряд row: из шапки панели в щель летит оплата, покупка гаснет на витрине — потом landed(). */
  sell(row: number, landed: () => void): void {
    const good = this.goods[row];
    const fromX = row === SLOT_ROW ? SHOP_HUD.chipX : SHOP_HUD.ticketX; // оплата летит от своего значка в шапке панели
    for (let index = 0; index < PAY_FLYING; index++) {
      const coin = this.scene.add.image(fromX, SHOP_HUD.y, this.priceTexture(row)).setDepth(SHOP_FLY_DEPTH);
      this.scene.tweens.add({
        targets: coin,
        x: MINI_SHOP_COIN_SLOT.x,
        y: MINI_SHOP_COIN_SLOT.y,
        scale: 0.5,
        delay: index * PAY_STAGGER,
        duration: PAY_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => coin.destroy(),
      });
    }
    const bought = this.scene.add.image(good.x, good.y, good.texture.key).setScale(good.scaleX).setDepth(POPUP_DEPTH);
    this.prices[row] = null;
    this.showRow(row); // покупки на витрине больше нет
    this.scene.tweens.add({
      targets: bought,
      scale: good.scaleX * 0.4,
      alpha: 0,
      delay: PAY_FLYING * PAY_STAGGER + PAY_FLY_TIME,
      duration: TAKE_TIME,
      ease: 'Quad.easeIn',
      onComplete: () => {
        bought.destroy();
        landed();
      },
    });
  }

  /** Не хватает: ценник ряда трясётся. */
  deny(row: number): void {
    const text = this.priceTexts[row];
    const homeX = MINI_SHOP_PRICE_X + PRICE_TEXT_OFFSET;
    this.scene.tweens.killTweensOf(text);
    text.setX(homeX);
    this.scene.tweens.add({ targets: text, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => text.setX(homeX) });
  }
}

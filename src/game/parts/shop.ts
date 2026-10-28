import Phaser from 'phaser';
import {
  CHIP_TEXTURE,
  createChipTextures,
  createItemTextures,
  createLeaveButtonTexture,
  createShelfTextures,
  drawShopRoom,
  itemTexture,
  LEAVE_BUTTON_TEXTURE,
  SHELF_CELL_TEXTURE,
} from '../decor';
import { ITEMS, OFFER_SIZE, type Item } from '../items';
import { t } from '../lang';
import {
  AMULET_CASE_PLACES,
  BOARD_CHIP_X,
  DISPLAY,
  HOME_SCROLL,
  ITEM_SIZE,
  SHELF_CELL,
  SHOP_LEAVE,
  SHOP_SCROLL,
  VENDING_BIN,
  VENDING_COIN_SLOT,
  VENDING_GOOD_X,
  VENDING_KEY_X,
  VENDING_PRICE_X,
  vendingRowY,
} from '../layout';
import { addKeyHint, addText, CHIP_DEPTH, keyHint, LED_COLOR, LED_STYLE, POPUP_DEPTH, RED_TEXT } from '../theme';
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
const TURN_TIME = 600; // вид поворачивается к магазину или обратно
const PAY_CHIPS = 5; // столько фишек летит с табло в щель (для красоты: цена может быть любой)
const PAY_FLY_TIME = 450;
const PAY_STAGGER = 60; // фишки летят друг за другом
const DROP_TIME = 350; // покупка падает в лоток
const SHAKE_TIME = 50; // один рывок тряски «не хватает фишек»

/**
 * Магазин: комната слева, витрина амулетов на стене (её товар — часть AmuletCase) и торговый автомат под ней.
 * В рядах торгового автомата — предметы с ценниками, в нижнем ряду — место на полке.
 * Клик по ряду (или клавиша с его номером, её ловит сцена) — купить. При наведении — подсказка.
 */
export class Shop {
  private readonly scene: Phaser.Scene;
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит в ряду; в нижнем — клетка полки
  private readonly priceChips: Phaser.GameObjects.Image[] = []; // ценник: фишка…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 20»
  private readonly leaveHint: Phaser.GameObjects.Text; // «Пробел» под кнопкой «назад»
  private prices: (number | null)[] = []; // цена ряда; null — ряд пуст: купили или больше не продаётся
  private items: (Item | null)[] = []; // какой предмет в каком ряду

  /** buy(row) — кликнули по ряду, leave — по кнопке «назад к автомату». */
  constructor(scene: Phaser.Scene, buy: (row: number) => void, leave: () => void, hint: Hint) {
    this.scene = scene;
    createChipTextures(scene);
    createItemTextures(scene, ITEMS, ITEM_SIZE);
    createShelfTextures(scene, SHELF_CELL);
    createLeaveButtonTexture(scene);
    drawShopRoom(scene, ROWS, AMULET_CASE_PLACES);

    for (let row = 0; row < ROWS; row++) {
      const y = vendingRowY(row, ROWS);
      const texture = row === SLOT_ROW ? SHELF_CELL_TEXTURE : itemTexture(ITEMS[0]);
      const good = scene.add.image(VENDING_GOOD_X, y, texture).setScale(row === SLOT_ROW ? SLOT_GOOD_SCALE : GOOD_SCALE).setVisible(false);
      good.setInteractive({ useHandCursor: true });
      attachHint(good, hint, () => this.hintFor(row), () => buy(row));
      this.goods.push(good);
      this.priceChips.push(scene.add.image(VENDING_PRICE_X, y, CHIP_TEXTURE).setScale(0.75).setVisible(false));
      const priceStyle = { ...LED_STYLE, fontSize: '19px' };
      this.priceTexts.push(addText(scene, VENDING_PRICE_X + PRICE_TEXT_OFFSET, y, '', priceStyle).setOrigin(0, 0.5));
      addKeyHint(scene, VENDING_KEY_X, y, String(row + 1));
    }

    // Кнопка «назад к игровому автомату» — стрелка вправо, под ней клавиша.
    const leaveButton = scene.add.image(SHOP_LEAVE.x, SHOP_LEAVE.y, LEAVE_BUTTON_TEXTURE);
    leaveButton.setInteractive({ useHandCursor: true });
    leaveButton.on('pointerdown', leave);
    this.leaveHint = addKeyHint(scene, SHOP_LEAVE.x, SHOP_LEAVE.y + 44, t('space'));
  }

  /** Сменился язык: подсказка клавиши у кнопки «назад» — на новом. */
  relabel(): void {
    this.leaveHint.setText(keyHint(t('space')));
  }

  /** Подсказка ряда: что за предмет и что он делает. */
  private hintFor(row: number): [string, string] | null {
    if (this.prices[row] === null) return null;
    if (row === SLOT_ROW) return [t('shelfSlot'), t('shelfSlotWhat')];
    const item = this.items[row];
    return item ? [t(item.name), t(item.description)] : null;
  }

  /** Разложить товар (prices — цены предметов, slotPrice — места; null — мест больше не продают) и повернуть вид. Повернулся — ready(). */
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
    this.turnTo(SHOP_SCROLL, ready);
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

  /** Фишки летят с табло в щель торгового автомата. */
  private payChips(): void {
    for (let index = 0; index < PAY_CHIPS; index++) {
      const chip = this.scene.add.image(BOARD_CHIP_X, DISPLAY.y, CHIP_TEXTURE).setScale(1.1).setDepth(CHIP_DEPTH);
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

  /** Не хватает фишек: ценник ряда row трясётся. */
  deny(row: number): void {
    const text = this.priceTexts[row];
    const homeX = VENDING_PRICE_X + PRICE_TEXT_OFFSET;
    this.scene.tweens.killTweensOf(text);
    text.setX(homeX);
    this.scene.tweens.add({ targets: text, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => text.setX(homeX) });
  }

  /** Вид возвращается к игровому автомату — потом done(). */
  close(done: () => void): void {
    this.turnTo(HOME_SCROLL, done);
  }

  /** Повернуть вид: камера плавно уезжает до scrollX — потом done(). */
  private turnTo(scrollX: number, done: () => void): void {
    this.scene.tweens.add({ targets: this.scene.cameras.main, scrollX, duration: TURN_TIME, ease: 'Sine.easeInOut', onComplete: done });
  }
}

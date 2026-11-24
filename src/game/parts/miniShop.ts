import Phaser from 'phaser';
import {
  CHIP_TEXTURE,
  CHROME,
  CHROME_LIGHT,
  createChipTextures,
  createMiniSocketTexture,
  createShelfTextures,
  createTicketTexture,
  drawGlassPane,
  MINI_SOCKET_TEXTURE,
  SHOP_SLOT_TEXTURE,
  TICKET_TEXTURE,
} from '../decor';
import { t } from '../lang';
import {
  MINI_SHOP,
  MINI_SHOP_BIN,
  MINI_SHOP_FRAME,
  MINI_SHOP_GLASS,
  MINI_SHOP_GOOD_X,
  MINI_SHOP_PRICE_X,
  MINI_SHOP_ROW_Y,
  MINI_SHOP_SHELF_Y,
  MINI_SHOP_SOCKET_RADIUS,
  SHELF_CELL,
  SHOP_HUD,
} from '../layout';
import { addText, fitTextWidth, LED_COLOR, LED_STYLE, POPUP_DEPTH, RED_TEXT, SHOP_FLY_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

/** Ряды маленького автомата: 0 — место на полке за фишки, 1 — гнездо амулета за билеты. */
export const SLOT_ROW = 0;
export const SOCKET_ROW = 1;
const ROWS = 2;
// Товар стоит прямо на полке ряда: клетка полки (её значок) и гнездо амулета. Значки примерно одного размера,
// чтобы ряды читались витриной; ценник — тёмной табличкой справа, плашек-кнопок под товаром нет.
const GOOD_SCALES = [0.68, 0.9];
const PRICE_ICON_SCALE = 0.55;
const PRICE_TEXT_OFFSET = 10; // «× 20» — правее значка ценника
const PRICE_FONT_SIZE = 13; // цена в ряду…
const PRICE_MIN_FONT_SIZE = 9; // …длинная уменьшается, чтобы не вылезти за тёмную табличку и стекло…
const PRICE_MAX_WIDTH = 36; // …а если и этого мало — ужимается по ширине: шире таблички ценник не бывает
const PLATE_INSET = 12; // табличка ценника шире значка на столько слева
const PLATE_GAP = 8; // и не доходит до края витрины на столько
const PLATE_HEIGHT = 26;
// Корпус: скругление и левый бок в тени — как у торгового автомата (decor.ts, drawVendingMachine) и корпуса в комнате.
const BODY_CORNER = 18;
const BODY_SIDE = 13; // ширина левого бока, px
const TRIM_INSET = 6; // хромированная окантовка — на столько внутри края лицевой части
// Плашка выдачи внизу (DONTLIKE п.8): хромированная окантовка, тёмный проём и откидная крышка — как лоток торгового.
const BIN_RIM = 5; // окантовка лотка шире проёма на столько
const BIN_LID_SHARE = 0.55; // какую долю проёма закрывает крышка
// Анимации, мс.
const PAY_FLYING = 4; // столько значков оплаты летит из шапки панели к товару (для красоты: цена может быть любой)
const PAY_FLY_TIME = 400;
const PAY_STAGGER = 60;
const DROP_TIME = 320; // покупка падает в плашку выдачи, когда оплата долетела
const SHAKE_TIME = 50; // один рывок тряски «не хватает»

/**
 * Маленький автомат на панели магазина, слева от торгового: тот же корпус, только меньше, и стоит с торговым
 * на одном полу. Два ряда — место на полке за фишки и гнездо амулета за билеты. Дверцы витрины нет (DONTLIKE п.8):
 * товар и цены видны сразу, как только панель встала. Внизу — плашка выдачи: покупка уходит в неё, клик по плашке
 * забирает её (значок подпрыгивает и тает). Покупку делает сцена (ShopScene.buySlot и buySocket) — здесь только
 * показ, оплата, плашка и «не хватает».
 */
export class MiniShop {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container; // слой магазина: автомат, покупки и ценники на нём
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит в ряду
  private readonly priceIcons: Phaser.GameObjects.Image[] = []; // ценник: фишка или билет…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 20»
  private readonly prices: (number | null)[] = [null, null]; // цена ряда; null — ряд не продаётся
  private readonly bin: Phaser.GameObjects.Graphics; // плашка выдачи: её проём, крышка и окантовка
  private isOpen = false; // панель встала — товар на витрине и покупки возможны

  /** buy(row) — кликнули по ряду; layer — слой магазина, куда кладётся автомат и его товар. */
  constructor(scene: Phaser.Scene, buy: (row: number) => void, hint: Hint, layer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.layer = layer;
    createChipTextures(scene);
    createTicketTexture(scene);
    createShelfTextures(scene, SHELF_CELL);
    createMiniSocketTexture(scene, MINI_SHOP_SOCKET_RADIUS);
    this.buildMachine();
    // Порядок в витрине: корпус (с полками, табличками и плашкой выдачи) → товар → стекло → ценники.
    // Дверцы нет: ничто не закрывает витрину, товар читается сразу.
    for (let row = 0; row < ROWS; row++) {
      const good = scene.add.image(MINI_SHOP_GOOD_X, MINI_SHOP_ROW_Y[row], this.textureFor(row)).setScale(GOOD_SCALES[row]);
      good.setY(MINI_SHOP_SHELF_Y[row] - good.displayHeight / 2); // низ товара лежит на полке, а не висит над ней
      good.setInteractive({ useHandCursor: true });
      attachHint(good, hint, () => this.hintFor(row), () => this.press(row, buy));
      this.goods.push(good);
      this.layer.add(good);
    }
    this.layer.add(this.buildGlass());
    for (let row = 0; row < ROWS; row++) {
      const y = MINI_SHOP_ROW_Y[row];
      const priceIcon = scene.add.image(MINI_SHOP_PRICE_X, y, this.priceTexture(row)).setScale(PRICE_ICON_SCALE);
      this.priceIcons.push(priceIcon);
      const priceText = addText(scene, MINI_SHOP_PRICE_X + PRICE_TEXT_OFFSET, y, '', { ...LED_STYLE, fontSize: `${PRICE_FONT_SIZE}px` })
        .setOrigin(0, 0.5);
      this.priceTexts.push(priceText);
      this.layer.add([priceIcon, priceText]);
    }
    this.bin = this.buildBin();
    this.layer.add(this.bin);
    this.clear();
  }

  /**
   * Сам автомат: скруглённый корпус с хромированной окантовкой и тёмной лицевой частью, витрина в хромированной
   * рамке — тёмное нутро, две полки и тёмные таблички ценников справа.
   */
  private buildMachine(): void {
    const g = this.scene.add.graphics();
    const left = MINI_SHOP.x - MINI_SHOP.width / 2;
    const top = MINI_SHOP.y - MINI_SHOP.height / 2;
    const { width, height } = MINI_SHOP;
    const glassLeft = MINI_SHOP_GLASS.x - MINI_SHOP_GLASS.width / 2;
    const glassTop = MINI_SHOP_GLASS.y - MINI_SHOP_GLASS.height / 2;
    const glassWidth = MINI_SHOP_GLASS.width;
    const glassHeight = MINI_SHOP_GLASS.height;

    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(left + 12, top + 10, width, height, BODY_CORNER); // тень на стене
    g.fillStyle(0x0f172a);
    g.fillRoundedRect(left, top, width, height, BODY_CORNER); // корпус
    g.fillStyle(0x1e293b);
    g.fillRoundedRect(left + BODY_SIDE, top, width - BODY_SIDE, height, BODY_CORNER); // лицевая часть
    g.lineStyle(3, CHROME);
    g.strokeRoundedRect(left + BODY_SIDE + TRIM_INSET, top + TRIM_INSET, width - BODY_SIDE - 2 * TRIM_INSET, height - 2 * TRIM_INSET, 14); // окантовка

    // Витрина: хромированная рамка и тёмное нутро — как у торгового автомата.
    g.fillStyle(CHROME);
    g.fillRoundedRect(
      glassLeft - MINI_SHOP_FRAME,
      glassTop - MINI_SHOP_FRAME,
      glassWidth + 2 * MINI_SHOP_FRAME,
      glassHeight + 2 * MINI_SHOP_FRAME,
      12,
    ); // хромированная рамка
    g.fillStyle(0x071a24);
    g.fillRoundedRect(glassLeft, glassTop, glassWidth, glassHeight, 8); // стекло витрины

    const plateLeft = MINI_SHOP_PRICE_X - PLATE_INSET;
    const plateWidth = glassLeft + glassWidth - PLATE_GAP - plateLeft; // табличка — до края витрины
    for (let row = 0; row < ROWS; row++) {
      g.fillStyle(0x334155);
      g.fillRect(glassLeft + 6, MINI_SHOP_SHELF_Y[row], glassWidth - 12, 4); // полка ряда: на ней стоит товар
      g.fillStyle(0x020617);
      g.fillRoundedRect(plateLeft, MINI_SHOP_ROW_Y[row] - PLATE_HEIGHT / 2, plateWidth, PLATE_HEIGHT, 5); // табличка ценника
    }
    this.layer.add(g);
  }

  /**
   * Плашка выдачи внизу лицевой части (DONTLIKE п.8): хромированная окантовка, тёмный проём и откидная крышка —
   * тот же лоток, что у торгового автомата. Клика нет (DONTLIKE п.12): «забрать» покупку было бессмысленным,
   * значок в проёме — просто индикатор, пока его не сменит следующая покупка.
   */
  private buildBin(): Phaser.GameObjects.Graphics {
    const { x, y, width, height } = MINI_SHOP_BIN;
    const left = x - width / 2;
    const top = y - height / 2;
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(left - BIN_RIM + 2, top - BIN_RIM + 3, width + 2 * BIN_RIM, height + 2 * BIN_RIM, 8); // тень на корпусе
    g.fillStyle(0x94a3b8);
    g.fillRoundedRect(left - BIN_RIM, top - BIN_RIM, width + 2 * BIN_RIM, height + 2 * BIN_RIM, 8); // окантовка
    g.fillStyle(0x020617);
    g.fillRoundedRect(left, top, width, height, 6); // тёмный проём
    g.fillStyle(0x334155);
    g.fillRect(left + 4, top + 3, width - 8, Math.max(3, height * BIN_LID_SHARE - 3)); // крышка
    g.fillStyle(CHROME_LIGHT);
    g.fillRect(left + 4, top + height - 3, width - 8, 1); // блик по нижней кромке проёма
    return g;
  }

  /** Стекло витрины: та же плёнка с бликом, что у торгового автомата, — товар читается за стеклом. */
  private buildGlass(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    drawGlassPane(g, MINI_SHOP_GLASS);
    return g;
  }

  /** Картинка ряда: клетка с плюсом «место на полке» или гнездо амулета — то, что покупают. */
  private textureFor(row: number): string {
    return row === SLOT_ROW ? SHOP_SLOT_TEXTURE : MINI_SOCKET_TEXTURE;
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

  /** Клик по товару: покупаем, когда панель встала. Дверцы нет — товар виден и нажимается сразу. */
  private press(row: number, buy: (row: number) => void): void {
    if (!this.isOpen) return;
    buy(row);
  }

  /** Панель поехала: товар и ценники прошлого захода убираются сразу, чтобы на съезде не мелькал старый магазин. */
  clear(): void {
    this.isOpen = false;
    for (let row = 0; row < ROWS; row++) {
      this.prices[row] = null;
      this.showRow(row);
    }
  }

  /** Панель встала: автомат перед игроком, товар и цены уже видны. */
  open(): void {
    this.isOpen = true;
    for (let row = 0; row < ROWS; row++) this.showRow(row);
  }

  /** Ряд как есть: товар на полке и ценник справа; пустой ряд — ничего. */
  private showRow(row: number): void {
    const isShown = this.prices[row] !== null && this.isOpen;
    this.goods[row].setVisible(isShown);
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

  /**
   * Купили ряд row: из шапки панели к товару летит оплата, покупка гаснет на полке — и падает в плашку выдачи.
   * Потом landed(): сцена ставит покупку на место (открывает клетку полки или гнездо). Плашка держит значок,
   * пока его не заберут кликом или пока панель не уедет.
   */
  sell(row: number, landed: () => void): void {
    const good = this.goods[row];
    const fromX = row === SLOT_ROW ? SHOP_HUD.chipX : SHOP_HUD.ticketX; // оплата летит от своего значка в шапке панели
    for (let index = 0; index < PAY_FLYING; index++) {
      const coin = this.scene.add.image(fromX, SHOP_HUD.y, this.priceTexture(row)).setDepth(SHOP_FLY_DEPTH);
      this.scene.tweens.add({
        targets: coin,
        x: good.x, // к самому товару на полке
        y: good.y,
        scale: 0.5,
        delay: index * PAY_STAGGER,
        duration: PAY_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => coin.destroy(),
      });
    }
    const wait = PAY_FLYING * PAY_STAGGER + PAY_FLY_TIME;
    const bought = this.scene.add.image(good.x, good.y, good.texture.key).setScale(good.scaleX).setDepth(POPUP_DEPTH);
    this.prices[row] = null;
    this.showRow(row); // покупки на витрине больше нет
    // Покупка падает в плашку выдачи — так видно, куда она делась; в плашке остаётся её значок.
    this.scene.tweens.add({
      targets: bought,
      x: MINI_SHOP_BIN.x,
      y: MINI_SHOP_BIN.y,
      scale: GOOD_SCALES[row] * 0.6,
      alpha: 0.2,
      delay: wait,
      duration: DROP_TIME,
      ease: 'Quad.easeIn',
      onComplete: () => {
        bought.destroy();
        landed(); // покупка сразу встаёт на место: в плашке она больше не лежит
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

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
  SHELF_CELL_TEXTURE,
  TICKET_TEXTURE,
} from '../decor';
import { t } from '../lang';
import {
  MINI_SHOP,
  MINI_SHOP_DOOR,
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
// Товар стоит прямо на полке ряда: клетка полки (её значок) и гнездо амулета. Значки одного размера (≈52 px),
// чтобы ряды читались витриной; ценник — тёмной табличкой справа, плашек-кнопок под товаром нет.
const GOOD_SCALES = [0.75, 1];
const PRICE_ICON_SCALE = 0.6;
const PRICE_TEXT_OFFSET = 11; // «× 20» — правее значка ценника
const PRICE_FONT_SIZE = 14; // цена в ряду…
const PRICE_MIN_FONT_SIZE = 10; // …длинная уменьшается, чтобы не вылезти за тёмную табличку и стекло…
const PRICE_MAX_WIDTH = 42; // …а если и этого мало — ужимается по ширине: шире таблички ценник не бывает
const PLATE_INSET = 14; // табличка ценника шире значка на столько слева
const PLATE_GAP = 8; // и не доходит до края витрины на столько
const PLATE_HEIGHT = 28;
// Корпус: скругление и левый бок в тени — как у торгового автомата (decor.ts, drawVendingMachine) и корпуса в комнате.
const BODY_CORNER = 18;
const BODY_SIDE = 14; // ширина левого бока, px
const TRIM_INSET = 6; // хромированная окантовка — на столько внутри края лицевой части
// Дверца: петля слева, поэтому при открытии она сжимается по x к петле — как переворот записки.
// Открытая дверца исчезает совсем: полосы у левого края нет, витрина свободна.
const DOOR_CLOSED_SCALE = 1;
const DOOR_OPEN_SCALE = 0;
const HANDLE_WIDTH = 12;
const HANDLE_MARGIN = 30; // от правого края дверцы до ручки
const HANDLE_TOP = 55; // от верха дверцы до ручки
const HANDLE_BOTTOM = 55;
// Детали полотна в стиле корпуса: хромированная накладка-маркиза сверху и тонкий шов петли у левого края.
const MARQUEE_Y = 16; // от верха дверцы до накладки
const MARQUEE_HEIGHT = 5;
const MARQUEE_INSET = 14; // накладка не доходит до окантовки на столько
const HINGE_X = 11; // шов петли — сразу внутри левой окантовки
const HINGE_TOP = 18;
const HINGE_BOTTOM = 18;
// Анимации, мс.
const DOOR_TIME = 240; // открытие дверцы; закрытие мгновенное — при входе и выходе из магазина
const PAY_FLYING = 4; // столько значков оплаты летит из шапки панели к товару (для красоты: цена может быть любой)
const PAY_FLY_TIME = 400;
const PAY_STAGGER = 60;
const TAKE_TIME = 260; // покупка гаснет, когда оплата долетела
const SHAKE_TIME = 50; // один рывок тряски «не хватает»

/**
 * Маленький автомат на панели магазина, слева от торгового: тот же корпус, только меньше, и стоит с торговым
 * на одном полу. Два ряда — место на полке за фишки и гнездо амулета за билеты. Витрину закрывает дверца
 * с вертикальной ручкой: клик по ней — дверца откидывается вбок, и товар с ценниками становится виден.
 * Покупку делает сцена (ShopScene.buySlot и buySocket) — здесь только показ, дверца, оплата и «не хватает».
 */
export class MiniShop {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container; // слой магазина: автомат, покупки и ценники на нём
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит в ряду
  private readonly priceIcons: Phaser.GameObjects.Image[] = []; // ценник: фишка или билет…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 20»
  private readonly prices: (number | null)[] = [null, null]; // цена ряда; null — ряд не продаётся
  private readonly door: Phaser.GameObjects.Graphics; // дверца витрины: корпус → товар → стекло → ценники → дверца
  private readonly hint: Hint; // подсказка магазина: при открытии дверцы её табличку убираем
  private isOpen = false; // панель встала — товар на витрине
  private isDoorOpen = false; // дверца открыта — товар и ценники видны, покупка возможна

  /** buy(row) — кликнули по ряду; layer — слой магазина, куда кладётся автомат и его товар. */
  constructor(scene: Phaser.Scene, buy: (row: number) => void, hint: Hint, layer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.layer = layer;
    this.hint = hint;
    createChipTextures(scene);
    createTicketTexture(scene);
    createShelfTextures(scene, SHELF_CELL);
    createMiniSocketTexture(scene, MINI_SHOP_SOCKET_RADIUS);
    this.buildMachine();
    // Порядок в витрине: корпус (с полками и табличками) → товар → стекло → ценники → дверца.
    // Дверца последней: закрытая, она скрывает и товар, и ценники.
    for (let row = 0; row < ROWS; row++) {
      const good = scene.add.image(MINI_SHOP_GOOD_X, MINI_SHOP_ROW_Y[row], this.textureFor(row)).setScale(GOOD_SCALES[row]);
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
    this.door = this.buildDoor();
    this.layer.add(this.door);
    attachHint(this.door, hint, () => this.doorHint(), () => this.openDoor());
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
   * Дверца витрины: хромированная окантовка, тёмное полотно и вертикальная ручка у правого края — как дверца
   * холодильника. На полотне — те же детали, что на корпусе автомата: хромированная накладка сверху и шов петли
   * у левого края. Петля — левый край: дверца нарисована от (0, 0), поэтому scaleX сжимает её к петле.
   */
  private buildDoor(): Phaser.GameObjects.Graphics {
    const { width, height } = MINI_SHOP_DOOR;
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(3, 4, width, height, 10); // тень дверцы на корпусе
    g.fillStyle(CHROME);
    g.fillRoundedRect(0, 0, width, height, 10); // хромированная окантовка дверцы
    g.fillStyle(0x1b2432);
    g.fillRoundedRect(5, 5, width - 10, height - 10, 7); // тёмное полотно
    g.fillStyle(0xffffff, 0.03);
    g.fillRoundedRect(9, 9, width - 18, 2, 1); // узкая светлая кромка под окантовкой — дверца не сливается с лицевой частью

    // Маркиза: хромированная накладка сверху полотна — как окантовка на корпусе торгового автомата.
    g.fillStyle(CHROME);
    g.fillRoundedRect(MARQUEE_INSET, MARQUEE_Y, width - 2 * MARQUEE_INSET, MARQUEE_HEIGHT, 2);
    g.fillStyle(CHROME_LIGHT);
    g.fillRect(MARQUEE_INSET + 3, MARQUEE_Y + 1, width - 2 * MARQUEE_INSET - 6, 1); // блик на накладке
    // Шов петли: тёмная щель и тонкая хромовая кромка рядом — дверца читается навешенной, а не наклеенной.
    g.fillStyle(0x0b0f19, 0.9);
    g.fillRect(HINGE_X, HINGE_TOP, 2, height - HINGE_TOP - HINGE_BOTTOM);
    g.fillStyle(CHROME, 0.45);
    g.fillRect(HINGE_X + 2, HINGE_TOP, 1, height - HINGE_TOP - HINGE_BOTTOM);

    const handleX = width - HANDLE_MARGIN;
    const handleHeight = height - HANDLE_TOP - HANDLE_BOTTOM;
    g.fillStyle(0x0b0f19);
    g.fillRoundedRect(handleX - 4, HANDLE_TOP - 6, HANDLE_WIDTH + 8, handleHeight + 12, 7); // ниша ручки
    g.fillStyle(CHROME);
    g.fillRoundedRect(handleX, HANDLE_TOP, HANDLE_WIDTH, handleHeight, 6); // хромированная ручка
    g.fillStyle(CHROME_LIGHT);
    g.fillRoundedRect(handleX + 3, HANDLE_TOP + 3, 3, handleHeight - 6, 2); // блик на ручке
    g.fillStyle(0x475569);
    g.fillRect(handleX + 9, HANDLE_TOP + 2, 2, handleHeight - 4); // тень справа

    g.setPosition(MINI_SHOP_DOOR.x - width / 2, MINI_SHOP_DOOR.y - height / 2);
    // Зона нажатия — вся дверца: у Graphics нет своего размера для попадания.
    g.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    return g;
  }

  /** Стекло витрины: та же плёнка с бликом, что у торгового автомата, — товар читается за стеклом. */
  private buildGlass(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    drawGlassPane(g, MINI_SHOP_GLASS);
    return g;
  }

  /** Картинка ряда: клетка полки или гнездо амулета — то, что покупают. */
  private textureFor(row: number): string {
    return row === SLOT_ROW ? SHELF_CELL_TEXTURE : MINI_SOCKET_TEXTURE;
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

  /** Подсказка дверцы: пока закрыта — как открыть; открытую дверцу кликом не закрыть, поэтому подсказки нет. */
  private doorHint(): [string, string] | null {
    if (this.isDoorOpen) return null;
    return [t('miniDoor'), t('miniDoorOpen')];
  }

  /** Клик по товару: покупаем, только когда дверца открыта, — за закрытой товара не видно. */
  private press(row: number, buy: (row: number) => void): void {
    if (!this.isOpen || !this.isDoorOpen) return;
    buy(row);
  }

  /**
   * Клик по дверце или её ручке: только открыть. Закрывается дверца сама — при входе в магазин и при выходе
   * (open() и clear()), чтобы товар никогда не оставался открытым без хозяина.
   */
  private openDoor(): void {
    if (!this.isOpen || this.isDoorOpen) return; // панель ещё едет или уже уехала; открытую дверцу клик не трогает
    this.hint.hide(); // табличка «клик — открыть» больше не верна: дверца открывается под курсором
    this.setDoor(true, true);
  }

  /**
   * Дверца в нужное положение. Товар и ценники видны, только пока она открыта; закрываясь, она растёт из петли
   * и накрывает витрину — поэтому прячем их сразу, а не в конце анимации. Открытая дверца исчезает совсем:
   * у левого края не остаётся полосы поверх хромовой рамки витрины.
   */
  private setDoor(open: boolean, animate: boolean): void {
    this.isDoorOpen = open;
    this.scene.tweens.killTweensOf(this.door);
    this.door.setVisible(true);
    for (let row = 0; row < ROWS; row++) this.showRow(row);
    if (!animate) {
      this.door.setScale(open ? DOOR_OPEN_SCALE : DOOR_CLOSED_SCALE, 1).setVisible(!open);
      return;
    }
    this.scene.tweens.add({
      targets: this.door,
      scaleX: open ? DOOR_OPEN_SCALE : DOOR_CLOSED_SCALE,
      duration: DOOR_TIME,
      ease: 'Quad.easeInOut',
      onComplete: () => {
        if (open) this.door.setVisible(false); // полотно ушло в петлю — до следующего закрытия его нет
      },
    });
  }

  /** Панель поехала: дверца закрыта, товар и ценники прошлого захода убираются сразу, чтобы на съезде не мелькал старый магазин. */
  clear(): void {
    this.hint.hide(); // ховер «клик — открыть» не должен висеть, если курсор был над дверцей в момент уезда панели
    this.isOpen = false;
    this.setDoor(false, false);
  }

  /** Панель встала: автомат перед игроком, но дверца закрыта — её открывает игрок. */
  open(): void {
    this.hint.hide(); // подсказка прошлого захода не должна висеть под курсором у нового автомата
    this.isOpen = true;
    this.setDoor(false, false);
  }

  /** Ряд как есть: товар на полке и ценник справа — только при открытой дверце; пустой ряд — ничего. */
  private showRow(row: number): void {
    const isShown = this.prices[row] !== null && this.isOpen && this.isDoorOpen;
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

  /** Купили ряд row: из шапки панели к товару летит оплата, покупка гаснет на полке — потом landed(). */
  sell(row: number, landed: () => void): void {
    const good = this.goods[row];
    const fromX = row === SLOT_ROW ? SHOP_HUD.chipX : SHOP_HUD.ticketX; // оплата летит от своего значка в шапке панели
    for (let index = 0; index < PAY_FLYING; index++) {
      const coin = this.scene.add.image(fromX, SHOP_HUD.y, this.priceTexture(row)).setDepth(SHOP_FLY_DEPTH);
      this.scene.tweens.add({
        targets: coin,
        x: good.x, // к самому товару на полке: щели у автомата больше нет
        y: good.y,
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

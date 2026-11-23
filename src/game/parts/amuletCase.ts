import Phaser from 'phaser';
import {
  amuletTexture,
  CHIP_TEXTURE,
  createAmuletTextures,
  createChipTextures,
  createTicketTexture,
  drawGlassPane,
  TICKET_TEXTURE,
} from '../decor';
import { AMULETS, MINI_CASE_PLACES, type Amulet } from '../amulets';
import { t } from '../lang';
import {
  AMULET_CASE,
  AMULET_CASE_ICON_Y,
  AMULET_CASE_PLACES,
  AMULET_CASE_PRICE_Y,
  AMULET_SIZE,
  amuletCaseX,
  miniCaseX,
  MINI_CASE,
  MINI_CASE_ICON_Y,
  MINI_CASE_PRICE_Y,
  SHOP_HUD,
  type Box,
} from '../layout';
import { addText, fitTextWidth, LED_COLOR, LED_STYLE, RED_TEXT, SHOP_FLY_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

const PRICE_MIN_FONT_SIZE = 10; // длинная цена мельче, чтобы влезть в табличку и не выйти за стекло
const DIM_ALPHA = 0.4; // амулет некуда поставить — он тусклый
// Анимации, мс.
const PAY_FLY_TIME = 400; // оплата летит из шапки панели в витрину
const PAY_STAGGER = 70;
const SHAKE_TIME = 50; // один рывок тряски «не хватает»
// Чемодан приезжает и уезжает вместе с панелью; здесь — только крышка и вещи.
const LID_TIME = 350; // крышка открывается
const POP_TIME = 220;
const POP_STAGGER = 90;
// Слои: корпус (с закрытой крышкой), потом вещи и ценники — их показывают, когда крышка уже открыта.
const BODY_DEPTH = 1;
const GOODS_DEPTH = 2;
const LEATHER = 0x6b3f1d;
const LEATHER_LIGHT = 0x8a5a2b;
const GOLD = 0xd4a62a;

/** Как выглядит чемодан: у основного и у мини свои размеры, шаг мест и валюта ценника. */
export interface CaseLook {
  box: Box; // корпус; от угла с high стороны
  places: number; // сколько мест на бархате
  iconY: number; // середина амулета на месте
  priceY: number; // середина таблички с ценой
  amuletScale: number; // амулет крупнее, чем в гнезде
  lidRaised: number; // высота откинутой крышки над чемоданом
  plate: { width: number; height: number }; // табличка для ценника на бархате
  priceTexture: string; // чем платят: билет или фишка
  priceIconScale: number;
  priceIconDx: number; // значок цены — левее центра места на столько
  priceTextDx: number; // число цены — правее центра места
  pricePrefix: boolean; // писать «× N» (билеты) или только число (фишки: значок уже говорит валюту)
  priceFontSize: number;
  priceMaxWidth: number; // шире ценник не бывает: дальше шрифт уменьшается
  placeX: (place: number) => number; // где стоит место номер place
}

/** Основной чемодан: три амулета за билеты над торговым автоматом. */
export const MAIN_CASE_LOOK: CaseLook = {
  box: AMULET_CASE,
  places: AMULET_CASE_PLACES,
  iconY: AMULET_CASE_ICON_Y,
  priceY: AMULET_CASE_PRICE_Y,
  amuletScale: 1.35,
  lidRaised: 44,
  plate: { width: 68, height: 24 },
  priceTexture: TICKET_TEXTURE,
  priceIconScale: 0.6,
  priceIconDx: -20,
  priceTextDx: -5,
  pricePrefix: true,
  priceFontSize: 16,
  priceMaxWidth: 60,
  placeX: (place) => amuletCaseX(place, AMULET_CASE_PLACES),
};

/** Мини-чемодан за фишки (`DONTLIKE` п.7): два амулета, слева от основного; тот же чемодан, только меньше. */
export const MINI_CASE_LOOK: CaseLook = {
  box: MINI_CASE,
  places: MINI_CASE_PLACES,
  iconY: MINI_CASE_ICON_Y,
  priceY: MINI_CASE_PRICE_Y,
  amuletScale: 1,
  lidRaised: 30,
  plate: { width: 62, height: 22 },
  priceTexture: CHIP_TEXTURE,
  priceIconScale: 0.42,
  priceIconDx: -22,
  priceTextDx: -12,
  pricePrefix: false, // у фишек цены шестизначные: «×» съел бы место, значок фишки и так говорит валюту
  priceFontSize: 13,
  priceMaxWidth: 42,
  placeX: (place) => miniCaseX(place, MINI_CASE_PLACES),
};

/** Что лежит в витрине. */
export interface CaseStock {
  amulets: (Amulet | null)[]; // амулеты по местам; null или меньше places — места пустые
  prices: number[]; // их цены в валюте этого чемодана (билеты или фишки)
}

/**
 * Чемодан с амулетами на панели магазина: сам корпус с крышкой, места с амулетами и ценниками.
 * Один класс на два чемодана — основной (три амулета за билеты) и мини за фишки (`DONTLIKE` п.7): отличаются
 * только CaseLook. При входе в магазин панель привозит чемодан закрытым, крышка откидывается, вещи появляются
 * по одной. Клик по месту — купить, когда чемодан открыт; цену и валюту решает сцена. При наведении — подсказка.
 * Пока амулеты не открыты (setAvailable(false)), чемодана не видно и он не ловит клики.
 */
export class AmuletCase {
  private readonly scene: Phaser.Scene;
  private readonly look: CaseLook;
  private readonly layer: Phaser.GameObjects.Container; // слой магазина: чемодан и вещи на нём
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит на месте
  private readonly priceIcons: Phaser.GameObjects.Image[] = []; // ценник: билет или фишка…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 2»
  private readonly marks: Phaser.GameObjects.Graphics[]; // тень под вещью и плашка для ценника каждого места — гаснут вместе с товаром
  private readonly glass: Phaser.GameObjects.Graphics; // плёнка с бликом над бархатом и вещами — как у торгового автомата
  prices: (number | null)[] = []; // цена места в валюте чемодана; null — место пустое
  private amulets: (Amulet | null)[] = []; // какой амулет на каком месте
  private readonly suitcase: Phaser.GameObjects.Container; // корпус и обе крышки — выезжают вместе
  private readonly lidFront: Phaser.GameObjects.Container; // закрытая крышка: лежит на корпусе
  private readonly lidBack: Phaser.GameObjects.Container; // откинутая крышка: стоит над чемоданом
  private open = false; // крышка откинута, вещи на местах — можно покупать
  private available = false; // амулеты открыты (закрыт первый долг); нет — чемодан спрятан и не работает

  /** Чемодан открыт — можно покупать. */
  get isOpen(): boolean {
    return this.open;
  }

  /**
   * buy(place) — кликнули по месту витрины; isAvailable — амулеты открыты (закрыт первый долг);
   * layer — слой магазина, куда кладётся чемодан и его вещи.
   */
  constructor(scene: Phaser.Scene, look: CaseLook, buy: (place: number) => void, hint: Hint, isAvailable: boolean, layer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.look = look;
    this.layer = layer;
    createTicketTexture(scene);
    createChipTextures(scene);
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    const { suitcase, lidFront, lidBack, marks, glass } = this.buildSuitcase();
    this.suitcase = suitcase;
    this.lidFront = lidFront;
    this.lidBack = lidBack;
    this.marks = marks;
    this.glass = glass;
    // Порядок слоёв: корпус → вещи → стекло → ценники. Амулеты лежат под стеклом, их цены читаются поверх.
    for (let place = 0; place < look.places; place++) {
      const good = scene.add.image(look.placeX(place), look.iconY, this.textureFor(place)).setScale(look.amuletScale).setVisible(false);
      good.setInteractive({ useHandCursor: true }).setDepth(GOODS_DEPTH);
      attachHint(good, hint, () => (this.open ? this.hintFor(place) : null), () => buy(place));
      this.goods.push(good);
      this.layer.add(good);
    }
    this.layer.add(glass);
    for (let place = 0; place < look.places; place++) {
      const x = look.placeX(place);
      const priceIcon = scene.add.image(x + look.priceIconDx, look.priceY, look.priceTexture).setScale(look.priceIconScale).setDepth(GOODS_DEPTH).setVisible(false);
      this.priceIcons.push(priceIcon);
      const priceText = addText(scene, x + look.priceTextDx, look.priceY, '', { ...LED_STYLE, fontSize: `${look.priceFontSize}px` })
        .setOrigin(0, 0.5)
        .setDepth(GOODS_DEPTH);
      this.priceTexts.push(priceText);
      this.layer.add([priceIcon, priceText]);
    }
    this.setAvailable(isAvailable);
  }

  /**
   * Амулеты открылись (или ещё нет): закрытый чемодан показывается, а вещи ждут fill на вставшей панели;
   * не открылись — спрятано всё и клики по местам не ловятся.
   */
  setAvailable(isAvailable: boolean): void {
    this.available = isAvailable;
    if (!isAvailable) this.open = false;
    for (const part of [this.suitcase, this.lidFront, this.lidBack]) part.setVisible(isAvailable);
    for (const part of [this.glass, ...this.goods, ...this.priceIcons, ...this.priceTexts, ...this.marks]) part.setVisible(false);
    for (const good of this.goods) {
      if (isAvailable) good.setInteractive({ useHandCursor: true });
      else good.disableInteractive();
    }
  }

  /**
   * Чемодан из частей: корпус с красной подкладкой, закрытая крышка с замками, откинутая крышка.
   * Тени под вещами и плашки под ценники — отдельные объекты (marks): после покупки они гаснут вместе с товаром.
   */
  private buildSuitcase(): {
    suitcase: Phaser.GameObjects.Container;
    lidFront: Phaser.GameObjects.Container;
    lidBack: Phaser.GameObjects.Container;
    marks: Phaser.GameObjects.Graphics[];
    glass: Phaser.GameObjects.Graphics;
  } {
    const scene = this.scene;
    const look = this.look;
    const { x, y, width, height } = look.box;
    const left = x - width / 2;
    const top = y - height / 2;

    const body = scene.add.graphics();
    body.fillStyle(0x000000, 0.5);
    body.fillRoundedRect(left + 10, top + 8, width, height, 10); // тень на стене
    body.fillStyle(LEATHER);
    body.fillRoundedRect(left, top, width, height, 10); // корпус
    body.fillStyle(0x3f0a0a);
    body.fillRoundedRect(left + 10, top + 8, width - 20, height - 16, 6); // красная подкладка
    // Окантовка и гравировка — одни на оба чемодана (п.7): золотая кромка по коже и строчка вокруг подкладки.
    body.lineStyle(2, GOLD, 0.55);
    body.strokeRoundedRect(left + 1.5, top + 1.5, width - 3, height - 3, 9);
    body.lineStyle(1, 0x2a1a0e, 0.9);
    body.strokeRoundedRect(left + 6, top + 5, width - 12, height - 10, 7);
    const marks: Phaser.GameObjects.Graphics[] = [];
    for (let place = 0; place < look.places; place++) {
      const placeX = look.placeX(place);
      const mark = scene.add.graphics();
      mark.fillStyle(0x000000, 0.35);
      mark.fillEllipse(placeX, look.iconY + 27 * look.amuletScale, 48 * look.amuletScale, 10); // тень под вещью
      mark.fillStyle(0x1c0505);
      mark.fillRoundedRect(placeX - look.plate.width / 2, look.priceY - look.plate.height / 2, look.plate.width, look.plate.height, 5); // табличка для ценника
      mark.lineStyle(1, 0x8a5a2b, 0.9);
      mark.strokeRoundedRect(placeX - look.plate.width / 2, look.priceY - look.plate.height / 2, look.plate.width, look.plate.height, 5); // латунная окантовка таблички
      marks.push(mark);
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
    front.lineStyle(2, GOLD, 0.5);
    front.strokeRoundedRect(-width / 2 + 2, 2, width - 4, height - 4, 9); // золотая кромка крышки
    front.lineStyle(5, 0x2a1a0e);
    front.strokeRoundedRect(-24, -7, 48, 16, 6); // ручка
    lidFront.add(front);

    const lidBack = scene.add.container(x, top).setScale(1, 0); // от верхнего края корпуса вверх: растёт вверх
    const back = scene.add.graphics();
    back.fillStyle(LEATHER);
    back.fillRoundedRect(-width / 2 + 6, -look.lidRaised, width - 12, look.lidRaised + 4, { tl: 8, tr: 8, bl: 0, br: 0 });
    back.fillStyle(0x5a1010);
    back.fillRoundedRect(-width / 2 + 14, -look.lidRaised + 7, width - 28, look.lidRaised - 6, 4); // подкладка крышки
    back.lineStyle(1.5, GOLD, 0.45);
    back.strokeRoundedRect(-width / 2 + 9, -look.lidRaised + 2, width - 18, look.lidRaised - 1, { tl: 7, tr: 7, bl: 0, br: 0 }); // окантовка откинутой крышки
    lidBack.add(back);

    const suitcase = scene.add.container(0, 0, [lidBack, body]);
    suitcase.setDepth(BODY_DEPTH);
    for (const mark of marks) suitcase.add(mark); // тени и плашки — поверх корпуса, но под закрытой крышкой
    suitcase.add(lidFront); // едет вместе с корпусом, закрытая крышка рисуется поверх корпуса
    this.layer.add(suitcase); // чемодан — на панели магазина: уезжает и приезжает вместе с ней

    // Стекло — над красным бархатом (не над кожаным корпусом): плёнка и блик, как у витрины торгового автомата.
    // В слой оно попадает после вещей (конструктор), а ценники — после стекла.
    const glass = scene.add.graphics();
    drawGlassPane(glass, { x, y, width: width - 20, height: height - 16 }, 6);
    glass.setVisible(false);
    return { suitcase, lidFront, lidBack, marks, glass };
  }

  /** Картинка места: амулет. */
  private textureFor(place: number): string {
    const amulet = this.amulets[place];
    return amulet ? amuletTexture(amulet) : amuletTexture(AMULETS[0]);
  }

  /** Подсказка места: что это и что делает. */
  private hintFor(place: number): [string, string] | null {
    if (this.priceOf(place) === null) return null;
    const amulet = this.amulets[place];
    return amulet ? [t(amulet.name), t(amulet.description)] : null;
  }

  /**
   * Панель поехала: чемодан пуст и закрыт — вещи и ценники прошлого захода убираются сразу, чтобы на съезде не мелькал
   * старый магазин, а крышка не мигала туда-сюда. Наполняет его fill, когда панель уже встала.
   */
  clear(): void {
    this.open = false;
    this.amulets = [];
    this.prices = new Array<number | null>(this.look.places).fill(null);
    for (const target of [this.suitcase, this.lidFront, this.lidBack, this.glass, ...this.goods, ...this.marks, ...this.priceIcons, ...this.priceTexts]) {
      this.scene.tweens.killTweensOf(target);
    }
    this.suitcase.setY(0); // чемодан на своём месте на панели
    this.lidFront.setScale(1, 1);
    this.lidBack.setScale(1, 0);
    this.glass.setVisible(false); // стекло появляется вместе с вещами (popGoods)
    for (let place = 0; place < this.look.places; place++) {
      this.goods[place].setVisible(false);
      this.priceIcons[place].setVisible(false);
      this.marks[place].setVisible(false); // тень и плашка под ценником — вместе с вещью
      // Ценник могли поймать посреди тряски deny — возвращаем его на место, иначе он встанет не там.
      this.priceTexts[place].setX(this.look.placeX(place) + this.look.priceTextDx).setText('').setVisible(false);
    }
  }

  /** Разложить товар. Амулетов может быть меньше мест — тогда место пустое. */
  fill(stock: CaseStock): void {
    if (!this.available) return; // амулетов ещё нет — чемодан не открываем
    this.amulets = [];
    this.prices = [];
    for (let place = 0; place < this.look.places; place++) {
      const amulet = stock.amulets[place] ?? null;
      this.amulets.push(amulet);
      this.prices.push(amulet ? stock.prices[place] : null);
    }
    this.open = false;
    for (let place = 0; place < this.look.places; place++) this.showPlace(place);
    this.playOpening();
  }

  /** Панель привезла чемодан закрытым: крышка откидывается, вещи появляются по одной — потом можно покупать. */
  private playOpening(): void {
    const tweens = this.scene.tweens;
    for (const target of [this.lidFront, this.lidBack, ...this.goods, ...this.marks]) tweens.killTweensOf(target);
    this.lidFront.setScale(1, 1);
    this.lidBack.setScale(1, 0);
    tweens.add({ targets: this.lidFront, scaleY: 0, duration: LID_TIME, ease: 'Sine.easeInOut' });
    tweens.add({ targets: this.lidBack, scaleY: 1, duration: LID_TIME, ease: 'Sine.easeInOut', onComplete: () => this.popGoods() });
  }

  /** Вещи, ценники, их тени и плашки появляются по одной, пустые места пропускаем. */
  private popGoods(): void {
    this.open = true;
    let shown = 0;
    this.prices.forEach((price, place) => {
      if (price === null) return;
      const good = this.goods[place];
      const delay = shown++ * POP_STAGGER;
      good.setVisible(true).setScale(0);
      this.scene.tweens.add({ targets: good, scale: this.look.amuletScale, delay, duration: POP_TIME, ease: 'Back.easeOut' });
      for (const tag of [this.marks[place], this.priceIcons[place], this.priceTexts[place]]) {
        tag.setVisible(true).setAlpha(0);
        this.scene.tweens.add({ targets: tag, alpha: 1, delay, duration: POP_TIME });
      }
    });
    this.glass.setVisible(shown > 0); // пустой чемодан: стекла над бархатом нет
  }

  /** Место как есть: товар, его тень, плашка и ценник; пустое место — ничего. */
  private showPlace(place: number): void {
    const price = this.priceOf(place);
    const isEmpty = price === null;
    const good = this.goods[place];
    good.setTexture(this.textureFor(place)).setScale(this.look.amuletScale);
    const isShown = !isEmpty && this.open; // пока чемодан закрыт, вещи прячутся: их покажет popGoods
    good.setPosition(this.look.placeX(place), this.look.iconY).setAlpha(1).setVisible(isShown);
    this.marks[place].setVisible(isShown);
    this.priceIcons[place].setTexture(this.look.priceTexture).setVisible(isShown);
    this.paintPrice(place);
    this.priceTexts[place].setVisible(isShown);
  }

  /** Цена места в валюте чемодана; null — место пустое. */
  private priceOf(place: number): number | null {
    return this.prices[place] ?? null;
  }

  /** Цена в месте: «× 170». Длинная мельче, а если и этого мало — ужимается по ширине: за табличку и стекло не выходит. */
  private paintPrice(place: number): void {
    const text = this.priceTexts[place];
    const price = this.priceOf(place);
    if (price === null) {
      text.setText('');
      return;
    }
    fitTextWidth(text, this.look.pricePrefix ? `× ${price}` : `${price}`, this.look.priceMaxWidth, this.look.priceFontSize, PRICE_MIN_FONT_SIZE);
  }

  /**
   * Ценники: в валюте чемодана хватает — жёлтые, нет — красные. Амулет, который некуда поставить
   * (ready[place] — false), — тусклый. balance — сколько валюты этого чемодана на табло панели; prices —
   * свежие цены (у мини-чемодана они зависят от фишек на руках, поэтому пересчитываются при каждой покупке).
   */
  refresh(balance: number, prices: (number | null)[], ready: boolean[]): void {
    this.prices.forEach((_price, place) => {
      const next = prices[place] ?? null;
      if (next !== this.prices[place]) {
        this.prices[place] = next;
        this.showPlace(place);
      }
      const price = this.priceOf(place);
      if (price === null) return;
      this.priceTexts[place].setColor(price <= balance ? LED_COLOR : RED_TEXT);
      this.goods[place].setAlpha(ready[place] ? 1 : DIM_ALPHA);
    });
  }

  /** Купили место place: из шапки панели в витрину летит оплата, товар исчезает — landed(x, y) с его места. */
  sell(place: number, landed: (x: number, y: number) => void): void {
    const good = this.goods[place];
    const { x, y } = good;
    const fromX = this.look.priceTexture === CHIP_TEXTURE ? SHOP_HUD.chipX : SHOP_HUD.ticketX; // оплата летит от своего значка в шапке
    const count = 3; // для красоты: цена может быть любой
    for (let index = 0; index < count; index++) {
      const coin = this.scene.add.image(fromX, SHOP_HUD.y, this.look.priceTexture).setDepth(SHOP_FLY_DEPTH);
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
    // Ценник пропадает сразу, товар — когда до него долетит оплата. Тень с плашкой гаснут вместе с товаром.
    this.prices[place] = null;
    this.priceIcons[place].setVisible(false);
    this.priceTexts[place].setText('');
    this.scene.time.delayedCall(count * PAY_STAGGER + PAY_FLY_TIME, () => {
      if (this.priceOf(place) === null) {
        good.setVisible(false);
        this.marks[place].setVisible(false);
      }
      landed(x, y);
    });
  }

  /** Не хватает: ценник места трясётся. */
  deny(place: number): void {
    const text = this.priceTexts[place];
    const homeX = this.look.placeX(place) + this.look.priceTextDx;
    this.scene.tweens.killTweensOf(text);
    text.setX(homeX);
    this.scene.tweens.add({ targets: text, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => text.setX(homeX) });
  }
}

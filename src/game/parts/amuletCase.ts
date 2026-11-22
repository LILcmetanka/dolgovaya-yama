import Phaser from 'phaser';
import {
  amuletTexture,
  CHIP_TEXTURE,
  createAmuletTextures,
  createTicketTexture,
  drawGlassPane,
  TICKET_TEXTURE,
} from '../decor';
import { AMULETS, type Amulet } from '../amulets';
import { t } from '../lang';
import {
  AMULET_CASE,
  AMULET_CASE_ICON_Y,
  AMULET_CASE_PLACES,
  AMULET_CASE_PRICE_Y,
  AMULET_SIZE,
  amuletCaseX,
  SHOP_HUD,
} from '../layout';
import { addText, LED_COLOR, LED_STYLE, RED_TEXT, SHOP_FLY_DEPTH } from '../theme';
import { attachHint, type Hint } from './tooltip';

// Амулет в чемодане крупнее, чем в гнезде и на табло.
const AMULET_SCALE = 1.35;
const PRICE_ICON_SCALE = 0.6;
const PRICE_TEXT_DX = -6; // «× 2» — правее значка ценника
const DIM_ALPHA = 0.4; // амулет некуда поставить — он тусклый
// Анимации, мс.
const PAY_FLY_TIME = 400; // билеты летят из шапки панели в витрину
const PAY_STAGGER = 70;
const SHAKE_TIME = 50; // один рывок тряски «не хватает»
// Чемодан приезжает и уезжает вместе с панелью; здесь — только крышка и вещи.
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
  amulets: Amulet[]; // амулеты по местам; если их меньше AMULET_CASE_PLACES — места пустые
  amuletPrices: number[]; // их цены в билетах
  amuletChipPrices?: number[]; // их цены в фишках (улучшение №39): показываются в режиме «ЗА ФИШКИ»
}

/**
 * Чемодан с амулетами на панели магазина над торговым автоматом: три амулета за билеты.
 * При входе в магазин панель привозит его сверху закрытым, крышка откидывается, вещи появляются по одной.
 * Клик по месту (или клавиша с номером, её ловит сцена) — купить, когда чемодан открыт. При наведении — подсказка.
 * Пока амулеты не открыты (setAvailable(false)), чемодана не видно и он не ловит клики.
 */
export class AmuletCase {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Container; // слой магазина: чемодан и вещи на нём
  private readonly goods: Phaser.GameObjects.Image[] = []; // что лежит на месте
  private readonly priceIcons: Phaser.GameObjects.Image[] = []; // ценник: билет…
  private readonly priceTexts: Phaser.GameObjects.Text[] = []; // …и «× 2»
  private readonly marks: Phaser.GameObjects.Graphics[]; // тень под вещью и плашка для ценника каждого места — гаснут вместе с товаром
  private readonly glass: Phaser.GameObjects.Graphics; // плёнка с бликом над бархатом и вещами — как у торгового автомата
  private prices: (number | null)[] = []; // цена места в билетах; null — место пустое
  private chipPrices: (number | null)[] = []; // цена места в фишках (улучшение №39)
  private amulets: (Amulet | null)[] = []; // какой амулет на каком месте
  private chipMode = false; // витрина показывает и продаёт за фишки (улучшение №39)
  private chipAvailable = false; // кнопка режима видна: улучшение куплено и амулеты открыты
  private chipUsed = false; // раз за забег фишками уже платили — режим больше не включается
  private chipButton!: Phaser.GameObjects.Rectangle; // плашка кнопки «ЗА ФИШКИ»
  private chipLabel!: Phaser.GameObjects.Text; // её надпись
  private chipZone!: Phaser.GameObjects.Zone; // зона нажатия кнопки
  private ticketsShown = 0; // последние числа для перекраски цен при переключении режима
  private chipsShown = 0;
  private readyShown: boolean[] = [];
  private readonly suitcase: Phaser.GameObjects.Container; // корпус и обе крышки — выезжают вместе
  private readonly lidFront: Phaser.GameObjects.Container; // закрытая крышка: лежит на корпусе; вещи и ценники — соседи чемодана в слое панели и рисуются поверх неё (их прячут явно)
  private readonly lidBack: Phaser.GameObjects.Container; // откинутая крышка: стоит над чемоданом
  private open = false; // крышка откинута, вещи на местах — можно покупать
  private available = false; // амулеты открыты (закрыт первый долг); нет — чемодан спрятан и не работает

  /** Чемодан открыт — можно покупать. */
  get isOpen(): boolean {
    return this.open;
  }

  /** Витрина сейчас продаёт за фишки (улучшение №39): сцена по этому полю выбирает валюту покупки. */
  get isChipMode(): boolean {
    return this.chipMode;
  }

  /**
   * buy(place) — кликнули по месту витрины; isAvailable — амулеты открыты (закрыт первый долг);
   * layer — слой магазина, куда кладётся чемодан и его вещи.
   */
  constructor(scene: Phaser.Scene, buy: (place: number) => void, hint: Hint, isAvailable: boolean, layer: Phaser.GameObjects.Container) {
    this.scene = scene;
    this.layer = layer;
    createTicketTexture(scene);
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    const { suitcase, lidFront, lidBack, marks, glass } = this.buildSuitcase();
    this.suitcase = suitcase;
    this.lidFront = lidFront;
    this.lidBack = lidBack;
    this.marks = marks;
    this.glass = glass;
    // Порядок слоёв: корпус → вещи → стекло → ценники. Амулеты лежат под стеклом, их цены читаются поверх.
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      const x = amuletCaseX(place, AMULET_CASE_PLACES);
      const good = scene.add.image(x, AMULET_CASE_ICON_Y, this.textureFor(place)).setScale(AMULET_SCALE).setVisible(false);
      good.setInteractive({ useHandCursor: true }).setDepth(GOODS_DEPTH);
      attachHint(good, hint, () => (this.open ? this.hintFor(place) : null), () => buy(place));
      this.goods.push(good);
      this.layer.add(good);
    }
    this.layer.add(glass);
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      const x = amuletCaseX(place, AMULET_CASE_PLACES);
      const priceIcon = scene.add.image(x - 18, AMULET_CASE_PRICE_Y, TICKET_TEXTURE).setScale(PRICE_ICON_SCALE).setDepth(GOODS_DEPTH).setVisible(false);
      this.priceIcons.push(priceIcon);
      const priceText = addText(scene, x + PRICE_TEXT_DX, AMULET_CASE_PRICE_Y, '', { ...LED_STYLE, fontSize: '16px' }).setOrigin(0, 0.5).setDepth(GOODS_DEPTH);
      this.priceTexts.push(priceText);
      this.layer.add([priceIcon, priceText]);
    }
    this.setAvailable(isAvailable);
    this.buildChipButton(); // кнопка режима «ЗА ФИШКИ» (№39) — спрятана, пока улучшения нет
  }

  /**
   * Кнопка режима «ЗА ФИШКИ» под чемоданом (улучшение №39): клик переключает цены и валюту покупки.
   * Одноразовость держит сцена: после покупки за фишки кнопка гаснет и говорит «ИСПОЛЬЗОВАНО».
   */
  private buildChipButton(): void {
    const x = AMULET_CASE.x;
    const y = AMULET_CASE.y + AMULET_CASE.height / 2 + 16;
    this.chipButton = this.scene.add
      .rectangle(x, y, 150, 26, 0x0b0f19, 0.96)
      .setRounded(7)
      .setStrokeStyle(2, 0x2dd4bf)
      .setDepth(GOODS_DEPTH + 1)
      .setVisible(false);
    this.chipLabel = addText(this.scene, x, y, '', { fontSize: '14px', fontStyle: 'bold', color: '#5eead4' })
      .setOrigin(0.5)
      .setDepth(GOODS_DEPTH + 2)
      .setVisible(false);
    this.chipZone = this.scene.add.zone(x, y, 150, 26).setInteractive({ useHandCursor: true });
    this.chipZone.on('pointerdown', () => this.toggleChipMode());
    this.chipZone.setVisible(false);
    this.layer.add([this.chipButton, this.chipLabel, this.chipZone]);
  }

  /** Улучшение №39: показать кнопку режима; used — за забег фишками уже платили, режим больше не включается. */
  setChipOption(available: boolean, used: boolean): void {
    this.chipAvailable = available;
    this.chipUsed = used;
    if (!available || used) this.chipMode = false;
    this.chipButton.setVisible(available);
    this.chipLabel.setVisible(available);
    this.chipZone.setVisible(available);
    if (available) this.chipLabel.setText(t(used ? 'amuletChipUsed' : this.chipMode ? 'amuletTicketMode' : 'amuletChipMode'));
    for (let place = 0; place < AMULET_CASE_PLACES; place++) this.showPlace(place);
  }

  /** Клик по кнопке: билеты ↔ фишки. После траты за забег режим не включается. */
  private toggleChipMode(): void {
    if (!this.chipAvailable || this.chipUsed) return;
    this.chipMode = !this.chipMode;
    this.chipLabel.setText(t(this.chipMode ? 'amuletTicketMode' : 'amuletChipMode'));
    for (let place = 0; place < AMULET_CASE_PLACES; place++) this.showPlace(place);
    this.refresh(this.ticketsShown, this.chipsShown, this.readyShown);
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
    const marks: Phaser.GameObjects.Graphics[] = [];
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      const placeX = amuletCaseX(place, AMULET_CASE_PLACES);
      const mark = scene.add.graphics();
      mark.fillStyle(0x000000, 0.35);
      mark.fillEllipse(placeX, AMULET_CASE_ICON_Y + 27, 48, 10); // тень под вещью
      mark.fillStyle(0x1c0505);
      mark.fillRoundedRect(placeX - 34, AMULET_CASE_PRICE_Y - 12, 68, 24, 5); // табличка для ценника
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
    this.chipMode = false;
    this.prices = new Array<number | null>(AMULET_CASE_PLACES).fill(null);
    this.chipPrices = new Array<number | null>(AMULET_CASE_PLACES).fill(null);
    if (this.chipAvailable) this.chipLabel.setText(t(this.chipUsed ? 'amuletChipUsed' : 'amuletChipMode'));
    for (const target of [this.suitcase, this.lidFront, this.lidBack, this.glass, ...this.goods, ...this.marks, ...this.priceIcons, ...this.priceTexts]) {
      this.scene.tweens.killTweensOf(target);
    }
    this.suitcase.setY(0); // чемодан на своём месте на панели
    this.lidFront.setScale(1, 1);
    this.lidBack.setScale(1, 0);
    this.glass.setVisible(false); // стекло появляется вместе с вещами (popGoods)
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      this.goods[place].setVisible(false);
      this.priceIcons[place].setVisible(false);
      this.marks[place].setVisible(false); // тень и плашка под ценником — вместе с вещью
      // Ценник могли поймать посреди тряски deny — возвращаем его на место, иначе он встанет не там.
      this.priceTexts[place].setX(amuletCaseX(place, AMULET_CASE_PLACES) + PRICE_TEXT_DX).setText('').setVisible(false);
    }
  }

  /** Разложить товар. Амулетов может быть меньше мест — тогда место пустое. */
  fill(stock: CaseStock): void {
    if (!this.available) return; // амулетов ещё нет — чемодан не открываем
    this.amulets = [];
    this.prices = [];
    this.chipPrices = [];
    this.chipMode = false;
    if (this.chipAvailable) this.chipLabel.setText(t(this.chipUsed ? 'amuletChipUsed' : 'amuletChipMode'));
    for (let place = 0; place < AMULET_CASE_PLACES; place++) {
      const amulet = stock.amulets[place] ?? null;
      this.amulets.push(amulet);
      this.prices.push(amulet ? stock.amuletPrices[place] : null);
      this.chipPrices.push(amulet ? stock.amuletChipPrices?.[place] ?? null : null);
    }
    this.open = false;
    for (let place = 0; place < AMULET_CASE_PLACES; place++) this.showPlace(place);
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
      this.scene.tweens.add({ targets: good, scale: AMULET_SCALE, delay, duration: POP_TIME, ease: 'Back.easeOut' });
      for (const tag of [this.marks[place], this.priceIcons[place], this.priceTexts[place]]) {
        tag.setVisible(true).setAlpha(0);
        this.scene.tweens.add({ targets: tag, alpha: 1, delay, duration: POP_TIME });
      }
    });
    this.glass.setVisible(shown > 0); // пустой чемодан: стекла над бархатом нет
  }

  /** Место как есть: товар, его тень, плашка и ценник; пустое место — ничего. Ценник — в валюте режима. */
  private showPlace(place: number): void {
    const price = this.priceOf(place);
    const isEmpty = price === null;
    const good = this.goods[place];
    good.setTexture(this.textureFor(place)).setScale(AMULET_SCALE);
    const isShown = !isEmpty && this.open; // пока чемодан закрыт, вещи прячутся: их покажет popGoods
    good.setPosition(amuletCaseX(place, AMULET_CASE_PLACES), AMULET_CASE_ICON_Y).setAlpha(1).setVisible(isShown);
    this.marks[place].setVisible(isShown);
    this.priceIcons[place].setTexture(this.chipMode ? CHIP_TEXTURE : TICKET_TEXTURE).setVisible(isShown);
    this.priceTexts[place].setText(isEmpty ? '' : `× ${price}`).setVisible(isShown);
  }

  /** Цена места в текущей валюте витрины: в режиме №39 — фишки, иначе билеты. */
  private priceOf(place: number): number | null {
    return this.chipMode ? this.chipPrices[place] ?? null : this.prices[place];
  }

  /**
   * Ценники: в текущей валюте хватает — жёлтые, нет — красные. Амулет, который некуда поставить
   * (amuletReady[place] — false), — тусклый. tickets и chips — числа на табло панели.
   */
  refresh(tickets: number, chips: number, amuletReady: boolean[]): void {
    this.ticketsShown = tickets;
    this.chipsShown = chips;
    this.readyShown = amuletReady;
    const balance = this.chipMode ? chips : tickets;
    this.prices.forEach((_price, place) => {
      const price = this.priceOf(place);
      if (price === null) return;
      this.priceTexts[place].setColor(price <= balance ? LED_COLOR : RED_TEXT);
      this.goods[place].setAlpha(amuletReady[place] ? 1 : DIM_ALPHA);
    });
  }

  /** Купили место place: из шапки панели в витрину летит оплата, товар исчезает — landed(x, y) с его места. */
  sell(place: number, landed: (x: number, y: number) => void): void {
    const good = this.goods[place];
    const { x, y } = good;
    const isChips = this.chipMode; // №39: за фишки летят фишки, за билеты — билеты
    const fromX = isChips ? SHOP_HUD.chipX : SHOP_HUD.ticketX;
    const texture = isChips ? CHIP_TEXTURE : TICKET_TEXTURE;
    const count = 3; // для красоты: цена может быть любой
    for (let index = 0; index < count; index++) {
      const coin = this.scene.add.image(fromX, SHOP_HUD.y, texture).setDepth(SHOP_FLY_DEPTH);
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
    this.chipPrices[place] = null;
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
    const homeX = amuletCaseX(place, AMULET_CASE_PLACES) + PRICE_TEXT_DX;
    this.scene.tweens.killTweensOf(text);
    text.setX(homeX);
    this.scene.tweens.add({ targets: text, x: homeX + 6, duration: SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => text.setX(homeX) });
  }
}

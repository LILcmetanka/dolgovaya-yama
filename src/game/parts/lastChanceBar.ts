import Phaser from 'phaser';
import { itemTexture } from '../decor';
import { ITEMS } from '../items';
import { goalPattern } from '../lastChance';
import { t, type TextKey } from '../lang';
import { PAYOUT_WINDOW } from '../layout';
import { TOP_MULTIPLIER } from '../patterns';
import { addText, fitTextWidth, GOLD_TEXT, LED_STYLE, POPUP_DEPTH } from '../theme';
import { TAKE_BEZEL_LEFT } from './payoutWindow';
import { attachHint, type Hint } from './tooltip';

// Полоса последнего шанса встаёт на место окошка выплаты (числа — от PAYOUT_WINDOW).
const BAND_LEFT = PAYOUT_WINDOW.x - PAYOUT_WINDOW.width / 2; // 509
const BAND_RIGHT = TAKE_BEZEL_LEFT; // 731 — кнопку «забрать» не накрываем
const BAND_TOP = PAYOUT_WINDOW.y - PAYOUT_WINDOW.height / 2 - 12; // 505
const BAND_BOTTOM = PAYOUT_WINDOW.y + PAYOUT_WINDOW.height / 2; // 587
const BAND_X = (BAND_LEFT + BAND_RIGHT) / 2; // 620
const BAND_Y = (BAND_TOP + BAND_BOTTOM) / 2; // 546
const BAND_WIDTH = BAND_RIGHT - BAND_LEFT; // 222
const BAND_HEIGHT = BAND_BOTTOM - BAND_TOP; // 82
const BAND_ALPHA = 0.96;
// Строки: цель сверху, сколько действий осталось — под ней, цена докупки — ещё ниже, кнопки — внизу.
const GOAL_Y = BAND_TOP + 4; // 509
const ACTIONS_Y = BAND_TOP + 19; // 524
const PRICE_Y = BAND_TOP + 33; // 538
const PRICE_MAX_WIDTH = BAND_WIDTH - 12; // 210: подпись цены не выходит за полосу
const PRICE_FONT = 11;
const PRICE_MIN_FONT = 9;
const BUTTON_SIZE = 34;
const BUTTON_GAP = 6;
const BUTTON_STEP = BUTTON_SIZE + BUTTON_GAP; // 40
// Пять плашек по 34 с шагом 40: 4 × 40 + 34 = 194 ≤ 222 (BAND_WIDTH), по краям остаётся по 14.
const BUTTONS_Y = BAND_BOTTOM - 2 - BUTTON_SIZE / 2; // 568 — низ плашки в 2 от нижнего края полосы
const BUTTON_FILL = 0x1f2937;
const BUTTON_STROKE = 0x64748b;
const BUTTON_ON = 0xfbbf24; // выбранный режим (заморозка) — золотая рамка
const BUTTON_OFF_ALPHA = 0.4; // плашка недоступна (докупок нет, не хватает фишек, цель у потолка)
const ICON_SIZE = 26;
const SIGN_SIZE = '18px';
const OPEN_TIME = 160; // полоса проявляется, мс

/** Что можно нажать в полосе последнего шанса. */
export type LastChanceAction = 'freeze' | 'reroll' | 'joker' | 'surrender' | 'buy';

// Докупка — последней: её клавиша 5, а первые четыре остались как были.
const BUTTON_ORDER: LastChanceAction[] = ['freeze', 'reroll', 'joker', 'surrender', 'buy'];
const BUTTON_SIGNS: Partial<Record<LastChanceAction, string>> = { freeze: '❄', surrender: '✕', buy: '+1' }; // у остальных — иконки предметов
const BUTTON_ITEMS: Partial<Record<LastChanceAction, string>> = { reroll: 'shuffle', joker: 'swap' };
/** Подписи кнопок: что это и что будет. */
const BUTTON_TEXTS: Record<LastChanceAction, { title: TextKey; what: TextKey }> = {
  freeze: { title: 'lcFreeze', what: 'lcFreezeWhat' },
  reroll: { title: 'lcReroll', what: 'lcRerollWhat' },
  joker: { title: 'lcJoker', what: 'lcJokerWhat' },
  surrender: { title: 'lcSurrender', what: 'lcSurrenderWhat' },
  buy: { title: 'lcBuy', what: 'lcBuyWhat' },
};

/**
 * Полоса последнего шанса на месте окошка выплаты: цель («нужен паттерн ×N» или «только джекпот»),
 * сколько действий осталось, цена докупки и пять кнопок — заморозка столбца (бесплатно), перекрут столбца,
 * джокер в клетку, «сдаться» и «докупить» ещё одно действие за долю фишек на руках.
 * Клик по сетке ловит сцена (SlotScreen.beginPick), здесь только кнопки.
 */
export class LastChanceBar {
  private readonly scene: Phaser.Scene;
  private readonly band: Phaser.GameObjects.Rectangle;
  private readonly goalText: Phaser.GameObjects.Text;
  private readonly actionsText: Phaser.GameObjects.Text;
  private readonly priceText: Phaser.GameObjects.Text;
  private readonly buttons = new Map<LastChanceAction, Phaser.GameObjects.Rectangle>();
  private buyEnabled = true; // плашка докупки живая: setEnabled(true) не зажигает её против правила
  // Всё, что показывает и прячет полоса: плашки, подписи и значки кнопок — значок без плашки не должен висеть.
  private readonly parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];

  /** use — что делает нажатая кнопка; hint — подсказки кнопок. */
  constructor(scene: Phaser.Scene, use: (action: LastChanceAction) => void, hint: Hint) {
    this.scene = scene;
    this.band = scene.add
      .rectangle(BAND_X, BAND_Y, BAND_WIDTH, BAND_HEIGHT, 0x0b0f19, BAND_ALPHA)
      .setStrokeStyle(2, 0xb45309)
      .setRounded(10)
      .setDepth(POPUP_DEPTH);
    this.goalText = addText(scene, BAND_X, GOAL_Y, '', { ...LED_STYLE, fontSize: '13px' }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.actionsText = addText(scene, BAND_X, ACTIONS_Y, '', { fontSize: '11px', color: GOLD_TEXT }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.priceText = addText(scene, BAND_X, PRICE_Y, '', { fontSize: `${PRICE_FONT}px`, color: GOLD_TEXT }).setOrigin(0.5, 0).setDepth(POPUP_DEPTH);
    this.parts.push(this.band, this.goalText, this.actionsText, this.priceText);

    const startX = BAND_X - ((BUTTON_ORDER.length - 1) * BUTTON_STEP) / 2;
    BUTTON_ORDER.forEach((action, index) => {
      const x = startX + index * BUTTON_STEP;
      const plate = scene.add
        .rectangle(x, BUTTONS_Y, BUTTON_SIZE, BUTTON_SIZE, BUTTON_FILL)
        .setRounded(7)
        .setStrokeStyle(2, BUTTON_STROKE)
        .setDepth(POPUP_DEPTH);
      plate.setInteractive({ useHandCursor: true });
      plate.on('pointerdown', () => use(action));
      const texts = BUTTON_TEXTS[action];
      attachHint(plate, hint, () => [t(texts.title), t(texts.what)]);
      const sign = BUTTON_SIGNS[action];
      const face = sign
        ? addText(scene, x, BUTTONS_Y, sign, { fontSize: SIGN_SIZE, color: '#e2e8f0' }).setOrigin(0.5).setDepth(POPUP_DEPTH)
        : scene.add
            .image(x, BUTTONS_Y, itemTexture(ITEMS.find((candidate) => candidate.id === BUTTON_ITEMS[action]) ?? ITEMS[0]))
            .setDisplaySize(ICON_SIZE, ICON_SIZE)
            .setDepth(POPUP_DEPTH);
      this.parts.push(plate, face); // значок прячется вместе с плашкой
      this.buttons.set(action, plate);
    });

    this.close();
  }

  /**
   * Показать полосу: goal — какой множитель паттерна надо перекрыть, actionsLeft — сколько действий осталось.
   * Суммы фишек здесь нет: победу решает множитель, а платит паттерн по цене своего символа — одно число врало бы.
   * Цель у потолка (её бьёт только джекпот) читается отдельной строкой.
   */
  open(goal: number, actionsLeft: number): void {
    this.setGoal(goal);
    this.setActions(actionsLeft);
    this.setFreezeMode(false);
    for (const part of this.parts) part.setVisible(true);
    this.setEnabled(true);
    this.band.setAlpha(0);
    this.scene.tweens.add({ targets: this.band, alpha: BAND_ALPHA, duration: OPEN_TIME });
  }

  /** Цель последнего шанса — отдельно от open: после докупки она пересчитывается, полоса не переоткрывается. */
  setGoal(goal: number): void {
    const pattern = goalPattern(goal);
    this.goalText.setText(pattern < TOP_MULTIPLIER ? t('lcGoalPattern', pattern) : t('lcGoalJackpot'));
  }

  /** Сколько действий осталось — «ДЕЙСТВИЙ: 1». */
  setActions(actionsLeft: number): void {
    this.actionsText.setText(t('lcActions', actionsLeft));
  }

  /**
   * Строка цены докупки и сама плашка «+1»: label — что скажет игра (цена, лимит, нехватка фишек, цель у потолка),
   * isEnabled — можно ли покупать. Надпись вписывается в полосу, погасшая плашка не ловит клики.
   */
  setBuy(label: string, isEnabled: boolean): void {
    this.buyEnabled = isEnabled;
    fitTextWidth(this.priceText, label, PRICE_MAX_WIDTH, PRICE_FONT, PRICE_MIN_FONT);
    const plate = this.buttons.get('buy');
    if (!plate) return;
    plate.setAlpha(isEnabled ? 1 : BUTTON_OFF_ALPHA);
    if (isEnabled) plate.setInteractive({ useHandCursor: true });
    else plate.disableInteractive();
  }

  /** Режим заморозки включён — кнопка «лёд» горит золотом. */
  setFreezeMode(isOn: boolean): void {
    const plate = this.buttons.get('freeze');
    plate?.setStrokeStyle(2, isOn ? BUTTON_ON : BUTTON_STROKE);
  }

  /** Полосу убрать: последний шанс кончился (успех, провал или сдача). */
  close(): void {
    this.setEnabled(false);
    for (const part of this.parts) part.setVisible(false);
  }

  /** Есть ли чем действовать: кнопки живые, пока идёт последний шанс. Докупка — только когда она разрешена. */
  setEnabled(isEnabled: boolean): void {
    for (const [action, plate] of this.buttons) {
      if (isEnabled && (action !== 'buy' || this.buyEnabled)) plate.setInteractive({ useHandCursor: true });
      else plate.disableInteractive();
    }
  }
}

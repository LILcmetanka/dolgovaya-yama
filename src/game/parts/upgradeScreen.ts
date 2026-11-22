import Phaser from 'phaser';
import { t } from '../lang';
import { CENTER_Y, CENTER_X, VIEW_HEIGHT, VIEW_WIDTH } from '../layout';
import { addText, fitTextWidth, GAME_OVER_DEPTH, GOLD_TEXT } from '../theme';
import type { Upgrade } from '../upgrades';

/**
 * Экран улучшений после смерти (шаг 28): тёмное затемнение на весь вид, название, подпись и три карточки.
 * Карточка — кликабельная плашка с группой, названием, описанием и номером клавиши (1–3); во второй фазе
 * (когда второе улучшение берут за билеты) экран закрывают ✕ в шапке или клавиша «0».
 *
 * Часть только рисует и сообщает о нажатии: что куплено, сколько билетов и что делать дальше — решает сцена
 * (CollectorScene). Поэтому экран не знает ни про progress, ни про цены: подпись и цена приходят готовыми.
 * Слой — выше экрана DEATH (GAME_OVER_DEPTH): сам он ничего не блокирует, пока не открыт.
 */
const DEPTH = GAME_OVER_DEPTH + 2; // выше затемнения и кнопки «ЗАНОВО»
const PANEL_WIDTH = 900;
const PANEL_HEIGHT = 380;
const PANEL_Y = 300; // середина панели: 90…510 — над счётом и «ЗАНОВО» экрана смерти
const PANEL_FILL = 0x0b0f19;
const PANEL_BORDER = 0xb45309;
const PANEL_ALPHA = 0.96;
const SCRIM_ALPHA = 0.82; // затемнение поверх экрана смерти: под ним не читаются ни счёт, ни витрина памяти
const TITLE_Y = -158; // от середины панели
const TITLE_FONT = '30px';
const CAPTION_Y = -124;
const CAPTION_FONT = '16px';
const CARD_WIDTH = 268;
const CARD_HEIGHT = 180;
const CARD_GAP = 20;
const CARD_Y = 10; // середина карточки от центра панели
const CARD_FILL = 0x131a26;
const CARD_HOVER = 0x1f2a3a;
const CARD_GROUP_Y = -CARD_HEIGHT / 2 + 22;
const CARD_NAME_Y = -CARD_HEIGHT / 2 + 54;
const CARD_DESC_Y = -CARD_HEIGHT / 2 + 84;
const CARD_KEY_X = CARD_WIDTH / 2 - 22;
const CARD_KEY_Y = -CARD_HEIGHT / 2 + 20;
const GROUP_FONT = '12px';
const NAME_FONT = '19px';
const DESC_FONT = '14px';
const TEXT_LEFT = -CARD_WIDTH / 2 + 18;
const TEXT_WIDTH = CARD_WIDTH - 36;
const CLOSE_FONT = '22px';
const CLOSE_HIT = 44; // зона нажатия крестика: пальцем тоже попасть
const CLOSE_KEY_INDEX = 9; // клавиша «0» (десятая в GameScene.NUMBER_KEYS): вторая фаза закрывается и с клавиатуры
/** Цвет группы: прокрутки — золото, долг — красный, фишки — зелёный, билеты — оранжевый, предметы — голубой,
 *  амулеты — фиолетовый, сетка — бирюзовый, магазин — розовый, кассета — лаймовый, прочее — индиго. */
const GROUP_COLORS: Record<Upgrade['group'], number> = {
  spins: 0xfbbf24,
  debt: 0xf87171,
  chips: 0x4ade80,
  tickets: 0xfb923c,
  items: 0x38bdf8,
  amulets: 0xc084fc,
  grid: 0x2dd4bf,
  shop: 0xf472b6,
  tape: 0xa3e635,
  other: 0x818cf8,
};
/** Подпись группы на карточке — ключ lang.ts. */
const GROUP_TEXTS: Record<Upgrade['group'], 'upgGroupSpins' | 'upgGroupDebt' | 'upgGroupChips' | 'upgGroupTickets' | 'upgGroupItems' | 'upgGroupAmulets' | 'upgGroupGrid' | 'upgGroupShop' | 'upgGroupTape' | 'upgGroupOther'> = {
  spins: 'upgGroupSpins',
  debt: 'upgGroupDebt',
  chips: 'upgGroupChips',
  tickets: 'upgGroupTickets',
  items: 'upgGroupItems',
  amulets: 'upgGroupAmulets',
  grid: 'upgGroupGrid',
  shop: 'upgGroupShop',
  tape: 'upgGroupTape',
  other: 'upgGroupOther',
};

/** Что сцена говорит экрану при показе: подпись под названием и обработчик выбора. */
export interface UpgradeScreenOptions {
  caption: string; // «Возьми одно бесплатно · 1–3» или «Второе — 6 билетов · у тебя N»
  onPick: (index: number) => void; // нажали карточку index (0…)
  onClose?: () => void; // ✕ в шапке или клавиша «0» (только когда есть что закрывать: во второй фазе)
}

export class UpgradeScreen {
  private readonly scene: Phaser.Scene;
  private parts: Phaser.GameObjects.GameObject[] = [];
  private offers: Upgrade[] = [];
  private onPick: ((index: number) => void) | null = null;
  private onClose: (() => void) | null = null;
  private open = false;
  /** Кликабельные плашки карточек по порядку: сценарий проверки щёлкает по их границам. */
  readonly cards: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Экран на виду: ввод и клавиши должны идти ему, а не игре. */
  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Показать карточки. close — рисовать ✕ в шапке (второе улучшение можно не брать); без него выбор обязателен:
   * бесплатное улучшение игрок берёт всегда, пока есть что предлагать.
   */
  show(offers: readonly Upgrade[], options: UpgradeScreenOptions & { close?: boolean }): void {
    this.clear();
    if (offers.length === 0) return;
    this.open = true;
    this.offers = [...offers];
    this.onPick = options.onPick;
    this.onClose = options.onClose ?? null;
    const backdrop = this.scene.add
      .rectangle(CENTER_X, CENTER_Y, VIEW_WIDTH, VIEW_HEIGHT, 0x000000, SCRIM_ALPHA)
      .setDepth(DEPTH);
    backdrop.setInteractive(); // ловит клики: кнопки экрана смерти под ним не нажимаются
    const panel = this.scene.add
      .rectangle(CENTER_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, PANEL_FILL, PANEL_ALPHA)
      .setRounded(12)
      .setStrokeStyle(3, PANEL_BORDER)
      .setDepth(DEPTH);
    panel.setInteractive(); // клик по панели не проваливается к затемнению
    this.parts.push(backdrop, panel);
    const title = t('upgTitle');
    const titleText = addText(this.scene, CENTER_X, PANEL_Y + TITLE_Y, title, {
      fontSize: TITLE_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5).setDepth(DEPTH);
    fitTextWidth(titleText, title, PANEL_WIDTH - 80, 30, 18);
    const caption = addText(this.scene, CENTER_X, PANEL_Y + CAPTION_Y, options.caption, {
      fontSize: CAPTION_FONT,
      color: 'rgba(255, 255, 255, 0.75)',
    }).setOrigin(0.5).setDepth(DEPTH);
    fitTextWidth(caption, options.caption, PANEL_WIDTH - 120, 16, 11);
    this.parts.push(titleText, caption);
    if (options.close) this.addClose();
    const start = CENTER_X - ((offers.length - 1) * (CARD_WIDTH + CARD_GAP)) / 2;
    offers.forEach((upgrade, index) => this.addCard(upgrade, index, start + index * (CARD_WIDTH + CARD_GAP)));
  }

  /**
   * Клавиша 1–3: нажать карточку по номеру. «0» — закрыть вторую фазу (✕ есть и на экране, но игрок без мыши
   * иначе застрял бы на экране, когда второе улучшение брать не хочет).
   * Вернёт true — нажатие ушло в экран (игра его не должна получать).
   * Номер за пределами карточек — тоже true: пока экран открыт, клавиши игры молчат.
   */
  press(index: number): boolean {
    if (!this.open) return false;
    if (index === CLOSE_KEY_INDEX && this.onClose) {
      this.onClose();
      return true;
    }
    if (index < this.offers.length) this.onPick?.(index);
    return true;
  }

  /** Убрать экран: все нарисованные объекты уничтожаются. */
  close(): void {
    this.clear();
  }

  private clear(): void {
    for (const part of this.parts) part.destroy();
    this.parts = [];
    this.offers = [];
    this.onPick = null;
    this.onClose = null;
    this.cards.length = 0;
    this.open = false;
  }

  /** Крестик в шапке: второе улучшение можно не брать. */
  private addClose(): void {
    const x = CENTER_X + PANEL_WIDTH / 2 - 28;
    const y = PANEL_Y + TITLE_Y;
    const close = addText(this.scene, x, y, '✕', { fontSize: CLOSE_FONT, fontStyle: 'bold', color: GOLD_TEXT })
      .setOrigin(0.5)
      .setDepth(DEPTH);
    // Зона нажатия больше самой надписи: на телефоне в маленький крестик не попасть.
    const hit = this.scene.add.rectangle(x, y, CLOSE_HIT, CLOSE_HIT, 0x000000, 0).setDepth(DEPTH);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.onClose?.());
    this.parts.push(close, hit);
  }

  /** Одна карточка: группа, название, описание, номер клавиши. Вся плашка — одна кнопка. */
  private addCard(upgrade: Upgrade, index: number, x: number): void {
    const y = PANEL_Y + CARD_Y;
    const box = this.scene.add
      .rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, CARD_FILL)
      .setRounded(10)
      .setStrokeStyle(2, GROUP_COLORS[upgrade.group])
      .setDepth(DEPTH);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerover', () => box.setFillStyle(CARD_HOVER));
    box.on('pointerout', () => box.setFillStyle(CARD_FILL));
    box.on('pointerdown', () => this.onPick?.(index));
    const left = x + TEXT_LEFT;
    const groupText = t(GROUP_TEXTS[upgrade.group]);
    const group = addText(this.scene, left, y + CARD_GROUP_Y, groupText, {
      fontSize: GROUP_FONT,
      fontStyle: 'bold',
      color: `#${GROUP_COLORS[upgrade.group].toString(16).padStart(6, '0')}`,
    }).setOrigin(0, 0.5).setDepth(DEPTH);
    const name = t(upgrade.name);
    const nameText = addText(this.scene, left, y + CARD_NAME_Y, name, {
      fontSize: NAME_FONT,
      fontStyle: 'bold',
      color: GOLD_TEXT,
      wordWrap: { width: TEXT_WIDTH },
      maxLines: 2,
    }).setOrigin(0, 0.5).setDepth(DEPTH);
    const desc = t(upgrade.desc);
    const descText = addText(this.scene, left, y + CARD_DESC_Y, desc, {
      fontSize: DESC_FONT,
      color: '#e2e8f0',
      wordWrap: { width: TEXT_WIDTH },
      maxLines: 4,
    }).setOrigin(0, 0).setDepth(DEPTH);
    const key = addText(this.scene, x + CARD_KEY_X, y + CARD_KEY_Y, String(index + 1), {
      fontSize: GROUP_FONT,
      fontStyle: 'bold',
      color: 'rgba(255, 255, 255, 0.55)',
    }).setOrigin(0.5).setDepth(DEPTH);
    this.cards.push(box);
    this.parts.push(box, group, nameText, descText, key);
  }
}

import Phaser from 'phaser';
import { CROWNS_FOR_FREE_SPINS, FREE_SPINS, JACKPOT_SPINS, JACKPOT_TICKETS } from '../bonus';
import {
  amuletTexture,
  createAmuletTextures,
  createItemTextures,
  createWallTvTexture,
  drawMonitorScreen,
  itemTexture,
  MONITOR_SCREEN_TEXTURE,
  type MonitorNote,
  type MonitorPrice,
  WALL_TV_GLOW,
  WALL_TV_TEXTURE,
} from '../decor';
import { AMULETS } from '../amulets';
import { amuletKey, isSeen, itemKey, machineKey, WHO_COLLECTOR, WHO_DEALER } from '../codex';
import { CHARACTERS, ORDINARY } from '../characters';
import { MAGNIFIER } from '../collectorGame';
import { BLOOD_WIN, SPIDER_BITE } from '../evil';
import { ITEMS } from '../items';
import { t } from '../lang';
import { AMULET_SIZE, ITEM_SIZE, VIEW_CENTER_X, VIEW_WIDTH, WALL_PANEL, WALL_TV } from '../layout';
import { BULLET } from '../shot';
import { isPaying, isUnlocked, symbolsUnlockedAt, SYMBOLS, TICKET_SCATTER, type SlotSymbol } from '../rules';
import { addText } from '../theme';

const TV_DIM_ALPHA = 0.35; // в покое на стекле тусклый «?»
const TV_QUESTION_SIZE = 44; // его размер
/** Что мигает на телевизоре: новое (зелёное), злой символ (красное), фаза 2 или новый автомат (жёлтое). Важнее — красное. */
export type News = 'new' | 'warning' | 'update';
const NEWS_LOOK: Record<News, { text: string; color: string; size: number }> = {
  new: { text: 'NEW', color: '#4ade80', size: 34 },
  warning: { text: 'WARNING', color: '#f87171', size: 23 },
  update: { text: 'UPDATE', color: '#fde047', size: 25 },
};
const NEWS_PRIORITY: News[] = ['new', 'update', 'warning'];
const BLINK_TIME = 450;
const OVERLAY_DEPTH = 20; // над игрой, под подсказкой и экранами паузы и DEATH
const SHADE_ALPHA = 0.8;
const PANEL_COLOR = 0x03161c; // тот же кинескоп, что у картинки символов
const PANEL_LINE = 0x67e8f9;
const INK = '#cffafe';
const TAB_WIDTH = 232;
const TAB_HEIGHT = 48;
const PAD = 20;
const SYMBOLS_WIDTH = WALL_PANEL.width - 2 * PAD; // картинка вкладки «Символы» — на всю ширину экрана
const SYMBOLS_HEIGHT = 500;
// Вкладки «Предметы» и «Кто есть кто»: строки в два столбца.
const ROW_COLUMNS = 2;
const ROW_WIDTH = 505;
const ROW_HEIGHT = 66;
const ROW_ICON = 48;
const DIM_INK = '#8fc3cc';

/** Строка вкладки: значок (картинка или эмодзи), название и описание. */
interface Row {
  texture?: string;
  sign?: string;
  name: string;
  description: string;
}

type Tab = 'symbols' | 'items' | 'who' | 'howTo';
const TABS: { id: Tab; label: 'tabSymbols' | 'tabItems' | 'tabWho' | 'tabHowTo' }[] = [
  { id: 'symbols', label: 'tabSymbols' },
  { id: 'items', label: 'tabItems' },
  { id: 'who', label: 'tabWho' },
  { id: 'howTo', label: 'tabHowTo' },
];

/** Что делает особый символ — надпись монитора; числа в ней — из правил, поэтому монитор не врёт, даже если их поменять. */
function symbolNote(symbol: SlotSymbol): string {
  switch (symbol.id) {
    case 'skull':
      return t('skullNote');
    case 'ticket':
      return t('ticketNote', TICKET_SCATTER);
    case 'joker':
      return t('jokerNote');
    case 'dice':
      return t('diceNote');
    case 'spider':
      return t('spiderNote', Math.round(SPIDER_BITE * 100));
    case 'clover':
      return t('cloverNote');
    case 'lock':
      return t('lockNote');
    case 'crown':
      return t('crownNote', FREE_SPINS.map((_, index) => CROWNS_FOR_FREE_SPINS + index).join(' / '), FREE_SPINS.join(' / '));
    case 'blood':
      return t('bloodNote', BLOOD_WIN);
    default:
      return '';
  }
}

/**
 * Экран на стене справа от автомата: маленький, как телевизор. В покое на стекле тусклый «?», а когда в автомат вошли новые
 * символы — зелёное «NEW» мигает, пока экран не откроют. Клик по нему (→ ловит сцена) открывает большой экран поверх игры с вкладками:
 * «Символы» (цены и что делает каждый; новые — в золотой рамке), «Предметы», «Кто есть кто», «Как играть» (цель, долг, клавиши).
 * Закрыть — клик мимо, ✕, Esc, Пробел или →. Вид не поворачивается; что можно сейчас, решает сцена (пока открыт, крутить нельзя).
 */
export class WallScreen {
  private readonly scene: Phaser.Scene;
  private readonly tv: Phaser.GameObjects.Image; // корпус телевизора — по нему кликают
  private readonly glass: Phaser.GameObjects.Text; // «?» или «NEW» на стекле
  private readonly tabButtons: { box: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];
  private readonly overlay: Phaser.GameObjects.GameObject[] = []; // всё, что видно на большом экране, кроме содержимого вкладки
  private content: Phaser.GameObjects.Container; // содержимое вкладки — пересобирается при смене вкладки и языка
  private tab: Tab = 'symbols';
  private round = 0; // для какого раунда нарисованы символы
  private isOpen = false; // большой экран открыт
  private isEnabled = true; // по телевизору можно кликнуть
  private isHovered = false; // мышь над телевизором — курсор-рука его
  private news: News | null = null; // что мигает на телевизоре, пока экран не откроют

  /** round — какой раунд идёт: в «Символах» те, что уже есть в автомате; toggle — кликнули по телевизору или закрыли большой экран. */
  constructor(scene: Phaser.Scene, round: number, toggle: () => void) {
    this.scene = scene;
    createWallTvTexture(scene, WALL_TV);
    createItemTextures(scene, [...ITEMS, MAGNIFIER, BULLET], ITEM_SIZE);
    createAmuletTextures(scene, AMULETS, AMULET_SIZE);
    this.tv = scene.add.image(WALL_TV.x, WALL_TV.y, WALL_TV_TEXTURE);
    // Картинка шире корпуса (отсвет на стене) — кликать можно только по самому телевизору.
    const body = new Phaser.Geom.Rectangle(WALL_TV_GLOW, WALL_TV_GLOW, WALL_TV.width, WALL_TV.height);
    this.tv.setInteractive({ hitArea: body, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.tv.on('pointerdown', toggle);
    this.tv.on('pointerover', () => (this.isHovered = true));
    this.tv.on('pointerout', () => (this.isHovered = false));
    this.glass = addText(scene, WALL_TV.x, WALL_TV.y - 4, '?', { fontSize: `${TV_QUESTION_SIZE}px`, fontStyle: 'bold', color: INK })
      .setOrigin(0.5)
      .setAlpha(TV_DIM_ALPHA);
    this.buildOverlay(toggle);
    this.content = scene.add.container(0, 0);
    this.round = round;
    this.news = 'new'; // в начале забега (и после кассеты) экран ещё не видели
    this.redrawSymbols();
    this.showTab('symbols');
    this.hideOverlay();
    this.updateGlass();
  }

  /** Идёт раунд round: в «Символах» — те, что есть в автомате. Вошли новые — они в рамке, на телевизоре мигает «NEW». */
  showRound(round: number): void {
    if (round === this.round) return;
    this.round = round;
    this.redrawSymbols();
    const fresh = symbolsUnlockedAt(round);
    if (fresh.length > 0) this.notify(fresh.some((symbol) => symbol.isEvil) ? 'warning' : 'new');
    if (this.isOpen) this.showTab(this.tab);
  }

  /** На телевизоре мигает news, пока экран не откроют. Если уже мигает другое — остаётся важнейшее (красное, жёлтое, зелёное). */
  notify(news: News): void {
    if (this.news === null || NEWS_PRIORITY.indexOf(news) > NEWS_PRIORITY.indexOf(this.news)) this.news = news;
    this.updateGlass();
  }

  /** Сменился язык: надписи — на новом. */
  relabel(): void {
    this.tabButtons.forEach((button, index) => button.text.setText(t(TABS[index].label)));
    this.redrawSymbols();
    if (this.isOpen) this.showTab(this.tab);
  }

  /**
   * Можно ли сейчас кликнуть по телевизору (нельзя — и курсор над ним не рука). Сцена зовёт это при каждом обновлении приборов,
   * а меняется что-то, только когда «можно» сменилось. Курсор сбрасываем, только если мышь над телевизором:
   * иначе рука — чужая (рычаг, кнопка «забрать»), и сброс её бы погасил.
   */
  setEnabled(enabled: boolean): void {
    if (enabled === this.isEnabled) return;
    this.isEnabled = enabled;
    if (enabled) {
      this.tv.setInteractive();
      return;
    }
    this.tv.disableInteractive(this.isHovered);
    this.isHovered = false; // выключенный телевизор не узнает, что мышь ушла, — когда включится, Phaser скажет снова
  }

  /** Большой экран открывается на первой вкладке. «NEW» гаснет: новое увидел. */
  open(): void {
    this.isOpen = true;
    this.news = null;
    this.updateGlass();
    this.showTab('symbols');
    this.setOverlayVisible(true);
  }

  /** Большой экран закрывается — сразу done(): вид не поворачивался, ждать нечего. */
  close(done: () => void): void {
    this.isOpen = false;
    this.hideOverlay();
    done();
  }

  // ---------- Малый экран ----------

  /** На стекле: «NEW» мигает, пока есть непрочитанное, иначе тусклый «?». */
  private updateGlass(): void {
    this.scene.tweens.killTweensOf(this.glass);
    if (this.news) {
      const look = NEWS_LOOK[this.news];
      this.glass.setText(look.text).setFontSize(look.size).setColor(look.color).setAlpha(1);
      this.scene.tweens.add({ targets: this.glass, alpha: 0.15, duration: BLINK_TIME, yoyo: true, repeat: -1 });
    } else {
      this.glass.setText('?').setFontSize(TV_QUESTION_SIZE).setColor(INK).setAlpha(TV_DIM_ALPHA);
    }
  }

  // ---------- Большой экран ----------

  /** Затемнение, рамка, вкладки и ✕: клик по затемнению (мимо рамки) закрывает. */
  private buildOverlay(close: () => void): void {
    const scene = this.scene;
    const shade = scene.add.rectangle(VIEW_CENTER_X, 320, VIEW_WIDTH, 640, 0x000000, SHADE_ALPHA);
    shade.setInteractive();
    shade.on('pointerdown', close);
    const panel = scene.add.rectangle(WALL_PANEL.x, WALL_PANEL.y, WALL_PANEL.width, WALL_PANEL.height, PANEL_COLOR);
    panel.setStrokeStyle(3, PANEL_LINE, 0.6);
    panel.setInteractive(); // клик по самой рамке ничего не делает, а не закрывает
    this.overlay.push(shade, panel);
    const top = WALL_PANEL.y - WALL_PANEL.height / 2;
    const left = WALL_PANEL.x - WALL_PANEL.width / 2;
    const tabY = top + PAD + TAB_HEIGHT / 2;
    TABS.forEach((tab, index) => {
      const x = left + PAD + TAB_WIDTH / 2 + index * (TAB_WIDTH + 8);
      const box = scene.add.rectangle(x, tabY, TAB_WIDTH, TAB_HEIGHT, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => this.showTab(tab.id));
      const text = addText(scene, x, tabY, t(tab.label), { fontSize: '20px', fontStyle: 'bold', color: INK }).setOrigin(0.5);
      this.tabButtons.push({ box, text });
      this.overlay.push(box, text);
    });
    const crossX = left + WALL_PANEL.width - PAD - TAB_HEIGHT / 2;
    const crossBox = scene.add.rectangle(crossX, tabY, TAB_HEIGHT, TAB_HEIGHT, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
    crossBox.setInteractive({ useHandCursor: true });
    crossBox.on('pointerdown', close);
    const cross = addText(scene, crossX, tabY, '✕', { fontSize: '26px', fontStyle: 'bold', color: INK }).setOrigin(0.5);
    this.overlay.push(crossBox, cross);
    for (const part of this.overlay) (part as Phaser.GameObjects.Rectangle).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
  }

  private setOverlayVisible(visible: boolean): void {
    for (const part of this.overlay) (part as Phaser.GameObjects.Rectangle).setVisible(visible);
    this.content.setVisible(visible);
  }

  private hideOverlay(): void {
    this.setOverlayVisible(false);
  }

  /** Вкладка tab: подсветить кнопку, собрать содержимое заново. */
  private showTab(tab: Tab): void {
    this.tab = tab;
    TABS.forEach((entry, index) => {
      const active = entry.id === tab;
      this.tabButtons[index].box.setFillStyle(active ? 0x0e4a58 : PANEL_COLOR);
    });
    this.content.destroy();
    this.content = this.scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0).setVisible(this.isOpen);
    const left = WALL_PANEL.x - WALL_PANEL.width / 2 + PAD;
    const top = WALL_PANEL.y - WALL_PANEL.height / 2 + 2 * PAD + TAB_HEIGHT + 4;
    if (tab === 'symbols') this.buildSymbols(left, top);
    else if (tab === 'items') this.buildItems(left, top);
    else if (tab === 'who') this.buildWho(left, top);
    else this.buildHowTo(left, top);
  }

  /** «Символы»: цены, что делают особые символы, джекпот — одна картинка. */
  private buildSymbols(left: number, top: number): void {
    this.content.add(this.scene.add.image(left, top, MONITOR_SCREEN_TEXTURE).setOrigin(0));
  }

  /** «Предметы»: предметы с полки и амулеты, которые уже попадались в магазине, на полке или в гнёздах. */
  private buildItems(left: number, top: number): void {
    const rows: Row[] = [
      ...[...ITEMS, MAGNIFIER, BULLET]
        .filter((item) => isSeen(itemKey(item.id)))
        .map((item) => ({ texture: itemTexture(item), name: t(item.name), description: t(item.description) })),
      ...AMULETS.filter((amulet) => isSeen(amuletKey(amulet.id))).map((amulet) => ({
        texture: amuletTexture(amulet),
        name: t(amulet.name),
        description: t(amulet.description),
      })),
    ];
    this.buildRows(left, top, rows);
  }

  /** «Кто есть кто»: Коллектор, Дилер и автоматы, которые уже стояли на месте. */
  private buildWho(left: number, top: number): void {
    const rows: Row[] = [{ sign: '🎰', name: t(ORDINARY.name), description: t(ORDINARY.description) }];
    if (isSeen(WHO_COLLECTOR)) rows.push({ sign: '💼', name: t('whoCollector'), description: t('whoCollectorWhat') });
    if (isSeen(WHO_DEALER)) rows.push({ sign: '🎲', name: t('whoDealer'), description: t('whoDealerWhat') });
    for (const character of CHARACTERS) {
      if (isSeen(machineKey(character.id))) rows.push({ sign: character.sign, name: t(character.name), description: t(character.description) });
    }
    this.buildRows(left, top, rows);
  }

  /** Строки в два столбца: значок слева, название и описание справа. Нечего показать — «Пока ничего не встретил». */
  private buildRows(left: number, top: number, rows: Row[]): void {
    const scene = this.scene;
    if (rows.length === 0) {
      this.content.add(addText(scene, left + 10, top + 6, t('tabEmpty'), { fontSize: '22px', color: DIM_INK }));
      return;
    }
    rows.forEach((row, index) => {
      const x = left + (index % ROW_COLUMNS) * ROW_WIDTH;
      const y = top + Math.floor(index / ROW_COLUMNS) * ROW_HEIGHT;
      const iconX = x + ROW_ICON / 2 + 6;
      const iconY = y + ROW_ICON / 2;
      if (row.texture) this.content.add(scene.add.image(iconX, iconY, row.texture).setDisplaySize(ROW_ICON, ROW_ICON));
      else this.content.add(addText(scene, iconX, iconY, row.sign ?? '', { fontSize: '36px' }).setOrigin(0.5));
      const textX = x + ROW_ICON + 20;
      this.content.add(addText(scene, textX, y, row.name, { fontSize: '21px', fontStyle: 'bold', color: INK }));
      this.content.add(addText(scene, textX, y + 27, row.description, { fontSize: '16px', color: DIM_INK, wordWrap: { width: ROW_WIDTH - ROW_ICON - 36 } }));
    });
  }

  /** «Как играть»: слева цель и порядок игры, справа клавиши. */
  private buildHowTo(left: number, top: number): void {
    const style = { fontSize: '21px', color: INK, lineSpacing: 5 };
    const goal = addText(this.scene, left + 10, top + 6, t('howToGoal'), { ...style, wordWrap: { width: 600 } });
    const keys = addText(this.scene, left + 10 + 650, top + 6, t('howToKeys'), { ...style, wordWrap: { width: 340 } });
    this.content.add([goal, keys]);
  }

  /** Картинка «Символов» заново: цены — от дешёвых к дорогим, особые символы — в том порядке, как входили в автомат. */
  private redrawSymbols(): void {
    const fresh = symbolsUnlockedAt(this.round);
    const inMachine = SYMBOLS.filter((symbol) => isUnlocked(symbol, this.round));
    const prices: MonitorPrice[] = inMachine
      .filter(isPaying)
      .sort((a, b) => a.price - b.price)
      .map((symbol) => ({ symbol, price: symbol.price, isNew: fresh.includes(symbol) }));
    const notes: MonitorNote[] = inMachine
      .filter((symbol) => !isPaying(symbol))
      .sort((a, b) => a.unlockRound - b.unlockRound)
      .map((symbol) => ({ symbol, text: symbolNote(symbol), isNew: fresh.includes(symbol) }));
    const jackpot = t('jackpotNote', JACKPOT_TICKETS, JACKPOT_SPINS);
    drawMonitorScreen(this.scene, SYMBOLS_WIDTH, SYMBOLS_HEIGHT, prices, notes, jackpot);
  }
}

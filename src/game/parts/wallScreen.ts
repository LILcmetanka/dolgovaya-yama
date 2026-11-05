import Phaser from 'phaser';
import { CROWNS_FOR_FREE_SPINS, FREE_SPINS, JACKPOT_SPINS, JACKPOT_TICKETS } from '../bonus';
import {
  createWallTvTexture,
  drawMonitorScreen,
  MONITOR_SCREEN_TEXTURE,
  type MonitorNote,
  type MonitorPrice,
  WALL_TV_GLOW,
  WALL_TV_TEXTURE,
} from '../decor';
import { BLOOD_WIN, SPIDER_BITE } from '../evil';
import { t } from '../lang';
import { VIEW_CENTER_X, VIEW_WIDTH, WALL_PANEL, WALL_TV } from '../layout';
import { PATTERNS } from '../patterns';
import { GRID_COLUMNS, GRID_ROWS, isPaying, isUnlocked, symbolsUnlockedAt, SYMBOLS, TICKET_SCATTER, type SlotSymbol } from '../rules';
import { addText } from '../theme';

const TV_DIM_ALPHA = 0.35; // в покое на стекле тусклый «?»
const NEW_COLOR = '#4ade80'; // «NEW»: зелёное
const BLINK_TIME = 450;
const OVERLAY_DEPTH = 20; // над игрой, под подсказкой и экранами паузы и DEATH
const SHADE_ALPHA = 0.8;
const PANEL_COLOR = 0x03161c; // тот же кинескоп, что у картинки символов
const PANEL_LINE = 0x67e8f9;
const INK = '#cffafe';
const GOLD = '#fbbf24';
const TAB_WIDTH = 210;
const TAB_HEIGHT = 40;
const PAD = 20;
const SYMBOLS_WIDTH = WALL_PANEL.width - 2 * PAD; // картинка вкладки «Символы» — на всю ширину экрана
const SYMBOLS_HEIGHT = 470;
// Вкладка «Паттерны»: 14 схем 5×3, по 7 в ряд.
const PATTERN_COLUMNS = 7;
const PATTERN_PITCH_X = 130;
const PATTERN_PITCH_Y = 150;
const PATTERN_CELL = 16;
const PATTERN_GAP = 3;

type Tab = 'symbols' | 'patterns' | 'howTo';
const TABS: { id: Tab; label: 'tabSymbols' | 'tabPatterns' | 'tabHowTo' }[] = [
  { id: 'symbols', label: 'tabSymbols' },
  { id: 'patterns', label: 'tabPatterns' },
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
 * «Символы» (цены и что делает каждый; новые — в золотой рамке), «Паттерны» (все схемы и их ×), «Как играть» (цель, долг, клавиши).
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
  private hasNew = false; // есть символы, которых ещё не видел

  /** round — какой раунд идёт: в «Символах» те, что уже есть в автомате; toggle — кликнули по телевизору или закрыли большой экран. */
  constructor(scene: Phaser.Scene, round: number, toggle: () => void) {
    this.scene = scene;
    createWallTvTexture(scene, WALL_TV);
    this.tv = scene.add.image(WALL_TV.x, WALL_TV.y, WALL_TV_TEXTURE);
    // Картинка шире корпуса (отсвет на стене) — кликать можно только по самому телевизору.
    const body = new Phaser.Geom.Rectangle(WALL_TV_GLOW, WALL_TV_GLOW, WALL_TV.width, WALL_TV.height);
    this.tv.setInteractive({ hitArea: body, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.tv.on('pointerdown', toggle);
    this.tv.on('pointerover', () => (this.isHovered = true));
    this.tv.on('pointerout', () => (this.isHovered = false));
    this.glass = addText(scene, WALL_TV.x, WALL_TV.y - 4, '?', { fontSize: '30px', fontStyle: 'bold', color: INK })
      .setOrigin(0.5)
      .setAlpha(TV_DIM_ALPHA);
    this.buildOverlay(toggle);
    this.content = scene.add.container(0, 0);
    this.round = round;
    this.hasNew = true; // в начале забега (и после кассеты) экран ещё не видели
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
    if (symbolsUnlockedAt(round).length > 0) this.hasNew = true;
    this.updateGlass();
    if (this.isOpen) this.showTab(this.tab);
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
    this.hasNew = false;
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
    if (this.hasNew) {
      this.glass.setText('NEW').setFontSize(22).setColor(NEW_COLOR).setAlpha(1);
      this.scene.tweens.add({ targets: this.glass, alpha: 0.15, duration: BLINK_TIME, yoyo: true, repeat: -1 });
    } else {
      this.glass.setText('?').setFontSize(30).setColor(INK).setAlpha(TV_DIM_ALPHA);
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
      const x = left + PAD + TAB_WIDTH / 2 + index * (TAB_WIDTH + 10);
      const box = scene.add.rectangle(x, tabY, TAB_WIDTH, TAB_HEIGHT, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => this.showTab(tab.id));
      const text = addText(scene, x, tabY, t(tab.label), { fontSize: '17px', fontStyle: 'bold', color: INK }).setOrigin(0.5);
      this.tabButtons.push({ box, text });
      this.overlay.push(box, text);
    });
    const crossX = left + WALL_PANEL.width - PAD - TAB_HEIGHT / 2;
    const crossBox = scene.add.rectangle(crossX, tabY, TAB_HEIGHT, TAB_HEIGHT, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
    crossBox.setInteractive({ useHandCursor: true });
    crossBox.on('pointerdown', close);
    const cross = addText(scene, crossX, tabY, '✕', { fontSize: '20px', fontStyle: 'bold', color: INK }).setOrigin(0.5);
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
    else if (tab === 'patterns') this.buildPatterns(left, top);
    else this.buildHowTo(left, top);
  }

  /** «Символы»: цены, что делают особые символы, джекпот — одна картинка. */
  private buildSymbols(left: number, top: number): void {
    this.content.add(this.scene.add.image(left, top, MONITOR_SCREEN_TEXTURE).setOrigin(0));
  }

  /** «Паттерны»: схемы 5×3, закрашены клетки, которые должны совпасть, под схемой — во сколько раз паттерн умножает цену символа. */
  private buildPatterns(left: number, top: number): void {
    const scene = this.scene;
    const step = PATTERN_CELL + PATTERN_GAP;
    PATTERNS.forEach((pattern, index) => {
      const column = index % PATTERN_COLUMNS;
      const row = Math.floor(index / PATTERN_COLUMNS);
      const x = left + 10 + column * PATTERN_PITCH_X;
      const y = top + 10 + row * PATTERN_PITCH_Y;
      const gridWidth = GRID_COLUMNS * step - PATTERN_GAP;
      const g = scene.add.graphics();
      g.fillStyle(0x1e3a44);
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLUMNS; c++) g.fillRect(x + c * step, y + r * step, PATTERN_CELL, PATTERN_CELL);
      }
      g.fillStyle(0xfde047);
      for (const [r, c] of pattern.cells) g.fillRect(x + c * step, y + r * step, PATTERN_CELL, PATTERN_CELL);
      const label = addText(scene, x + gridWidth / 2, y + GRID_ROWS * step + 8, `×${pattern.multiplier}`, { fontSize: '22px', fontStyle: 'bold', color: GOLD }).setOrigin(0.5, 0);
      this.content.add([g, label]);
    });
    const note = addText(scene, left + 10, top + 2 * PATTERN_PITCH_Y + 20, t('patternsNote'), {
      fontSize: '17px',
      color: INK,
      wordWrap: { width: WALL_PANEL.width - 4 * PAD },
    });
    this.content.add(note);
  }

  /** «Как играть»: слева цель и порядок игры, справа клавиши. */
  private buildHowTo(left: number, top: number): void {
    const style = { fontSize: '17px', color: INK, lineSpacing: 4 };
    const goal = addText(this.scene, left + 10, top + 6, t('howToGoal'), { ...style, wordWrap: { width: 560 } });
    const keys = addText(this.scene, left + 10 + 610, top + 6, t('howToKeys'), { ...style, wordWrap: { width: 290 } });
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

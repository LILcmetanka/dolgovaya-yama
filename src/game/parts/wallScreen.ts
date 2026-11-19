import Phaser from 'phaser';
import { ACHIEVEMENTS } from '../achievements';
import { CROWNS_FOR_FREE_SPINS, FREE_SPINS } from '../bonus';
import {
  amuletTexture,
  createAmuletTextures,
  createGearTexture,
  createItemTextures,
  createWallTvTexture,
  drawMonitorScreen,
  GEAR_TEXTURE,
  itemTexture,
  MONITOR_SCREEN_TEXTURE,
  type MonitorNote,
  type MonitorPrice,
  WALL_TV_GLOW,
  WALL_TV_TEXTURE,
} from '../decor';
import { AMULETS, type AmuletId } from '../amulets';
import { amuletKey, isSeen, itemKey, machineKey, WHO_COLLECTOR, WHO_DEALER } from '../codex';
import { disableDevMode, DEV_CHIPS, DEV_TICKETS, isDevMode, tryEnableDevMode } from '../devmode';
import { MACHINES, type MachineId } from '../machines';
import { BLOOD_WIN, SPIDER_BITE } from '../evil';
import { ITEMS, type ItemId } from '../items';
import { formatChips, t, type TextKey } from '../lang';
import { AMULET_SIZE, ITEM_SIZE, VIEW_CENTER_X, VIEW_WIDTH, WALL_PANEL, WALL_TV } from '../layout';
import { hasAchievement } from '../progress';
import { isPaying, isUnlocked, skullShare, symbolsUnlockedAt, SYMBOLS, TICKET_SCATTER, type SlotSymbol } from '../rules';
import { addText, fitTextWidth, GREEN_TEXT, GOLD_TEXT, LAMP_GOLD, RED_TEXT } from '../theme';

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
const TAB_WIDTH = 156; // было 218, потом 196: в шапке рядом с ⚙ теперь ещё раздел «?»/«ТЕСТ» и вкладка «Ачивки».
// Пять вкладок с отступами (5·156 + 4·8 = 812) оставляют справа место для ⚙, «?» и крестика — без наложений.
const TAB_FONT = 20; // кегль подписи вкладки
const TAB_FONT_MIN = 13; // уже не мельче: длинное «КТО ЕСТЬ КТО»/«ACHIEVEMENTS» ужимается до этого и потом масштабом
const TAB_LABEL_WIDTH = TAB_WIDTH - 14; // поля по 7 с каждой стороны: подпись не наезжает на рамку плашки
const TAB_HEIGHT = 48;
const TAB_ACTIVE = 0x0e4a58; // подсветка открытой вкладки
const GEAR_SIZE = 48; // ⚙ в шапке — кнопка того же размера, что ✕
const DEV_TAB_WIDTH = 92; // раздел «?» (в режиме разработчика — «ТЕСТ»): маленький, без названия
const DEV_TAB_GAP = 8; // отступ между кнопками шапки
const DEV_QUESTION_SIGN = '?'; // раздел без режима: только знак
const SPACE_KEY = '␣'; // так в списке клавиш помечен пробел: рисуем его полоской
const PAD = 20;
const SYMBOLS_WIDTH = WALL_PANEL.width - 2 * PAD; // картинка вкладки «Символы» — на всю ширину экрана
const SYMBOLS_HEIGHT = 500;
// Вкладки «Предметы» и «Кто есть кто»: строки в два столбца.
const ROW_COLUMNS = 2;
const ROW_WIDTH = 505;
const ROW_HEIGHT = 78; // ряд: название и до двух строк описания — выше прежних 66, иначе описание наезжало на следующий ряд
const ROW_ICON = 48;
const ROW_DESC_LINES = 2; // описание длиннее двух строк обрезается: ряд не растягиваем
const DIM_INK = '#8fc3cc';
// Раздел «?» и вкладка «ТЕСТ» (режим разработчика, devmode.ts). Сверху — строка кнопок, под ней
// два столбца: слева все предметы, справа все амулеты, у каждого кнопка «+1».
const DEV_BUTTON_HEIGHT = 32;
const DEV_BUTTON_PAD = 8; // поля кнопки по бокам от надписи
const DEV_BUTTON_GAP = 8;
const DEV_TOP_Y = 26; // от верха содержимого до строки кнопок
const DEV_CAPTION_Y = 62; // заголовки столбцов
const DEV_LIST_TOP = 78; // верх первого ряда списка
const DEV_ROW_HEIGHT = 32;
const DEV_COLUMN_WIDTH = 500;
const DEV_COLUMN_STEP = 520; // от левого края одного столбца до другого
const DEV_ICON = 24;
const DEV_NAME_WIDTH = 380; // шире название не бывает: дальше кнопка «+1»
const DEV_ADD = { width: 40, height: 24 }; // кнопка «+1» у каждого предмета и амулета
const DEV_ADD_LABEL = '+1';
const DEV_NAME_FONT = '15px';
// Вкладка «Ачивки»: все 44 ачивки сеткой в два столбца, по 11 рядов на страницу — 22 на страницу, две страницы.
// Ряд — значок и название. Полученные — обычным светлым, любая неполученная (секретная или нет) — «???»
// с притушенным значком-вопросом: название выдало бы, что ещё можно получить в игре.
const ACH_COLUMNS = 2;
const ACH_ROW_HEIGHT = 46; // 11 рядов = 506: в панель между шапкой и нижней рамкой (514) влезает
const ACH_ICON = 28;
const ACH_ICON_GAP = 16; // от значка до названия
const ACH_NAME_WIDTH = ROW_WIDTH - ACH_ICON - ACH_ICON_GAP - 6; // шире названия не бывает: fitTextWidth ужимает
const ACH_NAME_FONT = 20;
const ACH_NAME_FONT_MIN = 14;
const ACH_DIM_ALPHA = 0.4; // неполученные: серые и вполсилы, значок тоже притушен
const ACH_HIDDEN_SIGN = '❓';
const ACH_HIDDEN_NAME = '???';
// Строка с кодом — одна, как просил автор: набранное видно в ней, Enter или «ОК» проверяют код.
const DEV_INPUT = { width: 460, height: 52 };
const DEV_INPUT_FONT = '26px';
const DEV_CODE_Y = 110; // середина строки ввода — от верха содержимого
const DEV_HINT_BELOW = 44; // подсказка и ошибка — под строкой
const DEV_CODE_MAX = 16; // длиннее код не набирается
const DEV_CARET = '▌'; // курсор в конце строки ввода
const DEV_SHAKE = 8; // насколько строка дёргается при неверном коде
const DEV_SHAKE_TIME = 55;
// Не встреченное — плитки «???»: видно, что есть ещё, но не что именно.
const HIDDEN_COLUMNS = 6;
const HIDDEN_WIDTH = 160;
const HIDDEN_HEIGHT = 44;
const HIDDEN_GAP = 8;
const HIDDEN_TOP_GAP = 18; // отступ перед сеткой «???» от последнего ряда карточек
// Вкладка «Как играть»: цель забега теперь на записке над экраном на стене (GOAL_NOTE, Collector), здесь — текст и клавиши.
// Страницы: ряды по 2 столбца, сколько влезет в панель (низ 632). Больше не влезает: 12 предметов и 11 амулетов
// дают 12 рядов строк плюс ряды «???». Листаются кликом по панели или по счётчику «‹ 1/2 ›».

/** Строка вкладки: значок (картинка или эмодзи), название и описание. */
interface Row {
  texture?: string;
  sign?: string;
  name: string;
  description: string;
}

type Tab = 'symbols' | 'items' | 'who' | 'howTo' | 'achievements' | 'dev';
const TABS: { id: Tab; label: 'tabSymbols' | 'tabItems' | 'tabWho' | 'tabHowTo' | 'tabAchievements' }[] = [
  { id: 'symbols', label: 'tabSymbols' },
  { id: 'items', label: 'tabItems' },
  { id: 'who', label: 'tabWho' },
  { id: 'achievements', label: 'tabAchievements' },
  { id: 'howTo', label: 'tabHowTo' },
];

/** Что показать у платящего символа на вкладке «Символы»: фактическая выплата и во сколько раз чаще он падает. */
export interface SymbolReward {
  payout: number; // цена × амулеты, кости и автомат — то, что игрок получит за выпадение
  boost: number; // вес символа усилен предметом (вишни, колокола…): 1 — не усилен
}

/**
 * Что умеет вкладка «ТЕСТ» (режим разработчика). Сцена отдаёт сюда свои действия: выдача идёт тем же путём,
 * что и из магазина (предмет — на полку, амулет — в гнездо, фишки — через earn), поэтому табло и правила
 * ведут себя как обычно, только без цен.
 */
export interface DevActions {
  giveItem: (id: ItemId) => boolean; // false — на полке нет места, кнопка трясётся
  giveAmulet: (id: AmuletId) => boolean; // false — нового амулета некуда поставить (все гнёзда заняты), кнопка трясётся
  addChips: () => void;
  addTickets: () => void;
  setMachine: (id: MachineId) => void;
  currentMachine: () => MachineId;
}

/**
 * Буква нажатой клавиши — по физической клавише (event.code): код hookster набирается и на русской раскладке.
 * Не буква — сам символ из event.key (цифры и прочее), служебные клавиши — null.
 */
function typedLetter(event: KeyboardEvent): string | null {
  const code = /^Key([A-Z])$/.exec(event.code);
  if (code) return code[1].toLowerCase();
  return event.key.length === 1 ? event.key : null;
}

/** Что делает особый символ — надпись монитора; числа в ней — из правил, поэтому монитор не врёт, даже если их поменять. */
function symbolNote(symbol: SlotSymbol, round: number): string {
  switch (symbol.id) {
    case 'skull':
      // Доля черепов растёт с каждым раундом (rules.skullShare) — показываем, сколько их сейчас, а не «всегда столько».
      // Модификаторы (чеснок, риск, автомат) тут не считаются: монитор знает только раунд, а экранчик доли черепов
      // на корпусе — фактическая, её считает сцена по весам прокрутки.
      return t('skullNote', Math.round(skullShare(round) * 100));
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
 * «Символы» (цены и что делает каждый; новые — в золотой рамке), «Предметы», «Кто есть кто», «Ачивки» (только
 * полученные; любые неполученные — «???») и «Как играть» (долг, порядок, клавиши).
 * Цель забега — на записке над экраном на стене (GOAL_NOTE, Collector).
 * В шапке справа от вкладок — ⚙: настройки (громкость и язык) открываются отсюда. Рядом с ним — маленький раздел
 * «?»: строка с кодом (hookster) включает режим разработчика, и раздел становится вкладкой «ТЕСТ» (devmode.ts).
 * Строк больше, чем влезает в панель, поэтому у «Предметов» и «Кто есть кто» страницы: клик по панели
 * или по счётчику «‹ 1/2 ›» листает, «???» — на тех же страницах. Закрыть — клик мимо, ✕, Esc, Пробел или →.
 * Вид не поворачивается; что можно сейчас, решает сцена (пока открыт, крутить нельзя).
 */
export class WallScreen {
  private readonly scene: Phaser.Scene;
  private readonly tv: Phaser.GameObjects.Image; // корпус телевизора — по нему кликают
  private readonly glass: Phaser.GameObjects.Text; // «?» или «NEW» на стекле
  private readonly tabButtons: { box: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];
  private readonly overlay: Phaser.GameObjects.GameObject[] = []; // всё, что видно на большом экране, кроме содержимого вкладки
  private readonly dev: DevActions; // действия вкладки «ТЕСТ» — их делает сцена
  private rewardOf: ((symbol: SlotSymbol) => SymbolReward) | null = null; // цены с усилениями: их считает сцена
  private devTab!: { box: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }; // раздел «?» / «ТЕСТ» в шапке
  private content: Phaser.GameObjects.Container; // содержимое вкладки — пересобирается при смене вкладки и языка
  private tab: Tab = 'symbols';
  private page = 0; // страница вкладки «Предметы» или «Кто есть кто»
  private pages = 1; // сколько их всего у открытой вкладки
  private round = 0; // для какого раунда нарисованы символы
  private isOpen = false; // большой экран открыт
  private isEnabled = true; // по телевизору можно кликнуть
  private isHovered = false; // мышь над телевизором — курсор-рука его
  private news: News | null = null; // что мигает на телевизоре, пока экран не откроют
  private devInput = ''; // что набрано в строке кода
  private devInputText?: Phaser.GameObjects.Text; // надпись строки — живёт, пока открыт раздел «?»
  private devInputBox?: Phaser.GameObjects.Rectangle; // рамка строки — её трясём при неверном коде
  private devErrorText?: Phaser.GameObjects.Text;

  /** round — какой раунд идёт: в «Символах» те, что уже есть в автомате; toggle — кликнули по телевизору или закрыли большой экран; openSettings — нажали ⚙ в шапке вкладок; dev — действия вкладки «ТЕСТ». */
  constructor(scene: Phaser.Scene, round: number, toggle: () => void, openSettings: () => void, dev: DevActions) {
    this.scene = scene;
    this.dev = dev;
    createWallTvTexture(scene, WALL_TV);
    createItemTextures(scene, ITEMS, ITEM_SIZE);
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
    // Клавиши строки кода: пока раздел «?» открыт, сцена их не разбирает (GameScene.onKey).
    scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => this.onDevKey(event));
    this.buildOverlay(toggle, openSettings);
    this.content = scene.add.container(0, 0);
    this.round = round;
    this.news = 'new'; // в начале забега (и после кассеты) экран ещё не видели
    this.redrawSymbols();
    this.showTab('symbols');
    this.hideOverlay();
    this.updateGlass();
  }

  /**
   * Строка кода принимает клавиши: раздел «?» открыт, а режим ещё не включён. Тогда клавиша — буква,
   * а не действие игры (крутить, пауза, язык) — сцена это проверяет перед своими обработчиками.
   */
  isTyping(): boolean {
    return this.isOpen && this.tab === 'dev' && !isDevMode();
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
    this.tabButtons.forEach((button, index) => this.fitTabLabel(button.text, TABS[index].label));
    this.devTab.text.setText(this.devTabLabel());
    this.redrawSymbols();
    if (this.isOpen) this.showTab(this.tab);
  }

  /** Подпись вкладки по её плашке: длинное слово сначала теряет кегль, а если и так не влезло — ужимается масштабом. */
  private fitTabLabel(text: Phaser.GameObjects.Text, label: TextKey): void {
    fitTextWidth(text, t(label), TAB_LABEL_WIDTH, TAB_FONT, TAB_FONT_MIN);
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
    this.devInput = ''; // раздел «?» открывается с чистой строкой
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

  /** Затемнение, рамка, вкладки, ⚙ настроек, раздел «?» и ✕: клик по затемнению (мимо рамки) закрывает. */
  private buildOverlay(close: () => void, openSettings: () => void): void {
    const scene = this.scene;
    const shade = scene.add.rectangle(VIEW_CENTER_X, 320, VIEW_WIDTH, 640, 0x000000, SHADE_ALPHA);
    shade.setInteractive();
    shade.on('pointerdown', close);
    const panel = scene.add.rectangle(WALL_PANEL.x, WALL_PANEL.y, WALL_PANEL.width, WALL_PANEL.height, PANEL_COLOR);
    panel.setStrokeStyle(3, PANEL_LINE, 0.6);
    panel.setInteractive(); // клик по самой рамке не закрывает, а листает вкладку: на «Предметах» строк две страницы
    panel.on('pointerdown', () => this.nextPage());
    this.overlay.push(shade, panel);
    const top = WALL_PANEL.y - WALL_PANEL.height / 2;
    const left = WALL_PANEL.x - WALL_PANEL.width / 2;
    const tabY = top + PAD + TAB_HEIGHT / 2;
    TABS.forEach((tab, index) => {
      const x = left + PAD + TAB_WIDTH / 2 + index * (TAB_WIDTH + 8);
      const box = scene.add.rectangle(x, tabY, TAB_WIDTH, TAB_HEIGHT, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => this.showTab(tab.id));
      const text = addText(scene, x, tabY, '', { fontSize: `${TAB_FONT}px`, fontStyle: 'bold', color: INK }).setOrigin(0.5);
      this.fitTabLabel(text, tab.label); // «КТО ЕСТЬ КТО» и «ACHIEVEMENTS» ужимаются по плашке, а не лезут на соседнюю
      this.tabButtons.push({ box, text });
      this.overlay.push(box, text);
    });
    // ⚙ — настройки (громкость, язык), как раньше в углу комнаты: теперь только здесь, на планшете.
    createGearTexture(scene);
    const gearX = left + PAD + TABS.length * (TAB_WIDTH + 8) + GEAR_SIZE / 2;
    const gearBox = scene.add.rectangle(gearX, tabY, GEAR_SIZE, GEAR_SIZE, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
    gearBox.setInteractive({ useHandCursor: true });
    gearBox.on('pointerdown', openSettings);
    const gear = scene.add.image(gearX, tabY, GEAR_TEXTURE).setTint(PANEL_LINE).setAlpha(0.9);
    this.overlay.push(gearBox, gear);
    // Раздел «?» сразу за ⚙: без названия, просто знак. С режимом разработчика тут «ТЕСТ» (devmode.ts).
    const devX = gearX + GEAR_SIZE / 2 + DEV_TAB_GAP + DEV_TAB_WIDTH / 2;
    const devBox = scene.add.rectangle(devX, tabY, DEV_TAB_WIDTH, TAB_HEIGHT, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
    devBox.setInteractive({ useHandCursor: true });
    devBox.on('pointerdown', () => this.showTab('dev'));
    const devText = addText(scene, devX, tabY, this.devTabLabel(), { fontSize: '20px', fontStyle: 'bold', color: INK }).setOrigin(0.5);
    this.devTab = { box: devBox, text: devText };
    this.overlay.push(devBox, devText);
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

  /** Вкладка tab: подсветить кнопку, собрать содержимое заново. Другая вкладка начинается с первой страницы. */
  private showTab(tab: Tab): void {
    if (tab !== this.tab) this.page = 0;
    this.tab = tab;
    TABS.forEach((entry, index) => {
      const active = entry.id === tab;
      this.tabButtons[index].box.setFillStyle(active ? TAB_ACTIVE : PANEL_COLOR);
    });
    this.devTab.box.setFillStyle(tab === 'dev' ? TAB_ACTIVE : PANEL_COLOR);
    this.content.destroy();
    this.devInputText = undefined; // строки кода в новой вкладке может не быть: старые ссылки на снесённые надписи не нужны
    this.devInputBox = undefined;
    this.devErrorText = undefined;
    this.content = this.scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0).setVisible(this.isOpen);
    const left = WALL_PANEL.x - WALL_PANEL.width / 2 + PAD;
    // −2: ряды начинаются чуть выше, а сколько их влезет в панель, считает buildRows по её нижней рамке.
    const top = WALL_PANEL.y - WALL_PANEL.height / 2 + 2 * PAD + TAB_HEIGHT - 2;
    if (tab === 'symbols') this.buildSymbols(left, top);
    else if (tab === 'items') this.buildItems(left, top);
    else if (tab === 'who') this.buildWho(left, top);
    else if (tab === 'achievements') this.buildAchievements(left, top);
    else if (tab === 'howTo') this.buildHowTo(left, top);
    else this.buildDev(left, top);
  }

  /** Клик по панели или по счётчику: следующая страница. Одна страница — ничего не происходит. */
  private nextPage(): void {
    if (!this.isOpen || this.pages <= 1) return;
    this.page = (this.page + 1) % this.pages;
    this.showTab(this.tab);
  }

  /**
   * «Символы»: цены, что делают особые символы, — одна картинка. Джекпот внизу экрана убран (DONTLIKE 9.2),
   * его строка теперь выходит новостью на стекле, когда джекпот выпадает (BonusScene.collectJackpot).
   */
  private buildSymbols(left: number, top: number): void {
    this.pages = 1;
    // Перерисовываем при открытии вкладки: амулеты и предметы забега меняются — цены вместе с ними (хоч. 9.1).
    this.redrawSymbols();
    this.content.add(this.scene.add.image(left, top, MONITOR_SCREEN_TEXTURE).setOrigin(0));
  }

  /** «Предметы»: предметы с полки и амулеты, которые уже попадались в магазине, на полке или в гнёздах. */
  private buildItems(left: number, top: number): void {
    const hidden = ITEMS.filter((item) => !isSeen(itemKey(item.id))).length + AMULETS.filter((amulet) => !isSeen(amuletKey(amulet.id))).length;
    const rows: Row[] = [
      ...ITEMS
        .filter((item) => isSeen(itemKey(item.id)))
        .map((item) => ({ texture: itemTexture(item), name: t(item.name), description: t(item.description) })),
      ...AMULETS.filter((amulet) => isSeen(amuletKey(amulet.id))).map((amulet) => ({
        texture: amuletTexture(amulet),
        name: t(amulet.name),
        description: t(amulet.description),
      })),
    ];
    this.buildRows(left, top, rows, hidden);
  }

  /** «Кто есть кто»: Коллектор, Дилер и автоматы, которые уже стояли на месте (классический — всегда). */
  private buildWho(left: number, top: number): void {
    const [classic, ...others] = MACHINES;
    const rows: Row[] = [{ sign: classic.sign || '🎰', name: t(classic.name), description: t(classic.description) }];
    let hidden = 0;
    if (isSeen(WHO_COLLECTOR)) rows.push({ sign: '💼', name: t('whoCollector'), description: t('whoCollectorWhat') });
    else hidden += 1;
    if (isSeen(WHO_DEALER)) rows.push({ sign: '🎲', name: t('whoDealer'), description: t('whoDealerWhat') });
    else hidden += 1;
    for (const machine of others) {
      if (isSeen(machineKey(machine.id))) rows.push({ sign: machine.sign, name: t(machine.name), description: t(machine.description) });
      else hidden += 1;
    }
    this.buildRows(left, top, rows, hidden);
  }

  /**
   * Строки в два столбца: значок слева, название и описание справа. Под ними — плитки «???» по числу ещё не встреченного
   * (что именно, не видно). Нечего показать совсем — «Пока ничего не встретил».
   * Ряд — две строки или ряд плиток «???». Рядов бывает больше страницы (12 предметов и 11 амулетов), поэтому
   * в панель влезает столько рядов, сколько в ней помещается по высоте, а остальные — по клику на панель или на «‹ 1/2 ›».
   */
  private buildRows(left: number, top: number, rows: Row[], hidden: number): void {
    const scene = this.scene;
    if (rows.length === 0 && hidden === 0) {
      this.content.add(addText(scene, left + 10, top + 6, t('tabEmpty'), { fontSize: '22px', color: DIM_INK }));
      this.pages = 1;
      return;
    }
    const rowLines: Row[][] = [];
    for (let index = 0; index < rows.length; index += ROW_COLUMNS) rowLines.push(rows.slice(index, index + ROW_COLUMNS));
    const hiddenLines = Math.ceil(hidden / HIDDEN_COLUMNS);
    const bottom = WALL_PANEL.y + WALL_PANEL.height / 2 - PAD; // рамка панели: ниже неё ряды не ставим
    const perPage = Math.max(1, Math.floor((bottom - top) / ROW_HEIGHT));
    this.pages = Math.max(1, Math.ceil((rowLines.length + hiddenLines) / perPage));
    if (this.page >= this.pages) this.page = 0;
    const first = this.page * perPage; // номер первого ряда на странице
    const last = first + perPage;
    rowLines.forEach((line, index) => {
      if (index < first || index >= last) return;
      const y = top + (index - first) * ROW_HEIGHT;
      line.forEach((row, column) => {
        const x = left + column * ROW_WIDTH;
        const iconX = x + ROW_ICON / 2 + 6;
        const iconY = y + ROW_ICON / 2;
        if (row.texture) this.content.add(scene.add.image(iconX, iconY, row.texture).setDisplaySize(ROW_ICON, ROW_ICON));
        else this.content.add(addText(scene, iconX, iconY, row.sign ?? '', { fontSize: '36px' }).setOrigin(0.5));
        const textX = x + ROW_ICON + 20;
        this.content.add(addText(scene, textX, y, row.name, { fontSize: '21px', fontStyle: 'bold', color: INK }));
        const description = { fontSize: '16px', color: DIM_INK, wordWrap: { width: ROW_WIDTH - ROW_ICON - 36 }, maxLines: ROW_DESC_LINES };
        this.content.add(addText(scene, textX, y + 27, row.description, description));
      });
    });
    for (let line = 0; line < hiddenLines; line++) {
      const index = rowLines.length + line;
      if (index < first || index >= last) continue;
      // Плитки — посреди своего ряда, а от последней карточки их отделяет отступ.
      const y = top + (index - first) * ROW_HEIGHT + HIDDEN_TOP_GAP + (ROW_HEIGHT - HIDDEN_HEIGHT) / 2;
      const from = line * HIDDEN_COLUMNS;
      for (let tile = from; tile < Math.min(hidden, from + HIDDEN_COLUMNS); tile++) {
        const x = left + 10 + (tile - from) * (HIDDEN_WIDTH + HIDDEN_GAP);
        const box = scene.add.rectangle(x + HIDDEN_WIDTH / 2, y + HIDDEN_HEIGHT / 2, HIDDEN_WIDTH, HIDDEN_HEIGHT, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.25);
        const label = addText(scene, x + HIDDEN_WIDTH / 2, y + HIDDEN_HEIGHT / 2, '???', { fontSize: '22px', fontStyle: 'bold', color: DIM_INK }).setOrigin(0.5).setAlpha(0.6);
        this.content.add([box, label]);
      }
    }
    if (this.pages > 1) {
      // «‹ 1/2 ›» — под крестиком, над первым рядом: там пусто на любой вкладке со строками.
      const counter = addText(scene, left + SYMBOLS_WIDTH, top - 7, `‹ ${this.page + 1}/${this.pages} ›`, { fontSize: '16px', color: DIM_INK }).setOrigin(1, 0.5);
      counter.setInteractive({ useHandCursor: true });
      counter.on('pointerdown', () => this.nextPage());
      this.content.add(counter);
    }
  }

  /**
   * «Ачивки»: все ачивки игры (ACHIEVEMENTS, 44) сеткой в два столбца. Полученные — светлые и с цветным значком,
   * любая неполученная — «???» с притушенным «❓»: и название, и значок выдали бы, что ещё можно получить.
   * Состояние — из прогресса (hasAchievement), не из группы: в ТЕСТ-режиме он не пишется, поэтому вкладка
   * честно показывает записанное. Поле group на показ не влияет.
   * 44 пункта в панель не влезают: сколько рядов влезет по высоте, столько и на странице, остальные — по клику на панель
   * или на счётчик «‹ 1/2 ›» (у achievements 22 на страницу, значит две).
   */
  private buildAchievements(left: number, top: number): void {
    const scene = this.scene;
    const bottom = WALL_PANEL.y + WALL_PANEL.height / 2 - PAD; // рамка панели: ниже неё ряды не ставим
    const rowsPerPage = Math.max(1, Math.floor((bottom - top) / ACH_ROW_HEIGHT));
    const perPage = rowsPerPage * ACH_COLUMNS;
    this.pages = Math.max(1, Math.ceil(ACHIEVEMENTS.length / perPage));
    if (this.page >= this.pages) this.page = 0;
    const first = this.page * perPage;
    ACHIEVEMENTS.slice(first, first + perPage).forEach((achievement, index) => {
      const column = Math.floor(index / rowsPerPage);
      const row = index % rowsPerPage;
      const x = left + column * ROW_WIDTH;
      const y = top + row * ACH_ROW_HEIGHT + ACH_ROW_HEIGHT / 2;
      const isObtained = hasAchievement(achievement.id); // только записанное в прогресс: в ТЕСТ он не пишется
      const isHidden = !isObtained; // неполученная любой группы — «❓ ???», без названия
      const icon = addText(scene, x + ACH_ICON / 2 + 4, y, isHidden ? ACH_HIDDEN_SIGN : achievement.icon, { fontSize: `${ACH_ICON}px` }).setOrigin(0.5);
      icon.setAlpha(isObtained ? 1 : ACH_DIM_ALPHA);
      const name = addText(scene, x + ACH_ICON + ACH_ICON_GAP, y, '', { fontSize: `${ACH_NAME_FONT}px`, fontStyle: 'bold', color: isObtained ? INK : DIM_INK }).setOrigin(0, 0.5);
      name.setAlpha(isObtained ? 1 : ACH_DIM_ALPHA);
      // Длинные названия («Пачка скелетов в кармане», «A pack of skeletons in the pocket») ужимаются по ширине столбца.
      fitTextWidth(name, isHidden ? ACH_HIDDEN_NAME : t(achievement.name), ACH_NAME_WIDTH, ACH_NAME_FONT, ACH_NAME_FONT_MIN);
      this.content.add([icon, name]);
    });
    if (this.pages > 1) {
      // «‹ 1/2 ›» — под крестиком, над первым рядом: там пусто на любой вкладке со строками.
      const counter = addText(scene, left + SYMBOLS_WIDTH, top - 7, `‹ ${this.page + 1}/${this.pages} ›`, { fontSize: '16px', color: DIM_INK }).setOrigin(1, 0.5);
      counter.setInteractive({ useHandCursor: true });
      counter.on('pointerdown', () => this.nextPage());
      this.content.add(counter);
    }
  }

  /** «Как играть»: слева цель и порядок игры, справа клавиши. Цель забега — на записке над экраном (GOAL_NOTE). */
  private buildHowTo(left: number, top: number): void {
    this.pages = 1;
    const width = SYMBOLS_WIDTH;
    const centerX = left + width / 2;
    const icon = (x: number, y: number, text: string, size: number, color = INK) =>
      addText(this.scene, x, y, text, { fontSize: `${size}px`, color }).setOrigin(0.5);
    // Цель забега: миллион, к которому идёт счёт. Число одинаково на обоих языках — подписей не нужно.
    this.content.add(icon(centerX, top + 32, '🎯  1 000 000', 42, GOLD_TEXT));
    // «Что делаешь → что получаешь»: две колонки, два ряда.
    const pairs: { x: number; y: number; text: string; color: string }[] = [
      { x: left + width * 0.27, y: top + 116, text: '🎰 → 🪙', color: INK },
      { x: left + width * 0.73, y: top + 116, text: '💀 → 🔥', color: RED_TEXT },
      { x: left + width * 0.27, y: top + 186, text: '👑 → 🔄', color: GOLD_TEXT },
      { x: left + width * 0.73, y: top + 186, text: '🍀 → ✅', color: GREEN_TEXT },
    ];
    this.content.add(pairs.map((pair) => icon(pair.x, pair.y, pair.text, 40, pair.color)));
    // Клавиши — плашками с буквами, под каждой короткая подпись: без неё игрок не понимает, что это за кнопка.
    this.addKeyRow(left, top + 266, width, [
      { label: SPACE_KEY, width: 92, caption: 'keySpin' }, { label: '↩', width: 52, caption: 'keyTake' },
      { label: 'D', width: 48, caption: 'keyDebt' }, { label: '1–8', width: 62, caption: 'keyItems' },
      { label: 'Esc', width: 58, caption: 'keyPause' }, { label: 'L', width: 48, caption: 'keyLanguage' },
      { label: 'M', width: 48, caption: 'keySound' },
    ], 18);
    // В магазине те же цифры — по рядам витрины: корзина намекает, где это.
    this.content.add(icon(centerX, top + 348, '🛒', 34));
    this.addKeyRow(left, top + 392, width, [
      { label: '1–4', width: 58, caption: 'keyShop' }, { label: '5–8', width: 58, caption: 'keyAmulets' },
      { label: '9', width: 48, caption: 'keyCassette' }, { label: '0', width: 48, caption: 'keyDrum' },
    ], 26);
  }

  /**
   * Ряд «клавиш»: тёмные плашки с буквами и короткой подписью под каждой — что эта кнопка делает.
   * letter у пробела рисуется полоской, остальные — буквой; подписи из lang.ts, на обоих языках одно слово.
   */
  private addKeyRow(
    left: number,
    y: number,
    width: number,
    keys: { label: string; width: number; caption: TextKey }[],
    gap: number,
  ): void {
    const captionGap = 22; // подпись ниже плашки: плашка 40, подпись 12 — не наезжают друг на друга
    const total = keys.reduce((sum, key) => sum + key.width, 0) + gap * (keys.length - 1);
    let x = left + (width - total) / 2;
    for (const key of keys) {
      const box = this.scene.add.rectangle(x + key.width / 2, y, key.width, 40, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.8).setRounded(6);
      // Пробел рисуем полоской, а не глифом ␣: он в шрифте мелкий и читается как апостроф.
      const label =
        key.label === SPACE_KEY
          ? this.scene.add.rectangle(x + key.width / 2, y, key.width * 0.5, 6, PANEL_LINE, 0.85).setRounded(3)
          : addText(this.scene, x + key.width / 2, y, key.label, { fontSize: '18px', fontStyle: 'bold', color: INK }).setOrigin(0.5);
      const caption = addText(this.scene, x + key.width / 2, y + captionGap, t(key.caption), { fontSize: '12px', color: DIM_INK }).setOrigin(0.5, 0);
      this.content.add([box, label, caption]);
      x += key.width + gap;
    }
  }

  // ---------- Раздел «?» и вкладка «ТЕСТ» (режим разработчика) ----------

  /** Подпись раздела: без режима — «?», с режимом — «ТЕСТ». */
  private devTabLabel(): string {
    return isDevMode() ? t('devTab') : DEV_QUESTION_SIGN;
  }

  /** Раздел рядом с ⚙: без режима — одна строка с кодом, с режимом — вкладка «ТЕСТ». */
  private buildDev(left: number, top: number): void {
    if (isDevMode()) this.buildDevPanel(left, top);
    else this.buildDevCode(left, top);
  }

  /**
   * Код: одна строка ввода и кнопка «ОК». Набранное видно в строке, буквы принимает клавиатура
   * (onDevKey) — Phaser DOM в этой игре не подключён. Верный код (hookster, регистр не важен) включает
   * режим и превращает раздел во вкладку «ТЕСТ»; неверный — строка коротко трясётся.
   */
  private buildDevCode(left: number, top: number): void {
    const scene = this.scene;
    this.pages = 1;
    this.content.add(addText(scene, left + 10, top + DEV_TOP_Y - 8, t('devCodeAsk'), { fontSize: '22px', fontStyle: 'bold', color: INK }));
    const y = top + DEV_CODE_Y;
    const box = scene.add.rectangle(left + 10 + DEV_INPUT.width / 2, y, DEV_INPUT.width, DEV_INPUT.height, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.7);
    this.devInputBox = box;
    this.devInputText = addText(scene, left + 24, y, '', { fontSize: DEV_INPUT_FONT, fontStyle: 'bold', color: INK }).setOrigin(0, 0.5);
    this.content.add([box, this.devInputText]);
    this.devButton(left + 10 + DEV_INPUT.width + 16, y, t('devConfirm'), () => this.confirmDevCode());
    const hintY = y + DEV_HINT_BELOW;
    this.content.add(addText(scene, left + 24, hintY, t('devCodeHint'), { fontSize: '15px', color: DIM_INK }));
    this.devErrorText = addText(scene, left + 24, hintY + 26, '', { fontSize: '18px', fontStyle: 'bold', color: RED_TEXT });
    this.content.add(this.devErrorText);
    this.showDevInput();
  }

  /** Набранное — в строке, курсор в конце. Пустая строка — один курсор. */
  private showDevInput(): void {
    this.devInputText?.setText(`${this.devInput}${DEV_CARET}`);
  }

  /** Enter или «ОК»: верный код включает режим, неверный — короткая ошибка и встряска строки. */
  private confirmDevCode(): void {
    const isEnabled = tryEnableDevMode(this.devInput);
    this.devInput = '';
    if (isEnabled) {
      this.refreshDevTab();
      return;
    }
    this.showDevInput();
    this.devErrorText?.setText(t('devCodeWrong'));
    const box = this.devInputBox;
    if (!box) return;
    const baseX = box.x;
    this.scene.tweens.killTweensOf(box);
    this.scene.tweens.add({
      targets: box,
      x: baseX + DEV_SHAKE,
      duration: DEV_SHAKE_TIME,
      yoyo: true,
      repeat: 2,
      onComplete: () => box.setX(baseX),
    });
  }

  /** Режим включили или выключили: подпись раздела и его содержимое обновляются сразу. */
  private refreshDevTab(): void {
    this.devTab.text.setText(this.devTabLabel());
    if (this.isOpen) this.showTab('dev');
  }

  /** «ВЫЙТИ»: флаг сброшен, раздел снова «?» со строкой кода. Пересборка — кадром позже: кнопку нельзя сносить в её же нажатии. */
  private exitDevMode(): void {
    disableDevMode();
    this.devTab.text.setText(this.devTabLabel());
    this.scene.time.delayedCall(0, () => {
      if (this.isOpen) this.showTab('dev');
    });
  }

  /**
   * Клавиши строки кода: буквы и Backspace. Enter проверяет код. Esc сюда не относится — его разбирает сцена
   * (закрыть планшет, как всегда), поэтому в GameScene.onKey Esc из-под строки пропускается.
   */
  private onDevKey(event: KeyboardEvent): void {
    if (!this.isTyping()) return;
    if (event.key === 'Enter') {
      this.confirmDevCode();
      return;
    }
    if (event.key === 'Backspace') {
      this.devInput = this.devInput.slice(0, -1);
      this.clearDevError();
      this.showDevInput();
      return;
    }
    const letter = typedLetter(event);
    if (letter === null || this.devInput.length >= DEV_CODE_MAX) return;
    this.devInput += letter;
    this.clearDevError();
    this.showDevInput();
  }

  /** Новый символ — старая ошибка больше не нужна. */
  private clearDevError(): void {
    this.devErrorText?.setText('');
  }

  /**
   * Вкладка «ТЕСТ» (видна только с режимом): фишки, билеты, автомат и выход сверху, под ними два столбца —
   * все предметы и все амулеты с кнопкой «+1». Выдача идёт тем же путём, что из магазина (действия сцены).
   */
  private buildDevPanel(left: number, top: number): void {
    this.pages = 1;
    const rowY = top + DEV_TOP_Y;
    let x = left;
    x = this.devButton(x, rowY, t('devChips', formatChips(DEV_CHIPS)), () => this.dev.addChips()) + DEV_BUTTON_GAP;
    x = this.devButton(x, rowY, t('devTickets', formatChips(DEV_TICKETS)), () => this.dev.addTickets()) + DEV_BUTTON_GAP;
    const machine = this.dev.currentMachine();
    for (const spec of MACHINES) {
      x = this.devButton(x, rowY, t(spec.name).toUpperCase(), () => this.chooseDevMachine(spec.id), spec.id === machine) + DEV_BUTTON_GAP;
    }
    this.devButton(left + SYMBOLS_WIDTH, rowY, t('devExit'), () => this.exitDevMode(), false, true); // у правого края строки
    this.addDevCaption(left, top + DEV_CAPTION_Y, t('devItems'));
    this.addDevCaption(left + DEV_COLUMN_STEP, top + DEV_CAPTION_Y, t('devAmulets'));
    ITEMS.forEach((item, index) => {
      this.addDevRow(left, top, index, itemTexture(item), t(item.name), () => this.dev.giveItem(item.id));
    });
    AMULETS.forEach((amulet, index) => {
      this.addDevRow(left + DEV_COLUMN_STEP, top, index, amuletTexture(amulet), t(amulet.name), () => this.dev.giveAmulet(amulet.id));
    });
  }

  /** Автомат: выбранный подсвечен. Кнопки пересобираются кадром позже — нельзя сносить кнопку в её же нажатии. */
  private chooseDevMachine(id: MachineId): void {
    if (id === this.dev.currentMachine()) return;
    this.dev.setMachine(id);
    this.scene.time.delayedCall(0, () => {
      if (this.isOpen && this.tab === 'dev') this.showTab('dev');
    });
  }

  /** Кнопка вкладки «ТЕСТ»: рамка по надписи, у выбранного автомата — золотая. Возвращает правый край. alignRight — x это правый край. */
  private devButton(x: number, y: number, label: string, press: () => void, active = false, alignRight = false): number {
    const scene = this.scene;
    const text = addText(scene, 0, y, label, { fontSize: '16px', fontStyle: 'bold', color: INK }).setOrigin(0, 0.5);
    const width = text.width + 2 * DEV_BUTTON_PAD;
    const leftX = alignRight ? x - width : x;
    text.setX(leftX + DEV_BUTTON_PAD);
    const box = scene.add
      .rectangle(leftX + width / 2, y, width, DEV_BUTTON_HEIGHT, active ? TAB_ACTIVE : PANEL_COLOR)
      .setStrokeStyle(2, active ? LAMP_GOLD : PANEL_LINE, active ? 1 : 0.5);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', press);
    this.content.add([box, text]);
    return leftX + width;
  }

  /** Заголовок столбца вкладки «ТЕСТ»: «ПРЕДМЕТЫ» или «АМУЛЕТЫ». */
  private addDevCaption(x: number, y: number, label: string): void {
    this.content.add(addText(this.scene, x + 10, y, label, { fontSize: '14px', fontStyle: 'bold', color: DIM_INK }).setOrigin(0, 0.5));
  }

  /** Строка вкладки «ТЕСТ»: значок, название и «+1» — выдать в текущий забег. press вернул false — «+1» трясётся. */
  private addDevRow(x: number, top: number, index: number, texture: string, label: string, press: () => boolean | void): void {
    const scene = this.scene;
    const y = top + DEV_LIST_TOP + index * DEV_ROW_HEIGHT + DEV_ROW_HEIGHT / 2;
    const icon = scene.add.image(x + DEV_ICON / 2 + 6, y, texture).setDisplaySize(DEV_ICON, DEV_ICON);
    const name = addText(scene, x + DEV_ICON + 18, y, label, { fontSize: DEV_NAME_FONT, color: INK, wordWrap: { width: DEV_NAME_WIDTH }, maxLines: 1 }).setOrigin(0, 0.5);
    const buttonX = x + DEV_COLUMN_WIDTH - DEV_ADD.width / 2 - 6;
    const box = scene.add.rectangle(buttonX, y, DEV_ADD.width, DEV_ADD.height, PANEL_COLOR).setStrokeStyle(2, PANEL_LINE, 0.5);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => {
      if (press() !== false) return;
      const baseX = box.x;
      scene.tweens.killTweensOf(box);
      scene.tweens.add({ targets: box, x: baseX + DEV_SHAKE, duration: DEV_SHAKE_TIME, yoyo: true, repeat: 2, onComplete: () => box.setX(baseX) });
    });
    const add = addText(scene, buttonX, y, DEV_ADD_LABEL, { fontSize: '15px', fontStyle: 'bold', color: INK }).setOrigin(0.5);
    this.content.add([icon, name, box, add]);
  }

  /** Сцена отдаёт цены с усилениями текущего забега: амулеты, кости, автомат и бусты предметов (хоч. 9.1). */
  setSymbolReward(rewardOf: (symbol: SlotSymbol) => SymbolReward): void {
    this.rewardOf = rewardOf;
  }

  /** Картинка «Символов» заново: цены — от дешёвых к дорогим, особые символы — в том порядке, как входили в автомат. */
  private redrawSymbols(): void {
    const fresh = symbolsUnlockedAt(this.round);
    const inMachine = SYMBOLS.filter((symbol) => isUnlocked(symbol, this.round));
    const prices: MonitorPrice[] = inMachine
      .filter(isPaying)
      .sort((a, b) => a.price - b.price)
      .map((symbol) => {
        const reward = this.rewardOf?.(symbol); // без сцены — базовая цена, как раньше
        return { symbol, price: reward?.payout ?? symbol.price, boost: reward?.boost, isNew: fresh.includes(symbol) };
      });
    const notes: MonitorNote[] = inMachine
      .filter((symbol) => !isPaying(symbol))
      .sort((a, b) => a.unlockRound - b.unlockRound)
      .map((symbol) => ({ symbol, text: symbolNote(symbol, this.round), isNew: fresh.includes(symbol) }));
    drawMonitorScreen(this.scene, SYMBOLS_WIDTH, SYMBOLS_HEIGHT, prices, notes);
  }
}

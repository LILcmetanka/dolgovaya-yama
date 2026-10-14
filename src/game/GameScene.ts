import Phaser from 'phaser';
import {
  debtForRound,
  evaluateLine,
  EXTRA_SPINS,
  isSkull,
  multiplierForStreak,
  POWER_UPS,
  randomSymbol,
  REDUCED_SKULL_WEIGHT,
  SKULL_WEIGHT,
  skullLineChance,
  spinLine,
  SPINS_PER_ROUND,
  SYMBOLS,
  TAKE_BOOST,
  winWithMultiplier,
  type Line,
  type LineResult,
  type PowerUp,
  type SlotSymbol,
} from './rules';
import {
  COIN_TEXTURE,
  COINS_ICON,
  createCoinTexture,
  createIconTextures,
  createLamps,
  drawBackground,
  drawCabinet,
  drawMatchIcon,
  drawPanel,
  drawPlaque,
  LAMP_OFF,
  LEVER_ICON,
  SHIELD_ICON,
  SKULL_DOWN_ICON,
} from './decor';

// Раскладка экрана 960×640.
const CENTER_X = 480;
const CENTER_Y = 320;
const LEFT_PANEL_X = 113; // центр левой панели (раунд, прокрутки, рекорд)
const RIGHT_PANEL_X = 848; // центр правой панели (выплаты)
const PANEL_Y = 274;
const PANEL_WIDTH = 194;
const PANEL_HEIGHT = 212;
const SWATCH_X = 772; // мини-барабаны в таблице выплат
const PAIR_COLUMN_X = 862;
const THREE_COLUMN_X = 912;
const DEBT_BAR_Y = 108;
const DEBT_BAR_WIDTH = 480;
const DEBT_BAR_HEIGHT = 30;
const REEL_XS = [310, 480, 650]; // центры трёх барабанов
const REEL_Y = 250;
const REEL_SIZE = 150;
const CABINET_WIDTH = 520; // корпус автомата вокруг барабанов
const CABINET_HEIGHT = 186;
const MESSAGE_Y = 362;
const POT_Y = 404;
const BUTTON_Y = 545;
const BUTTON_WIDTH = 320;
const BUTTON_HEIGHT = 84;
const BUTTON_PRESS = 6; // на сколько px кнопка вдавливается (столько же видно её тени)
const SPIN_BUTTON_X = 310;
const TAKE_BUTTON_X = 650;
const SHOP_Y = 330; // центр окна магазина
const SHOP_WIDTH = 900;
const SHOP_HEIGHT = 520;
const SHOP_CARD_Y = 325;
const SHOP_CARD_STEP = 214; // расстояние между центрами карточек магазина
const SHOP_CARD_WIDTH = 200;
const SHOP_CARD_HEIGHT = 210;

// Анимация прокрутки: время в мс, расстояние в px.
const FLICKER_DELAY = 60; // как часто меняется символ, пока барабан крутится
const REEL_STOP_TIMES = [400, 650, 900]; // когда останавливается каждый барабан
const RESULT_PAUSE = 150; // пауза между остановкой последнего барабана и итогом
const BOUNCE_HEIGHT = 14; // высота подскока при остановке

// Обратная связь: время в мс.
const BANNER_DELAY = 400; // пауза, чтобы «+36» долетело до полосы долга, перед «ДОЛГ ЗАКРЫТ!»
const DEBT_CLOSED_TIME = 1000; // сколько держится «ДОЛГ ЗАКРЫТ!»
const GAME_OVER_DELAY = 700; // пауза перед экраном проигрыша, чтобы увидеть последнюю прокрутку
const RESTART_SPACE_DELAY = 800; // Пробел перезапускает игру не раньше, чем через столько

// Лампочки на корпусе.
const LAMP_TICK = 90; // как часто обновляются лампочки, мс
const LAMP_IDLE_SPEED = 4; // в покое огонёк сдвигается раз в 4 тика, при событиях — каждый тик
const LAMP_GOLD = 0xfde047;
const LAMP_RED = 0xef4444;
const LAMP_BLUE = 0x60a5fa;
const LAMP_GREEN = 0x4ade80;

const LOW_SPINS = 3; // столько прокруток или меньше — счётчик красный
const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage

// Слои: чем больше число, тем выше лежит объект.
const COIN_DEPTH = 5;
const POPUP_DEPTH = 10;
const BANNER_DEPTH = 20;
const SHOP_DEPTH = 25;
const GAME_OVER_DEPTH = 30;

// Внешний вид.
const FONT = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const REEL_BORDER = 0xe2e8f0;
const SKULL_BORDER = 0xef4444;
const WIN_BORDER = 0xfde047;
const SHIELD_BORDER = 0x60a5fa;
const SPIN_COLOR = 0xea580c;
const BUTTON_BORDER = 0xfbbf24;
const CARD_BORDER = 0x475569;
const TAKE_COLOR = 0x16a34a;
const DEBT_BAR_COLOR = 0x22c55e;
const GOLD_TEXT = '#fde047';
const GREEN_TEXT = '#4ade80';
const RED_TEXT = '#f87171';
const BLUE_TEXT = '#60a5fa';
const VIOLET_TEXT = '#c4b5fd';
const MUTED_TEXT = '#94a3b8';
// Всплывающие надписи жирные и с тёмной обводкой, чтобы читались поверх барабанов.
const POPUP_STYLE = { fontSize: '36px', fontStyle: 'bold', stroke: '#0f172a', strokeThickness: 6 };

/**
 * Кнопка: тень стоит на месте, а «лицо» — контейнер с корпусом, бликом, иконкой и надписями.
 * Контейнер двигает всё вместе: нажатие опускает лицо на тень. y — где кнопка стоит, когда не нажата.
 */
interface Button {
  shadow: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  y: number;
}

/** Иконка каждого усиления в магазине (нарисованы кодом в decor.ts). */
const POWER_UP_ICONS: Record<PowerUp['id'], string> = {
  spins: LEVER_ICON,
  shield: SHIELD_ICON,
  fewerSkulls: SKULL_DOWN_ICON,
  double: COINS_ICON,
};

/** «+12» или, если множитель больше 1, «+4 ×3 = +12». */
function formatWin(win: number, multiplier: number, gain: number): string {
  return multiplier > 1 ? `+${win} ×${multiplier} = +${gain}` : `+${gain}`;
}

/** Цвет рамки символа: у черепа красная, у остальных светлая. */
function borderColor(symbol: SlotSymbol): number {
  return isSkull(symbol) ? SKULL_BORDER : REEL_BORDER;
}

/** Рекорд из localStorage. Если хранилище недоступно — 0, игра работает и так. */
function loadRecord(): number {
  try {
    const saved = Number(localStorage.getItem(RECORD_KEY));
    return Number.isFinite(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

/** Сохранить рекорд в localStorage. Не получилось — не страшно. */
function saveRecord(record: number): void {
  try {
    localStorage.setItem(RECORD_KEY, String(record));
  } catch {
    // хранилище недоступно (например, запрещено настройками браузера) — играем без сохранения
  }
}

/**
 * Единственная сцена игры «Долговая яма»: состояние, отрисовка, ввод и анимации.
 * Сами правила (символы, выплаты, долг, множитель) лежат в rules.ts.
 */
export class GameScene extends Phaser.Scene {
  // Состояние игры. Начальные значения ставит resetState(), потому что
  // при scene.restart() поля класса сами не сбрасываются.
  private round = 0; // номер раунда: какой по счёту долг закрываем
  private debt = 0; // долг этого раунда
  private paid = 0; // сколько уже внесено в этот долг
  private spinsLeft = 0; // сколько прокруток осталось в раунде
  private pot = 0; // кон: выиграно, но ещё не внесено — череп сжигает его
  private streak = 0; // серия: сколько прокруток подряд без черепа и без «забрать»
  private record = 0; // рекорд: больше всего закрытых долгов за одну игру
  private shields = 0; // щиты от черепа: каждый один раз спасает кон
  private doubleTakes = 0; // «двойное забрать»: каждое удваивает один внос кона
  private bonusSpins = 0; // купленные «+2 прокрутки»: добавятся, когда начнётся раунд
  private fewerSkullRounds = 0; // купленные «Меньше черепов»: сколько раундов череп будет выпадать реже
  private isSpinning = false; // барабаны крутятся — ввод игнорируется
  private isRoundOver = false; // долг закрыт, висит «ДОЛГ ЗАКРЫТ!» — ждём следующий раунд
  private skullWeight = 0; // вес черепа в этом раунде: «Меньше черепов» его уменьшает
  private isShopOpen = false; // открыт магазин усилений — крутить и забирать нельзя
  private boughtInShop: PowerUp['id'][] = []; // что уже куплено в этот заход в магазин
  private isGameOver = false; // прокрутки кончились, а долг не закрыт
  private canRestartWithSpace = false; // Пробел на экране проигрыша срабатывает не сразу

  // Лампочки на корпусе автомата.
  private lampTick = 0; // сколько раз лампочки уже обновились
  private lampSpeed = LAMP_IDLE_SPEED; // через сколько тиков огонёк сдвигается
  private lampColor = LAMP_GOLD; // каким цветом горят лампочки сейчас
  private lampResetTimer?: Phaser.Time.TimerEvent; // когда вернуть лампочки в спокойный режим

  // Объекты на экране.
  private reelBoxes: Phaser.GameObjects.Rectangle[] = [];
  private reelSigns: Phaser.GameObjects.Text[] = [];
  private reelGlares: Phaser.GameObjects.Rectangle[] = []; // блики «стекла» на барабанах
  private lamps: Phaser.GameObjects.Arc[] = [];
  private coinEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debtBarFill!: Phaser.GameObjects.Rectangle;
  private debtBarShine!: Phaser.GameObjects.Rectangle; // светлый блик сверху заполнения
  private debtText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private spinsText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private skullChanceText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private doubleText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private potText!: Phaser.GameObjects.Text;
  private spinButton!: Button;
  private takeButton!: Button;
  private shopLayer?: Phaser.GameObjects.Container; // магазин целиком: всё, что в нём нарисовано

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetState();
    drawBackground(this);
    createCoinTexture(this);
    createIconTextures(this);
    this.drawHeader();
    this.drawDebtBar();
    this.drawLeftPanel();
    this.drawMachine();
    this.drawReels();
    this.drawPaytable();
    this.drawMessageAndPot();
    this.drawButtons();
    this.createCoinEmitter();
    this.setupKeyboard();
    this.refreshHud();
  }

  private resetState(): void {
    this.round = 1;
    this.debt = debtForRound(1);
    this.paid = 0;
    this.spinsLeft = SPINS_PER_ROUND;
    this.pot = 0;
    this.streak = 0;
    this.record = loadRecord();
    this.shields = 0;
    this.doubleTakes = 0;
    this.bonusSpins = 0;
    this.fewerSkullRounds = 0;
    this.skullWeight = SKULL_WEIGHT;
    this.isSpinning = false;
    this.isRoundOver = false;
    this.isShopOpen = false;
    this.isGameOver = false;
    this.canRestartWithSpace = false;
    this.lampTick = 0;
    this.lampSpeed = LAMP_IDLE_SPEED;
    this.lampColor = LAMP_GOLD;
    this.lampResetTimer = undefined;
  }

  // ---------- Отрисовка ----------

  private drawHeader(): void {
    this.addText(CENTER_X, 14, 'ДОЛГОВАЯ ЯМА', {
      fontSize: '32px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
      stroke: '#7c2d12',
      strokeThickness: 6,
      shadow: { offsetY: 3, color: '#000000', fill: true, stroke: true },
    }).setOrigin(0.5, 0);
    this.addText(CENTER_X, 58, 'Закрой долг, пока есть прокрутки. 💀 сжигает кон.', {
      fontSize: '17px',
      color: '#cbd5e1',
    }).setOrigin(0.5, 0);
  }

  private drawDebtBar(): void {
    const innerWidth = DEBT_BAR_WIDTH - 8; // заполнение чуть уже рамки
    const left = CENTER_X - innerWidth / 2;
    this.add
      .rectangle(CENTER_X, DEBT_BAR_Y, DEBT_BAR_WIDTH, DEBT_BAR_HEIGHT, 0x0b1120)
      .setRounded(10)
      .setStrokeStyle(3, 0xb45309);
    // Заполненная часть растёт от левого края: scaleX — доля внесённого (от 0 до 1). Сверху на ней светлый блик.
    this.debtBarFill = this.add
      .rectangle(left, DEBT_BAR_Y, innerWidth, DEBT_BAR_HEIGHT - 8, DEBT_BAR_COLOR)
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    this.debtBarShine = this.add
      .rectangle(left, DEBT_BAR_Y - 5, innerWidth, 5, 0xffffff, 0.3)
      .setOrigin(0, 0.5)
      .setScale(0, 1);
    this.debtText = this.addText(CENTER_X, DEBT_BAR_Y, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      stroke: '#0f172a',
      strokeThickness: 4,
    }).setOrigin(0.5);
  }

  /** Левая панель: в плашке номер раунда, ниже прокрутки, рекорд и купленные усиления. */
  private drawLeftPanel(): void {
    drawPanel(this, LEFT_PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT);
    const top = PANEL_Y - PANEL_HEIGHT / 2;
    const textX = LEFT_PANEL_X - PANEL_WIDTH / 2 + 14;
    this.roundText = this.addText(LEFT_PANEL_X, top + 18, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5);
    this.spinsText = this.addText(textX, top + 44, '', { fontSize: '20px', fontStyle: 'bold' });
    this.recordText = this.addText(textX, top + 76, '', { fontSize: '17px', color: MUTED_TEXT });
    // Купленные усиления: видны, только пока они есть.
    this.skullChanceText = this.addText(textX, top + 116, '', { fontSize: '16px', color: VIOLET_TEXT });
    this.shieldText = this.addText(textX, top + 140, '', { fontSize: '16px', color: BLUE_TEXT });
    this.doubleText = this.addText(textX, top + 164, '', { fontSize: '16px', color: GREEN_TEXT });
  }

  /** Корпус автомата и лампочки вокруг барабанов. Лампочки обновляются по таймеру. */
  private drawMachine(): void {
    drawCabinet(this, CENTER_X, REEL_Y, CABINET_WIDTH, CABINET_HEIGHT);
    this.lamps = createLamps(this, CENTER_X, REEL_Y, CABINET_WIDTH, CABINET_HEIGHT);
    this.time.addEvent({ delay: LAMP_TICK, loop: true, callback: () => this.tickLamps() });
  }

  private drawReels(): void {
    this.reelBoxes = [];
    this.reelSigns = [];
    this.reelGlares = [];
    for (const x of REEL_XS) {
      this.reelBoxes.push(this.add.rectangle(x, REEL_Y, REEL_SIZE, REEL_SIZE).setRounded(18));
      this.reelSigns.push(
        this.addText(x, REEL_Y, '', {
          fontSize: '84px',
          fontStyle: 'bold',
          padding: { y: 12 }, // запас, чтобы эмодзи не обрезались сверху и снизу
          shadow: { offsetY: 4, blur: 8, color: 'rgba(0, 0, 0, 0.45)', fill: true }, // символ не сливается с фоном
        }).setOrigin(0.5),
      );
      // Блик «стекла» в верхней части барабана.
      this.reelGlares.push(this.add.rectangle(x, REEL_Y - 50, REEL_SIZE - 24, 28, 0xffffff, 0.08).setRounded(12));
    }
    // Пока не крутили — на барабанах первые три символа.
    for (let reel = 0; reel < REEL_XS.length; reel++) this.showSymbol(reel, SYMBOLS[reel]);
  }

  /** Таблица выплат справа: значки ■■ (пара) и ■■■ (три), строка на каждый символ, у черепа — «кон сгорает». */
  private drawPaytable(): void {
    drawPanel(this, RIGHT_PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT);
    const top = PANEL_Y - PANEL_HEIGHT / 2;
    this.addText(RIGHT_PANEL_X, top + 18, 'ВЫПЛАТЫ', { fontSize: '18px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0.5);
    drawMatchIcon(this, PAIR_COLUMN_X, top + 46, 2);
    drawMatchIcon(this, THREE_COLUMN_X, top + 46, 3);
    SYMBOLS.forEach((symbol, row) => {
      const y = top + 66 + row * 24;
      if (row % 2 === 0) this.add.rectangle(RIGHT_PANEL_X, y, PANEL_WIDTH - 16, 22, 0xffffff, 0.05).setRounded(6);
      this.drawSwatch(SWATCH_X, y, symbol);
      if (isSkull(symbol)) {
        this.addText(SWATCH_X + 20, y, 'кон сгорает', { fontSize: '15px', color: RED_TEXT }).setOrigin(0, 0.5);
      } else {
        this.addText(PAIR_COLUMN_X, y, String(symbol.pair), { fontSize: '16px' }).setOrigin(0.5);
        this.addText(THREE_COLUMN_X, y, String(symbol.three), {
          fontSize: '16px',
          fontStyle: 'bold',
          color: GOLD_TEXT,
        }).setOrigin(0.5);
      }
    });
  }

  /** Маленький «барабан» для таблицы выплат: цвет фона, рамка и знак символа. */
  private drawSwatch(x: number, y: number, symbol: SlotSymbol): void {
    this.add.rectangle(x, y, 22, 22, symbol.color).setRounded(5).setStrokeStyle(2, borderColor(symbol));
    this.addText(x, y, symbol.sign, { fontSize: '14px', fontStyle: 'bold', padding: { y: 3 } }).setOrigin(0.5);
  }

  private drawMessageAndPot(): void {
    this.messageText = this.addText(CENTER_X, MESSAGE_Y, 'Выигрыши копятся на кону', {
      fontSize: '22px',
      color: '#e2e8f0',
    }).setOrigin(0.5);
    // «НА КОНУ» — на табличке с монеткой слева.
    drawPlaque(this, CENTER_X, POT_Y, 300, 46);
    this.add.image(CENTER_X - 124, POT_Y, COIN_TEXTURE).setScale(1.3);
    this.potText = this.addText(CENTER_X + 12, POT_Y, '', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5);
  }

  private drawButtons(): void {
    this.spinButton = this.makeButton(SPIN_BUTTON_X, BUTTON_Y, SPIN_COLOR, 'Пробел', () => this.spin(), LEVER_ICON);
    this.takeButton = this.makeButton(TAKE_BUTTON_X, BUTTON_Y, TAKE_COLOR, 'Enter', () => this.take(), COINS_ICON);
  }

  /**
   * Большая кнопка автомата: тень, корпус с золотой рамкой, блик сверху, иконка (если есть),
   * крупная надпись и под ней клавиша. Нажимается и мышью, и пальцем.
   */
  private makeButton(x: number, y: number, color: number, keyHint: string, onPress: () => void, icon?: string): Button {
    const shadow = this.add.rectangle(x, y + BUTTON_PRESS, BUTTON_WIDTH, BUTTON_HEIGHT, 0x000000, 0.45).setRounded(18);
    // Всё остальное рисуем относительно центра кнопки и кладём в контейнер.
    const box = this.add.rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, color).setRounded(18).setStrokeStyle(3, BUTTON_BORDER);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', onPress);
    const gloss = this.add.rectangle(0, -BUTTON_HEIGHT / 4, BUTTON_WIDTH - 16, BUTTON_HEIGHT / 2 - 8, 0xffffff, 0.16).setRounded(12);
    const textX = icon ? 24 : 0; // с иконкой надписи сдвинуты вправо
    const label = this.addText(textX, -9, '', {
      fontSize: '24px',
      fontStyle: 'bold',
      stroke: 'rgba(0, 0, 0, 0.35)',
      strokeThickness: 3,
    }).setOrigin(0.5);
    const key = this.addText(textX, 21, keyHint, { fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }).setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [box, gloss, label, key];
    if (icon) parts.push(this.add.image(-BUTTON_WIDTH / 2 + 44, 0, icon));
    const face = this.add.container(x, y, parts);
    return { shadow, face, label, y };
  }

  /** Кнопка «вдавливается»: лицо опускается на тень и возвращается. */
  private pressButton(button: Button): void {
    this.tweens.killTweensOf(button.face);
    button.face.y = button.y;
    this.tweens.add({ targets: button.face, y: button.y + BUTTON_PRESS, duration: 70, yoyo: true });
  }

  /** this.add.text с нашим шрифтом (в нём есть шрифты эмодзи). */
  private addText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: FONT, ...style });
  }

  /** Показать символ на барабане: цвет фона, рамка (у черепа красная) и знак. */
  private showSymbol(reel: number, symbol: SlotSymbol): void {
    this.reelBoxes[reel].setFillStyle(symbol.color).setStrokeStyle(4, borderColor(symbol));
    this.reelSigns[reel].setText(symbol.sign);
  }

  /** Обновить надписи и кнопки по текущему состоянию. */
  private refreshHud(): void {
    this.debtText.setText(`ДОЛГ ${this.paid} / ${this.debt}`);
    this.fillDebtBar(Math.min(this.paid / this.debt, 1));
    this.roundText.setText(`РАУНД ${this.round}`);
    this.spinsText.setText(`Прокрутки: ${this.spinsLeft}`);
    this.spinsText.setColor(this.spinsLeft <= LOW_SPINS ? RED_TEXT : '#ffffff');
    this.recordText.setText(`Рекорд: ${this.record}`);
    const skullChance = Math.round(100 * skullLineChance(this.skullWeight));
    this.skullChanceText.setText(`Череп: ${skullChance}%`).setVisible(this.skullWeight < SKULL_WEIGHT);
    this.shieldText.setText(`Щит: ${this.shields}`).setVisible(this.shields > 0);
    this.doubleText.setText(`Забрать ×${TAKE_BOOST}: ${this.doubleTakes}`).setVisible(this.doubleTakes > 0);
    this.potText.setText(`НА КОНУ: ${this.pot}`);
    this.spinButton.label.setText(`КРУТИТЬ ×${multiplierForStreak(this.streak)}`);
    this.takeButton.label.setText(this.takeLabel());
    this.setButtonEnabled(this.spinButton, this.canAct());
    this.setButtonEnabled(this.takeButton, this.canAct() && this.pot > 0);
  }

  /** Надпись на кнопке «ЗАБРАТЬ»: сумма кона и ×2, если есть «двойное забрать». */
  private takeLabel(): string {
    const boost = this.doubleTakes > 0 ? ` ×${TAKE_BOOST}` : '';
    return `ЗАБРАТЬ ${this.pot}${boost}`;
  }

  /** Полоса долга (и блик на ней) плавно доезжает до нужной доли (от 0 до 1). */
  private fillDebtBar(progress: number): void {
    if (this.debtBarFill.scaleX === progress) return;
    const parts = [this.debtBarFill, this.debtBarShine];
    this.tweens.killTweensOf(parts);
    this.tweens.add({ targets: parts, scaleX: progress, duration: 400, ease: 'Cubic.easeOut' });
  }

  /** Недоступная кнопка затемнена. Сами действия всё равно проверяют, можно ли их сделать. */
  private setButtonEnabled(button: Button, enabled: boolean): void {
    const alpha = enabled ? 1 : 0.35;
    button.shadow.setAlpha(alpha);
    button.face.setAlpha(alpha);
  }

  // ---------- Обратная связь ----------

  /** Огоньки бегут по лампочкам: горит каждая третья, огонёк сдвигается раз в lampSpeed тиков. */
  private tickLamps(): void {
    this.lampTick += 1;
    const shift = Math.floor(this.lampTick / this.lampSpeed);
    this.lamps.forEach((lamp, index) => lamp.setFillStyle((index + shift) % 3 === 0 ? this.lampColor : LAMP_OFF));
  }

  /** На время перекрасить лампочки и пустить огоньки быстрее: выигрыш, череп, щит, закрытый долг. */
  private flashLamps(color: number, duration: number): void {
    this.lampColor = color;
    this.lampSpeed = 1;
    this.lampResetTimer?.remove();
    this.lampResetTimer = this.time.delayedCall(duration, () => {
      this.lampColor = LAMP_GOLD;
      this.lampSpeed = LAMP_IDLE_SPEED;
    });
  }

  /** Монетки-частицы: сами не летят, только по команде explode() — веером вверх, потом падают. */
  private createCoinEmitter(): void {
    this.coinEmitter = this.add
      .particles(0, 0, COIN_TEXTURE, {
        speed: { min: 180, max: 380 },
        angle: { min: 210, max: 330 },
        gravityY: 700,
        lifespan: 1000,
        scale: { start: 1, end: 0.5 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(COIN_DEPTH);
  }

  /** Монетки из барабанов: чем больше выигрыш, тем больше монет (но не больше 40). */
  private burstCoins(gain: number): void {
    this.coinEmitter.explode(Math.min(6 + Math.floor(gain / 5), 40), CENTER_X, REEL_Y);
  }

  /** Надпись всплывает над барабанами: поднимается и тает. */
  private showPopup(text: string, color: string): void {
    const y = REEL_Y - 30;
    const label = this.addText(CENTER_X, y, text, { ...POPUP_STYLE, color })
      .setOrigin(0.5)
      .setDepth(POPUP_DEPTH);
    this.tweens.add({
      targets: label,
      y: y - 60,
      alpha: { value: 0, delay: 600, duration: 500 },
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** «+36» летит с кона в полосу долга. */
  private flyToDebtBar(amount: number): void {
    const label = this.addText(CENTER_X, POT_Y, `+${amount}`, { ...POPUP_STYLE, color: GREEN_TEXT })
      .setOrigin(0.5)
      .setDepth(POPUP_DEPTH);
    this.tweens.add({
      targets: label,
      y: DEBT_BAR_Y,
      alpha: { value: 0, delay: 350, duration: 150 },
      duration: 500,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        label.destroy();
        this.coinEmitter.explode(8, CENTER_X, DEBT_BAR_Y); // монетки брызгают из полосы долга
      },
    });
  }

  /** «НА КОНУ» коротко пульсирует. */
  private pulsePot(): void {
    this.tweens.killTweensOf(this.potText);
    this.potText.setScale(1);
    this.tweens.add({ targets: this.potText, scale: 1.25, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Подсветить барабаны толстой рамкой: золотой при выигрыше, красной при черепе. */
  private highlightReels(reels: number[], color: number): void {
    for (const reel of reels) this.reelBoxes[reel].setStrokeStyle(8, color);
  }

  /** Удар черепа: красная вспышка и лёгкая тряска экрана. */
  private flashAndShake(): void {
    const camera = this.cameras.main;
    camera.flashEffect.alpha = 0.5; // полупрозрачная вспышка, а не сплошной красный экран
    camera.flash(300, 239, 68, 68);
    camera.shake(250, 0.008);
  }

  /** Крупное «ДОЛГ ЗАКРЫТ!» поверх барабанов: выскакивает и через DEBT_CLOSED_TIME тает. */
  private showDebtClosedBanner(): void {
    this.flashLamps(LAMP_GREEN, DEBT_CLOSED_TIME);
    const strip = this.add.rectangle(CENTER_X, REEL_Y, 960, 150, 0x052e16, 0.92).setDepth(BANNER_DEPTH);
    const label = this.addText(CENTER_X, REEL_Y, 'ДОЛГ ЗАКРЫТ!', {
      fontSize: '72px',
      fontStyle: 'bold',
      color: GREEN_TEXT,
      stroke: '#052e16',
      strokeThickness: 8,
    })
      .setOrigin(0.5)
      .setDepth(BANNER_DEPTH)
      .setScale(0.5);
    this.tweens.add({ targets: label, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: [strip, label],
      alpha: 0,
      delay: DEBT_CLOSED_TIME,
      duration: 250,
      onComplete: () => {
        strip.destroy();
        label.destroy();
      },
    });
  }

  /** Экран проигрыша: затемнение, итог, рекорд и кнопка «ЗАНОВО». */
  private showGameOverScreen(): void {
    const shade = this.add.rectangle(CENTER_X, CENTER_Y, 960, 640, 0x000000, 0.9);
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const title = this.addText(CENTER_X, 200, 'ДОЛГ НЕ ЗАКРЫТ — ты в яме', {
      fontSize: '42px',
      fontStyle: 'bold',
      color: RED_TEXT,
    }).setOrigin(0.5);
    const score = this.addText(CENTER_X, 272, `Закрыто долгов: ${this.closedDebts()}`, {
      fontSize: '30px',
    }).setOrigin(0.5);
    const record = this.addText(CENTER_X, 318, `Рекорд: ${this.record}`, {
      fontSize: '24px',
      color: GOLD_TEXT,
    }).setOrigin(0.5);
    const restart = this.makeButton(CENTER_X, 430, SPIN_COLOR, 'R / Пробел', () => this.restartGame());
    restart.label.setText('ЗАНОВО');

    const parts = [shade, title, score, record, restart.shadow, restart.face];
    for (const part of parts) part.setDepth(GAME_OVER_DEPTH).setAlpha(0);
    this.tweens.add({ targets: parts, alpha: 1, duration: 400 });

    this.time.delayedCall(RESTART_SPACE_DELAY, () => {
      this.canRestartWithSpace = true;
    });
  }

  // ---------- Ввод ----------

  private setupKeyboard(): void {
    this.onKey('SPACE', () => this.onSpace());
    this.onKey('ENTER', () => this.onEnter());
    this.onKey('R', () => {
      if (this.isGameOver) this.restartGame();
    });
    // Клавиши 1–4 — купить усиление в магазине.
    this.onKey('ONE', () => this.buyPowerUp(POWER_UPS[0]));
    this.onKey('TWO', () => this.buyPowerUp(POWER_UPS[1]));
    this.onKey('THREE', () => this.buyPowerUp(POWER_UPS[2]));
    this.onKey('FOUR', () => this.buyPowerUp(POWER_UPS[3]));
  }

  /** Подписка на клавишу. Автоповтор (клавишу держат) пропускаем: одно нажатие — одно действие. */
  private onKey(key: string, action: () => void): void {
    this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
      if (!event.repeat) action();
    });
  }

  /** Пробел: в игре — прокрутка, после проигрыша — «заново», но не раньше чем через 0,8 с. */
  private onSpace(): void {
    if (!this.isGameOver) this.spin();
    else if (this.canRestartWithSpace) this.restartGame();
  }

  /** Enter: в магазине — «оставить излишек», в игре — «забрать». */
  private onEnter(): void {
    if (this.isShopOpen) this.closeShop();
    else this.take();
  }

  /** Можно ли сейчас крутить или забирать. */
  private canAct(): boolean {
    return !this.isSpinning && !this.isRoundOver && !this.isShopOpen && !this.isGameOver;
  }

  private restartGame(): void {
    this.scene.restart();
  }

  // ---------- Прокрутка ----------

  /** Прокрутка: тратит одну прокрутку, барабаны мелькают и останавливаются по очереди. */
  private spin(): void {
    if (!this.canAct()) return;
    this.pressButton(this.spinButton);
    this.isSpinning = true;
    this.spinsLeft -= 1;
    const multiplier = multiplierForStreak(this.streak); // множитель запоминаем до прокрутки
    this.messageText.setText(''); // пока крутится, строка пустая — смотрим на барабаны
    this.refreshHud();

    const line = spinLine(this.skullWeight); // результат известен сразу, анимация только показывает его
    REEL_STOP_TIMES.forEach((stopTime, reel) => this.spinReel(reel, line[reel], stopTime));

    const lastStopTime = Math.max(...REEL_STOP_TIMES);
    this.time.delayedCall(lastStopTime + RESULT_PAUSE, () => this.finishSpin(line, multiplier));
  }

  /** Один барабан: мелькает случайными символами, в stopTime встаёт на итоговый символ. */
  private spinReel(reel: number, finalSymbol: SlotSymbol, stopTime: number): void {
    const flicker = this.time.addEvent({
      delay: FLICKER_DELAY,
      loop: true,
      callback: () => this.showSymbol(reel, randomSymbol(this.skullWeight)),
    });
    this.time.delayedCall(stopTime, () => {
      flicker.remove();
      this.showSymbol(reel, finalSymbol);
      this.bounceReel(reel);
    });
  }

  /** Короткий подскок барабана при остановке. */
  private bounceReel(reel: number): void {
    this.tweens.add({
      targets: [this.reelBoxes[reel], this.reelSigns[reel], this.reelGlares[reel]],
      y: REEL_Y - BOUNCE_HEIGHT,
      duration: 90,
      ease: 'Quad.easeOut',
      yoyo: true,
    });
  }

  /** Итог прокрутки: череп сжигает кон, иначе выигрыш × множитель идёт на кон. */
  private finishSpin(line: Line, multiplier: number): void {
    this.isSpinning = false;
    const result = evaluateLine(line);
    if (result.kind === 'skull' && this.canShieldBlock()) {
      this.blockSkull(result);
    } else if (result.kind === 'skull') {
      this.burnPot(result);
    } else {
      this.streak += 1; // серия растёт с каждой прокруткой без черепа, даже без выигрыша
      this.addToPot(line, result, multiplier);
    }
    if (this.spinsLeft === 0) this.endOfSpins();
    this.refreshHud();
  }

  /** Череп: кон сгорает, серия обрывается — следующая прокрутка снова ×1. */
  private burnPot(result: LineResult): void {
    const lost = this.pot;
    this.pot = 0;
    this.streak = 0;
    this.highlightReels(result.reels, SKULL_BORDER);
    this.flashAndShake();
    this.flashLamps(LAMP_RED, 700);
    this.messageText.setText(lost > 0 ? `💀 Кон сгорел: −${lost}` : '💀 Череп!');
  }

  /** Щит срабатывает, только если есть что спасать: щит в запасе и кон не пуст. */
  private canShieldBlock(): boolean {
    return this.shields > 0 && this.pot > 0;
  }

  /** Щит принимает удар черепа: кон цел, серия продолжается, щит ломается. */
  private blockSkull(result: LineResult): void {
    this.shields -= 1;
    this.streak += 1; // череп стал пустой прокруткой
    this.highlightReels(result.reels, SHIELD_BORDER);
    this.showPopup('ЩИТ!', BLUE_TEXT);
    this.flashLamps(LAMP_BLUE, 700);
    this.messageText.setText('Щит спас кон!');
  }

  /** Выигрыш × множитель идёт на кон. */
  private addToPot(line: Line, result: LineResult, multiplier: number): void {
    if (result.kind === 'nothing') {
      this.messageText.setText('Пусто'); // множитель следующей прокрутки виден на кнопке
      return;
    }
    const gain = winWithMultiplier(result.win, multiplier);
    this.pot += gain;
    const winText = formatWin(result.win, multiplier, gain);
    const combo = result.kind === 'three' ? 'Три' : 'Пара';
    const sign = line[result.reels[0]].sign;
    this.messageText.setText(`${combo} ${sign}!`); // сумма всплывает над барабанами
    this.highlightReels(result.reels, WIN_BORDER);
    this.showPopup(winText, GOLD_TEXT);
    this.burstCoins(gain);
    this.flashLamps(LAMP_GOLD, 900);
    this.pulsePot();
  }

  // ---------- Забрать, долг и раунды ----------

  /** «Забрать»: кон уходит в долг. Бесплатно, но множитель снова ×1. */
  private take(): void {
    if (!this.canAct() || this.pot === 0) return;
    this.pressButton(this.takeButton);
    this.payPot();
    if (this.isDebtPaid()) this.closeDebt();
    this.refreshHud();
  }

  /** Кон переходит во «внесено», серия обрывается. «Двойное забрать» удваивает этот внос. */
  private payPot(): void {
    let amount = this.pot;
    const boosted = this.doubleTakes > 0;
    if (boosted) {
      this.doubleTakes -= 1;
      amount *= TAKE_BOOST;
    }
    this.paid += amount;
    this.pot = 0;
    this.streak = 0;
    this.messageText.setText(boosted ? `+${amount} внесено (кон ×${TAKE_BOOST})` : `+${amount} внесено`);
    this.flyToDebtBar(amount);
  }

  /** Долг закрыт, как только внесено не меньше долга. */
  private isDebtPaid(): boolean {
    return this.paid >= this.debt;
  }

  /** Долг закрыт: «+36» долетает до полосы, на секунду крупно «ДОЛГ ЗАКРЫТ!», потом следующий раунд. */
  private closeDebt(): void {
    this.isRoundOver = true;
    this.time.delayedCall(BANNER_DELAY, () => this.showDebtClosedBanner());
    this.time.delayedCall(BANNER_DELAY + DEBT_CLOSED_TIME, () => this.startNextRound());
  }

  /** Долг закрыт — следующий раунд: новый долг, множитель ×1, излишек идёт в новый долг. Сначала магазин. */
  private startNextRound(): void {
    this.isRoundOver = false;
    this.paid -= this.debt; // остаётся излишек
    this.round += 1;
    this.debt = debtForRound(this.round);
    this.streak = 0;
    this.updateRecord();
    this.messageText.setText(`Раунд ${this.round} · новый долг ${this.debt}`);
    this.openShop(); // после каждого закрытого долга — магазин
    this.refreshHud();
  }

  /** Раунд начинается по-настоящему (после магазина): прокрутки заново, бонусы раунда срабатывают. */
  private beginRound(): void {
    this.spinsLeft = SPINS_PER_ROUND + this.bonusSpins; // оставшиеся прокрутки прошлого раунда сгорают
    this.bonusSpins = 0;
    this.skullWeight = this.fewerSkullRounds > 0 ? REDUCED_SKULL_WEIGHT : SKULL_WEIGHT;
    if (this.fewerSkullRounds > 0) this.fewerSkullRounds -= 1;
  }

  /** Прокрутки кончились: кон забирается сам. Хватило на долг — следующий раунд, иначе конец игры. */
  private endOfSpins(): void {
    if (this.pot > 0) this.payPot();
    if (this.isDebtPaid()) this.closeDebt();
    else this.gameOver();
  }

  /** Конец игры: ввод закрыт, через короткую паузу — экран проигрыша. */
  private gameOver(): void {
    this.isGameOver = true;
    this.time.delayedCall(GAME_OVER_DELAY, () => this.showGameOverScreen());
  }

  /** Счёт — сколько долгов закрыто. */
  private closedDebts(): number {
    return this.round - 1;
  }

  /** Новый рекорд сохраняем сразу, как только закрыто больше долгов, чем в лучшей игре. */
  private updateRecord(): void {
    if (this.closedDebts() <= this.record) return;
    this.record = this.closedDebts();
    saveRecord(this.record);
  }

  // ---------- Магазин усилений ----------

  /** Магазин после закрытого долга: излишек можно потратить на усиления или оставить в счёт долга. */
  private openShop(): void {
    this.isShopOpen = true;
    this.boughtInShop = [];
    this.drawShop();
  }

  /** Нарисовать магазин заново (после покупки меняются излишек и карточки). Всё лежит в одном контейнере-слое. */
  private drawShop(): void {
    this.clearShop();
    const layer = this.add.container(0, 0).setDepth(SHOP_DEPTH);
    this.shopLayer = layer;
    const top = SHOP_Y - SHOP_HEIGHT / 2;

    const shade = this.add.rectangle(CENTER_X, CENTER_Y, 960, 640, 0x000000, 0.75);
    shade.setInteractive(); // ловит клики, чтобы кнопки под магазином не нажимались
    layer.add(shade);
    layer.add(drawPanel(this, CENTER_X, SHOP_Y, SHOP_WIDTH, SHOP_HEIGHT));
    layer.add(this.addText(CENTER_X, top + 18, 'МАГАЗИН', { fontSize: '20px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0.5));
    layer.add(this.drawWallet(top + 64));
    layer.add(this.addText(CENTER_X, top + 100, this.shopInfoText(), { fontSize: '16px', color: MUTED_TEXT }).setOrigin(0.5));
    POWER_UPS.forEach((powerUp, index) => layer.add(this.drawShopCard(powerUp, index)));
    layer.add(this.drawStock(top + 388));
    const done = this.makeButton(CENTER_X, top + 456, TAKE_COLOR, 'Enter', () => this.closeShop());
    done.label.setText('ДАЛЬШЕ');
    layer.add([done.shadow, done.face]);
  }

  /** «Кошелёк»: монетка и крупное число — сколько излишка можно потратить. Стоит по центру. */
  private drawWallet(y: number): Phaser.GameObjects.Container {
    const amount = this.addText(0, 0, String(this.paid), { fontSize: '34px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0, 0.5);
    const coinSize = 32;
    const gap = 10;
    const width = coinSize + gap + amount.width;
    const coin = this.add.image(-width / 2 + coinSize / 2, 0, COIN_TEXTURE).setScale(coinSize / 20);
    amount.setX(-width / 2 + coinSize + gap);
    return this.add.container(CENTER_X, y, [coin, amount]);
  }

  /** Карточка усиления: клавиша, иконка, название, подсказка и ценник. Наведение — подсветка, купленное — штамп. */
  private drawShopCard(powerUp: PowerUp, index: number): Phaser.GameObjects.Container {
    const x = CENTER_X + (index - (POWER_UPS.length - 1) / 2) * SHOP_CARD_STEP; // карточки в ряд по центру
    const bought = this.boughtInShop.includes(powerUp.id);
    const available = this.canBuy(powerUp);
    const halfWidth = SHOP_CARD_WIDTH / 2;
    const halfHeight = SHOP_CARD_HEIGHT / 2;

    // Всё рисуем относительно центра карточки и кладём в контейнер — так её можно увеличить целиком.
    const bg = this.add
      .rectangle(0, 0, SHOP_CARD_WIDTH, SHOP_CARD_HEIGHT, available ? 0x1e293b : 0x111827)
      .setRounded(16)
      .setStrokeStyle(3, bought ? DEBT_BAR_COLOR : CARD_BORDER);
    const keyCap = this.add
      .rectangle(-halfWidth + 22, -halfHeight + 22, 24, 24, 0x0f172a)
      .setRounded(5)
      .setStrokeStyle(2, 0x64748b);
    const keyLabel = this.addText(-halfWidth + 22, -halfHeight + 22, String(index + 1), {
      fontSize: '14px',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    const icon = this.add.image(0, -halfHeight + 58, POWER_UP_ICONS[powerUp.id]).setScale(1.4);
    const name = this.addText(0, -halfHeight + 108, powerUp.name, { fontSize: '17px', fontStyle: 'bold' }).setOrigin(0.5);
    const hint = this.addText(0, -halfHeight + 134, powerUp.hint, { fontSize: '14px', color: MUTED_TEXT }).setOrigin(0.5);
    // Ценник: тёмная «таблетка» с монеткой и ценой.
    const tag = this.add.rectangle(0, halfHeight - 30, 96, 32, 0x0b1120).setRounded(16).setStrokeStyle(2, 0xb45309);
    const coin = this.add.image(-22, halfHeight - 30, COIN_TEXTURE);
    const price = this.addText(12, halfHeight - 30, String(powerUp.price), {
      fontSize: '20px',
      fontStyle: 'bold',
      color: GOLD_TEXT,
    }).setOrigin(0.5);
    const card = this.add.container(x, SHOP_CARD_Y, [bg, keyCap, keyLabel, icon, name, hint, tag, coin, price]);

    if (bought) {
      for (const part of [icon, name, hint, tag, coin, price]) part.setAlpha(0.5);
      card.add(this.drawBoughtStamp());
    } else if (!available) {
      for (const part of [keyLabel, icon, name, hint, coin, price]) part.setAlpha(0.35);
    }

    bg.setInteractive({ useHandCursor: available });
    bg.on('pointerdown', () => this.buyPowerUp(powerUp));
    if (available) {
      // Наведение мышью: карточка чуть больше, рамка золотая.
      bg.on('pointerover', () => {
        card.setScale(1.05);
        bg.setStrokeStyle(3, BUTTON_BORDER);
      });
      bg.on('pointerout', () => {
        card.setScale(1);
        bg.setStrokeStyle(3, CARD_BORDER);
      });
    }
    return card;
  }

  /** Штамп «КУПЛЕНО» поверх карточки — наклонённый, как печать. */
  private drawBoughtStamp(): Phaser.GameObjects.Text {
    return this.addText(0, -6, 'КУПЛЕНО', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: GREEN_TEXT,
      stroke: '#052e16',
      strokeThickness: 6,
    })
      .setOrigin(0.5)
      .setAngle(-14);
  }

  /** Что будет с излишком — строка под «кошельком». */
  private shopInfoText(): string {
    if (this.paid === 0) return 'Излишка нет — переплати долг, чтобы покупать';
    if (this.isDebtPaid()) return `Излишка хватит и на новый долг ${this.debt}`;
    return 'Что не потратишь — уйдёт в долг';
  }

  /** Запас бонусов иконками: что куплено и ещё не сработало. Бонусы не пропадают, даже если долги закрываются подряд. */
  private drawStock(y: number): Phaser.GameObjects.Container {
    const row = this.add.container(CENTER_X, y);
    const items: [string, string][] = [];
    if (this.bonusSpins > 0) items.push([LEVER_ICON, `+${this.bonusSpins}`]);
    if (this.shields > 0) items.push([SHIELD_ICON, `×${this.shields}`]);
    if (this.fewerSkullRounds > 0) items.push([SKULL_DOWN_ICON, `×${this.fewerSkullRounds}`]);
    if (this.doubleTakes > 0) items.push([COINS_ICON, `×${this.doubleTakes}`]);
    if (items.length === 0) return row;

    const label = this.addText(0, 0, 'В запасе:', { fontSize: '16px', color: MUTED_TEXT }).setOrigin(1, 0.5);
    row.add(label);
    let x = 14;
    for (const [icon, count] of items) {
      row.add(this.add.image(x + 14, 0, icon).setScale(0.75));
      const text = this.addText(x + 32, 0, count, { fontSize: '17px', fontStyle: 'bold' }).setOrigin(0, 0.5);
      row.add(text);
      x += 32 + text.width + 16;
    }
    row.setX(CENTER_X - (x - label.width) / 2); // весь ряд — по центру
    return row;
  }

  /** Можно ли купить: магазин открыт, это усиление в этот заход ещё не брали и излишка хватает. */
  private canBuy(powerUp: PowerUp): boolean {
    return this.isShopOpen && !this.boughtInShop.includes(powerUp.id) && this.paid >= powerUp.price;
  }

  /** Купить усиление: цена вычитается из излишка, магазин перерисовывается. Выход — кнопкой «ДАЛЬШЕ». */
  private buyPowerUp(powerUp: PowerUp): void {
    if (!this.canBuy(powerUp)) return;
    this.paid -= powerUp.price;
    this.boughtInShop.push(powerUp.id);
    this.applyPowerUp(powerUp);
    this.drawShop();
    this.refreshHud();
  }

  /** Что даёт усиление. Всё ложится в запас: прокрутки и «Меньше черепов» — до начала раунда, щит и ×2 — пока не сработают. */
  private applyPowerUp(powerUp: PowerUp): void {
    if (powerUp.id === 'spins') this.bonusSpins += EXTRA_SPINS;
    if (powerUp.id === 'shield') this.shields += 1;
    if (powerUp.id === 'fewerSkulls') this.fewerSkullRounds += 1;
    if (powerUp.id === 'double') this.doubleTakes += 1;
  }

  /** Закрыть магазин. Излишка всё ещё хватает на долг — он закрывается (и потом снова магазин), иначе раунд начинается. */
  private closeShop(): void {
    if (!this.isShopOpen) return;
    this.isShopOpen = false;
    this.clearShop();
    if (this.isDebtPaid()) this.closeDebt();
    else this.beginRound();
    this.refreshHud();
  }

  /** Убрать магазин: контейнер-слой удаляется вместе со всем, что в нём лежит. */
  private clearShop(): void {
    this.shopLayer?.destroy();
    this.shopLayer = undefined;
  }
}

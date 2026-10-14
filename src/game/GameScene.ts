import Phaser from 'phaser';
import {
  debtForRound,
  GRID_COLUMNS,
  GRID_ROWS,
  isSkull,
  multiplierForStreak,
  randomSymbol,
  spinGrid,
  SPINS_PER_ROUND,
  SYMBOLS,
  winWithMultiplier,
  type Grid,
  type SlotSymbol,
} from './rules';
import { evaluateGrid, PATTERNS, type PatternHit, type SpinResult } from './patterns';
import {
  COIN_TEXTURE,
  COINS_ICON,
  createCoinTexture,
  createIconTextures,
  createLamps,
  createPatternTextures,
  createSymbolTextures,
  drawBackground,
  drawCabinet,
  drawPanel,
  drawPlaque,
  FONT,
  LAMP_OFF,
  LEVER_ICON,
  patternTexture,
  symbolTexture,
} from './decor';

// Раскладка экрана 960×640.
const CENTER_X = 480;
const CENTER_Y = 320;
const LEFT_PANEL_X = 113; // центр левой панели (раунд, прокрутки, рекорд)
const RIGHT_PANEL_X = 848; // центр правой панели (паттерны)
const PANEL_Y = 285;
const PANEL_WIDTH = 194;
const PANEL_HEIGHT = 230;
// Панель паттернов: два столбца, в каждой строке — схема паттерна и его ×.
const PATTERN_COLUMN_STEP = 92; // расстояние между центрами столбцов панели
const PATTERN_FIRST_Y = 52; // первая строка — на столько ниже верха панели
const PATTERN_ROW_STEP = 36;
const DEBT_BAR_Y = 108;
const DEBT_BAR_WIDTH = 480;
const DEBT_BAR_HEIGHT = 30;
const GRID_Y = 285; // центр сетки 5×3
const CELL_SIZE = 80;
const CELL_GAP = 6;
const CELL_STEP = CELL_SIZE + CELL_GAP; // от центра клетки до центра соседней
const CELL_RADIUS = 12; // скругление углов клетки
const CABINET_PADDING = 18; // корпус автомата выступает за сетку на столько с каждой стороны
const CABINET_WIDTH = GRID_COLUMNS * CELL_STEP - CELL_GAP + 2 * CABINET_PADDING;
const CABINET_HEIGHT = GRID_ROWS * CELL_STEP - CELL_GAP + 2 * CABINET_PADDING;
const MESSAGE_Y = 454;
const POT_Y = 496;
const BUTTON_Y = 573;
const BUTTON_WIDTH = 320;
const BUTTON_HEIGHT = 84;
const BUTTON_PRESS = 6; // на сколько px кнопка вдавливается (столько же видно её тени)
const SPIN_BUTTON_X = 310;
const TAKE_BUTTON_X = 650;

// Анимация прокрутки: время в мс, расстояние в px.
const FLICKER_DELAY = 60; // как часто меняются символы, пока столбец крутится
const FIRST_STOP_TIME = 400; // когда останавливается первый (левый) столбец
const STOP_STEP = 120; // каждый следующий столбец останавливается на столько позже
const RESULT_PAUSE = 200; // пауза между остановкой последнего столбца и итогом: подскок успевает закончиться
const BOUNCE_HEIGHT = 14; // высота подскока при остановке
const HIGHLIGHT_WIDTH = 6; // толщина рамки вокруг клеток найденного паттерна

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
const LAMP_GREEN = 0x4ade80;

const LOW_SPINS = 3; // столько прокруток или меньше — счётчик красный
const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage

// Слои: чем больше число, тем выше лежит объект.
const COIN_DEPTH = 5;
const POPUP_DEPTH = 10;
const BANNER_DEPTH = 20;
const GAME_OVER_DEPTH = 30;

// Внешний вид.
const SKULL_BORDER = 0xef4444; // рамка паттерна из черепов
const WIN_BORDER = 0xfde047; // рамка выигравшего паттерна
const SPIN_COLOR = 0xea580c;
const BUTTON_BORDER = 0xfbbf24;
const TAKE_COLOR = 0x16a34a;
const DEBT_BAR_COLOR = 0x22c55e;
const GOLD_TEXT = '#fde047';
const GREEN_TEXT = '#4ade80';
const RED_TEXT = '#f87171';
const MUTED_TEXT = '#94a3b8';
// Всплывающие надписи жирные и с тёмной обводкой, чтобы читались поверх сетки.
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

/** «+12» или, если множитель больше 1, «+4 ×3 = +12». */
function formatWin(win: number, multiplier: number, gain: number): string {
  return multiplier > 1 ? `+${win} ×${multiplier} = +${gain}` : `+${gain}`;
}

/** Центр клетки по горизонтали: столбцы стоят по центру экрана. */
function cellX(col: number): number {
  return CENTER_X + (col - (GRID_COLUMNS - 1) / 2) * CELL_STEP;
}

/** Центр клетки по вертикали: ряды стоят вокруг GRID_Y. */
function cellY(row: number): number {
  return GRID_Y + (row - (GRID_ROWS - 1) / 2) * CELL_STEP;
}

/** Когда останавливается столбец: левый первым, каждый следующий на STOP_STEP позже. */
function columnStopTime(col: number): number {
  return FIRST_STOP_TIME + col * STOP_STEP;
}

/** Символ клетки до первой прокрутки: платные символы вперемешку — (столбец + 2·ряд) по кругу, так паттернов нет. */
function startSymbol(row: number, col: number): SlotSymbol {
  const paying = SYMBOLS.filter((symbol) => !isSkull(symbol));
  return paying[(col + 2 * row) % paying.length];
}

/** Знаки символов, которые собрали паттерны, без повторов: «🍒 🔔». */
function winSigns(hits: PatternHit[]): string {
  const signs = new Set(hits.map((hit) => hit.symbol.sign));
  return [...signs].join(' ');
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
 * Правила (символы, сетка, долг, множитель) лежат в rules.ts, паттерны и подсчёт выигрыша — в patterns.ts.
 */
export class GameScene extends Phaser.Scene {
  // Состояние игры. Начальные значения ставит resetState(), потому что
  // при scene.restart() поля класса сами не сбрасываются.
  private round = 0; // номер раунда: какой по счёту долг закрываем
  private debt = 0; // долг этого раунда
  private paid = 0; // сколько уже внесено в этот долг
  private spinsLeft = 0; // сколько прокруток осталось в раунде
  private pot = 0; // кон: выиграно, но ещё не внесено — паттерн из черепов сжигает его
  private streak = 0; // серия: сколько прокруток подряд без паттерна из черепов и без «забрать»
  private record = 0; // рекорд: больше всего закрытых долгов за одну игру
  private isSpinning = false; // сетка крутится — ввод игнорируется
  private isRoundOver = false; // долг закрыт, висит «ДОЛГ ЗАКРЫТ!» — ждём следующий раунд
  private isGameOver = false; // прокрутки кончились, а долг не закрыт
  private canRestartWithSpace = false; // Пробел на экране проигрыша срабатывает не сразу

  // Лампочки на корпусе автомата.
  private lampTick = 0; // сколько раз лампочки уже обновились
  private lampSpeed = LAMP_IDLE_SPEED; // через сколько тиков огонёк сдвигается
  private lampColor = LAMP_GOLD; // каким цветом горят лампочки сейчас
  private lampResetTimer?: Phaser.Time.TimerEvent; // когда вернуть лампочки в спокойный режим

  // Объекты на экране.
  private cells: Phaser.GameObjects.Image[][] = []; // клетки сетки: cells[ряд][столбец]
  private cellHighlights!: Phaser.GameObjects.Graphics; // рамки вокруг клеток найденных паттернов
  private patternFrames: Phaser.GameObjects.Rectangle[] = []; // рамки схем на панели, в порядке PATTERNS
  private lamps: Phaser.GameObjects.Arc[] = [];
  private coinEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debtBarFill!: Phaser.GameObjects.Rectangle;
  private debtBarShine!: Phaser.GameObjects.Rectangle; // светлый блик сверху заполнения
  private debtText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private spinsText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private potText!: Phaser.GameObjects.Text;
  private spinButton!: Button;
  private takeButton!: Button;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetState();
    drawBackground(this);
    createCoinTexture(this);
    createIconTextures(this);
    createSymbolTextures(this, SYMBOLS, CELL_SIZE, CELL_RADIUS);
    createPatternTextures(this, PATTERNS);
    this.drawHeader();
    this.drawDebtBar();
    this.drawLeftPanel();
    this.drawMachine();
    this.drawGrid();
    this.drawPatternPanel();
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
    this.isSpinning = false;
    this.isRoundOver = false;
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
    this.addText(CENTER_X, 58, 'Закрой долг, пока есть прокрутки. Паттерн из 💀 сжигает кон.', {
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

  /** Левая панель: в плашке номер раунда, ниже прокрутки и рекорд. */
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
  }

  /** Корпус автомата и лампочки вокруг сетки. Лампочки обновляются по таймеру. */
  private drawMachine(): void {
    drawCabinet(this, CENTER_X, GRID_Y, CABINET_WIDTH, CABINET_HEIGHT);
    this.lamps = createLamps(this, CENTER_X, GRID_Y, CABINET_WIDTH, CABINET_HEIGHT);
    this.time.addEvent({ delay: LAMP_TICK, loop: true, callback: () => this.tickLamps() });
  }

  /** Сетка 5×3: в каждой клетке картинка с готовой текстурой символа. Поверх — слой для рамок паттернов. */
  private drawGrid(): void {
    this.cells = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      const line: Phaser.GameObjects.Image[] = [];
      for (let col = 0; col < GRID_COLUMNS; col++) {
        line.push(this.add.image(cellX(col), cellY(row), symbolTexture(startSymbol(row, col))));
      }
      this.cells.push(line);
    }
    this.cellHighlights = this.add.graphics();
  }

  /**
   * Панель паттернов справа: схема каждого паттерна и его ×, в два столбца.
   * Цен символов на экране нет — игрок узнаёт их по опыту. Рамка схемы загорается, когда паттерн найден.
   */
  private drawPatternPanel(): void {
    drawPanel(this, RIGHT_PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT);
    const top = PANEL_Y - PANEL_HEIGHT / 2;
    this.addText(RIGHT_PANEL_X, top + 18, 'ПАТТЕРНЫ', { fontSize: '18px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0.5);

    this.patternFrames = PATTERNS.map((pattern, index) => {
      const side = index % 2 === 0 ? -1 : 1; // чётные — в левом столбце, нечётные — в правом
      const x = RIGHT_PANEL_X + (side * PATTERN_COLUMN_STEP) / 2;
      const y = top + PATTERN_FIRST_Y + Math.floor(index / 2) * PATTERN_ROW_STEP;
      const frame = this.add
        .rectangle(x, y, PATTERN_COLUMN_STEP - 4, PATTERN_ROW_STEP - 4)
        .setRounded(6)
        .setVisible(false);
      this.add.image(x - 20, y, patternTexture(pattern)); // схема слева, «×N» справа
      this.addText(x + 8, y, `×${pattern.multiplier}`, { fontSize: '16px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0, 0.5);
      return frame;
    });
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

  /** Показать символ в клетке: меняем только текстуру картинки — это дёшево, даже когда 15 клеток мелькают. */
  private showSymbol(row: number, col: number, symbol: SlotSymbol): void {
    this.cells[row][col].setTexture(symbolTexture(symbol));
  }

  /** Обновить надписи и кнопки по текущему состоянию. */
  private refreshHud(): void {
    this.debtText.setText(`ДОЛГ ${this.paid} / ${this.debt}`);
    this.fillDebtBar(Math.min(this.paid / this.debt, 1));
    this.roundText.setText(`РАУНД ${this.round}`);
    this.spinsText.setText(`Прокрутки: ${this.spinsLeft}`);
    this.spinsText.setColor(this.spinsLeft <= LOW_SPINS ? RED_TEXT : '#ffffff');
    this.recordText.setText(`Рекорд: ${this.record}`);
    this.potText.setText(`НА КОНУ: ${this.pot}`);
    this.spinButton.label.setText(`КРУТИТЬ ×${multiplierForStreak(this.streak)}`);
    this.takeButton.label.setText(`ЗАБРАТЬ ${this.pot}`);
    this.setButtonEnabled(this.spinButton, this.canAct());
    this.setButtonEnabled(this.takeButton, this.canAct() && this.pot > 0);
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

  /** На время перекрасить лампочки и пустить огоньки быстрее: выигрыш, черепа, закрытый долг. */
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

  /** Монетки из сетки: чем больше выигрыш, тем больше монет (но не больше 40). */
  private burstCoins(gain: number): void {
    this.coinEmitter.explode(Math.min(6 + Math.floor(gain / 5), 40), CENTER_X, GRID_Y);
  }

  /** Надпись всплывает над сеткой: поднимается и тает. */
  private showPopup(text: string, color: string): void {
    const y = GRID_Y - 30;
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

  /** Подсветить найденные паттерны: толстые рамки на клетках и рамки схем на панели. Золотые — выигрыш, красные — черепа. */
  private highlightHits(hits: PatternHit[], color: number): void {
    this.cellHighlights.lineStyle(HIGHLIGHT_WIDTH, color);
    for (const hit of hits) {
      for (const [row, col] of hit.cells) {
        const left = cellX(col) - CELL_SIZE / 2;
        const top = cellY(row) - CELL_SIZE / 2;
        this.cellHighlights.strokeRoundedRect(left, top, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
      }
      this.patternFrames[PATTERNS.indexOf(hit.pattern)].setStrokeStyle(3, color).setVisible(true);
    }
  }

  /** Убрать подсветку прошлой прокрутки. */
  private clearHighlights(): void {
    this.cellHighlights.clear();
    for (const frame of this.patternFrames) frame.setVisible(false);
  }

  /** Удар черепов: красная вспышка и лёгкая тряска экрана. */
  private flashAndShake(): void {
    const camera = this.cameras.main;
    camera.flashEffect.alpha = 0.5; // полупрозрачная вспышка, а не сплошной красный экран
    camera.flash(300, 239, 68, 68);
    camera.shake(250, 0.008);
  }

  /** Крупное «ДОЛГ ЗАКРЫТ!» поверх сетки: выскакивает и через DEBT_CLOSED_TIME тает. */
  private showDebtClosedBanner(): void {
    this.flashLamps(LAMP_GREEN, DEBT_CLOSED_TIME);
    const strip = this.add.rectangle(CENTER_X, GRID_Y, 960, 150, 0x052e16, 0.92).setDepth(BANNER_DEPTH);
    const label = this.addText(CENTER_X, GRID_Y, 'ДОЛГ ЗАКРЫТ!', {
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
    this.onKey('ENTER', () => this.take());
    this.onKey('R', () => {
      if (this.isGameOver) this.restartGame();
    });
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

  /** Можно ли сейчас крутить или забирать. */
  private canAct(): boolean {
    return !this.isSpinning && !this.isRoundOver && !this.isGameOver;
  }

  private restartGame(): void {
    this.scene.restart();
  }

  // ---------- Прокрутка ----------

  /** Прокрутка: тратит одну прокрутку, столбцы мелькают и останавливаются слева направо. */
  private spin(): void {
    if (!this.canAct()) return;
    this.pressButton(this.spinButton);
    this.isSpinning = true;
    this.spinsLeft -= 1;
    const multiplier = multiplierForStreak(this.streak); // множитель запоминаем до прокрутки
    this.messageText.setText(''); // пока крутится, строка пустая — смотрим на сетку
    this.clearHighlights();
    this.refreshHud();

    const grid = spinGrid(); // результат известен сразу, анимация только показывает его
    for (let col = 0; col < GRID_COLUMNS; col++) this.spinColumn(col, grid);

    const lastStopTime = columnStopTime(GRID_COLUMNS - 1);
    this.time.delayedCall(lastStopTime + RESULT_PAUSE, () => this.finishSpin(grid, multiplier));
  }

  /** Один столбец: три клетки мелькают случайными символами, потом встают на итоговые. */
  private spinColumn(col: number, grid: Grid): void {
    const flicker = this.time.addEvent({
      delay: FLICKER_DELAY,
      loop: true,
      callback: () => {
        for (let row = 0; row < GRID_ROWS; row++) this.showSymbol(row, col, randomSymbol());
      },
    });
    this.time.delayedCall(columnStopTime(col), () => {
      flicker.remove();
      for (let row = 0; row < GRID_ROWS; row++) this.showSymbol(row, col, grid[row][col]);
      this.bounceColumn(col);
    });
  }

  /** Короткий подскок столбца при остановке. */
  private bounceColumn(col: number): void {
    for (let row = 0; row < GRID_ROWS; row++) {
      this.tweens.add({
        targets: this.cells[row][col],
        y: cellY(row) - BOUNCE_HEIGHT,
        duration: 90,
        ease: 'Quad.easeOut',
        yoyo: true,
      });
    }
  }

  /** Итог прокрутки: паттерн из черепов сжигает кон, иначе выигрыш × множитель идёт на кон. */
  private finishSpin(grid: Grid, multiplier: number): void {
    this.isSpinning = false;
    const result = evaluateGrid(grid);
    if (result.kind === 'skull') {
      this.burnPot(result);
    } else {
      this.streak += 1; // серия растёт с каждой прокруткой без паттерна из черепов, даже без выигрыша
      this.addToPot(result, multiplier);
    }
    if (this.spinsLeft === 0) this.endOfSpins();
    this.refreshHud();
  }

  /** Паттерн из черепов: кон сгорает вместе с выигрышем этой прокрутки, серия обрывается — следующая снова ×1. */
  private burnPot(result: SpinResult): void {
    const lost = this.pot;
    this.pot = 0;
    this.streak = 0;
    this.highlightHits(result.hits, SKULL_BORDER);
    this.flashAndShake();
    this.flashLamps(LAMP_RED, 700);
    this.messageText.setText(lost > 0 ? `💀 Кон сгорел: −${lost}` : '💀💀💀');
  }

  /** Выигрыш паттернов × множитель идёт на кон. */
  private addToPot(result: SpinResult, multiplier: number): void {
    if (result.kind === 'nothing') {
      this.messageText.setText('Пусто'); // множитель следующей прокрутки виден на кнопке
      return;
    }
    const gain = winWithMultiplier(result.win, multiplier);
    this.pot += gain;
    this.messageText.setText(`${winSigns(result.hits)}!`); // сумма всплывает над сеткой
    this.highlightHits(result.hits, WIN_BORDER);
    this.showPopup(formatWin(result.win, multiplier, gain), GOLD_TEXT);
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

  /** Кон переходит во «внесено», серия обрывается. */
  private payPot(): void {
    const amount = this.pot;
    this.paid += amount;
    this.pot = 0;
    this.streak = 0;
    this.messageText.setText(`+${amount} внесено`);
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

  /**
   * Следующий раунд: новый долг, множитель ×1, излишек идёт в новый долг.
   * Излишка хватает и на новый долг — он тоже закрывается, иначе прокрутки снова полные.
   */
  private startNextRound(): void {
    this.isRoundOver = false;
    this.paid -= this.debt; // остаётся излишек
    this.round += 1;
    this.debt = debtForRound(this.round);
    this.streak = 0;
    this.updateRecord();
    this.messageText.setText(`Раунд ${this.round} · новый долг ${this.debt}`);
    if (this.isDebtPaid()) this.closeDebt();
    else this.spinsLeft = SPINS_PER_ROUND; // оставшиеся прокрутки прошлого раунда сгорают
    this.refreshHud();
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
}

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
  CHIP_STACK_TEXTURE,
  CHIP_TEXTURE,
  createChipTextures,
  createHandTextures,
  createLamps,
  createLeverTextures,
  createPatternTextures,
  createRedButtonTexture,
  createShutterTexture,
  createSymbolTextures,
  drawMachineBody,
  drawNoteTexture,
  drawRoom,
  FONT,
  HAND_FIST_TEXTURE,
  HAND_OPEN_TEXTURE,
  LAMP_OFF,
  LEVER_BALL_TEXTURE,
  LEVER_ROD_TEXTURE,
  NOTE_TEXTURE,
  patternTexture,
  RED_BUTTON_TEXTURE,
  SHUTTER_TEXTURE,
  symbolTexture,
  type Box,
} from './decor';

// Раскладка экрана 960×640: вид от первого лица — автомат стоит вплотную, вокруг тёмная комната.
// Части автомата — прямоугольники Box (x, y — середина): по ним decor.ts рисует корпус, а сцена ставит поверх живые объекты.
const CENTER_X = 480;
const CENTER_Y = 320;
const GRID_Y = 314; // центр сетки 5×3
const CELL_SIZE = 80;
const CELL_GAP = 6;
const CELL_STEP = CELL_SIZE + CELL_GAP; // от центра клетки до центра соседней
const CELL_RADIUS = 12; // скругление углов клетки
const SCREEN_PADDING = 18; // окно экрана шире сетки на столько с каждой стороны
const BODY: Box = { x: CENTER_X, y: 366, width: 600, height: 720 }; // корпус; низ уходит за край экрана
const DISPLAY: Box = { x: CENTER_X, y: 40, width: 260, height: 50 }; // табло: сколько внесено
const GLASS: Box = { x: CENTER_X, y: 116, width: 500, height: 80 }; // стекло с паттернами
const SCREEN: Box = {
  x: CENTER_X,
  y: GRID_Y,
  width: GRID_COLUMNS * CELL_STEP - CELL_GAP + 2 * SCREEN_PADDING,
  height: GRID_ROWS * CELL_STEP - CELL_GAP + 2 * SCREEN_PADDING,
}; // окно вокруг сетки
const BELLY: Box = { x: CENTER_X, y: 540, width: 500, height: 130 }; // панель под экраном
const MULTIPLIER_WINDOW: Box = { x: 320, y: 552, width: 130, height: 58 }; // окошко множителя серии
const LEVER_MOUNT: Box = { x: 800, y: 338, width: 48, height: 76 }; // крепление рычага; из его середины растёт рычаг
const LEVER_ROD_LENGTH = 142; // длина штанги рычага, на её конце — шарик
const NOTE: Box = { x: 96, y: 118, width: 150, height: 120 }; // записка с долгом на стене
const NOTE_ANGLE = -6; // записка висит чуть криво, градусы
// Стекло с паттернами: схемы рядами по 5.
const PATTERN_COLUMNS = 5;
const PATTERN_STEP_X = 96; // от центра схемы до центра соседней
const PATTERN_STEP_Y = 36;
// Лампочки прокруток под экраном: по одной на прокрутку.
const SPIN_LAMP_Y = 492;
const SPIN_LAMP_STEP = 26;
const SPIN_LAMP_RADIUS = 8;
// Окошко выплаты на корпусе: когда на кону что-то есть, шторка поднимается — за ней стопка фишек, «× сумма» и красная кнопка.
const PAYOUT_WINDOW: Box = { x: 565, y: 552, width: 290, height: 70 };
const SHUTTER_INSET = 4; // шторка чуть меньше окошка, чтобы не вылезать за скруглённые углы
const SHUTTER_OPEN_SCALE = 0.1; // поднятая шторка свёрнута в узкую полоску сверху
const CHIP_STACK_X = 462;
const CHIP_STACK_BOTTOM_Y = 574; // нижняя фишка стопки
const CHIP_STACK_STEP = 6; // каждая следующая фишка в стопке выше на столько px
const PAYOUT_TEXT_X = 500; // «× 400» — правее стопки
const RED_BUTTON_X = 664;
const RED_BUTTON_Y = 554;
// Высота стопки: 1 фишка и ещё по одной за каждый порог — долю долга раунда, которую набрал кон.
// 4 фишки — кона уже хватает на долг, 6 — больше не бывает (кон вчетверо больше долга).
const CHIP_STACK_STEPS = [0.25, 0.5, 1, 2, 4];
const BOARD_CHIP_X = DISPLAY.x - 84; // фишка на табло — сюда летят забранные фишки
// Расплата в конце раунда: вид уезжает вправо, к темноте за краем комнаты, оттуда тянется рука Коллектора.
const TURN_SCROLL = 380; // на столько px уезжает вид — табло остаётся видно у левого края
const DARKNESS: Box = { x: 1200, y: CENTER_Y, width: 480, height: 640 }; // темнота справа от комнаты
const HAND_Y = 330;
const HAND_IN_X = 1560; // рука спрятана в темноте за правым краем вида
const HAND_OUT_X = 1170; // рука протянута к игроку
const HAND_PALM_X = HAND_OUT_X - 58; // ладонь протянутой руки — сюда летят фишки
const HAND_PALM_Y = HAND_Y - 22;
const DEMAND_Y = HAND_Y - 100; // над ладонью: «фишка × долг»
const PAYMENT_CHIPS = 6; // сколько фишек летит в ладонь при расплате (для красоты: сумма может быть любой)
// Конец забега: на экране автомата GOOD LUCK, ниже счёт и кнопка «ЗАНОВО».
const GOOD_LUCK_SCORE_Y = 500;
const GOOD_LUCK_BUTTON_Y = 566;
const BUTTON_WIDTH = 170;
const BUTTON_HEIGHT = 60;
const BUTTON_SHADOW = 6; // тень кнопки сдвинута вниз на столько px

// Анимация прокрутки: время в мс, расстояние в px.
const FLICKER_DELAY = 60; // как часто меняются символы, пока столбец крутится
const FIRST_STOP_TIME = 400; // когда останавливается первый (левый) столбец
const STOP_STEP = 120; // каждый следующий столбец останавливается на столько позже
const RESULT_PAUSE = 200; // пауза между остановкой последнего столбца и итогом: подскок успевает закончиться
const BOUNCE_HEIGHT = 14; // высота подскока при остановке
const HIGHLIGHT_WIDTH = 6; // толщина рамки вокруг клеток найденного паттерна
const LEVER_PULL_SCALE = -0.4; // рычаг дёрнули: штанга переворачивается, шарик уходит вниз «на игрока»
const LEVER_PULL_TIME = 130; // рывок вниз, столько же — обратно
const LEVER_HOLD_TIME = 60; // сколько рычаг держится внизу
const LEVER_BALL_GROW = 0.15; // внизу шарик ближе к игроку — на столько крупнее (на каждую единицу укорочения штанги)

// Обратная связь: время в мс.
const COLLECT_DELAY = 1300; // после последней прокрутки: пусть фишки долетят до табло, потом расплата
const TURN_TIME = 600; // вид уезжает вбок или возвращается
const HAND_MOVE_TIME = 450; // рука выдвигается из темноты или уходит обратно
const HAND_HOLD_TIME = 300; // кулак с фишками задерживается, прежде чем уйти
const HAND_WAIT_TIME = 1200; // фишек не хватает: рука ждёт столько, потом экран гаснет
const BLACKOUT_TIME = 700; // экран гаснет и загорается снова
const GOOD_LUCK_BLINK_TIME = 500; // GOOD LUCK мигает
const NEW_ROUND_LAMPS_TIME = 1000; // долг отдан — огни бегут зелёным
const RESTART_SPACE_DELAY = 800; // Пробел перезапускает игру не раньше, чем через столько
const NOTE_FLIP_TIME = 140; // половина переворота записки
const MULTIPLIER_FLASH_TIME = 600; // сколько окошко множителя горит красным после черепов
const SHUTTER_TIME = 300; // шторка поднимается или опускается
const CHIPS_FLY_TIME = 500; // фишки летят из окошка в табло
const CHIPS_FLY_STAGGER = 70; // фишки взлетают друг за другом, сверху стопки
const CHIPS_BURN_TIME = 450; // фишки в окошке сгорают
const RED_BUTTON_PRESS_SCALE = 0.88; // нажатая красная кнопка чуть уменьшается — «вдавливается»

// Лампочки на корпусе.
const LAMP_TICK = 90; // как часто обновляются бегущие огни, мс
const LAMP_IDLE_SPEED = 4; // в покое огонёк сдвигается раз в 4 тика, при событиях — каждый тик
const LAMP_GOLD = 0xfde047;
const LAMP_RED = 0xef4444;
const LAMP_GREEN = 0x4ade80;
const SPIN_LAMP_RIM = 0x1c1917; // ободок лампочки прокрутки
const BURN_COLOR = 0xff5a1f; // горящие фишки в окошке

const LOW_SPINS = 3; // столько прокруток или меньше — оставшиеся лампочки красные
const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage

// Слои: чем больше число, тем выше лежит объект.
const CHIP_DEPTH = 5;
const POPUP_DEPTH = 10;
const GAME_OVER_DEPTH = 30;

// Внешний вид.
const SKULL_BORDER = 0xef4444; // рамка паттерна из черепов
const WIN_BORDER = 0xfde047; // рамка выигравшего паттерна
const SPIN_COLOR = 0xea580c; // кнопка «ЗАНОВО»
const BUTTON_BORDER = 0xfbbf24;
const GOLD_TEXT = '#fde047';
const GREEN_TEXT = '#4ade80';
const RED_TEXT = '#f87171';
const HINT_TEXT = 'rgba(255, 255, 255, 0.55)'; // подсказка клавиши у рычага
const LED_COLOR = '#fbbf24';
// Всплывающие надписи жирные и с тёмной обводкой, чтобы читались поверх сетки.
const POPUP_STYLE = { fontSize: '36px', fontStyle: 'bold', stroke: '#0f172a', strokeThickness: 6 };
// Цифры табло и окошка множителя светятся, как на LED-табло.
const LED_STYLE = {
  fontFamily: 'ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace',
  fontSize: '32px',
  fontStyle: 'bold',
  color: LED_COLOR,
  shadow: { color: '#f59e0b', blur: 12, fill: true },
};

/** Кнопка: тень стоит на месте, а «лицо» — контейнер с корпусом, бликом и надписями. */
interface Button {
  shadow: Phaser.GameObjects.Rectangle;
  face: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
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

/** Сколько фишек в стопке окошка: одна и ещё по одной за каждый порог CHIP_STACK_STEPS — долю долга, которую набрал кон. */
function chipsInStack(pot: number, debt: number): number {
  return 1 + CHIP_STACK_STEPS.filter((step) => pot >= step * debt).length;
}

/** Где лежит фишка стопки: нижняя на CHIP_STACK_BOTTOM_Y, каждая следующая выше на CHIP_STACK_STEP. */
function stackChipY(index: number): number {
  return CHIP_STACK_BOTTOM_Y - index * CHIP_STACK_STEP;
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
  private balance = 0; // фишки на табло — твои; из них в конце раунда отдаётся долг
  private spinsLeft = 0; // сколько прокруток осталось в раунде
  private pot = 0; // кон: выиграно, но ещё не внесено — паттерн из черепов сжигает его
  private streak = 0; // серия: сколько прокруток подряд без паттерна из черепов и без «забрать»
  private record = 0; // рекорд: больше всего закрытых долгов за одну игру
  private isSpinning = false; // сетка крутится — ввод игнорируется
  private isRoundOver = false; // прокрутки кончились — идёт расплата с Коллектором, крутить и забирать нельзя
  private isGameOver = false; // долг не отдан — GOOD LUCK, конец забега
  private isAwaitingPayment = false; // рука протянута и фишек хватает — ждём «отдать» (клик по руке или Enter)
  private isNoteChecked = false; // на записке галочка: фишек на табло хватает на долг
  private canRestartWithSpace = false; // Пробел на экране проигрыша срабатывает не сразу
  private isWindowOpen = false; // шторка окошка выплаты поднята

  // Бегущие огни вокруг экрана.
  private lampTick = 0; // сколько раз огни уже обновились
  private lampSpeed = LAMP_IDLE_SPEED; // через сколько тиков огонёк сдвигается
  private lampColor = LAMP_GOLD; // каким цветом горят огни сейчас
  private lampResetTimer?: Phaser.Time.TimerEvent; // когда вернуть огни в спокойный режим

  // Объекты на экране.
  private cells: Phaser.GameObjects.Image[][] = []; // клетки сетки: cells[ряд][столбец]
  private cellHighlights!: Phaser.GameObjects.Graphics; // рамки вокруг клеток найденных паттернов
  private patternFrames: Phaser.GameObjects.Rectangle[] = []; // рамки схем на стекле, в порядке PATTERNS
  private lamps: Phaser.GameObjects.Arc[] = []; // бегущие огни вокруг экрана
  private spinLamps: Phaser.GameObjects.Arc[] = []; // лампочки прокруток: одна на прокрутку
  private chipEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private boardText!: Phaser.GameObjects.Text; // табло: сколько у тебя фишек
  private multiplierText!: Phaser.GameObjects.Text; // окошко множителя серии
  private note!: Phaser.GameObjects.Image; // записка с долгом: бумажка с надписями одной картинкой
  private leverRod!: Phaser.GameObjects.Image; // штанга рычага, низ — точка вращения
  private leverBall!: Phaser.GameObjects.Image; // шарик на конце штанги
  private shutter!: Phaser.GameObjects.Image; // шторка окошка выплаты: scaleY 1 — опущена, SHUTTER_OPEN_SCALE — поднята
  private stackChips: Phaser.GameObjects.Image[] = []; // стопка фишек в окошке, снизу вверх
  private payoutText!: Phaser.GameObjects.Text; // «× 400» — сколько фишек на кону
  private redButton!: Phaser.GameObjects.Image; // красная кнопка «забрать» — без надписей
  private payoutHint!: Phaser.GameObjects.Text; // подсказка «Enter» под окошком, видна, когда оно открыто
  private hand!: Phaser.GameObjects.Image; // рука Коллектора в темноте справа
  private demandChip!: Phaser.GameObjects.Image; // над ладонью: фишка…
  private demandText!: Phaser.GameObjects.Text; // …и «× долг»

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetState();
    drawRoom(this);
    createChipTextures(this);
    createLeverTextures(this, LEVER_ROD_LENGTH);
    createSymbolTextures(this, SYMBOLS, CELL_SIZE, CELL_RADIUS);
    createPatternTextures(this, PATTERNS);
    createShutterTexture(this, PAYOUT_WINDOW.width - 2 * SHUTTER_INSET, PAYOUT_WINDOW.height - 2 * SHUTTER_INSET);
    createRedButtonTexture(this);
    createHandTextures(this);
    this.drawNote();
    this.drawMachine();
    this.drawBoard();
    this.drawPatternPanel();
    this.drawGrid();
    this.drawSpinLamps();
    this.drawMultiplier();
    this.drawPayoutWindow();
    this.drawLever();
    this.drawCollector();
    this.createChipEmitter();
    this.setupKeyboard();
    this.refreshHud();
  }

  private resetState(): void {
    this.round = 1;
    this.debt = debtForRound(1);
    this.balance = 0;
    this.spinsLeft = SPINS_PER_ROUND;
    this.pot = 0;
    this.streak = 0;
    this.record = loadRecord();
    this.isSpinning = false;
    this.isRoundOver = false;
    this.isGameOver = false;
    this.canRestartWithSpace = false;
    this.isAwaitingPayment = false;
    this.isNoteChecked = false;
    this.isWindowOpen = false;
    this.lampTick = 0;
    this.lampSpeed = LAMP_IDLE_SPEED;
    this.lampColor = LAMP_GOLD;
    this.lampResetTimer = undefined;
  }

  // ---------- Отрисовка ----------

  /**
   * Записка с долгом на стене: бумажка, «ДОЛГ» и сумма — одна картинка, нарисованная в decor.ts.
   * Надписи нарисованы прямо на бумажке: Phaser 4 обрезает текст в повёрнутом контейнере, а картинку — нет.
   */
  private drawNote(): void {
    drawNoteTexture(this, NOTE.width, NOTE.height, this.debt, false);
    this.note = this.add.image(NOTE.x, NOTE.y, NOTE_TEXTURE).setAngle(NOTE_ANGLE);
  }

  /** Корпус автомата (одна запечённая картинка) и бегущие огни вокруг экрана. Огни обновляются по таймеру. */
  private drawMachine(): void {
    drawMachineBody(this, {
      body: BODY,
      display: DISPLAY,
      glass: GLASS,
      screen: SCREEN,
      belly: BELLY,
      multiplierWindow: MULTIPLIER_WINDOW,
      payoutWindow: PAYOUT_WINDOW,
      leverMount: LEVER_MOUNT,
    });
    this.lamps = createLamps(this, SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height);
    this.time.addEvent({ delay: LAMP_TICK, loop: true, callback: () => this.tickLamps() });
  }

  /** Табло сверху: фишка и сколько у тебя фишек. Сюда летят забранные фишки, отсюда в конце раунда отдаётся долг. */
  private drawBoard(): void {
    this.add.image(BOARD_CHIP_X, DISPLAY.y, CHIP_TEXTURE).setScale(1.3);
    this.boardText = this.addText(DISPLAY.x + 12, DISPLAY.y, '', LED_STYLE).setOrigin(0.5);
  }

  /**
   * Стекло с паттернами над экраном: схема каждого паттерна и его ×, рядами по пять.
   * Цен символов на экране нет — игрок узнаёт их по опыту. Рамка схемы загорается, когда паттерн найден.
   */
  private drawPatternPanel(): void {
    const rows = Math.ceil(PATTERNS.length / PATTERN_COLUMNS);
    this.patternFrames = PATTERNS.map((pattern, index) => {
      const col = index % PATTERN_COLUMNS;
      const row = Math.floor(index / PATTERN_COLUMNS);
      const x = GLASS.x + (col - (PATTERN_COLUMNS - 1) / 2) * PATTERN_STEP_X;
      const y = GLASS.y + (row - (rows - 1) / 2) * PATTERN_STEP_Y;
      const frame = this.add
        .rectangle(x, y, PATTERN_STEP_X - 6, PATTERN_STEP_Y - 4)
        .setRounded(6)
        .setVisible(false);
      this.add.image(x - 20, y, patternTexture(pattern)); // схема слева, «×N» справа
      this.addText(x + 8, y, `×${pattern.multiplier}`, { fontSize: '16px', fontStyle: 'bold', color: GOLD_TEXT }).setOrigin(0, 0.5);
      return frame;
    });
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

  /** Лампочки прокруток под экраном: по одной на каждую прокрутку раунда. */
  private drawSpinLamps(): void {
    this.spinLamps = [];
    for (let index = 0; index < SPINS_PER_ROUND; index++) {
      const x = CENTER_X + (index - (SPINS_PER_ROUND - 1) / 2) * SPIN_LAMP_STEP;
      this.spinLamps.push(this.add.circle(x, SPIN_LAMP_Y, SPIN_LAMP_RADIUS, LAMP_OFF).setStrokeStyle(3, SPIN_LAMP_RIM));
    }
  }

  /** Окошко множителя серии: «×3» — с таким множителем пойдёт следующая прокрутка. */
  private drawMultiplier(): void {
    this.multiplierText = this.addText(MULTIPLIER_WINDOW.x, MULTIPLIER_WINDOW.y, '', LED_STYLE).setOrigin(0.5);
  }

  /**
   * Окошко выплаты: стопка фишек (пока спрятана), «× сумма», красная кнопка «забрать» и поверх — шторка.
   * Пустой кон — шторка опущена; кон есть — шторка поднята, и всё видно.
   */
  private drawPayoutWindow(): void {
    this.stackChips = [];
    for (let index = 0; index <= CHIP_STACK_STEPS.length; index++) {
      this.stackChips.push(this.add.image(CHIP_STACK_X, stackChipY(index), CHIP_STACK_TEXTURE).setVisible(false));
    }
    this.payoutText = this.addText(PAYOUT_TEXT_X, PAYOUT_WINDOW.y, '', { ...LED_STYLE, fontSize: '26px' }).setOrigin(0, 0.5);
    this.redButton = this.add.image(RED_BUTTON_X, RED_BUTTON_Y, RED_BUTTON_TEXTURE);
    this.redButton.setInteractive({ useHandCursor: true });
    this.redButton.on('pointerdown', () => this.take());
    // Шторка висит от верха окошка: scaleY уменьшается — и она сворачивается вверх.
    const shutterTop = PAYOUT_WINDOW.y - PAYOUT_WINDOW.height / 2 + SHUTTER_INSET;
    this.shutter = this.add.image(PAYOUT_WINDOW.x, shutterTop, SHUTTER_TEXTURE).setOrigin(0.5, 0);
    const hintY = PAYOUT_WINDOW.y + PAYOUT_WINDOW.height / 2 + 12;
    this.payoutHint = this.addText(RED_BUTTON_X, hintY, 'Enter', { fontSize: '13px', color: HINT_TEXT }).setOrigin(0.5).setVisible(false);
  }

  /** Рычаг справа: штанга и шарик на её конце. Дёрнуть — кликом по рычагу или Пробелом. Под креплением — подсказка клавиши. */
  private drawLever(): void {
    this.leverRod = this.add.image(LEVER_MOUNT.x, LEVER_MOUNT.y, LEVER_ROD_TEXTURE).setOrigin(0.5, 1);
    this.leverBall = this.add.image(LEVER_MOUNT.x, LEVER_MOUNT.y, LEVER_BALL_TEXTURE);
    this.placeLeverBall();
    for (const part of [this.leverRod, this.leverBall]) {
      part.setInteractive({ useHandCursor: true });
      part.on('pointerdown', () => this.spin());
    }
    const hintY = LEVER_MOUNT.y + LEVER_MOUNT.height / 2 + 14;
    this.addText(LEVER_MOUNT.x, hintY, 'Пробел', { fontSize: '13px', color: HINT_TEXT }).setOrigin(0.5);
  }

  /** Темнота справа от комнаты и рука Коллектора в ней (пока спрятана). Над ладонью — «фишка × долг». */
  private drawCollector(): void {
    this.add.rectangle(DARKNESS.x, DARKNESS.y, DARKNESS.width, DARKNESS.height, 0x000000);
    this.hand = this.add.image(HAND_IN_X, HAND_Y, HAND_OPEN_TEXTURE);
    this.hand.setInteractive({ useHandCursor: true });
    this.hand.on('pointerdown', () => this.payDebt());
    this.demandChip = this.add.image(HAND_PALM_X - 44, DEMAND_Y, CHIP_TEXTURE).setScale(1.2).setAlpha(0);
    this.demandText = this.addText(HAND_PALM_X - 24, DEMAND_Y, '', { ...LED_STYLE, fontSize: '28px' })
      .setOrigin(0, 0.5)
      .setAlpha(0);
  }

  /**
   * Кнопка: тень, корпус с золотой рамкой, блик сверху, крупная надпись и под ней клавиша.
   * Нажимается и мышью, и пальцем.
   */
  private makeButton(x: number, y: number, color: number, keyHint: string, onPress: () => void): Button {
    const shadow = this.add.rectangle(x, y + BUTTON_SHADOW, BUTTON_WIDTH, BUTTON_HEIGHT, 0x000000, 0.45).setRounded(18);
    // Всё остальное рисуем относительно центра кнопки и кладём в контейнер.
    const box = this.add.rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, color).setRounded(18).setStrokeStyle(3, BUTTON_BORDER);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', onPress);
    const gloss = this.add.rectangle(0, -BUTTON_HEIGHT / 4, BUTTON_WIDTH - 16, BUTTON_HEIGHT / 2 - 8, 0xffffff, 0.16).setRounded(12);
    const label = this.addText(0, -9, '', {
      fontSize: '22px',
      fontStyle: 'bold',
      stroke: 'rgba(0, 0, 0, 0.35)',
      strokeThickness: 3,
    }).setOrigin(0.5);
    const key = this.addText(0, 21, keyHint, { fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }).setOrigin(0.5);
    const face = this.add.container(x, y, [box, gloss, label, key]);
    return { shadow, face, label };
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

  /** Обновить табло, окошко множителя, окошко выплаты и лампочки по текущему состоянию. */
  private refreshHud(): void {
    this.boardText.setText(String(this.balance));
    this.multiplierText.setText(`×${multiplierForStreak(this.streak)}`);
    this.payoutText.setText(`× ${this.pot}`);
    this.redButton.setAlpha(this.canAct() ? 1 : 0.6); // пока крутится — кнопка тусклее
    this.refreshSpinLamps();
  }

  /** Горит столько лампочек, сколько прокруток осталось. Когда их мало — оставшиеся красные. */
  private refreshSpinLamps(): void {
    const litColor = this.spinsLeft <= LOW_SPINS ? LAMP_RED : LAMP_GOLD;
    this.spinLamps.forEach((lamp, index) => lamp.setFillStyle(index < this.spinsLeft ? litColor : LAMP_OFF));
  }

  // ---------- Обратная связь ----------

  /** Огоньки бегут по лампочкам: горит каждая третья, огонёк сдвигается раз в lampSpeed тиков. */
  private tickLamps(): void {
    this.lampTick += 1;
    const shift = Math.floor(this.lampTick / this.lampSpeed);
    this.lamps.forEach((lamp, index) => lamp.setFillStyle((index + shift) % 3 === 0 ? this.lampColor : LAMP_OFF));
  }

  /** На время перекрасить бегущие огни и пустить их быстрее: выигрыш, черепа, закрытый долг. */
  private flashLamps(color: number, duration: number): void {
    this.lampColor = color;
    this.lampSpeed = 1;
    this.lampResetTimer?.remove();
    this.lampResetTimer = this.time.delayedCall(duration, () => {
      this.lampColor = LAMP_GOLD;
      this.lampSpeed = LAMP_IDLE_SPEED;
    });
  }

  /** Рычаг дёргается: штанга переворачивается (шарик уходит вниз «на игрока») и возвращается. Шарик едет за концом штанги. */
  private pullLever(): void {
    this.tweens.killTweensOf(this.leverRod);
    this.leverRod.setScale(1);
    this.tweens.add({
      targets: this.leverRod,
      scaleY: LEVER_PULL_SCALE,
      duration: LEVER_PULL_TIME,
      hold: LEVER_HOLD_TIME,
      yoyo: true,
      ease: 'Quad.easeIn',
      onUpdate: () => this.placeLeverBall(),
      onComplete: () => this.placeLeverBall(),
    });
  }

  /** Шарик всегда на конце штанги: штанга короче — шарик ниже. Внизу он ближе к игроку — чуть крупнее. */
  private placeLeverBall(): void {
    const stretch = this.leverRod.scaleY; // 1 — рычаг поднят, LEVER_PULL_SCALE — дёрнут до конца
    this.leverBall.setY(LEVER_MOUNT.y - LEVER_ROD_LENGTH * stretch);
    this.leverBall.setScale(1 + LEVER_BALL_GROW * (1 - stretch));
  }

  /** Лампочка этой прокрутки гаснет со вспышкой. */
  private blinkSpinLamp(index: number): void {
    const lamp = this.spinLamps[index];
    if (!lamp) return;
    this.tweens.add({ targets: lamp, scale: { from: 1.6, to: 1 }, duration: 250, ease: 'Quad.easeOut' });
  }

  /** Новый раунд: лампочки прокруток загораются по очереди слева направо. */
  private popSpinLamps(): void {
    this.spinLamps.forEach((lamp, index) => {
      this.tweens.add({ targets: lamp, scale: { from: 0.3, to: 1 }, delay: index * 40, duration: 180, ease: 'Back.easeOut' });
    });
  }

  /** Надпись коротко пульсирует: увеличивается и возвращается. */
  private pulseText(text: Phaser.GameObjects.Text, scale = 1.25): void {
    this.tweens.killTweensOf(text);
    text.setScale(1);
    this.tweens.add({ targets: text, scale, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Черепа оборвали серию: окошко множителя вспыхивает красным. */
  private flashMultiplierRed(): void {
    this.multiplierText.setColor(RED_TEXT);
    this.pulseText(this.multiplierText);
    this.time.delayedCall(MULTIPLIER_FLASH_TIME, () => this.multiplierText.setColor(LED_COLOR));
  }

  /** Новый долг: записка переворачивается, и на обороте — новая сумма. */
  private flipNote(): void {
    this.tweens.killTweensOf(this.note);
    this.note.setScale(1);
    this.tweens.add({
      targets: this.note,
      scaleX: 0,
      duration: NOTE_FLIP_TIME,
      yoyo: true,
      ease: 'Quad.easeIn',
      onYoyo: () => {
        this.isNoteChecked = this.hasEnoughForDebt();
        drawNoteTexture(this, NOTE.width, NOTE.height, this.debt, this.isNoteChecked);
      },
    });
  }

  /** Фишки-частицы: сами не летят, только по команде explode() — веером вверх, потом падают. */
  private createChipEmitter(): void {
    this.chipEmitter = this.add
      .particles(0, 0, CHIP_TEXTURE, {
        speed: { min: 180, max: 380 },
        angle: { min: 210, max: 330 },
        gravityY: 700,
        lifespan: 1000,
        scale: { start: 1, end: 0.5 },
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(CHIP_DEPTH);
  }

  /** Фишки из сетки: чем больше выигрыш, тем больше фишек (но не больше 40). */
  private burstChips(gain: number): void {
    this.chipEmitter.explode(Math.min(6 + Math.floor(gain / 5), 40), CENTER_X, GRID_Y);
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

  /** «+36» летит из окошка выплаты в табло, там брызгают фишки и табло подпрыгивает. */
  private flyToBoard(amount: number): void {
    const label = this.addText(PAYOUT_TEXT_X + 40, PAYOUT_WINDOW.y, `+${amount}`, { ...POPUP_STYLE, color: GREEN_TEXT })
      .setOrigin(0.5)
      .setDepth(POPUP_DEPTH);
    this.tweens.add({
      targets: label,
      x: DISPLAY.x,
      y: DISPLAY.y,
      alpha: { value: 0, delay: 350, duration: 150 },
      duration: 500,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        label.destroy();
        this.chipEmitter.explode(8, DISPLAY.x, DISPLAY.y); // фишки брызгают из табло
        this.pulseText(this.boardText);
      },
    });
  }

  /** Подсветить найденные паттерны: толстые рамки на клетках и рамки схем на стекле. Золотые — выигрыш, красные — черепа. */
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

  /** Конец забега: всё темнеет, экран автомата чёрный, на нём мигает GOOD LUCK. Ниже — счёт, рекорд и «ЗАНОВО». */
  private showGoodLuck(): void {
    const shade = this.add.rectangle(CENTER_X, CENTER_Y, 960, 640, 0x000000, 0.6);
    shade.setInteractive(); // ловит клики, чтобы кнопки под затемнением не нажимались
    const screen = this.add.rectangle(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height, 0x000000).setRounded(16);
    const title = this.addText(SCREEN.x, SCREEN.y, 'GOOD LUCK', {
      ...LED_STYLE,
      fontSize: '64px',
      color: RED_TEXT,
      shadow: { color: '#ef4444', blur: 18, fill: true },
    }).setOrigin(0.5);
    const scoreText = `Долгов закрыто: ${this.closedDebts()} · Рекорд: ${this.record}`;
    const score = this.addText(CENTER_X, GOOD_LUCK_SCORE_Y, scoreText, { fontSize: '20px', color: GOLD_TEXT }).setOrigin(0.5);
    const restart = this.makeButton(CENTER_X, GOOD_LUCK_BUTTON_Y, SPIN_COLOR, 'R / Пробел', () => this.restartGame());
    restart.label.setText('ЗАНОВО');
    for (const part of [shade, screen, title, score, restart.shadow, restart.face]) part.setDepth(GAME_OVER_DEPTH);
    this.tweens.add({ targets: title, alpha: 0.3, duration: GOOD_LUCK_BLINK_TIME, yoyo: true, repeat: -1 }); // мигает

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
  }

  /** Подписка на клавишу. Автоповтор (клавишу держат) пропускаем: одно нажатие — одно действие. */
  private onKey(key: string, action: () => void): void {
    this.input.keyboard?.on(`keydown-${key}`, (event: KeyboardEvent) => {
      if (!event.repeat) action();
    });
  }

  /** Пробел: в игре — дёрнуть рычаг, после проигрыша — «заново», но не раньше чем через 0,8 с. */
  private onSpace(): void {
    if (!this.isGameOver) this.spin();
    else if (this.canRestartWithSpace) this.restartGame();
  }

  /** Enter: рука протянута — отдать долг, иначе — забрать кон. */
  private onEnter(): void {
    if (this.isAwaitingPayment) this.payDebt();
    else this.take();
  }

  /** Можно ли сейчас крутить или забирать. */
  private canAct(): boolean {
    return !this.isSpinning && !this.isRoundOver && !this.isGameOver;
  }

  private restartGame(): void {
    this.scene.restart();
  }

  // ---------- Прокрутка ----------

  /** Прокрутка: рычаг дёргается, гаснет одна лампочка, столбцы мелькают и останавливаются слева направо. */
  private spin(): void {
    if (!this.canAct()) return;
    this.pullLever();
    this.isSpinning = true;
    this.spinsLeft -= 1;
    const multiplier = multiplierForStreak(this.streak); // множитель запоминаем до прокрутки
    this.clearHighlights();
    this.refreshHud();
    this.blinkSpinLamp(this.spinsLeft);

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
      this.pulseText(this.multiplierText); // множитель в окошке вырос
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
    this.flashMultiplierRed();
    if (lost > 0) {
      this.showPopup(`−${lost}`, RED_TEXT); // сколько сгорело с кона
      this.burnChips();
    }
  }

  /** Выигрыш паттернов × множитель идёт на кон. Пусто — ничего не происходит. */
  private addToPot(result: SpinResult, multiplier: number): void {
    if (result.kind === 'nothing') return;
    const gain = winWithMultiplier(result.win, multiplier);
    this.pot += gain;
    this.highlightHits(result.hits, WIN_BORDER);
    this.showPopup(formatWin(result.win, multiplier, gain), GOLD_TEXT);
    this.burstChips(gain);
    this.flashLamps(LAMP_GOLD, 900);
    this.openWindow();
    this.refreshChipStack();
    this.pulseText(this.payoutText, 1.2); // сумма в окошке выросла
  }

  // ---------- Окошко выплаты ----------

  /** Шторка поднимается, если ещё опущена: видно стопку фишек, сумму и красную кнопку. */
  private openWindow(): void {
    if (this.isWindowOpen) return;
    this.isWindowOpen = true;
    this.payoutHint.setVisible(true);
    this.tweens.killTweensOf(this.shutter);
    this.tweens.add({ targets: this.shutter, scaleY: SHUTTER_OPEN_SCALE, duration: SHUTTER_TIME, ease: 'Quad.easeOut' });
  }

  /** Шторка опускается. delay — сколько подождать, пока фишки улетят или сгорят. */
  private closeWindow(delay: number): void {
    this.isWindowOpen = false;
    this.payoutHint.setVisible(false);
    this.tweens.killTweensOf(this.shutter);
    this.tweens.add({ targets: this.shutter, scaleY: 1, delay, duration: SHUTTER_TIME, ease: 'Bounce.easeOut' });
  }

  /** Стопка растёт вместе с коном (см. chipsInStack). Новая фишка падает на стопку сверху. */
  private refreshChipStack(): void {
    const count = chipsInStack(this.pot, this.debt);
    this.stackChips.forEach((chip, index) => {
      const isNew = index < count && !chip.visible;
      chip.setVisible(index < count);
      if (isNew) {
        const y = stackChipY(index);
        this.tweens.add({ targets: chip, y: { from: y - 24, to: y }, duration: 250, ease: 'Bounce.easeOut' });
      }
    });
  }

  /** «Забрали»: фишки по очереди, сверху стопки, летят в табло, следом «+36». Пустое окошко закрывается. */
  private flyChipsToBoard(amount: number): void {
    if (this.shutter.scaleY !== SHUTTER_OPEN_SCALE) {
      // Шторка ещё не поднялась (выигрыш на последней прокрутке забирается сразу) — пусть поднимется, потом фишки полетят.
      this.isWindowOpen = true;
      this.tweens.killTweensOf(this.shutter);
      this.tweens.add({
        targets: this.shutter,
        scaleY: SHUTTER_OPEN_SCALE,
        duration: SHUTTER_TIME,
        ease: 'Quad.easeOut',
        onComplete: () => this.flyChipsToBoard(amount),
      });
      return;
    }
    let flying = 0;
    for (let index = this.stackChips.length - 1; index >= 0; index--) {
      const chip = this.stackChips[index];
      if (!chip.visible) continue;
      this.tweens.killTweensOf(chip);
      this.tweens.add({
        targets: chip,
        x: BOARD_CHIP_X,
        y: DISPLAY.y,
        scale: 0.6,
        delay: flying * CHIPS_FLY_STAGGER,
        duration: CHIPS_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => this.putChipBack(index),
      });
      flying += 1;
    }
    this.flyToBoard(amount);
    this.closeWindow(flying * CHIPS_FLY_STAGGER + CHIPS_FLY_TIME); // шторка ждёт, пока фишки не долетят
  }

  /** Черепа: фишки в окошке вспыхивают огнём, поднимаются дымом и тают. Пустое окошко закрывается. */
  private burnChips(): void {
    this.stackChips.forEach((chip, index) => {
      if (!chip.visible) return;
      this.tweens.killTweensOf(chip);
      chip.setTint(BURN_COLOR).setTintMode(Phaser.TintModes.FILL);
      this.tweens.add({
        targets: chip,
        y: chip.y - 16,
        alpha: 0,
        duration: CHIPS_BURN_TIME,
        ease: 'Quad.easeIn',
        onComplete: () => this.putChipBack(index),
      });
    });
    this.closeWindow(CHIPS_BURN_TIME);
  }

  /** Фишка возвращается на своё место в стопке — спрятанная и обычного цвета, до следующего выигрыша. */
  private putChipBack(index: number): void {
    const chip = this.stackChips[index];
    chip.setVisible(false).setPosition(CHIP_STACK_X, stackChipY(index)).setScale(1).setAlpha(1);
    chip.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }

  /** Красная кнопка коротко вдавливается. */
  private pressRedButton(): void {
    this.tweens.killTweensOf(this.redButton);
    this.redButton.setScale(1);
    this.tweens.add({ targets: this.redButton, scale: RED_BUTTON_PRESS_SCALE, duration: 70, yoyo: true });
  }

  // ---------- Забрать, долг и раунды ----------

  /** «Забрать»: кон уходит на табло. Бесплатно, но множитель снова ×1. */
  private take(): void {
    if (!this.canAct() || this.pot === 0) return;
    this.pressRedButton();
    this.payPot();
    this.refreshHud();
  }

  /** Кон переходит на табло: фишки из окошка летят туда, серия обрывается. */
  private payPot(): void {
    const amount = this.pot;
    this.balance += amount;
    this.pot = 0;
    this.streak = 0;
    this.flyChipsToBoard(amount);
    this.refreshNoteCheck();
  }

  /** Хватает ли фишек на табло, чтобы отдать долг этого раунда. */
  private hasEnoughForDebt(): boolean {
    return this.balance >= this.debt;
  }

  /** Галочка на записке появляется, как только фишек на табло хватает на долг. Записка при этом подпрыгивает. */
  private refreshNoteCheck(): void {
    const enough = this.hasEnoughForDebt();
    if (enough === this.isNoteChecked) return;
    this.isNoteChecked = enough;
    drawNoteTexture(this, NOTE.width, NOTE.height, this.debt, enough);
    this.tweens.add({ targets: this.note, scale: 1.12, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
  }

  /** Прокрутки кончились: кон забирается сам, ввод закрыт, а когда фишки долетят до табло — расплата. */
  private endOfSpins(): void {
    this.isRoundOver = true;
    if (this.pot > 0) this.payPot();
    this.time.delayedCall(COLLECT_DELAY, () => this.turnToCollector());
  }

  // ---------- Расплата с Коллектором ----------

  /** Вид уезжает вбок — к темноте, из которой тянется рука. */
  private turnToCollector(): void {
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: TURN_SCROLL,
      duration: TURN_TIME,
      ease: 'Sine.easeInOut',
      onComplete: () => this.reachOutHand(),
    });
  }

  /** Рука выдвигается ладонью вверх, над ней — сколько отдать. Хватает — ждём «отдать», не хватает — GOOD LUCK. */
  private reachOutHand(): void {
    const enough = this.hasEnoughForDebt();
    this.hand.setTexture(HAND_OPEN_TEXTURE);
    this.demandText.setText(`× ${this.debt}`).setColor(enough ? LED_COLOR : RED_TEXT);
    this.tweens.add({ targets: this.hand, x: HAND_OUT_X, duration: HAND_MOVE_TIME, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: [this.demandChip, this.demandText], alpha: 1, delay: HAND_MOVE_TIME, duration: 200 });
    this.time.delayedCall(HAND_MOVE_TIME, () => {
      if (enough) this.isAwaitingPayment = true; // теперь можно кликнуть по руке или нажать Enter
      else this.time.delayedCall(HAND_WAIT_TIME, () => this.goodLuck());
    });
  }

  /** Отдать долг: фишки летят с табло в ладонь, остаток остаётся на табло. */
  private payDebt(): void {
    if (!this.isAwaitingPayment) return;
    this.isAwaitingPayment = false;
    this.balance -= this.debt;
    this.refreshHud();
    this.flyChipsToHand();
    this.time.delayedCall(PAYMENT_CHIPS * CHIPS_FLY_STAGGER + CHIPS_FLY_TIME, () => this.takeHandAway());
  }

  /** Фишки по одной летят с табло в ладонь и пропадают в ней. */
  private flyChipsToHand(): void {
    for (let index = 0; index < PAYMENT_CHIPS; index++) {
      const chip = this.add.image(DISPLAY.x, DISPLAY.y, CHIP_TEXTURE).setScale(1.3);
      this.tweens.add({
        targets: chip,
        x: HAND_PALM_X,
        y: HAND_PALM_Y,
        scale: 0.8,
        delay: index * CHIPS_FLY_STAGGER,
        duration: CHIPS_FLY_TIME,
        ease: 'Cubic.easeIn',
        onComplete: () => chip.destroy(),
      });
    }
  }

  /** Рука сжимает фишки в кулак и уходит в темноту, вид возвращается к автомату — новый раунд. */
  private takeHandAway(): void {
    this.hand.setTexture(HAND_FIST_TEXTURE);
    this.tweens.add({ targets: [this.demandChip, this.demandText], alpha: 0, duration: 200 });
    this.tweens.add({ targets: this.hand, x: HAND_IN_X, delay: HAND_HOLD_TIME, duration: HAND_MOVE_TIME, ease: 'Cubic.easeIn' });
    this.tweens.add({
      targets: this.cameras.main,
      scrollX: 0,
      delay: HAND_HOLD_TIME + HAND_MOVE_TIME,
      duration: TURN_TIME,
      ease: 'Sine.easeInOut',
      onComplete: () => this.startNextRound(),
    });
  }

  /** Новый раунд: долг больше (записка переворачивается), прокрутки снова полные, множитель ×1. */
  private startNextRound(): void {
    this.isRoundOver = false;
    this.round += 1;
    this.debt = debtForRound(this.round);
    this.streak = 0;
    this.spinsLeft = SPINS_PER_ROUND;
    this.updateRecord();
    this.flipNote();
    this.popSpinLamps();
    this.flashLamps(LAMP_GREEN, NEW_ROUND_LAMPS_TIME);
    this.refreshHud();
  }

  /** Фишек не хватает: рука сжимается в кулак, экран гаснет, а когда загорается — на автомате GOOD LUCK. */
  private goodLuck(): void {
    this.isGameOver = true;
    this.hand.setTexture(HAND_FIST_TEXTURE);
    const camera = this.cameras.main;
    camera.shake(300, 0.01);
    camera.fadeOut(BLACKOUT_TIME, 0, 0, 0);
    camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      camera.setScroll(0, 0); // вид снова на автомате
      this.hand.setX(HAND_IN_X);
      this.demandChip.setAlpha(0);
      this.demandText.setAlpha(0);
      this.showGoodLuck();
      camera.fadeIn(BLACKOUT_TIME);
    });
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

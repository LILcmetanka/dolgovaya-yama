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
  createLeverTextures,
  createPatternTextures,
  createSymbolTextures,
  drawMachineBody,
  drawNoteTexture,
  drawRoom,
  FONT,
  LAMP_OFF,
  LEVER_BALL_TEXTURE,
  LEVER_ROD_TEXTURE,
  NOTE_TEXTURE,
  patternTexture,
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
// Временная кнопка «ЗАБРАТЬ»: в шаге 3 её заменит лоток.
const TAKE_BUTTON_X = 590;
const TAKE_BUTTON_Y = 552;
const BUTTON_WIDTH = 240;
const BUTTON_HEIGHT = 64;
const BUTTON_PRESS = 6; // на сколько px кнопка вдавливается (столько же видно её тени)

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
const BANNER_DELAY = 400; // пауза, чтобы «+36» долетело до табло, перед «ДОЛГ ЗАКРЫТ!»
const DEBT_CLOSED_TIME = 1000; // сколько держится «ДОЛГ ЗАКРЫТ!»
const GAME_OVER_DELAY = 700; // пауза перед экраном проигрыша, чтобы увидеть последнюю прокрутку
const RESTART_SPACE_DELAY = 800; // Пробел перезапускает игру не раньше, чем через столько
const NOTE_FLIP_TIME = 140; // половина переворота записки
const MULTIPLIER_FLASH_TIME = 600; // сколько окошко множителя горит красным после черепов

// Лампочки на корпусе.
const LAMP_TICK = 90; // как часто обновляются бегущие огни, мс
const LAMP_IDLE_SPEED = 4; // в покое огонёк сдвигается раз в 4 тика, при событиях — каждый тик
const LAMP_GOLD = 0xfde047;
const LAMP_RED = 0xef4444;
const LAMP_GREEN = 0x4ade80;
const SPIN_LAMP_RIM = 0x1c1917; // ободок лампочки прокрутки

const LOW_SPINS = 3; // столько прокруток или меньше — оставшиеся лампочки красные
const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage

// Слои: чем больше число, тем выше лежит объект.
const COIN_DEPTH = 5;
const POPUP_DEPTH = 10;
const BANNER_DEPTH = 20;
const GAME_OVER_DEPTH = 30;

// Внешний вид.
const SKULL_BORDER = 0xef4444; // рамка паттерна из черепов
const WIN_BORDER = 0xfde047; // рамка выигравшего паттерна
const SPIN_COLOR = 0xea580c; // кнопка «ЗАНОВО»
const BUTTON_BORDER = 0xfbbf24;
const TAKE_COLOR = 0x16a34a;
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
  private coinEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private boardText!: Phaser.GameObjects.Text; // табло: сколько внесено
  private multiplierText!: Phaser.GameObjects.Text; // окошко множителя серии
  private note!: Phaser.GameObjects.Image; // записка с долгом: бумажка с надписями одной картинкой
  private leverRod!: Phaser.GameObjects.Image; // штанга рычага, низ — точка вращения
  private leverBall!: Phaser.GameObjects.Image; // шарик на конце штанги
  private takeButton!: Button;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetState();
    drawRoom(this);
    createCoinTexture(this);
    createIconTextures(this);
    createLeverTextures(this, LEVER_ROD_LENGTH);
    createSymbolTextures(this, SYMBOLS, CELL_SIZE, CELL_RADIUS);
    createPatternTextures(this, PATTERNS);
    this.drawNote();
    this.drawMachine();
    this.drawBoard();
    this.drawPatternPanel();
    this.drawGrid();
    this.drawSpinLamps();
    this.drawMultiplier();
    this.drawTakeButton();
    this.drawLever();
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

  /**
   * Записка с долгом на стене: бумажка, «ДОЛГ» и сумма — одна картинка, нарисованная в decor.ts.
   * Надписи нарисованы прямо на бумажке: Phaser 4 обрезает текст в повёрнутом контейнере, а картинку — нет.
   */
  private drawNote(): void {
    drawNoteTexture(this, NOTE.width, NOTE.height, this.debt);
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
      leverMount: LEVER_MOUNT,
    });
    this.lamps = createLamps(this, SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height);
    this.time.addEvent({ delay: LAMP_TICK, loop: true, callback: () => this.tickLamps() });
  }

  /** Табло сверху: монетка и сколько внесено в долг. Сюда летят забранные деньги. */
  private drawBoard(): void {
    this.add.image(DISPLAY.x - 84, DISPLAY.y, COIN_TEXTURE).setScale(1.5);
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

  /** Временная кнопка «ЗАБРАТЬ» на корпусе: на ней виден кон. В шаге 3 её заменит лоток. */
  private drawTakeButton(): void {
    this.takeButton = this.makeButton(TAKE_BUTTON_X, TAKE_BUTTON_Y, TAKE_COLOR, 'Enter', () => this.take(), COINS_ICON);
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

  /**
   * Кнопка автомата: тень, корпус с золотой рамкой, блик сверху, иконка (если есть),
   * крупная надпись и под ней клавиша. Нажимается и мышью, и пальцем.
   */
  private makeButton(x: number, y: number, color: number, keyHint: string, onPress: () => void, icon?: string): Button {
    const shadow = this.add.rectangle(x, y + BUTTON_PRESS, BUTTON_WIDTH, BUTTON_HEIGHT, 0x000000, 0.45).setRounded(18);
    // Всё остальное рисуем относительно центра кнопки и кладём в контейнер.
    const box = this.add.rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, color).setRounded(18).setStrokeStyle(3, BUTTON_BORDER);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', onPress);
    const gloss = this.add.rectangle(0, -BUTTON_HEIGHT / 4, BUTTON_WIDTH - 16, BUTTON_HEIGHT / 2 - 8, 0xffffff, 0.16).setRounded(12);
    const textX = icon ? 20 : 0; // с иконкой надписи сдвинуты вправо
    const label = this.addText(textX, -9, '', {
      fontSize: '22px',
      fontStyle: 'bold',
      stroke: 'rgba(0, 0, 0, 0.35)',
      strokeThickness: 3,
    }).setOrigin(0.5);
    const key = this.addText(textX, 21, keyHint, { fontSize: '13px', color: 'rgba(255, 255, 255, 0.75)' }).setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [box, gloss, label, key];
    if (icon) parts.push(this.add.image(-BUTTON_WIDTH / 2 + 32, 0, icon));
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

  /** Обновить табло, окошко множителя, кнопку и лампочки по текущему состоянию. */
  private refreshHud(): void {
    this.boardText.setText(String(this.paid));
    this.multiplierText.setText(`×${multiplierForStreak(this.streak)}`);
    this.takeButton.label.setText(`ЗАБРАТЬ ${this.pot}`);
    this.setButtonEnabled(this.takeButton, this.canAct() && this.pot > 0);
    this.refreshSpinLamps();
  }

  /** Горит столько лампочек, сколько прокруток осталось. Когда их мало — оставшиеся красные. */
  private refreshSpinLamps(): void {
    const litColor = this.spinsLeft <= LOW_SPINS ? LAMP_RED : LAMP_GOLD;
    this.spinLamps.forEach((lamp, index) => lamp.setFillStyle(index < this.spinsLeft ? litColor : LAMP_OFF));
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
      onYoyo: () => drawNoteTexture(this, NOTE.width, NOTE.height, this.debt),
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

  /** «+36» летит с кнопки «ЗАБРАТЬ» в табло, там брызгают монетки и табло подпрыгивает. */
  private flyToBoard(amount: number): void {
    const label = this.addText(TAKE_BUTTON_X, TAKE_BUTTON_Y, `+${amount}`, { ...POPUP_STYLE, color: GREEN_TEXT })
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
        this.coinEmitter.explode(8, DISPLAY.x, DISPLAY.y); // монетки брызгают из табло
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

  /** Пробел: в игре — дёрнуть рычаг, после проигрыша — «заново», но не раньше чем через 0,8 с. */
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
    if (lost > 0) this.showPopup(`−${lost}`, RED_TEXT); // сколько сгорело с кона
  }

  /** Выигрыш паттернов × множитель идёт на кон. Пусто — ничего не происходит. */
  private addToPot(result: SpinResult, multiplier: number): void {
    if (result.kind === 'nothing') return;
    const gain = winWithMultiplier(result.win, multiplier);
    this.pot += gain;
    this.highlightHits(result.hits, WIN_BORDER);
    this.showPopup(formatWin(result.win, multiplier, gain), GOLD_TEXT);
    this.burstCoins(gain);
    this.flashLamps(LAMP_GOLD, 900);
    this.pulseText(this.takeButton.label, 1.2); // кон на кнопке «ЗАБРАТЬ» вырос
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

  /** Кон переходит во «внесено» и летит в табло, серия обрывается. */
  private payPot(): void {
    const amount = this.pot;
    this.paid += amount;
    this.pot = 0;
    this.streak = 0;
    this.flyToBoard(amount);
  }

  /** Долг закрыт, как только внесено не меньше долга. */
  private isDebtPaid(): boolean {
    return this.paid >= this.debt;
  }

  /** Долг закрыт: «+36» долетает до табло, на секунду крупно «ДОЛГ ЗАКРЫТ!», потом следующий раунд. */
  private closeDebt(): void {
    this.isRoundOver = true;
    this.time.delayedCall(BANNER_DELAY, () => this.showDebtClosedBanner());
    this.time.delayedCall(BANNER_DELAY + DEBT_CLOSED_TIME, () => this.startNextRound());
  }

  /**
   * Следующий раунд: новый долг на записке, множитель ×1, излишек идёт в новый долг.
   * Излишка хватает и на новый долг — он тоже закрывается, иначе прокрутки снова полные.
   */
  private startNextRound(): void {
    this.isRoundOver = false;
    this.paid -= this.debt; // остаётся излишек
    this.round += 1;
    this.debt = debtForRound(this.round);
    this.streak = 0;
    this.updateRecord();
    this.flipNote();
    if (this.isDebtPaid()) {
      this.closeDebt();
    } else {
      this.spinsLeft = SPINS_PER_ROUND; // оставшиеся прокрутки прошлого раунда сгорают
      this.popSpinLamps();
    }
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

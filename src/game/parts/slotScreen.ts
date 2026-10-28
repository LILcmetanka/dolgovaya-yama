import Phaser from 'phaser';
import type { MachineCharacter } from '../characters';
import {
  characterTexture,
  createLamps,
  createPatternTextures,
  createRustTexture,
  createSymbolTextures,
  patternTexture,
  RUST_TEXTURE,
  symbolTexture,
} from '../decor';
import { t } from '../lang';
import { CELL_RADIUS, CELL_SIZE, cellX, cellY, GLASS, GRID_Y, PHASE_TITLE_Y, SCREEN } from '../layout';
import { PATTERNS, type PatternHit } from '../patterns';
import { GRID_COLUMNS, GRID_ROWS, isPaying, randomSymbol, SYMBOLS, type Grid, type SlotSymbol, type WeightOf } from '../rules';
import type { Sfx } from '../sound';
import { addText, GOLD_TEXT, GREEN_TEXT, LAMP_GOLD, LAMP_OFF, LAMP_RED, POPUP_DEPTH, POPUP_STYLE, RED_TEXT } from '../theme';

// Стекло с паттернами: схемы рядами по 7.
const PATTERN_COLUMNS = 7;
const PATTERN_STEP_X = 70; // от центра схемы до центра соседней
const PATTERN_STEP_Y = 36;
const PATTERN_ICON_OFFSET = -14; // схема — левее середины места, «×N» — правее
const PATTERN_TEXT_OFFSET = 8;
// Новость «новый символ»: клетка символа крупно над сеткой.
const NEWS_SCALE = 1.7;
const NEWS_TIME = 1800; // сколько видно новость, мс
// Новость на стекле с паттернами — «ФАЗА 2», «НА ДОЛГ ХВАТАЕТ» (экран может быть занят новостью о символе).
const GLASS_NEWS_TIME = 2600; // сколько видно, мс
const GLASS_BLINK_TIME = 200; // мигает трижды
const PHASE_FONT_SIZE = '40px'; // под надписью — знаки фазы, поэтому она в верхней половине стекла
const DEBT_FONT_SIZE = '36px'; // надпись длиннее — мельче, чтобы влезла на стекло
const MACHINE_FONT_SIZE = '36px'; // новый автомат: его значок и название
const NEWS_ICON_SCALE = 1.5; // значок автомата в новости — крупнее, чем на корпусе
const NEWS_ICON_GAP = 12; // между значком и названием
const LOCK_SHADE = 0.5; // столбец с замком темнеет: прозрачность тени
// Ржавый автомат: столбец заржавел — в следующей прокрутке он не крутится, а дёргается на месте.
const RUST_SHOW_TIME = 250; // ржавчина проступает, мс
const RUST_HIDE_TIME = 300; // и сходит после прокрутки, мс
const SHUDDER_DISTANCE = 3; // столбец дёргается на столько px
const SHUDDER_TIME = 45; // одно движение, мс
const SHUDDERS = 3;
// Прокрутка: время в мс, расстояние в px.
const FLICKER_DELAY = 60; // как часто меняются символы, пока столбец крутится
const FIRST_STOP_TIME = 400; // когда останавливается первый (левый) столбец
const STOP_STEP = 120; // каждый следующий столбец останавливается на столько позже
const RESULT_PAUSE = 200; // пауза между остановкой последнего столбца и итогом: подскок успевает закончиться
const BOUNCE_HEIGHT = 14; // высота подскока при остановке
// Рамки найденных паттернов.
const HIGHLIGHT_WIDTH = 6; // толщина рамки вокруг клеток
const WIN_BORDER = 0xfde047; // выигравший паттерн
const SKULL_BORDER = 0xef4444; // паттерн из черепов
const BLOCKED_BORDER = 0x38bdf8; // паттерн из черепов, который отбил щит
// Бегущие огни вокруг экрана.
const LAMP_TICK = 90; // как часто обновляются, мс
const LAMP_IDLE_SPEED = 4; // в покое огонёк сдвигается раз в 4 тика, при событиях — каждый тик

/** Высота столбца сетки: три клетки и промежутки между ними. */
function columnHeight(): number {
  return cellY(GRID_ROWS - 1) - cellY(0) + CELL_SIZE;
}

/** Когда останавливается столбец: левый первым, каждый следующий на STOP_STEP позже. */
function columnStopTime(col: number): number {
  return FIRST_STOP_TIME + col * STOP_STEP;
}

/** Символ клетки до первой прокрутки: платящие символы первого раунда вперемешку — (столбец + 2·ряд) по кругу, так паттернов нет. */
function startSymbol(row: number, col: number): SlotSymbol {
  const paying = SYMBOLS.filter((symbol) => isPaying(symbol) && symbol.unlockRound === 1);
  return paying[(col + 2 * row) % paying.length];
}

/**
 * Экран автомата: сетка 5×3, мелькание и остановка столбцов, рамки найденных паттернов,
 * стекло с паттернами над экраном и бегущие огни вокруг него.
 */
export class SlotScreen {
  private readonly scene: Phaser.Scene;
  private readonly lamps: Phaser.GameObjects.Arc[]; // бегущие огни вокруг экрана
  private readonly patternFrames: Phaser.GameObjects.Rectangle[]; // рамки схем на стекле, в порядке PATTERNS
  private readonly cells: Phaser.GameObjects.Image[][]; // клетки сетки: cells[ряд][столбец]
  private readonly cellHighlights: Phaser.GameObjects.Graphics; // рамки вокруг клеток найденных паттернов
  private readonly rust: Phaser.GameObjects.Image; // ржавчина на заевшем столбце
  private rustyColumn: number | null = null; // какой столбец заржавел: в следующей прокрутке он не крутится
  private lampTick = 0; // сколько раз огни уже обновились
  private lampSpeed = LAMP_IDLE_SPEED; // через сколько тиков огонёк сдвигается
  private lampColor = LAMP_GOLD; // каким цветом горят огни сейчас
  private calmColor = LAMP_GOLD; // каким цветом огни горят в покое
  private lampResetTimer?: Phaser.Time.TimerEvent; // когда вернуть огни в спокойный режим
  private readonly sfx: Sfx;

  constructor(scene: Phaser.Scene, sfx: Sfx) {
    this.scene = scene;
    this.sfx = sfx;
    createSymbolTextures(scene, SYMBOLS, CELL_SIZE, CELL_RADIUS);
    createPatternTextures(scene, PATTERNS);
    this.lamps = createLamps(scene, SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height);
    scene.time.addEvent({ delay: LAMP_TICK, loop: true, callback: () => this.tickLamps() });
    this.patternFrames = this.drawPatternGlass();
    this.cells = this.drawGrid();
    createRustTexture(scene, CELL_SIZE, columnHeight(), CELL_RADIUS);
    this.rust = scene.add.image(0, GRID_Y, RUST_TEXTURE).setVisible(false); // над клетками, под рамками выигрыша
    this.cellHighlights = scene.add.graphics();
  }

  /**
   * Стекло с паттернами над экраном: схема каждого паттерна и его ×, рядами по пять.
   * Цен символов на экране нет — игрок узнаёт их по опыту. Рамка схемы загорается, когда паттерн найден.
   */
  private drawPatternGlass(): Phaser.GameObjects.Rectangle[] {
    const rows = Math.ceil(PATTERNS.length / PATTERN_COLUMNS);
    return PATTERNS.map((pattern, index) => {
      const col = index % PATTERN_COLUMNS;
      const row = Math.floor(index / PATTERN_COLUMNS);
      const x = GLASS.x + (col - (PATTERN_COLUMNS - 1) / 2) * PATTERN_STEP_X;
      const y = GLASS.y + (row - (rows - 1) / 2) * PATTERN_STEP_Y;
      const frame = this.scene.add
        .rectangle(x, y, PATTERN_STEP_X - 6, PATTERN_STEP_Y - 4)
        .setRounded(6)
        .setVisible(false);
      this.scene.add.image(x + PATTERN_ICON_OFFSET, y, patternTexture(pattern)); // схема слева, «×N» справа
      const style = { fontSize: '14px', fontStyle: 'bold', color: GOLD_TEXT };
      addText(this.scene, x + PATTERN_TEXT_OFFSET, y, `×${pattern.multiplier}`, style).setOrigin(0, 0.5);
      return frame;
    });
  }

  /** Сетка 5×3: в каждой клетке картинка с готовой текстурой символа. */
  private drawGrid(): Phaser.GameObjects.Image[][] {
    const cells: Phaser.GameObjects.Image[][] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      const line: Phaser.GameObjects.Image[] = [];
      for (let col = 0; col < GRID_COLUMNS; col++) {
        line.push(this.scene.add.image(cellX(col), cellY(row), symbolTexture(startSymbol(row, col))));
      }
      cells.push(line);
    }
    return cells;
  }

  /**
   * Прокрутка: столбцы мелькают (символами, которые есть в автомате: weightOf) и встают на символы grid слева направо, потом — stopped().
   * Заржавевший столбец не крутится — дёргается на месте; после прокрутки ржавчина сходит.
   */
  spin(grid: Grid, weightOf: WeightOf, stopped: () => void): void {
    for (let col = 0; col < GRID_COLUMNS; col++) {
      if (col === this.rustyColumn) this.shudderColumn(col);
      else this.spinColumn(col, grid, weightOf);
    }
    this.scene.time.delayedCall(columnStopTime(GRID_COLUMNS - 1) + RESULT_PAUSE, () => {
      this.clearRust();
      stopped();
    });
  }

  /** Заржавевший столбец: рычаг дёрнули — он скрипит и дёргается, но не крутится (его символы остаются). */
  private shudderColumn(col: number): void {
    this.sfx.play('rust');
    for (let row = 0; row < GRID_ROWS; row++) {
      this.scene.tweens.add({
        targets: this.cells[row][col],
        x: cellX(col) + SHUDDER_DISTANCE,
        duration: SHUDDER_TIME,
        yoyo: true,
        repeat: SHUDDERS - 1,
      });
    }
  }

  /** Ржавый автомат: столбец col заржавел — проступает ржавчина, в следующей прокрутке он не крутится. */
  showRust(col: number): void {
    this.rustyColumn = col;
    this.scene.tweens.killTweensOf(this.rust);
    this.rust.setX(cellX(col)).setAlpha(0).setVisible(true);
    this.scene.tweens.add({ targets: this.rust, alpha: 1, duration: RUST_SHOW_TIME });
  }

  /** Ржавчина сходит: столбец снова крутится. */
  clearRust(): void {
    if (this.rustyColumn === null) return;
    this.rustyColumn = null;
    this.scene.tweens.add({ targets: this.rust, alpha: 0, duration: RUST_HIDE_TIME, onComplete: () => this.rust.setVisible(false) });
  }

  /** Один столбец: три клетки мелькают случайными символами, потом встают на итоговые. */
  private spinColumn(col: number, grid: Grid, weightOf: WeightOf): void {
    const flicker = this.scene.time.addEvent({
      delay: FLICKER_DELAY,
      loop: true,
      callback: () => {
        for (let row = 0; row < GRID_ROWS; row++) this.showSymbol(row, col, randomSymbol(weightOf));
      },
    });
    this.scene.time.delayedCall(columnStopTime(col), () => {
      flicker.remove();
      for (let row = 0; row < GRID_ROWS; row++) this.showSymbol(row, col, grid[row][col]);
      this.bounceColumn(col);
      this.sfx.play('stop');
    });
  }

  /** Показать символ в клетке: меняем только текстуру картинки — это дёшево, даже когда 15 клеток мелькают. */
  private showSymbol(row: number, col: number, symbol: SlotSymbol): void {
    this.cells[row][col].setTexture(symbolTexture(symbol));
  }

  /** Короткий подскок столбца при остановке. */
  private bounceColumn(col: number): void {
    for (let row = 0; row < GRID_ROWS; row++) {
      this.scene.tweens.add({
        targets: this.cells[row][col],
        y: cellY(row) - BOUNCE_HEIGHT,
        duration: 90,
        ease: 'Quad.easeOut',
        yoyo: true,
      });
    }
  }

  /** Выигравшие паттерны — в золотых рамках. */
  highlightWin(hits: PatternHit[]): void {
    this.highlight(hits, WIN_BORDER);
  }

  /** Паттерны из черепов — в красных рамках. */
  highlightSkulls(hits: PatternHit[]): void {
    this.highlight(hits, SKULL_BORDER);
  }

  /** Паттерны из черепов, которые отбил щит, — в синих рамках. */
  highlightBlocked(hits: PatternHit[]): void {
    this.highlight(hits, BLOCKED_BORDER);
  }

  /** Подсветить найденные паттерны: толстые рамки на клетках и рамки схем на стекле. */
  private highlight(hits: PatternHit[], color: number): void {
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

  /** Подсветить клетки (например, три билета на экране) рамкой цвета color. */
  highlightCells(cells: [number, number][], color: number): void {
    this.cellHighlights.lineStyle(HIGHLIGHT_WIDTH, color);
    for (const [row, col] of cells) {
      this.cellHighlights.strokeRoundedRect(cellX(col) - CELL_SIZE / 2, cellY(row) - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE, CELL_RADIUS);
    }
  }

  /** Новость: в автомат вошёл новый символ — его клетка крупно над сеткой и «НОВЫЙ СИМВОЛ» (злой — красное «ВНИМАНИЕ»), потом тает. */
  announce(symbol: SlotSymbol): void {
    const y = cellY(1);
    const cell = this.scene.add.image(SCREEN.x, y - 14, symbolTexture(symbol)).setDepth(POPUP_DEPTH).setScale(0.3);
    const title = t(symbol.isEvil ? 'warning' : 'newSymbol');
    const label = addText(this.scene, SCREEN.x, y + 66, title, { ...POPUP_STYLE, fontSize: '26px', color: symbol.isEvil ? RED_TEXT : GOLD_TEXT });
    label.setOrigin(0.5).setDepth(POPUP_DEPTH).setAlpha(0);
    this.scene.tweens.add({ targets: cell, scale: NEWS_SCALE, duration: 400, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: label, alpha: 1, duration: 300, delay: 200 });
    this.scene.tweens.add({
      targets: [cell, label],
      alpha: 0,
      delay: NEWS_TIME,
      duration: 400,
      onComplete: () => {
        cell.destroy();
        label.destroy();
      },
    });
    this.flashLamps(symbol.isEvil ? LAMP_RED : LAMP_GOLD, NEWS_TIME);
  }

  /** Новость о фазе: на стекле красное «ФАЗА 2» — в верхней половине, под ним место для знаков (их ставит MachinePanel). */
  announcePhase(number: number): void {
    this.newsOnGlass(`${t('phase')} ${number}`, RED_TEXT, PHASE_FONT_SIZE, PHASE_TITLE_Y);
  }

  /** Фишек на табло хватает на долг: на стекле зелёное «НА ДОЛГ ХВАТАЕТ» — дальше крутишь себе в плюс. */
  announceDebtCovered(): void {
    this.newsOnGlass(t('debtCovered'), GREEN_TEXT, DEBT_FONT_SIZE);
  }

  /** Пришёл новый автомат: на стекле его значок и название, например «💰 ЖАДНЫЙ». */
  announceMachine(character: MachineCharacter): void {
    this.newsOnGlass(t(character.name).toUpperCase(), GOLD_TEXT, MACHINE_FONT_SIZE, GLASS.y, characterTexture(character));
  }

  /**
   * Новость на стекле: его закрывает тёмная полоса, на ней (на высоте y) надпись цвета color мигает трижды и тает.
   * icon — картинка слева от надписи (значок автомата).
   */
  private newsOnGlass(text: string, color: string, fontSize: string, y = GLASS.y, icon?: string): void {
    const strip = this.scene.add.rectangle(GLASS.x, GLASS.y, GLASS.width, GLASS.height, 0x000000, 0.85).setRounded(10);
    const style = { ...POPUP_STYLE, fontSize, color };
    const label = addText(this.scene, GLASS.x, y, text, style).setOrigin(0.5);
    const parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [strip, label];
    if (icon) {
      const image = this.scene.add.image(0, y, icon).setScale(NEWS_ICON_SCALE);
      const width = image.displayWidth + NEWS_ICON_GAP + label.width; // значок и надпись вместе — по середине стекла
      image.setX(GLASS.x - width / 2 + image.displayWidth / 2);
      label.setX(GLASS.x + width / 2 - label.width / 2);
      parts.push(image);
    }
    for (const part of parts) part.setDepth(POPUP_DEPTH);
    this.scene.tweens.add({ targets: label, alpha: 0.25, duration: GLASS_BLINK_TIME, yoyo: true, repeat: 2 });
    this.scene.tweens.add({
      targets: parts,
      alpha: 0,
      delay: GLASS_NEWS_TIME,
      duration: 400,
      onComplete: () => {
        for (const part of parts) part.destroy();
      },
    });
  }

  /** Замок заблокировал столбцы: они темнеют до следующей прокрутки. */
  dimColumns(columns: number[]): void {
    const top = cellY(0) - CELL_SIZE / 2;
    const height = columnHeight();
    this.cellHighlights.fillStyle(0x000000, LOCK_SHADE);
    for (const col of columns) this.cellHighlights.fillRoundedRect(cellX(col) - CELL_SIZE / 2, top, CELL_SIZE, height, CELL_RADIUS);
  }

  /** Убрать подсветку прошлой прокрутки. */
  clearHighlights(): void {
    this.cellHighlights.clear();
    for (const frame of this.patternFrames) frame.setVisible(false);
  }

  /** Огоньки бегут по лампочкам: горит каждая третья, огонёк сдвигается раз в lampSpeed тиков. */
  private tickLamps(): void {
    this.lampTick += 1;
    const shift = Math.floor(this.lampTick / this.lampSpeed);
    this.lamps.forEach((lamp, index) => lamp.setFillStyle((index + shift) % 3 === 0 ? this.lampColor : LAMP_OFF));
  }

  /** На время перекрасить бегущие огни и пустить их быстрее: выигрыш, черепа, отданный долг. */
  flashLamps(color: number, duration: number): void {
    this.lampColor = color;
    this.lampSpeed = 1;
    this.lampResetTimer?.remove();
    this.lampResetTimer = this.scene.time.delayedCall(duration, () => {
      this.lampColor = this.calmColor;
      this.lampSpeed = LAMP_IDLE_SPEED;
    });
  }

  /** Каким цветом огни горят в покое: обычно золотом, пока действует чеснок — бледно-зелёным. */
  setCalmColor(color: number): void {
    this.calmColor = color;
    this.lampColor = color;
  }
}

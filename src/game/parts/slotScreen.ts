import Phaser from 'phaser';
import type { MachineSpec } from '../machines';
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
import { CELL_RADIUS, CELL_SIZE, CELL_STEP, cellX, cellY, GLASS, GRID_Y, PHASE_TITLE_Y, SCREEN } from '../layout';
import { PATTERNS, type Pattern, type PatternHit } from '../patterns';
import { GRID_COLUMNS, GRID_ROWS, isPaying, randomSymbol, SYMBOLS, type Grid, type SlotSymbol, type WeightOf } from '../rules';
import type { Sfx } from '../sound';
import { addText, GOLD_TEXT, GREEN_TEXT, LAMP_GOLD, LAMP_OFF, LAMP_RED, LED_STYLE, POPUP_DEPTH, POPUP_STYLE, RED_TEXT } from '../theme';

// Стекло с паттернами: схемы рядами по 7.
const PATTERN_COLUMNS = 7;
const PATTERN_STEP_X = 70; // от центра схемы до центра соседней
const PATTERN_STEP_Y = 36;
const PATTERN_TEXT_GAP = 3; // от схемы до «×N»; схема и «×N» вместе стоят посередине места
// «×N» — узким шрифтом цифр табло: так и «×10» влезает в рамку, и ширина одна на любом компьютере.
const PATTERN_TEXT_STYLE = { fontFamily: LED_STYLE.fontFamily, fontSize: '13px', fontStyle: 'bold', color: GOLD_TEXT };
const PATTERN_FRAME = { width: 64, height: 28 }; // рамка схемы — вокруг схемы и «×N»; от соседней — зазор
const PATTERN_FRAME_LINE = 2; // толщина рамки
const PATTERN_FRAME_DIM = 0x8a7440; // тусклая обводка открытого паттерна: он есть на стекле, но сейчас не выпал
// Новый паттерн выпал впервые: схема проступает на стекле, рамка на миг вспыхивает золотом.
const PATTERN_REVEAL_TIME = 260; // столько проступают схема и «×N», мс
const PATTERN_NEWS_FONT_SIZE = '30px'; // «НОВЫЙ ПАТТЕРН ×N» на стекле
const SCORE_NEWS_FONT_SIZE = '28px'; // «НАБРАНО 100 000 · 10% ЦЕЛИ» и джекпот: надпись длинная — мельче
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
// Замороженный столбец (последний шанс): голубой лёд поверх клеток, действий не тратит.
const FREEZE_FILL = 0x38bdf8;
const FREEZE_ALPHA = 0.16;
const FREEZE_EDGE = 0x7dd3fc;
const FREEZE_EDGE_ALPHA = 0.85;
const FREEZE_EDGE_WIDTH = 2;
// Выбор клетки или столбца после прокрутки (перемешка и подмена, шаг 63б).
const PICK_BORDER = 0xfde047; // обводка того, что выделили мышью
const PICK_BORDER_WIDTH = 6; // толщина, как у рамок найденных паттернов
const PICK_GLOW_WIDTH = PICK_BORDER_WIDTH * 2; // второй, мягкий проход — свечение вокруг, его видно в зазоре
const PICK_GLOW_ALPHA = 0.35;
const PICK_OUTSET = (CELL_STEP - CELL_SIZE) / 2; // 3: половина зазора — обводка ложится в зазор, а не под соседние клетки
const REROLL_STOP_TIME = 650; // перекрут столбца перемешкой: мелькает и встаёт, мс
const REVEAL_TIME = 260; // подскок клетки, в которую подмена поставила джокера, мс
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

/** Схема паттерна на стекле: рамка, иконка формы и подпись «×N». Видно всё это, только когда паттерн открыт. */
interface PatternSlot {
  id: string;
  frame: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

/** Живая новость на стекле: её картинки (полоса, надпись, значок) и твины — чтобы снять её посреди показа. */
interface GlassNews {
  parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text | Phaser.GameObjects.Image)[];
  tweens: Phaser.Tweens.Tween[];
}

/**
 * Экран автомата: сетка 5×3, мелькание и остановка столбцов, рамки найденных паттернов,
 * стекло с паттернами над экраном и бегущие огни вокруг него.
 */
export class SlotScreen {
  private readonly scene: Phaser.Scene;
  private readonly lamps: Phaser.GameObjects.Arc[]; // бегущие огни вокруг экрана
  private readonly patternSlots: PatternSlot[]; // схемы на стекле, в порядке PATTERNS
  private readonly openPatterns = new Set<string>(); // какие паттерны открыты: только их схемы видно на стекле
  onPatternLanded?: (pattern: Pattern) => void; // паттерн выпал на сетке: сцена решает, открывать ли его
  private readonly cells: Phaser.GameObjects.Image[][]; // клетки сетки: cells[ряд][столбец]
  private readonly cellHighlights: Phaser.GameObjects.Graphics; // рамки вокруг клеток найденных паттернов
  private readonly pickHighlight: Phaser.GameObjects.Graphics; // обводка клетки или столбца под мышью, пока выбирают
  private readonly freezeFrames: Phaser.GameObjects.Rectangle[]; // лёд на замороженных столбцах (последний шанс)
  private readonly zones: Phaser.GameObjects.Zone[][]; // невидимые клик-зоны клеток: ловят мышь, только пока выбирают
  private pickMode: 'column' | 'cell' | null = null; // что выбирают сейчас; null — выбора нет
  private pickCallback: ((row: number, col: number) => void) | null = null; // кому отдать выбранную клетку
  private readonly rust: Phaser.GameObjects.Image; // ржавчина на заевшем столбце
  private rustyColumn: number | null = null; // какой столбец заржавел: в следующей прокрутке он не крутится
  private lampTick = 0; // сколько раз огни уже обновились
  private lampSpeed = LAMP_IDLE_SPEED; // через сколько тиков огонёк сдвигается
  private lampColor = LAMP_GOLD; // каким цветом горят огни сейчас
  private calmColor = LAMP_GOLD; // каким цветом огни горят в покое
  private lampResetTimer?: Phaser.Time.TimerEvent; // когда вернуть огни в спокойный режим
  private readonly sfx: Sfx;
  private isPatternNewsShown = false; // за одну прокрутку — одна новость о паттерне (полосы иначе накладываются)
  // Живая новость на стекле: одна за раз. Новая зовёт removeNews — прежнюю гасим сразу, не дожидаясь её таймера.
  private news: GlassNews | null = null;

  constructor(scene: Phaser.Scene, sfx: Sfx) {
    this.scene = scene;
    this.sfx = sfx;
    createSymbolTextures(scene, SYMBOLS, CELL_SIZE, CELL_RADIUS);
    createPatternTextures(scene, PATTERNS);
    this.lamps = createLamps(scene, SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height);
    scene.time.addEvent({ delay: LAMP_TICK, loop: true, callback: () => this.tickLamps() });
    this.patternSlots = this.drawPatternGlass();
    this.cells = this.drawGrid();
    createRustTexture(scene, CELL_SIZE, columnHeight(), CELL_RADIUS);
    this.rust = scene.add.image(0, GRID_Y, RUST_TEXTURE).setVisible(false); // над клетками, под рамками выигрыша
    // Слои: рамки найденных паттернов (2) — выше обводки выбора (1), чтобы не перекрывать их; обе выше клеток (0).
    this.cellHighlights = scene.add.graphics().setDepth(2);
    this.pickHighlight = scene.add.graphics().setDepth(1);
    this.freezeFrames = this.drawFreezeFrames();
    this.zones = this.drawPickZones();
  }

  /**
   * Стекло с паттернами над экраном: схема каждого паттерна и его ×, рядами по семь.
   * Цен символов на экране нет — игрок узнаёт их по опыту. Пока паттерн не выпадал, его места на стекле нет:
   * там пусто, ни рамки, ни схемы, ни «×N». Позиции схем не сдвигаются — стекло всегда одной сетки.
   */
  private drawPatternGlass(): PatternSlot[] {
    const rows = Math.ceil(PATTERNS.length / PATTERN_COLUMNS);
    return PATTERNS.map((pattern, index) => {
      const col = index % PATTERN_COLUMNS;
      const row = Math.floor(index / PATTERN_COLUMNS);
      const x = GLASS.x + (col - (PATTERN_COLUMNS - 1) / 2) * PATTERN_STEP_X;
      const y = GLASS.y + (row - (rows - 1) / 2) * PATTERN_STEP_Y;
      const frame = this.scene.add
        .rectangle(x, y, PATTERN_FRAME.width, PATTERN_FRAME.height)
        .setRounded(6)
        .setStrokeStyle(PATTERN_FRAME_LINE, PATTERN_FRAME_DIM)
        .setVisible(false);
      // Схема слева, «×N» справа — вместе посередине рамки.
      const icon = this.scene.add.image(0, y, patternTexture(pattern)).setOrigin(0, 0.5).setVisible(false);
      const label = addText(this.scene, 0, y, `×${pattern.multiplier}`, PATTERN_TEXT_STYLE).setOrigin(0, 0.5).setVisible(false);
      const left = Math.round(x - (icon.width + PATTERN_TEXT_GAP + label.width) / 2);
      icon.setX(left);
      label.setX(left + icon.width + PATTERN_TEXT_GAP);
      return { id: pattern.id, frame, icon, label };
    });
  }

  /** Место паттерна на стекле: у каждого своё, в порядке PATTERNS. */
  private slotOf(pattern: Pattern): PatternSlot | undefined {
    const index = PATTERNS.indexOf(pattern);
    return index < 0 ? undefined : this.patternSlots[index];
  }

  /** Открыт ли паттерн: его схема видна на стекле. */
  private isOpen(id: string): boolean {
    return this.openPatterns.has(id);
  }

  /** Открытый паттерн: видны рамка, схема и «×N»; неоткрытый — пустое место (ни рамки, ни знака вопроса). */
  private showSlot(slot: PatternSlot): void {
    const isOpen = this.isOpen(slot.id);
    slot.frame.setVisible(isOpen).setStrokeStyle(PATTERN_FRAME_LINE, PATTERN_FRAME_DIM);
    slot.icon.setVisible(isOpen).setAlpha(1);
    slot.label.setVisible(isOpen).setAlpha(1);
  }

  /** Какой набор паттернов открыт: у остальных схем на стекле нет. Позиции схем не меняются. */
  setPatterns(open: readonly string[]): void {
    this.openPatterns.clear();
    for (const id of open) this.openPatterns.add(id);
    for (const slot of this.patternSlots) this.showSlot(slot);
  }

  /** Паттерн выпал впервые: схема проступает на стекле и подпрыгивает, как попап. */
  revealPattern(pattern: Pattern): void {
    const slot = this.slotOf(pattern);
    if (!slot) return;
    this.openPatterns.add(pattern.id);
    this.showSlot(slot);
    slot.icon.setAlpha(0);
    slot.label.setAlpha(0);
    this.scene.tweens.add({ targets: [slot.icon, slot.label], alpha: 1, duration: PATTERN_REVEAL_TIME, ease: 'Quad.easeOut' });
    const y = slot.frame.y;
    this.scene.tweens.add({
      targets: [slot.frame, slot.icon, slot.label],
      y: y - BOUNCE_HEIGHT,
      duration: PATTERN_REVEAL_TIME / 2,
      ease: 'Quad.easeOut',
      yoyo: true,
    });
  }

  /** Пять ледяных рамок по столбцам: их показывает showFrozen, когда игрок замораживает столбец в последнем шансе. */
  private drawFreezeFrames(): Phaser.GameObjects.Rectangle[] {
    const top = cellY(0) - CELL_SIZE / 2;
    const height = columnHeight();
    return Array.from({ length: GRID_COLUMNS }, (_, col) =>
      this.scene.add
        .rectangle(cellX(col), top + height / 2, CELL_SIZE, height, FREEZE_FILL, FREEZE_ALPHA)
        .setRounded(CELL_RADIUS)
        .setStrokeStyle(FREEZE_EDGE_WIDTH, FREEZE_EDGE, FREEZE_EDGE_ALPHA)
        .setDepth(3) // выше рамок выигрыша: лёд видно всегда
        .setVisible(false),
    );
  }

  /** Замороженные столбцы: голубой лёд поверх клеток. Пустой список — снять лёд со всех. */
  showFrozen(columns: number[]): void {
    this.freezeFrames.forEach((frame, col) => frame.setVisible(columns.includes(col)));
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
   * Пятнадцать невидимых клик-зон — по одной на клетку. Созданы сразу и выключены: включаются, только когда
   * игрок выбирает столбец (перемешка) или клетку (подмена), иначе они перехватывали бы клики по сетке.
   * Размер — с шаг клетки, а не с клетку: соседние зоны смыкаются, и в зазорах между клетками нет мёртвых полос,
   * где обводка выбора пропадала бы под курсором.
   */
  private drawPickZones(): Phaser.GameObjects.Zone[][] {
    const zones: Phaser.GameObjects.Zone[][] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      const line: Phaser.GameObjects.Zone[] = [];
      for (let col = 0; col < GRID_COLUMNS; col++) {
        const zone = this.scene.add.zone(cellX(col), cellY(row), CELL_STEP, CELL_STEP);
        zone.setInteractive({ useHandCursor: true });
        zone.disableInteractive();
        zone.on('pointerover', () => this.showPickHover(row, col));
        zone.on('pointerout', () => this.pickHighlight.clear());
        zone.on('pointerdown', () => this.pickCallback?.(row, col));
        line.push(zone);
      }
      zones.push(line);
    }
    return zones;
  }

  /**
   * Начать выбор: column — игрок выбирает столбец (наведение обводит все три клетки), cell — одну клетку.
   * Выбранную клетку (ряд, столбец) получает pick.
   */
  beginPick(mode: 'column' | 'cell', pick: (row: number, col: number) => void): void {
    this.pickMode = mode;
    this.pickCallback = pick;
    for (const line of this.zones) for (const zone of line) zone.setInteractive({ useHandCursor: true });
  }

  /** Выбор кончился (сделали, пропустили или вышло время): зоны снова выключены, обводка снята. */
  endPick(): void {
    this.pickMode = null;
    this.pickCallback = null;
    this.pickHighlight.clear();
    for (const line of this.zones) for (const zone of line) zone.disableInteractive();
  }

  /** Обводка того, на что показывает мышь: весь столбец (column) или одна клетка (cell). */
  private showPickHover(row: number, col: number): void {
    this.pickHighlight.clear();
    const size = CELL_SIZE + 2 * PICK_OUTSET; // рамка идёт по зазору вокруг клетки, а не по её краю
    if (this.pickMode === 'column') {
      const top = cellY(0) - CELL_SIZE / 2 - PICK_OUTSET;
      this.strokePick(cellX(col) - CELL_SIZE / 2 - PICK_OUTSET, top, size, columnHeight() + 2 * PICK_OUTSET);
    } else if (this.pickMode === 'cell') {
      const left = cellX(col) - CELL_SIZE / 2 - PICK_OUTSET;
      this.strokePick(left, cellY(row) - CELL_SIZE / 2 - PICK_OUTSET, size, size);
    }
  }

  /** Обводка выбора в два прохода: мягкое свечение пошире и яркая линия — в зазоре между клетками её хорошо видно. */
  private strokePick(x: number, y: number, width: number, height: number): void {
    const radius = CELL_RADIUS + PICK_OUTSET;
    this.pickHighlight.lineStyle(PICK_GLOW_WIDTH, PICK_BORDER, PICK_GLOW_ALPHA);
    this.pickHighlight.strokeRoundedRect(x, y, width, height, radius);
    this.pickHighlight.lineStyle(PICK_BORDER_WIDTH, PICK_BORDER);
    this.pickHighlight.strokeRoundedRect(x, y, width, height, radius);
  }

  /**
   * Перемешка (шаг 63б): один столбец перекручивается заново — три клетки мелькают символами этой прокрутки (weightOf)
   * и встают на symbolAt. Длительность — REROLL_STOP_TIME, потом stopped().
   */
  rerollColumn(col: number, weightOf: WeightOf, symbolAt: (row: number) => SlotSymbol, stopped: () => void): void {
    this.spinColumn(col, weightOf, (row) => symbolTexture(symbolAt(row)), REROLL_STOP_TIME, stopped);
  }

  /** Подмена (шаг 63б): клетка показывает новый символ с подскоком, потом done(). */
  revealCell(row: number, col: number, symbol: SlotSymbol, done: () => void): void {
    this.showSymbol(row, col, symbol);
    this.scene.tweens.add({
      targets: this.cells[row][col],
      y: cellY(row) - BOUNCE_HEIGHT,
      duration: REVEAL_TIME / 2,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: done,
    });
  }

  /**
   * Прокрутка: столбцы мелькают (символами, которые есть в автомате: weightOf) и встают на символы grid слева направо, потом — stopped().
   * Заржавевший столбец не крутится — дёргается на месте; после прокрутки ржавчина сходит.
   */
  spin(grid: Grid, weightOf: WeightOf, stopped: () => void): void {
    for (let col = 0; col < GRID_COLUMNS; col++) {
      if (col === this.rustyColumn) this.shudderColumn(col);
      else this.spinColumn(col, weightOf, (row) => symbolTexture(grid[row][col]));
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

  /**
   * Один столбец: три клетки мелькают случайными символами, потом встают на итоговые картинки (finalTexture).
   * stopTime — когда он встаёт (обычно columnStopTime); stopped — что сделать после остановки (перекруту перемешки).
   */
  private spinColumn(
    col: number,
    weightOf: WeightOf,
    finalTexture: (row: number) => string,
    stopTime = columnStopTime(col),
    stopped?: () => void,
  ): void {
    const flicker = this.scene.time.addEvent({
      delay: FLICKER_DELAY,
      loop: true,
      callback: () => {
        for (let row = 0; row < GRID_ROWS; row++) this.showSymbol(row, col, randomSymbol(weightOf));
      },
    });
    this.scene.time.delayedCall(stopTime, () => {
      flicker.remove();
      for (let row = 0; row < GRID_ROWS; row++) this.showTexture(row, col, finalTexture(row));
      this.bounceColumn(col);
      this.sfx.play('stop');
      stopped?.();
    });
  }

  /** Показать символ в клетке: меняем только текстуру картинки — это дёшево, даже когда 15 клеток мелькают. */
  private showSymbol(row: number, col: number, symbol: SlotSymbol): void {
    this.cells[row][col].setTexture(symbolTexture(symbol)).setScale(1);
  }

  /** Показать в клетке готовую картинку под размер клетки: значок автомата меньше клетки, его растягиваем. */
  private showTexture(row: number, col: number, texture: string): void {
    const cell = this.cells[row][col].setTexture(texture).setScale(1);
    cell.setScale(CELL_SIZE / cell.displayWidth); // масштаб — по картинке: у символов и значков он разный
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
      // Выпавший паттерн — новый он или нет — открывает сцена (openPattern), повторы она отсекает сама.
      // Рамку красим после этого: у только что открытой схемы она сразу горит цветом удара.
      this.onPatternLanded?.(hit.pattern);
      const slot = this.slotOf(hit.pattern);
      if (slot && this.isOpen(slot.id)) slot.frame.setStrokeStyle(PATTERN_FRAME_LINE, color);
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

  /**
   * Паттерн выпал: на стекле «НОВЫЙ ПАТТЕРН ×N» — теперь его схема есть в наборе. isKnown — паттерн уже открывался
   * раньше (например, до отката кассетой): тогда новость без слова «новый», «ПАТТЕРН ×N».
   */
  announcePattern(pattern: Pattern, isKnown: boolean): void {
    // За одну прокрутку новых паттернов может выпасть несколько — полосы легли бы друг на друга.
    // Показываем только первый; флаг снимает clearHighlights в начале следующей прокрутки.
    if (this.isPatternNewsShown) return;
    this.isPatternNewsShown = true;
    this.newsOnGlass(t(isKnown ? 'patternKnown' : 'patternNew', pattern.multiplier), GOLD_TEXT, PATTERN_NEWS_FONT_SIZE);
  }

  /** Своя новость на стекле: порог набранных фишек, джекпот. Длинные надписи — мельче, чтобы влезли. */
  announceNews(text: string): void {
    this.newsOnGlass(text, GOLD_TEXT, SCORE_NEWS_FONT_SIZE);
  }

  /** Пришёл новый автомат: на стекле его значок и название, например «💰 ЖАДНЫЙ». */
  announceMachine(machine: MachineSpec): void {
    // У классического автомата значка нет — новость без картинки.
    const icon = machine.sign === '' ? undefined : characterTexture(machine);
    this.newsOnGlass(t(machine.name).toUpperCase(), GOLD_TEXT, MACHINE_FONT_SIZE, GLASS.y, icon);
  }

  /**
   * Новость на стекле: его закрывает тёмная полоса, на ней (на высоте y) надпись цвета color мигает трижды и тает.
   * icon — картинка слева от надписи (значок автомата).
   * На стекле живёт ОДНА новость: прежнюю снимаем сразу (без её таймера), новая встаёт на её место — иначе полосы
   * накладывались бы друг на друга (например «НОВЫЙ ПАТТЕРН» поверх «НА ДОЛГ ХВАТАЕТ»).
   */
  private newsOnGlass(text: string, color: string, fontSize: string, y = GLASS.y, icon?: string): void {
    this.removeNews();
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
    const alive: GlassNews = { parts, tweens: [] };
    alive.tweens.push(this.scene.tweens.add({ targets: label, alpha: 0.25, duration: GLASS_BLINK_TIME, yoyo: true, repeat: 2 }));
    alive.tweens.push(
      this.scene.tweens.add({
        targets: parts,
        alpha: 0,
        delay: GLASS_NEWS_TIME,
        duration: 400,
        onComplete: () => {
          if (this.news === alive) this.news = null;
          for (const part of parts) part.destroy();
        },
      }),
    );
    this.news = alive;
  }

  /** Убрать живую новость со стекла сразу: её твины останавливаем, полосу, надпись и значок уничтожаем. */
  private removeNews(): void {
    const alive = this.news;
    if (!alive) return;
    this.news = null;
    for (const tween of alive.tweens) tween.remove();
    for (const part of alive.parts) part.destroy();
  }

  /** Замок заблокировал столбцы: они темнеют до следующей прокрутки. */
  dimColumns(columns: number[]): void {
    const top = cellY(0) - CELL_SIZE / 2;
    const height = columnHeight();
    this.cellHighlights.fillStyle(0x000000, LOCK_SHADE);
    for (const col of columns) this.cellHighlights.fillRoundedRect(cellX(col) - CELL_SIZE / 2, top, CELL_SIZE, height, CELL_RADIUS);
  }

  /**
   * Убрать подсветку прошлой прокрутки. Схемы открытых паттернов при этом не гаснут: они на стекле, пока забег не начат заново
   * (это вызывают перед каждой прокруткой — RoundScene и CollectorScene), гаснет только цвет удара.
   */
  clearHighlights(): void {
    this.cellHighlights.clear();
    for (const slot of this.patternSlots) if (this.isOpen(slot.id)) slot.frame.setStrokeStyle(PATTERN_FRAME_LINE, PATTERN_FRAME_DIM);
    this.isPatternNewsShown = false; // новая прокрутка — снова есть право на одну новость о паттерне
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

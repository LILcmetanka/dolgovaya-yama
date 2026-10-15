import Phaser from 'phaser';
import { patternSize, type Pattern } from './patterns';
import { GRID_COLUMNS, GRID_ROWS, isSkull, type SlotSymbol } from './rules';

/**
 * Украшения «Долговой ямы»: тёмная комната, корпус автомата, рычаг, записка, лампочки, монетка,
 * клетки символов и схемы паттернов. Логики игры здесь нет. Картинок в проекте тоже нет — всё рисуется кодом.
 * Неподвижное рисуется один раз и «запекается» в текстуру: дальше это одна картинка, и игра идёт даже на слабом компьютере.
 */

/** Шрифт игры: в нём есть шрифты эмодзи. */
export const FONT = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
/** Цвет выключенной лампочки. */
export const LAMP_OFF = 0x431407;
/** Имена текстур, нарисованных кодом. */
export const COIN_TEXTURE = 'coin';
export const COINS_ICON = 'icon-coins';
export const LEVER_ROD_TEXTURE = 'lever-rod';
export const LEVER_BALL_TEXTURE = 'lever-ball';
export const NOTE_TEXTURE = 'note';
const ROOM_TEXTURE = 'room';
const MACHINE_TEXTURE = 'machine';
/** Комната: тёмная стена в полоску и пол. */
const WALL_COLOR = 0x15100d;
const FLOOR_COLOR = 0x090706;
const FLOOR_Y = 560; // где стена переходит в пол
/** Корпус автомата. */
const BODY_COLOR = 0x4c1111; // лицевая часть
const BODY_SIDE = 0x2b0909; // левый бок в тени — так корпус кажется объёмным
const TRIM_COLOR = 0xb45309; // бронзовая окантовка
const CHROME = 0x94a3b8;
const CHROME_LIGHT = 0xe2e8f0;
const SCREEN_GLASS = 0x020617; // почти чёрное стекло под сеткой
/** Записка с долгом. */
const NOTE_TAPE = 12; // скотч заходит на листок сверху, px
const NOTE_INK = '#334155'; // «ДОЛГ»
const NOTE_DEBT_INK = '#991b1b'; // сумма — красной ручкой
const NOTE_DEBT_FONT_SIZE = 44; // сумма крупно; длинная сумма уменьшается, чтобы влезть на листок
/** Клетка сетки: рамка обычного символа и рамка черепа. */
const CELL_BORDER = 0xe2e8f0;
const SKULL_CELL_BORDER = 0xef4444;
const CELL_BORDER_WIDTH = 3;
/** Схема паттерна — маленькая сетка 5×3: клетки паттерна золотые, остальные тёмные. */
const MINI_CELL = 7; // сторона клетки схемы, px
const MINI_GAP = 2; // промежуток между клетками схемы, px
const MINI_ON = 0xfde047;
const MINI_OFF = 0x334155;

/** Прямоугольник: x, y — его середина. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Где на корпусе какие части. Координаты задаёт GameScene: поверх этих мест он ставит живые объекты. */
export interface MachineLayout {
  body: Box; // корпус целиком, низ уходит за край экрана
  display: Box; // табло с монетами
  glass: Box; // стекло с паттернами
  screen: Box; // окно вокруг сетки 5×3
  belly: Box; // панель под экраном: лампочки прокруток, окошко множителя, кнопка
  multiplierWindow: Box; // окошко множителя серии
  leverMount: Box; // крепление рычага на правом боку
}

/** Тёмная комната: стена в полоску, плинтус, пол, тёплый отсвет от автомата и тёмные углы. */
export function drawRoom(scene: Phaser.Scene): void {
  if (!scene.textures.exists(ROOM_TEXTURE)) bakeRoom(scene);
  scene.add.image(0, 0, ROOM_TEXTURE).setOrigin(0);
}

/** Комната — в текстуру ROOM_TEXTURE. */
function bakeRoom(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(WALL_COLOR);
  g.fillRect(0, 0, 960, FLOOR_Y);
  g.fillStyle(0xffffff, 0.02); // обои: еле заметные вертикальные полосы
  for (let x = 0; x < 960; x += 48) g.fillRect(x, 0, 20, FLOOR_Y);
  g.fillStyle(0x241a14);
  g.fillRect(0, FLOOR_Y - 10, 960, 10); // плинтус
  g.fillStyle(FLOOR_COLOR);
  g.fillRect(0, FLOOR_Y, 960, 640 - FLOOR_Y);

  // Тёплый отсвет от огней автомата: полупрозрачные овалы друг в друге.
  for (let i = 0; i < 7; i++) {
    g.fillStyle(0xf59e0b, 0.025);
    g.fillEllipse(480, 300, 1000 - i * 110, 760 - i * 80);
  }
  // Тёмные углы: чёрные рамки, каждая следующая ближе к центру — края экрана темнее.
  for (let i = 0; i < 5; i++) {
    const inset = i * 26;
    g.lineStyle(52, 0x000000, 0.14);
    g.strokeRect(inset, inset, 960 - 2 * inset, 640 - 2 * inset);
  }
  g.generateTexture(ROOM_TEXTURE, 960, 640);
  g.destroy();
}

/**
 * Корпус автомата: тело, табло, стекло для паттернов, окно экрана, панель под экраном,
 * окошко множителя и крепление рычага. Всё это неподвижно — одна текстура на весь экран.
 */
export function drawMachineBody(scene: Phaser.Scene, layout: MachineLayout): void {
  if (!scene.textures.exists(MACHINE_TEXTURE)) bakeMachineBody(scene, layout);
  scene.add.image(0, 0, MACHINE_TEXTURE).setOrigin(0);
}

/** Корпус — в текстуру MACHINE_TEXTURE: части рисуются по очереди, от задних к передним. */
function bakeMachineBody(scene: Phaser.Scene, layout: MachineLayout): void {
  const g = scene.add.graphics();
  drawBody(g, layout.body);
  drawLeverMount(g, layout.leverMount);
  drawInset(g, layout.display, 0x050505, TRIM_COLOR);
  drawInset(g, layout.glass, 0x0b1120, TRIM_COLOR);
  drawScreenFrame(g, layout.screen);
  drawInset(g, layout.belly, 0x240808, 0x7c2d12);
  drawInset(g, layout.multiplierWindow, 0x050505, TRIM_COLOR);
  g.generateTexture(MACHINE_TEXTURE, 960, 640);
  g.destroy();
}

/** Левый верхний угол прямоугольника. */
function topLeft(box: Box): { left: number; top: number } {
  return { left: box.x - box.width / 2, top: box.y - box.height / 2 };
}

/** Тело корпуса: тень на стене, тёмный левый бок, лицевая часть и бронзовая окантовка. */
function drawBody(g: Phaser.GameObjects.Graphics, body: Box): void {
  const { left, top } = topLeft(body);
  const side = 16; // ширина бока в тени
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(left + 12, top + 10, body.width, body.height, 30); // тень на стене
  g.fillStyle(BODY_SIDE);
  g.fillRoundedRect(left, top, body.width, body.height, 30);
  g.fillStyle(BODY_COLOR);
  g.fillRoundedRect(left + side, top, body.width - side, body.height, 30);
  g.lineStyle(4, TRIM_COLOR);
  g.strokeRoundedRect(left + side + 8, top + 8, body.width - side - 16, body.height - 16, 24);
}

/** Утопленная панель: заливка, рамка и узкий блик сверху. */
function drawInset(g: Phaser.GameObjects.Graphics, box: Box, fill: number, border: number): void {
  const { left, top } = topLeft(box);
  g.fillStyle(fill);
  g.fillRoundedRect(left, top, box.width, box.height, 10);
  g.lineStyle(3, border);
  g.strokeRoundedRect(left, top, box.width, box.height, 10);
  g.fillStyle(0xffffff, 0.05);
  g.fillRoundedRect(left + 6, top + 4, box.width - 12, box.height * 0.3, 6);
}

/** Окно экрана: хромированная рамка и почти чёрное стекло под сеткой. */
function drawScreenFrame(g: Phaser.GameObjects.Graphics, screen: Box): void {
  const { left, top } = topLeft(screen);
  const frame = 8; // ширина хромированной рамки
  g.fillStyle(CHROME);
  g.fillRoundedRect(left - frame, top - frame, screen.width + 2 * frame, screen.height + 2 * frame, 22);
  g.fillStyle(SCREEN_GLASS);
  g.fillRoundedRect(left, top, screen.width, screen.height, 16);
}

/** Крепление рычага на правом боку: хромированная коробка с бликом и тёмная втулка посередине. */
function drawLeverMount(g: Phaser.GameObjects.Graphics, mount: Box): void {
  const { left, top } = topLeft(mount);
  g.fillStyle(CHROME);
  g.fillRoundedRect(left, top, mount.width, mount.height, 8);
  g.fillStyle(CHROME_LIGHT);
  g.fillRect(left + 6, top + 5, mount.width - 12, 4); // блик
  g.fillStyle(0x1f2937);
  g.fillCircle(mount.x, mount.y, 11); // втулка: отсюда растёт рычаг
}

/**
 * Рычаг из двух картинок: хромированная штанга (низ — точка вращения) и красный шарик.
 * Шарик отдельно, чтобы при рывке штанга укорачивалась, а шарик оставался круглым.
 */
export function createLeverTextures(scene: Phaser.Scene, rodLength: number): void {
  if (!scene.textures.exists(LEVER_ROD_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(CHROME);
    g.fillRoundedRect(0, 0, 10, rodLength, 4); // штанга
    g.fillStyle(CHROME_LIGHT);
    g.fillRect(2, 0, 3, rodLength); // блик на штанге
    g.generateTexture(LEVER_ROD_TEXTURE, 10, rodLength);
    g.destroy();
  }
  if (!scene.textures.exists(LEVER_BALL_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0x1f2937);
    g.fillCircle(22, 22, 21); // ободок шарика
    g.fillStyle(0xdc2626);
    g.fillCircle(22, 22, 18); // шарик
    g.fillStyle(0xfca5a5);
    g.fillCircle(16, 15, 6); // блик
    g.generateTexture(LEVER_BALL_TEXTURE, 44, 44);
    g.destroy();
  }
}

/**
 * Записка с долгом на canvas: листок в линейку, красное поле, скотч, «ДОЛГ» и сумма.
 * Надписи рисуются прямо на листке, поэтому записку можно повернуть одной картинкой.
 * Сумма меняется раз в раунд — тогда записка перерисовывается заново (canvas маленький, это дёшево).
 */
export function drawNoteTexture(scene: Phaser.Scene, width: number, height: number, debt: number): void {
  // Текстура уже есть — её создала эта же функция, значит это canvas: берём его и рисуем заново.
  const texture = scene.textures.exists(NOTE_TEXTURE)
    ? (scene.textures.get(NOTE_TEXTURE) as Phaser.Textures.CanvasTexture)
    : scene.textures.createCanvas(NOTE_TEXTURE, width, height);
  if (!texture) return;
  const ctx = texture.context;
  ctx.clearRect(0, 0, width, height);
  drawNotePaper(ctx, width, height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = NOTE_INK;
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText('ДОЛГ', width / 2, height / 2 - 16);

  // Сумма: уменьшаем шрифт, пока она не влезет на листок.
  const text = String(debt);
  let size = NOTE_DEBT_FONT_SIZE;
  ctx.font = `bold ${size}px ${FONT}`;
  while (ctx.measureText(text).width > width - 32 && size > 16) {
    size -= 2;
    ctx.font = `bold ${size}px ${FONT}`;
  }
  ctx.fillStyle = NOTE_DEBT_INK;
  ctx.fillText(text, width / 2, height / 2 + 22);
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Листок записки: тень на стене, бумага, линейки, поле и скотч. */
function drawNotePaper(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(5, NOTE_TAPE + 5, width - 5, height - NOTE_TAPE - 5); // тень на стене
  ctx.fillStyle = '#eee5cc';
  ctx.fillRect(0, NOTE_TAPE, width - 5, height - NOTE_TAPE - 5); // листок
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.7)';
  for (let y = NOTE_TAPE + 28; y < height - 10; y += 16) {
    ctx.beginPath();
    ctx.moveTo(3, y + 0.5);
    ctx.lineTo(width - 8, y + 0.5);
    ctx.stroke(); // линейка
  }
  ctx.strokeStyle = 'rgba(248, 113, 113, 0.7)';
  ctx.beginPath();
  ctx.moveTo(18.5, NOTE_TAPE);
  ctx.lineTo(18.5, height - 5);
  ctx.stroke(); // красное поле
  ctx.fillStyle = 'rgba(254, 243, 199, 0.7)';
  ctx.fillRect(width / 2 - 30, 0, 60, NOTE_TAPE * 2); // скотч
}

/** Лампочки по верхнему и нижнему краю окна экрана. Порядок — по кругу: верх слева направо, низ справа налево. */
export function createLamps(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Arc[] {
  const xs: number[] = [];
  for (let lampX = x - width / 2 + 24; lampX <= x + width / 2 - 24; lampX += 26) xs.push(lampX);
  const top = xs.map((lampX) => scene.add.circle(lampX, y - height / 2, 5, LAMP_OFF));
  const bottom = [...xs].reverse().map((lampX) => scene.add.circle(lampX, y + height / 2, 5, LAMP_OFF));
  return [...top, ...bottom];
}

/** Иконка кнопки «забрать» — стопка монет. Рисуется один раз. */
export function createIconTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(COINS_ICON)) {
    const g = scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      const y = 29 - i * 8;
      g.fillStyle(0x92400e);
      g.fillEllipse(20, y + 3, 30, 12); // ребро монеты
      g.fillStyle(0xfbbf24);
      g.fillEllipse(20, y, 30, 12); // монета
    }
    g.generateTexture(COINS_ICON, 40, 40);
    g.destroy();
  }
}

/** Текстура монетки: рисуем кругами и сохраняем как картинку в памяти. После рестарта сцены она уже есть. */
export function createCoinTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(COIN_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0xb45309);
  g.fillCircle(10, 10, 10); // тёмный ободок
  g.fillStyle(0xfbbf24);
  g.fillCircle(10, 10, 8); // золото
  g.fillStyle(0xfef3c7);
  g.fillCircle(7, 7, 2.5); // блик
  g.generateTexture(COIN_TEXTURE, 20, 20);
  g.destroy();
}

/** Имя текстуры символа, например 'symbol-cherry'. */
export function symbolTexture(symbol: SlotSymbol): string {
  return `symbol-${symbol.id}`;
}

/**
 * Текстуры клеток: цветной квадрат с рамкой (у черепа красная), блик «стекла» и знак символа.
 * Рисуем один раз на canvas браузера: при мелькании клетка только меняет текстуру и не перерисовывает эмодзи.
 */
export function createSymbolTextures(scene: Phaser.Scene, symbols: SlotSymbol[], size: number, radius: number): void {
  for (const symbol of symbols) {
    const key = symbolTexture(symbol);
    if (scene.textures.exists(key)) continue;
    const texture = scene.textures.createCanvas(key, size, size);
    if (!texture) continue;
    drawSymbolCell(texture.context, symbol, size, radius);
    texture.refresh(); // передать нарисованное в видеокарту
  }
}

/** Одна клетка на canvas: квадрат, блик и знак по центру. */
function drawSymbolCell(ctx: CanvasRenderingContext2D, symbol: SlotSymbol, size: number, radius: number): void {
  const inset = CELL_BORDER_WIDTH / 2; // рамка рисуется по краю квадрата — отступаем, чтобы она не обрезалась
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - CELL_BORDER_WIDTH, size - CELL_BORDER_WIDTH, radius);
  ctx.fillStyle = cssColor(symbol.color);
  ctx.fill();
  ctx.lineWidth = CELL_BORDER_WIDTH;
  ctx.strokeStyle = cssColor(isSkull(symbol) ? SKULL_CELL_BORDER : CELL_BORDER);
  ctx.stroke();

  // Блик «стекла» в верхней части клетки.
  ctx.beginPath();
  ctx.roundRect(size * 0.14, size * 0.09, size * 0.72, size * 0.2, radius / 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();

  // Знак с тенью, чтобы не сливался с фоном.
  ctx.font = `bold ${Math.round(size * 0.55)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(symbol.sign, size / 2, size / 2 + 2);
}

/** Цвет-число 0xef4444 → строка '#ef4444' для canvas. */
function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Имя текстуры схемы паттерна, например 'pattern-row3'. */
export function patternTexture(pattern: Pattern): string {
  return `pattern-${pattern.id}`;
}

/** Схемы паттернов для панели: маленькая сетка 5×3, клетки паттерна золотые. Форма стоит посередине схемы. */
export function createPatternTextures(scene: Phaser.Scene, patterns: Pattern[]): void {
  const step = MINI_CELL + MINI_GAP;
  for (const pattern of patterns) {
    const key = patternTexture(pattern);
    if (scene.textures.exists(key)) continue;
    const { width, height } = patternSize(pattern);
    const left = Math.floor((GRID_COLUMNS - width) / 2); // на сколько клеток сдвинуть форму к середине
    const top = Math.floor((GRID_ROWS - height) / 2);
    const g = scene.add.graphics();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLUMNS; col++) {
        const inPattern = pattern.cells.some(([r, c]) => r + top === row && c + left === col);
        g.fillStyle(inPattern ? MINI_ON : MINI_OFF);
        g.fillRect(col * step, row * step, MINI_CELL, MINI_CELL);
      }
    }
    g.generateTexture(key, GRID_COLUMNS * step - MINI_GAP, GRID_ROWS * step - MINI_GAP);
    g.destroy();
  }
}

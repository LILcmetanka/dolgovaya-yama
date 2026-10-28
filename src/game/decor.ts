import Phaser from 'phaser';
import type { Amulet, Rarity } from './amulets';
import type { MachineCharacter } from './characters';
import type { Item } from './items';
import { t } from './lang';
import {
  AMULET_CASE,
  AMULET_CASE_ICON_Y,
  AMULET_CASE_PRICE_Y,
  amuletCaseX,
  BELLY,
  BODY,
  CENTER_X,
  DISPLAY,
  GLASS,
  ITEM_SIZE,
  LEFT_ROOM,
  LEVER_MOUNT,
  MULTIPLIER_WINDOW,
  PAYOUT_WINDOW,
  ROOM_SIDE,
  SCREEN,
  SOCKET_RADIUS,
  SOCKET_XS,
  SOCKET_Y,
  VENDING,
  VENDING_BIN,
  VENDING_COIN_SLOT,
  VENDING_GLASS,
  VENDING_GOOD_X,
  VENDING_PRICE_X,
  VIEW_CENTER_X,
  VIEW_WIDTH,
  type Box,
} from './layout';
import { patternSize, type Pattern } from './patterns';
import { GRID_COLUMNS, GRID_ROWS, isSkull, isTicket, type SlotSymbol } from './rules';
import { FONT, LAMP_OFF, TEXTURE_SCALE } from './theme';

/**
 * Украшения «Долговой ямы»: тёмная комната, корпус автомата, рычаг, записка, лампочки, фишки,
 * красная кнопка окошка выплаты, клетки символов и схемы паттернов. Логики игры здесь нет. Картинок в проекте тоже нет — всё рисуется кодом.
 * Неподвижное рисуется один раз и «запекается» в текстуру: дальше это одна картинка, и игра идёт даже на слабом компьютере.
 * Запекается крупно, в TEXTURE_SCALE раз (bake, createSharpCanvas): камера увеличивает вид до Full HD, и картинки остаются чёткими.
 */

/** Нарисованное в g — в чёткую текстуру key размером width×height (в единицах раскладки). Graphics после этого убирается. */
function bake(g: Phaser.GameObjects.Graphics, key: string, width: number, height: number): void {
  const scene = g.scene;
  g.setScale(TEXTURE_SCALE); // рисуем крупно…
  g.generateTexture(key, width * TEXTURE_SCALE, height * TEXTURE_SCALE);
  g.destroy();
  showAtGameSize(scene, key, width, height); // …а на экране — в прежнем размере
}

/** Canvas для чёткой текстуры key размером width×height: он уже увеличен в TEXTURE_SCALE раз — рисуй на нём в прежних числах. */
function createSharpCanvas(scene: Phaser.Scene, key: string, width: number, height: number): Phaser.Textures.CanvasTexture | null {
  const texture = scene.textures.createCanvas(key, width * TEXTURE_SCALE, height * TEXTURE_SCALE);
  if (!texture) return null;
  texture.context.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  showAtGameSize(scene, key, width, height);
  return texture;
}

/**
 * Текстура нарисована в TEXTURE_SCALE раз крупнее — показывать её размером width×height:
 * resolution уменьшает её на экране, а размер кадра — это размер картинки для Phaser (её середина, клик по ней).
 */
function showAtGameSize(scene: Phaser.Scene, key: string, width: number, height: number): void {
  const texture = scene.textures.get(key);
  texture.source[0].resolution = TEXTURE_SCALE;
  texture.get().setTrim(width, height, 0, 0, width, height);
}

/** Имена текстур, нарисованных кодом. */
export const CHIP_TEXTURE = 'chip'; // фишка анфас: на табло, в окошке выплаты и в брызгах
export const RED_BUTTON_TEXTURE = 'red-button';
export const HAND_OPEN_TEXTURE = 'hand-open'; // рука Коллектора ладонью вверх
export const HAND_FIST_TEXTURE = 'hand-fist'; // та же рука кулаком
export const LEVER_ROD_TEXTURE = 'lever-rod';
export const LEVER_BALL_TEXTURE = 'lever-ball';
export const NOTE_TEXTURE = 'note';
export const NOTE_GLOW_TEXTURE = 'note-glow'; // зелёное свечение вокруг записки: долг можно отдать раньше
export const SHELF_CELL_TEXTURE = 'shelf-cell'; // клетка полки с предметами
export const SHELF_PLANKS_TEXTURE = 'shelf-planks'; // доски поверх закрытой клетки
export const LEAVE_BUTTON_TEXTURE = 'leave-button'; // круглая кнопка со стрелкой «назад к автомату»
export const TICKET_TEXTURE = 'ticket'; // красный билет — вторая валюта
export const SOCKET_CAP_TEXTURE = 'socket-cap'; // заглушка закрытого гнезда для амулета
export const ROULETTE_TABLE_TEXTURE = 'roulette-table'; // стол с зелёным сукном для игры с Коллектором
export const AMULET_TRAY_TEXTURE = 'amulet-tray'; // лоток, куда кладут амулет для Коллектора
export const REVOLVER_TEXTURE = 'revolver'; // револьвер сбоку, ствол вправо
export const MUZZLE_TEXTURE = 'revolver-muzzle'; // тот же револьвер стволом на тебя
export const MUZZLE_FLASH_TEXTURE = 'muzzle-flash'; // вспышка выстрела
export const BULLET_LIVE_TEXTURE = 'bullet-live'; // боевой патрон — красный
export const BULLET_BLANK_TEXTURE = 'bullet-blank'; // холостой патрон — синий
export const BULLET_GOLD_TEXTURE = 'bullet-gold'; // твой патрон — золотой: им стреляют в автомат
const GOLD_BULLET_SIZE = 40; // сторона картинки летящего патрона
export const CRACK_TEXTURE = 'screen-crack'; // дыра от пули и трещины на экране автомата
export const CRACK_SIZE = 150; // сторона картинки с трещинами
export const AIM_COLLECTOR_TEXTURE = 'aim-collector'; // кнопка «в Коллектора»: прицел
export const AIM_SELF_TEXTURE = 'aim-self'; // кнопка «в себя»: дуло смотрит на тебя
export const REVOLVER_SIZE = { width: 120, height: 60 };
export const REVOLVER_BARREL_TIP = { x: 56, y: -11 }; // конец ствола — от середины картинки (ствол вправо)
export const MUZZLE_BORE = { x: 0, y: -14 }; // дуло на картинке «стволом на тебя» — от её середины
export const CARD_BACK_TEXTURE = 'card-back'; // рубашка карты Дилера
export const DEALER_FELT_TEXTURE = 'dealer-felt'; // стол Дилера поверх экрана
export const ARROW_UP_TEXTURE = 'arrow-up'; // кнопка «больше»
export const ARROW_DOWN_TEXTURE = 'arrow-down'; // кнопка «меньше»
export const CHIP_STACK_TEXTURE = 'chip-stack'; // фишка сбоку-сверху: из таких складывается стопка — ставка у Дилера
export const STAKE_GLOW_TEXTURE = 'stake-glow'; // золотое свечение под ставкой Дилера: можно остановиться
export const RUST_TEXTURE = 'rust-column'; // ржавчина на заевшем столбце сетки
const ROOM_TEXTURE = 'room';
const MACHINE_TEXTURE = 'machine'; // детали корпуса: окантовка, табло, стекло, окна, гнёзда
const MACHINE_SHELL_TEXTURE = 'machine-shell'; // тело корпуса — его красят в цвет автомата
const SHOP_ROOM_TEXTURE = 'shop-room'; // комната слева с торговым автоматом
/** Комната: тёмная стена в полоску и пол. Она шире экрана 960 на ROOM_SIDE с каждой стороны (экран 16:9). */
const ROOM_WIDTH = 960 + 2 * ROOM_SIDE;
const WALL_COLOR = 0x15100d;
const FLOOR_COLOR = 0x090706;
const FLOOR_Y = 560; // где стена переходит в пол
/**
 * Корпус автомата. Тело рисуется белым и серым, а цвет ему даёт характер автомата (characters.ts, setTint в MachineBadge):
 * белое становится цветом автомата, серое — темнее. У обычного автомата лицевая часть 0x4c1111, бок 0x2b0909.
 */
const SHELL_FACE = 0xffffff; // лицевая часть
const SHELL_SIDE = 0x909090; // левый бок в тени — так корпус кажется объёмным
const BODY_SIDE_WIDTH = 16; // ширина бока
const BODY_CORNER = 30; // скругление углов
const BODY_SHADOW = { x: 12, y: 10 }; // тень корпуса на стене сдвинута на столько
const BELLY_SHADE = 0.53; // панель под экраном — тело корпуса, затемнённое на столько: она того же цвета, что автомат
const TRIM_COLOR = 0xb45309; // бронзовая окантовка
const CHROME = 0x94a3b8;
const CHROME_LIGHT = 0xe2e8f0;
const SCREEN_GLASS = 0x020617; // почти чёрное стекло под сеткой
/** Фишка казино: красная с белыми насечками по краю. */
const CHIP_SIZE = 28; // фишка анфас, px
const CHIP_RED = '#dc2626';
const CHIP_NOTCHES = 6; // белые насечки по краю
const CHIP_TOP = 0xdc2626; // фишка в стопке: верхняя грань — того же красного, что фишка анфас
const CHIP_SIDE = 0x991b1b; // бок — темнее
/** Свечение под ставкой Дилера: мягкий золотой круг. */
const STAKE_GLOW_SIZE = 96; // поперечник, px
const STAKE_GLOW_RGB = '253, 224, 71'; // золото, как огни выигрыша
/** Билет: красный корешок с вырезами по бокам. Доли — от высоты билета (линия отрыва — от ширины). */
const TICKET_WIDTH = 36;
const TICKET_HEIGHT = 22;
const TICKET_RED = '#dc2626';
const TICKET_EDGE = '#7f1d1d'; // тёмная кайма
const TICKET_INK = '#fff7ed'; // линия отрыва и звезда
const TICKET_NOTCH = 0.2; // радиус выреза
const TICKET_CORNER = 0.15; // скругление углов
const TICKET_LINE = 0.06; // толщина каймы и линии отрыва
const TICKET_TEAR = 0.29; // линия отрыва
const TICKET_IN_CELL = 0.72; // в клетке сетки билет шириной в такую долю клетки
/** Записка с долгом. */
const NOTE_TAPE = 12; // скотч заходит на листок сверху, px
const NOTE_INK = '#334155'; // «ДОЛГ»
const NOTE_DEBT_INK = '#991b1b'; // сумма — красной ручкой
const NOTE_DEBT_FONT_SIZE = 44; // сумма крупно; длинная сумма уменьшается, чтобы влезть на листок
const NOTE_CHECK_COLOR = '#16a34a'; // галочка «фишек хватает»
const NOTE_GLOW = 20; // свечение выходит за листок на столько px
const NOTE_GLOW_BLUR = 10; // мягкость свечения, px
const NOTE_GLOW_LINE = 4; // яркая кайма по краю листка, px (половина её — под листком)
const NOTE_GLOW_LAYERS = 3; // кайма с ореолом рисуется столько раз — каждый слой ярче
const NOTE_GLOW_COLOR = '#4ade80';
/** Рука Коллектора: рукав тёмного пальто, белая манжета, серая кожа. */
const HAND_WIDTH = 420;
const HAND_HEIGHT = 150;
const SLEEVE_COLOR = 0x1c1917;
const SLEEVE_FOLD = 0x292524;
const CUFF_COLOR = 0xd6d3d1;
const SKIN_COLOR = 0xb9a58c;
const SKIN_SHADE = 0x8f7d66;
/** Клетка сетки: рамка обычного символа и рамка черепа. */
const CELL_BORDER = 0xe2e8f0;
const SKULL_CELL_BORDER = 0xef4444;
const EVIL_CELL_BORDER = 0xa855f7; // злые символы и кубик Дилера — в фиолетовой рамке
const CELL_BORDER_WIDTH = 3;
/** Ржавчина на заевшем столбце. */
const RUST_FILM = 'rgba(146, 64, 14, 0.5)'; // рыжая плёнка: символы под ней видно
const RUST_DARK = 'rgba(69, 26, 3, 0.85)';
const RUST_LIGHT = 'rgba(217, 119, 6, 0.7)';
const RUST_EDGE = 4; // толщина каймы
const RUST_SPOTS = 22;
/** Схема паттерна — маленькая сетка 5×3: клетки паттерна золотые, остальные тёмные. */
const MINI_CELL = 6; // сторона клетки схемы, px
const MINI_GAP = 2; // промежуток между клетками схемы, px
const MINI_ON = 0xfde047;
const MINI_OFF = 0x334155;

/** Тёмная комната: стена в полоску, плинтус, пол, тёплый отсвет от автомата и тёмные углы. */
export function drawRoom(scene: Phaser.Scene): void {
  if (!scene.textures.exists(ROOM_TEXTURE)) bakeRoom(scene);
  scene.add.image(-ROOM_SIDE, 0, ROOM_TEXTURE).setOrigin(0);
}

/**
 * Комната — в текстуру ROOM_TEXTURE. Она из мягких пятен и полос, чёткость ей не нужна —
 * поэтому запекается в обычном размере, без TEXTURE_SCALE: картинка на всю комнату, так меньше памяти.
 */
function bakeRoom(scene: Phaser.Scene): void {
  const machineX = CENTER_X + ROOM_SIDE; // где автомат на картинке комнаты
  const g = scene.add.graphics();
  g.fillStyle(WALL_COLOR);
  g.fillRect(0, 0, ROOM_WIDTH, FLOOR_Y);
  g.fillStyle(0xffffff, 0.02); // обои: еле заметные вертикальные полосы
  for (let x = 0; x < ROOM_WIDTH; x += 48) g.fillRect(x, 0, 20, FLOOR_Y);
  g.fillStyle(0x241a14);
  g.fillRect(0, FLOOR_Y - 10, ROOM_WIDTH, 10); // плинтус
  g.fillStyle(FLOOR_COLOR);
  g.fillRect(0, FLOOR_Y, ROOM_WIDTH, 640 - FLOOR_Y);

  // Тёплый отсвет от огней автомата: полупрозрачные овалы друг в друге.
  for (let i = 0; i < 7; i++) {
    g.fillStyle(0xf59e0b, 0.025);
    g.fillEllipse(machineX, 300, 1000 - i * 110, 760 - i * 80);
  }
  // Тёмные углы: чёрные рамки, каждая следующая ближе к центру — края комнаты темнее.
  for (let i = 0; i < 5; i++) {
    const inset = i * 26;
    g.lineStyle(52, 0x000000, 0.14);
    g.strokeRect(inset, inset, ROOM_WIDTH - 2 * inset, 640 - 2 * inset);
  }
  g.generateTexture(ROOM_TEXTURE, ROOM_WIDTH, 640);
  g.destroy();
}

/**
 * Корпус автомата: тело, табло, стекло для паттернов, окно экрана, панель под экраном,
 * окошко множителя и крепление рычага. Всё это неподвижно — две текстуры: тело и детали поверх него.
 * Вернуть тело: его красит в цвет автомата MachineBadge.
 */
export function drawMachineBody(scene: Phaser.Scene): Phaser.GameObjects.Image {
  if (!scene.textures.exists(MACHINE_SHELL_TEXTURE)) bakeMachineShell(scene);
  if (!scene.textures.exists(MACHINE_TEXTURE)) bakeMachineBody(scene);
  const { left, top } = topLeft(BODY);
  const shell = scene.add.image(left, top, MACHINE_SHELL_TEXTURE).setOrigin(0);
  scene.add.image(0, 0, MACHINE_TEXTURE).setOrigin(0);
  return shell;
}

/** Тело корпуса — в текстуру MACHINE_SHELL_TEXTURE, от его левого верхнего угла. Низ корпуса уходит за край экрана — его не рисуем. */
function bakeMachineShell(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  drawBodyShell(g, BODY.width, BODY.height);
  bake(g, MACHINE_SHELL_TEXTURE, BODY.width + BODY_SHADOW.x, 640 - topLeft(BODY).top);
}

/** Детали корпуса — в текстуру MACHINE_TEXTURE: части (их места — в layout.ts) рисуются по очереди, от задних к передним. */
function bakeMachineBody(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  drawBodyTrim(g, BODY);
  drawLeverMount(g, LEVER_MOUNT);
  drawInset(g, DISPLAY, 0x050505, TRIM_COLOR);
  drawInset(g, GLASS, 0x0b1120, TRIM_COLOR);
  drawScreenFrame(g, SCREEN);
  drawInset(g, BELLY, 0x000000, 0x7c2d12, BELLY_SHADE); // полупрозрачная: под ней тело корпуса, панель — того же цвета
  drawInset(g, MULTIPLIER_WINDOW, 0x050505, TRIM_COLOR);
  drawInset(g, PAYOUT_WINDOW, 0x050505, TRIM_COLOR);
  drawSockets(g);
  bake(g, MACHINE_TEXTURE, 960, 640);
}

/** Гнёзда для амулетов на верхушке корпуса: хромированное кольцо и тёмная лунка. */
function drawSockets(g: Phaser.GameObjects.Graphics): void {
  for (const x of SOCKET_XS) {
    g.fillStyle(0x000000, 0.4);
    g.fillCircle(x + 2, SOCKET_Y + 3, SOCKET_RADIUS); // тень
    g.fillStyle(CHROME);
    g.fillCircle(x, SOCKET_Y, SOCKET_RADIUS);
    g.fillStyle(0x0b0f19);
    g.fillCircle(x, SOCKET_Y, SOCKET_RADIUS - 4); // лунка
  }
}

/** Левый верхний угол прямоугольника. */
function topLeft(box: Box): { left: number; top: number } {
  return { left: box.x - box.width / 2, top: box.y - box.height / 2 };
}

/** Тело корпуса размером width×height от его левого верхнего угла: тень на стене, левый бок и лицевая часть — серым и белым. */
function drawBodyShell(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(BODY_SHADOW.x, BODY_SHADOW.y, width, height, BODY_CORNER); // тень на стене
  g.fillStyle(SHELL_SIDE);
  g.fillRoundedRect(0, 0, width, height, BODY_CORNER);
  g.fillStyle(SHELL_FACE);
  g.fillRoundedRect(BODY_SIDE_WIDTH, 0, width - BODY_SIDE_WIDTH, height, BODY_CORNER);
}

/** Бронзовая окантовка по лицевой части корпуса. */
function drawBodyTrim(g: Phaser.GameObjects.Graphics, body: Box): void {
  const { left, top } = topLeft(body);
  g.lineStyle(4, TRIM_COLOR);
  g.strokeRoundedRect(left + BODY_SIDE_WIDTH + 8, top + 8, body.width - BODY_SIDE_WIDTH - 16, body.height - 16, 24);
}

/** Утопленная панель: заливка (fillAlpha — её непрозрачность), рамка и узкий блик сверху. */
function drawInset(g: Phaser.GameObjects.Graphics, box: Box, fill: number, border: number, fillAlpha = 1): void {
  const { left, top } = topLeft(box);
  g.fillStyle(fill, fillAlpha);
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
    bake(g, LEVER_ROD_TEXTURE, 10, rodLength);
  }
  if (!scene.textures.exists(LEVER_BALL_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0x1f2937);
    g.fillCircle(22, 22, 21); // ободок шарика
    g.fillStyle(0xdc2626);
    g.fillCircle(22, 22, 18); // шарик
    g.fillStyle(0xfca5a5);
    g.fillCircle(16, 15, 6); // блик
    bake(g, LEVER_BALL_TEXTURE, 44, 44);
  }
}

/**
 * Записка с долгом на canvas: листок в линейку, красное поле, скотч, «ДОЛГ» и сумма.
 * Надписи рисуются прямо на листке, поэтому записку можно повернуть одной картинкой.
 * Сумма меняется раз в раунд — тогда записка перерисовывается заново (canvas маленький, это дёшево).
 */
export function drawNoteTexture(scene: Phaser.Scene, width: number, height: number, debt: number, isEnough: boolean): void {
  // Текстура уже есть — её создала эта же функция, значит это canvas: берём его и рисуем заново.
  const texture = scene.textures.exists(NOTE_TEXTURE)
    ? (scene.textures.get(NOTE_TEXTURE) as Phaser.Textures.CanvasTexture)
    : createSharpCanvas(scene, NOTE_TEXTURE, width, height);
  if (!texture) return;
  const ctx = texture.context;
  ctx.clearRect(0, 0, width, height);
  drawNotePaper(ctx, width, height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = NOTE_INK;
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText(t('debt'), width / 2, height / 2 - 16);

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
  if (isEnough) drawNoteCheck(ctx, width, height);
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Зелёная галочка в правом нижнем углу записки: фишек на табло хватает на долг. */
function drawNoteCheck(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = NOTE_CHECK_COLOR;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(width * 0.66, height * 0.72);
  ctx.lineTo(width * 0.75, height * 0.84);
  ctx.lineTo(width * 0.93, height * 0.56);
  ctx.stroke();
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

/**
 * Свечение записки: яркая зелёная кайма по краю листка и ореол вокруг — долг можно отдать раньше. Картинка шире записки
 * на NOTE_GLOW с каждой стороны, середины у них общие. Внутри пусто: записка подпрыгивает и переворачивается, а заливки под ней не видно.
 */
export function createNoteGlowTexture(scene: Phaser.Scene, width: number, height: number): void {
  if (scene.textures.exists(NOTE_GLOW_TEXTURE)) return;
  const texture = createSharpCanvas(scene, NOTE_GLOW_TEXTURE, width + 2 * NOTE_GLOW, height + 2 * NOTE_GLOW);
  if (!texture) return;
  const ctx = texture.context;
  ctx.strokeStyle = NOTE_GLOW_COLOR;
  ctx.lineWidth = NOTE_GLOW_LINE;
  ctx.shadowColor = NOTE_GLOW_COLOR;
  ctx.shadowBlur = NOTE_GLOW_BLUR * TEXTURE_SCALE; // тень canvas не увеличивается вместе с картинкой
  // Листок — там же, где на записке (drawNotePaper).
  for (let layer = 0; layer < NOTE_GLOW_LAYERS; layer++) {
    ctx.strokeRect(NOTE_GLOW, NOTE_GLOW + NOTE_TAPE, width - 5, height - NOTE_TAPE - 5);
  }
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Фишка анфас (на табло, в окошке выплаты и в брызгах) — на canvas, чтобы нарисовать «1». */
export function createChipTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(CHIP_TEXTURE)) return;
  const texture = createSharpCanvas(scene, CHIP_TEXTURE, CHIP_SIZE, CHIP_SIZE);
  if (texture) {
    drawChip(texture.context, CHIP_SIZE);
    texture.refresh(); // передать нарисованное в видеокарту
  }
}

/** Фишка анфас на canvas: красный круг, белые насечки по краю, белое кольцо и «1» посередине. */
function drawChip(ctx: CanvasRenderingContext2D, size: number): void {
  const center = size / 2;
  ctx.fillStyle = CHIP_RED;
  ctx.beginPath();
  ctx.arc(center, center, center, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < CHIP_NOTCHES; i++) {
    // Насечку рисуем у верхнего края и поворачиваем вокруг центра фишки.
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((i * 2 * Math.PI) / CHIP_NOTCHES);
    ctx.fillRect(-2, -center, 4, size * 0.2);
    ctx.restore();
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(center, center, center * 0.58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `bold ${Math.round(size * 0.45)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1', center, center + 1);
}

/** Большая красная кнопка без надписей, как «ядерная»: металлическое кольцо, тёмный зазор и красный купол с бликом. */
export function createRedButtonTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(RED_BUTTON_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.4);
  g.fillCircle(31, 33, 27); // тень
  g.fillStyle(0x6b7280);
  g.fillCircle(30, 30, 27); // металлическое кольцо
  g.fillStyle(0x1f2937);
  g.fillCircle(30, 30, 22); // зазор вокруг купола
  g.fillStyle(0x991b1b);
  g.fillCircle(30, 32, 19); // низ купола в тени
  g.fillStyle(0xdc2626);
  g.fillCircle(30, 29, 18); // купол
  g.fillStyle(0xfca5a5, 0.8);
  g.fillEllipse(24, 22, 12, 7); // блик
  bake(g, RED_BUTTON_TEXTURE, 62, 62);
}

/** Рука Коллектора: раскрытая ладонью вверх (ждёт долг) и кулаком (забрал или злится). Рукав уходит за правый край. */
export function createHandTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(HAND_OPEN_TEXTURE)) bakeHand(scene, HAND_OPEN_TEXTURE, drawOpenHand);
  if (!scene.textures.exists(HAND_FIST_TEXTURE)) bakeHand(scene, HAND_FIST_TEXTURE, drawFist);
}

/** Рукав и запястье одинаковые, кисть рисует drawHand — и всё в текстуру key. */
function bakeHand(scene: Phaser.Scene, key: string, drawHand: (g: Phaser.GameObjects.Graphics) => void): void {
  const g = scene.add.graphics();
  g.fillStyle(SLEEVE_COLOR);
  g.fillRoundedRect(232, 26, 200, 98, 18); // рукав пальто, уходит за правый край
  g.fillStyle(SLEEVE_FOLD);
  g.fillRect(232, 26, 200, 8); // складка сверху
  g.fillStyle(CUFF_COLOR);
  g.fillRoundedRect(214, 40, 26, 70, 6); // манжета
  g.fillStyle(SKIN_COLOR);
  g.fillRect(180, 56, 40, 42); // запястье
  drawHand(g);
  bake(g, key, HAND_WIDTH, HAND_HEIGHT);
}

/** Раскрытая ладонь вверх: ладонь, четыре пальца к игроку и большой палец сверху. */
function drawOpenHand(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(SKIN_COLOR);
  g.fillRoundedRect(112, 50, 80, 56, 14); // ладонь
  g.fillRoundedRect(40, 52, 82, 13, 6); // указательный
  g.fillRoundedRect(28, 67, 94, 13, 6); // средний
  g.fillRoundedRect(36, 82, 86, 13, 6); // безымянный
  g.fillRoundedRect(54, 96, 68, 11, 5); // мизинец
  g.fillRoundedRect(122, 34, 52, 16, 7); // большой палец
  g.fillStyle(SKIN_SHADE);
  g.fillRect(118, 54, 3, 50); // складка у основания пальцев
}

/** Кулак: пальцы поджаты, видны костяшки, большой палец поверх. */
function drawFist(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(SKIN_COLOR);
  g.fillRoundedRect(96, 46, 98, 64, 16); // кулак
  g.fillStyle(SKIN_SHADE);
  for (const y of [56, 70, 84, 98]) g.fillCircle(104, y, 7); // костяшки
  g.fillStyle(SKIN_COLOR);
  g.fillRoundedRect(110, 40, 60, 16, 7); // большой палец
}

/** Лампочки по верхнему и нижнему краю окна экрана. Порядок — по кругу: верх слева направо, низ справа налево. */
export function createLamps(scene: Phaser.Scene, x: number, y: number, width: number, height: number): Phaser.GameObjects.Arc[] {
  const xs: number[] = [];
  for (let lampX = x - width / 2 + 24; lampX <= x + width / 2 - 24; lampX += 26) xs.push(lampX);
  const top = xs.map((lampX) => scene.add.circle(lampX, y - height / 2, 5, LAMP_OFF));
  const bottom = [...xs].reverse().map((lampX) => scene.add.circle(lampX, y + height / 2, 5, LAMP_OFF));
  return [...top, ...bottom];
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
    const texture = createSharpCanvas(scene, key, size, size);
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
  ctx.strokeStyle = cssColor(isSkull(symbol) ? SKULL_CELL_BORDER : symbol.isEvil ? EVIL_CELL_BORDER : CELL_BORDER);
  ctx.stroke();

  // Блик «стекла» в верхней части клетки.
  ctx.beginPath();
  ctx.roundRect(size * 0.14, size * 0.09, size * 0.72, size * 0.2, radius / 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fill();

  // Знак с тенью, чтобы не сливался с фоном. Тень canvas не увеличивается вместе с картинкой — её размер умножаем сами.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 6 * TEXTURE_SCALE;
  ctx.shadowOffsetY = 3 * TEXTURE_SCALE;
  if (isTicket(symbol)) {
    drawTicketInCell(ctx, size);
    return;
  }
  ctx.font = `bold ${Math.round(size * 0.55)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(symbol.sign, size / 2, size / 2 + 2);
}

/** Билет в клетке — не эмодзи, а тот же красный билет, что на табло: билет везде выглядит одинаково. */
function drawTicketInCell(ctx: CanvasRenderingContext2D, size: number): void {
  const width = size * TICKET_IN_CELL;
  const height = (width * TICKET_HEIGHT) / TICKET_WIDTH;
  ctx.save();
  ctx.translate((size - width) / 2, (size - height) / 2 + 2);
  drawTicket(ctx, width, height);
  ctx.restore();
}

/**
 * Ржавчина поверх столбца сетки (width×height): рыжая плёнка, тёмная кайма и пятна — столбец заело.
 * Пятна стоят по формуле (шаг — золотое сечение), без Math.random: картинка всегда одна и та же.
 */
export function createRustTexture(scene: Phaser.Scene, width: number, height: number, radius: number): void {
  if (scene.textures.exists(RUST_TEXTURE)) return;
  const texture = createSharpCanvas(scene, RUST_TEXTURE, width, height);
  if (!texture) return;
  const ctx = texture.context;
  const inset = RUST_EDGE / 2; // кайма рисуется по краю — отступаем, чтобы она не обрезалась
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - RUST_EDGE, height - RUST_EDGE, radius);
  ctx.fillStyle = RUST_FILM;
  ctx.fill();
  ctx.lineWidth = RUST_EDGE;
  ctx.strokeStyle = RUST_DARK;
  ctx.stroke();
  for (let index = 0; index < RUST_SPOTS; index++) {
    const x = RUST_EDGE + ((index * 0.618) % 1) * (width - 2 * RUST_EDGE);
    const y = RUST_EDGE + ((index * 0.382 + 0.1) % 1) * (height - 2 * RUST_EDGE);
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + (index % 4), 0, Math.PI * 2);
    ctx.fillStyle = index % 2 === 0 ? RUST_DARK : RUST_LIGHT;
    ctx.fill();
  }
  texture.refresh(); // передать нарисованное в видеокарту
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
    bake(g, key, GRID_COLUMNS * step - MINI_GAP, GRID_ROWS * step - MINI_GAP);
  }
}

/** Имя текстуры предмета, например 'item-shield'. */
export function itemTexture(item: Item): string {
  return `item-${item.id}`;
}

/** Предметы: тёмная коробочка с цветным ободком и знаком. Одна текстура — и на полке, и в магазине, и у экрана. */
export function createItemTextures(scene: Phaser.Scene, items: Item[], size: number): void {
  for (const item of items) {
    const key = itemTexture(item);
    if (scene.textures.exists(key)) continue;
    const texture = createSharpCanvas(scene, key, size, size);
    if (!texture) continue;
    drawItem(texture.context, item, size);
    texture.refresh(); // передать нарисованное в видеокарту
  }
}

/** Один предмет на canvas: коробочка, ободок цвета предмета, блик и знак (эмодзи или «×3»). */
function drawItem(ctx: CanvasRenderingContext2D, item: Item, size: number): void {
  ctx.beginPath();
  ctx.roundRect(2, 2, size - 4, size - 4, 14);
  ctx.fillStyle = '#1c1917';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = cssColor(item.color);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(size * 0.16, size * 0.1, size * 0.68, size * 0.18, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill(); // блик

  if (item.id === 'bullet') {
    drawCartridge(ctx, size); // у патрона нет знака: он нарисован
    return;
  }
  const isText = item.sign.startsWith('×'); // «×3» — надпись, а не эмодзи: рисуем золотом
  ctx.font = `bold ${Math.round(size * (isText ? 0.46 : 0.52))}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 6 * TEXTURE_SCALE; // тень canvas не увеличивается вместе с картинкой
  ctx.shadowOffsetY = 2 * TEXTURE_SCALE;
  ctx.fillStyle = isText ? cssColor(item.color) : '#ffffff';
  ctx.fillText(item.sign, size / 2, size / 2 + 2);
}

/**
 * Патрон револьвера в квадрате size×size: медная пуля, золотая гильза с бликом и донце.
 * Один рисунок — и на предмете (патрон на полке и в магазине), и летящий в револьвер Коллектора.
 */
function drawCartridge(ctx: CanvasRenderingContext2D, size: number): void {
  const width = size * 0.26;
  const left = (size - width) / 2;
  const right = left + width;
  const tipTop = size * 0.13; // кончик пули
  const caseTop = size * 0.37; // здесь пуля входит в гильзу
  const caseBottom = size * 0.77;
  const caseHeight = caseBottom - caseTop;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 6 * TEXTURE_SCALE; // тень canvas не увеличивается вместе с картинкой
  ctx.shadowOffsetY = 2 * TEXTURE_SCALE;
  ctx.fillStyle = '#c2410c';
  ctx.beginPath();
  ctx.moveTo(left, caseTop);
  ctx.quadraticCurveTo(left, tipTop, size / 2, tipTop);
  ctx.quadraticCurveTo(right, tipTop, right, caseTop);
  ctx.closePath();
  ctx.fill(); // пуля
  ctx.fillStyle = '#eab308';
  ctx.fillRect(left, caseTop, width, caseHeight); // гильза
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(255, 237, 213, 0.45)';
  ctx.beginPath();
  ctx.ellipse(left + width * 0.32, caseTop - (caseTop - tipTop) * 0.45, width * 0.12, (caseTop - tipTop) * 0.28, 0, 0, Math.PI * 2);
  ctx.fill(); // блик на пуле
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fillRect(left + width * 0.18, caseTop + 2, width * 0.2, caseHeight - 4); // блик на гильзе
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(right - width * 0.36, caseTop + 2, width * 0.2, caseHeight - 4); // тень справа
  ctx.fillStyle = '#b45309';
  ctx.fillRect(left - size * 0.03, caseBottom, width + size * 0.06, size * 0.06); // донце
}

/** Твой патрон, летящий в револьвер Коллектора, — тот же рисунок, что на предмете, только без коробочки. */
function drawGoldBullet(scene: Phaser.Scene): void {
  const texture = createSharpCanvas(scene, BULLET_GOLD_TEXTURE, GOLD_BULLET_SIZE, GOLD_BULLET_SIZE);
  if (!texture) return;
  drawCartridge(texture.context, GOLD_BULLET_SIZE);
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Клетка полки: деревянная рамка и тёмная ниша; и доски, которыми заколочена закрытая клетка. */
export function createShelfTextures(scene: Phaser.Scene, size: number): void {
  if (!scene.textures.exists(SHELF_CELL_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(4, 5, size, size, 6); // тень на стене
    g.fillStyle(0x4a2f19);
    g.fillRoundedRect(0, 0, size, size, 6); // рамка
    g.fillStyle(0x6b4423);
    g.fillRect(4, 2, size - 8, 3); // светлый край рамки сверху
    g.fillStyle(0x140d08);
    g.fillRect(7, 7, size - 14, size - 16); // ниша
    g.fillStyle(0x5b3a1e);
    g.fillRect(4, size - 10, size - 8, 6); // полочка внизу ниши
    bake(g, SHELF_CELL_TEXTURE, size + 4, size + 5);
  }
  if (!scene.textures.exists(SHELF_PLANKS_TEXTURE)) {
    const texture = createSharpCanvas(scene, SHELF_PLANKS_TEXTURE, size, size);
    if (!texture) return;
    drawPlank(texture.context, size, size * 0.34, -0.2);
    drawPlank(texture.context, size, size * 0.68, 0.16);
    texture.refresh(); // передать нарисованное в видеокарту
  }
}

/** Одна доска поперёк клетки, чуть наискосок, с гвоздями по краям. */
function drawPlank(ctx: CanvasRenderingContext2D, size: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(size / 2, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(-size / 2 - 4, -9, size + 8, 18); // доска
  ctx.fillStyle = '#5c3a1a';
  ctx.fillRect(-size / 2 - 4, 6, size + 8, 3); // тень внизу доски
  ctx.fillStyle = '#a16207';
  ctx.fillRect(-size / 2 - 4, -9, size + 8, 2); // светлый край
  ctx.fillStyle = '#1f2937';
  for (const x of [-size / 2 + 6, size / 2 - 6]) {
    ctx.beginPath();
    ctx.arc(x, 0, 2.5, 0, Math.PI * 2);
    ctx.fill(); // гвоздь
  }
  ctx.restore();
}

/** Круглая кнопка со стрелкой вправо: «назад к игровому автомату». */
export function createLeaveButtonTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(LEAVE_BUTTON_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.45);
  g.fillCircle(31, 33, 28); // тень
  g.fillStyle(0x1c1917);
  g.fillCircle(30, 30, 28);
  g.lineStyle(3, 0xfbbf24);
  g.strokeCircle(30, 30, 26);
  g.fillStyle(0xffffff);
  g.fillRect(16, 26, 18, 8); // древко стрелки
  g.fillTriangle(32, 16, 46, 30, 32, 44); // наконечник
  bake(g, LEAVE_BUTTON_TEXTURE, 62, 62);
}

/** Кнопка «▶ продолжить» на экране паузы: как кнопка «назад», только вместо стрелки — треугольник. */
export const PLAY_BUTTON_TEXTURE = 'play-button';

export function createPlayButtonTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PLAY_BUTTON_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.45);
  g.fillCircle(31, 33, 28); // тень
  g.fillStyle(0x1c1917);
  g.fillCircle(30, 30, 28);
  g.lineStyle(3, 0xfbbf24);
  g.strokeCircle(30, 30, 26);
  g.fillStyle(0xffffff);
  g.fillTriangle(23, 16, 45, 30, 23, 44);
  bake(g, PLAY_BUTTON_TEXTURE, 62, 62);
}

/**
 * Кассета — один откат за забег: корпус, наклейка с красной полосой, окошко и две катушки.
 * Катушка — отдельной картинкой тоже: когда кассета пишет или перематывается, катушки крутятся поверх неё.
 */
export const TAPE_TEXTURE = 'tape';
export const REEL_TEXTURE = 'tape-reel';
export const TAPE_SIZE = { width: 56, height: 36 };
export const TAPE_REEL_DX = 8; // катушки — на столько левее и правее середины кассеты
export const TAPE_REEL_DY = 6; // и на столько ниже

export function createTapeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(REEL_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0xe5e7eb);
    g.fillCircle(6, 6, 5);
    g.fillStyle(0x111827); // три выемки — видно, что катушка крутится
    for (let index = 0; index < 3; index++) {
      const angle = (index * 2 * Math.PI) / 3;
      g.fillCircle(6 + Math.cos(angle) * 3, 6 + Math.sin(angle) * 3, 1.2);
    }
    bake(g, REEL_TEXTURE, 12, 12);
  }
  if (!scene.textures.exists(TAPE_TEXTURE)) {
    const { width, height } = TAPE_SIZE;
    const g = scene.add.graphics();
    g.fillStyle(0x1f2937);
    g.fillRoundedRect(0, 0, width, height, 4); // корпус
    g.lineStyle(2, 0x4b5563);
    g.strokeRoundedRect(1, 1, width - 2, height - 2, 4);
    g.fillStyle(0xfef3c7);
    g.fillRect(5, 4, width - 10, 12); // наклейка
    g.fillStyle(0xdc2626);
    g.fillRect(5, 8, width - 10, 3); // красная полоса на ней
    g.fillStyle(0x0b0f19);
    g.fillRoundedRect(width / 2 - 15, height / 2 + 1, 30, 11, 3); // окошко с плёнкой
    bake(g, TAPE_TEXTURE, width, height);
  }
}

/**
 * Видеомагнитофон на полу у монитора: корпус, щель для кассеты, тёмное окошко (в нём «◀◀», когда плёнка перематывается),
 * кнопки и гнездо лампочки записи. Лампочку и «◀◀» ставит поверх часть Cassette. Места на корпусе — от его середины.
 */
export const VCR_TEXTURE = 'vcr';
export const VCR_SLOT_DX = -34; // щель для кассеты — левее середины на столько; кассета стоит над ней
export const VCR_REC_LAMP = { dx: -64, dy: 9 }; // лампочка записи — у левого края
export const VCR_WINDOW = { dx: 42, dy: -3 }; // окошко с «◀◀» — правее середины

export function createVcrTexture(scene: Phaser.Scene, width: number, height: number): void {
  if (scene.textures.exists(VCR_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0x18181b);
  g.fillRoundedRect(0, 0, width, height, 4); // корпус
  g.fillStyle(0x3f3f46);
  g.fillRoundedRect(0, 0, width, 5, { tl: 4, tr: 4, bl: 0, br: 0 }); // верхняя грань
  g.fillStyle(0x52525b);
  g.fillRect(4, 6, width - 8, 1); // блик по краю лицевой панели
  const slotLeft = width / 2 + VCR_SLOT_DX - 32;
  g.fillStyle(0x09090b);
  g.fillRect(slotLeft, height / 2 - 6, 64, 8); // щель
  g.fillStyle(0x27272a);
  g.fillRect(slotLeft + 2, height / 2 - 4, 60, 3); // крышка щели
  const windowLeft = width / 2 + VCR_WINDOW.dx - 22;
  g.fillStyle(0x3f3f46);
  g.fillRoundedRect(windowLeft - 1, height / 2 + VCR_WINDOW.dy - 8, 46, 16, 3);
  g.fillStyle(0x0b0f19);
  g.fillRoundedRect(windowLeft, height / 2 + VCR_WINDOW.dy - 7, 44, 14, 2); // тёмное окошко
  g.fillStyle(0x52525b);
  for (let index = 0; index < 4; index++) g.fillRect(windowLeft + 2 + index * 11, height - 8, 7, 4); // кнопки
  g.fillStyle(0x3f0a0a);
  g.fillCircle(width / 2 + VCR_REC_LAMP.dx, height / 2 + VCR_REC_LAMP.dy, 3.5); // гнездо лампочки записи
  bake(g, VCR_TEXTURE, width, height);
}

/** Деревянный ящик, на котором стоит видеомагнитофон: стойки по углам, три доски, гвозди. */
export const CRATE_TEXTURE = 'vcr-crate';
const CRATE_POST = 10; // ширина угловой стойки
const CRATE_PLANKS = 3;

export function createCrateTexture(scene: Phaser.Scene, width: number, height: number): void {
  if (scene.textures.exists(CRATE_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0x241508);
  g.fillRect(0, 0, width, height); // щели между досками
  const plankHeight = (height - 4) / CRATE_PLANKS - 3;
  for (let index = 0; index < CRATE_PLANKS; index++) {
    const top = 2 + index * (plankHeight + 3);
    g.fillStyle(0x6b4423);
    g.fillRect(CRATE_POST, top, width - 2 * CRATE_POST, plankHeight); // доска
    g.fillStyle(0x8b5a2b);
    g.fillRect(CRATE_POST, top, width - 2 * CRATE_POST, 2); // светлый край доски
  }
  g.fillStyle(0x4a2e15);
  g.fillRect(0, 0, CRATE_POST, height); // стойки по углам
  g.fillRect(width - CRATE_POST, 0, CRATE_POST, height);
  g.fillStyle(0x1c1917);
  for (let index = 0; index < CRATE_PLANKS; index++) {
    const y = 2 + index * (plankHeight + 3) + plankHeight / 2;
    g.fillCircle(CRATE_POST / 2, y, 1.5); // гвозди
    g.fillCircle(width - CRATE_POST / 2, y, 1.5);
  }
  bake(g, CRATE_TEXTURE, width, height);
}

/**
 * Перемотка, как на экране видеомагнитофона: «◀◀» — плёнка перематывается назад, «▶» — снова играет.
 * Белые треугольники с тёмной тенью; в окошке видеомагнитофона те же «◀◀», только маленькие и янтарные (tint).
 */
export const REWIND_SIGN_TEXTURE = 'rewind-sign';
export const PLAY_SIGN_TEXTURE = 'play-sign';
const SIGN_SIZE = 32; // высота треугольника, px
const SIGN_SHADOW = 3; // тень сдвинута вправо и вниз на столько px

export function createRewindTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(REWIND_SIGN_TEXTURE)) {
    const g = scene.add.graphics();
    drawSignTriangles(g, [SIGN_SIZE - 2, 2 * SIGN_SIZE - 4], -1);
    bake(g, REWIND_SIGN_TEXTURE, 2 * SIGN_SIZE + SIGN_SHADOW, SIGN_SIZE + SIGN_SHADOW);
  }
  if (!scene.textures.exists(PLAY_SIGN_TEXTURE)) {
    const g = scene.add.graphics();
    drawSignTriangles(g, [4], 1);
    bake(g, PLAY_SIGN_TEXTURE, SIGN_SIZE + SIGN_SHADOW, SIGN_SIZE + SIGN_SHADOW);
  }
}

/** Треугольники знака: у каждого основание при x из bases, остриё — влево (direction −1) или вправо (1). Сначала тень, потом белый. */
function drawSignTriangles(g: Phaser.GameObjects.Graphics, bases: number[], direction: 1 | -1): void {
  const height = SIGN_SIZE - 4;
  const length = SIGN_SIZE - 6; // от основания до острия
  for (const [shift, color, alpha] of [[SIGN_SHADOW, 0x000000, 0.6], [0, 0xffffff, 1]] as const) {
    g.fillStyle(color, alpha);
    for (const base of bases) {
      const top = 2 + shift;
      g.fillTriangle(base + shift, top, base + shift, top + height, base + shift + direction * length, top + height / 2);
    }
  }
}

/**
 * Комната слева от автомата: витрина амулетов на стене и торговый автомат под ней — одна картинка (неподвижное).
 * Предметы, амулеты, ценники и номера кладут поверх части Shop и AmuletCase.
 */
export function drawShopRoom(scene: Phaser.Scene, rows: number, places: number): void {
  if (!scene.textures.exists(SHOP_ROOM_TEXTURE)) bakeShopRoom(scene, rows, places);
  const { left, top } = topLeft(LEFT_ROOM);
  scene.add.image(left, top, SHOP_ROOM_TEXTURE).setOrigin(0);
}

/** Комната слева — в текстуру SHOP_ROOM_TEXTURE. Координаты частей — мировые (из layout.ts), их сдвигаем к началу картинки. */
function bakeShopRoom(scene: Phaser.Scene, rows: number, places: number): void {
  const { left: roomLeft, top: roomTop } = topLeft(LEFT_ROOM);
  const local = (box: Box): Box => ({ ...box, x: box.x - roomLeft, y: box.y - roomTop });
  const g = scene.add.graphics();
  const width = LEFT_ROOM.width;
  g.fillStyle(WALL_COLOR);
  g.fillRect(0, 0, width, FLOOR_Y);
  g.fillStyle(0xffffff, 0.02); // обои в полоску, как в комнате
  for (let x = 0; x < width; x += 48) g.fillRect(x, 0, 20, FLOOR_Y);
  g.fillStyle(0x241a14);
  g.fillRect(0, FLOOR_Y - 10, width, 10); // плинтус
  g.fillStyle(FLOOR_COLOR);
  g.fillRect(0, FLOOR_Y, width, 640 - FLOOR_Y);

  const vending = local(VENDING);
  for (let i = 0; i < 6; i++) {
    g.fillStyle(0x22d3ee, 0.022); // холодный отсвет от торгового автомата
    g.fillEllipse(vending.x, vending.y, 620 - i * 80, 640 - i * 80);
  }
  for (let i = 0; i < 5; i++) {
    const inset = i * 26; // тёмные края, как в комнате
    g.lineStyle(52, 0x000000, 0.14);
    g.strokeRect(inset, inset, width - 2 * inset, 640 - 2 * inset);
  }
  const placeXs = Array.from({ length: places }, (_, place) => amuletCaseX(place, places) - roomLeft);
  drawAmuletCase(g, local(AMULET_CASE), placeXs, AMULET_CASE_ICON_Y - roomTop, AMULET_CASE_PRICE_Y - roomTop);
  const coinSlot = { x: VENDING_COIN_SLOT.x - roomLeft, y: VENDING_COIN_SLOT.y - roomTop };
  drawVendingMachine(g, vending, local(VENDING_GLASS), local(VENDING_BIN), coinSlot, rows, {
    goodX: VENDING_GOOD_X - roomLeft,
    priceX: VENDING_PRICE_X - roomLeft,
  });
  bake(g, SHOP_ROOM_TEXTURE, width, 640);
}

/** Витрина амулетов на стене: деревянная рама, красный бархат, таблички под ценники, лампа сверху. */
function drawAmuletCase(g: Phaser.GameObjects.Graphics, box: Box, placeXs: number[], iconY: number, priceY: number): void {
  const { left, top } = topLeft(box);
  for (let i = 3; i >= 1; i--) {
    g.fillStyle(0xfde68a, 0.035); // тёплый свет лампы на стене
    g.fillEllipse(box.x, top + 30, 160 + i * 60, 90 + i * 40);
  }
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(left + 10, top + 8, box.width, box.height, 10); // тень на стене
  g.fillStyle(0x3b2412);
  g.fillRoundedRect(left, top, box.width, box.height, 10); // рама
  g.fillStyle(0x5b3a1e);
  g.fillRect(left + 8, top + 4, box.width - 16, 3); // светлый край рамки
  g.fillStyle(0x3f0a0a);
  g.fillRoundedRect(left + 10, top + 10, box.width - 20, box.height - 20, 6); // бархат
  for (const x of placeXs) {
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(x, iconY + 27, 48, 10); // тень под амулетом
    g.fillStyle(0x1c0505);
    g.fillRoundedRect(x - 34, priceY - 12, 68, 24, 5); // табличка для ценника
  }
  g.fillStyle(0xffffff, 0.05);
  g.fillTriangle(left + 10, top + 70, left + 80, top + 10, left + 120, top + 10); // блик на стекле
  g.fillStyle(0x94a3b8);
  g.fillRoundedRect(box.x - 40, top - 7, 80, 8, 3); // лампа над витриной
}

/** Где в ряду торгового автомата предмет и ценник (мировые x, сдвинутые к началу картинки). */
interface VendingRowLayout {
  goodX: number;
  priceX: number;
}

/** Торговый автомат: корпус, неоновая вывеска, витрина с рядами (предмет в спирали, справа табличка ценника), панель с щелью, лоток. */
function drawVendingMachine(
  g: Phaser.GameObjects.Graphics,
  body: Box,
  glass: Box,
  bin: Box,
  coinSlot: { x: number; y: number },
  rows: number,
  row: VendingRowLayout,
): void {
  const { left, top } = topLeft(body);
  const side = 14; // левый бок в тени
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(left + 12, top + 10, body.width, body.height, 18); // тень на стене
  g.fillStyle(0x0f172a);
  g.fillRoundedRect(left, top, body.width, body.height, 18);
  g.fillStyle(0x1e293b);
  g.fillRoundedRect(left + side, top, body.width - side, body.height, 18);
  g.lineStyle(3, 0x475569);
  g.strokeRoundedRect(left + side + 6, top + 6, body.width - side - 12, body.height - 12, 14);

  // Неоновая вывеска сверху: светящаяся трубка, вокруг — свечение.
  const signTop = top + 12;
  for (let i = 3; i >= 1; i--) {
    g.lineStyle(4 + i * 5, 0x22d3ee, 0.08);
    g.strokeRoundedRect(left + side + 24, signTop, body.width - side - 48, 24, 12);
  }
  g.lineStyle(3, 0x67e8f9);
  g.strokeRoundedRect(left + side + 24, signTop, body.width - side - 48, 24, 12);
  g.fillStyle(0x67e8f9);
  for (let i = 0; i < 3; i++) g.fillCircle(body.x - 24 + i * 24 + side / 2, signTop + 12, 4); // три огонька внутри

  // Витрина: тёмное стекло, полки рядов, спирали под предметами, таблички ценников и блики.
  const glassLeft = glass.x - glass.width / 2;
  const glassTop = glass.y - glass.height / 2;
  g.fillStyle(0x94a3b8);
  g.fillRoundedRect(glassLeft - 6, glassTop - 6, glass.width + 12, glass.height + 12, 12); // хромированная рамка
  g.fillStyle(0x071a24);
  g.fillRoundedRect(glassLeft, glassTop, glass.width, glass.height, 8);
  const rowHeight = glass.height / rows;
  for (let index = 0; index < rows; index++) {
    const rowTop = glassTop + rowHeight * index;
    const shelfY = rowTop + rowHeight - 8; // полка ряда
    g.fillStyle(0x334155);
    g.fillRect(glassLeft + 6, shelfY, glass.width - 12, 4);
    g.lineStyle(2, 0x64748b);
    for (let x = row.goodX - 24; x <= row.goodX + 24; x += 12) g.strokeEllipse(x, shelfY - 6, 10, 14); // спираль под предметом
    g.fillStyle(0x020617);
    g.fillRoundedRect(row.priceX - 16, rowTop + rowHeight / 2 - 13, glassLeft + glass.width - row.priceX + 8, 26, 5); // табличка ценника
  }
  g.fillStyle(0xffffff, 0.04);
  g.fillTriangle(glassLeft, glassTop + 60, glassLeft + 90, glassTop, glassLeft + 130, glassTop); // блик
  g.fillTriangle(glassLeft, glassTop + 60, glassLeft, glassTop + 100, glassLeft + 130, glassTop);

  // Панель справа от витрины: щель для фишек и кнопки.
  const { x: slotX, y: slotY } = coinSlot;
  g.fillStyle(0x94a3b8);
  g.fillRoundedRect(slotX - 10, slotY - 22, 20, 44, 5);
  g.fillStyle(0x020617);
  g.fillRect(slotX - 3, slotY - 16, 6, 32); // щель
  g.fillStyle(0x334155);
  for (let index = 0; index < 4; index++) {
    for (let col = 0; col < 2; col++) g.fillRoundedRect(slotX - 18 + col * 20, slotY + 44 + index * 22, 16, 16, 3); // кнопки
  }
  g.fillStyle(0xef4444);
  g.fillCircle(slotX, slotY + 150, 4); // лампочка

  // Лоток внизу: тёмный проём и откидная крышка.
  const binLeft = bin.x - bin.width / 2;
  const binTop = bin.y - bin.height / 2;
  g.fillStyle(0x94a3b8);
  g.fillRoundedRect(binLeft - 5, binTop - 5, bin.width + 10, bin.height + 10, 8);
  g.fillStyle(0x020617);
  g.fillRoundedRect(binLeft, binTop, bin.width, bin.height, 6);
  g.fillStyle(0x334155);
  g.fillRect(binLeft + 4, binTop + 3, bin.width - 8, bin.height / 2 - 3); // крышка
}

/** «Барабан» в магазине: круглая доска на стене, колесо с секторами, стрелка сверху и подсветка выпавшего сектора. */
export const DRUM_BACK_TEXTURE = 'drum-back';
export const DRUM_WHEEL_TEXTURE = 'drum-wheel'; // колесо — canvas: его перерисовывают, когда меняется, что может выпасть
export const DRUM_POINTER_TEXTURE = 'drum-pointer';
export const DRUM_GLOW_TEXTURE = 'drum-glow'; // золотой сектор острым концом в середину колеса
export const DRUM_POINTER_SIZE = { width: 22, height: 26 };
const DRUM_RIM = 3; // золотой обод колеса, px
const DRUM_ICON_AT = 0.62; // картинка приза — на такой доле радиуса от середины колеса
const DRUM_ICON_SIZE = 24; // сторона картинки приза в секторе, px
const DRUM_RED = '#7f1d1d';
const DRUM_BLACK = '#1c1917';
const DRUM_GREEN = '#14532d'; // сектор с фишками — зелёный, как сукно
const DRUM_GOLD = '#fbbf24';
const DRUM_DIM = 'rgba(0, 0, 0, 0.65)'; // сектор, который выпасть не может

/** Что нарисовано в секторе колеса: предмет, билет, место на полке или фишки. */
export type DrumFace = Item | 'ticket' | 'slot' | 'chips';

/** Доска под колесом, стрелка и подсветка сектора — неподвижные картинки (колесо рисует drawDrumWheel). */
export function createDrumTextures(scene: Phaser.Scene, radius: number, sectors: number): void {
  if (!scene.textures.exists(DRUM_BACK_TEXTURE)) {
    const size = 2 * radius + 28;
    const center = size / 2;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillCircle(center + 6, center + 7, radius + 10); // тень на стене
    g.fillStyle(0x3b2412);
    g.fillCircle(center, center, radius + 10); // круглая доска
    g.lineStyle(2, 0x5b3a1e);
    g.strokeCircle(center, center, radius + 8);
    bake(g, DRUM_BACK_TEXTURE, size, size);
  }
  if (!scene.textures.exists(DRUM_POINTER_TEXTURE)) {
    const { width, height } = DRUM_POINTER_SIZE;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.45);
    g.fillTriangle(3, 9, width - 1, 9, width / 2 + 2, height); // тень
    g.fillStyle(0xfbbf24);
    g.fillTriangle(1, 7, width - 3, 7, width / 2 - 1, height - 2); // стрелка остриём вниз, в колесо
    g.fillStyle(0xb45309);
    g.fillCircle(width / 2 - 1, 8, 7); // ось стрелки
    g.fillStyle(0xfde68a);
    g.fillCircle(width / 2 - 1, 8, 3);
    bake(g, DRUM_POINTER_TEXTURE, width, height);
  }
  if (!scene.textures.exists(DRUM_GLOW_TEXTURE)) {
    const half = Math.PI / sectors; // половина сектора
    const width = 2 * radius * Math.sin(half) + 8;
    const texture = createSharpCanvas(scene, DRUM_GLOW_TEXTURE, width, radius);
    if (!texture) return;
    const ctx = texture.context;
    ctx.beginPath();
    ctx.moveTo(width / 2, radius); // острый конец — внизу, в середине колеса
    ctx.arc(width / 2, radius, radius - DRUM_RIM, -Math.PI / 2 - half, -Math.PI / 2 + half);
    ctx.closePath();
    ctx.fillStyle = 'rgba(253, 224, 71, 0.45)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fde047';
    ctx.stroke();
    texture.refresh(); // передать нарисованное в видеокарту
  }
}

/**
 * Колесо: сектора по кругу от верха по часовой стрелке — красные и чёрные, с фишками — зелёные; на каждом картинка приза
 * (повёрнута так, что стоит прямо, когда её сектор под стрелкой). Сектора, которые выпасть не могут (available), затемнены.
 */
export function drawDrumWheel(scene: Phaser.Scene, faces: DrumFace[], available: boolean[], radius: number): void {
  const size = 2 * radius;
  // Текстура уже есть — её создала эта же функция, значит это canvas: берём его и рисуем заново.
  const texture = scene.textures.exists(DRUM_WHEEL_TEXTURE)
    ? (scene.textures.get(DRUM_WHEEL_TEXTURE) as Phaser.Textures.CanvasTexture)
    : createSharpCanvas(scene, DRUM_WHEEL_TEXTURE, size, size);
  if (!texture) return;
  const ctx = texture.context;
  const step = (Math.PI * 2) / faces.length;
  ctx.clearRect(0, 0, size, size);
  faces.forEach((face, sector) => {
    drawDrumSector(ctx, radius, sector, step, face === 'chips' ? DRUM_GREEN : sector % 2 === 0 ? DRUM_RED : DRUM_BLACK);
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(sector * step);
    ctx.translate(0, -radius * DRUM_ICON_AT);
    drawDrumFace(ctx, face);
    ctx.restore();
    if (!available[sector]) drawDrumSector(ctx, radius, sector, step, DRUM_DIM);
  });
  drawDrumRim(ctx, radius, faces.length, step);
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Сектор sector колеса радиуса radius — клин от середины до края, залитый fill. Первый сектор — сверху. */
function drawDrumSector(ctx: CanvasRenderingContext2D, radius: number, sector: number, step: number, fill: string): void {
  const middle = -Math.PI / 2 + sector * step;
  ctx.beginPath();
  ctx.moveTo(radius, radius);
  ctx.arc(radius, radius, radius - DRUM_RIM / 2, middle - step / 2, middle + step / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Картинка приза с серединой в (0, 0): предмет — его коробочка, билет — красный билет, место — клетка полки, фишки — две фишки. */
function drawDrumFace(ctx: CanvasRenderingContext2D, face: DrumFace): void {
  ctx.save();
  if (face === 'ticket') {
    const scale = DRUM_ICON_SIZE / TICKET_WIDTH;
    ctx.scale(scale, scale);
    ctx.translate(-TICKET_WIDTH / 2, -TICKET_HEIGHT / 2);
    drawTicket(ctx, TICKET_WIDTH, TICKET_HEIGHT);
  } else if (face === 'chips') {
    const scale = (DRUM_ICON_SIZE * 0.72) / CHIP_SIZE;
    for (const [dx, dy] of [[-4, 3], [4, -3]]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.scale(scale, scale);
      ctx.translate(-CHIP_SIZE / 2, -CHIP_SIZE / 2);
      drawChip(ctx, CHIP_SIZE);
      ctx.restore();
    }
  } else if (face === 'slot') {
    drawDrumSlot(ctx, DRUM_ICON_SIZE * 0.85);
  } else {
    const scale = DRUM_ICON_SIZE / ITEM_SIZE; // коробочка предмета нарисована под ITEM_SIZE — уменьшаем целиком
    ctx.scale(scale, scale);
    ctx.translate(-ITEM_SIZE / 2, -ITEM_SIZE / 2);
    drawItem(ctx, face, ITEM_SIZE);
  }
  ctx.restore();
}

/** Пустая клетка полки, как «место» в торговом автомате: деревянная рамка и тёмная ниша с полочкой. */
function drawDrumSlot(ctx: CanvasRenderingContext2D, size: number): void {
  const left = -size / 2;
  ctx.fillStyle = '#4a2f19';
  ctx.beginPath();
  ctx.roundRect(left, left, size, size, 3);
  ctx.fill(); // рамка
  ctx.fillStyle = '#140d08';
  ctx.fillRect(left + 3, left + 3, size - 6, size - 7); // ниша
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(left + 2, left + size - 5, size - 4, 3); // полочка внизу ниши
}

/** Золотой обод, спицы между секторами, штырьки на ободе (о них щёлкает стрелка) и ступица. */
function drawDrumRim(ctx: CanvasRenderingContext2D, radius: number, sectors: number, step: number): void {
  ctx.strokeStyle = DRUM_GOLD;
  ctx.fillStyle = DRUM_GOLD;
  ctx.lineWidth = 1.5;
  for (let sector = 0; sector < sectors; sector++) {
    const edge = -Math.PI / 2 + (sector + 0.5) * step; // граница между сектором и следующим
    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.lineTo(radius + Math.cos(edge) * (radius - DRUM_RIM), radius + Math.sin(edge) * (radius - DRUM_RIM));
    ctx.stroke(); // спица
    ctx.beginPath();
    ctx.arc(radius + Math.cos(edge) * (radius - 7), radius + Math.sin(edge) * (radius - 7), 2.2, 0, Math.PI * 2);
    ctx.fill(); // штырёк
  }
  ctx.lineWidth = DRUM_RIM;
  ctx.beginPath();
  ctx.arc(radius, radius, radius - DRUM_RIM / 2, 0, Math.PI * 2);
  ctx.stroke(); // обод
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(radius, radius, 9, 0, Math.PI * 2);
  ctx.fill(); // ступица
  ctx.fillStyle = DRUM_GOLD;
  ctx.beginPath();
  ctx.arc(radius, radius, 4, 0, Math.PI * 2);
  ctx.fill();
}

/** Имя текстуры амулета, например 'amulet-bones'. */
export function amuletTexture(amulet: Amulet): string {
  return `amulet-${amulet.id}`;
}

const CHARACTER_RING = '#fbbf24'; // ободок значка автомата с характером — золотой

/** Ободок амулета — по редкости: обычный серебряный, редкий синий, легендарный золотой, проклятый фиолетовый. */
const RARITY_COLORS: Record<Rarity, string> = {
  common: '#94a3b8',
  rare: '#38bdf8',
  legendary: '#fbbf24',
  cursed: '#a855f7',
};

/** Амулеты: тёмный медальон с ободком цвета редкости и знаком. Одна текстура — и в витрине, и в гнезде. */
export function createAmuletTextures(scene: Phaser.Scene, amulets: Amulet[], size: number): void {
  for (const amulet of amulets) {
    const key = amuletTexture(amulet);
    if (scene.textures.exists(key)) continue;
    const texture = createSharpCanvas(scene, key, size, size);
    if (!texture) continue;
    drawAmulet(texture.context, amulet, size);
    texture.refresh(); // передать нарисованное в видеокарту
  }
}

/** Один амулет на canvas: свечение цвета редкости (у обычного его нет), медальон, ободок, блик и знак. */
function drawAmulet(ctx: CanvasRenderingContext2D, amulet: Amulet, size: number): void {
  drawMedallion(ctx, amulet.sign, RARITY_COLORS[amulet.rarity], size, amulet.rarity !== 'common');
}

/** Имя текстуры значка автомата с характером, например 'machine-greedy'. */
export function characterTexture(character: MachineCharacter): string {
  return `machine-${character.id}`;
}

/** Значки автоматов с характером — такие же медальоны, как амулеты, с золотым ободком: на корпусе и в новости на стекле. */
export function createCharacterTextures(scene: Phaser.Scene, characters: MachineCharacter[], size: number): void {
  for (const character of characters) {
    const key = characterTexture(character);
    if (scene.textures.exists(key)) continue;
    const texture = createSharpCanvas(scene, key, size, size);
    if (!texture) continue;
    drawMedallion(texture.context, character.sign, CHARACTER_RING, size, true);
    texture.refresh(); // передать нарисованное в видеокарту
  }
}

/** Медальон на canvas: тёмный круг с ободком цвета color (glow — ободок светится), блик и знак sign. */
function drawMedallion(ctx: CanvasRenderingContext2D, sign: string, color: string, size: number, glow: boolean): void {
  const center = size / 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow ? 6 * TEXTURE_SCALE : 0; // тень canvas не увеличивается вместе с картинкой
  ctx.beginPath();
  ctx.arc(center, center, center - 4, 0, Math.PI * 2);
  ctx.fillStyle = '#111827';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(center, size * 0.27, size * 0.24, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fill(); // блик
  ctx.font = `bold ${Math.round(size * 0.48)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 4 * TEXTURE_SCALE;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(sign, center, center + 2);
}

/** Билет: одна красная картинка на табло, в витрине, на ценниках, в руке Коллектора и в клетке сетки. */
export function createTicketTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(TICKET_TEXTURE)) return;
  const texture = createSharpCanvas(scene, TICKET_TEXTURE, TICKET_WIDTH, TICKET_HEIGHT);
  if (!texture) return;
  drawTicket(texture.context, TICKET_WIDTH, TICKET_HEIGHT);
  texture.refresh(); // передать нарисованное в видеокарту
}

/**
 * Билет в прямоугольнике (0, 0)…(width, height): красный корешок с полукруглыми вырезами по бокам, линией отрыва и звездой.
 * Вырезы — часть контура, а не стёртые круги: так билет можно рисовать и поверх клетки сетки.
 */
function drawTicket(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const notch = height * TICKET_NOTCH; // радиус выреза
  const corner = height * TICKET_CORNER; // скругление углов
  const middle = height / 2;
  ctx.beginPath();
  ctx.moveTo(corner, 0);
  ctx.arcTo(width, 0, width, middle, corner);
  ctx.arc(width, middle, notch, -Math.PI / 2, Math.PI / 2, true); // вырез справа — внутрь билета
  ctx.arcTo(width, height, 0, height, corner);
  ctx.arcTo(0, height, 0, middle, corner);
  ctx.arc(0, middle, notch, Math.PI / 2, -Math.PI / 2, true); // вырез слева
  ctx.arcTo(0, 0, width, 0, corner);
  ctx.closePath();
  ctx.fillStyle = TICKET_RED;
  ctx.fill();
  ctx.shadowColor = 'transparent'; // тень (в клетке сетки) — только у самого билета
  ctx.lineWidth = height * TICKET_LINE;
  ctx.strokeStyle = TICKET_EDGE;
  ctx.stroke();

  // Линия отрыва и звезда — светлые.
  const tearX = width * TICKET_TEAR;
  ctx.strokeStyle = TICKET_INK;
  ctx.setLineDash([height * 0.09, height * 0.09]);
  ctx.beginPath();
  ctx.moveTo(tearX, height * 0.12);
  ctx.lineTo(tearX, height * 0.88);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = TICKET_INK;
  ctx.font = `bold ${Math.round(height * 0.6)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', width * 0.64, middle + height * 0.05);
}

/** Заглушка закрытого гнезда: хромированный диск со шлицем винта. */
export function createSocketCapTexture(scene: Phaser.Scene, radius: number): void {
  if (scene.textures.exists(SOCKET_CAP_TEXTURE)) return;
  const size = radius * 2;
  const g = scene.add.graphics();
  g.fillStyle(0x475569);
  g.fillCircle(radius, radius, radius - 3);
  g.fillStyle(0x64748b);
  g.fillCircle(radius, radius - 1, radius - 6);
  g.fillStyle(0x1f2937);
  g.fillRect(radius - 8, radius - 2, 16, 4); // шлиц винта
  bake(g, SOCKET_CAP_TEXTURE, size, size);
}

/** Игра с Коллектором: стол с сукном, лоток для амулета, револьвер (сбоку и стволом на тебя), вспышка, патроны и кнопки-цели. */
export function createRouletteTextures(scene: Phaser.Scene, table: Box, tray: Box): void {
  if (!scene.textures.exists(ROULETTE_TABLE_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0x3b2412);
    g.fillRoundedRect(0, 0, table.width, table.height, 16); // деревянный край
    g.fillStyle(0x14532d);
    g.fillRoundedRect(8, 8, table.width - 16, table.height - 16, 12); // сукно
    g.fillStyle(0xffffff, 0.04);
    g.fillRoundedRect(16, 12, table.width - 32, 14, 6); // свет лампы на сукне
    bake(g, ROULETTE_TABLE_TEXTURE, table.width, table.height);
  }
  if (!scene.textures.exists(AMULET_TRAY_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0xb45309);
    g.fillRoundedRect(0, 0, tray.width, tray.height, 10); // латунный край
    g.fillStyle(0x3f0a0a);
    g.fillRoundedRect(4, 4, tray.width - 8, tray.height - 8, 8); // бархат
    bake(g, AMULET_TRAY_TEXTURE, tray.width, tray.height);
  }
  if (!scene.textures.exists(REVOLVER_TEXTURE)) bakeRevolver(scene);
  if (!scene.textures.exists(MUZZLE_TEXTURE)) bakeMuzzle(scene);
  if (!scene.textures.exists(MUZZLE_FLASH_TEXTURE)) drawMuzzleFlash(scene);
  if (!scene.textures.exists(BULLET_LIVE_TEXTURE)) bakeBullet(scene, BULLET_LIVE_TEXTURE, 0xdc2626);
  if (!scene.textures.exists(BULLET_BLANK_TEXTURE)) bakeBullet(scene, BULLET_BLANK_TEXTURE, 0x2563eb);
  if (!scene.textures.exists(BULLET_GOLD_TEXTURE)) drawGoldBullet(scene);
  if (!scene.textures.exists(AIM_COLLECTOR_TEXTURE)) bakeAimButton(scene, AIM_COLLECTOR_TEXTURE, drawCrosshair);
  if (!scene.textures.exists(AIM_SELF_TEXTURE)) bakeAimButton(scene, AIM_SELF_TEXTURE, drawSmallMuzzle);
}

/** Револьвер сбоку, ствол вправо: деревянная рукоять, рама, барабан с желобками, ствол с мушкой, курок и спусковая скоба. */
function bakeRevolver(scene: Phaser.Scene): void {
  const v = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x5b2a12);
  g.fillPoints([v(26, 28), v(44, 30), v(38, 57), v(16, 55)], true); // рукоять
  g.fillStyle(0x7c3a17);
  g.fillPoints([v(29, 31), v(40, 32), v(35, 53), v(20, 52)], true); // светлая накладка
  g.fillStyle(0x27272a);
  g.fillRoundedRect(26, 13, 38, 20, 4); // рама
  g.fillRect(17, 7, 11, 4); // спица курка
  g.fillRect(22, 9, 6, 9); // курок
  g.lineStyle(3, 0x27272a);
  g.strokeCircle(48, 37, 6); // спусковая скоба
  g.fillStyle(0x52525b);
  g.fillRect(46, 31, 3, 8); // спуск
  g.fillStyle(0x71717a);
  g.fillRoundedRect(36, 11, 26, 22, 5); // барабан
  g.fillStyle(0x3f3f46);
  for (const y of [16, 21, 26]) g.fillRect(38, y, 22, 2); // желобки барабана
  g.fillRect(62, 15, 54, 9); // ствол
  g.fillStyle(0x27272a);
  g.fillRect(62, 24, 30, 4); // шомпол под стволом
  g.fillRect(110, 10, 4, 5); // мушка
  g.fillStyle(0xa1a1aa);
  g.fillRect(62, 15, 54, 2); // блик на стволе: револьвер виден и в темноте
  g.fillRect(38, 12, 22, 2); // блик на барабане
  bake(g, REVOLVER_TEXTURE, REVOLVER_SIZE.width, REVOLVER_SIZE.height);
}

/** Револьвер стволом на тебя: снизу рукоять, барабан с шестью гнёздами, поверх верхнего гнезда — ствол с чёрным дулом и мушкой. */
function bakeMuzzle(scene: Phaser.Scene): void {
  const size = 80;
  const center = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(0x5b2a12);
  g.fillRoundedRect(center - 9, 62, 18, 18, 4); // рукоять
  g.fillStyle(0x3f3f46);
  g.fillCircle(center, 42, 27); // барабан
  g.fillStyle(0x71717a);
  g.fillCircle(center, 42, 24);
  g.fillStyle(0x18181b);
  for (let chamber = 0; chamber < 6; chamber++) {
    const angle = ((chamber * 60 - 90) * Math.PI) / 180;
    g.fillCircle(center + 16 * Math.cos(angle), 42 + 16 * Math.sin(angle), 5); // гнёзда
  }
  g.fillStyle(0x27272a);
  g.fillCircle(center, center + MUZZLE_BORE.y, 12); // ствол поверх верхнего гнезда
  g.fillRect(center - 2, 9, 4, 6); // мушка
  g.fillStyle(0xa1a1aa);
  g.fillCircle(center, center + MUZZLE_BORE.y, 9);
  g.fillStyle(0x000000);
  g.fillCircle(center, center + MUZZLE_BORE.y, 6); // дуло
  bake(g, MUZZLE_TEXTURE, size, size);
}

/** Вспышка выстрела: восьмиконечная звезда, белая посередине, к краям — жёлтая, оранжевая и прозрачная (радиальный градиент на canvas). */
function drawMuzzleFlash(scene: Phaser.Scene): void {
  const size = 64;
  const center = size / 2;
  const texture = createSharpCanvas(scene, MUZZLE_FLASH_TEXTURE, size, size);
  if (!texture) return;
  const ctx = texture.context;
  const glow = ctx.createRadialGradient(center, center, 0, center, center, center);
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
  glow.addColorStop(0.3, 'rgba(253, 224, 71, 0.95)');
  glow.addColorStop(0.65, 'rgba(249, 115, 22, 0.6)');
  glow.addColorStop(1, 'rgba(249, 115, 22, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  for (let point = 0; point < 16; point++) {
    const radius = point % 2 === 0 ? center : center * 0.4; // лучи и впадины между ними
    const angle = (point * Math.PI) / 8;
    ctx.lineTo(center + radius * Math.cos(angle), center + radius * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Патрон стоя, как гильза в Buckshot Roulette: корпус цвета color (боевой — красный, холостой — синий), латунное донце. */
function bakeBullet(scene: Phaser.Scene, key: string, color: number): void {
  const g = scene.add.graphics();
  g.fillStyle(color);
  g.fillRoundedRect(1, 2, 12, 22, 3); // корпус
  g.fillStyle(0xffffff, 0.3);
  g.fillRect(3, 5, 2, 16); // блик
  g.fillStyle(0x000000, 0.25);
  g.fillRect(10, 5, 2, 16); // тень справа
  g.fillStyle(0xf59e0b);
  g.fillRect(1, 22, 12, 7); // латунь
  g.fillStyle(0xb45309);
  g.fillRect(0, 28, 14, 5); // донце
  bake(g, key, 14, 34);
}

// Трещины от пули: лучи из дыры (угол, длина, излом) и обрывки колец между ними. Числа постоянные — картинка всегда одна.
const CRACK_RAYS = [
  { angle: 0.15, length: 70, bend: 5 },
  { angle: 0.85, length: 50, bend: -4 },
  { angle: 1.55, length: 66, bend: 4 },
  { angle: 2.25, length: 42, bend: -5 },
  { angle: 2.9, length: 72, bend: 3 },
  { angle: 3.6, length: 54, bend: -4 },
  { angle: 4.3, length: 68, bend: 5 },
  { angle: 4.95, length: 46, bend: -3 },
  { angle: 5.65, length: 60, bend: 4 },
];
const CRACK_RINGS = [
  { radius: 20, from: 0.2, to: 1.4 },
  { radius: 22, from: 2.4, to: 3.5 },
  { radius: 19, from: 4.4, to: 5.6 },
  { radius: 38, from: 0.9, to: 2.0 },
  { radius: 36, from: 3.0, to: 4.2 },
  { radius: 40, from: 5.0, to: 6.0 },
];
const CRACK_HOLE = 8; // радиус дыры

/** Дыра от пули на стекле экрана и трещины вокруг неё (canvas: тонкие светлые линии и чёрная дыра с ободком). */
export function createCrackTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CRACK_TEXTURE)) return;
  const texture = createSharpCanvas(scene, CRACK_TEXTURE, CRACK_SIZE, CRACK_SIZE);
  if (!texture) return;
  const ctx = texture.context;
  const center = CRACK_SIZE / 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
  ctx.lineWidth = 1.4;
  for (const ray of CRACK_RAYS) {
    const cos = Math.cos(ray.angle);
    const sin = Math.sin(ray.angle);
    const middle = ray.length * 0.55; // излом — чуть дальше середины луча
    ctx.beginPath();
    ctx.moveTo(center + CRACK_HOLE * cos, center + CRACK_HOLE * sin);
    ctx.lineTo(center + middle * cos - ray.bend * sin, center + middle * sin + ray.bend * cos);
    ctx.lineTo(center + ray.length * cos, center + ray.length * sin);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
  ctx.lineWidth = 1;
  for (const ring of CRACK_RINGS) {
    ctx.beginPath();
    ctx.arc(center, center, ring.radius, ring.from, ring.to);
    ctx.stroke();
  }
  ctx.fillStyle = '#030303';
  ctx.beginPath();
  ctx.arc(center, center, CRACK_HOLE, 0, Math.PI * 2);
  ctx.fill(); // дыра
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke(); // светлый ободок разбитого стекла
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Круглая кнопка-цель, как стрелки Дилера: тень, тёмный круг в золотом кольце, на нём значок drawIcon. */
function bakeAimButton(scene: Phaser.Scene, key: string, drawIcon: (g: Phaser.GameObjects.Graphics) => void): void {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.45);
  g.fillCircle(27, 29, 25); // тень
  g.fillStyle(0x1f2937);
  g.fillCircle(26, 26, 25);
  g.lineStyle(3, 0xfbbf24);
  g.strokeCircle(26, 26, 23);
  drawIcon(g);
  bake(g, key, 54, 56);
}

/** Красный прицел: кольцо, четыре риски и точка посередине. */
function drawCrosshair(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(3, 0xef4444);
  g.strokeCircle(26, 26, 11);
  g.lineBetween(26, 8, 26, 18);
  g.lineBetween(26, 34, 26, 44);
  g.lineBetween(8, 26, 18, 26);
  g.lineBetween(34, 26, 44, 26);
  g.fillStyle(0xef4444);
  g.fillCircle(26, 26, 2.5);
}

/** Маленький револьвер стволом на тебя: барабан с гнёздами и над ним чёрное дуло. */
function drawSmallMuzzle(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x71717a);
  g.fillCircle(26, 30, 13);
  g.fillStyle(0x18181b);
  for (let chamber = 0; chamber < 6; chamber++) {
    const angle = ((chamber * 60 - 90) * Math.PI) / 180;
    g.fillCircle(26 + 8 * Math.cos(angle), 30 + 8 * Math.sin(angle), 2.2);
  }
  g.fillStyle(0x27272a);
  g.fillCircle(26, 22, 7.5); // ствол
  g.fillStyle(0xa1a1aa);
  g.fillCircle(26, 22, 5.5);
  g.fillStyle(0x000000);
  g.fillCircle(26, 22, 3.5); // дуло
}

/** Имя текстуры карты Дилера, например 'card-7'. */
export function cardTexture(value: number): string {
  return `card-${value}`;
}

/**
 * Игра Дилера: карты от min до max (белые, крупная цифра, ♠ в углах), рубашка, фиолетовое сукно поверх экрана,
 * две кнопки-стрелки, фишка для стопки-ставки и свечение под ней.
 * Цифры нарисованы прямо на картах, поэтому карту можно переворачивать одной картинкой.
 */
export function createDealerTextures(scene: Phaser.Scene, min: number, max: number, felt: Box): void {
  const width = 66;
  const height = 92;
  for (let value = min; value <= max; value++) {
    const key = cardTexture(value);
    if (scene.textures.exists(key)) continue;
    const texture = createSharpCanvas(scene, key, width, height);
    if (!texture) continue;
    drawCard(texture.context, width, height, String(value));
    texture.refresh(); // передать нарисованное в видеокарту
  }
  if (!scene.textures.exists(CARD_BACK_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0xf8fafc);
    g.fillRoundedRect(0, 0, width, height, 8);
    g.fillStyle(0x9d174d);
    g.fillRoundedRect(5, 5, width - 10, height - 10, 6); // рубашка
    g.lineStyle(2, 0xfbcfe8, 0.5);
    for (let y = 14; y < height - 10; y += 8) g.lineBetween(10, y, width - 10, y); // полосы рубашки
    g.lineStyle(3, 0xfbcfe8);
    g.strokeCircle(width / 2, height / 2, 14); // круг посередине
    bake(g, CARD_BACK_TEXTURE, width, height);
  }
  if (!scene.textures.exists(DEALER_FELT_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0x2e1065);
    g.fillRoundedRect(0, 0, felt.width, felt.height, 16); // фиолетовое сукно
    g.lineStyle(3, 0xa855f7);
    g.strokeRoundedRect(8, 8, felt.width - 16, felt.height - 16, 12);
    bake(g, DEALER_FELT_TEXTURE, felt.width, felt.height);
  }
  if (!scene.textures.exists(ARROW_UP_TEXTURE)) bakeArrow(scene, ARROW_UP_TEXTURE, true);
  if (!scene.textures.exists(ARROW_DOWN_TEXTURE)) bakeArrow(scene, ARROW_DOWN_TEXTURE, false);
  if (!scene.textures.exists(CHIP_STACK_TEXTURE)) bakeStackChip(scene);
  if (!scene.textures.exists(STAKE_GLOW_TEXTURE)) drawStakeGlow(scene);
}

/** Фишка сбоку-сверху: красная грань с белым кольцом и тёмный бок с белыми насечками. Из таких складывается стопка. */
function bakeStackChip(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(CHIP_SIDE);
  g.fillEllipse(18, 11, 36, 12); // нижний край
  g.fillRect(0, 5, 36, 6); // бок
  g.fillStyle(0xffffff);
  for (const x of [5, 16, 27]) g.fillRect(x, 8, 4, 6); // белые насечки на боку
  g.fillStyle(CHIP_TOP);
  g.fillEllipse(18, 5, 36, 10); // верхняя грань
  g.lineStyle(1.5, 0xffffff);
  g.strokeEllipse(18, 5, 22, 6); // белое кольцо на грани
  bake(g, CHIP_STACK_TEXTURE, 36, 18);
}

/** Свечение под ставкой: золотой круг, яркий до середины радиуса (её закрывает стопка) и прозрачный к краю — радиальный градиент на canvas. */
function drawStakeGlow(scene: Phaser.Scene): void {
  const size = STAKE_GLOW_SIZE;
  const texture = createSharpCanvas(scene, STAKE_GLOW_TEXTURE, size, size);
  if (!texture) return;
  const ctx = texture.context;
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, `rgba(${STAKE_GLOW_RGB}, 0.95)`);
  glow.addColorStop(0.55, `rgba(${STAKE_GLOW_RGB}, 0.6)`);
  glow.addColorStop(1, `rgba(${STAKE_GLOW_RGB}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Лицо карты: белая, цифра крупно посередине, ♠ в углах. */
function drawCard(ctx: CanvasRenderingContext2D, width: number, height: number, text: string): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 8);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#94a3b8';
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText(text, width / 2, height / 2 + 2);
  ctx.font = `14px ${FONT}`;
  ctx.fillText('♠', 11, 13);
  ctx.fillText('♠', width - 11, height - 13);
}

/** Круглая кнопка со стрелкой вверх (больше) или вниз (меньше). */
function bakeArrow(scene: Phaser.Scene, key: string, isUp: boolean): void {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.45);
  g.fillCircle(27, 29, 25); // тень
  g.fillStyle(isUp ? 0x15803d : 0xb91c1c);
  g.fillCircle(26, 26, 25);
  g.lineStyle(3, 0xfbbf24);
  g.strokeCircle(26, 26, 23);
  g.fillStyle(0xffffff);
  if (isUp) g.fillTriangle(26, 12, 40, 34, 12, 34);
  else g.fillTriangle(26, 40, 40, 18, 12, 18);
  bake(g, key, 54, 56);
}

/** Атмосфера: пылинка (мягкая точка), полосы развёртки поверх экрана и тёмные края всего вида. */
export const DUST_TEXTURE = 'dust';
export const SCANLINES_TEXTURE = 'scanlines';
export const VIGNETTE_TEXTURE = 'vignette';
const VIGNETTE_RADII = { inner: 260, outer: 710 }; // светлая середина и тёмный край — для вида шириной VIEW_WIDTH

export function createAtmosphereTextures(scene: Phaser.Scene, screen: Box): void {
  if (!scene.textures.exists(DUST_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0xfde68a, 0.35);
    g.fillCircle(3, 3, 3);
    g.fillStyle(0xfef3c7, 0.8);
    g.fillCircle(3, 3, 1.2);
    bake(g, DUST_TEXTURE, 6, 6);
  }
  if (!scene.textures.exists(SCANLINES_TEXTURE)) {
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.14);
    for (let y = 0; y < screen.height; y += 3) g.fillRect(0, y, screen.width, 1); // строки старого экрана
    bake(g, SCANLINES_TEXTURE, screen.width, screen.height);
  }
  if (!scene.textures.exists(VIGNETTE_TEXTURE)) {
    // Тень на весь вид. Она мягкая, чёткость ей не нужна — в обычном размере, без TEXTURE_SCALE.
    const width = Math.ceil(VIEW_WIDTH);
    const texture = scene.textures.createCanvas(VIGNETTE_TEXTURE, width, 640);
    if (texture) {
      // Градиент — на canvas 2D: Graphics.generateTexture градиенты пропускает.
      const ctx = texture.context;
      const { inner, outer } = VIGNETTE_RADII;
      const shade = ctx.createRadialGradient(VIEW_CENTER_X, 320, inner, VIEW_CENTER_X, 320, outer); // середина светлая, к краям темнее
      shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, width, 640);
      texture.refresh(); // передать нарисованное в видеокарту
    }
  }
}

/** Знак паузы — две полоски. Белый: в углу экрана его делают бледным (setAlpha), на экране паузы — крупным. */
export const PAUSE_ICON_TEXTURE = 'pause-icon';

export function createPauseIconTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PAUSE_ICON_TEXTURE)) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff);
  g.fillRoundedRect(4, 2, 5, 18, 2);
  g.fillRoundedRect(13, 2, 5, 18, 2);
  bake(g, PAUSE_ICON_TEXTURE, 22, 22);
}

/** Шестерёнка — значок настроек (и паузы) в углу: обод и восемь зубцов. Белая — бледной её делают setAlpha. */
export const GEAR_TEXTURE = 'gear';

export function createGearTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GEAR_TEXTURE)) return;
  const size = 24;
  const middle = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(0xffffff);
  for (let index = 0; index < 8; index++) {
    const angle = (index * Math.PI) / 4;
    g.fillCircle(middle + Math.cos(angle) * 8, middle + Math.sin(angle) * 8, 2.6); // зубцы
  }
  g.lineStyle(4, 0xffffff);
  g.strokeCircle(middle, middle, 6); // обод с дыркой посередине
  bake(g, GEAR_TEXTURE, size, size);
}

/** Значок «во весь экран»: четыре уголка рамки. */
export const FULLSCREEN_TEXTURE = 'fullscreen';

export function createFullscreenTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(FULLSCREEN_TEXTURE)) return;
  const size = 22;
  const corner = 8; // длина уголка
  const g = scene.add.graphics();
  g.lineStyle(3, 0xffffff, 0.55);
  for (const [x, y, dx, dy] of [
    [2, 2, 1, 1],
    [size - 2, 2, -1, 1],
    [2, size - 2, 1, -1],
    [size - 2, size - 2, -1, -1],
  ]) {
    g.lineBetween(x, y, x + dx * corner, y);
    g.lineBetween(x, y, x, y + dy * corner);
  }
  bake(g, FULLSCREEN_TEXTURE, size, size);
}

/**
 * Монитор символов: терминал на полу у правой стены. Корпус — одна запечённая картинка (с холодным отсветом экрана на стене),
 * экран — canvas: цены платящих символов, что делают особые, внизу — что даёт джекпот. Экран перерисовывается,
 * когда в автомат входят новые символы или меняется язык (это раз в раунд — дёшево).
 */
export const KIOSK_TEXTURE = 'monitor-kiosk';
export const MONITOR_SCREEN_TEXTURE = 'monitor-screen';
export const KIOSK_GLOW = 30; // отсвет выходит за корпус на столько с каждой стороны — картинка больше корпуса
const KIOSK_DARK = 0x0b1120; // бок, гнездо лампочки, решётка динамика, подставка
const KIOSK_FRONT = 0x1e293b; // лицевая часть
const KIOSK_TRIM = 0x475569;
const MONITOR_BG = '#03161c'; // кинескоп: тёмный, с холодным отсветом к середине
const MONITOR_INK = '#cffafe'; // надписи
const MONITOR_LINE = 'rgba(103, 232, 249, 0.3)'; // разделители
const MONITOR_NEW = '#fde047'; // символ, который вошёл в автомат в этом раунде, — в золотой рамке
const MONITOR_PRICE_COLOR = '#fbbf24'; // цены — как цифры табло
const MONITOR_PAD = 10; // поля экрана
const MONITOR_PRICE_COLUMNS = 3; // цены — по три в ряд
const MONITOR_PRICE_ROW = 40;
const MONITOR_PRICE_ICON = 30;
const MONITOR_PRICE_CHIP = 14;
const MONITOR_NOTE_ROW = 30; // особый символ: значок и что делает (до двух строк)
const MONITOR_NOTE_ICON = 26;
const MONITOR_NOTE_FONT = 11;
const MONITOR_NOTE_LINE = 13; // высота строки описания
const MONITOR_MINI_CELL = 5; // схема джекпота: клетки 5×3
const MONITOR_MINI_GAP = 1.5;

/** Платящий символ на мониторе: сколько платит его паттерн ×1. isNew — вошёл в автомат в этом раунде. */
export interface MonitorPrice {
  symbol: SlotSymbol;
  price: number;
  isNew: boolean;
}

/** Особый символ на мониторе: что он делает. */
export interface MonitorNote {
  symbol: SlotSymbol;
  text: string;
  isNew: boolean;
}

/** Корпус терминала (и экран, и всё вокруг) — в текстуру KIOSK_TEXTURE. Координаты частей — мировые, их сдвигаем к началу картинки. */
export function createKioskTexture(scene: Phaser.Scene, kiosk: Box, screen: Box): void {
  if (scene.textures.exists(KIOSK_TEXTURE)) return;
  const width = kiosk.width + 2 * KIOSK_GLOW;
  const height = kiosk.height + 2 * KIOSK_GLOW;
  const { left: kioskLeft, top: kioskTop } = topLeft(kiosk);
  const left = KIOSK_GLOW;
  const top = KIOSK_GLOW;
  const screenLeft = screen.x - screen.width / 2 - kioskLeft + KIOSK_GLOW;
  const screenTop = screen.y - screen.height / 2 - kioskTop + KIOSK_GLOW;
  const g = scene.add.graphics();
  for (let i = 0; i < 5; i++) {
    g.fillStyle(0x22d3ee, 0.025); // холодный отсвет экрана на стене
    g.fillEllipse(width / 2, screenTop + screen.height / 2, width - i * 40, screen.height + 40 - i * 50);
  }
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(left + 10, top + 8, kiosk.width, kiosk.height - 8, 16); // тень на стене
  g.fillStyle(KIOSK_DARK);
  g.fillRoundedRect(left, top, kiosk.width, kiosk.height, 16); // левый бок в тени
  g.fillStyle(KIOSK_FRONT);
  g.fillRoundedRect(left + 12, top, kiosk.width - 12, kiosk.height, 16);
  g.lineStyle(3, KIOSK_TRIM);
  g.strokeRoundedRect(left + 18, top + 6, kiosk.width - 24, kiosk.height - 12, 12);
  g.fillStyle(KIOSK_DARK);
  g.fillCircle(width / 2, top + 12, 7); // гнездо лампочки над экраном
  g.fillStyle(0x64748b);
  g.fillRoundedRect(screenLeft - 9, screenTop - 9, screen.width + 18, screen.height + 18, 14); // хромированная рамка экрана
  g.fillStyle(0x020617);
  g.fillRoundedRect(screenLeft - 5, screenTop - 5, screen.width + 10, screen.height + 10, 12); // тёмное стекло
  const grilleTop = screenTop + screen.height + 24;
  g.fillStyle(KIOSK_DARK);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 9; col++) g.fillRoundedRect(width / 2 - 70 + col * 16, grilleTop + row * 7, 12, 4, 2); // решётка динамика
  }
  g.fillRoundedRect(left - 6, top + kiosk.height - 16, kiosk.width + 12, 16, 4); // подставка на полу
  bake(g, KIOSK_TEXTURE, width, height);
}

/** Экран монитора на canvas MONITOR_SCREEN_TEXTURE (width×height): цены, особые символы, внизу — джекпот. Рисуется заново целиком. */
export function drawMonitorScreen(
  scene: Phaser.Scene,
  width: number,
  height: number,
  prices: MonitorPrice[],
  notes: MonitorNote[],
  jackpot: string,
): void {
  // Текстура уже есть — её создала эта же функция, значит это canvas: берём его и рисуем заново.
  const texture = scene.textures.exists(MONITOR_SCREEN_TEXTURE)
    ? (scene.textures.get(MONITOR_SCREEN_TEXTURE) as Phaser.Textures.CanvasTexture)
    : createSharpCanvas(scene, MONITOR_SCREEN_TEXTURE, width, height);
  if (!texture) return;
  const ctx = texture.context;
  ctx.clearRect(0, 0, width, height);
  drawMonitorBackground(ctx, width, height);
  let y = drawMonitorPrices(ctx, prices, width, MONITOR_PAD);
  y = drawMonitorDivider(ctx, width, y);
  for (const note of notes) y = drawMonitorNote(ctx, note, width, y);
  const jackpotTop = height - MONITOR_PAD - MONITOR_NOTE_ROW; // джекпот — всегда внизу экрана
  drawMonitorDivider(ctx, width, jackpotTop - MONITOR_PAD);
  drawMonitorJackpot(ctx, jackpot, width, jackpotTop);
  drawMonitorScanlines(ctx, width, height);
  texture.refresh(); // передать нарисованное в видеокарту
}

/** Кинескоп: тёмный фон, к середине — холодный отсвет. */
function drawMonitorBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 10);
  ctx.fillStyle = MONITOR_BG;
  ctx.fill();
  const glow = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, height * 0.7);
  glow.addColorStop(0, 'rgba(34, 211, 238, 0.12)');
  glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
  ctx.fillStyle = glow;
  ctx.fill();
}

/** Цены платящих символов — по три в ряд: клетка символа, фишка и «×N». Возвращает, где кончились ряды. */
function drawMonitorPrices(ctx: CanvasRenderingContext2D, prices: MonitorPrice[], width: number, top: number): number {
  const columnWidth = (width - 2 * MONITOR_PAD) / MONITOR_PRICE_COLUMNS;
  prices.forEach((entry, index) => {
    const left = MONITOR_PAD + (index % MONITOR_PRICE_COLUMNS) * columnWidth;
    const middle = top + Math.floor(index / MONITOR_PRICE_COLUMNS) * MONITOR_PRICE_ROW + MONITOR_PRICE_ROW / 2;
    if (entry.isNew) drawMonitorFrame(ctx, left, middle - MONITOR_PRICE_ROW / 2 + 2, columnWidth - 4, MONITOR_PRICE_ROW - 4);
    drawMonitorIcon(ctx, entry.symbol, left + 3, middle - MONITOR_PRICE_ICON / 2, MONITOR_PRICE_ICON);
    ctx.save();
    ctx.translate(left + MONITOR_PRICE_ICON + 6, middle - MONITOR_PRICE_CHIP / 2);
    drawChip(ctx, MONITOR_PRICE_CHIP);
    ctx.restore();
    ctx.font = `bold 15px ui-monospace, "DejaVu Sans Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = MONITOR_PRICE_COLOR;
    ctx.fillText(`×${entry.price}`, left + MONITOR_PRICE_ICON + MONITOR_PRICE_CHIP + 8, middle + 1);
  });
  return top + Math.ceil(prices.length / MONITOR_PRICE_COLUMNS) * MONITOR_PRICE_ROW;
}

/** Особый символ: значок слева, справа — что делает, до двух строк. Возвращает, где кончилась строка. */
function drawMonitorNote(ctx: CanvasRenderingContext2D, note: MonitorNote, width: number, top: number): number {
  const middle = top + MONITOR_NOTE_ROW / 2;
  if (note.isNew) drawMonitorFrame(ctx, MONITOR_PAD - 4, top + 1, width - 2 * MONITOR_PAD + 8, MONITOR_NOTE_ROW - 2);
  drawMonitorIcon(ctx, note.symbol, MONITOR_PAD, middle - MONITOR_NOTE_ICON / 2, MONITOR_NOTE_ICON);
  const textLeft = MONITOR_PAD + MONITOR_NOTE_ICON + 8;
  drawMonitorText(ctx, note.text, textLeft, middle, width - textLeft - MONITOR_PAD);
  return top + MONITOR_NOTE_ROW;
}

/** Джекпот: маленькая схема «все 15 клеток» и что он даёт кроме фишек. */
function drawMonitorJackpot(ctx: CanvasRenderingContext2D, text: string, width: number, top: number): void {
  const middle = top + MONITOR_NOTE_ROW / 2;
  const step = MONITOR_MINI_CELL + MONITOR_MINI_GAP;
  const schemeTop = middle - (GRID_ROWS * step - MONITOR_MINI_GAP) / 2;
  ctx.fillStyle = cssColor(MINI_ON);
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col++) ctx.fillRect(MONITOR_PAD + col * step, schemeTop + row * step, MONITOR_MINI_CELL, MONITOR_MINI_CELL);
  }
  const textLeft = MONITOR_PAD + GRID_COLUMNS * step + 6;
  drawMonitorText(ctx, text, textLeft, middle, width - textLeft - MONITOR_PAD);
}

/** Надпись монитора: переносится по словам (до двух строк), стоит по высоте вокруг middle. */
function drawMonitorText(ctx: CanvasRenderingContext2D, text: string, left: number, middle: number, maxWidth: number): void {
  ctx.font = `${MONITOR_NOTE_FONT}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = MONITOR_INK;
  const lines = wrapWords(ctx, text, maxWidth);
  lines.forEach((line, index) => ctx.fillText(line, left, middle + (index - (lines.length - 1) / 2) * MONITOR_NOTE_LINE));
}

/** Разбить надпись на строки не шире maxWidth — по словам. */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const longer = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(longer).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = longer;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Клетка символа в уголке монитора — та же, что на сетке, только меньше. */
function drawMonitorIcon(ctx: CanvasRenderingContext2D, symbol: SlotSymbol, x: number, y: number, size: number): void {
  ctx.save(); // клетка ставит себе тень — после неё тень убираем
  ctx.translate(x, y);
  drawSymbolCell(ctx, symbol, size, size * 0.15);
  ctx.restore();
}

/** Золотая рамка: этот символ вошёл в автомат только что. */
function drawMonitorFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = MONITOR_NEW;
  ctx.stroke();
}

/** Тонкая линия между частями экрана. Возвращает, где продолжать. */
function drawMonitorDivider(ctx: CanvasRenderingContext2D, width: number, y: number): number {
  ctx.fillStyle = MONITOR_LINE;
  ctx.fillRect(MONITOR_PAD, y + MONITOR_PAD / 2, width - 2 * MONITOR_PAD, 1);
  return y + MONITOR_PAD;
}

/** Строки кинескопа поверх всего экрана. */
function drawMonitorScanlines(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
}

/** Бесплатная прокрутка за короны — маленькая золотая корона со свечением: такие стоят в ряду лампочек прокруток. */
export const CROWN_LAMP_TEXTURE = 'crown-lamp';
const CROWN_LAMP_SIZE = 24;

export function createCrownLampTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CROWN_LAMP_TEXTURE)) return;
  const size = CROWN_LAMP_SIZE;
  const texture = createSharpCanvas(scene, CROWN_LAMP_TEXTURE, size, size);
  if (!texture) return;
  const ctx = texture.context;
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgba(253, 224, 71, 0.9)');
  glow.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👑', size / 2, size / 2 + 1);
  texture.refresh(); // передать нарисованное в видеокарту
}

import { AMULET_OFFER_SIZE } from './amulets';
import { GRID_COLUMNS, GRID_ROWS } from './rules';

/**
 * Где что стоит. Числа — в единицах раскладки: экран высотой 640, автомат — посередине, при x = 480.
 * Вид от первого лица: автомат вплотную, вокруг тёмная комната.
 * Части автомата — прямоугольники Box: по ним decor.ts рисует корпус, а части из parts/ ставят поверх живые объекты.
 */

/** Прямоугольник: x, y — его середина. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CENTER_X = 480;
export const CENTER_Y = 320;

// Экран — Full HD, 16:9: игра рисуется в 1920×1080, а камера увеличивает раскладку в ZOOM раз (высота 640 → 1080).
// По ширине тогда видно VIEW_WIDTH единиц — на ~178 больше, чем 960: по ~89 комнаты с каждой стороны автомата.
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;
export const VIEW_HEIGHT = 640; // высота вида в единицах раскладки
export const ZOOM = GAME_HEIGHT / VIEW_HEIGHT; // 1,6875
export const VIEW_WIDTH = GAME_WIDTH / ZOOM; // ~1138
export const VIEW_CENTER_X = VIEW_WIDTH / 2; // середина вида — для вещей, приклеенных к экрану (setScrollFactor(0))
export const HOME_SCROLL = CENTER_X - VIEW_CENTER_X; // ~−89: левый край вида, когда смотришь на автомат
// Комната шире на столько с каждой стороны, а магазин слева и темнота Коллектора справа отодвинуты на столько же:
// от автомата их не видно, а повёрнутый вид показывает их так же, как раньше.
export const ROOM_SIDE = 178;

// Сетка 5×3.
export const GRID_Y = 314; // центр сетки
export const CELL_SIZE = 80;
export const CELL_GAP = 6;
export const CELL_STEP = CELL_SIZE + CELL_GAP; // от центра клетки до центра соседней
export const CELL_RADIUS = 12; // скругление углов клетки
const SCREEN_PADDING = 18; // окно экрана шире сетки на столько с каждой стороны

// Части автомата.
export const BODY: Box = { x: CENTER_X, y: 366, width: 600, height: 720 }; // корпус; низ уходит за край экрана
export const DISPLAY: Box = { x: CENTER_X, y: 40, width: 260, height: 50 }; // табло: сколько у тебя фишек
export const GLASS: Box = { x: CENTER_X, y: 116, width: 500, height: 80 }; // стекло с паттернами
// Новость «ФАЗА 2» на стекле: надпись в верхней половине, под ней знаки — что изменилось (их ставит MachinePanel).
export const PHASE_TITLE_Y = GLASS.y - 17;
export const PHASE_SIGNS_Y = GLASS.y + 21;
export const SCREEN: Box = {
  x: CENTER_X,
  y: GRID_Y,
  width: GRID_COLUMNS * CELL_STEP - CELL_GAP + 2 * SCREEN_PADDING,
  height: GRID_ROWS * CELL_STEP - CELL_GAP + 2 * SCREEN_PADDING,
}; // окно вокруг сетки
export const BELLY: Box = { x: CENTER_X, y: 540, width: 500, height: 130 }; // панель под экраном
export const MULTIPLIER_WINDOW: Box = { x: 320, y: 552, width: 130, height: 58 }; // окошко множителя серии
export const PAYOUT_WINDOW: Box = { x: 565, y: 552, width: 290, height: 70 }; // окошко выплаты — электронное табло с коном
export const LEVER_MOUNT: Box = { x: 800, y: 338, width: 48, height: 76 }; // крепление рычага; из его середины растёт рычаг
// Табло: слева фишки, справа билеты. Сюда летят забранные фишки и полученные билеты.
// Числа видны и когда вид повёрнут к Коллектору, и в магазине.
export const BOARD_CHIP_X = DISPLAY.x - 96; // значок фишки
export const BOARD_CHIPS_TEXT_X = DISPLAY.x - 76; // сколько фишек — слева направо от этой точки
export const BOARD_CHIPS_MAX_WIDTH = 134; // шире число фишек не бывает: дальше шрифт уменьшается
export const BOARD_TICKET_X = DISPLAY.x + 76; // значок билета
export const BOARD_TICKETS_TEXT_X = DISPLAY.x + 91; // сколько билетов — слева направо от этой точки
// Гнёзда для амулетов на верхушке корпуса: по три слева и справа от табло, открываются по очереди — от табло к краям.
export const SOCKET_Y = DISPLAY.y;
export const SOCKET_RADIUS = 21;
export const SOCKET_XS = [322, 638, 276, 684, 230, 730];
export const SPIN_LAMPS_Y = 492; // лампочки прокруток под экраном
// Значок автомата с характером — на корпусе слева от экрана, между бронзовой окантовкой и рамкой экрана.
export const MACHINE_BADGE = { x: 224, y: GRID_Y };
export const MACHINE_BADGE_SIZE = 34; // сторона картинки значка

// Комната.
export const NOTE: Box = { x: 96, y: 118, width: 150, height: 120 }; // записка с долгом на стене
export const NOTE_ANGLE = -6; // записка висит чуть криво, градусы
export const DARKNESS: Box = { x: 1200 + ROOM_SIDE, y: CENTER_Y, width: 480, height: 640 }; // темнота справа от комнаты, там Коллектор
export const TURN_SCROLL = 380; // левый край вида у Коллектора: вид уезжает вправо, табло остаётся видно у левого края
// Игра с Коллектором: стол в темноте под его рукой — на сукне ряд патронов и револьвер, ниже — лоток, куда кладут амулет.
export const ROULETTE_TABLE: Box = { x: 1150 + ROOM_SIDE, y: 474, width: 380, height: 124 };
export const BULLETS_Y = 440; // ряд патронов: сколько боевых и холостых в барабане
export const REVOLVER = { x: 1150 + ROOM_SIDE, y: 500 }; // где лежит револьвер
export const AMULET_TRAY: Box = { x: 1150 + ROOM_SIDE, y: 594, width: 360, height: 58 };
// Твой ход в рулетке: кнопка «в Коллектора» — прицел на его рукаве, «в себя» — внизу, на месте лотка (лоток тогда убран).
export const AIM_AT_COLLECTOR = { x: 1262 + ROOM_SIDE, y: 330 };
export const AIM_AT_SELF = { x: 1150 + ROOM_SIDE, y: 594 };
// Лупа на столе Коллектора — левее револьвера: в твой ход её можно взять и посмотреть следующий патрон.
export const MAGNIFIER_SPOT = { x: 1015 + ROOM_SIDE, y: 500 };
// Выстрел в автомат: пуля попадает в правую часть экрана — дыру видно и у Коллектора (у левого края вида), и от автомата.
export const SHOT_HOLE = { x: 612, y: 282 };

// Монитор символов — терминал на полу у правой стены, справа от рычага: цены символов и что делает каждый.
// От автомата видна его левая часть; вид поворачивается к нему (MONITOR_SCROLL), как к магазину, только вправо.
export const MONITOR_KIOSK: Box = { x: 990, y: 300, width: 290, height: 520 }; // корпус; низ стоит на полу
export const MONITOR_SCREEN: Box = { x: 990, y: 284, width: 252, height: 420 }; // экран: над ним лампочка, под ним подсказка клавиши
export const MONITOR_SCROLL = 390; // левый край вида у монитора: монитор почти посередине, а рука Коллектора, спрятанная в темноте, ещё не видна
// Видеомагнитофон — на деревянном ящике перед левым краем монитора: его видно и от автомата, и у Коллектора,
// и он выше подсказки внизу экрана (у Коллектора она как раз под ним). На него ложится купленная кассета.
export const VCR: Box = { x: 860, y: 543, width: 150, height: 34 };
export const VCR_CRATE: Box = { x: 860, y: 600, width: 136, height: 80 }; // ящик под видеомагнитофоном, стоит на полу

// Предметы (полка, магазин, у экрана) и амулеты (гнёзда, витрина) — квадратные картинки такой стороны, px.
export const ITEM_SIZE = 56;
export const AMULET_SIZE = 36;
// Полки с предметами на стене под запиской: в каждой SHELF_COLUMN клеток столбиком, сверху вниз.
// Первая полка — под запиской (места 1–4), вторая — левее (места 5–8).
export const SHELF_X = 70; // середина клеток первой полки
export const SHELF_TOP_Y = 248; // середина верхней клетки
export const SHELF_STEP = 76; // от клетки до клетки
export const SHELF_CELL = 66; // сторона клетки
export const SHELF_COLUMN = 4; // клеток в одной полке
export const SHELF_COLUMN_STEP = 74; // вторая полка левее первой на столько
// Включённые предметы (щит, чеснок, ×3) — столбиком справа от экрана, у каждого своё место.
export const EFFECTS_X = 744;
export const EFFECTS_TOP_Y = 206;
export const EFFECTS_STEP = 54;

// Магазин — слева от комнаты: после расплаты вид уезжает туда. Полка и табло остаются видны.
export const SHOP_SCROLL = -360 - ROOM_SIDE; // левый край вида в магазине
export const LEFT_ROOM: Box = { x: -240 - ROOM_SIDE, y: CENTER_Y, width: 480, height: 640 }; // продолжение комнаты слева
// Витрина амулетов на стене: 2 амулета, билет и гнездо — в ряд.
export const AMULET_CASE_PLACES = AMULET_OFFER_SIZE + 2;
export const AMULET_CASE: Box = { x: -200 - ROOM_SIDE, y: 104, width: 312, height: 152 };
export const AMULET_CASE_STEP = 76; // от места до места
export const AMULET_CASE_ICON_Y = 92; // амулеты и билет
export const AMULET_CASE_PRICE_Y = 146; // ценники под ними
export const AMULET_CASE_KEY_Y = 48; // номера клавиш над ними
// Торговый автомат под витриной: предметы рядами, справа от предмета — ценник.
export const VENDING: Box = { x: -210 - ROOM_SIDE, y: 404, width: 280, height: 412 };
export const VENDING_GLASS: Box = { x: -242 - ROOM_SIDE, y: 384, width: 196, height: 280 }; // витрина: 4 ряда
export const VENDING_GOOD_X = -290 - ROOM_SIDE; // предмет в ряду
export const VENDING_PRICE_X = -242 - ROOM_SIDE; // ценник: фишка, правее — «× цена»
export const VENDING_KEY_X = -330 - ROOM_SIDE; // номер ряда — у левого края витрины
export const VENDING_COIN_SLOT = { x: -108 - ROOM_SIDE, y: 282 }; // щель для фишек на панели справа от витрины
export const VENDING_BIN: Box = { x: -226 - ROOM_SIDE, y: 566, width: 220, height: 36 }; // лоток внизу: сюда падает покупка
// «Барабан» — колесо на стене справа от торгового автомата: под ним ценник, над стрелкой — номер клавиши.
export const DRUM_WHEEL = { x: -160, y: 290 }; // середина колеса
export const DRUM_RADIUS = 56;
export const SAVE_TAPE = { x: -35 - ROOM_SIDE, y: 462 }; // кассета — один откат за забег: на стене между торговым автоматом и полкой, над кнопкой «назад»
export const SHOP_LEAVE = { x: -35 - ROOM_SIDE, y: 560 }; // кнопка «назад к автомату» — у торгового автомата, в комнате слева: от игрового автомата её не видно
export const BULLET_STAND = { x: -110, y: 462 }; // патрон за билеты — на стене правее кассеты, под барабаном

/** Клетка полки номер slot (0 — верхняя клетка первой полки, SHELF_COLUMN — верхняя клетка второй): середина по горизонтали. */
export function shelfX(slot: number): number {
  return SHELF_X - Math.floor(slot / SHELF_COLUMN) * SHELF_COLUMN_STEP;
}

/** Клетка полки номер slot: середина по вертикали. */
export function shelfY(slot: number): number {
  return SHELF_TOP_Y + (slot % SHELF_COLUMN) * SHELF_STEP;
}

/** Ряд витрины номер row (0 — верхний): предметы, в последнем ряду — место на полке. */
export function vendingRowY(row: number, rows: number): number {
  const step = VENDING_GLASS.height / rows;
  return VENDING_GLASS.y - VENDING_GLASS.height / 2 + step * (row + 0.5);
}

/** Место в витрине амулетов номер place (0 — левое). */
export function amuletCaseX(place: number, places: number): number {
  return AMULET_CASE.x + (place - (places - 1) / 2) * AMULET_CASE_STEP;
}

/** Центр клетки по горизонтали: столбцы стоят по центру экрана. */
export function cellX(col: number): number {
  return CENTER_X + (col - (GRID_COLUMNS - 1) / 2) * CELL_STEP;
}

/** Центр клетки по вертикали: ряды стоят вокруг GRID_Y. */
export function cellY(row: number): number {
  return GRID_Y + (row - (GRID_ROWS - 1) / 2) * CELL_STEP;
}

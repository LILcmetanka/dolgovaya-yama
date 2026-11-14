import { AMULET_OFFER_SIZE } from './amulets';
import { GRID_COLUMNS, GRID_ROWS } from './rules';

/**
 * Где что стоит. Числа — в единицах раскладки: вид высотой 640 и шириной VIEW_WIDTH, автомат — посередине, при x = CENTER_X.
 * Вид от первого лица: автомат вплотную, вокруг тёмная комната. Камера стоит на месте: вся комната влезает в вид.
 * Части автомата — прямоугольники Box: по ним decor.ts рисует корпус, а части из parts/ ставят поверх живые объекты.
 */

/** Прямоугольник: x, y — его середина. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CENTER_X = 569;
export const CENTER_Y = 320;

// Экран — Full HD, 16:9: игра рисуется в 1920×1080, а камера увеличивает раскладку в ZOOM раз (высота 640 → 1080).
// По ширине тогда видно VIEW_WIDTH единиц — чуть больше 1138: вся комната, автомат посередине.
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;
export const VIEW_HEIGHT = 640; // высота вида в единицах раскладки
export const ZOOM = GAME_HEIGHT / VIEW_HEIGHT; // 1,6875
export const VIEW_WIDTH = GAME_WIDTH / ZOOM; // ~1138
export const VIEW_CENTER_X = VIEW_WIDTH / 2; // середина вида — для вещей, приклеенных к экрану (setScrollFactor(0))

// Сетка 5×3.
export const GRID_Y = 314; // центр сетки
export const CELL_SIZE = 80;
export const CELL_GAP = 6;
export const CELL_STEP = CELL_SIZE + CELL_GAP; // от центра клетки до центра соседней
export const CELL_RADIUS = 12; // скругление углов клетки
const SCREEN_PADDING = 18; // окно экрана шире сетки на столько с каждой стороны

// Части автомата.
// Корпус — его лицевая часть, ровно посередине; тёмный левый бок рисуется левее (decor.ts). Низ уходит за край экрана.
export const BODY: Box = { x: CENTER_X, y: 366, width: 600, height: 720 };
// Табло: сколько у тебя фишек и билетов. Посередине между окантовкой корпуса и стеклом с паттернами — не прилипает к верху.
export const DISPLAY: Box = { x: CENTER_X, y: 45, width: 260, height: 44 };
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
export const MULTIPLIER_WINDOW: Box = { x: 409, y: 552, width: 130, height: 58 }; // окошко множителя серии
export const PAYOUT_WINDOW: Box = { x: 654, y: 552, width: 290, height: 70 }; // окошко выплаты — электронное табло с коном
export const LEVER_MOUNT: Box = { x: 889, y: 338, width: 48, height: 76 }; // крепление рычага; из его середины растёт рычаг
// Пятно света тьмы обучения (reveal.ts). Рычаг стоит в стороне от света автомата: штанга растёт из крепления вверх
// на 142, на её конце шарик. Пятно с мягким краем накрывает рычаг целиком — в темноте его видно и можно дёрнуть.
export const LEVER_GLOW: Box = { x: LEVER_MOUNT.x, y: 270, width: 170, height: 290 };
// Переключатель режима прокрутки — на стене справа от рычага, вровень с его креплением:
// правее шарика (он уходит вниз до y≈395), ниже отсвета экрана на стене (корпус кончается на 297, отсвет — на 327:
// верх рамки 333 его не задевает), выше видеомагнитофона (начинается на 526). Три плашки столбиком.
export const MODE_SWITCH: Box = { x: 969, y: 390, width: 108, height: 114 };
// Табло: слева фишки, справа билеты. Сюда летят забранные фишки и полученные билеты.
// Камера стоит на месте, корпус виден всегда — а в магазине его закрывает панель: там своё табло (SHOP_HUD).
// Числа фишек и билетов — одним шрифтом (BOARD_FONT_SIZE в panel.ts), значки на глаз одного размера:
// билет шире фишки, поэтому чуть ниже.
export const BOARD_CHIP_HEIGHT = 28; // высота фишки на табло
export const BOARD_TICKET_HEIGHT = 24; // высота билета на табло
export const BOARD_CHIP_X = DISPLAY.x - 107; // значок фишки
export const BOARD_CHIPS_TEXT_X = DISPLAY.x - 87; // сколько фишек — слева направо от этой точки
export const BOARD_CHIPS_MAX_WIDTH = 109; // шире число фишек не бывает: дальше шрифт уменьшается
export const BOARD_TICKET_X = DISPLAY.x + 57; // значок билета
export const BOARD_TICKETS_TEXT_X = DISPLAY.x + 84; // сколько билетов — слева направо от этой точки
export const BOARD_TICKETS_MAX_WIDTH = 37; // два знака; длиннее — шрифт уменьшается
// Гнёзда для амулетов на верхушке корпуса: по три слева и справа от табло, открываются по очереди — от табло к краям.
export const SOCKET_Y = DISPLAY.y;
export const SOCKET_RADIUS = 21;
const SOCKET_OFFSETS = [-158, 158, -204, 204, -250, 250]; // от середины автомата: сначала ближние к табло, потом к краям
export const SOCKET_XS = SOCKET_OFFSETS.map((offset) => CENTER_X + offset);
export const SPIN_LAMPS_Y = 492; // лампочки прокруток под экраном
// Значок автомата с характером — на корпусе слева от экрана, между бронзовой окантовкой и рамкой экрана.
export const MACHINE_BADGE = { x: 305, y: GRID_Y }; // напротив включённых предметов справа (EFFECTS_X)
export const MACHINE_BADGE_SIZE = 34; // сторона картинки значка
// Экранчик доли черепов — в той же узкой полосе слева от окна сетки (между окантовкой корпуса и рамкой экрана),
// выше значка автомата: значок остаётся на месте и его видно. Тёмное стекло и бронзовая рамка — как у окна выплаты;
// процент рисует MachinePanel (panel.ts), подсказка — по всей этой плашке.
export const SKULL_SCREEN: Box = { x: 305, y: 222, width: 50, height: 58 };

// Комната.
export const NOTE: Box = { x: 165, y: 118, width: 150, height: 120 }; // записка с долгом на стене, левее бока автомата
export const NOTE_ANGLE = -6; // записка висит чуть криво, градусы
// Дыра от взрыва: она посреди экрана автомата — трещины и дым после KABOOM.
export const SHOT_HOLE = { x: 701, y: 282 };

// Экран на стене справа от автомата: маленький квадратный, как телевизор. Виден сразу, поворачиваться некуда;
// клик — большой экран со вкладками (WallScreen).
export const WALL_TV: Box = { x: 1024, y: 225, width: 170, height: 144 };
// Записка с целью забега — на стене над экраном: та же бумажка, что и с долгом, но висит в другую сторону.
export const GOAL_NOTE: Box = { x: WALL_TV.x, y: 85, width: 150, height: 120 };
export const GOAL_NOTE_ANGLE = 5; // другой наклон: записки не выглядят копией друг друга
// Большой экран: во весь вид, поверх игры (вещи приклеены к окну, координаты — в единицах вида). Вкладки сверху, содержимое под ними.
export const WALL_PANEL: Box = { x: VIEW_CENTER_X, y: 322, width: 1060, height: 620 };
// Видеомагнитофон — на деревянном ящике справа от автомата, под экраном на стене: камера стоит на месте, его видно всегда.
// На него ложится купленная кассета.
export const VCR: Box = { x: 949, y: 543, width: 150, height: 34 };
export const VCR_CRATE: Box = { x: 949, y: 600, width: 136, height: 80 }; // ящик под видеомагнитофоном, стоит на полу

// Предметы (полка, магазин, у экрана) и амулеты (гнёзда, витрина) — квадратные картинки такой стороны, px.
export const ITEM_SIZE = 56;
export const AMULET_SIZE = 36;
// Полки с предметами на стене под запиской: в каждой SHELF_COLUMN клеток столбиком, сверху вниз.
// Первая полка — под запиской (места 1–4), вторая — левее (места 5–8). Вторая полка должна влезать в вид: её левая клетка от 52 до 118.
export const SHELF_X = 159; // середина клеток первой полки
export const SHELF_TOP_Y = 248; // середина верхней клетки
export const SHELF_STEP = 76; // от клетки до клетки
export const SHELF_CELL = 66; // сторона клетки
export const SHELF_COLUMN = 4; // клеток в одной полке
export const SHELF_COLUMN_STEP = 74; // вторая полка левее первой на столько
// Включённые предметы (щит, чеснок, ×3) — столбиком справа от экрана, у каждого своё место.
export const EFFECTS_X = 833;
export const EFFECTS_TOP_Y = 206;
export const EFFECTS_STEP = 54;

// Магазин — панель поверх комнаты, как жалюзи: съезжает сверху на всю высоту вида и закрывает автомат. На ней — торговый автомат,
// витрина амулетов, барабан, кассета и своё табло (SHOP_HUD).
export const SHOP_PANEL: Box = { x: 694, y: 320, width: 888, height: 640 }; // 250…1138 по x, 0…640 по y
export const SHOP_CLOSED_Y = -660; // где панель стоит, когда её не видно: целиком над видом
// Кромка панели: за правую уходят покупки, родившиеся на панели (кассета уезжает вправо, к видеомагнитофону).
export const SHOP_PANEL_RIGHT = SHOP_PANEL.x + SHOP_PANEL.width / 2; // 1138
// Табло панели: сколько фишек и билетов — в её шапке. Корпус с табло при открытой панели закрыт, и число фишек иначе не увидеть.
// Стоит левее чемодана (он от 479) и выше торгового автомата (он от 485 по x), у самой кромки.
export const SHOP_HUD = { chipX: 294, chipsX: 310, ticketX: 402, ticketsX: 424, y: 45 };
export const SHOP_HUD_CHIP_HEIGHT = 24; // фишка в шапке — как на табло корпуса
export const SHOP_HUD_TICKET_HEIGHT = 20; // билет на глаз того же размера, поэтому чуть ниже
export const SHOP_HUD_CHIPS_MAX_WIDTH = 70; // шире число фишек не бывает: дальше шрифт уменьшается
export const SHOP_HUD_TICKETS_MAX_WIDTH = 40; // два знака; длиннее — шрифт уменьшается
// Чемодан с амулетами на стене: три амулета в ряд, по центру торгового автомата. Над ним поднимается крышка.
export const AMULET_CASE_PLACES = AMULET_OFFER_SIZE;
export const AMULET_CASE: Box = { x: 625, y: 116, width: 268, height: 128 }; // низ чемодана, где лежат вещи
export const AMULET_CASE_STEP = 76; // от места до места
export const AMULET_CASE_ICON_Y = 82; // амулеты и билет: вместе с ценниками — посередине бархата
export const AMULET_CASE_PRICE_Y = 136; // ценники под ними
// Торговый автомат под витриной: предметы рядами, справа от предмета — ценник.
export const VENDING: Box = { x: 625, y: 404, width: 280, height: 412 };
// Витрина и панель со щелью стоят внутри окантовки лицевой части (она от 485 до 765, бок — левее), с равными полями.
export const VENDING_GLASS: Box = { x: 609, y: 384, width: 178, height: 280 }; // витрина: 3 ряда
export const VENDING_GOOD_X = 557; // предмет в ряду: спираль под ним — на таком же поле от края витрины, как ценник
export const VENDING_PRICE_X = 607; // ценник: фишка, правее — «× цена»
export const VENDING_COIN_SLOT = { x: 731, y: 282 }; // щель для фишек на панели справа от витрины
export const VENDING_BIN: Box = { x: 632, y: 566, width: 220, height: 36 }; // лоток внизу, посередине лицевой части: сюда падает покупка
// Маленький автомат слева от торгового: место на полке за фишки и гнездо амулета за билеты.
// Лотка у него нет: место открывается на полке, гнездо — на корпусе, за панелью магазина.
export const MINI_SHOP: Box = { x: 356, y: 372, width: 184, height: 300 }; // 264…448 по x, 222…522 по y
// Витрина — посередине лицевой части (290…422), два ряда; справа от неё узкая панель с щелью для оплаты.
export const MINI_SHOP_GLASS: Box = { x: 356, y: 350, width: 132, height: 168 };
// Ряды витрины: верхний — место на полке, нижний — гнездо. Предмет слева, ценник справа.
export const MINI_SHOP_ROW_Y = [308, 392];
export const MINI_SHOP_GOOD_X = 316; // товар в ряду: по центру своей половины витрины, до ценника — то же поле, что и от края
export const MINI_SHOP_PRICE_X = 355; // ценник: значок фишки/билета, правее — «× цена»
export const MINI_SHOP_COIN_SLOT = { x: 438, y: 300 }; // щель для оплаты на правой панели корпуса, у самой окантовки
// «Барабан» — колесо на стене справа от торгового автомата: под ним ценник.
export const DRUM_WHEEL = { x: 853, y: 290 }; // середина колеса
export const DRUM_RADIUS = 56;
export const SAVE_TAPE = { x: 800, y: 462 }; // кассета — один откат за забег: на панели справа от торгового автомата
// Два выхода из магазина: ручка-язычок жалюзи внизу панели и кнопка «выход» в шапке, правее чемодана с амулетами
// (чемодан кончается на x = 759, автомат начинается с y = 198, барабан — ниже 234: места хватает с запасом).
// Координаты мировые: ручка 628…760 × 611…637, кнопка 840…1040 × 18…62.
export const SHOP_HANDLE: Box = { x: 694, y: 624, width: 132, height: 26 }; // середина ручки
export const SHOP_LEAVE: Box = { x: 940, y: 40, width: 200, height: 44 }; // середина кнопки выхода

/** Клетка полки номер slot (0 — верхняя клетка первой полки, SHELF_COLUMN — верхняя клетка второй): середина по горизонтали. */
export function shelfX(slot: number): number {
  return SHELF_X - Math.floor(slot / SHELF_COLUMN) * SHELF_COLUMN_STEP;
}

/** Клетка полки номер slot: середина по вертикали. */
export function shelfY(slot: number): number {
  return SHELF_TOP_Y + (slot % SHELF_COLUMN) * SHELF_STEP;
}

/** Ряд витрины номер row (0 — верхний): все ряды — предметы. */
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

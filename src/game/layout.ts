import { AMULET_OFFER_SIZE, MINI_CASE_PLACES } from './amulets';
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
// Новость «ФАЗА 2» на стекле: надпись стоит по центру стекла.
export const PHASE_TITLE_Y = GLASS.y;
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
export const SOCKET_RADIUS = 21; // диаметр 42: значок амулета 36 встаёт в гнездо с полем 3
// От середины автомата, симметрично: сначала ближние к табло (±158 → центры 411 / 727), потом дальше (±204, ±250).
const SOCKET_OFFSETS = [-158, 158, -204, 204, -250, 250];
export const SOCKET_XS = SOCKET_OFFSETS.map((offset) => CENTER_X + offset);
export const SPIN_LAMPS_Y = 492; // лампочки прокруток под экраном
// Значок автомата с характером — на корпусе слева от экрана, между бронзовой окантовкой и рамкой экрана.
export const MACHINE_BADGE = { x: 305, y: GRID_Y }; // напротив включённых предметов справа (EFFECTS_X)
export const MACHINE_BADGE_SIZE = 34; // сторона картинки значка
// Экранчик доли черепов — справа от окна сетки, над столбиком включённых предметов: в той же узкой полосе между
// рамкой экрана (807) и бронзовой окантовкой корпуса (861), одной колонкой с гнёздами (EFFECTS_X). Окно тех же
// пропорций, что и было; ниже него до первого гнезда — EFFECT_SLOT_GAP, весь блок (черепа + гнёзда) по центру экрана.
// Тёмное стекло и бронзовая рамка — как у окна выплаты; процент рисует MachinePanel (panel.ts), подсказка — по всей этой плашке.
export const SKULL_SCREEN: Box = { x: 834, y: 205, width: 40, height: 42 }; // x — середина столбика гнёзд, как EFFECTS_X

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
// Действия вне прокрутки (шаг 29): кнопка на корпусе автомата, в левой полосе под значком автомата.
// Раньше это была настенная табличка рядом с рычагом — DONTLIKE п.5: она не входила в дизайн и торчала
// у края вида. Теперь это маленькая штампованная кнопка на самом автомате, как кнопка сервиса.
// Клик по ней или клавиша A открывают панель; сама она видна всегда.
export const ACTION_BOARD: Box = { x: 305, y: 314, width: 38, height: 288 }; // 286…324 × 170…458: ближе к рамке экрана, но не на ней

// Предметы (полка, магазин, у экрана) и амулеты (гнёзда, витрина) — квадратные картинки такой стороны, px.
export const ITEM_SIZE = 56;
// Значок амулета внутри гнезда 42 — с полем 3: значки амулетов чуть меньше гнёзд.
export const AMULET_SIZE = 36;
// Полки с предметами на стене под запиской: в каждой SHELF_COLUMN клеток столбиком, сверху вниз.
// Первая полка — под запиской (места 1–4), вторая — левее (места 5–8). Вторая полка должна влезать в вид: её левая клетка от 46 до 112.
export const SHELF_X = 159; // середина клеток первой полки
export const SHELF_TOP_Y = 248; // середина верхней клетки
export const SHELF_STEP = 76; // от клетки до клетки: клетка 66 + зазор 10
export const SHELF_CELL = 66; // сторона клетки
export const SHELF_COLUMN = 4; // клеток в одной полке
// Полки читаются как две, только если между столбцами видно стену: было 74 — 4 до клетки 70 (тень), столбцы
// сливались в одну сетку и при 4 предметах «всё съезжало» (DONTLIKE п.13). 80 — те же 10, что между клетками.
export const SHELF_COLUMN_STEP = 80; // вторая полка левее первой на столько
// Стальная рамка клетки: ниша внутри неё. Предмет и пульс считаются от ниши, а не от клетки: иначе 4 предмета,
// которым есть куда нажать, растут на рамку и на стену. Ниша = 66 − 2×6 = 54.
export const SHELF_FRAME = 6;
export const SHELF_NICHE = SHELF_CELL - 2 * SHELF_FRAME;
// Включённые предметы (щит, чеснок, ×3) — столбиком справа от экрана, у каждого своё место.
// Столбик стоит по центру между рамкой экрана (807) и бронзовой окантовкой корпуса (861).
export const EFFECTS_X = 834;
export const EFFECTS_STEP = 54;
export const EFFECT_SLOT = 46; // сторона пустого гнезда: видно все четыре места, даже когда они свободны
// Гнёзда стоят под экранчиком черепов: первое — ниже окна на EFFECT_SLOT_GAP, весь блок по центру экрана.
export const EFFECT_SLOT_GAP = 10;
// Окно 205, низ 226, плюс зазор 10 и половина гнезда 23: центры мест 259 / 313 / 367 / 421, блок 184…444, середина 314 = GRID_Y.
export const EFFECTS_TOP_Y = SKULL_SCREEN.y + SKULL_SCREEN.height / 2 + EFFECT_SLOT_GAP + EFFECT_SLOT / 2;

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
// Мини-чемодан за фишки (DONTLIKE п.7): второй, меньше и ровно на два амулета (MINI_CASE_PLACES) — слева от основного.
// Низ на той же линии (180), левый край — в 15 от кромки панели (250): за стену и на полку не заходит.
export const MINI_CASE: Box = { x: 360, y: 156, width: 190, height: 96 }; // 265…455 × 108…204: ниже табло фишек и билетов (DONTLIKE п.11)
export const MINI_CASE_STEP = 70; // от места до места: амулеты тут мельче, а ценники шире — без наложения
export const MINI_CASE_ICON_Y = 136; // амулеты посередине бархата
export const MINI_CASE_PRICE_Y = 176; // таблички цен под ними
// Торговый автомат под витриной: предметы рядами, справа от предмета — ценник.
export const VENDING: Box = { x: 625, y: 404, width: 280, height: 412 };
// Витрина и панель со щелью стоят внутри окантовки лицевой части (она от 485 до 765, бок — левее), с равными полями.
export const VENDING_GLASS: Box = { x: 609, y: 384, width: 178, height: 300 }; // витрина: 4 ряда (три предмета и билеты); 300 — чтобы и 5 рядов с улучшением дышали
export const VENDING_GOOD_X = 557; // предмет в ряду: спираль под ним — на таком же поле от края витрины, как ценник
export const VENDING_PRICE_X = 607; // ценник: фишка, правее — «× цена»
export const VENDING_COIN_SLOT = { x: 731, y: 282 }; // щель для фишек на панели справа от витрины
export const VENDING_BIN: Box = { x: 632, y: 566, width: 220, height: 36 }; // лоток внизу, посередине лицевой части: сюда падает покупка
// Маленький автомат слева от торгового: тот же автомат, только меньше, — место на полке за фишки и гнездо за билеты.
// Стоит на одном полу с торговым: его низ — на линии низа торгового автомата (404 + 412 / 2 = 610).
// Корпус впритык между кромкой панели (она кончается на 256) и торговым автоматом (он с 485):
// левее расти некуда — 6 до кромки, правее — 27 до торгового.
// DONTLIKE п.8: автомат на 10% меньше по ширине и высоте; низ и левый край остаются на месте (262…438 × 286…610).
export const MINI_SHOP_SCALE = 0.9;
const MINI_SHOP_LEFT = 262; // левый край прежнего автомата — он не съезжает
/** Точка прежней раскладки мини-автомата в уменьшенном: x — от левого края. */
const miniX = (x: number): number => MINI_SHOP_LEFT + (x - MINI_SHOP_LEFT) * MINI_SHOP_SCALE;
// Корпус подогнан под витрину и лоток: сверху 20 px поля, а не прежние 50 (DONTLIKE п.6: автомат выглядел
// вытянутым, с пустой верхней третью). Низ и левый край стоят на месте.
export const MINI_SHOP: Box = { x: miniX(360), y: (316 + 610) / 2, width: 196 * MINI_SHOP_SCALE, height: 610 - 316 };
// Витрина: хромированная рамка и тёмное нутро с двумя полками. Дверцы нет (DONTLIKE п.8): товар и цены видны сразу.
// Верхний ряд — место на полке, нижний — гнездо амулета; товар стоит на полке, ценник — тёмной табличкой справа.
// Витрина под два ряда: 335…505, полки 405 и 490 — ряды стоят ровно, без пустой верхней половины (DONTLIKE п.6).
export const MINI_SHOP_GLASS: Box = {
  x: MINI_SHOP.x, // витрина по центру корпуса (была сдвинута вправо на 7 единиц — след от дверцы с петлёй)
  y: 435,
  width: 148 * MINI_SHOP_SCALE,
  height: 200,
};
export const MINI_SHOP_FRAME = 6; // хромированная рамка витрины, px
export const MINI_SHOP_ROW_Y = [386, 482]; // товар и ценник ряда
export const MINI_SHOP_SHELF_Y = [405, 515]; // полка ряда: на её линии стоит товар
export const MINI_SHOP_GOOD_X = MINI_SHOP_GLASS.x - (367 - 336) * MINI_SHOP_SCALE; // товар в ряду: слева, до таблички ценника — 2
export const MINI_SHOP_PRICE_X = MINI_SHOP_GLASS.x + (378 - 367) * MINI_SHOP_SCALE - 10; // левее: табличка ценника целиком внутри стекла // ценник: значок фишки/билета, правее — «× цена»
export const MINI_SHOP_SOCKET_RADIUS = 26 * MINI_SHOP_SCALE; // гнездо в витрине: диаметр 47 — с товар в соседнем ряду
// Плашка выдачи внизу (DONTLIKE п.8): тёмный проём в хромированной окантовке, как лоток торгового автомата.
// Покупка уходит в него и лежит, пока её не заберут кликом.
export const MINI_SHOP_BIN: Box = { x: MINI_SHOP.x, y: 590, width: 120, height: 30 };
// «Барабан» — колесо на стене справа от торгового автомата: под ним ценник.
export const DRUM_WHEEL = { x: 853, y: 290 }; // середина колеса
export const DRUM_RADIUS = 56;
export const SAVE_TAPE = { x: 800, y: 462 }; // кассета — один откат за забег: на панели справа от торгового автомата
// Единственный выход из магазина — кнопка «К СЛОТ-МАШИНЕ» в шапке, правее чемодана с амулетами
// (чемодан кончается на x = 759, панель — на 1138: места хватает с запасом).
// Координаты мировые: кнопка 770…1070 × 18…62.
export const SHOP_LEAVE: Box = { x: 920, y: 40, width: 300, height: 44 }; // середина кнопки выхода

/** Клетка полки номер slot (0 — верхняя клетка первой полки, SHELF_COLUMN — верхняя клетка второй): середина по горизонтали. */
export function shelfX(slot: number): number {
  return SHELF_X - Math.floor(slot / SHELF_COLUMN) * SHELF_COLUMN_STEP;
}

/** Клетка полки номер slot: середина по вертикали. */
export function shelfY(slot: number): number {
  return SHELF_TOP_Y + (slot % SHELF_COLUMN) * SHELF_STEP;
}

/** Ряд витрины номер row (0 — верхний): три ряда предметов и последний — билеты за фишки. */
export function vendingRowY(row: number, rows: number): number {
  const step = VENDING_GLASS.height / rows;
  return VENDING_GLASS.y - VENDING_GLASS.height / 2 + step * (row + 0.5);
}

/** Полка ряда витрины row (0 — верхний): низ ряда минус 8 — тот же расчёт, что в drawVendingMachine (decor.ts). */
export function vendingShelfY(row: number, rows: number): number {
  const glassTop = VENDING_GLASS.y - VENDING_GLASS.height / 2;
  return glassTop + (VENDING_GLASS.height / rows) * (row + 1) - 8;
}

/** Место в витрине амулетов номер place (0 — левое). */
export function amuletCaseX(place: number, places: number): number {
  return AMULET_CASE.x + (place - (places - 1) / 2) * AMULET_CASE_STEP;
}

/** Место в мини-чемодане номер place (0 — левое): тот же расчёт, только шаг и центр свои. */
export function miniCaseX(place: number, places = MINI_CASE_PLACES): number {
  return MINI_CASE.x + (place - (places - 1) / 2) * MINI_CASE_STEP;
}

/** Центр клетки по горизонтали: столбцы стоят по центру экрана. */
export function cellX(col: number): number {
  return CENTER_X + (col - (GRID_COLUMNS - 1) / 2) * CELL_STEP;
}

/** Центр клетки по вертикали: ряды стоят вокруг GRID_Y. */
export function cellY(row: number): number {
  return GRID_Y + (row - (GRID_ROWS - 1) / 2) * CELL_STEP;
}

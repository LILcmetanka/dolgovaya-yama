/**
 * Проверка банкомата (DONTLIKE 5.1–5.3) и вкладки «Кто есть кто» на живых снимках в headless Chrome.
 * Запуск: node .claude/skills/next-step/atm-who-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимки и профиль Chrome — в scratchpad.
 *
 * Что проверяет банкомат: выехал и показывает долг — число по центру экрана (по мировым координатам, от рамки экрана
 * в корпусе), на экране нет ни одного объекта с текстурой фишки (CHIP_TEXTURE из decor.ts), число внутри экрана,
 * монетоприёмник ниже экрана; не хватает фишек — GOOD LUCK тоже по центру экрана; шестизначный долг ужимается по ширине.
 * Размеры экрана, приёмника и предел ширины числа берутся из src/game/parts/atm.ts: смена чисел в коде роняет проверку.
 * Деталей нужного размера в корпусе должно быть ровно по одной (рамка экрана, накладка приёмника, его щель), а
 * slotPosition() — указывать в середину щели: иначе «нашлось по размеру» — тавтология, а не проверка.
 * «Кто есть кто»: когда встречены Коллектор, Дилер и все автоматы, в панели пять рядов, нет плиток «???»,
 * описания не налезают на названия следующего ряда, не влезают в соседнюю колонку и не выходят за ряд.
 * Ряды узнаются по текстам из `machines.ts` и `lang.ts`, а места — по константам `wallScreen.ts` (CARD_WIDTH,
 * ROW_HEIGHT, ROW_NAME_TOP, ROW_DESC_TOP, ROW_TEXT_WIDTH), а не по fontSize 21/16 и не по «магическому −76».
 * Переименование ключа или константы роняет сценарий с внятным текстом (шаг 35).
 * Всё повторяется на втором языке (L): русский длиннее английского, там описания переносятся на вторую строку.
 * Порт 8770 — свой, dev-сервер на 5173 и порты 8766/8767 из других сценариев не трогаем.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node atm-who-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}

/**
 * Константы — из исходников, а не из головы: сценарий запускается обычным node (без ts-resolve), поэтому читаем текст
 * модулей и достаём числа регэкспом. Не разобрали — падаем до запуска Chrome, а не проверяем по устаревшим числам.
 */
const SRC = (rel) => readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');
const ATM_SRC = SRC('src/game/parts/atm.ts');
const atmNumber = (name) => {
  const match = ATM_SRC.match(new RegExp('^const ' + name + ' = (-?\\d+(?:\\.\\d+)?);', 'm'));
  if (!match) throw new Error('в src/game/parts/atm.ts не нашёл const ' + name);
  return Number(match[1]);
};
const SCREEN_Y = atmNumber('SCREEN_Y'); // экран на корпусе: по центру него — число долга и GOOD LUCK
const SCREEN_WIDTH = atmNumber('SCREEN_WIDTH');
const SCREEN_HEIGHT = atmNumber('SCREEN_HEIGHT');
const DEMAND_MAX_WIDTH = atmNumber('DEMAND_MAX_WIDTH'); // шире число не бывает: дальше шрифт уменьшается
const COIN_SLOT_DY = atmNumber('COIN_SLOT_DY'); // середина накладки монетоприёмника относительно середины корпуса
/** Размер пары width×height из atm.ts: COIN_BODY и COIN_SLIT записаны одной строкой const. */
const atmBox = (name) => {
  const match = ATM_SRC.match(new RegExp('^const ' + name + ' = \\{ width: (\\d+), height: (\\d+) \\};', 'm'));
  if (!match) throw new Error('в src/game/parts/atm.ts не разобрал ' + name);
  return { width: Number(match[1]), height: Number(match[2]) };
};
const COIN_BODY = atmBox('COIN_BODY');
const COIN_SLIT = atmBox('COIN_SLIT'); // внутренняя щель: slotPosition() обязан указывать в неё, а не рядом
const COIN_TOP = COIN_SLOT_DY - COIN_BODY.height / 2; // верх накладки приёмника относительно середины корпуса
const chipMatch = SRC('src/game/decor.ts').match(/^export const CHIP_TEXTURE = '([^']+)';/m);
if (!chipMatch) throw new Error('в src/game/decor.ts не нашёл export const CHIP_TEXTURE');
const CHIP_TEXTURE = chipMatch[1]; // 'chip' в игре знает только decor.ts — здесь то же имя оттуда же

/**
 * «Кто есть кто» — из исходников, а не по кеглю и «магическому −76». Названия и описания берём оттуда же, откуда
 * их берёт игра: паспорта автоматов — `machines.ts` (MACHINES и поля name/description), Коллектора и Дилера —
 * `lang.ts` (whoCollector/whoDealer с their What). Геометрия ряда — `wallScreen.ts`: CARD_WIDTH, ROW_HEIGHT,
 * ROW_NAME_TOP, ROW_DESC_TOP, ROW_TEXT_WIDTH. Строку узнаём по её тексту, а не по fontSize: смена кегля проверку
 * не роняет, а переименование ключа или константы — роняет (разобрать исходник больше нечем, и это видно сразу).
 */
const WALL_SRC = SRC('src/game/parts/wallScreen.ts');
const WALL_NUMBER = (name) => {
  const match = WALL_SRC.match(new RegExp('^const ' + name + ' = (-?\\d+(?:\\.\\d+)?);', 'm'));
  if (!match) throw new Error('в src/game/parts/wallScreen.ts не нашёл const ' + name);
  return Number(match[1]);
};
const ROW_WIDTH = WALL_NUMBER('ROW_WIDTH');
const ROW_HEIGHT = WALL_NUMBER('ROW_HEIGHT');
const ROW_GAP = WALL_NUMBER('ROW_GAP');
const CARD_PAD = WALL_NUMBER('CARD_PAD');
const ROW_ICON = WALL_NUMBER('ROW_ICON');
const ROW_ICON_GAP = WALL_NUMBER('ROW_ICON_GAP');
const ROW_TEXT_WIDTH = WALL_NUMBER('ROW_TEXT_WIDTH');
const ROW_NAME_TOP = WALL_NUMBER('ROW_NAME_TOP');
const ROW_DESC_TOP = WALL_NUMBER('ROW_DESC_TOP');
/** const CARD_WIDTH в wallScreen.ts — выражение ROW_WIDTH - ROW_GAP: считаем по той же формуле, а не своим числом. */
const CARD_WIDTH = (() => {
  const match = WALL_SRC.match(/^const CARD_WIDTH = (.+);$/m);
  if (!match) throw new Error('в src/game/parts/wallScreen.ts не нашёл const CARD_WIDTH');
  const formula = match[1].trim();
  if (/^-?\d+(?:\.\d+)?$/.test(formula)) return Number(formula);
  if (formula === 'ROW_WIDTH - ROW_GAP') return ROW_WIDTH - ROW_GAP;
  throw new Error('CARD_WIDTH в wallScreen.ts записан как «' + formula + '» — проверка знает число или ROW_WIDTH - ROW_GAP');
})();
const CARD_TEXT_X = CARD_PAD + ROW_ICON + ROW_ICON_GAP; // от левого края карточки до названия и описания
const CARD_TEXT_RIGHT = CARD_TEXT_X + ROW_TEXT_WIDTH; // шире текст не бывает: дальше рамка карточки
const PAGE_TEXT = /^‹ \d+\/\d+ ›$/; // счётчик страниц — не строка списка

/** Строковый литерал в тексте модуля (кавычки любого вида, включая шаблонные) — и где он кончился. */
const readLiteral = (text, from, where) => {
  const quote = text[from];
  if (quote !== "'" && quote !== '"' && quote !== '`') throw new Error(where + ': ожидал строку, а там «' + text.slice(from, from + 16) + '»');
  const end = text.indexOf(quote, from + 1);
  if (end < 0) throw new Error(where + ': строка не закрыта');
  return { value: text.slice(from + 1, end), end: end + 1 };
};
/** Пара { ru: ..., en: ... } поля field в куске текста — дословно из исходника. */
const readWords = (text, field, where) => {
  const at = text.search(new RegExp('(?:^|\\s)' + field + ': \\{', 'm'));
  if (at < 0) throw new Error(where + ': не нашёл поле ' + field);
  const body = text.slice(at);
  const ruAt = body.indexOf('ru: ');
  if (ruAt < 0) throw new Error(where + ': у поля ' + field + ' нет ru');
  const ru = readLiteral(body, ruAt + 4, where + ' (' + field + '.ru)');
  const enAt = body.indexOf('en: ', ru.end);
  if (enAt < 0) throw new Error(where + ': у поля ' + field + ' нет en');
  const en = readLiteral(body, enAt + 4, where + ' (' + field + '.en)');
  return { ru: ru.value, en: en.value };
};
/**
 * Автоматы: порядок — как в MACHINES, паспорт — из блоков CLASSIC/GREEDY/QUIET. Вставку ${times(CONST).ru}
 * раскрываем той же формулой, что characters.times: «×1,5» по-русски, «×1.5» по-английски.
 */
const MACHINES_SRC = SRC('src/game/machines.ts');
const machineNumber = (name) => {
  const match = MACHINES_SRC.match(new RegExp('^(?:export )?const ' + name + ' = (-?\\d+(?:\\.\\d+)?);', 'm'));
  if (!match) throw new Error('в src/game/machines.ts не нашёл const ' + name);
  return Number(match[1]);
};
const timesText = (factor, language) => '×' + (language === 'ru' ? String(factor).replace('.', ',') : String(factor));
const withTimes = (value, language, where) => value.replace(/\$\{times\(([A-Z0-9_]+)\)\.(ru|en)\}/g, (_all, name) => timesText(machineNumber(name), language));
const orderMatch = MACHINES_SRC.match(/^export const MACHINES: MachineSpec\[\] = \[([^\]]+)\];/m);
if (!orderMatch) throw new Error('в src/game/machines.ts не разобрал export const MACHINES');
const MACHINE_ORDER = orderMatch[1].split(',').map((id) => id.trim()).filter(Boolean);
/** Текст каждого автомата на обоих языках: [{ name, description }] в порядке MACHINES. */
const MACHINE_TEXT = { ru: [], en: [] };
for (const constName of MACHINE_ORDER) {
  const block = MACHINES_SRC.match(new RegExp('const ' + constName + ': MachineSpec = \\{([\\s\\S]*?)\\n\\};'));
  if (!block) throw new Error('в src/game/machines.ts не разобрал автомат ' + constName + ' (в MACHINES он есть)');
  const namePair = readWords(block[1], 'name', constName);
  const descriptionPair = readWords(block[1], 'description', constName);
  for (const language of ['ru', 'en']) {
    MACHINE_TEXT[language].push({
      name: withTimes(namePair[language], language, constName + '.name'),
      description: withTimes(descriptionPair[language], language, constName + '.description'),
    });
  }
}
/** Ключ lang.ts целиком: whoCollectorWhat/whoDealerWhat многострочные, поэтому ищем запись и в ней первое ru/en. */
const LANG_SRC = SRC('src/game/lang.ts');
const langWords = (key) => {
  const at = LANG_SRC.search(new RegExp('\\n  ' + key + ': \\{'));
  if (at < 0) throw new Error('в src/game/lang.ts нет ключа ' + key);
  return readWords(LANG_SRC.slice(at), key, 'src/game/lang.ts');
};
const WHO_COLLECTOR_WORDS = langWords('whoCollector');
const WHO_COLLECTOR_WHAT = langWords('whoCollectorWhat');
const WHO_DEALER_WORDS = langWords('whoDealer');
const WHO_DEALER_WHAT = langWords('whoDealerWhat');
/**
 * Ожидаемые ряды вкладки — в том же порядке, что buildWho: классический, Коллектор, Дилер, остальные автоматы.
 * По 5 рядов: смена набора в исходнике меняет ожидание, а не оставляет проверку сверять старую копию.
 */
const WHO_ROWS = {};
for (const language of ['ru', 'en']) {
  const [first, ...others] = MACHINE_TEXT[language];
  WHO_ROWS[language] = [
    first,
    { name: WHO_COLLECTOR_WORDS[language], description: WHO_COLLECTOR_WHAT[language] },
    { name: WHO_DEALER_WORDS[language], description: WHO_DEALER_WHAT[language] },
    ...others,
  ];
}
const WHO_ROW_COUNT = WHO_ROWS.ru.length;


const srv = spawn('python3', ['-m', 'http.server', '8770', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9337', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-atm', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9337/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9337 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Runtime.evaluate: значение выражения или undefined, если страница бросила исключение. */
  const val = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error || r.result.exceptionDetails) return undefined;
    return r.result.result.value;
  };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SP + '/' + name, Buffer.from(r.result.data, 'base64')); };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8770/' });
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(900);

  /**
   * Банкомат с долгом debt и балансом balance: что на экране — в мировых координатах.
   * Экран, накладку приёмника и его щель ищем объектами в корпусе (по размерам из atm.ts) — проверяем настоящую геометрию,
   * а не число в константе. Фишки ищем по текстуре CHIP_TEXTURE во всей сцене, включая содержимое контейнеров.
   */
  const atm = async (debt, balance) => {
    await val('window.__g.collector.atm.hide(); 1');
    await sleep(250);
    await val(`window.__g.balance = ${balance}; window.__g.debt = ${debt}; window.__g.callCollector(false); 1`);
    // Ждём, пока банкомат действительно выехал на своё место: твины + захват canvas в headless бывают медленнее sleep.
    for (let i = 0; i < 30; i++) { if (await val('window.__g.collector.atm.isOut')) break; await sleep(150); }
    await sleep(150);
    const raw = await val(`(() => {
      const g = window.__g, a = g.collector.atm, b = a.box, d = a.demand, body = a.body;
      const CHIP = ${JSON.stringify(CHIP_TEXTURE)};
      const bounds = (o) => { const r = o.getBounds(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      const round = (r) => ({ left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });
      const round2 = (r) => ({ left: +r.left.toFixed(2), top: +r.top.toFixed(2), right: +r.right.toFixed(2), bottom: +r.bottom.toFixed(2) });
      // Детали корпуса ищем по размерам из atm.ts, но каждую отдельно и со счётом: 0 рамок (размер в atm.ts поменяли)
      // и 2 рамки (совпала чужая деталь) — тоже провал, иначе «рамка нашлась» ничего не значит и размер не проверен.
      const sameSize = (w, h) => b.list.filter((o) => o.type === 'Rectangle' && Math.abs(o.width - w) < 0.5 && Math.abs(o.height - h) < 0.5);
      const screenFrames = sameSize(${SCREEN_WIDTH}, ${SCREEN_HEIGHT});
      const coinPlates = sameSize(${COIN_BODY.width}, ${COIN_BODY.height});
      const slits = sameSize(${COIN_SLIT.width}, ${COIN_SLIT.height});
      const screenFrame = screenFrames[0], coinPlate = coinPlates[0], slit = slits[0];
      const screen = screenFrame ? bounds(screenFrame) : null;
      const slot = a.slotPosition(); // куда летят фишки: должно быть ровно внутри щели приёмника
      const bodyRect = bounds(body);
      const bodyCenterX = (bodyRect.left + bodyRect.right) / 2;
      const bodyCenterY = (bodyRect.top + bodyRect.bottom) / 2;
      const scanChips = () => {
        const found = [];
        const walk = (list) => {
          for (const o of list) {
            if (o.list) walk(o.list); // фишка может лежать в контейнере (корпус, табло, окошко выплаты)
            if (o.texture && o.texture.key === CHIP && o.visible !== false) found.push(bounds(o));
          }
        };
        walk(g.children.list);
        return found;
      };
      const overlapsScreen = (r) => !!screen && r.right > screen.left && r.left < screen.right && r.bottom > screen.top && r.top < screen.bottom;
      const chipsOnScreen = scanChips().filter(overlapsScreen).map(round);
      // Положительный контроль: подложенные фишки — у самой сцены и внутри корпуса — детектор обязан найти.
      // Иначе «на экране нет фишек» ничего не значит: мог бы просто не уметь их искать.
      // Нет рамки экрана — контроля нет: −1, и проверка провалится, а не умрёт на null.
      let probedOnScreen = -1;
      if (screen) {
        const probeRoot = g.add.image((screen.left + screen.right) / 2, (screen.top + screen.bottom) / 2, CHIP).setDepth(9999);
        const probeBox = g.add.image(0, ${SCREEN_Y}, CHIP);
        b.add(probeBox);
        probedOnScreen = scanChips().filter(overlapsScreen).length;
        probeRoot.destroy();
        probeBox.destroy();
      }
      return JSON.stringify({
        out: a.isOut, text: d.text, demand: round(bounds(d)),
        screen: screen ? round(screen) : null,
        body: round(bodyRect),
        bodyCenterX: Math.round(bodyCenterX), bodyCenterY: Math.round(bodyCenterY),
        screenFrames: screenFrames.length, coinPlates: coinPlates.length, slits: slits.length,
        // Рамка экрана на корпусе — только положение её центра: размер уже сверен отдельно, тем, что деталь нужного
        // размера в корпусе ровно одна. Размерные конъюнкты здесь были бы тавтологией (рамку искали по тем же числам).
        screenMatchesSource: !!screen && Math.abs((screen.left + screen.right) / 2 - bodyCenterX) <= 1
          && Math.abs((screen.top + screen.bottom) / 2 - (bodyCenterY + ${SCREEN_Y})) <= 1,
        chipsOnScreen, probedOnScreen, chipsInScene: scanChips().length,
        coinPlate: coinPlate ? round(bounds(coinPlate)) : null,
        slit: slit ? round2(bounds(slit)) : null,
        slot: { x: +slot.x.toFixed(2), y: +slot.y.toFixed(2) },
      });
    })()`);
    const parsed = raw === undefined ? undefined : JSON.parse(raw);
    return parsed;
  };

  /**
   * Есть ли в добыче экран и число: без них проверка «по центру» — обычный FAIL с текстом, а не TypeError мимо check()
   * (рамку экрана не нашли — значит, размер в atm.ts разошёлся с корпусом, и об этом скажет отдельная проверка).
   */
  const withScreen = (r) => !!r && !!r.screen && !!r.demand;
  /** Середина сторон прямоугольника — для сообщений; нет прямоугольника — прочерк, а не исключение. */
  const midX = (r) => (r ? Math.round((r.left + r.right) / 2) : '—');
  const midY = (r) => (r ? Math.round((r.top + r.bottom) / 2) : '—');
  const show = (v) => (v ? JSON.stringify(v) : 'нет');
  /** Точка внутри прямоугольника — по мировым границам. */
  const insideBox = (point, box) => !!point && !!box && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
  /** Прямоугольник a целиком внутри b — по мировым границам. */
  const insideRect = (a, b) => !!a && !!b && a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
  /** Число (или GOOD LUCK) стоит по центру экрана: середина текста в мире — середина рамки экрана в мире. */
  const centered = (r) => withScreen(r) && Math.abs((r.demand.left + r.demand.right) / 2 - (r.screen.left + r.screen.right) / 2) <= 1
    && Math.abs((r.demand.top + r.demand.bottom) / 2 - (r.screen.top + r.screen.bottom) / 2) <= 1;
  /** Текст целиком внутри рамки экрана — тоже по мировым границам. */
  const insideScreen = (r) => withScreen(r) && r.demand.left >= r.screen.left && r.demand.right <= r.screen.right && r.demand.top >= r.screen.top && r.demand.bottom <= r.screen.bottom;
  /** Верх накладки приёмника — ниже низа экрана: в мире, по настоящим границам объектов. */
  const plateBelowScreen = (r) => withScreen(r) && !!r.coinPlate && r.coinPlate.top >= r.screen.bottom;

  // 5.1: число долга по центру экрана, значка фишки на экране нет, число внутри экрана.
  const debt = await atm(30, 5000);
  await shot('atm-debt.png');
  check(debt && debt.out, 'банкомат выехал к игроку');
  check(debt && debt.text === '30', 'на экране долг: ' + (debt && debt.text));
  // Размер — не тавтологией: рамку искали по числам из atm.ts, поэтому отдельно считаем, что такая деталь в корпусе одна.
  // Поменяли SCREEN_WIDTH/SCREEN_HEIGHT в atm.ts — здесь 0, и это FAIL, а не «рамка на месте».
  check(debt && debt.screenFrames === 1, 'в корпусе ровно одна рамка экрана ' + SCREEN_WIDTH + '×' + SCREEN_HEIGHT + ' (нашлось: ' + (debt && debt.screenFrames) + ')');
  check(debt && debt.coinPlates === 1, 'в корпусе ровно одна накладка приёмника ' + COIN_BODY.width + '×' + COIN_BODY.height + ' (нашлось: ' + (debt && debt.coinPlates) + ')');
  check(debt && debt.slits === 1, 'в корпусе ровно одна щель приёмника ' + COIN_SLIT.width + '×' + COIN_SLIT.height + ' (нашлось: ' + (debt && debt.slits) + ')');
  check(debt && debt.screenMatchesSource, 'рамка экрана на корпусе там, где написано в atm.ts: центр = середина корпуса + ' + SCREEN_Y + ' (x ' + midX(debt?.screen) + ' = ' + (debt && debt.bodyCenterX) + ', y ' + midY(debt?.screen) + ' = ' + (debt && debt.bodyCenterY) + ' + ' + SCREEN_Y + ')');
  check(debt && debt.chipsOnScreen.length === 0, 'на экране нет ни одного объекта с текстурой фишки «' + CHIP_TEXTURE + '»' + (debt && debt.chipsOnScreen.length ? ': ' + JSON.stringify(debt.chipsOnScreen) : '') + ' (фишек в сцене всего: ' + (debt && debt.chipsInScene) + ')');
  check(debt && debt.probedOnScreen === 2, 'поиск фишек работает: подложенные фишки на экране найдены (' + (debt && debt.probedOnScreen) + ' из 2)');
  check(centered(debt), 'число по центру экрана по мировым координатам (y ' + midY(debt?.demand) + ' = ' + midY(debt?.screen) + ', x ' + midX(debt?.demand) + ' = ' + midX(debt?.screen) + ')');
  check(insideScreen(debt), 'число целиком внутри экрана ' + show(debt?.demand) + ' в рамке ' + show(debt?.screen));
  check(plateBelowScreen(debt), 'накладка монетоприёмника ниже экрана (верх ' + (debt?.coinPlate?.top ?? '—') + ' ≥ низ экрана ' + (debt?.screen?.bottom ?? '—') + ')');
  check(debt?.coinPlate != null && Math.abs(debt.coinPlate.top - (debt.bodyCenterY + COIN_TOP)) <= 1, 'монетоприёмник там, где написано в atm.ts: верх накладки = середина корпуса ' + COIN_TOP);
  // slotPosition() — не мёртвые данные: туда летят фишки, значит это середина щели приёмника и точка внутри неё.
  check(insideBox(debt?.slot, debt?.slit), 'slotPosition() — внутри щели приёмника: ' + show(debt?.slot) + ' в ' + show(debt?.slit));
  check(debt?.slot != null && debt.slit != null && Math.abs(debt.slot.x - (debt.slit.left + debt.slit.right) / 2) <= 1 && Math.abs(debt.slot.y - (debt.slit.top + debt.slit.bottom) / 2) <= 1,
    'slotPosition() — середина щели, а не край: ' + show(debt?.slot) + ' и середина ' + (debt?.slit ? Math.round((debt.slit.left + debt.slit.right) / 2) + '×' + Math.round((debt.slit.top + debt.slit.bottom) / 2) : '—'));
  check(insideRect(debt?.slit, debt?.coinPlate), 'щель приёмника целиком внутри накладки ' + show(debt?.slit) + ' в ' + show(debt?.coinPlate));
  // Границы деталей — по корпусу, а не по самим размерам из atm.ts: это независимая геометрия (BODY_WIDTH/BODY_HEIGHT),
  // поэтому заведомо неверный размер экрана или приёмника здесь виден, даже если его число в atm.ts поменяли на любое.
  check(insideRect(debt?.screen, debt?.body), 'рамка экрана не выходит за корпус: ' + show(debt?.screen) + ' в ' + show(debt?.body));
  check(insideRect(debt?.coinPlate, debt?.body), 'накладка приёмника не выходит за корпус: ' + show(debt?.coinPlate) + ' в ' + show(debt?.body));

  // 5.2: не хватает фишек — GOOD LUCK по центру экрана, значка фишки тоже нет.
  const luck = await atm(30, 0);
  await shot('atm-good-luck.png');
  check(luck && luck.text === 'GOOD LUCK' && luck.chipsOnScreen.length === 0, 'не хватило фишек: GOOD LUCK без фишки на экране' + (luck && luck.chipsOnScreen.length ? ': ' + JSON.stringify(luck.chipsOnScreen) : ''));
  check(centered(luck), 'GOOD LUCK по центру экрана по мировым координатам (y ' + midY(luck?.demand) + ' = ' + midY(luck?.screen) + ')');
  check(insideScreen(luck), 'GOOD LUCK целиком внутри экрана ' + show(luck?.demand));

  // 5.3: шестизначный долг ужимается, за ширину экрана не вылезает.
  const big = await atm(999999, 1000000);
  await shot('atm-six-digits.png');
  check(big?.demand != null && big.text === '999999' && big.demand.right - big.demand.left <= DEMAND_MAX_WIDTH, 'шестизначный долг ужат до ' + (big?.demand ? big.demand.right - big.demand.left : '—') + ' ≤ ' + DEMAND_MAX_WIDTH);
  check(insideScreen(big), 'шестизначный долг целиком внутри экрана ' + show(big?.demand));
  check(centered(big), 'шестизначный долг тоже по центру экрана (x ' + midX(big?.demand) + ' = ' + midX(big?.screen) + ')');

  // «Кто есть кто»: встретить Коллектора, Дилера и оба других автомата — только методами сцены.
  await val('window.__g.openShop(); 1');
  await sleep(2200);
  await val('window.__g.startDealerGame(() => {}); 1');
  await sleep(900);
  await val('window.__g.stopDealing(); 1');
  await sleep(900);
  await val('window.__g.machineId = "greedy"; window.__g.showNewMachine(); window.__g.machineId = "quiet"; window.__g.showNewMachine(); 1');
  await sleep(500);
  await val('window.__g.monitor.open(); window.__g.monitor.showTab("who"); 1');
  await sleep(900);
  await shot('who-all.png');

  /**
   * Что на вкладке «Кто есть кто»: все тексты вкладки и карточки-ряды. Карточку узнаём по её размеру из wallScreen.ts
   * (CARD_WIDTH×ROW_HEIGHT), а не по кеглю, — поэтому проверка не зависит от шрифта. Названия и описания сценка
   * сопоставит с исходниками сама.
   */
  const whoDump = `(() => {
    const c = window.__g.monitor.content;
    const bounds = (o) => { const b = o.getBounds(); return { t: o.text, left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const texts = c.list.filter((o) => o.type === 'Text' && o.text && !${PAGE_TEXT}.test(o.text)).map(bounds);
    const cards = c.list.filter((o) => o.type === 'Rectangle' && Math.abs(o.width - ${CARD_WIDTH}) < 0.5 && Math.abs(o.height - ${ROW_HEIGHT}) < 0.5)
      .map((o) => { const b = o.getBounds(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; });
    return JSON.stringify({ texts, cards, pages: window.__g.monitor.pages, hidden: c.list.some((o) => o.type === 'Text' && o.text === '???') });
  })()`;

  /**
   * Сверить вкладку с исходником: каждый ожидаемый ряд (имя и описание на языке language) есть на экране,
   * стоит в карточке ровно там, где его ставит addCard (ROW_NAME_TOP/ROW_DESC_TOP, текст от CARD_TEXT_X и не шире
   * ROW_TEXT_WIDTH), а описания не налезают на следующий ряд и не лезут в соседнюю колонку. Ни одного «505»,
   * «−76» или fontSize здесь больше нет: только константы и тексты из исходников.
   * Возвращает { names, rows, problems } — problems пустой, когда всё на месте.
   */
  const checkWho = (dump, language, tag) => {
    const expected = WHO_ROWS[language];
    const texts = dump.texts || [];
    const cards = dump.cards || [];
    const problems = [];
    const rowOf = (text) => texts.find((t) => t.t === text);
    const rows = [];
    for (const row of expected) {
      const name = rowOf(row.name);
      const desc = rowOf(row.description);
      if (!name) { problems.push('нет названия «' + row.name + '»'); continue; }
      if (!desc) { problems.push('нет описания «' + row.description.slice(0, 24) + '…»'); continue; }
      // Карточка ряда — ближайшая к названию по обоим осям: текст стоит на CARD_TEXT_X и ROW_NAME_TOP от её края.
      // Не «первая, что накрывает по высоте»: во второй колонке она тоже накрывала бы название первой колонки.
      const card = cards.slice().sort((a, b) =>
        (Math.abs(a.left + CARD_TEXT_X - name.left) + Math.abs(a.top + ROW_NAME_TOP - name.top))
        - (Math.abs(b.left + CARD_TEXT_X - name.left) + Math.abs(b.top + ROW_NAME_TOP - name.top)))[0];
      if (!card) { problems.push('у ряда «' + row.name + '» нет карточки'); continue; }
      rows.push({ name: row.name, card });
      const dx = name.left - (card.left + CARD_TEXT_X);
      if (Math.abs(dx) > 1) problems.push('«' + row.name + '» не на своём месте: левее/правее карточки на ' + dx.toFixed(1));
      const dyName = name.top - (card.top + ROW_NAME_TOP);
      if (Math.abs(dyName) > 1) problems.push('название «' + row.name + '» не на ROW_NAME_TOP (+' + dyName.toFixed(1) + ')');
      const dyDesc = desc.top - (card.top + ROW_DESC_TOP);
      if (Math.abs(dyDesc) > 1) problems.push('описание «' + row.name + '» не на ROW_DESC_TOP (+' + dyDesc.toFixed(1) + ')');
      if (name.right > card.left + CARD_TEXT_RIGHT + 1) problems.push('название «' + row.name + '» вылезает за ROW_TEXT_WIDTH (' + name.right + ' > ' + (card.left + CARD_TEXT_RIGHT) + ')');
      if (desc.right > card.left + CARD_TEXT_RIGHT + 1) problems.push('описание «' + row.name + '» вылезает за ROW_TEXT_WIDTH (' + desc.right + ' > ' + (card.left + CARD_TEXT_RIGHT) + ')');
      if (desc.bottom > card.bottom + 1) problems.push('описание «' + row.name + '» вылезает за карточку вниз (' + desc.bottom + ' > ' + card.bottom + ')');
      if (desc.top < name.bottom - 1) problems.push('описание «' + row.name + '» налезает на название');
    }
    // Колонки: карточки в двух столбцах по ROW_WIDTH; наложение карточек или описания на соседа — провал.
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i], b = cards[j];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) problems.push('карточки налезают друг на друга');
      }
    }
    const columns = [...new Set(cards.map((c) => Math.round(c.left)))].sort((a, b) => a - b);
    if (columns.length === 2 && Math.abs(columns[1] - columns[0] - ROW_WIDTH) > 1) problems.push('колонки не на ROW_WIDTH (' + (columns[1] - columns[0]) + ' вместо ' + ROW_WIDTH + ')');
    // Следующий ряд в той же колонке: описание не заходит на его название.
    for (const row of rows) {
      const below = rows.filter((other) => other !== row && Math.abs(other.card.left - row.card.left) < 1 && other.card.top > row.card.top).sort((a, b) => a.card.top - b.card.top)[0];
      const desc = rowOf(expected.find((e) => e.name === row.name).description);
      if (below && desc && desc.bottom > below.card.top + 1) problems.push('описание «' + row.name + '» заходит на следующий ряд «' + below.name + '»');
    }
    const visible = expected.filter((row) => texts.some((t) => t.t === row.name));
    return { names: visible.map((row) => row.name), rows: rows.length, cards: cards.length, problems };
  };

  const who = JSON.parse((await val(whoDump)) ?? '{}');
  const whoRu = checkWho(who, 'ru', ''), whoEn = checkWho(who, 'en', '');
  const first = whoRu.names.length >= whoEn.names.length ? { lang: 'ru', report: whoRu } : { lang: 'en', report: whoEn };
  const otherLang = first.lang === 'ru' ? 'en' : 'ru';
  console.log('who:', JSON.stringify({ lang: first.lang, report: first.report, cards: who.cards && who.cards.length }));
  check(first.report.names.length === WHO_ROW_COUNT, WHO_ROW_COUNT + ' рядов на ' + first.lang + ': ' + first.report.names.join(', '));
  check(who.cards && who.cards.length === WHO_ROW_COUNT, 'карточек ' + WHO_ROW_COUNT + ' (нашлось ' + (who.cards && who.cards.length) + ')');
  check(who.pages === 1, 'все ряды на одной странице (страниц ' + who.pages + ')');
  check(who.hidden === false, 'плиток «???» нет — всё встречено');
  check(first.report.problems.length === 0, first.lang + ': ряды по константам wallScreen.ts, тексты — из machines.ts/lang.ts' + (first.report.problems.length ? ': ' + JSON.stringify(first.report.problems) : ''));

  // Второй проход: другой язык — русский длиннее, описания переносятся на вторую строку.
  await val('window.__g.toggleLanguage(); 1');
  await sleep(600);
  await val('window.__g.monitor.showTab("who"); 1');
  await sleep(700);
  await shot('who-all-other-lang.png');
  const other = JSON.parse((await val(whoDump)) ?? '{}');
  const otherReport = checkWho(other, otherLang, '');
  console.log('who (другой язык):', JSON.stringify({ lang: otherLang, report: otherReport }));
  check(otherReport.names.length === WHO_ROW_COUNT, 'на ' + otherLang + ' тоже ' + WHO_ROW_COUNT + ' рядов: ' + otherReport.names.join(', '));
  check(other.pages === 1, 'на другом языке тоже одна страница (страниц ' + other.pages + ')');
  check(otherReport.problems.length === 0, otherLang + ': наслоений нет, всё по константам' + (otherReport.problems.length ? ': ' + JSON.stringify(otherReport.problems) : ''));

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

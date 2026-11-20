/**
 * Проверка планшета на стене (DONTLIKE 19.11, «Доработка» п.2 и «Ачивки») в headless Chrome.
 * Запуск: node .claude/skills/next-step/tablet-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимки и профиль Chrome — в scratchpad.
 * Порт 8771 и Chrome на 9337 — свои; сценарии atm-who-check (8770/9337) и shot (8766/9333) не трогаем.
 *
 * Что проверяет:
 *  - все пять вкладок открываются и на каждой есть содержимое;
 *  - карточки ачивок кликабельны всей площадью, клик не листает страницу; карточка, название и описание находятся
 *    по размеру и месту из src/game/parts/wallScreen.ts (CARD_WIDTH/ROW_HEIGHT/ROW_NAME_TOP/ROW_DESC_TOP), а не по
 *    ширине «больше 400» и кеглю, — поэтому смена шрифта проверку не роняет, а перенос карточки роняет;
 *  - полученная ачивка открывает панель с названием и полным описанием из lang.ts (тексты берутся из ключей
 *    achNoSmoke/achNoSmokeWhat и остальных — тех же, что читает игра);
 *  - неполученная — ровно «❓», «???», «Условие скрыто», «НЕ ПОЛУЧЕНО» и «✕» крестика: набор сверяется как
 *    множество, без «содержит», крестик обязателен; ни одного настоящего названия, описания или значка из
 *    ACHIEVEMENTS в панели нет;
 *  - закрытие: Esc (планшет остаётся на вкладке «Ачивки»), второй Esc подряд (закрывает уже планшет), ✕ в углу
 *    панели, клик мимо панели; клик по самой панели её не закрывает и не листает вкладку под ней;
 *  - геометрия: стекло — ровно WALL_PANEL из layout.ts (ширина, высота и середина по обеим осям), счётчик «‹ 1/4 ›»
 *    в правом нижнем углу стекла (в PAD от краёв) и не налезает на карточки, карточки внутри стекла, панель
 *    подробностей и её крестик не выходят за стекло; клик «мимо панели» — по точке из геометрии, а не по константе;
 *  - счётчик листает страницы, после возврата карточки на месте;
 *  - то же на английском: EARNED / NOT EARNED и Condition hidden.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node tablet-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Исходники читаем текстом: сценарий запускается обычным node (без ts-resolve), а в браузере видна только сцена
 * (window.__g), не модули игры. Всё, что проверяем, берём оттуда же, откуда берёт игра: смена ключа или размера
 * в исходнике роняет сценарий, а не проходит молча по устаревшей копии.
 */
const SRC = (rel) => readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');
const langPairs = new Map();
for (const m of SRC('src/game/lang.ts').matchAll(/^\s*(ach[A-Za-z]+): \{ ru: (['"])(.*?)\2, en: (['"])(.*?)\4 \},?$/gm)) {
  langPairs.set(m[1], { ru: m[3], en: m[5] });
}
if (langPairs.size === 0) throw new Error('не разобрал надписи ach* из src/game/lang.ts');
/** Текст ключа lang.ts на двух языках: нет ключа — падаем, а не сверяем экран с пустой строкой. */
const words = (key) => {
  const pair = langPairs.get(key);
  if (!pair) throw new Error('в src/game/lang.ts нет ключа ' + key);
  return pair;
};
// Что должно быть на экране: те же ключи, что читает игра (achNoSmoke, achNoSmokeWhat, achConditionHidden, achEarned, achNotEarned).
const RU = { name: words('achNoSmoke').ru, what: words('achNoSmokeWhat').ru, hidden: words('achConditionHidden').ru, earned: words('achEarned').ru, notEarned: words('achNotEarned').ru };
const EN = { name: words('achNoSmoke').en, what: words('achNoSmokeWhat').en, hidden: words('achConditionHidden').en, earned: words('achEarned').en, notEarned: words('achNotEarned').en };
/**
 * Карточка планшета — не «прямоугольник шире 400»: размеры, отступы и место названия/описания берём из wallScreen.ts
 * (CARD_WIDTH, ROW_HEIGHT, ROW_NAME_TOP, ROW_DESC_TOP), размеры стекла — из layout.ts (WALL_PANEL), панели
 * подробностей — оттуда же (DETAIL_WIDTH/DETAIL_HEIGHT). Карточку узнаём по её размеру и зоне клика, название и
 * описание — по месту в карточке: смена кегля проверку не роняет, а перенос карточки или текста — роняет.
 */
const WALL_SRC = SRC('src/game/parts/wallScreen.ts');
const wallNumber = (name) => {
  const match = WALL_SRC.match(new RegExp('^const ' + name + ' = (-?\\d+(?:\\.\\d+)?);', 'm'));
  if (!match) throw new Error('в src/game/parts/wallScreen.ts не нашёл const ' + name);
  return Number(match[1]);
};
const ROW_HEIGHT = wallNumber('ROW_HEIGHT'); // высота карточки и шаг ряда
const ROW_WIDTH = wallNumber('ROW_WIDTH'); // от левого края карточки до левого края соседней
const ROW_GAP = wallNumber('ROW_GAP');
/**
 * CARD_WIDTH в wallScreen.ts — не число, а выражение «ROW_WIDTH - ROW_GAP». Разбираем саму строку и считаем по ней:
 * это зеркало формулы игры, а не своё «495». Формулу в исходнике поменяют — упадём с внятным текстом, а не посчитаем
 * карточку по старой. Числом CARD_WIDTH там тоже подойдёт — тогда берём число.
 */
const CARD_WIDTH = (() => {
  const match = WALL_SRC.match(/^const CARD_WIDTH = (.+);$/m);
  if (!match) throw new Error('в src/game/parts/wallScreen.ts не нашёл const CARD_WIDTH');
  const formula = match[1].trim();
  if (/^-?\d+(?:\.\d+)?$/.test(formula)) return Number(formula);
  if (formula === 'ROW_WIDTH - ROW_GAP') return ROW_WIDTH - ROW_GAP; // та же формула, что в игре
  throw new Error('CARD_WIDTH в wallScreen.ts записан как «' + formula + '» — проверка знает только число или ROW_WIDTH - ROW_GAP');
})();
const CARD_PAD = wallNumber('CARD_PAD');
const ROW_ICON = wallNumber('ROW_ICON');
const ROW_ICON_GAP = wallNumber('ROW_ICON_GAP');
const ROW_NAME_TOP = wallNumber('ROW_NAME_TOP'); // от верха карточки до названия
const ROW_DESC_TOP = wallNumber('ROW_DESC_TOP'); // и до описания
const CARD_TEXT_X = CARD_PAD + ROW_ICON + ROW_ICON_GAP; // от левого края карточки до текста
const DETAIL_WIDTH = wallNumber('DETAIL_WIDTH');
const DETAIL_HEIGHT = wallNumber('DETAIL_HEIGHT');
const PAD = wallNumber('PAD'); // поле стекла: счётчик прижат к нему в правом нижнем углу содержимого
const TAB_HEIGHT = wallNumber('TAB_HEIGHT'); // высота плашек шапки: под ними начинается содержимое вкладки
/**
 * Числовые константы layout.ts с формулами (ZOOM = GAME_HEIGHT / VIEW_HEIGHT, VIEW_CENTER_X = VIEW_WIDTH / 2).
 * x стекла в layout.ts — выражение, поэтому подставить его можно только разрешив ссылки на соседние константы:
 * разрешаем лениво и только арифметику. Не разобрали — падаем, а не сверяем стекло с выдуманным числом.
 */
const layoutNumber = (() => {
  const table = new Map();
  for (const m of SRC('src/game/layout.ts').matchAll(/^export const ([A-Z][A-Z0-9_]*) = ([^;]+);/gm)) {
    table.set(m[1], m[2].replace(/\/\/.*$/, '').trim());
  }
  const resolve = (expr, depth = 0) => {
    if (depth > 16) throw new Error('layout.ts: константы ссылаются друг на друга глубже 16 шагов: ' + expr);
    const expanded = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) => {
      if (!table.has(name)) throw new Error('layout.ts: в выражении «' + expr + '» неизвестная константа ' + name);
      return '(' + resolve(table.get(name), depth + 1) + ')';
    });
    if (!/^[\d\s.+\-*/()]+$/.test(expanded)) throw new Error('layout.ts: «' + expr + '» — не арифметика');
    return String(Function('return (' + expanded + ')')());
  };
  return (nameOrExpr) => {
    const expr = table.has(nameOrExpr) ? table.get(nameOrExpr) : nameOrExpr;
    return Number(resolve(expr));
  };
})();
// Стекло планшета — ровно WALL_PANEL из layout.ts: y, ширина и высота там числа, x — выражение (VIEW_CENTER_X),
// его разрешаем через те же константы layout.ts. В браузере сверяем настоящие границы стекла с этими числами.
const WALL_PANEL = (() => {
  const match = SRC('src/game/layout.ts').match(/^export const WALL_PANEL: Box = \{ x: ([^,]+), y: (-?\d+), width: (\d+), height: (\d+) \};/m);
  if (!match) throw new Error('в src/game/layout.ts не разобрал WALL_PANEL');
  return { x: layoutNumber(match[1].trim()), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) };
})();
/**
 * Настоящие названия, описания и значки всех ачивок — из исходников: в браузере модуль ACHIEVEMENTS не виден
 * (window.__g — только сцена), а скрытая карточка и панель их не выдают. Сверяем панель с этим списком: если хоть
 * одна настоящая строка просочилась, проверка падает. Не разобрали исходники — падаем сразу, а не молча пропускаем.
 */
const achievementsSource = [...SRC('src/game/achievements.ts').matchAll(/^\s*\{ id: '[^']+', group: '[a-z]+', icon: '([^']*)', name: '([^']+)', what: '([^']+)' \},?$/gm)]
  .map((m) => ({ icon: m[1], name: m[2], what: m[3] }));
if (achievementsSource.length === 0) throw new Error('не разобрал ACHIEVEMENTS из src/game/achievements.ts');
for (const achievement of achievementsSource) {
  if (!langPairs.has(achievement.name) || !langPairs.has(achievement.what)) throw new Error('нет текста для ' + achievement.name + ' в src/game/lang.ts');
}
/** Всё, чем панель выдала бы настоящую ачивку: значок и оба текста на RU и EN. */
const REAL_ACHIEVEMENT_STRINGS = new Set();
for (const achievement of achievementsSource) {
  REAL_ACHIEVEMENT_STRINGS.add(achievement.icon);
  for (const language of ['ru', 'en']) {
    REAL_ACHIEVEMENT_STRINGS.add(langPairs.get(achievement.name)[language]);
    REAL_ACHIEVEMENT_STRINGS.add(langPairs.get(achievement.what)[language]);
  }
}
// Chrome и сервер — только после того, как исходники разобраны: не разобрали — падаем до запуска и не оставляем
// висящий headless Chrome на порту 9337.
const srv = spawn('python3', ['-m', 'http.server', '8771', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9337', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-tablet', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9337/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
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
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8771/' });
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');

  // Прогресс и язык — заранее в localStorage: одна ачивка получена (noSmoke, первая карточка), остальные скрыты.
  await val(`localStorage.setItem('dolgovaya-yama-progress', JSON.stringify({ tutorialDone: true, patterns: [], achievements: ['noSmoke'] }));
    localStorage.setItem('dolgovaya-yama-lang', 'ru'); location.reload(); 1`);
  await sleep(3500);
  await val('window.__g.finishTutorial(); 1');
  await sleep(700);

  /** Точка раскладки (единицы вида) → точка страницы: левый край холста + (x − scrollX) × zoom × масштаб холста. */
  const pagePoint = async (x, y) => JSON.parse(await val(`(() => {
    const g = window.__g, cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    return JSON.stringify({ x: r.left + (${x} - cam.scrollX) * cam.zoom * k, y: r.top + (${y} - cam.scrollY) * cam.zoom * k });
  })()`));
  /** Клик мышью в точке раскладки. */
  const click = async (x, y) => {
    const p = await pagePoint(x, y);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(450);
  };
  const pressEsc = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(450);
  };
  /**
   * Всё, что видно на планшете: содержимое вкладки, карточки, страницы, стекло, счётчик, открытая панель.
   * Карточку узнаём по размеру CARD_WIDTH × ROW_HEIGHT из wallScreen.ts и по своей зоне клика, название и описание —
   * по месту в карточке (ROW_NAME_TOP и ROW_DESC_TOP), а не по кеглю: смена шрифта проверку не роняет.
   */
  const tablet = async () => JSON.parse(await val(`(() => {
    const m = window.__g.monitor, list = m.content.list;
    const bounds = (o) => { const b = o.getBounds(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const cardWidth = ${CARD_WIDTH}, rowHeight = ${ROW_HEIGHT}, nameTop = ${ROW_NAME_TOP}, descTop = ${ROW_DESC_TOP}, textX = ${CARD_TEXT_X};
    const cards = list.filter((o) => o.type === 'Rectangle' && o.input && Math.abs(o.width - cardWidth) < 0.5 && Math.abs(o.height - rowHeight) < 0.5);
    const info = cards.map((c) => {
      const b = bounds(c);
      const textAt = (dy) => list.find((o) => o.type === 'Text' && Math.abs(o.x - (b.left + textX)) <= 1 && Math.abs(o.y - (b.top + dy)) <= 1);
      const title = textAt(nameTop), note = textAt(descTop);
      return { x: c.x, y: c.y, left: b.left, top: b.top, right: b.right, bottom: b.bottom, input: !!c.input, title: title ? title.text : null, note: note ? note.text : null };
    });
    // Стекло планшета — прямоугольник ровно WALL_PANEL.width × WALL_PANEL.height из layout.ts.
    const panelObject = m.overlay.find((o) => o.type === 'Rectangle' && Math.abs(o.width - ${WALL_PANEL.width}) < 0.5 && Math.abs(o.height - ${WALL_PANEL.height}) < 0.5);
    // Счётчик страниц «‹ 1/4 ›» — единственный текст такого вида в содержимом вкладки.
    const counterObject = list.find((o) => o.type === 'Text' && /^‹ \\d+\\/\\d+ ›$/.test(o.text || ''));
    const box = counterObject ? bounds(counterObject) : null;
    const panel = panelObject ? bounds(panelObject) : null;
    return JSON.stringify({
      tab: m.tab, open: m.isOpen, page: m.page, pages: m.pages, items: list.length,
      cards: info, detailOpen: m.detail !== null,
      panel,
      counter: box ? { text: counterObject.text, x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, ...box } : null,
    });
  })()`));
  /** Надписи открытой панели подробностей, её границы, точка крестика и границы его плашки. */
  const detail = async () => JSON.parse(await val(`(() => {
    const m = window.__g.monitor, d = m.detail;
    if (!d) return JSON.stringify({ open: false, texts: [] });
    const bounds = (o) => { const b = o.getBounds(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const texts = d.list.filter((o) => o.type === 'Text').map((o) => o.text);
    const rects = d.list.filter((o) => o.type === 'Rectangle');
    const panel = rects.find((o) => Math.abs(o.width - ${DETAIL_WIDTH}) < 0.5 && Math.abs(o.height - ${DETAIL_HEIGHT}) < 0.5);
    const close = rects[rects.length - 1];
    return JSON.stringify({ open: true, texts, panel: panel ? bounds(panel) : null, close: { x: d.x + close.x, y: d.y + close.y }, closeBox: bounds(close) });
  })()`));
  /** Прямоугольник a целиком внутри b (по мировым границам). */
  const inside = (a, b) => !!a && !!b && a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5;
  /** Прямоугольники a и b пересекаются по площади. */
  const overlaps = (a, b) => !!a && !!b && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
  /**
   * Счётчик «‹ 1/4 ›» стоит там, где его ставит игра (addPageCounter): правый край — в PAD от правого края стекла,
   * середина по y — в PAD над нижним. «Где-нибудь внутри стекла» не годится: в левом верхнем углу он тоже был бы внутри.
   */
  const counterInCorner = (panel, counter) => !!panel && !!counter
    && Math.abs(counter.right - (panel.right - PAD)) <= 1
    && Math.abs(counter.y - (panel.bottom - PAD)) <= 1;
  /**
   * Точка клика «мимо панели подробностей» — из геометрии, а не числом 120×80: первая в стекле ниже шапки,
   * что не попадает ни в панель, ни в карточку. Панель или карточки переедут — точка сдвинется, а не промахнётся
   * в них. Нет такой точки (стекло занято целиком) — null, и проверка честно провалится.
   */
  const awayFromPanel = (panel, detailPanel, cards) => {
    if (!panel) return null;
    const headerBottom = panel.top + 2 * PAD + TAB_HEIGHT; // плашки шапки: под ними начинается содержимое
    const hits = (r, x, y) => !!r && x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2;
    for (let y = headerBottom + 4; y <= panel.bottom - 4; y += 4) {
      for (let x = panel.left + 4; x <= panel.right - 4; x += 4) {
        if (hits(detailPanel, x, y) || cards.some((card) => hits(card, x, y))) continue;
        return { x, y };
      }
    }
    return null;
  };
  const openTab = async (tab) => { await val(`window.__g.monitor.page = 0; window.__g.monitor.showTab('${tab}'); 1`); await sleep(650); };
  /**
   * Скрытая ачивка не выдаёт спойлер: в панели ровно «❓», «???», «Условие скрыто», статус и «✕» крестика —
   * сверяем как множество, а не «содержит»; и ни одной настоящей строки ачивок из исходников в панели нет.
   * Крестик обязателен: без него из панели нет выхода мышью, и молча пропускать его отсутствие нельзя.
   */
  const checkMaskedPanel = (texts, lang, tag) => {
    const masked = new Set(['❓', '???', lang.hidden, lang.notEarned, '✕']);
    const got = new Set(texts);
    const extra = [...got].filter((text) => !masked.has(text));
    const missing = [...masked].filter((text) => !got.has(text));
    check(extra.length === 0 && missing.length === 0,
      tag + 'в скрытой панели ровно набор ' + JSON.stringify([...masked]) +
        (extra.length ? ', лишнее: ' + JSON.stringify(extra) : '') + (missing.length ? ', не хватает: ' + JSON.stringify(missing) : ''));
    const leaked = [...got].filter((text) => REAL_ACHIEVEMENT_STRINGS.has(text));
    check(leaked.length === 0,
      tag + 'ни названия, ни описания, ни значка ни одной из ' + achievementsSource.length + ' ачивок в панели нет' + (leaked.length ? ': ' + JSON.stringify(leaked) : ''));
  };

  // Немного встреченного: предметы и амулеты на вкладках — карточками, а не «???». Дилер и Коллектор — для «Кто есть кто».
  await val(`window.__g.devGiveItem('cigarette'); window.__g.devGiveItem('shield'); window.__g.devGiveItem('garlic'); window.__g.devGiveItem('cherries');
    window.__g.devGiveAmulet('cherryPit'); window.__g.devGiveAmulet('bell'); 1`);
  await sleep(600);
  await val('window.__g.openShop(); 1');
  await sleep(2200);
  await val('window.__g.startDealerGame(() => {}); 1');
  await sleep(900);
  await val('window.__g.stopDealing(); 1');
  await sleep(900);
  await val('window.__g.machineId = "greedy"; window.__g.showNewMachine(); window.__g.machineId = "quiet"; window.__g.showNewMachine(); 1');
  await sleep(700);

  // Открыть планшет и снять все пять вкладок. isAtMonitor — как у игрока после клика по экрану на стене: по нему
  // Esc закрывает сперва панель подробностей, а сцена — планшет. (lookAtMonitor ждёт canAct(), а в тесте игру не крутят.)
  await val('window.__g.isAtMonitor = true; window.__g.monitor.open(); 1');
  await sleep(900);
  let st = await tablet();
  check(st.open === true && st.tab === 'symbols', 'планшет открыт на «Символах»');
  await shot('after-symbols.png');
  for (const [tab, file] of [['items', 'after-items.png'], ['who', 'after-who.png'], ['howTo', 'after-howto.png'], ['achievements', 'after-ach.png']]) {
    await openTab(tab);
    st = await tablet();
    check(st.tab === tab && st.items > 0, `вкладка ${tab} открылась, содержимого ${st.items}`);
    await shot(file);
  }

  // «Ачивки»: 7 рядов по 2 карточки = 14 на страницу, 44 ачивки — 4 страницы.
  st = await tablet();
  check(st.pages === 4, 'у ачивок 4 страницы (сейчас ' + st.page + '/' + st.pages + ')');
  check(st.cards.length === 14, 'на странице 14 карточек-ачивок: ' + st.cards.length);
  check(st.counter !== null && st.counter.text === '‹ 1/4 ›', 'счётчик страниц: ' + (st.counter && st.counter.text));
  check(st.cards.every((c) => c.title), 'у каждой карточки есть название');
  const obtained = st.cards[0];
  const hidden = st.cards[1];
  check(obtained && obtained.title === RU.name && obtained.note === RU.what, 'полученная карточка: «' + (obtained && obtained.title) + '» — ' + (obtained && obtained.note));
  check(hidden && hidden.title === '???' && hidden.note === RU.hidden, 'неполученная карточка: «' + (hidden && hidden.title) + '» — ' + (hidden && hidden.note));

  // Клик по полученной: панель с названием и полным описанием из lang.ts, страница не перелистнулась.
  await click(obtained.x, obtained.y);
  let d = await detail();
  st = await tablet();
  check(d.open === true, 'клик по полученной карточке открыл панель');
  check(st.detailOpen === true && st.page === 0, 'панель открыта, страница не перелистнулась');
  check(d.texts.includes(RU.name), 'в панели название из ключа achNoSmoke: «' + RU.name + '»');
  check(d.texts.includes(RU.what), 'в панели описание из ключа achNoSmokeWhat: «' + RU.what + '»');
  check(d.texts.includes(RU.earned), 'в панели статус «' + RU.earned + '»');
  await shot('after-ach-detail.png');

  // Esc закрывает только панель: вкладка «Ачивки» и планшет остаются.
  await pressEsc();
  d = await detail();
  st = await tablet();
  check(d.open === false, 'Esc закрыл панель');
  check(st.open === true && st.tab === 'achievements' && st.cards.length === 14, 'планшет остался на «Ачивках», карточки на месте');

  // Второй Esc подряд закрывает уже сам планшет (панели больше нет) — и только его.
  await pressEsc();
  st = await tablet();
  check(st.open === false && st.detailOpen === false, 'второй Esc подряд закрыл планшет');
  await val('window.__g.isAtMonitor = true; window.__g.monitor.open(); 1');
  await sleep(700);
  await openTab('achievements');
  st = await tablet();
  check(st.open === true && st.tab === 'achievements' && st.cards.length === 14, 'планшет снова открыт на «Ачивках», 14 карточек');

  // Геометрия стекла: оно ровно то, что написано в layout.ts (WALL_PANEL) — ширина, высота и место по обеим осям, —
  // а карточки и счётчик внутри него; счётчик прижат к правому нижнему углу, как в addPageCounter.
  const glassWidth = st.panel ? st.panel.right - st.panel.left : null;
  const glassHeight = st.panel ? st.panel.bottom - st.panel.top : null;
  const glassX = st.panel ? (st.panel.left + st.panel.right) / 2 : null;
  const glassY = st.panel ? (st.panel.top + st.panel.bottom) / 2 : null;
  check(st.panel && Math.abs(glassWidth - WALL_PANEL.width) <= 1 && Math.abs(glassHeight - WALL_PANEL.height) <= 1
    && Math.abs(glassX - WALL_PANEL.x) <= 1 && Math.abs(glassY - WALL_PANEL.y) <= 1,
    'стекло планшета ровно как WALL_PANEL в layout.ts: ' + (st.panel ? Math.round(glassWidth) + '×' + Math.round(glassHeight) + ' с серединой ' + Math.round(glassX) + '×' + Math.round(glassY) : 'стекла нет')
      + ', WALL_PANEL ' + WALL_PANEL.width + '×' + WALL_PANEL.height + ' с серединой ' + Math.round(WALL_PANEL.x) + '×' + WALL_PANEL.y);
  check(st.cards.every((c) => inside(c, st.panel)), 'все карточки целиком внутри стекла');
  check(inside(st.counter, st.panel), 'счётчик «‹ 1/4 ›» внутри стекла' + (st.counter ? ' (' + JSON.stringify(st.counter) + ')' : ''));
  check(counterInCorner(st.panel, st.counter), 'счётчик «‹ 1/4 ›» в правом нижнем углу стекла: правый край ' + (st.counter ? Math.round(st.counter.right) : '—') + ' = ' + (st.panel ? Math.round(st.panel.right - PAD) : '—') + ' (стекло справа − PAD ' + PAD + '), середина y ' + (st.counter ? Math.round(st.counter.y) : '—') + ' = ' + (st.panel ? Math.round(st.panel.bottom - PAD) : '—') + ' (стекло снизу − PAD)');
  check(!!st.counter && st.cards.every((c) => !overlaps(st.counter, c)), 'счётчик не налезает ни на одну карточку' + (st.counter ? '' : ' — счётчика нет, проверять нечего'));

  // Клик по неполученной: в панели ровно «❓», «???», «Условие скрыто», статус и «✕» крестика — больше ничего.
  await click(hidden.x, hidden.y);
  d = await detail();
  check(d.open === true, 'клик по неполученной карточке открыл панель');
  checkMaskedPanel(d.texts, RU, '');
  check(inside(d.panel, st.panel), 'панель подробностей не выходит за стекло планшета' + (d.panel ? ' (' + JSON.stringify(d.panel) + ')' : ''));
  check(inside(d.closeBox, d.panel), 'крестик панели внутри самой панели');
  await shot('after-ach-hidden.png');

  // Клик по самой панели — не «мимо»: она остаётся открытой и не листает вкладку под собой.
  // Панели может не быть (detail() вернул panel: null) — тогда честно проваливаем проверку, а не падаем TypeError
  // до строки «итог N из N».
  if (d.panel) await click(d.panel.left + 30, d.panel.bottom - 20);
  else check(false, 'нет панели подробностей — клик по ней невозможен');
  d = await detail();
  st = await tablet();
  check(d.open === true && st.detailOpen === true && st.page === 0, 'клик по самой панели не закрыл её и не перелистнул страницу');

  // Крестик в углу панели: его может не быть, если панель не открылась — не падаем до «итог N из N».
  if (d.close) await click(d.close.x, d.close.y);
  else check(false, 'нет крестика панели — клик по нему невозможен');
  d = await detail();
  check(d.open === false, 'крестик закрыл панель');
  st = await tablet();
  check(st.open === true && st.tab === 'achievements', 'после крестика планшет на «Ачивках»');

  // Клик мимо панели (по затемнению) — тоже только закрывает панель. Точку берём из геометрии стекла: она ниже шапки
  // и не попадает ни в панель, ни в карточки, — а не фиксированные 120×80, которые могут оказаться где угодно.
  await click(hidden.x, hidden.y);
  d = await detail();
  check(d.open === true, 'панель открыта снова');
  const away = awayFromPanel(st.panel, d.panel, st.cards);
  check(!!away && !!st.panel && away.x > st.panel.left && away.x < st.panel.right && away.y > st.panel.top && away.y < st.panel.bottom,
    'точка «мимо панели» — в стекле и вне панели подробностей: ' + (away ? Math.round(away.x) + '×' + Math.round(away.y) : 'нет такой точки'));
  if (away) await click(away.x, away.y);
  d = await detail();
  st = await tablet();
  check(d.open === false && st.open === true && st.tab === 'achievements', 'клик мимо панели закрыл только её');

  /**
   * Клик по счётчику страниц: его может не быть (counter: null) — тогда честно проваливаем проверку, а не падаем
   * TypeError мимо check() и не умираем без строки «итог N из N».
   */
  const clickCounter = async (state) => {
    if (state.counter) await click(state.counter.x, state.counter.y);
    else check(false, 'нет счётчика страниц — клик по нему невозможен');
  };

  // Счётчик в нижнем правом углу: вторая страница, другие карточки; назад — снова первая.
  await clickCounter(st);
  st = await tablet();
  check(st.page === 1 && st.counter && st.counter.text === '‹ 2/4 ›', 'счётчик перелистнул на «' + (st.counter && st.counter.text) + '»');
  check(st.cards.length === 14 && st.cards[0].title !== obtained.title, 'на второй странице другие карточки');
  check(inside(st.counter, st.panel) && st.cards.every((c) => !overlaps(st.counter, c)), 'на второй странице счётчик тоже внутри стекла и не налезает на карточки');
  await shot('after-ach-page2.png');
  await clickCounter(st);
  st = await tablet();
  check(st.page === 2 && st.counter && st.counter.text === '‹ 3/4 ›', 'счётчик листает дальше: «' + (st.counter && st.counter.text) + '»');
  await clickCounter(st);
  st = await tablet();
  check(st.page === 3 && st.counter && st.counter.text === '‹ 4/4 ›', 'последняя страница: «' + (st.counter && st.counter.text) + '»');
  await clickCounter(st);
  st = await tablet();
  check(st.page === 0 && st.counter && st.counter.text === '‹ 1/4 ›' && st.cards[0].title === RU.name, 'счётчик вернулся на первую страницу');

  // Вкладки переключаются мышью (с «Символов» на «Ачивки» и назад), Esc не трогает шапку.
  await openTab('symbols');
  const tabPoint = JSON.parse(await val('JSON.stringify({ x: window.__g.monitor.tabButtons[3].box.x, y: window.__g.monitor.tabButtons[3].box.y })'));
  await click(tabPoint.x, tabPoint.y);
  st = await tablet();
  check(st.tab === 'achievements' && st.cards.length === 14, 'клик по вкладке «Ачивки» переключил её');

  // Английский: те же проверки на языке EN.
  await val('window.__g.toggleLanguage(); 1');
  await sleep(700);
  st = await tablet();
  check(st.cards[0] && st.cards[0].title === EN.name, 'EN: полученная карточка «' + (st.cards[0] && st.cards[0].title) + '»');
  await shot('after-ach-en.png');
  await click(st.cards[0].x, st.cards[0].y);
  d = await detail();
  check(d.open === true && d.texts.includes(EN.name) && d.texts.includes(EN.what) && d.texts.includes(EN.earned), 'EN: панель с названием, описанием и «' + EN.earned + '»');
  await shot('after-ach-detail-en.png');
  await pressEsc();
  d = await detail();
  check(d.open === false, 'EN: Esc закрыл панель');
  await click(st.cards[1].x, st.cards[1].y);
  d = await detail();
  check(d.open === true, 'EN: клик по скрытой карточке открыл панель');
  checkMaskedPanel(d.texts, EN, 'EN: ');
  await pressEsc();

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

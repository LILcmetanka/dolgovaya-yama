/**
 * Проверка телефона (и английских текстов) в headless Chrome с телефонной эмуляцией.
 * Запуск: node .claude/skills/next-step/phone-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком window.__g
 * (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимки и профиль Chrome — в scratchpad.
 * «—scan-only» — только разбор исходников (замах, шаг 35), без Chrome; PHONE_SRC=<папка src/game> — по другой копии
 * (так проверяется, что сценарий краснеет, когда в код вернули отжившее).
 *
 * Что проверяет: холст 16:9 на всё окно боком (844×390) и стоя (390×844), определитель телефона
 * (hover: none + pointer: coarse), значки ⚙ и «во весь экран» только на телефоне, «поверни телефон»,
 * касания (⚙ — пауза, рычаг — прокрутка с одного касания, переключение языка, долгое нажатие — подсказка) и что под тёмным
 * экраном «поверни телефон» игра не нажимается. Порт 8767 — свой, dev-сервер на 5173 не трогаем.
 *
 * Долги проверок (шаг 35): замаха нет по факту (разбор src/game/**, а не undefined === undefined); числа шарика рычага
 * участвуют в проверке; раскладка банкомата, полки предметов, стекла «ПЕРЕКРУТИТЬ?»/«ПОДМЕНА?», выхода магазина,
 * «Ачивок» с панелью подробностей, заставки и подсказки спасения, панели действий, экрана улучшений и выбора
 * автомата/символа на 844×390 и 390×844 — ничего не вылезает за вид, нажимаемые плашки не меньше 44×44,
 * после закрытия ввод не застревает. Размеры и тексты — из исходников (layout.ts, wallScreen.ts, atm.ts, itemShelf.ts,
 * shop.ts, lang.ts), а не «на глаз».
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node phone-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SCAN_ONLY = process.argv.includes('--scan-only');
/** Исходники — текстом: сценарий запускается обычным node, а в браузере видна только сцена (window.__g). */
const SRC = (rel) => readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');

/**
 * Шаг 35, долг 1: «шкалы замаха нет» — не `undefined === undefined`, а факт по исходникам. Обходим src/game
 * рекурсивно и ищем отжившее: отдельный файл levers.ts, слово charge (именно слово: «charged» в описании предмета —
 * другое слово) и константу CHARGE_ANCHOR. Нашли хоть одно — сценарий краснеет. PHONE_SRC позволяет прогнать
 * этот же разбор по испорченной копии (мутационная проверка), не трогая рабочее дерево.
 */
const GAME_SRC_DIR = process.env.PHONE_SRC ?? fileURLToPath(new URL('../../../src/game', import.meta.url));
const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? sourceFiles(dir + '/' + entry.name) : [dir + '/' + entry.name]));
const legacyChargeHits = () => {
  const hits = [];
  for (const file of sourceFiles(GAME_SRC_DIR)) {
    if (!/\.(ts|mjs|js)$/.test(file)) continue;
    const rel = file.slice(GAME_SRC_DIR.length + 1);
    if (/(^|\/)levers\.ts$/.test(rel)) hits.push(rel + ': файл замаха вернулся');
    const text = readFileSync(file, 'utf8');
    for (const [pattern, what] of [[/\bcharge\b/g, 'charge'], [/CHARGE_ANCHOR/g, 'CHARGE_ANCHOR']]) {
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split('\n').length;
        hits.push(rel + ':' + line + ': ' + what);
      }
    }
  }
  return hits;
};
const chargeHits = legacyChargeHits();
if (SCAN_ONLY) {
  for (const hit of chargeHits) console.log('FAIL ' + hit);
  console.log(chargeHits.length === 0 ? 'OK   замаха нет: ни charge, ни CHARGE_ANCHOR, ни levers.ts' : 'итог: замах вернулся — ' + chargeHits.length);
  process.exit(chargeHits.length === 0 ? 0 : 1);
}

/**
 * Числа из исходников: вид (layout.ts), стекло и экран автомата — оттуда же, панель подробностей — wallScreen.ts,
 * EFFECT_SCALE — itemShelf.ts, кнопка выхода — layout.ts. Разобрали не всё — падаем до запуска Chrome,
 * а не проверяем по выдуманным числам.
 */
const numberConst = (text, name, where) => {
  const match = text.match(new RegExp('^const ' + name + ' = (-?\\d+(?:\\.\\d+)?);', 'm'));
  if (!match) throw new Error(where + ': не нашёл const ' + name);
  return Number(match[1]);
};
/** Константы layout.ts (там выражения вида VIEW_WIDTH = GAME_WIDTH / ZOOM): разрешаем только арифметику. */
const LAYOUT_SRC = SRC('src/game/layout.ts');
const layoutNumber = (() => {
  const table = new Map();
  for (const m of LAYOUT_SRC.matchAll(/^export const ([A-Z][A-Z0-9_]*) = ([^;]+);/gm)) {
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
  return (name) => {
    if (!table.has(name)) throw new Error('layout.ts: нет константы ' + name);
    return Number(resolve(table.get(name)));
  };
})();
const VIEW_WIDTH = layoutNumber('VIEW_WIDTH');
const VIEW_HEIGHT = layoutNumber('VIEW_HEIGHT');
const glassBox = (() => {
  const match = LAYOUT_SRC.match(/^export const GLASS: Box = \{ x: ([^,]+), y: (-?\d+), width: (\d+), height: (\d+) \};/m);
  if (!match) throw new Error('в layout.ts не разобрал GLASS');
  return { x: layoutNumber(match[1].trim()), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) };
})();
const WALL_SRC = SRC('src/game/parts/wallScreen.ts');
const wallNumber = (name) => numberConst(WALL_SRC, name, 'src/game/parts/wallScreen.ts');
const CARD_WIDTH = (() => {
  const match = WALL_SRC.match(/^const CARD_WIDTH = (.+);$/m);
  if (!match) throw new Error('в wallScreen.ts не нашёл const CARD_WIDTH');
  const formula = match[1].trim();
  if (/^-?\d+(?:\.\d+)?$/.test(formula)) return Number(formula);
  if (formula === 'ROW_WIDTH - ROW_GAP') return wallNumber('ROW_WIDTH') - wallNumber('ROW_GAP');
  throw new Error('CARD_WIDTH в wallScreen.ts записан как «' + formula + '»');
})();
const ROW_HEIGHT = wallNumber('ROW_HEIGHT');
const DETAIL_WIDTH = wallNumber('DETAIL_WIDTH');
const DETAIL_HEIGHT = wallNumber('DETAIL_HEIGHT');
const DETAIL_CLOSE_SIZE = wallNumber('DETAIL_CLOSE_SIZE');
const EFFECT_SCALE = numberConst(SRC('src/game/parts/itemShelf.ts'), 'EFFECT_SCALE', 'src/game/parts/itemShelf.ts');
const ITEM_SIZE = layoutNumber('ITEM_SIZE');
const SHOP_LEAVE = (() => {
  const match = LAYOUT_SRC.match(/^export const SHOP_LEAVE: Box = \{ x: (-?\d+), y: (-?\d+), width: (\d+), height: (\d+) \};/m);
  if (!match) throw new Error('в layout.ts не разобрал SHOP_LEAVE');
  return { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) };
})();
const ATM_SRC = SRC('src/game/parts/atm.ts');
const atmNumber = (name) => numberConst(ATM_SRC, name, 'src/game/parts/atm.ts');
const SCREEN_WIDTH = atmNumber('SCREEN_WIDTH');
const SCREEN_HEIGHT = atmNumber('SCREEN_HEIGHT');
const CHIP_TEXTURE = (() => {
  const match = SRC('src/game/decor.ts').match(/^export const CHIP_TEXTURE = '([^']+)';/m);
  if (!match) throw new Error('в decor.ts не нашёл CHIP_TEXTURE');
  return match[1];
})();
/** Ключ lang.ts: ищем запись и читаем первые ru/en (однострочные и многострочные — одинаково). */
const LANG_SRC = SRC('src/game/lang.ts');
const langText = (key) => {
  const at = LANG_SRC.search(new RegExp('\\n  ' + key + ': \\{'));
  if (at < 0) throw new Error('в lang.ts нет ключа ' + key);
  const body = LANG_SRC.slice(at);
  const readAt = (from) => {
    const quote = body[from];
    if (quote !== "'" && quote !== '"' && quote !== '`') throw new Error(key + ': ожидал строку');
    const end = body.indexOf(quote, from + 1);
    if (end < 0) throw new Error(key + ': строка не закрыта');
    return { value: body.slice(from + 1, end), end: end + 1 };
  };
  const ruAt = body.indexOf('ru: ');
  if (ruAt < 0) throw new Error(key + ': нет ru');
  const ru = readAt(ruAt + 4);
  const enAt = body.indexOf('en: ', ru.end);
  if (enAt < 0) throw new Error(key + ': нет en');
  const en = readAt(enAt + 4);
  return { ru: ru.value, en: en.value };
};
const fillCount = (text, count) => text.replace('{0}', String(count));
const MIN_TOUCH = 44; // минимум для нажимаемой плашки в единицах раскладки — как PAGE_ZONE и CLOSE_HIT в игре

const srv = spawn('python3', ['-m', 'http.server', '8767', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9334', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-phone', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9334/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  const val = async (expr) => (await ev(expr)).result.value;
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SP + '/' + name, Buffer.from(r.result.data, 'base64')); };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };

  await send('Runtime.enable'); await send('Page.enable');

  /** Телефон: метрики, касания, CSS-запросы «нет мыши, указатель — палец». */
  const phone = async (width, height, orientation) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile: true,
      screenOrientation: { type: orientation, angle: orientation === 'portraitPrimary' ? 0 : 90 },
    });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  };

  /** Точка раскладки (единицы вида) → точка страницы: левый край холста + (x − scrollX) × zoom × масштаб холста. */
  const pagePoint = async (x, y) => JSON.parse(await val(`(() => {
    const g = window.__g, cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect();
    const k = r.width / 1920;
    return JSON.stringify({ x: r.left + (${x} - cam.scrollX) * cam.zoom * k, y: r.top + (${y} - cam.scrollY) * cam.zoom * k });
  })()`));

  /** Касание пальцем в точке раскладки. */
  const tap = async (x, y) => {
    const p = await pagePoint(x, y);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, radiusX: 6, radiusY: 6, force: 1, id: 1 }] });
    await sleep(80);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(400);
  };

  /** Пробел — настоящим вводом клавиатуры (как игрок на телефоне с подключённой клавиатурой). */
  const pressSpace = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await sleep(250);
  };

  // ---------- Телефон боком ----------
  await phone(844, 390, 'landscapePrimary');
  await send('Page.navigate', { url: 'http://127.0.0.1:8767/' });
  await sleep(2500);
  // Тьма первого забега закрывает рычаг и плашки: отмечаем обучение пройденным, как после первого забега.
  await val(`localStorage.setItem('dolgovaya-yama-progress', JSON.stringify({ tutorialDone: true, patterns: [], achievements: [] }))`);
  await send('Page.reload');
  await sleep(4000);

  check(await val('typeof window.__g') === 'object', 'hook: сцена в window.__g');
  // Долг 1 (шаг 35): замаха нет по исходникам. «undefined === undefined» больше не считается проверкой.
  check(chargeHits.length === 0, 'замаха нет в src/game: ни charge, ни CHARGE_ANCHOR, ни levers.ts'
    + (chargeHits.length ? ': ' + JSON.stringify(chargeHits.slice(0, 5)) : ' (' + sourceFiles(GAME_SRC_DIR).filter((f) => f.endsWith('.ts')).length + ' файлов)'));
  check(await val('window.__g.reveal === null'), 'тьма обучения снята (обучение пройдено)');
  const rect = JSON.parse(await val('JSON.stringify(window.__g.game.canvas.getBoundingClientRect())'));
  const fits = Math.abs(rect.height - 390) < 1 && Math.abs(rect.width - 390 * 16 / 9) < 1.5 && Math.abs(rect.top) < 1;
  check(fits, `холст 16:9 на всё окно: ${Math.round(rect.width)}×${Math.round(rect.height)} при окне 844×390, поля по ${Math.round(rect.left)} px`);
  check(await val(`window.matchMedia('(hover: none) and (pointer: coarse)').matches`), 'телефон определён: (hover: none) and (pointer: coarse)');
  check(await val(`window.__g.textures.exists('gear')`), 'значок ⚙ создан (только телефон)');
  check(await val(`window.__g.textures.exists('fullscreen')`), 'значок «во весь экран» создан (только телефон)');
  const hint = await val(`window.__g.children.list.some((o) => o.text === '📱' && o.visible)`);
  check(hint === false, 'боком: «поверни телефон» не висит');
  await shot('p-landscape.png');

  // Касание ⚙ (26, 618) — пауза с настройками.
  await tap(26, 618);
  check(await val('window.__g.isPaused') === true, 'касание ⚙ ставит паузу');
  await shot('p-pause.png');
  await tap(26, 618);
  check(await val('window.__g.isPaused') === false, 'второе касание ⚙ снимает паузу');

  // Прокрутка: Пробел — как на компьютере, но в телефонном окне.
  const spinsBefore = await val('window.__g.spinsLeft');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await sleep(900);
  const spinsAfter = await val('window.__g.spinsLeft');
  check(spinsAfter === spinsBefore - 1, `прокрутка в телефонном окне: прокруток ${spinsBefore} → ${spinsAfter}`);

  // Рычаг касанием: одно касание — одна прокрутка, держать нечего (замаха и шкалы больше нет).
  for (let i = 0; i < 20 && !(await val('window.__g.canAct()')); i++) await sleep(300);
  const ball = JSON.parse(await val(`(() => {
    const o = window.__g.panel.leverBall, b = o.getBounds();
    return JSON.stringify({ x: o.x, y: o.y, top: b.top, bottom: b.bottom, w: b.width, h: b.height, visible: o.visible, interactive: !!(o.input && o.input.enabled) });
  })()`));
  console.log('рычаг:', JSON.stringify(ball), 'canAct:', await val('window.__g.canAct()'));
  // Числа шарика — в проверке, а не только в логе: он виден, у него есть зона нажатия, он круглый и целиком в виде.
  check(ball.visible === true && ball.interactive === true, 'шарик рычага виден и нажимается');
  check(ball.top >= 0 && ball.bottom <= VIEW_HEIGHT && ball.w >= MIN_TOUCH - 0.5 && Math.abs(ball.w - (ball.bottom - ball.top)) <= 1,
    `шарик рычага целиком в виде и не меньше ${MIN_TOUCH}×${MIN_TOUCH}: ${Math.round(ball.w)}×${Math.round(ball.bottom - ball.top)}, y ${Math.round(ball.top)}…${Math.round(ball.bottom)} при виде ${Math.round(VIEW_WIDTH)}×${Math.round(VIEW_HEIGHT)}`);
  const lever = await pagePoint(ball.x, ball.y);
  const spinsHeld = await val('window.__g.spinsLeft');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lever.x, y: lever.y, radiusX: 6, radiusY: 6, force: 1, id: 1 }] });
  await sleep(400);
  const spinsTouched = await val('window.__g.spinsLeft');
  const spinStarted = await val('window.__g.isSpinning');
  await shot('p-lever-press.png'); // одно касание рычага: прокрутка уже идёт, палец ещё на нём
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);
  const spinsReleased = await val('window.__g.spinsLeft');
  check(spinStarted === true && spinsTouched === spinsHeld - 1, `касание рычага сразу крутит: прокруток ${spinsHeld} → ${spinsTouched}`);
  check(spinsReleased === spinsHeld - 1, `отпустил палец — второй прокрутки нет: прокруток ${spinsHeld} → ${spinsReleased}`);
  await sleep(3000);
  await shot('p-after-spin.png');

  // ---------- Телефон стоит ----------
  await phone(390, 844, 'portraitPrimary');
  await sleep(1200);
  check(await val(`window.__g.children.list.some((o) => o.text === '📱' && o.visible)`), 'стоя: «поверни телефон» виден');
  const rectUp = JSON.parse(await val('JSON.stringify(window.__g.game.canvas.getBoundingClientRect())'));
  const fitsUp = Math.abs(rectUp.width - 390) < 1 && Math.abs(rectUp.height - 390 * 9 / 16) < 1.5;
  check(fitsUp, `стоя холст 16:9: ${Math.round(rectUp.width)}×${Math.round(rectUp.height)} при окне 390×844`);
  await shot('p-portrait.png');
  const pausedBefore = await val('window.__g.isPaused');
  await tap(26, 618);
  check(await val('window.__g.isPaused') === pausedBefore, 'стоя: касание под тёмным экраном игры не нажимает');

  // ---------- Обратно боком ----------
  await phone(844, 390, 'landscapePrimary');
  await sleep(1200);
  check(await val(`window.__g.children.list.some((o) => o.text === '📱' && o.visible)`) === false, 'повернул обратно: «поверни телефон» погас');
  await shot('p-back.png');

  // ---------- Подсказка долгим нажатием (телефон) ----------
  const skull = JSON.parse(await val(`JSON.stringify({ x: window.__g.panel.skullShareText.x, y: window.__g.panel.skullShareText.y })`));
  const sp = await pagePoint(skull.x, skull.y);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sp.x, y: sp.y, radiusX: 6, radiusY: 6, force: 1, id: 1 }] });
  await sleep(700);
  const hintOn = await val('window.__g.tooltip.container.visible');
  const hintText = await val('window.__g.tooltip.title.text');
  await shot('p-longpress.png');
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  const hintOff = await val('window.__g.tooltip.container.visible');
  check(hintOn === true, `долгое нажатие показывает подсказку: \u00ab${hintText}\u00bb`);
  check(hintOff === false, 'отпустил палец — подсказка пропала');

  // ---------- Русский на телефоне: касание RU в паузе ----------
  await tap(26, 618); // ⚙ — пауза с настройками
  await tap(544, 430); // RU в паузе
  check(await val(`localStorage.getItem('dolgovaya-yama-lang')`) === 'ru', 'касание RU в паузе переключает язык');
  await shot('p-pause-ru.png');
  await tap(26, 618); // пауза снята
  // Снимки ниже называются -en, поэтому английский возвращаем.
  await val('window.__g.toggleLanguage(); 1');
  await sleep(500);
  check(await val(`localStorage.getItem('dolgovaya-yama-lang')`) === 'en', 'вернули английский для -en-снимков');
  await val(`window.__g.monitor.open()`);
  await sleep(600);
  await shot('m-symbols-en.png');
  await val(`window.__g.monitor.showTab('who')`);
  await sleep(300);
  await shot('m-who-en.png');
  await val(`window.__g.monitor.showTab('howTo')`);
  await sleep(300);
  await shot('m-howto-en.png');
  await val(`window.__g.monitor.showTab('items')`);
  await sleep(300);
  await shot('m-items-en.png');
  await val(`window.__g.monitor.close(() => {})`);
  // Окно ачивки: длинное EN-название должно влезать в рамку.
  await val(`window.__g.showAchievement('skullsAreSoLastCentury'); 1`);
  await sleep(700);
  await shot('p-achievement-en.png');

  // ---------- Раскладка экранов на телефоне (долг 3, шаг 35) ----------
  /** Видимое в наборе объектов: границы каждого, кто вылез за вид и кто нажимается плашкой меньше 44×44. */
  const scanParts = async (expr, minTouch = MIN_TOUCH) => JSON.parse(await val(`(() => {
    const VW = ${VIEW_WIDTH}, VH = ${VIEW_HEIGHT}, MIN = ${minTouch};
    const top = ${expr};
    const out = { total: 0, outside: [], small: [], targets: [] };
    const nameOf = (o) => (typeof o.text === 'string' && o.text !== '') ? o.text : o.type;
    const visit = (o) => {
      if (!o || o.visible === false) return;
      if (Array.isArray(o.list)) { o.list.forEach(visit); return; }
      if (typeof o.getBounds !== 'function') return;
      const b = o.getBounds();
      if (!(b.width > 0) && !(b.height > 0)) return;
      out.total += 1;
      if (b.left < -0.5 || b.top < -0.5 || b.right > VW + 0.5 || b.bottom > VH + 0.5) {
        out.outside.push({ name: nameOf(o), box: { left: +b.left.toFixed(1), top: +b.top.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) } });
      }
      // Кнопка — это плашка (Rectangle) или зона (Zone) с включённым вводом. Надписи и значки зону держат отдельно,
      // поэтому меряем то, что реально ловит палец.
      const clickable = (o.type === 'Rectangle' || o.type === 'Zone') && o.input && o.input.enabled;
      if (clickable) {
        out.targets.push({ name: nameOf(o), w: +b.width.toFixed(1), h: +b.height.toFixed(1), cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
        if (b.width < MIN - 0.5 || b.height < MIN - 0.5) out.small.push({ name: nameOf(o), w: +b.width.toFixed(1), h: +b.height.toFixed(1) });
      }
    };
    try {
      (Array.isArray(top) ? top : [top]).forEach(visit);
    } catch (error) {
      return JSON.stringify({ total: 0, outside: [], small: [], targets: [], error: String(error) });
    }
    return JSON.stringify(out);
  })()`));
  /** Ничего не вылезает за вид и набор не пустой (пустой набор прошёл бы «ничего не вылезло» молча). */
  const checkFits = (label, res, minParts = 1) => {
    check(res.total >= minParts, label + ': на экране ' + res.total + ' объектов (ждали не меньше ' + minParts + ')' + (res.error ? ' — ошибка разбора: ' + res.error : ''));
    check(res.outside.length === 0, label + ': ничего не вылезает за вид ' + Math.round(VIEW_WIDTH) + '×' + Math.round(VIEW_HEIGHT)
      + (res.outside.length ? ': ' + JSON.stringify(res.outside.slice(0, 4)) : ''));
  };
  /** Нажимаемые плашки не меньше 44×44 единиц раскладки (как PAGE_ZONE и CLOSE_HIT в самой игре). */
  const checkButtons = (label, res) => check(res.small.length === 0,
    label + ': нажимаемые плашки не меньше ' + MIN_TOUCH + '×' + MIN_TOUCH + (res.small.length ? ': ' + JSON.stringify(res.small.slice(0, 4)) : ''));
  /** Точка нажатия плашки нужного размера (крестик 44×44 или единственная такая): null — её нет. */
  const plate = (res, size) => res.targets.find((t) => Math.abs(t.w - size) <= 0.5 && Math.abs(t.h - size) <= 0.5) ?? null;

  // ---------- Полка предметов: пульс и EFFECT_SCALE (долг 3) ----------
  await val('window.__g.devGiveItem("cherries"); 1');
  await sleep(1000); // предмет летит с планшета на полку (FLY_TIME 450) и начинает «дышать»
  const shelfScale1 = await val(`(() => { const o = window.__g.itemShelf.items.find((item) => item.visible); return o ? o.scaleX : null; })()`);
  const shelfSpot = JSON.parse(await val(`(() => { const g = window.__g, o = g.itemShelf.items.find((item) => item.visible); if (!o) return JSON.stringify({ none: true }); const b = o.getBounds(); return JSON.stringify({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, scale: o.scaleX }); })()`));
  await sleep(320);
  const shelfScale2 = await val(`(() => { const o = window.__g.itemShelf.items.find((item) => item.visible); return o ? o.scaleX : null; })()`);
  check(shelfScale1 !== null && shelfScale2 !== null && Math.abs(shelfScale1 - shelfScale2) > 0.001,
    `новый предмет на полке «дышит»: масштаб ${shelfScale1} → ${shelfScale2}`);
  if (shelfSpot.x !== undefined) await tap(shelfSpot.x, shelfSpot.y);
  await sleep(600); // значок в столбике «дышит» один раз 120 мс: ждём, пока вернётся к EFFECT_SCALE
  const effect = JSON.parse(await val(`(() => {
    const g = window.__g;
    const icon = [...g.itemShelf.effectIcons.values()].find((o) => o.visible);
    if (!icon) return JSON.stringify({ none: true });
    const b = icon.getBounds();
    const spot = g.itemShelf.effectSpots.map((o) => o.getBounds()).filter((r) => r.width > 0);
    const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
    const onSpot = spot.some((r) => Math.abs((r.left + r.right) / 2 - cx) <= 1 && Math.abs((r.top + r.bottom) / 2 - cy) <= 1);
    return JSON.stringify({ scale: icon.scaleX, onSpot, cx, cy, w: b.width, h: b.height });
  })()`));
  check(effect.scale !== undefined && Math.abs(effect.scale - EFFECT_SCALE) <= 0.01,
    'включённый предмет в столбике — в масштабе EFFECT_SCALE ' + EFFECT_SCALE + ' (сейчас ' + effect.scale + ')');
  check(effect.onSpot === true, 'включённый предмет стоит в пустом гнезде, а не между ними');
  check(effect.cx >= 0 && effect.cx <= VIEW_WIDTH && effect.cy >= 0 && effect.cy <= VIEW_HEIGHT,
    'столбик включённых предметов целиком в виде: ' + effect.cx + '×' + effect.cy);
  await shot('p-item-effect.png');

  // ---------- Стекло «ПЕРЕКРУТИТЬ?» / «ПОДМЕНА?»: новость без окна и крестика (долг 3) ----------
  const readNews = async () => JSON.parse(await val(`(() => {
    const g = window.__g, n = g.screen.news;
    if (!n) return JSON.stringify({ none: true });
    const bounds = (o) => { const b = o.getBounds(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const label = n.parts.find((o) => o.type === 'Text');
    const strip = n.parts.find((o) => o.type === 'Rectangle');
    return JSON.stringify({
      text: label ? label.text : null, parts: n.parts.length,
      label: label ? bounds(label) : null, strip: strip ? bounds(strip) : null,
      cross: n.parts.some((o) => o.text === '✕'),
    });
  })()`));
  const newsInside = (n) => !!n.label && !!n.strip && n.label.left >= n.strip.left - 0.5 && n.label.right <= n.strip.right + 0.5
    && n.label.top >= n.strip.top - 0.5 && n.label.bottom <= n.strip.bottom + 0.5;
  const savedItems = JSON.parse(await val(`(() => { const e = window.__g.itemEffects; return JSON.stringify({ shuffle: e.shuffle, swap: e.swap }); })()`));
  const offerReroll = async (shuffle) => {
    await val(`(() => { const g = window.__g; g.itemEffects.shuffle = ${shuffle}; g.itemEffects.swap = ${!shuffle}; g.offerReroll(g.lastGrid ?? [], () => 1, 1); return 1; })()`);
    await sleep(400);
    const news = await readNews();
    await val('window.__g.screen.clearNews(); window.__g.pendingReroll = null; window.__g.isRerolling = false; window.__g.screen.endPick(); window.__g.refreshHud(); 1');
    await sleep(200);
    return news;
  };
  const respin = await offerReroll(true);
  check(respin.text === langText('rerollAskRespin').en && respin.parts === 2 && respin.cross === false,
    'стекло «' + langText('rerollAskRespin').en + '»: одна новость без окна и крестика (частей ' + respin.parts + ', крестик ' + respin.cross + ')');
  check(newsInside(respin), 'новость помещается в полосу стекла ' + glassBox.width + '×' + glassBox.height);
  const swap = await offerReroll(false);
  check(swap.text === langText('rerollAskSwap').en && swap.parts === 2 && swap.cross === false,
    'стекло «' + langText('rerollAskSwap').en + '»: тоже новость без окна и крестика');
  await val(`(() => { const e = window.__g.itemEffects; e.shuffle = ${savedItems.shuffle}; e.swap = ${savedItems.swap}; return 1; })()`);
  await shot('p-glass-ask.png');

  // ---------- Магазин: выход «К СЛОТ-МАШИНЕ» вместо ручки (долг 3) ----------
  await val('window.__g.balance = 100000; window.__g.tickets = 5; window.__g.openShop(); 1');
  await sleep(2600);
  const shopFits = await scanParts('[window.__g.shop.layer]', 0);
  checkFits('магазин на телефоне', shopFits, 20);
  const exit = JSON.parse(await val(`(() => {
    const g = window.__g, z = g.shop.layer.list.filter((o) => o.type === 'Zone' && o.input && o.input.enabled)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!z) return JSON.stringify({ none: true });
    const b = z.getBounds();
    return JSON.stringify({ label: g.shop.exitLabel.text, w: b.width, h: b.height, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
  })()`));
  check(exit.label === langText('shopLeave').en + ' ✕', 'выход подписан «' + langText('shopLeave').en + ' ✕», а не ручкой: сейчас «' + exit.label + '»');
  check(Math.abs(exit.w - SHOP_LEAVE.width) <= 1 && Math.abs(exit.h - SHOP_LEAVE.height) <= 1 && exit.w >= MIN_TOUCH && exit.h >= MIN_TOUCH,
    'зона выхода — SHOP_LEAVE ' + SHOP_LEAVE.width + '×' + SHOP_LEAVE.height + ' и не меньше ' + MIN_TOUCH + '×' + MIN_TOUCH);
  await tap(exit.cx, exit.cy);
  check(await val('window.__g.isShopping') === false && await val('window.__g.canAct()') === true,
    'касание выхода закрыло магазин, ввод вернулся');

  // ---------- «Ачивки» с панелью подробностей (долг 3) ----------
  await val('window.__g.isAtMonitor = true; window.__g.monitor.open(); window.__g.monitor.showTab("achievements"); 1');
  await sleep(800);
  const tabletAch = await scanParts('[window.__g.monitor.overlay, window.__g.monitor.content]');
  checkFits('планшет «Ачивки» на телефоне', tabletAch, 12);
  checkButtons('планшет «Ачивки»', tabletAch);
  const cardSpot = JSON.parse(await val(`(() => {
    const o = window.__g.monitor.content.list.find((part) => part.type === 'Rectangle' && part.input && Math.abs(part.width - ${CARD_WIDTH}) < 0.5 && Math.abs(part.height - ${ROW_HEIGHT}) < 0.5);
    if (!o) return JSON.stringify({ none: true });
    const b = o.getBounds();
    return JSON.stringify({ cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
  })()`));
  await tap(cardSpot.cx, cardSpot.cy);
  const detailScan = await scanParts('[window.__g.monitor.detail]');
  check(await val('window.__g.monitor.detail !== null') === true, 'касание карточки открыло панель подробностей');
  checkFits('панель подробностей ачивки', detailScan, 6);
  checkButtons('панель подробностей ачивки', detailScan);
  const detailClose = plate(detailScan, DETAIL_CLOSE_SIZE);
  check(!!detailClose, 'крестик панели — ' + DETAIL_CLOSE_SIZE + '×' + DETAIL_CLOSE_SIZE);
  if (detailClose) await tap(detailClose.cx, detailClose.cy);
  check(await val('window.__g.monitor.detail === null') === true, 'касание крестика закрыло панель');
  await val('window.__g.lookBack(); 1');
  await sleep(300);
  check(await val('window.__g.canAct()') === true, 'после планшета ввод не застрял');

  // ---------- Панель действий (долг 3) ----------
  await val('window.__g.toggleActions(); 1');
  await sleep(500);
  const actionsScan = await scanParts('window.__g.actionPanel.parts');
  check(await val('window.__g.isActionsOpen') === true, 'панель действий открылась касанием A… то есть методом сцены');
  checkFits('панель действий', actionsScan, 10);
  checkButtons('панель действий', actionsScan);
  const actionsClose = plate(actionsScan, 44);
  check(!!actionsClose, 'у панели действий есть крестик 44×44');
  if (actionsClose) await tap(actionsClose.cx, actionsClose.cy);
  check(await val('window.__g.isActionsOpen') === false && await val('window.__g.canAct()') === true,
    'крестик закрыл панель действий, ввод не застрял');

  // ---------- Экран улучшений (долг 3) ----------
  await val('window.__g.showUpgradeChoice(); 1');
  await sleep(600);
  const upgradeScan = await scanParts('window.__g.upgradeScreen.parts');
  check(await val('window.__g.upgradeScreen.isOpen') === true, 'экран улучшений открыт');
  checkFits('экран улучшений', upgradeScan, 10);
  checkButtons('экран улучшений', upgradeScan);
  // Пока экран открыт, Пробел игру не двигает (обязательный выбор): прокруток не убыло, вращения нет.
  const spinsBeforeUpgrade = await val('window.__g.spinsLeft');
  await pressSpace();
  check((await val('window.__g.spinsLeft')) === spinsBeforeUpgrade && await val('window.__g.isSpinning') === false,
    'пока экран улучшений открыт, Пробел игру не двигает (прокруток ' + spinsBeforeUpgrade + ')');
  await val('window.__g.upgradeScreen.close(); 1');
  await sleep(200);
  check(await val('window.__g.upgradeScreen.isOpen') === false, 'экран улучшений закрыт');
  // Ввод вернулся: Пробел снова крутит.
  await pressSpace();
  await sleep(300);
  const spunAfterUpgrade = (await val('window.__g.isSpinning')) === true || (await val('window.__g.spinsLeft')) === spinsBeforeUpgrade - 1;
  check(spunAfterUpgrade, 'после закрытия экрана улучшений Пробел снова крутит');
  for (let i = 0; i < 40 && await val('window.__g.isSpinning'); i++) await sleep(150);

  // ---------- Выбор автомата и символа (долг 3) ----------
  await val('window.__g.chooseStartMachine(); 1');
  await sleep(500);
  const pickScan = await scanParts('window.__g.machinePick.parts');
  check(await val('window.__g.machinePick.isOpen') === true && await val('window.__g.canAct()') === false,
    'панель выбора автомата открыта и держит ввод');
  checkFits('выбор автомата', pickScan, 8);
  checkButtons('выбор автомата', pickScan);
  await val('window.__g.machinePick.close(); window.__g.isChoosingMachine = false; 1');
  check(await val('window.__g.canAct()') === true, 'выбор автомата закрыт, ввод вернулся');
  await val('window.__g.chooseStartSymbol(); 1');
  await sleep(500);
  const symbolScan = await scanParts('window.__g.symbolPick.parts');
  check(await val('window.__g.symbolPick.isOpen') === true && await val('window.__g.canAct()') === false,
    'панель выбора символа открыта и держит ввод');
  checkFits('выбор символа', symbolScan, 8);
  checkButtons('выбор символа', symbolScan);
  await val('window.__g.symbolPick.close(); window.__g.isChoosingSymbol = false; 1');
  check(await val('window.__g.canAct()') === true, 'выбор символа закрыт, ввод вернулся');

  // ---------- Заставка спасения и подсказка на стекле, смена языка на лету (долги 3 и 6) ----------
  const readSplash = async () => JSON.parse(await val(`(() => {
    const g = window.__g, parts = g.collector.screenSequence;
    const title = parts.find((o) => o.type === 'Text');
    const screen = parts.find((o) => o.type === 'Rectangle');
    const bounds = (o) => { const b = o.getBounds(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    return JSON.stringify({ text: title ? title.text : null, title: title ? bounds(title) : null, screen: screen ? bounds(screen) : null, intro: g.isRescueIntro });
  })()`));
  await val(`(() => { const g = window.__g; g.debt = 1000; g.balance = 0; g.round = 1; g.startRescue(); return 1; })()`);
  await sleep(150);
  const splashEn = await readSplash();
  check(splashEn.text === langText('rescueAlert1').en && splashEn.intro === true,
    'заставка спасения: первая строка «' + splashEn.text + '», ввод закрыт');
  check(!!splashEn.title && !!splashEn.screen && splashEn.title.left >= splashEn.screen.left - 0.5 && splashEn.title.right <= splashEn.screen.right + 0.5
    && splashEn.title.top >= splashEn.screen.top - 0.5 && splashEn.title.bottom <= splashEn.screen.bottom + 0.5
    && splashEn.screen.left >= -0.5 && splashEn.screen.right <= VIEW_WIDTH + 0.5 && splashEn.screen.top >= -0.5 && splashEn.screen.bottom <= VIEW_HEIGHT + 0.5,
    'строка заставки целиком в экране автомата, экран — в виде');
  await val('window.__g.toggleLanguage(); 1');
  await sleep(150);
  const splashRu = await readSplash();
  check(splashRu.text === langText('rescueAlert1').ru && splashRu.intro === true,
    'смена языка на лету перерисовала заставку спасения: «' + splashRu.text + '» (долг 6)');
  for (let i = 0; i < 60 && await val('window.__g.isRescueIntro'); i++) await sleep(100);
  check(await val('window.__g.isRescueIntro') === false, 'заставка спасения погасла, ввод открылся');
  await val('window.__g.showRescueHint(); 1');
  await sleep(300);
  const hintRu = await readNews();
  check(hintRu.text === fillCount(langText('rescueFreezeHint').ru, await val('window.__g.rescueSpinsLeft')),
    'подсказка спасения на стекле: «' + hintRu.text + '»');
  check(newsInside(hintRu), 'подсказка помещается в полосу стекла');
  await val('window.__g.toggleLanguage(); 1');
  await sleep(300);
  const hintEn = await readNews();
  check(hintEn.text === fillCount(langText('rescueFreezeHint').en, await val('window.__g.rescueSpinsLeft')),
    'смена языка перерисовала подсказку на стекле: «' + hintEn.text + '» (долг 6)');
  await shot('p-rescue-hint.png');
  await val('window.__g.screen.clearNews(); window.__g.closeRescue(); 1');
  await sleep(300);
  check(await val('window.__g.canAct()') === true, 'после спасения ввод не застрял');

  // ---------- Телефон стоит: раскладка тех же экранов на 390×844 (долг 3) ----------
  // Стоя игра нарочно не нажимается: поверх тёмный экран «поверни телефон» (rotateHint). Поэтому здесь проверяем
  // раскладку, а нажатия — после возврата боком: так проверка не делает вид, что стоя можно играть.
  await phone(390, 844, 'portraitPrimary');
  await sleep(1200);
  check(await val(`window.__g.children.list.some((o) => o.text === '📱' && o.visible)`), 'стоя: «поверни телефон» снова виден');
  await val('window.__g.toggleActions(); 1');
  await sleep(500);
  const actionsUp = await scanParts('window.__g.actionPanel.parts');
  checkFits('стоя: панель действий', actionsUp, 10);
  checkButtons('стоя: панель действий', actionsUp);
  const closeUp = plate(actionsUp, 44);
  if (closeUp) await tap(closeUp.cx, closeUp.cy);
  check(await val('window.__g.isActionsOpen') === true, 'стоя: под «поверни телефон» касание крестика панель не закрывает (так задумано)');
  await val('window.__g.closeActions(); 1');
  await val('window.__g.isAtMonitor = true; window.__g.monitor.open(); window.__g.monitor.showTab("achievements"); 1');
  await sleep(800);
  const tabletUp = await scanParts('[window.__g.monitor.overlay, window.__g.monitor.content]');
  checkFits('стоя: планшет «Ачивки»', tabletUp, 12);
  checkButtons('стоя: планшет «Ачивки»', tabletUp);
  await val('window.__g.lookBack(); 1');
  await sleep(300);
  await val('window.__g.balance = 100000; window.__g.tickets = 5; window.__g.openShop(); 1');
  await sleep(2600);
  const shopUp = await scanParts('[window.__g.shop.layer]', 0);
  checkFits('стоя: магазин', shopUp, 20);
  await shot('p-portrait-screens.png');

  // ---------- Обратно боком: те же панели закрываются касанием, ввод не застревает ----------
  await phone(844, 390, 'landscapePrimary');
  await sleep(1200);
  check(await val(`window.__g.children.list.some((o) => o.text === '📱' && o.visible)`) === false, 'боком: «поверни телефон» погас, ввод снова живой');
  const exitBack = JSON.parse(await val(`(() => {
    const g = window.__g, z = g.shop.layer.list.filter((o) => o.type === 'Zone' && o.input && o.input.enabled)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!z) return JSON.stringify({ none: true });
    const b = z.getBounds(); return JSON.stringify({ cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
  })()`));
  if (exitBack.cx !== undefined) await tap(exitBack.cx, exitBack.cy);
  check(await val('window.__g.isShopping') === false && await val('window.__g.canAct()') === true,
    'боком: выход из магазина нажимается, ввод не застревает');
  await val('window.__g.isAtMonitor = true; window.__g.monitor.open(); window.__g.monitor.showTab("achievements"); 1');
  await sleep(800);
  const cardBack = JSON.parse(await val(`(() => {
    const o = window.__g.monitor.content.list.find((part) => part.type === 'Rectangle' && part.input && Math.abs(part.width - ${CARD_WIDTH}) < 0.5 && Math.abs(part.height - ${ROW_HEIGHT}) < 0.5);
    if (!o) return JSON.stringify({ none: true });
    const b = o.getBounds(); return JSON.stringify({ cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
  })()`));
  if (cardBack.cx !== undefined) await tap(cardBack.cx, cardBack.cy);
  const detailBack = await scanParts('[window.__g.monitor.detail]');
  checkFits('боком: панель подробностей ачивки', detailBack, 6);
  checkButtons('боком: панель подробностей ачивки', detailBack);
  const crossBack = plate(detailBack, DETAIL_CLOSE_SIZE);
  if (crossBack) await tap(crossBack.cx, crossBack.cy);
  check(await val('window.__g.monitor.detail === null') === true, 'боком: крестик закрыл панель подробностей');
  await val('window.__g.lookBack(); 1');
  await sleep(300);
  await val('window.__g.toggleActions(); 1');
  await sleep(500);
  const actionsBack = await scanParts('window.__g.actionPanel.parts');
  const closeBack = plate(actionsBack, 44);
  if (closeBack) await tap(closeBack.cx, closeBack.cy);
  check(await val('window.__g.isActionsOpen') === false && await val('window.__g.canAct()') === true,
    'боком: панель действий закрывается крестиком, ввод не застревает');

  // ---------- Банкомат без значка фишки (долг 3), последним: он меняет состояние раунда ----------
  await val('window.__g.collector.atm.hide(); 1');
  await sleep(250);
  await val('window.__g.balance = 5000; window.__g.debt = 30; window.__g.callCollector(false); 1');
  for (let i = 0; i < 40 && !(await val('window.__g.collector.atm.isOut')); i++) await sleep(150);
  await sleep(250);
  const atmState = JSON.parse(await val(`(() => {
    const g = window.__g, a = g.collector.atm, box = a.box, d = a.demand;
    const bounds = (o) => { const b = o.getBounds(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const frames = box.list.filter((o) => o.type === 'Rectangle' && Math.abs(o.width - ${SCREEN_WIDTH}) < 0.5 && Math.abs(o.height - ${SCREEN_HEIGHT}) < 0.5);
    const screen = frames[0] ? bounds(frames[0]) : null;
    const chips = [];
    const walk = (list) => { for (const o of list) { if (Array.isArray(o.list)) walk(o.list); if (o.texture && o.texture.key === ${JSON.stringify(CHIP_TEXTURE)} && o.visible !== false) chips.push(bounds(o)); } };
    walk(g.children.list);
    const onScreen = (r) => !!screen && r.right > screen.left && r.left < screen.right && r.bottom > screen.top && r.top < screen.bottom;
    let probe = -1;
    if (screen) {
      const p = g.add.image((screen.left + screen.right) / 2, (screen.top + screen.bottom) / 2, ${JSON.stringify(CHIP_TEXTURE)}).setDepth(9999);
      probe = chips.concat([bounds(p)]).filter(onScreen).length;
      p.destroy();
    }
    const demand = bounds(d);
    return JSON.stringify({
      text: d.text, out: a.isOut, frames: frames.length, probe,
      chipsOnScreen: chips.filter(onScreen).length,
      screen, demand,
    });
  })()`));
  check(atmState.out === true && atmState.text === '30', 'банкомат на телефоне: выехал, на экране долг 30');
  check(atmState.frames === 1, 'в корпусе ровно одна рамка экрана ' + SCREEN_WIDTH + '×' + SCREEN_HEIGHT + ' (нашлось ' + atmState.frames + ')');
  check(!!atmState.demand && !!atmState.screen
    && Math.abs((atmState.demand.left + atmState.demand.right) / 2 - (atmState.screen.left + atmState.screen.right) / 2) <= 1
    && Math.abs((atmState.demand.top + atmState.demand.bottom) / 2 - (atmState.screen.top + atmState.screen.bottom) / 2) <= 1,
    'число долга по центру экрана банкомата');
  check(!!atmState.screen && atmState.screen.left >= 0 && atmState.screen.right <= VIEW_WIDTH && atmState.screen.top >= 0 && atmState.screen.bottom <= VIEW_HEIGHT,
    'экран банкомата целиком в виде');
  check(atmState.chipsOnScreen === 0 && atmState.probe === 1,
    'на экране ни одной фишки, а подложенная находится (контроль ' + atmState.probe + ')');
  await shot('p-atm-debt.png');

  console.log(`\nитог: ${ok} из ${all}`);

} finally {
  chrome.kill(); srv.kill();
}

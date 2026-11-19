/**
 * Проверка планшета на стене (DONTLIKE 19.11, «Доработка» п.2 и «Ачивки») в headless Chrome.
 * Запуск: node .claude/skills/next-step/tablet-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимки и профиль Chrome — в scratchpad.
 * Порт 8771 и Chrome на 9337 — свои; сценарии atm-who-check (8770/9337) и shot (8766/9333) не трогаем.
 *
 * Что проверяет:
 *  - все пять вкладок открываются и на каждой есть содержимое;
 *  - карточки ачивок кликабельны всей площадью, клик не листает страницу;
 *  - полученная ачивка открывает панель с названием и полным описанием из lang.ts (сверяем с ключами achNoSmoke/achNoSmokeWhat);
 *  - неполученная — ровно «❓», «???», «Условие скрыто» и «НЕ ПОЛУЧЕНО» (плюс «✕» крестика), набор сверяется как
 *    множество, без «содержит»; ни одного настоящего названия, описания или значка из ACHIEVEMENTS в панели нет;
 *  - закрытие: Esc (планшет остаётся на вкладке «Ачивки»), ✕ в углу панели, клик мимо панели;
 *  - счётчик «‹ 1/4 ›» в нижнем правом углу листает страницы, после возврата карточки на месте;
 *  - то же на английском: EARNED / NOT EARNED и Condition hidden.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node tablet-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const srv = spawn('python3', ['-m', 'http.server', '8771', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9337', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-tablet', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Значения ключей lang.ts, с которыми сверяем экран (ключи: achNoSmoke, achNoSmokeWhat, achConditionHidden, achEarned, achNotEarned).
const RU = { name: 'Не кури', what: 'Впервые включил сигарету', hidden: 'Условие скрыто', earned: 'ПОЛУЧЕНО', notEarned: 'НЕ ПОЛУЧЕНО' };
const EN = { name: "Don't smoke", what: 'You used a cigarette for the first time', hidden: 'Condition hidden', earned: 'EARNED', notEarned: 'NOT EARNED' };
/**
 * Настоящие названия, описания и значки всех ачивок — из исходников: в браузере модуль ACHIEVEMENTS не виден
 * (window.__g — только сцена), а скрытая карточка и панель их не выдают. Сверяем панель с этим списком: если хоть
 * одна настоящая строка просочилась, проверка падает. Не разобрали исходники — падаем сразу, а не молча пропускаем.
 */
const SRC = (rel) => readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');
const langPairs = new Map();
for (const m of SRC('src/game/lang.ts').matchAll(/^\s*(ach[A-Za-z]+): \{ ru: (['"])(.*?)\2, en: (['"])(.*?)\4 \},?$/gm)) {
  langPairs.set(m[1], { ru: m[3], en: m[5] });
}
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
  /** Всё, что видно на планшете: содержимое вкладки, карточки, страницы, открытая панель. */
  const tablet = async () => JSON.parse(await val(`(() => {
    const m = window.__g.monitor, list = m.content.list;
    const cards = list.filter((o) => o.type === 'Rectangle' && o.input && o.width > 400);
    const info = cards.map((c) => {
      const b = c.getBounds();
      const texts = list.filter((o) => o.type === 'Text' && o.getBounds().centerX > b.x && o.getBounds().right < b.right && o.getBounds().centerY > b.y && o.getBounds().bottom < b.bottom + 4);
      const title = texts.find((t) => t.style.fontSize === '21px');
      const note = texts.find((t) => t.style.fontSize === '16px');
      return { x: c.x, y: c.y, title: title ? title.text : null, note: note ? note.text : null };
    });
    const counter = list.find((o) => o.type === 'Text' && o.text && o.text.includes('/'));
    return JSON.stringify({
      tab: m.tab, open: m.isOpen, page: m.page, pages: m.pages, items: list.length,
      cards: info, detailOpen: m.detail !== null,
      counter: counter ? { text: counter.text, x: counter.getBounds().centerX, y: counter.getBounds().centerY } : null,
    });
  })()`));
  /** Надписи открытой панели подробностей (и точка её крестика). */
  const detail = async () => JSON.parse(await val(`(() => {
    const m = window.__g.monitor, d = m.detail;
    if (!d) return JSON.stringify({ open: false, texts: [] });
    const texts = d.list.filter((o) => o.type === 'Text').map((o) => o.text);
    const rects = d.list.filter((o) => o.type === 'Rectangle');
    const close = rects[rects.length - 1];
    return JSON.stringify({ open: true, texts, close: { x: d.x + close.x, y: d.y + close.y } });
  })()`));
  const openTab = async (tab) => { await val(`window.__g.monitor.page = 0; window.__g.monitor.showTab('${tab}'); 1`); await sleep(650); };
  /**
   * Скрытая ачивка не выдаёт спойлер: в панели ровно «❓», «???», «Условие скрыто» и статус (плюс «✕» крестика) —
   * сверяем как множество, а не «содержит»; и ни одной настоящей строки ачивок из исходников в панели нет.
   */
  const checkMaskedPanel = (texts, words, tag) => {
    const masked = new Set(['❓', '???', words.hidden, words.notEarned]);
    if (texts.includes('✕')) masked.add('✕');
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

  // Клик по неполученной: в панели ровно «❓», «???», «Условие скрыто», статус и «✕» крестика — больше ничего.
  await click(hidden.x, hidden.y);
  d = await detail();
  check(d.open === true, 'клик по неполученной карточке открыл панель');
  checkMaskedPanel(d.texts, RU, '');
  await shot('after-ach-hidden.png');

  // Крестик в углу панели.
  await click(d.close.x, d.close.y);
  d = await detail();
  check(d.open === false, 'крестик закрыл панель');
  st = await tablet();
  check(st.open === true && st.tab === 'achievements', 'после крестика планшет на «Ачивках»');

  // Клик мимо панели (по затемнению) — тоже только закрывает панель.
  await click(hidden.x, hidden.y);
  d = await detail();
  check(d.open === true, 'панель открыта снова');
  await click(120, 80);
  d = await detail();
  st = await tablet();
  check(d.open === false && st.open === true && st.tab === 'achievements', 'клик мимо панели закрыл только её');

  // Счётчик в нижнем правом углу: вторая страница, другие карточки; назад — снова первая.
  await click(st.counter.x, st.counter.y);
  st = await tablet();
  check(st.page === 1 && st.counter && st.counter.text === '‹ 2/4 ›', 'счётчик перелистнул на «' + (st.counter && st.counter.text) + '»');
  check(st.cards.length === 14 && st.cards[0].title !== obtained.title, 'на второй странице другие карточки');
  await shot('after-ach-page2.png');
  await click(st.counter.x, st.counter.y);
  st = await tablet();
  check(st.page === 2 && st.counter && st.counter.text === '‹ 3/4 ›', 'счётчик листает дальше: «' + (st.counter && st.counter.text) + '»');
  await click(st.counter.x, st.counter.y);
  st = await tablet();
  check(st.page === 3 && st.counter && st.counter.text === '‹ 4/4 ›', 'последняя страница: «' + (st.counter && st.counter.text) + '»');
  await click(st.counter.x, st.counter.y);
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

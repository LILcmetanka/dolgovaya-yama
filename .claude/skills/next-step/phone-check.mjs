/**
 * Проверка телефона (и английских текстов) в headless Chrome с телефонной эмуляцией.
 * Запуск: node .claude/skills/next-step/phone-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком window.__g
 * (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимки и профиль Chrome — в scratchpad.
 *
 * Что проверяет: холст 16:9 на всё окно боком (844×390) и стоя (390×844), определитель телефона
 * (hover: none + pointer: coarse), значки ⚙ и «во весь экран» только на телефоне, «поверни телефон»,
 * касания (⚙ — пауза, замах рычага, переключение языка, долгое нажатие — подсказка) и что под тёмным
 * экраном «поверни телефон» игра не нажимается. Порт 8767 — свой, dev-сервер на 5173 не трогаем.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const SP = process.argv[2];
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

  // ---------- Телефон боком ----------
  await phone(844, 390, 'landscapePrimary');
  await send('Page.navigate', { url: 'http://127.0.0.1:8767/' });
  await sleep(2500);
  // Тьма первого забега закрывает рычаг и плашки: отмечаем обучение пройденным, как после первого забега.
  await val(`localStorage.setItem('dolgovaya-yama-progress', JSON.stringify({ tutorialDone: true, patterns: [], achievements: [] }))`);
  await send('Page.reload');
  await sleep(4000);

  check(await val('typeof window.__g') === 'object', 'hook: сцена в window.__g');
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

  // Замах рычага касанием: держим — шкала растёт, отпускаем — прокрутка (плашек режимов больше нет, DONTLIKE п. 8).
  for (let i = 0; i < 20 && !(await val('window.__g.canAct()')); i++) await sleep(300);
  const ball = JSON.parse(await val(`(() => {
    const o = window.__g.panel.leverBall, b = o.getBounds();
    return JSON.stringify({ x: o.x, y: o.y, top: b.top, bottom: b.bottom, w: b.width, visible: o.visible, interactive: !!o.input });
  })()`));
  console.log('рычаг:', JSON.stringify(ball), 'canAct:', await val('window.__g.canAct()'));
  const lever = await pagePoint(ball.x, ball.y);
  const spinsHeld = await val('window.__g.spinsLeft');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lever.x, y: lever.y, radiusX: 6, radiusY: 6, force: 1, id: 1 }] });
  await sleep(600);
  const charging = await val('window.__g.isCharging');
  await shot('p-charge.png');
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);
  const spinsReleased = await val('window.__g.spinsLeft');
  check(charging === true, 'касание рычага держит замах (шкала растёт)');
  check(spinsReleased === spinsHeld - 1, `отпустил палец — прокрутка с замахом: прокруток ${spinsHeld} → ${spinsReleased}`);
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

  console.log(`\nитог: ${ok} из ${all}`);
} finally {
  chrome.kill(); srv.kill();
}

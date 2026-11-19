/**
 * Проверка рычага (шаг 8): одно нажатие — одна прокрутка. Замаха, шкалы заряда и удержания больше нет.
 * Запуск: node .claude/skills/next-step/lever-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (bash .claude/skills/next-step/hookbuild.sh <scratchpad> .).
 * Снимки шага (1280×720) — в .cache-shots: step8-tutorial.png, step8-after-click.png, step8-panel.png;
 * рабочие снимки и профиль Chrome — в scratchpad (каждый запуск новый профиль: пустой localStorage).
 * Порт 8773 — свой: dev-сервер 5173 и порты 8766/8767/8770/8771/8772 из других сценариев не трогаем.
 * Отладка Chrome — 9341 (9339 занят last-chance-check.mjs).
 *
 * Координаты рычага — из кода, а не из чисел в сценарии: точка клика — середина шарика в живой сцене
 * (panel.leverBall), а что она лежит в пятне света тьмы — сверяем с LEVER_GLOW и LEVER_MOUNT из src/game/layout.ts
 * (грузятся через ts-resolve.mjs, как у симуляторов).
 *
 * Что проверяет:
 *  1) чистый профиль: тьма первого забега активна, рычаг стоит в её пятне света;
 *  2) шкалы замаха на панели нет: полей chargeFrame/Track/Fill/Text и методов showCharge/setChargeVisible
 *     не существует, раскладка CHARGE_ANCHOR удалена, в тексте src/game/lang.ts нет ключей chargeTitle/chargeWhat;
 *  3) клик мышью по рычагу сразу даёт прокрутку: счётчик прокруток уменьшился ровно на 1, без удержания;
 *  4) повторный клик по рычагу, пока сетка крутится, второй прокрутки не даёт;
 *  5) Пробел — тоже одна прокрутка на одно нажатие;
 *  6) прокрутки раунда доигрываются до 0, приходит Коллектор, тьма гаснет;
 *  7) перезагрузка: обучение пройдено, тьмы нет.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симуляторов: Node находит './rules' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node lever-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = SP + '/shots-lever';
mkdirSync(SHOTS, { recursive: true });
const STEP_SHOTS = fileURLToPath(new URL('../../../.cache-shots/', import.meta.url)); // снимки шага — рядом с игрой
mkdirSync(STEP_SHOTS, { recursive: true });
// Раскладка и тексты — из игры: где крепление рычага, где пятно света тьмы, есть ли ключи шкалы.
const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const LAYOUT = await import(SRC + 'layout.ts');
const LANG_SRC = readFileSync(SRC + 'lang.ts', 'utf8'); // текст модуля: TEXTS не экспортируется, проверяем строку файла
const { LEVER_GLOW, LEVER_MOUNT } = LAYOUT;
/** Точка в прямоугольнике раскладки (x, y — середина, width/height — размеры). */
const inBox = (box, x, y) => Math.abs(x - box.x) <= box.width / 2 && Math.abs(y - box.y) <= box.height / 2;
const PROFILE = SP + '/prof-lever-' + Date.now(); // свежий профиль: вчерашний localStorage тьму бы погасил
const srv = spawn('python3', ['-m', 'http.server', '8773', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9341', '--window-size=1280,720', '--user-data-dir=' + PROFILE, '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9341/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9341 занят?');
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
  /** Снимок: рабочий — в scratchpad, снимок шага — в .cache-shots (оба 1280×720). */
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const data = Buffer.from(r.result.data, 'base64');
    writeFileSync(SHOTS + '/' + name, data);
    if (name in STEP_FILES) writeFileSync(STEP_SHOTS + STEP_FILES[name], data);
  };
  const STEP_FILES = {  // что из рабочих снимков нужно шагу — под другими именами
    'step8-tutorial.png': 'step8-tutorial.png',
    'step8-after-click.png': 'step8-after-click.png',
    'step8-panel.png': 'step8-panel.png',
  };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };

  /** Состояние сцены: тьма, прокрутка, лампочки, панель. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g, p = g.panel, r = g.reveal;
    return JSON.stringify({
      reveal: r ? { isActive: r.isActive, isNoteOpen: !!r.isNoteOpen } : null,
      hasChargeBar: ['chargeFrame', 'chargeTrack', 'chargeFill', 'chargeText'].some((k) => p[k] !== undefined)
        || ['showCharge', 'setChargeVisible'].some((k) => typeof p[k] === 'function'),
      isSpinning: g.isSpinning, isRerolling: g.isRerolling, isDealing: g.isDealing, isShopping: g.isShopping,
      spinsLeft: g.spinsLeft, spinsThisRun: g.spinsThisRun, freeSpins: g.freeSpins,
      isAwaitingPayment: g.isAwaitingPayment, isLastChance: g.isLastChance, isRoundOver: g.isRoundOver,
      isGameOver: g.isGameOver, isPaused: g.isPaused,
      balance: g.balance, pot: g.pot, debt: g.debt, progress: localStorage.getItem('dolgovaya-yama-progress'),
    });
  })()`)) ?? '{}');

  /** Середина шарика рычага в координатах раскладки и в координатах страницы (там же её ждёт мышь). */
  const leverAim = async () => JSON.parse(await val(`(() => {
    const g = window.__g, cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    const b = g.panel.leverBall.getBounds();
    return JSON.stringify({
      x: b.centerX, y: b.centerY,
      page: { x: r.left + (b.centerX - cam.scrollX) * cam.zoom * k, y: r.top + (b.centerY - cam.scrollY) * cam.zoom * k },
    });
  })()`));

  /** Клик мышью по шарику рычага: нажали и отпустили сразу — рычаг крутит с одного нажатия, держать нечего. */
  const clickLever = async () => {
    const aim = await leverAim();
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: aim.page.x, y: aim.page.y });
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: aim.page.x, y: aim.page.y, button: 'left', clickCount: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: aim.page.x, y: aim.page.y, button: 'left', clickCount: 1 });
    await sleep(120);
    return aim;
  };
  const pressSpace = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(150);
  };
  const pressEnter = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await sleep(350);
  };
  /** Дождаться, пока сетка встанет; окно сделок Дилера отклоняем Enter, чтобы оно не держало ввод. */
  const waitIdle = async (limit = 12000) => {
    const t0 = Date.now();
    let s = await state();
    while (Date.now() - t0 < limit) {
      if (s.isDealing) { await pressEnter(); s = await state(); continue; }
      if (!s.isSpinning && !s.isRerolling && !s.isDealing) return s;
      await sleep(120);
      s = await state();
    }
    return s;
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8773/' });
  await sleep(3500);
  // Язык — из localStorage, как у last-chance-check: headless Chrome англоязычный, а игра и записка пусть будут русские.
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru'); 1`);
  await send('Page.reload');
  await sleep(4000);

  // ---------- 1. Чистый профиль: тьма активна, шкалы нет ----------
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  const s0 = await state();
  check(s0.progress === null, 'профиль чистый: в localStorage нет прогресса (тьма точно первая) — ' + JSON.stringify(s0.progress));
  check(s0.reveal !== null && s0.reveal.isActive === true, 'тьма первого забега активна (reveal.isActive)');
  check(s0.hasChargeBar === false, 'шкалы замаха на панели нет: chargeFrame/Track/Fill/Text и showCharge/setChargeVisible отсутствуют');
  check(LAYOUT.CHARGE_ANCHOR === undefined, 'раскладка CHARGE_ANCHOR удалена (шкалу больше некуда ставить)');
  check(!LANG_SRC.includes('chargeTitle') && !LANG_SRC.includes('chargeWhat'), 'ключей chargeTitle/chargeWhat в тексте src/game/lang.ts нет');
  check(s0.isSpinning === false, 'сетка стоит, замаха нет — крутить можно с одного нажатия');
  const aim0 = await leverAim();
  check(inBox(LEVER_GLOW, aim0.x, aim0.y), `шарик рычага в пятне света: (${Math.round(aim0.x)}, ${Math.round(aim0.y)}) внутри LEVER_GLOW ${JSON.stringify(LEVER_GLOW)}`);
  console.log(`     крепление LEVER_MOUNT ${JSON.stringify(LEVER_MOUNT)}, страница: ${JSON.stringify({ x: Math.round(aim0.page.x), y: Math.round(aim0.page.y) })}`);
  await shot('step8-tutorial.png');

  // ---------- 2. Клик по рычагу — сразу прокрутка ----------
  const spinsBeforeClick = s0.spinsLeft;
  await clickLever();
  const click1 = await state();
  check(click1.isSpinning === true, 'клик по рычагу сразу начал прокрутку (isSpinning true)');
  check(click1.spinsLeft === spinsBeforeClick - 1, `одно нажатие — ровно одна прокрутка: spinsLeft ${spinsBeforeClick} → ${click1.spinsLeft}`);
  await shot('step8-after-click.png');
  // Повторный клик, пока сетка крутится: второй прокрутки быть не должно.
  await clickLever();
  const click2 = await state();
  check(click2.spinsLeft === click1.spinsLeft, `повторный клик во время прокрутки второй не даёт: spinsLeft ${click1.spinsLeft} → ${click2.spinsLeft}`);
  const afterSpin1 = await waitIdle();
  check(afterSpin1.spinsLeft === spinsBeforeClick - 1, `прокрутка дошла до итога: spinsLeft ${afterSpin1.spinsLeft}`);

  // ---------- 3. Пробел — тоже одна прокрутка на одно нажатие ----------
  const spinsBeforeKey = afterSpin1.spinsLeft;
  await pressSpace();
  const key1 = await state();
  check(key1.isSpinning === true && key1.spinsLeft === spinsBeforeKey - 1,
    `Пробел дал одну прокрутку: isSpinning ${key1.isSpinning}, spinsLeft ${spinsBeforeKey} → ${key1.spinsLeft}`);
  const afterSpin2 = await waitIdle();

  // ---------- 4. Тьма гаснет (обучение пройдено), панель целиком на виду ----------
  await val('window.__g.finishTutorial(); 1');
  await sleep(1200);
  const naked = await state();
  check(naked.reveal === null || naked.reveal.isActive === false, 'тьма погасла после обучения (reveal.isActive false)');
  await shot('step8-panel.png');

  // ---------- 5. Прокрутки раунда до 0 → Коллектор ----------
  let s = afterSpin2;
  for (let guard = 0; guard < 40; guard++) {
    if (s.spinsLeft === 0 || s.isRoundOver || s.isAwaitingPayment || s.isLastChance || s.isGameOver) break;
    await pressSpace();
    s = await waitIdle();
    if (s.isGameOver) break;
  }
  console.log(`     прокруток осталось: ${s.spinsLeft}, кон: ${s.pot}, банк: ${s.balance}, долг: ${s.debt}`);
  check(s.spinsLeft === 0 || s.isRoundOver || s.isAwaitingPayment || s.isLastChance,
    'прокрутки раунда доиграны до 0 (spinsLeft ' + s.spinsLeft + ')');
  const collector = await (async () => {
    const t0 = Date.now();
    let cur = s;
    let atmOut = false;
    while (Date.now() - t0 < 15000) {
      cur = await state();
      atmOut = await val('window.__g.collector ? window.__g.collector.isAtmOut : false');
      if (atmOut || cur.isAwaitingPayment || cur.isLastChance) break;
      await sleep(150);
    }
    return { ...cur, atmOut };
  })();
  check(collector.atmOut === true || collector.isAwaitingPayment === true || collector.isLastChance === true,
    'пришёл Коллектор (банкомат выехал или ждём оплату)');
  check(collector.hasChargeBar === false, 'шкала не вернулась вместе с Коллектором — её больше нет вовсе');
  check(collector.reveal === null || collector.reveal.isActive === false, 'тьмы на экране больше нет');

  // ---------- 6. Перезагрузка: обучение пройдено, тьмы нет ----------
  await val('window.__marker = "before-reload"; 1');
  await send('Page.reload');
  await sleep(4000);
  check((await val('window.__marker')) === undefined, 'страница действительно перезагрузилась (метка пропала)');
  check((await val('typeof window.__g')) === 'object', 'после перезагрузки сцена снова в window.__g');
  const r0 = await state();
  check(r0.reveal === null, 'тьмы после перезагрузки нет (reveal = null), сейчас: ' + JSON.stringify(r0.reveal));
  check(!!r0.progress, 'прогресс записан (обучение пройдено): ' + JSON.stringify(r0.progress));
  check(r0.hasChargeBar === false, 'после перезагрузки шкалы тоже нет');

  console.log(`итог ${ok} из ${all}`);
  console.log('снимки шага: ' + STEP_SHOTS + 'step8-tutorial.png, step8-after-click.png, step8-panel.png');
  console.log('рабочие снимки: ' + SHOTS);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

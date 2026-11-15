/**
 * Проверка правки «рычаг работает в тьме первого забега» (GameScene.beginCharge) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/lever-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в /tmp/opencode/leverfix, профиль Chrome — свежий в scratchpad (каждый запуск новый: пустой localStorage).
 * Порт 8773 — свой: dev-сервер 5173 и порты 8766/8767/8770/8771/8772 из других сценариев не трогаем.
 * Отладка Chrome — 9341 (9339 занят last-chance-check.mjs).
 *
 * Координаты рычага — из кода, а не из чисел в сценарии: точка клика — середина шарика в живой сцене
 * (panel.leverBall), а что она лежит в пятне света тьмы — сверяем с LEVER_GLOW и LEVER_MOUNT из src/game/layout.ts
 * (грузятся через ts-resolve.mjs, как у симуляторов).
 *
 * Что проверяет:
 *  1) чистый профиль: тьма первого забега активна (reveal.isActive === true), шкала замаха скрыта;
 *  2) клик мышью по рычагу в пятне света + отпускание: замах начался (isCharging был true) и прошла прокрутка;
 *  3) Пробел (keydown/keyup) даёт прокрутку так же;
 *  4) третья прокрутка — из тьмы проступает записка (reveal.isNoteOpen === true);
 *  5) прокрутки раунда доиграны до 0: пришёл Коллектор, тьма погасла (reveal.isActive === false),
 *     шкала замаха снова видна;
 *  6) перезагрузка страницы: тьмы больше нет (reveal отсутствует);
 *  7) снимки dark-before / dark-after-spin / note / collector — их смотрит человек.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симуляторов: Node находит './rules' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node lever-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = '/tmp/opencode/leverfix';
mkdirSync(SHOTS, { recursive: true });
// Раскладка — из игры: где крепление рычага и где пятно света тьмы. Ни одного числа в сценарии.
const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const LAYOUT = await import(SRC + 'layout.ts');
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
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SHOTS + '/' + name, Buffer.from(r.result.data, 'base64')); };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };

  /** Состояние сцены: тьма, шкала, замах, прокрутка, лампочки. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g, p = g.panel, r = g.reveal;
    return JSON.stringify({
      reveal: r ? { isActive: r.isActive, isNoteOpen: !!r.isNoteOpen } : null,
      chargeVisible: p.chargeFrame.visible && p.chargeTrack.visible && p.chargeFill.visible && p.chargeText.visible,
      chargeText: p.chargeText.text,
      isCharging: g.isCharging, chargeSource: g.chargeSource, isSpinning: g.isSpinning, isRerolling: g.isRerolling,
      spinsLeft: g.spinsLeft, spinsThisRun: g.spinsThisRun, freeSpins: g.freeSpins,
      isDealing: g.isDealing, isAwaitingPayment: g.isAwaitingPayment, isLastChance: g.isLastChance,
      isRoundOver: g.isRoundOver, isGameOver: g.isGameOver, isPaused: g.isPaused, isShopping: g.isShopping,
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
      rod: { x: g.panel.leverRod.getBounds().centerX, top: g.panel.leverRod.getBounds().top, bottom: g.panel.leverRod.getBounds().bottom },
    });
  })()`));

  /** Держим рычаг мышью hold мс: замах должен начаться, а на отпускании — пойти прокрутка. */
  const holdLever = async (hold = 420) => {
    const aim = await leverAim();
    const before = await state();
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: aim.page.x, y: aim.page.y });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: aim.page.x, y: aim.page.y, button: 'left', clickCount: 1 });
    await sleep(160);
    const held = await state(); // isCharging ловим, пока держим: после отпускания он уже false
    await sleep(hold);
    const grown = await state();
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: aim.page.x, y: aim.page.y, button: 'left', clickCount: 1 });
    await sleep(220);
    const after = await state();
    return { aim, before, held, grown, after };
  };

  /** Пробел: keydown/keyup — тот же замах и прокрутка. */
  const pressSpace = async (hold = 320) => {
    const before = await state();
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
    await sleep(160);
    const held = await state();
    await sleep(hold);
    const grown = await state();
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(220);
    const after = await state();
    return { before, held, grown, after };
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
  /** Прокрутка пробелом + ожидание итога: так доигрываем раунд до нуля. */
  const spinBySpace = async () => {
    const r = await pressSpace();
    const s = await waitIdle();
    return { ...r, done: s };
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8773/' });
  await sleep(3500);
  // Язык — из localStorage, как у last-chance-check: headless Chrome англоязычный, а игра и записка пусть будут русские.
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru'); 1`);
  await send('Page.reload');
  await sleep(4000);

  // ---------- 1. Чистый профиль: тьма активна, шкала спрятана ----------
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  const s0 = await state();
  check(s0.progress === null, 'профиль чистый: в localStorage нет прогресса (тьма точно первая) — ' + JSON.stringify(s0.progress));
  check(s0.reveal !== null && s0.reveal.isActive === true, 'тьма первого забега активна (reveal.isActive)');
  check(s0.reveal !== null && s0.reveal.isNoteOpen === false, 'записки в тьме ещё нет (isNoteOpen false)');
  check(s0.chargeVisible === false, 'шкала замаха скрыта тьмой (chargeFrame/Track/Fill/Text не видны)');
  check(s0.isCharging === false && s0.isSpinning === false, 'замах не начат, сетка стоит');
  const aim0 = await leverAim();
  check(inBox(LEVER_GLOW, aim0.x, aim0.y), `шарик рычага в пятне света: (${Math.round(aim0.x)}, ${Math.round(aim0.y)}) внутри LEVER_GLOW ${JSON.stringify(LEVER_GLOW)}`);
  console.log(`     крепление LEVER_MOUNT ${JSON.stringify(LEVER_MOUNT)}, страница: ${JSON.stringify({ x: Math.round(aim0.page.x), y: Math.round(aim0.page.y) })}`);
  await shot('dark-before.png');

  // ---------- 2. Клик мышью по рычагу в тьме ----------
  const spinsBeforeClick = s0.spinsLeft;
  const click1 = await holdLever();
  check(click1.held.isCharging === true, 'клик по рычагу в тьме начал замах (isCharging true, пока держим)');
  check(click1.held.chargeSource === 'lever', 'замах начат именно мышью (chargeSource = lever): ' + JSON.stringify(click1.held.chargeSource));
  check(click1.grown.chargeText !== '0%', 'шкала всё-таки считает заряд, пока держим: ' + JSON.stringify(click1.grown.chargeText));
  check(click1.after.isSpinning === true || click1.after.spinsLeft < spinsBeforeClick,
    `отпускание дало прокрутку (isSpinning ${click1.after.isSpinning}, spinsLeft ${spinsBeforeClick} → ${click1.after.spinsLeft})`);
  await shot('dark-after-spin.png');
  const afterSpin1 = await waitIdle();
  check(afterSpin1.spinsLeft === spinsBeforeClick - 1, `прокрутка дошла до итога: spinsLeft ${afterSpin1.spinsLeft}`);

  // ---------- 3. Пробел даёт прокрутку так же ----------
  const spinsBeforeKey = afterSpin1.spinsLeft;
  const key1 = await pressSpace();
  check(key1.held.isCharging === true, 'Пробел в тьме начал замах (isCharging true)');
  check(key1.held.chargeSource === 'key', 'замах начат клавишей (chargeSource = key): ' + JSON.stringify(key1.held.chargeSource));
  check(key1.after.isSpinning === true || key1.after.spinsLeft < spinsBeforeKey,
    `Пробел дал прокрутку (isSpinning ${key1.after.isSpinning}, spinsLeft ${spinsBeforeKey} → ${key1.after.spinsLeft})`);
  const afterSpin2 = await waitIdle();
  check(afterSpin2.spinsLeft === spinsBeforeKey - 1, `вторая прокрутка дошла до итога: spinsLeft ${afterSpin2.spinsLeft}`);

  // ---------- 4. Третья прокрутка — из тьмы проступает записка ----------
  const click3 = await holdLever();
  check(click3.after.isSpinning === true || click3.after.spinsLeft < afterSpin2.spinsLeft, 'третья прокрутка пошла (мышью)');
  const afterSpin3 = await waitIdle();
  check(afterSpin3.spinsThisRun >= 3, 'прокруток в забеге уже ' + afterSpin3.spinsThisRun);
  check(afterSpin3.reveal !== null && afterSpin3.reveal.isActive === true, 'тьма ещё стоит после третьей прокрутки');
  check(afterSpin3.reveal !== null && afterSpin3.reveal.isNoteOpen === true, 'записка проступила из тьмы (reveal.isNoteOpen true)');
  await shot('note.png');

  // ---------- 5. Прокрутки раунда до 0 → Коллектор, тьма гаснет, шкала возвращается ----------
  let s = afterSpin3;
  for (let guard = 0; guard < 40; guard++) {
    if (s.spinsLeft === 0 || s.isRoundOver || s.isAwaitingPayment || s.isLastChance || s.isGameOver) break;
    const spin = await spinBySpace();
    s = spin.done;
    if (s.isGameOver) break;
  }
  console.log(`     прокруток осталось: ${s.spinsLeft}, кон: ${s.pot}, банк: ${s.balance}, долг: ${s.debt}`);
  check(s.spinsLeft === 0 || s.isRoundOver, 'прокрутки раунда доиграны до 0 (spinsLeft ' + s.spinsLeft + ')');
  // Коллектор приезжает после COLLECT_DELAY: ждём банкомат И конец фейда тьмы (тьма гаснет 500 мс,
  // а банкомат выезжает быстрее — по одному «банкомат выехал» проверка ловила тьму ещё на экране).
  const collector = await (async () => {
    const t0 = Date.now();
    let cur = s;
    let atmOut = false;
    while (Date.now() - t0 < 15000) {
      cur = await state();
      atmOut = await val('window.__g.collector ? window.__g.collector.isAtmOut : false');
      const faded = cur.reveal === null || cur.reveal.isActive === false;
      if ((atmOut && faded) || cur.isAwaitingPayment || cur.isLastChance) break;
      await sleep(150);
    }
    return { ...cur, atmOut };
  })();
  check(collector.atmOut === true, 'пришёл Коллектор: банкомат выехал на место шкалы замаха (isAtmOut)');
  check(collector.reveal === null || collector.reveal.isActive === false,
    'Коллектор пришёл — тьма погасла (reveal.isActive ' + (collector.reveal ? collector.reveal.isActive : 'объекта уже нет') + ')');
  await shot('collector.png');
  // Фишек на долг скорее всего не хватает (банк не набирали): банкомат показывает GOOD LUCK и уезжает.
  // Хватает — отдаём долг Enter, чтобы банкомат освободил место шкалы.
  let rest = collector;
  for (let guard = 0; guard < 40; guard++) {
    if (rest.chargeVisible) break;
    if (rest.isAwaitingPayment) { await pressEnter(); await sleep(700); }
    await sleep(250);
    rest = await state();
  }
  check(rest.chargeVisible === true, 'шкала замаха снова видна (банкомат уехал): ' + JSON.stringify(rest.chargeText));
  check(rest.reveal === null || rest.reveal.isActive === false, 'тьмы на экране больше нет');
  await shot('charge-back.png');

  // ---------- 6. Перезагрузка: обучение пройдено, тьмы нет ----------
  const lsBefore = await val('JSON.stringify(localStorage)');
  console.log('     localStorage до перезагрузки: ' + lsBefore);
  // Что новый документ увидел в localStorage в самом начале: loadProgress() работает именно тогда.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__boot = { url: location.href, progress: localStorage.getItem('dolgovaya-yama-progress'), keys: Object.keys(localStorage) };` });
  await val('window.__marker = "before-reload"; 1');
  await send('Page.reload');
  await sleep(4000);
  check((await val('window.__marker')) === undefined, 'страница действительно перезагрузилась (метка пропала)');
  console.log('     документ на старте видел: ' + JSON.stringify(await val('window.__boot')));
  const r0 = await state();
  const sceneInfo = await val('JSON.stringify({ key: window.__g.scene.key, revealCtor: window.__g.reveal ? window.__g.reveal.constructor.name : null, ready: document.readyState })');
  console.log('     сцена: ' + sceneInfo);
  check((await val('typeof window.__g')) === 'object', 'после перезагрузки сцена снова в window.__g');
  check(r0.reveal === null, 'тьмы после перезагрузки нет (reveal = null), сейчас: ' + JSON.stringify(r0.reveal));
  check(!!r0.progress, 'прогресс записан (обучение пройдено): ' + JSON.stringify(r0.progress));
  check(r0.chargeVisible === true, 'шкала замаха видна сразу');
  if (r0.reveal) {
    await shot('reload-dark-again.png');
    console.log('     снимок повторной тьмы: ' + SHOTS + '/reload-dark-again.png');
  }

  // ---------- 7. Диагностика шага 6: это не правка рычага, а загрузка прогресса ----------
  // progress.ts: `let progress = loadProgress()` стоит выше `const PATTERN_IDS`, а loadProgress зовёт
  // patternsOf → isPatternId → PATTERN_IDS. Сохранённые паттерны есть — TDZ-исключение, catch в loadProgress
  // возвращает прогресс по умолчанию (tutorialDone false) — тьма возвращается, паттерны и ачивки теряются.
  // Проверяем в живом браузере: тот же прогресс, но с пустым списком паттернов.
  console.log('     диагностика: тот же прогресс, но без открытых паттернов (loadProgress не дойдёт до PATTERN_IDS)');
  await val(`(() => {
    const p = JSON.parse(localStorage.getItem('dolgovaya-yama-progress'));
    p.patterns = [];
    localStorage.setItem('dolgovaya-yama-progress', JSON.stringify(p));
    return localStorage.getItem('dolgovaya-yama-progress');
  })()`);
  await send('Page.reload');
  await sleep(4000);
  const r1 = await state();
  check(r1.reveal === null, 'диагностика: прогресс без паттернов — тьмы после перезагрузки нет (' + JSON.stringify(r1.reveal) + ')');
  check(r1.chargeVisible === true, 'диагностика: шкала замаха видна сразу');

  console.log(`итог ${ok} из ${all}`);
  console.log('снимки: ' + SHOTS + '/dark-before.png, dark-after-spin.png, note.png, collector.png, charge-back.png, reload-dark-again.png');
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

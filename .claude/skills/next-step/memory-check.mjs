/**
 * Проверка памяти амулетов после смерти (шаг 26) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/memory-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в scratchpad, профиль Chrome — в scratchpad/prof-memory.
 *
 * Правило (DONTLIKE §2, вариант А): после смерти (и только после неё) на экране автомата появляется «витрина
 * памяти»: один амулет из погибшего забега за билеты — 2 за обычный, 3 за редкий. Копии не переносятся,
 * а если билетов не хватает, слота нет совсем. Выбранный амулет стоит в гнезде с первого кадра нового забега
 * и билетов уже не стоит: они списаны на смерти.
 *
 * Что проверяет:
 *  1) до смерти слота нет;
 *  2) после KABOOM слот есть: панель, заголовок, значки амулетов и цены из memory.ts (не из копии чисел);
 *  3) в витрине только уникальные амулеты забега и только те, на которые хватает билетов;
 *  4) панель внутри чёрного экрана автомата и не залезает на счёт и «ЗАНОВО»;
 *  5) клик по амулету списывает ровно его цену, пишет выбор в localStorage и превращает витрину в «В ПАМЯТИ: …»;
 *  6) второй клик по тому же месту ничего не списывает;
 *  7) новый забег начинается с этим амулетом в гнезде, билетов за него не берёт, память из localStorage стирает;
 *     второй «ЗАНОВО» амулет повторно не выдаёт — память одноразовая;
 *  8) при нехватке билетов (1 билет на цену 2–3) слота нет;
 *  9) после победы слота тоже нет;
 * 10) русский и английский тексты витрины.
 * Порт 8772 — свой: dev-сервер 5173 и порты 8766/8767/8770/8771 из других сценариев не трогаем.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симулятора: Node находит './rules' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node memory-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = SP;
mkdirSync(SHOTS, { recursive: true });
// Эталоны — из игры, а не из копии чисел: memory.ts решает, что предлагать и по какой цене.
const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const MEMORY = await import(SRC + 'memory.ts');
const AMULETS = await import(SRC + 'amulets.ts');
const LAYOUT = await import(SRC + 'layout.ts');
const byId = (id) => AMULETS.AMULETS.find((amulet) => amulet.id === id);
const srv = spawn('python3', ['-m', 'http.server', '8772', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9339', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-memory', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9339/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9339 занят?');
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

  /** Состояние экрана смерти и витрины памяти — по полям сцены, а не по пикселям. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    const b = (o) => { if (!o) return null; const r = o.getBounds(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    return JSON.stringify({
      gameOver: g.isGameOver, endScreen: g.isEndScreenOpen, tickets: g.tickets,
      options: g.memoryOptions.map((o) => ({ id: o.amulet.id, price: o.price })),
      chips: g.memoryChips.length,
      panel: g.memoryPanel.length,
      box: b(g.memoryBox),
      title: g.memoryTitleText ? g.memoryTitleText.text : null,
      amulets: g.amulets.map((a) => a.id),
      counts: g.amuletCounts,
      memory: (() => { try { const p = JSON.parse(localStorage.getItem('dolgovaya-yama-progress') ?? 'null'); return p ? p.memoryAmulet ?? null : null; } catch { return 'broken'; } })(),
      badge: g.amuletRack.badges[0] ? { visible: g.amuletRack.badges[0].visible, key: g.amuletRack.badges[0].texture.key } : null,
    });
  })()`)) ?? '{}');

  /** Точка раскладки → точка страницы: левый край холста + (x − scrollX) × zoom × масштаб холста. */
  const pagePoint = async (expr) => JSON.parse(await val(`(() => {
    const g = window.__g, cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    const b = ${expr};
    return JSON.stringify({ x: r.left + (b.centerX - cam.scrollX) * cam.zoom * k, y: r.top + (b.centerY - cam.scrollY) * cam.zoom * k });
  })()`));
  const clickAt = async (p) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await sleep(100);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(500);
  };
  const clickChip = async (index) => clickAt(await pagePoint(`g.memoryChips[${index}].getBounds()`));
  const moveAway = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 });
    await val('window.__g.tooltip.hide(); 1');
    await sleep(250);
  };

  /** Амулеты забега — готовыми объектами из amulets.ts: сцена не умеет их придумывать по id. */
  const setAmulets = async (ids) => {
    const amulets = ids.map((amuletId) => byId(amuletId));
    const counts = Object.fromEntries(ids.map((amuletId) => [amuletId, 1]));
    const done = await val(`(() => { const g = window.__g; g.amulets = ${JSON.stringify(amulets)}; g.amuletCounts = ${JSON.stringify(counts)}; return g.amulets.length; })()`);
    if (done !== ids.length) throw new Error('не удалось положить амулеты: ' + done);
    await sleep(150);
  };
  /** Смерть: KABOOM идёт 1,8 с + 0,9 с, затемнение 0,7 с — экран смерти появляется на ~3,4 с. */
  const die = async () => {
    await val('window.__g.kaboom(); 1');
    await sleep(4600);
    // Шаг 28: после смерти сверху ложится экран улучшений. Берём одно бесплатное клавишей, экран закрывается
    // (билетов здесь меньше 6 — второй фазы нет), и на экране смерти снова видна витрина памяти.
    // №30 «амулет не сгорает при смерти» нарочно пропускаем: он делает перенос бесплатным, а здесь проверяются
    // именно цены витрины. Если он единственный в предложении (так не бывает), берём его — сценарий не падает.
    if (await val('window.__g.upgradeScreen.isOpen')) {
      const safe = await val(`(() => { const list = window.__g.upgradeOfferList;
        const index = list.findIndex((upgrade) => upgrade.id !== 'amulet-survives-death');
        return index < 0 ? 0 : index; })()`);
      await val(`window.__g.upgradeScreen.press(${safe}); 1`);
      await sleep(600);
    }
  };
  /** Новый забег: сцена перезапускается и строится заново. */
  const restart = async () => {
    await val('window.__g.restartGame(); 1');
    await sleep(4200);
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8772/' });
  await sleep(3500);
  // Язык — из localStorage (headless Chrome англоязычный), прогресс — с чистого листа.
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru'); localStorage.removeItem('dolgovaya-yama-progress'); 1`);
  await send('Page.reload');
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(900);

  // ---------- Русский: смерть с двумя амулетами и тремя билетами ----------
  await setAmulets(['bell', 'boost']);
  await val('window.__g.tickets = 3; window.__g.refreshHud(); 1');
  await sleep(200);
  const before = await state();
  check(before.box === null && before.chips === 0, 'до смерти витрины памяти нет');

  await die();
  const s1 = await state();
  const expected = MEMORY.memoryOptions(['bell', 'boost'], 3);
  check(s1.gameOver === true && s1.endScreen === true, 'KABOOM: экран смерти открыт');
  check(s1.box !== null, 'после смерти появилась витрина памяти');
  check(s1.title === 'ВИТРИНА ПАМЯТИ', 'RU: заголовок витрины — ' + JSON.stringify(s1.title));
  check(s1.chips === 2 && s1.options.length === 2, 'в витрине два амулета забега (' + JSON.stringify(s1.options) + ')');
  check(
    JSON.stringify(s1.options) === JSON.stringify(expected.map((option) => ({ id: option.amulet.id, price: option.price }))),
    'варианты и цены — из memory.ts: ' + JSON.stringify(expected.map((option) => ({ id: option.amulet.id, price: option.price }))),
  );
  check(s1.options.every((option) => MEMORY.memoryPrice(byId(option.id).rarity) === option.price), 'цена каждого — по его редкости');
  check(s1.tickets === 3, 'билеты до выбора целы (3)');
  check(s1.memory === null, 'до выбора памяти нет');
  // Панель — внутри чёрного экрана автомата (SCREEN) и выше счёта с кнопкой «ЗАНОВО».
  const screen = LAYOUT.SCREEN;
  const insideScreen =
    s1.box.x >= screen.x - screen.width / 2 && s1.box.right <= screen.x + screen.width / 2 &&
    s1.box.y >= screen.y - screen.height / 2 && s1.box.bottom <= screen.y + screen.height / 2;
  check(insideScreen, `панель внутри экрана автомата (панель ${JSON.stringify(s1.box)}, экран ${screen.x - screen.width / 2}…${screen.x + screen.width / 2})`);
  check(s1.box.bottom < 500, 'панель не залезает на счёт (500) и кнопку «ЗАНОВО» (566): низ ' + s1.box.bottom);
  check(s1.box.w <= screen.width - 12, 'панель по ширине уже экрана: ' + s1.box.w + ' ≤ ' + (screen.width - 12));
  await moveAway();
  await shot('memory-ru-death.png');

  // Выбор: клик по обычному амулету (🔔 за 2 билета) — билеты списываются, выбор уходит в localStorage.
  const bellIndex = s1.options.findIndex((option) => option.id === 'bell');
  const bellPrice = s1.options[bellIndex].price;
  const chipPoint = await pagePoint(`g.memoryChips[${bellIndex}].getBounds()`);
  await clickChip(bellIndex);
  const s2 = await state();
  check(s2.tickets === 3 - bellPrice, `клик списал цену амулета: 3 → ${s2.tickets} (цена ${bellPrice})`);
  check(s2.memory === 'bell', 'выбор записан в localStorage: ' + JSON.stringify(s2.memory));
  check(s2.chips === 0 && s2.title === 'В ПАМЯТИ: ' + byId('bell').name.ru, 'витрина стала строкой памяти: ' + JSON.stringify(s2.title));
  check(s2.box !== null && s2.panel === 3, 'строка памяти нарисована (панель, заголовок, значок)');
  // Второй клик по тому же месту: значков больше нет, билеты не тратятся.
  await clickAt(chipPoint);
  const s3 = await state();
  check(s3.tickets === s2.tickets && s3.memory === 'bell', 'второй клик ничего не списал и память не сменил');
  await moveAway();
  await shot('memory-ru-kept.png');

  // ---------- Новый забег: амулет из памяти стоит в гнезде и ничего не стоит ----------
  await restart();
  const s4 = await state();
  check((await val('typeof window.__g')) === 'object', 'после «ЗАНОВО» сцена снова жива');
  check(JSON.stringify(s4.amulets) === JSON.stringify(['bell']), 'новый забег начался с 🔔 в гнезде: ' + JSON.stringify(s4.amulets));
  check(s4.counts.bell === 1, 'копия амулета одна: ' + JSON.stringify(s4.counts));
  check(s4.tickets === 0, 'за память в новом забеге билеты не брали (' + s4.tickets + ')');
  check(s4.memory === null, 'память прочитана один раз и стёрта: ' + JSON.stringify(s4.memory));
  check(s4.badge && s4.badge.visible === true && s4.badge.key === 'amulet-bell', 'значок 🔔 виден в первом гнезде: ' + JSON.stringify(s4.badge));
  await moveAway();
  await shot('memory-ru-new-run.png');

  // ---------- Второй «ЗАНОВО»: память одноразовая — тот же амулет второй раз не выдают ----------
  await restart();
  const again = await state();
  check(JSON.stringify(again.amulets) === JSON.stringify([]), 'во втором забеге амулет заново не выдан (халявы нет): ' + JSON.stringify(again.amulets));
  check(again.counts.bell === undefined, 'копий 🔔 в гнезде нет: ' + JSON.stringify(again.counts));
  check(again.memory === null, 'память после выдачи пуста и не оживает: ' + JSON.stringify(again.memory));
  await moveAway();
  await shot('memory-ru-second-run.png');

  // ---------- Нехватка билетов: слота нет совсем ----------
  await setAmulets(['boost']); // редкий: 3 билета
  await val('window.__g.tickets = 1; window.__g.refreshHud(); 1');
  await sleep(200);
  await die();
  const s5 = await state();
  check(s5.gameOver === true, 'вторая смерть: экран смерти открыт');
  check(s5.options.length === 0 && s5.box === null && s5.chips === 0, 'при 1 билете витрины памяти нет');
  check(s5.memory === null, 'нехватка билетов память не пишет');
  await moveAway();
  await shot('memory-ru-poor.png');

  // ---------- Английский: та же витрина, тексты другие ----------
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'en')`);
  await send('Page.reload');
  await sleep(4000);
  check((await val('typeof window.__g')) === 'object', 'EN: сцена снова в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(700);
  await setAmulets(['boost']);
  await val('window.__g.tickets = 3; window.__g.refreshHud(); 1');
  await sleep(200);
  await die();
  const en = await state();
  check(en.title === 'MEMORY SHOWCASE', 'EN: заголовок витрины — ' + JSON.stringify(en.title));
  check(en.chips === 1 && en.options.length === 1 && en.options[0].price === MEMORY.memoryPrice(byId('boost').rarity), 'EN: редкий ⚡ за 3 билета: ' + JSON.stringify(en.options));
  await moveAway();
  await shot('memory-en-death.png');
  // Отказ крестиком: витрина убирается, память не пишется, билеты целы. Потом витрину зовём снова — и берём амулет.
  const closePoint = await pagePoint('g.memoryPanel.find((part) => part.text === "✕").getBounds()');
  await clickAt(closePoint);
  const closed = await state();
  check(closed.box === null && closed.chips === 0 && closed.options.length === 0, 'крестик убирает витрину с экрана смерти');
  check(closed.tickets === 3 && closed.memory === null, 'отказ ничего не пишет и билеты не трогает');
  await val('window.__g.showMemorySlot(); 1');
  await sleep(400);
  await clickChip(0);
  const en2 = await state();
  check(en2.memory === 'boost' && en2.tickets === 0, 'EN: клик записал ⚡ и списал 3 билета');
  check(en2.title === 'REMEMBERED: ' + byId('boost').name.en, 'EN: строка памяти — ' + JSON.stringify(en2.title));
  await moveAway();
  await shot('memory-en-kept.png');

  // ---------- Победа: витрины памяти нет (она только после смерти) ----------
  await restart();
  await val('window.__g.startVictory(); 1');
  await sleep(5200);
  const victory = await state();
  check(victory.gameOver === true && victory.endScreen === true, 'экран победы открыт');
  check(victory.box === null && victory.options.length === 0 && victory.chips === 0, 'после победы витрины памяти нет');
  await moveAway();
  await shot('memory-en-victory.png');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

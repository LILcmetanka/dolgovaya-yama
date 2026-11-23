/**
 * Проверка памяти амулетов (шаг 26; переделана шагом 38, DONTLIKE п.2) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/memory-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в scratchpad, профиль Chrome — в scratchpad/prof-memory.
 *
 * Правило шага 38 (DONTLIKE п.2): при старте КАЖДОГО нового забега на экране автомата — список амулетов
 * прошлого забега (тот же экранный список, что у улучшений, шаг 37). Берут бесплатно: цен в билетах больше нет.
 * Отказаться можно (✕ или «0») — гнёзда останутся пусты. Выбранный амулет стоит в гнезде с начала забега
 * и не продаётся. Старой витрины «после смерти за билеты» нет вовсе.
 *
 * Что проверяет:
 *  1) в первом забеге (прошлого забега ещё нет) выбора нет;
 *  2) смерть записывает амулеты забега в прогресс: runAmulets и runAmuletPicks (без №30 — один выбор);
 *  3) на старте нового забега список открыт: заголовок, две строки, игра ждёт (canAct false);
 *  4) выбор бесплатный: билеты не тратятся, амулет в гнезде, список закрыт, крутить можно;
 *  5) список — снимок прошлого забега: он не тает после выбора (новый забег без смерти видит его снова);
 *  6) отказ (✕/«0») оставляет гнёзда пустыми;
 *  7) №30 «Амулет в памяти»: выборов два — список открывается второй раз с остатком;
 *  8) русский и английский тексты списка.
 * Порт 8772 — свой: dev-сервер 5173 и порты 8766/8767/8770/8771/8773 из других сценариев не трогаем.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симулятора: Node находит './memory' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node memory-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = SP;
mkdirSync(SHOTS, { recursive: true });
// Эталоны — из игры, а не из копии чисел: memory.ts решает, что предлагать.
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

  /** Состояние памяти и забега — по полям сцены и localStorage, а не по пикселям. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    const b = (o) => { if (!o) return null; const r = o.getBounds(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const progress = (() => { try { return JSON.parse(localStorage.getItem('dolgovaya-yama-progress') ?? 'null'); } catch { return null; } })();
    return JSON.stringify({
      pickOpen: g.amuletPick.isOpen, rows: g.amuletPick.rows.length, choosing: g.isChoosingAmulet,
      startAmulets: g.startAmulets, picks: g.startAmuletPicks, canAct: g.canUseActions(),
      amulets: g.amulets.map((a) => a.id), counts: g.amuletCounts, tickets: g.tickets,
      debt: g.debt, gameOver: g.isGameOver, endScreen: g.isEndScreenOpen,
      pickTitle: (() => { const t = g.amuletPick.parts.find((part) => typeof part.text === 'string' && part.style && part.style.fontSize === '15px'); return t ? t.text : null; })(),
      texts: g.children.list.filter((o) => typeof o.text === 'string' && o.visible).map((o) => o.text),
      progressAmulets: progress ? progress.runAmulets ?? null : 'broken',
      progressPicks: progress ? progress.runAmuletPicks ?? null : 'broken',
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
  const clickRow = async (index) => clickAt(await pagePoint(`g.amuletPick.rows[${index}].getBounds()`));
  const moveAway = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 });
    await val('window.__g.tooltip.hide(); 1');
    await sleep(250);
  };

  /** Амулеты забега — готовыми объектами из amulets.ts: сцена не умеет их придумывать по id. */
  const setAmulets = async (ids) => {
    const amulets = ids.map((amuletId) => byId(amuletId));
    const counts = Object.fromEntries(ids.map((amuletId) => [amuletId, 1]));
    const done = await val(`(() => { const g = window.__g; g.amulets = ${JSON.stringify(amulets)}; g.amuletCounts = ${JSON.stringify(counts)}; g.amuletRack.setAmulets(g.amulets, g.amuletCounts); return g.amulets.length; })()`);
    if (done !== ids.length) throw new Error('не удалось положить амулеты: ' + done);
    await sleep(150);
  };
  /** Смерть: ждём не «по часам», а пока забег правда не кончился (в headless бывает медленнее). */
  const die = async () => {
    await val('window.__g.finishTutorial(); window.__g.kaboom(); 1');
    for (let i = 0; i < 48; i++) {
      if (await val('window.__g.isGameOver && (window.__g.upgradeScreen.isOpen || window.__g.endScreenCleanup !== null)')) break;
      await sleep(250);
    }
    await sleep(400);
  };
  /** Новый забег: сцена перезапускается и строится заново. */
  const restart = async () => {
    await val('window.__g.restartGame(); 1');
    await sleep(4200);
  };
  /** Прогресс с чистого листа: список памяти и покупки обнулены (язык — русский). */
  const freshProgress = async (extra = {}) => {
    await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru');
      localStorage.setItem('dolgovaya-yama-progress', JSON.stringify({ tutorialDone: true, patterns: [], achievements: [], runAmulets: [], runAmuletPicks: 1, upgrades: {}, runs: 1, ...${JSON.stringify(extra)} })); 1`);
    await send('Page.reload');
    await sleep(3500);
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8772/' });
  await sleep(3500);
  await freshProgress();
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');

  // ---------- 1. Первый забег: памяти нет ----------
  const first = await state();
  check(first.pickOpen === false && first.startAmulets.length === 0, 'первый забег: прошлого забега нет — выбора тоже нет');
  check(first.canAct === true, 'без памяти игра сразу идёт');
  check(Array.isArray(first.progressAmulets) && first.progressAmulets.length === 0, 'в прогрессе пустой список амулетов: ' + JSON.stringify(first.progressAmulets));

  // ---------- 2. Смерть записывает амулеты забега ----------
  await setAmulets(['bell', 'boost']);
  await die();
  const dead = await state();
  check(dead.gameOver === true, 'KABOOM: забег кончился');
  check(JSON.stringify(dead.progressAmulets) === JSON.stringify(['bell', 'boost']), 'смерть записала амулеты забега в прогресс: ' + JSON.stringify(dead.progressAmulets));
  check(dead.progressPicks === MEMORY.MEMORY_PICKS_BASE, 'без №30 выборов один: ' + dead.progressPicks);
  check(dead.texts.every((text) => !['ВИТРИНА ПАМЯТИ', 'В ПАМЯТИ:'].includes(text)), 'старой витрины «после смерти за билеты» на экране смерти нет');

  // ---------- 3. Новый забег: список памяти на экране автомата ----------
  await restart();
  const offered = await state();
  const expected = MEMORY.memoryOptions(['bell', 'boost']);
  check(offered.pickOpen === true && offered.choosing === true, 'новый забег: список памяти открыт');
  check(offered.rows === expected.length && offered.rows === 2, 'в списке два амулета прошлого забега: ' + offered.rows);
  check(offered.canAct === false, 'пока память не выбрана, крутить нельзя');
  check(offered.startAmulets.join(',') === 'bell,boost', 'предлагаются именно амулеты прошлого забега: ' + offered.startAmulets.join(', '));
  check(offered.texts.includes(MEMORY.memoryOptions(['bell']).length ? 'АМУЛЕТ ИЗ ПРОШЛОГО ЗАБЕГА' : ''), 'RU: заголовок списка — АМУЛЕТ ИЗ ПРОШЛОГО ЗАБЕГА');
  check(offered.texts.includes('Возьми один бесплатно — или откажись'), 'RU: подпись «Возьми один бесплатно — или откажись»');
  check(offered.texts.every((text) => !/1–3|клавиш/.test(text)), 'подсказок про клавиши на списке нет');
  const screen = LAYOUT.SCREEN;
  const insideScreen = await val(`(() => { const g = window.__g; const L = g.amuletPick; const r = L.rows.map((z) => z.getBounds());
    return ${JSON.stringify(screen)} && r.every((b) => b.left >= ${screen.x - screen.width / 2} && b.right <= ${screen.x + screen.width / 2} && b.top >= ${screen.y - screen.height / 2} && b.bottom <= ${screen.y + screen.height / 2}); })()`);
  check(insideScreen === true, 'список целиком на экране автомата (шаг 37)');
  // Шаг 41: строка-кнопка не меньше 44×44, ни одна надпись не вылезает за стекло.
  const glassAmulets = JSON.parse(await val(`(() => {
    const L = window.__g.amuletPick, S = ${JSON.stringify(screen)};
    const l = S.x - S.width / 2, t = S.y - S.height / 2, r = S.x + S.width / 2, b = S.y + S.height / 2;
    const rows = L.rows.filter((z) => z.visible).map((z) => z.getBounds());
    const outside = [];
    for (const part of L.parts) {
      if (typeof part.text !== 'string' || part.visible === false) continue;
      const box = part.getBounds();
      if (box.left < l - 0.5 || box.right > r + 0.5 || box.top < t - 0.5 || box.bottom > b + 0.5) outside.push({ text: part.text, box });
    }
    return JSON.stringify({ rows: rows.length, rowsBig: rows.every((z) => z.height >= 44 && z.width >= 44), outside: outside.slice(0, 5) });
  })()`) ?? '{}');
  check(glassAmulets.rows === 2 && glassAmulets.rowsBig === true, 'строка памяти — кнопка не меньше 44×44 (' + glassAmulets.rows + ' строки)');
  check(glassAmulets.outside.length === 0, 'ни одна надпись памяти не вылезает за стекло' + (glassAmulets.outside.length ? ': ' + JSON.stringify(glassAmulets.outside) : ''));
  await moveAway();
  await shot('memory-ru-start.png');

  // ---------- 4. Бесплатный выбор: билетов не тратит, амулет в гнезде ----------
  await clickRow(0);
  const picked = await state();
  check(picked.pickOpen === false && picked.choosing === false, 'после выбора список закрыт');
  check(picked.amulets.join(',') === 'bell', 'выбранный 🔔 стоит в гнезде: ' + picked.amulets.join(', '));
  check(picked.counts.bell === 1, 'копия одна: ' + JSON.stringify(picked.counts));
  check(picked.tickets === 0, 'память бесплатная: билеты не списаны (' + picked.tickets + ')');
  check(picked.canAct === true, 'амулет выбран — крутить можно');
  check(picked.badge && picked.badge.visible === true && picked.badge.key === 'amulet-bell', 'значок 🔔 виден в первом гнезде: ' + JSON.stringify(picked.badge));
  await moveAway();
  await shot('memory-ru-new-run.png');

  // ---------- 5. Список — снимок прошлого забега, он не тает от выбора ----------
  await restart();
  const again = await state();
  check(again.pickOpen === true && again.startAmulets.join(',') === 'bell,boost', 'новый забег без смерти снова видит тех же амулетов: ' + again.startAmulets.join(', '));
  check(again.progressAmulets.join(',') === 'bell,boost', 'выбор память не стирает: в прогрессе те же амулеты');

  // ---------- 6. Отказ: гнёзда пусты ----------
  await val('window.__g.amuletPick.press(9); 1'); // «0» — закрыть список (отказ)
  await sleep(500);
  const refused = await state();
  check(refused.pickOpen === false && refused.choosing === false, 'отказ закрыл список');
  check(refused.amulets.length === 0, 'после отказа гнёзда пусты: ' + refused.amulets.join(', '));
  check(refused.canAct === true, 'отказ не держит игру');
  await moveAway();
  await shot('memory-ru-refused.png');

  // ---------- 7. №30 «Амулет в памяти»: выборов два ----------
  await freshProgress({ upgrades: { 'amulet-survives-death': 1 }, runAmulets: ['bell', 'boost'], runAmuletPicks: 2 });
  const two = await state();
  check(two.pickOpen === true && two.picks === 2, '№30: на старте разрешено два амулета (' + two.picks + ')');
  check(two.texts.some((text) => String(text).includes('Можно взять ещё один')), '№30: подпись «Можно взять ещё один»');
  await clickRow(0);
  const afterOne = await state();
  check(afterOne.amulets.length === 1 && afterOne.picks === 1, '№30: первый взят, осталось ещё одно место');
  check(afterOne.pickOpen === true && afterOne.rows === 1, '№30: список открылся второй раз с остатком (строк: ' + afterOne.rows + ')');
  await clickRow(0);
  const afterTwo = await state();
  check(afterTwo.amulets.length === 2 && afterTwo.picks === 0, '№30: оба амулета в гнёздах — ' + afterTwo.amulets.join(', '));
  check(afterTwo.pickOpen === false && afterTwo.canAct === true, '№30: выборов больше нет — игра идёт');
  await moveAway();
  await shot('memory-ru-two.png');

  // ---------- 8. Английский ----------
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'en');
    localStorage.setItem('dolgovaya-yama-progress', JSON.stringify({ tutorialDone: true, patterns: [], achievements: [], runAmulets: ['boost'], runAmuletPicks: 1, upgrades: {}, runs: 1 })); 1`);
  await send('Page.reload');
  await sleep(3500);
  const en = await state();
  check(en.pickOpen === true && en.rows === 1, 'EN: список памяти открыт');
  check(en.texts.includes('AMULET FROM THE LAST RUN'), 'EN: заголовок — AMULET FROM THE LAST RUN');
  check(en.texts.includes('Take one for free — or refuse'), 'EN: подпись — Take one for free — or refuse');
  await moveAway();
  await shot('memory-en-start.png');
  await clickRow(0);
  const enPicked = await state();
  check(enPicked.amulets.join(',') === 'boost' && enPicked.tickets === 0, 'EN: ⚡ взят бесплатно, в гнезде');
  await moveAway();
  await shot('memory-en-new-run.png');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

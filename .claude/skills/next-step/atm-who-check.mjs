/**
 * Проверка банкомата (DONTLIKE 5.1–5.3) и вкладки «Кто есть кто» на живых снимках в headless Chrome.
 * Запуск: node .claude/skills/next-step/atm-who-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимки и профиль Chrome — в scratchpad.
 *
 * Что проверяет банкомат: выехал и показывает долг — фишка над числом по центру, число внутри экрана,
 * монетоприёмник ниже экрана; не хватает фишек — GOOD LUCK без фишки; шестизначный долг ужимается по ширине.
 * «Кто есть кто»: когда встречены Коллектор, Дилер и все автоматы, в панели пять рядов, нет плиток «???»,
 * описания не налезают на названия следующего ряда, не влезают в соседнюю колонку и не выходят за ряд.
 * Всё повторяется на втором языке (L): русский длиннее английского, там описания переносятся на вторую строку.
 * Порт 8770 — свой, dev-сервер на 5173 и порты 8766/8767 из других сценариев не трогаем.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node atm-who-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const srv = spawn('python3', ['-m', 'http.server', '8770', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9337', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-atm', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Константы из atm.ts: экран на корпусе и предел ширины числа.
const SCREEN = { left: -80, right: 80, top: -124, bottom: -40 }; // SCREEN_Y −82 ± SCREEN_HEIGHT/2, по ширине ±SCREEN_WIDTH/2
const DEMAND_MAX_WIDTH = 136; // DEMAND_MAX_WIDTH
const COIN_TOP = -38; // COIN_SLOT_DY −10 − COIN_BODY.height/2: верх накладки приёмника
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

  /** Банкомат с долгом debt и балансом balance: выехал и что на экране (координаты — от центра корпуса). */
  const atm = async (debt, balance) => {
    await val('window.__g.collector.atm.hide(); 1');
    await sleep(250);
    await val(`window.__g.balance = ${balance}; window.__g.debt = ${debt}; window.__g.callCollector(false); 1`);
    // Ждём, пока банкомат действительно выехал на своё место: твины + захват canvas в headless бывают медленнее sleep.
    for (let i = 0; i < 30; i++) { if (await val('window.__g.collector.atm.isOut')) break; await sleep(150); }
    await sleep(150);
    const raw = await val(`(() => {
      const a = window.__g.collector.atm, b = a.box, d = a.demand, ch = a.chip, slot = a.slotPosition();
      const rel = (o) => { const g = o.getBounds(); return { x: Math.round(g.x - b.x), y: Math.round(g.y - b.y), right: Math.round(g.right - b.x), bottom: Math.round(g.bottom - b.y) }; };
      return JSON.stringify({ out: a.isOut, text: d.text, chipVisible: ch.visible, chip: rel(ch), demand: rel(d), slotY: Math.round(slot.y - b.y) });
    })()`);
    return raw === undefined ? undefined : JSON.parse(raw);
  };

  // 5.1: фишка над суммой по центру, число под ней и внутри экрана.
  const debt = await atm(30, 5000);
  await shot('atm-debt.png');
  const demandOk = debt && debt.demand.x >= SCREEN.left && debt.demand.right <= SCREEN.right && debt.demand.y >= SCREEN.top && debt.demand.bottom <= SCREEN.bottom;
  check(debt && debt.out, 'банкомат выехал к игроку');
  check(debt && debt.text === '30' && debt.chipVisible, 'на экране долг и фишка над числом: ' + (debt && debt.text));
  check(debt && debt.chip.bottom <= debt.demand.y - 1, 'фишка не налезает на число (низ фишки ' + (debt && debt.chip.bottom) + ' < верх числа ' + (debt && debt.demand.y) + ')');
  check(debt && Math.abs((debt.chip.x + debt.chip.right) / 2 - (debt.demand.x + debt.demand.right) / 2) <= 1, 'фишка и число стоят по одной оси');
  check(demandOk, 'число целиком внутри экрана ' + JSON.stringify(debt && debt.demand));
  check(debt && debt.slotY - 28 >= SCREEN.bottom, 'накладка монетоприёмника ниже экрана (верх накладки ' + (debt && debt.slotY - 28) + ' ≥ ' + SCREEN.bottom + ')');

  // 5.2: не хватает фишек — GOOD LUCK, фишки над экраном нет.
  const luck = await atm(30, 0);
  await shot('atm-good-luck.png');
  check(luck && luck.text === 'GOOD LUCK' && !luck.chipVisible, 'не хватило фишек: GOOD LUCK без фишки');
  check(luck && luck.demand.x >= SCREEN.left && luck.demand.right <= SCREEN.right && luck.demand.y >= SCREEN.top && luck.demand.bottom <= SCREEN.bottom, 'GOOD LUCK целиком внутри экрана');

  // 5.3: шестизначный долг ужимается, за ширину экрана не вылезает.
  const big = await atm(999999, 1000000);
  await shot('atm-six-digits.png');
  check(big && big.text === '999999' && big.demand.right - big.demand.x <= DEMAND_MAX_WIDTH, 'шестизначный долг ужат до ' + (big && big.demand.right - big.demand.x) + ' ≤ ' + DEMAND_MAX_WIDTH);

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
   * Ряды «Кто есть кто»: названия, описания, счётчик страниц и найденные наслоения.
   * Колонки — по левому краю названий: ширина ряда = расстояние между колонками (ROW_WIDTH из wallScreen.ts).
   * Счётчик «‹ 1/2 ›» (тоже 16px) в описания не попадает.
   */
  const whoDump = `(() => {
    const c = window.__g.monitor.content;
    const texts = c.list.filter((o) => o.type === 'Text' && o.text && !o.text.includes('/')).map((o) => { const b = o.getBounds(); return { t: o.text, x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom), size: o.style.fontSize }; });
    const names = texts.filter((t) => t.size === '21px');
    const descs = texts.filter((t) => t.size === '16px');
    const columns = [...new Set(names.map((n) => n.x))].sort((a, b) => a - b);
    const rowWidth = columns.length > 1 ? columns[1] - columns[0] : 505;
    const problems = [];
    for (const d of descs) for (const n of names) if (n.y > d.y && d.bottom > n.y) problems.push('описание «' + d.t.slice(0, 24) + '» налезает на «' + n.t + '»');
    for (const d of descs) for (const n of names) if (n.x > d.x && d.right > n.x) problems.push('описание «' + d.t.slice(0, 24) + '» влезает в колонку «' + n.t + '»');
    const over = texts.filter((t) => t.size === '21px' || t.size === '16px').filter((t) => { const col = columns.filter((x) => x <= t.x).pop(); return col !== undefined && t.right > col + rowWidth - 76; }).map((t) => t.t.slice(0, 24) + ' right=' + t.right);
    return JSON.stringify({ names: names.map((n) => n.t), descs: descs.length, pages: window.__g.monitor.pages, hidden: c.list.some((o) => o.type === 'Text' && o.text === '???'), problems, over });
  })()`;

  const who = JSON.parse((await val(whoDump)) ?? '{}');
  console.log('who:', JSON.stringify(who));
  check(who.names.length === 5, 'пять рядов: ' + (who.names || []).join(', '));
  check(who.pages === 1, 'все ряды на одной странице (страниц ' + who.pages + ')');
  check(who.hidden === false, 'плиток «???» нет — всё встречено');
  check(who.problems.length === 0, 'описания не налезают на другие ряды и колонки');
  check(who.over.length === 0, 'ничего не вылезает за свой ряд');

  // Второй проход: другой язык — русский длиннее, описания переносятся на вторую строку.
  await val('window.__g.toggleLanguage(); 1');
  await sleep(600);
  await val('window.__g.monitor.showTab("who"); 1');
  await sleep(700);
  await shot('who-all-other-lang.png');
  const other = JSON.parse((await val(whoDump)) ?? '{}');
  console.log('who (другой язык):', JSON.stringify(other));
  check(other.names.length === 5, 'на другом языке тоже пять рядов: ' + (other.names || []).join(', '));
  check(other.pages === 1, 'на другом языке тоже одна страница (страниц ' + other.pages + ')');
  check(other.problems.length === 0, 'на другом языке наслоений нет');
  check(other.over.length === 0, 'на другом языке ничего не вылезает за ряд');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

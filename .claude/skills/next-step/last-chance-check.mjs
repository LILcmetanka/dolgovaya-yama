/**
 * Проверка докупки прокрутки в последнем шансе (шаг 14) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/last-chance-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в /tmp/opencode/step14b, профиль Chrome — в scratchpad.
 *
 * Правило, которое проверяется (ревью шага 14): докупать можно только когда бесплатные действия кончились.
 * Пока действия есть, «+1» погашена, клик и клавиша 5 не тратят фишки; при нуле действий перекрут, джокер
 * и вход в выбор (заморозка) запрещены — остаются только «докупить» и «сдаться». Считает это одна чистая
 * функция lastChance.ts (lastChanceBuyVerdict), сцена её зовёт.
 *
 * Что проверяет:
 *  1) полоса последнего шанса открыта, в ней пять плашек, строка цены видна;
 *  2) цена — из lastChance.ts (lastChanceBuyPrice/lastChanceBuyShare), а не из копии чисел в сценарии:
 *     поменяли доли в игре — проверка пойдёт за ними;
 *  3) при двух действиях подпись — обычная цена, плашка «+1» погашена (alpha 0,4) и не ловит клики;
 *     клик по «+1» и клавиша 5 при живых действиях не списывают фишки и не дают действие;
 *  4) после двух действий, когда цель не взята, шанс ждёт решения: «цель не взята · докупить ещё?», «+1» горит;
 *  5) при нуле действий перекрут, джокер и заморозка отказывают (deny): выбор не включается, сетка не меняется;
 *  6) клик по «+1» в этом состоянии даёт +1 действие и списывает ровно цену; пока действие не истрачено,
 *     вторая покупка не проходит; клавиша 5 делает то же самое после траты действия;
 *  7) лимит (LAST_CHANCE_BUY_MAX), нехватка фишек и цель у потолка гасят плашку и не дают купить;
 *  8) русский и английский, 1280×720 и 390×844: тексты и пять плашек не вылезают за полосу.
 * Порт 8772 — свой: dev-сервер 5173 и порты 8766/8767/8770/8771 из других сценариев не трогаем.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симулятора: Node находит './rules' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node last-chance-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = '/tmp/opencode/step14b';
mkdirSync(SHOTS, { recursive: true });
// Эталон цены — из игры, а не из копии чисел: lastChance.ts решает, сколько стоит докупка.
const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const LC = await import(SRC + 'lastChance.ts');
const price = (balance, bought) => LC.lastChanceBuyPrice(balance, bought); // цена докупки — правило игры
const sharePct = (bought) => Math.round(LC.lastChanceBuyShare(bought) * 100);
const srv = spawn('python3', ['-m', 'http.server', '8772', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9339', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-lc', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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

  /**
   * Состояние полосы: действия, докупки, банк, подписи и прямоугольники — по ним видно, что влезло.
   * pickMode — открыт ли выбор сетки (перекрут/джокер/заморозка), buyInteractive — ловит ли плашка «+1» клики,
   * grid — отпечаток сетки: по нему видно, что запрещённый перекрут её не тронул.
   */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g, bar = g.lastChanceBar;
    const b = (o) => { const r = o.getBounds(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    return JSON.stringify({
      lastChance: g.isLastChance, actions: g.lastChanceActions, bought: g.lastChanceBought, balance: g.balance,
      awaiting: g.isLastChanceAwaitingBuy, pickMode: g.screen.pickMode ?? null,
      buyInteractive: !!(bar.buttons.get('buy') && bar.buttons.get('buy').input && bar.buttons.get('buy').input.enabled),
      grid: g.lastChanceGrid ? g.lastChanceGrid.map((row) => row.map((symbol) => symbol.id).join('')).join('/') : null,
      price: bar.priceText.text, priceVisible: bar.priceText.visible,
      actionsText: bar.actionsText.text, goalText: bar.goalText.text,
      band: b(bar.band), goalBox: b(bar.goalText), priceBox: b(bar.priceText), actionsBox: b(bar.actionsText),
      plates: [...bar.buttons.entries()].map(([k, p]) => ({ k, alpha: p.alpha, ...b(p) })),
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
    await sleep(450);
  };
  const clickPlate = async (action) => clickAt(await pagePoint(`g.lastChanceBar.buttons.get('${action}').getBounds()`));
  const clickBuy = async () => clickPlate('buy');
  /** Убрать мышь с полосы и спрятать подсказку: она не должна закрывать снимок. */
  const moveAway = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 });
    await val('window.__g.tooltip.hide(); 1');
    await sleep(250);
  };
  /** Клавиша 5 — кнопка докупки. */
  const pressKey5 = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '5', code: 'Digit5', windowsVirtualKeyCode: 53, nativeVirtualKeyCode: 53, text: '5' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '5', code: 'Digit5', windowsVirtualKeyCode: 53, nativeVirtualKeyCode: 53 });
    await sleep(500);
  };
  /**
   * Истратить действие как игрок: кнопка «перекрут», клик по столбцу 0, ждём, пока столбец встанет
   * (REROLL_STOP_TIME 650 мс). Клик по плашке запрещён при нуле действий — такие проверки ниже отдельно.
   */
  const spendReroll = async () => {
    await clickPlate('reroll');
    await sleep(150);
    await clickAt(await pagePoint('g.screen.zones[1][0].getBounds()'));
    await sleep(1100);
  };
  /**
   * Пустая сетка под полосой: паттернов нет, поэтому исход после действий решает докупка, а не случайная сетка.
   * Сам рисунок клеток в сцене не трогаем — меняется только данные, по которым считает afterLastChanceAction.
   */
  const blankGrid = async () => {
    await val(`(() => {
      const g = window.__g;
      const blank = { ...g.lastChanceGrid[0][0], id: 'blank', sign: '·', price: 0, weight: 0 };
      g.lastChanceGrid = g.lastChanceGrid.map((row) => row.map(() => blank));
      g.isLastChanceWinPending = false;
      g.refreshLastChanceBuyLine();
      return 1;
    })()`);
    await sleep(200);
  };
  /** Открыть последний шанс с заданным долгом и банком: чистая прокрутка идёт ~2,5 с. */
  const openLastChance = async (debt, balance) => {
    await val(`window.__g.isLastChanceWinPending = false; window.__g.debt = ${debt}; window.__g.balance = ${balance}; window.__g.startLastChance(); 1`);
    await sleep(2800);
    // Входная сетка могла сразу перекрыть цель — таймер победы снимаем, иначе полоса закроется сама.
    await val('window.__g.isLastChanceWinPending = false; window.__g.refreshLastChanceBuyLine(); 1');
    await sleep(250);
  };
  /** Полоса влезает: пять плашек и все три строки внутри полосы, цена не шире отведённого. */
  const layoutOk = (s) => {
    const inside = (box) => box.x >= s.band.x && box.right <= s.band.right && box.y >= s.band.y && box.bottom <= s.band.bottom;
    return s.plates.length === 5 && s.plates.every(inside) && inside(s.goalBox) && inside(s.actionsBox) && inside(s.priceBox) && s.priceBox.w <= 210;
  };
  const alphaOf = (s, key) => { const plate = s.plates.find((p) => p.k === key); return plate ? plate.alpha : -1; };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8772/' });
  await sleep(3500);
  // Язык — из localStorage, а не из языка браузера: headless Chrome англоязычный, а первая часть проверки русская.
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru')`);
  await send('Page.reload');
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(900);

  // ---------- Русский, 1280×720 ----------
  const debt = 1000;
  let balance = 380;
  await openLastChance(debt, balance);
  const s1 = await state();
  check(s1.lastChance === true, 'последний шанс идёт, полоса открыта');
  check(s1.plates.length === 5, 'в полосе пять плашек (их ' + s1.plates.length + ')');
  check(s1.actions === 2, 'на входе два действия (их ' + s1.actions + ')');
  check(s1.priceVisible === true, 'строка цены докупки видна: ' + JSON.stringify(s1.price));
  const p0 = price(s1.balance, s1.bought);
  // Б2: при живых действиях подпись — обычная цена (не ошибка): игрок видит, сколько докупка будет стоить потом.
  check(s1.price === `ДОКУПИТЬ: ${sharePct(s1.bought)}% ФИШЕК · ${p0}`, `при двух действиях подпись — обычная цена lastChanceBuyPrice(${s1.balance}, ${s1.bought}) = ${p0}: ` + JSON.stringify(s1.price));
  check(Math.abs(alphaOf(s1, 'buy') - 0.4) < 0.02, 'при двух действиях плашка +1 погашена (alpha ' + alphaOf(s1, 'buy').toFixed(2) + ')');
  check(s1.buyInteractive === false, 'при двух действиях +1 не ловит клики');
  check(s1.actionsText === `ДЕЙСТВИЙ: ${s1.actions} · КЛАВИШИ 1–5`, 'строка действий зовёт клавиши 1–5: ' + JSON.stringify(s1.actionsText));
  await moveAway();
  await shot('lc-ru-1280-price.png');

  // Б2: при двух действиях покупка не проходит ни мышью, ни клавишей — фишки целы, действие не прибавилось.
  await clickBuy();
  const s2 = await state();
  check(s2.actions === s1.actions && s2.balance === s1.balance && s2.bought === s1.bought, `клик по +1 при двух действиях ничего не купил (действий ${s2.actions}, фишек ${s2.balance}, докупок ${s2.bought})`);
  await pressKey5();
  const s3 = await state();
  check(s3.actions === s1.actions && s3.balance === s1.balance && s3.bought === s1.bought, `клавиша 5 при двух действиях тоже не купила (действий ${s3.actions}, фишек ${s3.balance}, докупок ${s3.bought})`);
  await moveAway();
  await shot('lc-ru-1280-early.png');

  // Играем по-настоящему: сетка без паттернов, два действия тратятся на перекрут столбца.
  await blankGrid();
  await spendReroll();
  const s4 = await state();
  check(s4.actions === 1, `после первого перекрута осталось одно действие (${s1.actions} → ${s4.actions})`);
  check(Math.abs(alphaOf(s4, 'buy') - 0.4) < 0.02, 'после первого действия докупка всё ещё закрыта (early) и плашка погашена');
  await spendReroll();
  const s5 = await state();
  check(s5.actions === 0, 'второе действие истрачено (0)');
  check(s5.awaiting === true && s5.lastChance === true, 'шанс не закрыт: ждём докупку после последнего действия');
  check(s5.price === 'ЦЕЛЬ НЕ ВЗЯТА · ДОКУПИТЬ ЕЩЁ?', 'подпись ждёт решения: ' + JSON.stringify(s5.price));
  check(Math.abs(alphaOf(s5, 'buy') - 1) < 0.02, 'плашка докупки горит (alpha ' + alphaOf(s5, 'buy').toFixed(2) + ')');
  check(s5.buyInteractive === true, 'плашка докупки ловит клик');

  // Б1: при нуле действий перекрут, джокер и заморозка отказывают — выбор не включается, сетка не меняется.
  for (const [action, name] of [['reroll', 'перекрут'], ['joker', 'джокер'], ['freeze', 'заморозка']]) {
    await clickPlate(action);
    const s = await state();
    check(s.pickMode === null, `при нуле действий ${name} не включает выбор сетки`);
    check(s.actions === 0 && s.awaiting === true && s.grid === s5.grid, `при нуле действий ${name} не тратит действие и не трогает сетку`);
  }
  await moveAway();
  await shot('lc-ru-1280-nofree.png');

  // Докупка после действий: +1 действие, ровно цена с банка, ожидание снято, подпись — цена следующей.
  await clickBuy();
  const s6 = await state();
  check(s6.actions === 1, `клик по +1 дал одно действие (0 → ${s6.actions})`);
  check(s6.balance === s5.balance - p0, `докупка списала ровно ${p0} (${s5.balance} → ${s6.balance})`);
  check(s6.bought === 1, 'счётчик докупок вырос на 1 (' + s6.bought + ')');
  check(s6.awaiting === false, 'ожидание докупки снято: сначала тратится купленное действие');
  const p1 = price(s6.balance, s6.bought);
  check(s6.price === `ДОКУПИТЬ: ${sharePct(s6.bought)}% ФИШЕК · ${p1}`, `подпись — цена следующей докупки ${p1}: ` + JSON.stringify(s6.price));
  check(Math.abs(alphaOf(s6, 'buy') - 0.4) < 0.02, 'при одном действии плашка снова погашена (alpha ' + alphaOf(s6, 'buy').toFixed(2) + ')');
  // Пока купленное действие не истрачено, вторая покупка не проходит.
  await clickBuy();
  const s7 = await state();
  check(s7.actions === 1 && s7.balance === s6.balance && s7.bought === 1, 'второй клик при живом действии ничего не купил');

  // Купленное действие истрачено — снова ждём докупку; клавиша 5 покупает второе действие.
  await spendReroll();
  const s8 = await state();
  check(s8.actions === 0 && s8.awaiting === true, 'купленное действие истрачено — снова ждём докупку');
  check(s8.price === 'ЦЕЛЬ НЕ ВЗЯТА · ДОКУПИТЬ ЕЩЁ?', 'подпись снова ждёт решения: ' + JSON.stringify(s8.price));
  await pressKey5();
  const s9 = await state();
  check(s9.actions === 1, `клавиша 5 дала одно действие (0 → ${s9.actions})`);
  check(s9.balance === s8.balance - p1, `клавиша 5 списала ровно ${p1} (${s8.balance} → ${s9.balance})`);
  check(s9.bought === 2, 'после клавиши докупок 2 (' + s9.bought + ')');
  await moveAway();
  await shot('lc-ru-1280-bought.png');

  // Н2: если выбор сетки почему-то остался открыт, покупка снимает его — как обычные ветки кнопок.
  await spendReroll();
  await val(`(() => { const g = window.__g; g.screen.beginPick('column', () => {}); g.isFreezeMode = true; g.lastChanceBar.setFreezeMode(true); return g.screen.pickMode; })()`);
  await sleep(150);
  const s9p = await state();
  check(s9p.actions === 0 && s9p.awaiting === true && s9p.pickMode === 'column', 'подготовка Н2: ждём докупку, выбор столбца открыт');
  await clickBuy();
  const s9b = await state();
  check(s9b.bought === 3 && s9b.actions === 1, 'третья докупка прошла (докупок ' + s9b.bought + ', действий ' + s9b.actions + ')');
  check(s9b.pickMode === null, 'покупка сняла открытый выбор сетки (pickMode ' + s9b.pickMode + ')');

  // Лимит докупок: bought = LAST_CHANCE_BUY_MAX, действия кончились — подпись «докупок больше нет», плашка погашена.
  await val(`(() => { const g = window.__g; g.lastChanceBought = ${LC.LAST_CHANCE_BUY_MAX}; g.lastChanceActions = 0; g.isLastChanceAwaitingBuy = false; g.refreshLastChanceBuyLine(); return 1; })()`);
  await sleep(250);
  const s10 = await state();
  check(s10.price === 'ДОКУПОК БОЛЬШЕ НЕТ', 'подпись после лимита: ' + JSON.stringify(s10.price));
  check(Math.abs(alphaOf(s10, 'buy') - 0.4) < 0.02, 'плашка докупки погасла (alpha ' + alphaOf(s10, 'buy').toFixed(2) + ')');
  const afterLimit = { balance: s10.balance, actions: s10.actions, bought: s10.bought };
  await clickBuy();
  const s11 = await state();
  check(s11.balance === afterLimit.balance && s11.actions === afterLimit.actions && s11.bought === afterLimit.bought, 'клик на лимите ничего не купил и не списал');
  await moveAway();
  await shot('lc-ru-1280-limit.png');

  // Не хватает фишек: цена — минимум, а банк меньше.
  await val('window.__g.balance = 3; window.__g.lastChanceBought = 0; window.__g.lastChanceActions = 0; window.__g.isLastChanceAwaitingBuy = false; window.__g.refreshLastChanceBuyLine(); 1');
  await sleep(250);
  const s12 = await state();
  const poorPrice = price(3, 0);
  check(s12.price === `НЕ ХВАТАЕТ ФИШЕК: ${poorPrice}`, `банк 3, цена ${poorPrice} — подпись: ` + JSON.stringify(s12.price));
  const poorBefore = { balance: s12.balance, actions: s12.actions };
  await clickBuy();
  const s13 = await state();
  check(s13.balance === poorBefore.balance && s13.actions === poorBefore.actions, 'за докупку без фишек не списали и действий не дали');
  check(Math.abs(alphaOf(s13, 'buy') - 0.4) < 0.02, 'плашка при нехватке фишек погашена');
  await moveAway();
  await shot('lc-ru-1280-poor.png');

  // Цель у потолка: её бьёт только джекпот, докупка не поможет.
  await val(`window.__g.balance = 2000; window.__g.lastChanceBought = 0; window.__g.lastChanceActions = 0; window.__g.isLastChanceAwaitingBuy = false; window.__g.lastChanceGoal = ${LC.BEST_WITHOUT_JACKPOT}; window.__g.refreshLastChanceBuyLine(); 1`);
  await sleep(250);
  const s14 = await state();
  check(s14.price === 'ЦЕЛЬ У ПОТОЛКА: НЕ ПОМОЖЕТ', 'цель у потолка — подпись: ' + JSON.stringify(s14.price));
  check(Math.abs(alphaOf(s14, 'buy') - 0.4) < 0.02, 'при цели у потолка плашка погашена');

  check(layoutOk(s1), '1280×720: пять плашек и строки цели, действий и цены внутри полосы');
  check(s1.priceBox.w <= 210, '1280×720: подпись цены не шире полосы (' + s1.priceBox.w + ' ≤ 210)');

  // ---------- Узкое окно 390×844 ----------
  await openLastChance(debt, 380);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const s390 = await state();
  check(layoutOk(s390), '390×844: пять плашек и строки внутри полосы');
  check(s390.price === `ДОКУПИТЬ: ${sharePct(s390.bought)}% ФИШЕК · ${price(s390.balance, s390.bought)}`, '390×844: цена та же: ' + JSON.stringify(s390.price));
  await moveAway();
  await shot('lc-ru-390x844.png');

  // ---------- Английский, 1280×720 ----------
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'en')`);
  await send('Page.reload');
  await sleep(4000);
  check((await val('typeof window.__g')) === 'object', 'EN: сцена снова в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(800);
  await openLastChance(debt, 380);
  const en = await state();
  const enPrice = price(en.balance, en.bought);
  check(en.price === `BUY IN: ${sharePct(en.bought)}% OF CHIPS · ${enPrice}`, 'EN: при двух действиях подпись — обычная цена = ' + enPrice + ': ' + JSON.stringify(en.price));
  check(en.actionsText === `ACTIONS: ${en.actions} · KEYS 1–5`, 'EN: строка действий: ' + JSON.stringify(en.actionsText));
  check(/^GOAL:/.test(en.goalText), 'EN: цель по-английски: ' + JSON.stringify(en.goalText));
  check(layoutOk(en), 'EN 1280×720: всё внутри полосы');
  check(Math.abs(alphaOf(en, 'buy') - 0.4) < 0.02 && en.buyInteractive === false, 'EN: при двух действиях +1 погашена и не ловит клик');
  await moveAway();
  await shot('lc-en-1280.png');
  // Покупка по-английски — по правилу: сначала два действия, потом «+1».
  await blankGrid();
  await spendReroll();
  await spendReroll();
  const enWait = await state();
  check(enWait.awaiting === true && enWait.actions === 0, 'EN: после двух действий шанс ждёт докупку');
  await clickBuy();
  const en2 = await state();
  check(en2.balance === enWait.balance - enPrice && en2.actions === enWait.actions + 1, `EN: клик дал +1 действие и −${enPrice} (${enWait.balance} → ${en2.balance})`);
  check(en2.price === `BUY IN: ${sharePct(en2.bought)}% OF CHIPS · ${price(en2.balance, en2.bought)}`, 'EN: цена следующей докупки: ' + JSON.stringify(en2.price));

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const en390 = await state();
  check(layoutOk(en390), 'EN 390×844: пять плашек и строки внутри полосы');
  await moveAway();
  await shot('lc-en-390x844.png');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

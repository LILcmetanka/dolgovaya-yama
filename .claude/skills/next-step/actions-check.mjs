/**
 * Проверка действий вне прокрутки (шаг 29) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/actions-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в тот же scratchpad, профиль Chrome — в scratchpad/prof-actions.
 *
 * Правило (DONTLIKE §3): между прокрутками раунда шесть необязательных действий — обмен символа за билеты,
 * лотерея за билет, обслуживание автомата за фишки, кража из кассы Коллектора, продажа символа за фишки,
 * выкуп долга следующего раунда. Каждое — раз в раунде, в спасении и в «ТЕСТ» недоступно, откат кассетой
 * их не возит. Цены и числа — из actions.ts (не из копии в сценарии).
 *
 * Что проверяет:
 *  1) панель: вход клавишей A и табличкой на стене, шесть строк, Пробел/Enter/Esc/«0»/✕ закрывают, ввод не застревает;
 *  2) обмен символа: выбор «что убрать» и «на что менять», 2 билета списаны, веса двух символов поменялись, сетка перерисована;
 *  3) лотерея: 1 билет, жребий подставлен, эффект в состоянии и в множителе выигрыша;
 *  4) обслуживание: цена от долга (20%, минимум 30 — шаг 38), доля черепов ниже, второй раз не берут, чистка тикает;
 *  5) продажа: цена × клетки × текущий множитель серии (шаг 38), символ выпадает из автомата до конца раунда;
 *  6) долговая биржа: фишки списаны, следующий долг меньше на выкупленную долю;
 *  7) кража: успех даёт фишки, провал — сразу KABOOM без очков и магазина;
 *  8) одноразовость: повторное действие в раунде не проходит и денег не берёт;
 *  9) «ТЕСТ»: все шесть закрыты, ничего не тратится; в спасении панель не открывается;
 * 10) телефон 390×844: панель влезает в вид; EN-тексты панели.
 * Порт 8774 и CDP 9342 — свои: 8773/9340 заняты upgrades-check, 8772/9339 — memory-check.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симулятора: Node находит './rules' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node actions-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
mkdirSync(SP, { recursive: true });
// Эталоны — из игры, а не из копии чисел в сценарии.
const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const ACT = await import(SRC + 'actions.ts');
const RULES = await import(SRC + 'rules.ts');
const LAYOUT = await import(SRC + 'layout.ts');
const DEALER = await import(SRC + 'dealerGame.ts');
const symbolById = (id) => RULES.SYMBOLS.find((symbol) => symbol.id === id);
/** Символ — готовым объектом из rules.ts: сцена не умеет их придумывать по id. */
const asSymbol = (id) => JSON.stringify(symbolById(id));

const srv = spawn('python3', ['-m', 'http.server', '8774', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9342', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-actions', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let tabs;
  for (let i = 0; i < 30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9342/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9342 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const val = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error || r.result.exceptionDetails) return undefined;
    return r.result.result.value;
  };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SP + '/' + name, Buffer.from(r.result.data, 'base64')); };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };
  /** Клавиша — настоящим вводом браузера, а не вызовом метода сцены. */
  const key = async (name) => {
    const codes = {
      Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
      Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
      Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
      A: { key: 'a', code: 'KeyA', keyCode: 65, text: 'a' },
      0: { key: '0', code: 'Digit0', keyCode: 48, text: '0' },
      1: { key: '1', code: 'Digit1', keyCode: 49, text: '1' },
      2: { key: '2', code: 'Digit2', keyCode: 50, text: '2' },
      3: { key: '3', code: 'Digit3', keyCode: 51, text: '3' },
      4: { key: '4', code: 'Digit4', keyCode: 52, text: '4' },
      5: { key: '5', code: 'Digit5', keyCode: 53, text: '5' },
      6: { key: '6', code: 'Digit6', keyCode: 54, text: '6' },
      7: { key: '7', code: 'Digit7', keyCode: 55, text: '7' },
    };
    const spec = codes[name];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode, text: spec.text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode });
    await sleep(350);
  };
  /** Точка раскладки → точка страницы. */
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
  /** Состояние панели и забега — по полям сцены, а не по пикселям. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    const b = (o) => { if (!o) return null; const r = o.getBounds(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    return JSON.stringify({
      open: g.isActionsOpen, panel: g.actionPanel.isOpen, rows: g.actionPanel.buttons.length,
      tickets: g.tickets, balance: g.balance, debt: g.debt, round: g.round, spins: g.spinsLeft,
      gameOver: g.isGameOver, endScreen: g.isEndScreenOpen, shop: g.isShopOpen, rescue: g.isRescue,
      actionState: g.actionState, canAct: g.canAct(), canUse: g.canUseActions(),
      earned: g.earned, board: b(g.actionBoard.box), rowsBoxes: g.actionPanel.buttons.map(b),
      weightCherry: g.currentSymbolWeight(${asSymbol('cherry')}),
      weightSeven: g.currentSymbolWeight(${asSymbol('seven')}),
      skullShare: g.skullShareNext(),
      grid: (g.lastGrid ?? []).map((row) => row.map((cell) => cell.id)),
      nextDebt: g.nextDebtValue(), debtCut: g.actionState.debtCut,
    });
  })()`)) ?? '{}');
  /** Сетка из символов игры: вишни, семёрки и лимоны — по три каждого вперемешку. */
  const setGrid = async () => {
    const done = await val(`(() => {
      const g = window.__g;
      const C = ${asSymbol('cherry')}, S = ${asSymbol('seven')}, L = ${asSymbol('lemon')};
      g.lastGrid = [[C, S, C], [L, C, L], [S, L, C]];
      return g.lastGrid.flat().length;
    })()`);
    if (done !== 9) throw new Error('не удалось положить сетку: ' + done);
    await sleep(120);
  };
  /** Нажатие строки панели мышью (по её прямоугольнику). */
  const clickRow = async (index) => clickAt(await pagePoint(`g.actionPanel.buttons[${index}].getBounds()`));

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8774/' });
  await sleep(3500);
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru'); localStorage.setItem('dolgovaya-yama-progress', JSON.stringify({ tutorialDone: true, rescueIntroSeen: true, actionsUnlocked: true, patterns: [], achievements: [], runAmulets: [], runAmuletPicks: 1, upgrades: {}, runs: 1 })); 1`);
  await send('Page.reload');
  await sleep(3800);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(700);

  // ---------- А. Вход и закрытие панели ----------
  const a0 = await state();
  check(a0.open === false && a0.panel === false, 'до нажатия панели нет');
  check(a0.board !== null && a0.board.w > 30 && a0.board.h > 200, 'кнопка «ДЕЙСТВИЯ» на корпусе есть: ' + JSON.stringify(a0.board));
  await key('A');
  const a1 = await state();
  check(a1.open === true && a1.panel === true, 'клавиша A открывает панель');
  check(a1.rows === 6, 'в панели шесть строк: ' + a1.rows);
  // Шаг 41: строки и надписи целиком внутри стекла, строка-кнопка не меньше 44×44.
  const listGlass = JSON.parse(await val(`(() => {
    const L = window.__g.actionPanel, S = ${JSON.stringify(LAYOUT.SCREEN)};
    const l = S.x - S.width / 2, t = S.y - S.height / 2, r = S.x + S.width / 2, b = S.y + S.height / 2;
    const rows = L.rows.filter((z) => z.visible).map((z) => z.getBounds());
    const outside = [];
    for (const part of L.parts) {
      if (typeof part.text !== 'string' || part.visible === false) continue;
      const box = part.getBounds();
      if (box.left < l - 0.5 || box.right > r + 0.5 || box.top < t - 0.5 || box.bottom > b + 0.5) outside.push({ text: part.text, box });
    }
    return JSON.stringify({
      rows: rows.length,
      rowsInside: rows.every((z) => z.left >= l - 0.5 && z.right <= r + 0.5 && z.top >= t - 0.5 && z.bottom <= b + 0.5),
      rowsBig: rows.every((z) => z.height >= 44 && z.width >= 44),
      outside: outside.slice(0, 5),
    });
  })()`) ?? '{}');
  check(listGlass.rows === 4 && listGlass.rowsInside === true, 'строки списка целиком внутри стекла (видно ' + listGlass.rows + ')');
  check(listGlass.rowsBig === true, 'каждая строка-кнопка не меньше 44×44');
  check(listGlass.outside.length === 0, 'ни одна надпись не вылезает за стекло' + (listGlass.outside.length ? ': ' + JSON.stringify(listGlass.outside) : ''));
  // Шаг 42: строка не обрезается посреди текста — каждая надпись целиком в своей строке, перенос не сверх лимита.
  const cut = JSON.parse(await val(`(() => {
    const L = window.__g.actionPanel;
    const rows = L.rows.filter((z) => z.visible).map((z) => z.getBounds()).sort((a, b) => a.top - b.top);
    const bad = [];
    for (const part of L.parts) {
      if (typeof part.text !== 'string' || part.visible === false) continue;
      const lines = part.getWrappedText ? part.getWrappedText(String(part.text)).length : 0;
      const max = part.style.maxLines || 0;
      if (max > 0 && lines > max) bad.push('перенос ' + lines + ' > ' + max + ': ' + part.text.slice(0, 30));
      const b = part.getBounds();
      const row = rows.find((r) => (b.top + b.bottom) / 2 > r.top + 2 && (b.top + b.bottom) / 2 < r.bottom - 2);
      if (row && b.bottom > row.bottom + 0.5) bad.push('вылезло ниже строки: ' + part.text.slice(0, 30));
      if (row && b.top < row.top - 0.5) bad.push('вылезло выше строки: ' + part.text.slice(0, 30));
    }
    return JSON.stringify({ rows: rows.length, bad });
  })()`) ?? '{}');
  check(cut.bad.length === 0, 'нет обрезки посреди строки: все надписи целиком в строках (' + cut.rows + ' строк)' + (cut.bad.length ? ': ' + JSON.stringify(cut.bad) : ''));
  // Шаг 42: недоступная строка погашена — название вполнакала, плашка неактивная, причина серой подписью у кнопки.
  const den = JSON.parse(await val(`(() => {
    const L = window.__g.actionPanel;
    const title = L.parts.find((p) => p.text === 'ОБМЕН СИМВОЛА');
    const offPlates = L.parts.filter((p) => p.type === 'Image' && p.texture && p.texture.key === 'screen-list-button-off').length;
    const reasons = L.parts.filter((p) => typeof p.text === 'string' && p.style && p.style.fontSize === '11px' && p.style.color === '#8d8174').map((p) => p.text);
    // Наведение на недоступную строку не подсвечивает её: слой строк перерисовывается так же, как без наведения.
    const len = () => L.strips.commandBuffer.length;
    L.rows.forEach((zone) => zone.emit('pointerout'));
    const base = len();
    L.rows[0].emit('pointerover'); // обмен: первая строка в начале раунда недоступна
    const denied = len();
    L.rows[0].emit('pointerout');
    L.rows[3].emit('pointerover'); // кража доступна всегда
    const enabled = len();
    L.rows[3].emit('pointerout');
    return JSON.stringify({ alpha: title ? title.alpha : null, offPlates, reasons, base, denied, enabled });
  })()`) ?? '{}');
  check(den.alpha !== null && den.alpha <= 0.5, 'недоступная строка: название вполнакала (alpha ' + den.alpha + ')');
  check(den.offPlates >= 2, 'недоступные строки: плашка в неактивной палитре (' + den.offPlates + ')');
  check(den.reasons.length >= 2 && den.reasons.every((text) => typeof text === 'string' && text.length > 3), 'у кнопки серым написана причина: ' + JSON.stringify(den.reasons));
  check(den.denied === den.base && den.enabled > den.base, 'наведение на недоступную строку не подсвечивает (' + den.base + ' → ' + den.denied + '), а на доступную — да (' + den.enabled + ')');
  check((await val('window.__g.actionBoard.label.text')) === 'Д\nЕ\nЙ\nС\nТ\nВ\nИ\nЯ', 'кнопка подписана по-русски, столбиком');
  const ruTitle = await val("window.__g.actionPanel.parts.some((part) => part.text === 'ДЕЙСТВИЯ ВНЕ ПРОКРУТКИ')");
  check(ruTitle === true, 'RU: заголовок панели — ДЕЙСТВИЯ ВНЕ ПРОКРУТКИ');
  const ruRisk = await val("window.__g.actionPanel.parts.some((part) => String(part.text).includes('KABOOM'))");
  check(ruRisk === true, 'RU: у кражи явное предупреждение о KABOOM');
  await shot('actions-ru-panel.png');
  // Пробел закрывает панель и не крутит: прокрутки не изменились.
  await key('Space');
  const a2 = await state();
  check(a2.open === false && a2.panel === false, 'Пробел закрывает панель');
  check(a2.spins === a1.spins, 'и прокрутку не тратит: ' + a2.spins);
  check(a2.canAct === true, 'ввод у автомата снова свободен (canAct)');
  // Esc, «0» и ✕ — то же самое.
  await key('A');
  await key('Escape');
  check((await state()).open === false, 'Esc закрывает панель');
  await key('A');
  await key('0');
  check((await state()).open === false, 'клавиша «0» закрывает панель');
  await key('A');
  const closePoint = await pagePoint('g.actionPanel.closeZone ? g.actionPanel.closeZone.getBounds() : { centerX: 0, centerY: 0 }');
  await clickAt(closePoint);
  check((await state()).open === false, 'крестик закрывает панель');
  // Табличка на стене — тоже вход.
  await clickAt(await pagePoint('g.actionBoard.box.getBounds()'));
  check((await state()).open === true, 'клик по табличке открывает панель');
  await key('Escape');

  // ---------- Б. Обмен символа ----------
  await val('window.__g.tickets = 5; window.__g.balance = 400; window.__g.refreshHud(); 1');
  await setGrid();
  await key('A');
  await key('1'); // ОБМЕН СИМВОЛА
  const b1 = await state();
  check(b1.rows === 3, 'выбор «что убрать» — три символа сетки (вишня, семёрка, лимон): ' + b1.rows);
  await key('1'); // первая строка — вишня (порядок обхода сетки)
  const b2 = await state();
  const machine = await val('window.__g.machineSymbols().map((s) => s.id)');
  check(b2.rows === machine.length - 1, 'замены — все платящие символы автомата, кроме выбранного: ' + b2.rows);
  await key(String(machine.filter((sid) => sid !== 'cherry').indexOf('seven') + 1)); // семёрка
  const b3 = await state();
  check(b3.tickets === 3, 'обмен списал два билета: 5 → ' + b3.tickets);
  check(b3.actionState.exchange !== null && b3.actionState.exchange.from === 'cherry' && b3.actionState.exchange.to === 'seven', 'обмен записан: ' + JSON.stringify(b3.actionState.exchange));
  check(b3.grid.flat().filter((cell) => cell === 'cherry').length === 0, 'сетка перерисована: вишен на экране нет');
  check(b3.grid.flat().filter((cell) => cell === 'seven').length === 6, 'вишни стали семёрками: ' + b3.grid.flat().filter((cell) => cell === 'seven').length);
  check(Math.abs(b3.weightCherry - b3.weightSeven) < 1e-9 || b3.weightCherry !== 30, 'веса поменялись: вишня ' + b3.weightCherry + ', семёрка ' + b3.weightSeven);
  check((await state()).open === false && (await state()).canAct === true, 'после действия панель закрыта, автомат свободен');
  // Повторно в том же раунде — нельзя и билеты не списываются.
  await key('A');
  const b4 = await state();
  check(b4.rows === 6, 'панель снова открыта');
  await key('1');
  const b5 = await state();
  check(b5.tickets === 3, 'обмен второй раз в раунде не проходит, билеты целы');
  check(b5.panel === true, 'и панель остаётся на месте');
  await key('Escape');

  // ---------- В. Лотерея ----------
  await val('window.__g.lotteryRandom = () => 0.1; 1'); // баф, первый в пуле — выигрыш +25%
  await key('A');
  await key('2');
  const c1 = await state();
  check(c1.tickets === 2, 'лотерея списала один билет: 3 → ' + c1.tickets);
  check(c1.actionState.lottery !== null && c1.actionState.lottery.id === 'win-up', 'жребий подставлен: ' + JSON.stringify(c1.actionState.lottery));
  check((await val('window.__g.actionState.lottery.winMul')) === 1.25, 'выигрыш раунда +25% (winMul лотереи)');
  check((await state()).open === false, 'после лотереи панель закрыта');
  await val('window.__g.refreshHud(); 1');

  // ---------- Г. Обслуживание автомата ----------
  const beforeService = await state();
  const servicePrice = ACT.servicePrice(beforeService.debt);
  await key('A');
  await key('3');
  const d1 = await state();
  check(d1.balance === beforeService.balance - servicePrice, `обслуживание списало ${servicePrice}: ${beforeService.balance} → ${d1.balance}`);
  check(d1.actionState.serviceRounds === ACT.ACTION_SERVICE_ROUNDS, 'чистка идёт два раунда: ' + d1.actionState.serviceRounds);
  check(d1.skullShare < beforeService.skullShare, `доля черепов ниже: ${beforeService.skullShare.toFixed(3)} → ${d1.skullShare.toFixed(3)}`);
  // Второй раз — нельзя: строка погашена.
  await key('A');
  await key('3');
  const d2 = await state();
  check(d2.balance === d1.balance, 'второе обслуживание в том же раунде денег не берёт');
  check(d2.panel === true, 'и панель остаётся');
  // Новый раунд: чистка тикает (2 → 1), одноразовые снова доступны.
  await key('Escape');
  await val('window.__g.startRound(); window.__g.refreshHud(); 1');
  await sleep(600);
  const d3 = await state();
  check(d3.actionState.serviceRounds === 1, 'в следующем раунде чистка ещё работает: ' + d3.actionState.serviceRounds);
  check(d3.actionState.used.length === 0, 'одноразовые действия в новом раунде доступны: ' + JSON.stringify(d3.actionState.used));
  check(d3.actionState.exchange === null && d3.actionState.lottery === null, 'обмен и лотерея жили до конца раунда');
  check(d3.skullShare < beforeService.skullShare, 'доля черепов всё ещё ниже: ' + d3.skullShare.toFixed(3));

  // ---------- Д. Продажа символа ----------
  await setGrid();
  // Шаг 38 (DONTLIKE п.4): цена продажи соразмерна текущему разгону — ставим серию 4, значит множитель ×5.
  await val('window.__g.streak = 4; window.__g.refreshHud(); 1');
  await sleep(200);
  const e0 = await state();
  const saleMultiplier = await val('window.__g.multiplier()');
  check(saleMultiplier === 5, `продажа: множитель серии ×5 (${saleMultiplier})`);
  await key('A');
  await key('5');
  const e1 = await state();
  check(e1.rows === 3, 'на продажу — три символа сетки: ' + e1.rows);
  const saleNotes = JSON.parse((await val('JSON.stringify(window.__g.actionPanel.data.map((row) => row.title))')) ?? '[]');
  check(saleNotes.every((note) => !note.includes('× ×')), 'подсказка продажи без двойного «×»: ' + (saleNotes[0] ?? ''));
  await key('1'); // вишня
  const e2 = await state();
  const salePrice = ACT.salePrice(symbolById('cherry'), 4, saleMultiplier);
  check(e2.balance === e0.balance + salePrice, `продажа дала ${salePrice} за 4 клетки на ×${saleMultiplier}: ${e0.balance} → ${e2.balance}`);
  check(salePrice === ACT.salePrice(symbolById('cherry'), 4) * 5, 'и это ровно впятеро больше базовой цены за клетки');
  check(e2.actionState.sold.includes('cherry'), 'вишня ушла из автомата до конца раунда: ' + JSON.stringify(e2.actionState.sold));
  check(e2.weightCherry === 0, 'проданная вишня не выпадает: вес ' + e2.weightCherry);
  check((await val('window.__g.currentSkullShare()')) > 0, 'доля черепов считается по новому составу автомата');

  // ---------- Е. Долговая биржа ----------
  await val('window.__g.balance = 100000; window.__g.refreshHud(); 1');
  const f0 = await state();
  const nextDebt = DEALER.shopDebt(f0.debt, f0.round + 1, 1, false, 1).debt;
  const buyPrice = ACT.debtBuyPrice(nextDebt);
  const buyCut = ACT.debtBuyCut(nextDebt);
  await key('A');
  await key('6');
  const f1 = await state();
  check(f1.balance === f0.balance - buyPrice, `биржа списала ${buyPrice}: ${f0.balance} → ${f1.balance}`);
  check(f1.actionState.debtCut === buyCut, 'выкупленная доля записана: ' + f1.actionState.debtCut);
  // Магазин применит срез на открытии следующего раунда — зовём ту же дверь, что openShop.
  const applied = await val(`(() => { const g = window.__g; g.round += 1; g.applyShopDebt(false); const after = g.debt; g.round -= 1; return after; })()`);
  check(applied === nextDebt - buyCut, `следующий долг: ${applied} (ожидали ${nextDebt} − ${buyCut} = ${nextDebt - buyCut})`);
  check((await val('window.__g.actionState.debtCut')) === 0, 'выкуп применён один раз');

  // ---------- Ж. Кража ----------
  await val('window.__g.actionState = { ...window.__g.actionState, used: [] }; window.__g.theftRandom = () => 0.1; 1');
  const g0 = await state();
  const theftReward = ACT.theftReward(g0.debt);
  await key('A');
  await key('4');
  const g1 = await state();
  check(g1.balance === g0.balance + theftReward, `успешная кража дала ${theftReward}: ${g0.balance} → ${g1.balance}`);
  check(g1.actionState.used.includes('theft'), 'кража в раунде потрачена');
  check(g1.gameOver === false, 'после успеха забег идёт дальше');
  // Гонка новостей: отложенная новость о смене автомата не должна затирать «УКРАЛ!» через 1,5 с.
  const race = JSON.parse((await val(`(() => { const g = window.__g;
    g.actionState = { ...g.actionState, used: [] };
    g.machineNewsTimer?.remove(false);
    g.machineNewsTimer = g.time.delayedCall(1500, () => { g.machineNewsTimer = null; g.announceMachine(); });
    const timer = Boolean(g.machineNewsTimer);
    g.theftRandom = () => 0; g.isActionsOpen = true; g.applyTheft();
    const cleared = g.machineNewsTimer === null;
    const news = (g.screen.news?.parts ?? []).filter((part) => typeof part.text === 'string').map((part) => part.text).join(' ');
    return JSON.stringify({ timer, cleared, news });
  })()`)) ?? '{}');
  check(race.timer === true && race.cleared === true, 'новость действия гасит отложенную новость о смене автомата');
  check(/УКРАЛ/.test(race.news ?? ''), `после кражи на стекле «УКРАЛ!», а не название автомата (${race.news})`);
  // Провал: сразу смерть, без очков и без магазина.
  await val('window.__g.actionState = { ...window.__g.actionState, used: [] }; window.__g.theftRandom = () => 0.99; 1');
  const h0 = await state();
  await key('A');
  await key('4');
  const h1 = await state();
  check(h1.gameOver === true, 'провал кражи — KABOOM сразу');
  check(h1.balance === h0.balance && h1.earned === h0.earned, 'за провал ничего не начислено');
  check(h1.shop === false, 'магазина после провала нет');
  await shot('actions-ru-theft-fail.png');
  await sleep(4200);
  const h2 = await state();
  check(h2.endScreen === true, 'экран смерти открылся');
  check(h2.shop === false, 'магазин не открылся и позже');
  // После смерти — «ЗАНОВО»: новый забег, действий нет.
  await val('window.__g.restartGame(); 1');
  await sleep(4200);
  const h3 = await state();
  check(h3.gameOver === false && h3.actionState.used.length === 0, 'новый забег чист: действий нет');
  await val('window.__g.finishTutorial(); 1');
  await sleep(400);

  // ---------- И. «ТЕСТ» и спасение ----------
  await val('window.__g.devUsedThisRun = true; window.__g.tickets = 5; window.__g.balance = 400; window.__g.refreshHud(); 1');
  await key('A');
  const i1 = await state();
  check(i1.rows === 6, 'в ТЕСТ панель открывается');
  await key('2'); // лотерея
  const i2 = await state();
  check(i2.tickets === 5 && i2.actionState.lottery === null, 'в ТЕСТ действие не даёт выгоды и не тратит билеты');
  check(i2.open === true, 'и панель остаётся открытой');
  await key('Escape');
  await val('window.__g.devUsedThisRun = false; 1');
  // Спасение: действовать нельзя, панель не открывается.
  await val('window.__g.isRescue = true; 1');
  await key('A');
  check((await state()).open === false, 'в раунде спасения панель не открывается');
  await val('window.__g.isRescue = false; window.__g.refreshHud(); 1');

  // ---------- К. Телефон 390×844 ----------
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
  await send('Page.reload');
  await sleep(4200);
  await val(`localStorage.setItem('dolgovaya-yama-progress', JSON.stringify({ tutorialDone: true, rescueIntroSeen: true, actionsUnlocked: true, patterns: [], achievements: [], runAmulets: [], runAmuletPicks: 1, upgrades: {}, runs: 1 })); 1`);
  await send('Page.reload');
  await sleep(4200);
  await val('window.__g.finishTutorial(); 1');
  await sleep(500);
  await key('A');
  const k1 = await state();
  const rows = k1.rowsBoxes ?? [];
  const inside = rows.length === 6 && rows[0].x >= 0 && rows[0].right <= LAYOUT.VIEW_WIDTH && rows[5].bottom <= LAYOUT.VIEW_HEIGHT && rows[0].y >= 0;
  check(k1.rows === 6, 'телефон: панель открылась, шесть строк');
  check(inside, `телефон 390×844: все строки внутри вида (первая ${JSON.stringify(rows[0])}, последняя ${JSON.stringify(rows[5])})`);
  await shot('actions-phone.png');
  await key('Escape');

  // ---------- Л. Английский ----------
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setEmulatedMedia', { features: [] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'en')`);
  await send('Page.reload');
  await sleep(4200);
  await val('window.__g.finishTutorial(); 1');
  await sleep(400);
  await key('A');
  const titleEn = await val("[...document.querySelectorAll('canvas')].length ? window.__g.actionPanel.buttons.length : 0");
  check(titleEn === 6, 'EN: панель тоже шесть строк');
  const enTitle = await val("window.__g.actionPanel.parts.some((part) => part.text === 'BETWEEN SPINS')");
  check(enTitle === true, 'EN: заголовок панели — BETWEEN SPINS');
  const enRisk = await val("window.__g.actionPanel.parts.some((part) => String(part.text).includes('KABOOM'))");
  check(enRisk === true, 'EN: у кражи предупреждение о провале');
  await shot('actions-en-panel.png');
  await key('Escape');
  check((await state()).open === false, 'EN: Esc закрывает');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

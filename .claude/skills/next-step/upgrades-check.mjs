/**
 * Проверка экрана улучшений после смерти (шаг 28) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/upgrades-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в тот же scratchpad, профиль Chrome — в scratchpad/prof-upgrades.
 *
 * Правило (DONTLIKE §1, решение автора): после смерти — и только после неё — три улучшения из пула,
 * одно берётся бесплатно, второе — за 6 билетов из остатка погибшего забега. Каждое берётся один раз;
 * купленное живёт в localStorage (dolgovaya-yama-progress, поле upgrades) и действует со следующего забега.
 * Куплено всё — экрана нет.
 *
 * Что проверяет:
 *  1) до смерти экрана нет;
 *  2) после KABOOM — три карточки, заголовок и подпись на языке игры, ввод игры (Пробел) не проходит;
 *  3) клавиша «1» берёт бесплатное: покупка уходит в localStorage, билеты не тратятся;
 *  4) хватает 6 билетов — остаются две карточки второй фазы; клик по второй списывает ровно 6;
 *  5) билетов меньше 6 — после бесплатного экран закрывается сам;
 *  6) новый забег получил эффекты покупок: числа сверяются с таблицей в сценарии, а не с upgradeEffects;
 *  7) осталось два улучшения — показываются две карточки (экран не пустой);
 *  8) куплено всё — экрана после смерти нет вовсе;
 *  9) вторая партия (28б): старт с билетом, +1 место, скидка на предметы, скидка на амулеты, бесплатное гнездо,
 *     редкий амулет в первом магазине;
 * 10) №27: копия сверх базового потолка покупается, вторая сверх нового — нет;
 * 11) №30: на старте забега из прошлого берут два амулета вместо одного (шаг 38);
 * 12) третья партия (28в): №31 доля черепов −1 п.п., №33 панель выбора первого символа и блокировка игры;
 * 13) №37 четыре ряда витрины, №38 билет 30% (и скидка №36), №40 подарок на полке без списания фишек;
 * 14) №39 амулет за фишки: мини-чемодан на два места слева, цена — доля рук, отказ второй раз за забег;
 * 14б) DONTLIKE п.7/п.8: у основного чемодана нет переключателя валюты, у мини-автомата нет дверцы —
 *      товар и цены видны сразу, покупка падает в плашку выдачи, клик по плашке её забирает;
 * 15) №42/№45 откат: серия 9 пережила перемотку, 10 билетов на записи + 4 потраченных вернулись как 14;
 * 16) №44 кассета в магазине за 0 билетов;
 * 17) №46 «5% рекорда» удалён шагом 38: старое сохранение с ним читается как «не куплено», стартовый баланс 0;
 * 18) №47 «билет за ачивку» удалён шагом 38: ачивка билетов не даёт, старое сохранение читается;
 * 19) №48 сорок начал раунда без смены автомата;
 * 20) №49 панель трёх автоматов, выбор и порядок «автомат → символ» вместе с №33;
 * 21) №50 плашка отмены черепа: кон и серия целы, второй отмены нет, в спасении нельзя.
 * Порт 8773 — свой: dev-сервер 5173 и порты 8766/8767/8770/8771/8772 других сценариев не трогаем.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node upgrades-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
mkdirSync(SP, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8773', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9340', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-upgrades', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROGRESS_KEY = 'dolgovaya-yama-progress';
/** Ожидаемые числа каждого улучшения — из ТЗ шага 28, не из upgradeEffects: так тест ловит ошибку в игре. */
const EFFECTS = {
  'spin-first-round': { firstRoundSpins: 1 },
  'spin-cap': { spinCapBonus: 2 },
  'spin-skull-free': { freeSpinAfterFirstSkull: true },
  'debt-start': { startDebtMul: 0.95 },
  'debt-growth': { debtGrowthMul: 3.4 / 3.6 },
  'debt-forgive': { debtForgiveEveryRuns: 5 },
  'debt-defer': { deferOnce: true },
  'win-patterns': { winMul: 1.05 },
  'win-interest': { interestBonus: 0.05 },
  'win-piggy': { piggyBonus: 1 },
  'win-insurance': { insuranceShare: 0.8 },
  // Вторая партия (28б): билеты, предметы, амулеты.
  'ticket-start': { startTickets: 1 },
  'ticket-third-debt': { debtTicketBonus: 1 },
  'ticket-jackpot': { jackpotTickets: 1 },
  'item-slot': { itemSlots: 1 },
  'item-price': { itemPriceMul: 0.9 },
  'item-clover-weight': { cloverWeight: 1 },
  'item-cherry-weight': { cherryWeight: 1 },
  'item-hammer-empty': { keepsHammerOnEmpty: true },
  'amulet-price': { amuletTicketsOff: 1 },
  'amulet-copy': { amuletMaxCopies: 1 },
  'amulet-first-socket': { firstSocketFree: true },
  'amulet-first-rare': { rareAmuletFirstShop: true },
  'amulet-survives-death': { deathAmuletSave: true }, // шаг 38: на старте можно взять два амулета из прошлого забега
  // Третья партия (28в): сетка и магазин.
  'grid-skull-share': { skullShareDelta: -0.01 },
  'grid-start-joker': { startJoker: true },
  'grid-start-symbol': { startSymbolPick: true },
  'grid-jackpot': { jackpotWinMul: 1.2 },
  'grid-blood-weight': { bloodWeight: 2 },
  'shop-discount': { shopPriceMul: 0.9 },
  'shop-extra-row': { offerRows: 1 },
  'shop-ticket-share': { ticketShareStart: 0.3 },
  'shop-amulet-chips': { miniCasePriceMul: 0.5 },
  'shop-gift-item': { freeItemFirstShop: true },
  // Четвёртая партия (28г): кассета и прочее.
  'tape-keeps-streak': { rewindKeepsStreak: true },
  'tape-free': { freeTape: true },
  'tape-refund-tickets': { rewindRefundsTickets: true },
  'machine-no-swap': { noMachineSwap: true },
  'machine-start-pick': { startMachinePick: true },
  'skull-cancel': { skullCancelOnce: true },
};
/** Все id пула — для сценария «куплено всё» и «осталось два». */
const ALL_IDS = Object.keys(EFFECTS);
/** Полный набор покупок: «Ещё копия» берётся дважды (repeat 2), иначе после смерти остаётся одна карточка. */
const ALL_PURCHASES = { ...Object.fromEntries(ALL_IDS.map((id) => [id, 1])), 'amulet-copy': 2 };

try {
  let tabs;
  for (let i = 0; i < 30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9340/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9340 занят?');
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
  /** Клавиша: как настоящий ввод браузера (Пробел, «1», «2», «9», «T», «B»), а не вызов метода сцены. */
  const key = async (name) => {
    const codes = {
      Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
      0: { key: '0', code: 'Digit0', keyCode: 48, text: '0' },
      1: { key: '1', code: 'Digit1', keyCode: 49, text: '1' },
      2: { key: '2', code: 'Digit2', keyCode: 50, text: '2' },
      9: { key: '9', code: 'Digit9', keyCode: 57, text: '9' },
      T: { key: 't', code: 'KeyT', keyCode: 84, text: 't' },
      B: { key: 'b', code: 'KeyB', keyCode: 66, text: 'b' },
      C: { key: 'c', code: 'KeyC', keyCode: 67, text: 'c' },
    };
    const spec = codes[name];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode, text: spec.text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode });
    await sleep(400);
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
    await sleep(500);
  };
  const clickCard = async (index) => clickAt(await pagePoint(`g.upgradeScreen.rows[${index}].getBounds()`));
  /** Состояние экрана улучшений — по полям сцены, а не по пикселям. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    const texts = g.children.list.filter((o) => o.type === 'Text').map((o) => o.text);
    return JSON.stringify({
      gameOver: g.isGameOver,
      open: g.upgradeScreen.isOpen,
      cards: g.upgradeScreen.rows.length,
      offers: g.upgradeOfferList.map((u) => u.id),
      second: g.upgradeSecondPhase,
      tickets: g.tickets,
      effectCount: Object.keys(g.upgrades).length,
      effects: g.upgradeEffects,
      purchases: (() => { try { const p = JSON.parse(localStorage.getItem('${PROGRESS_KEY}') ?? 'null'); return p ? p.upgrades ?? {} : {}; } catch { return 'broken'; } })(),
      texts,
    });
  })()`)) ?? '{}');
  /** Состояние прогресса в localStorage (до перезагрузки страницы). */
  // Покупки для нового забега. Память амулетов очищается: иначе список на старте висел бы поверх сценария.
  const setPurchases = async (purchases) => {
    await val(`(() => { const p = JSON.parse(localStorage.getItem('${PROGRESS_KEY}') ?? 'null') ?? {};
      p.upgrades = ${JSON.stringify(purchases)}; p.tutorialDone = true; p.runAmulets = []; p.runAmuletPicks = 1;
      localStorage.setItem('${PROGRESS_KEY}', JSON.stringify(p)); return 1; })()`);
  };
  const reload = async () => { await send('Page.reload'); await sleep(4000); };
  /** Стартовые выборы забега: автомат (№49), память амулетов (шаг 38), символ (№33) — порядок как в игре.
   *  Память здесь закрываем отказом: блоки проверяют другое, а амулеты им не нужны. */
  const passPicks = async () => {
    await val('if (window.__g.machinePick.isOpen) window.__g.machinePick.press(0); 1');
    await sleep(300);
    await val('if (window.__g.amuletPick.isOpen) window.__g.amuletPick.press(9); 1');
    await sleep(300);
    await val('if (window.__g.symbolPick.isOpen) window.__g.symbolPick.press(0); 1');
    await sleep(300);
  };
  /** Смерть: KABOOM 1,8 с + взрыв 0,9 с + затемнение 0,7 с — но ждём не «по часам», а пока экран улучшений
   *  (или сам экран смерти, если предлагать нечего) действительно не появится: в headless бывает медленнее. */
  const die = async () => {
    await val('window.__g.finishTutorial(); window.__g.kaboom(); 1');
    for (let i = 0; i < 48; i++) {
      if (await val('window.__g.canRestartWithSpace === true')) break; // экран смерти дорисован (после KABOOM)
      await sleep(250);
    }
    await sleep(400);
  };
  const restart = async () => { await val('window.__g.restartGame(); 1'); await sleep(4200); await passPicks(); };
  const setTickets = async (count) => { await val(`window.__g.tickets = ${count}; window.__g.refreshHud(); 1`); await sleep(200); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8773/' });
  await sleep(3500);
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru'); localStorage.removeItem('${PROGRESS_KEY}'); 1`);
  await reload();
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');

  // ---------- 1–3: три карточки, ввод игры закрыт, бесплатное улучшение и второе за 6 ----------
  const before = await state();
  check(before.open === false && before.cards === 0, 'до смерти экрана улучшений нет');
  await setTickets(10);
  await die();
  const s1 = await state();
  check(s1.gameOver === true && s1.open === true, 'после KABOOM экран улучшений открыт');
  check(s1.cards === 3 && s1.offers.length === 3, 'три карточки из пула: ' + JSON.stringify(s1.offers));
  check(s1.texts.includes('УЛУЧШЕНИЯ'), 'RU: заголовок экрана — УЛУЧШЕНИЯ');
  check(s1.texts.includes('Возьми одно бесплатно'), 'RU: подпись «Возьми одно бесплатно» (без подсказки клавиш)');
  check(!s1.texts.some((text) => /1–3|0 или|✕ —/.test(String(text))), 'RU: подсказок про клавиши на экране улучшений нет');
  check(s1.second === false && s1.effectCount === 0, 'до выбора ничего не куплено');
  // Шаг 41: строки и надписи целиком внутри стекла, строка-кнопка не меньше 44×44.
  const upgGlass = JSON.parse(await val(`(() => {
    const L = window.__g.upgradeScreen, S = ${JSON.stringify({ x: 569, y: 314, width: 460, height: 288 })};
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
  check(upgGlass.rows === 3 && upgGlass.rowsInside === true, 'строки улучшений целиком внутри стекла (' + upgGlass.rows + ')');
  check(upgGlass.rowsBig === true, 'строка улучшения — кнопка не меньше 44×44');
  check(upgGlass.outside.length === 0, 'ни одна надпись улучшений не вылезает за стекло' + (upgGlass.outside.length ? ': ' + JSON.stringify(upgGlass.outside) : ''));
  // Шаг 42: ритм строк — перенос не сверх лимита, каждая надпись целиком в своей строке.
  const cut = JSON.parse(await val(`(() => {
    const L = window.__g.upgradeScreen;
    const rows = L.rows.filter((z) => z.visible).map((z) => z.getBounds()).sort((a, b) => a.top - b.top);
    const bad = [];
    for (const part of L.parts) {
      if (typeof part.text !== 'string' || part.visible === false) continue;
      const lines = part.getWrappedText ? part.getWrappedText(String(part.text)).length : 0;
      const max = part.style.maxLines || 0;
      if (max > 0 && lines > max) bad.push('перенос ' + lines + ' > ' + max + ': ' + part.text.slice(0, 30));
      const b = part.getBounds();
      const row = rows.find((r) => (b.top + b.bottom) / 2 > r.top + 2 && (b.top + b.bottom) / 2 < r.bottom - 2);
      if (row && (b.bottom > row.bottom + 0.5 || b.top < row.top - 0.5)) bad.push('вылезло из строки: ' + part.text.slice(0, 30));
    }
    return JSON.stringify({ rows: rows.length, heights: rows.map((r) => Math.round(r.height)), bad });
  })()`) ?? '{}');
  check(cut.bad.length === 0 && cut.heights.every((h) => h === 56), 'улучшения: строки по 56 px, надписи целиком в строках' + (cut.bad.length ? ': ' + JSON.stringify(cut.bad) : ''));
  // Шаг 42: итоги — на гравированной полоске, «ЗАНОВО» — ниже; ничего не перекрывается.
  const endLayout = JSON.parse(await val(`(() => {
    const g = window.__g;
    const texts = [];
    const walk = (list) => { for (const o of list) { if (o.type === 'Text') texts.push(o); if (o.list) walk(o.list); } }; // «ЗАНОВО» лежит в контейнере кнопки
    walk(g.children.list);
    const score = texts.find((o) => String(o.text).includes('Долгов закрыто'));
    const again = texts.find((o) => o.text === 'ЗАНОВО');
    const box = (o) => { const b = o.getBounds(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
    return JSON.stringify({ score: score ? box(score) : null, again: again ? box(again) : null });
  })()`) ?? '{}');
  check(endLayout.score !== null && endLayout.again !== null, 'на экране смерти есть итоги и «ЗАНОВО»');
  check(Boolean(endLayout.score && endLayout.again && endLayout.score.bottom + 4 <= endLayout.again.top),
    'итоги и «ЗАНОВО» не перекрываются: итоги до ' + (endLayout.score && endLayout.score.bottom) + ', кнопка с ' + (endLayout.again && endLayout.again.top));
  check(Boolean(endLayout.score && endLayout.score.top >= 480 && endLayout.again && endLayout.again.bottom <= 600),
    'итоги и кнопка на плите под экраном, в поле 480…600');
  await shot('upgrades-ru-cards.png');
  // Пробел на этом экране игру не двигает: экран остаётся, забег не начинается заново.
  await key('Space');
  const blocked = await state();
  check(blocked.open === true && blocked.gameOver === true, 'Пробел не закрывает экран и не начинает забег');
  // Клавиша «1» — бесплатное улучшение первой карточки.
  const firstOffer = s1.offers[0];
  await key('1');
  const s2 = await state();
  check(s2.purchases[firstOffer] === 1, `клавиша «1» купила ${firstOffer} и записала в localStorage`);
  check(s2.tickets === 10, 'за бесплатное билеты не списаны (10)');
  check(s2.second === true && s2.cards === 2, 'вторая фаза: две карточки за 6 билетов');
  check(s2.texts.some((text) => text.includes('Второе — 6 билетов')), 'RU: подпись второй фазы про 6 билетов');
  await shot('upgrades-ru-second.png');
  // Клик по второй карточке: 10 − 6 = 4 билета.
  const secondOffer = s2.offers[1];
  await clickCard(1);
  const s3 = await state();
  check(s3.purchases[secondOffer] === 1, `клик купил ${secondOffer}`);
  check(s3.tickets === 4 && s3.tickets === s2.tickets - 6, 'второе улучшение стоило ровно 6 билетов (10 → 4)');
  check(s3.open === false && s3.cards === 0, 'после второго выбора экран закрыт — дальше обычное «ЗАНОВО»');
  await shot('upgrades-ru-after.png');

  // ---------- 6: покупки действуют со следующего забега ----------
  const purchased = s3.purchases;
  await restart();
  const next = await state();
  const expected = {};
  for (const [upgradeId, gain] of Object.entries(EFFECTS)) {
    if (!purchased[upgradeId]) continue;
    for (const [field, value] of Object.entries(gain)) expected[field] = value;
  }
  check(next.effectCount === Object.keys(purchased).length, 'новый забег прочитал покупки: ' + Object.keys(purchased).join(', '));
  for (const [field, value] of Object.entries(expected)) {
    const actual = next.effects[field];
    const fits = typeof value === 'boolean' ? actual === value : Math.abs(actual - value) < 1e-9;
    check(fits, `эффект ${field} = ${String(actual)} (ждём ${String(value)})`);
  }
  // Числа следующего долга: рост долга (№7) и стартовый долг (№6) — не зеркало, а расчёт по формуле игры.
  if (purchased['debt-start']) check((await val('window.__g.debt')) === 140, 'первый долг 140 после «стартовый долг −5%»');
  check(next.open === false, 'в новом забеге экрана улучшений нет');

  // ---------- 7: осталось два улучшения — две карточки ----------
  const rest = { ...Object.fromEntries(ALL_IDS.filter((upgradeId) => upgradeId !== 'win-piggy' && upgradeId !== 'win-insurance').map((upgradeId) => [upgradeId, 1])), 'amulet-copy': 2 };
  await setPurchases(rest);
  await reload();
  // Среди купленного есть №49 и №33: забег начинается с выбора автомата, потом символа — их надо пройти.
  await passPicks();
  await setTickets(3); // меньше 6: вторая фаза закрывается сама
  await die();
  const tail = await state();
  check(tail.open === true && tail.cards === 2, 'осталось два улучшения — две карточки');
  check(JSON.stringify(tail.offers.slice().sort()) === JSON.stringify(['win-insurance', 'win-piggy']), 'предложены именно оставшиеся: ' + JSON.stringify(tail.offers));
  await shot('upgrades-ru-tail.png');
  await key('1');
  const tailAfter = await state();
  check(tailAfter.open === false, 'билетов меньше 6 — после бесплатного экран закрылся');
  check(tailAfter.tickets === 3, 'билеты не тронуты (3)');

  // ---------- 8: куплено всё — экрана нет ----------
  await restart();
  await setPurchases(ALL_PURCHASES);
  await reload();
  await passPicks(); // №49 и №33 в полном наборе
  await setTickets(10);
  await die();
  const done = await state();
  check(done.gameOver === true && done.open === false && done.cards === 0, 'куплено всё — экрана улучшений после смерти нет');
  await shot('upgrades-ru-all.png');

  // ---------- 9: вторая партия (28б) — старт, скидки, место, гнездо, редкий амулет ----------
  const batchB = {
    'ticket-start': 1, 'item-slot': 1, 'item-price': 1, 'amulet-price': 1, 'amulet-copy': 1,
    'amulet-first-socket': 1, 'amulet-first-rare': 1, 'amulet-survives-death': 1,
  };
  await setPurchases(batchB);
  await reload();
  check((await val('window.__g.tickets')) === 1, '№16: забег начинается с одним билетом');
  check((await val('window.__g.slots')) === 3 && (await val('window.__g.shelf.length')) === 3, '№21: на полке 3 места');
  check(Math.abs((await val('window.__g.upgradeEffects.itemPriceMul')) - 0.9) < 1e-9, '№22: множитель цены предметов 0,9');
  // Магазин 1 — как в игре после первого долга: openShop двигает раунд на 2 и считает долг 540.
  await val('window.__g.balance = 100000; window.__g.tickets = 99; window.__g.openShop(); 1');
  await sleep(5200);
  const shop = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    open: g.isShopOpen, shopping: g.isShopping, round: g.round, debt: g.debt,
    items: g.offer.map((item) => (item ? { id: item.id, share: item.priceShare } : null)),
    prices: g.shop.prices,
    slotPrice: g.miniShop.prices[0], socketPrice: g.miniShop.prices[1],
    amulets: g.amuletOffer.map((amulet) => (amulet ? { id: amulet.id, rarity: amulet.rarity, price: amulet.price ?? null, maxCopies: amulet.maxCopies } : null)),
    amuletPrices: g.amuletCase.prices,
  }); })()`)) ?? '{}');
  check(shop.open === true && shop.shopping === true, 'магазин 1 открыт: панель встала');
  check(shop.round === 2 && shop.debt > 0, 'магазин 1 — перед вторым раундом');
  // №22: цена предмета — доля долга × 0,9, округление до 5 и не ниже 5 (roundPrice).
  const discounted = (share) => Math.max(5, Math.round((share * shop.debt * 0.9) / 5) * 5);
  const fullPrice = (share) => Math.max(5, Math.round((share * shop.debt) / 5) * 5);
  const rows = (shop.items ?? []).map((item, row) => (item ? { ...item, row } : null)).filter((item) => item !== null);
  check(rows.length === 3, 'в витрине три предмета');
  for (const item of rows) {
    check(shop.prices[item.row] === discounted(item.share), `№22: ${item.id} стоит ${shop.prices[item.row]} вместо ${fullPrice(item.share)}`);
  }
  check(shop.slotPrice > 0, '№21: следующее место на полке по-прежнему платное');
  check(shop.socketPrice === 0, '№28: первое гнездо забега — 0 билетов');
  const rare = (shop.amulets ?? []).find((amulet) => amulet && amulet.rarity === 'rare');
  check(Boolean(rare), '№29: в первом магазине есть редкий амулет');
  if (rare) {
    const place = shop.amulets.findIndex((amulet) => amulet && amulet.id === rare.id);
    // Цена редкого — по редкости (3), если у амулета нет своей цены (у «Разгона» и «Огранки» она 2).
    const rarePrice = rare.price ?? { common: 1, rare: 3, legendary: 4, cursed: 1 }[rare.rarity];
    check(shop.amuletPrices[place] === Math.max(1, rarePrice - 1), `№26: редкий амулет стоит ${shop.amuletPrices[place]} (ждём ${rarePrice} − 1 = ${Math.max(1, rarePrice - 1)})`);
  }
  await shot('upgrades-batch-b-shop.png');

  // ---------- 10: №27 — копия сверх базового потолка ----------
  const copy = JSON.parse((await val(`(() => {
    const g = window.__g;
    const place = g.amuletOffer.findIndex((amulet) => amulet !== null);
    if (place < 0) return JSON.stringify({ ok: false });
    const amulet = g.amuletOffer[place];
    g.amuletCounts = { [amulet.id]: amulet.maxCopies }; // ровно базовый потолок игры
    g.sockets = 6;
    g.tickets = 99;
    g.refreshShop();
    g.buyFromCase(place);
    const first = g.amuletCounts[amulet.id];
    g.amuletOffer[place] = amulet; // вернуть на витрину для второй попытки
    g.tickets = 99;
    g.buyFromCase(place);
    const second = g.amuletCounts[amulet.id];
    return JSON.stringify({ ok: true, id: amulet.id, base: amulet.maxCopies, first, second });
  })()`)) ?? '{}');
  check(copy.ok === true, '№27: на витрине есть амулет для проверки копии');
  check(copy.first === copy.base + 1, `№27: копия сверх базового потолка куплена (${copy.first} при базе ${copy.base})`);
  check(copy.second === copy.first, '№27: потолок поднят ровно на 1 — сверх него не покупают');

  // ---------- 11: №30 — на старте забега берут два амулета вместо одного (шаг 38) ----------
  await val(`localStorage.setItem('${PROGRESS_KEY}', JSON.stringify({ tutorialDone: true, patterns: [], achievements: [],
    runAmulets: ['cherryPit', 'bell'], runAmuletPicks: 2, upgrades: { 'amulet-survives-death': 1 }, runs: 1 })); 1`);
  await reload();
  const memory = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    open: g.amuletPick.isOpen, rows: g.amuletPick.rows.length, picks: g.startAmuletPicks, blocked: g.canAct(),
    title: g.children.list.some((o) => o.type === 'Text' && o.text === 'АМУЛЕТ ИЗ ПРОШЛОГО ЗАБЕГА'),
  }); })()`)) ?? '{}');
  check(memory.open === true && memory.rows === 2, `№30: список памяти на старте, вариантов ${memory.rows}`);
  check(memory.picks === 2 && memory.blocked === false, '№30: с улучшением разрешено два амулета, пока список открыт — игра ждёт');
  check(memory.title === true, '№30: RU-заголовок «АМУЛЕТ ИЗ ПРОШЛОГО ЗАБЕГА»');
  await val('window.__g.amuletPick.press(0); 1');
  await sleep(500);
  const memoryAfter = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ open: g.amuletPick.isOpen, rows: g.amuletPick.rows.length, picks: g.startAmuletPicks, amulets: g.amulets.map((a) => a.id) }); })()')) ?? '{}');
  check(memoryAfter.open === true && memoryAfter.rows === 1 && memoryAfter.picks === 1, '№30: после первого взятого список открыт с остатком');
  await val('window.__g.amuletPick.press(0); 1');
  await sleep(500);
  check((await val('window.__g.amulets.length')) === 2, '№30: в гнёздах оба амулета из прошлого забега');
  await shot('upgrades-batch-b-memory.png');

  // ---------- 12: №31 — доля черепов ниже ровно на 1 п.п. ----------
  await setPurchases({});
  await reload();
  const shareBefore = await val('window.__g.currentSkullShare()');
  await setPurchases({ 'grid-skull-share': 1 });
  await reload();
  const shareAfter = await val('window.__g.currentSkullShare()');
  check(Math.abs(shareBefore - shareAfter - 0.01) < 1e-9, `№31: доля черепов ${shareBefore} → ${shareAfter} (−1 п.п.)`);

  // ---------- 13: №33 — выбор первого символа забега ----------
  await setPurchases({ 'grid-start-symbol': 1 });
  await reload();
  const pick = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    open: g.symbolPick.isOpen, rows: g.symbolPick.rows.length, chosen: g.startSymbolId, blocked: g.canAct(),
  }); })()`)) ?? '{}');
  check(pick.open === true && pick.rows >= 5, '№33: в начале забега открыт выбор символа со списком');
  check(pick.chosen === null && pick.blocked === false, '№33: пока символ не выбран, игра ждёт');
  await val('window.__g.symbolPick.press(0); 1');
  await sleep(400);
  const picked = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    open: g.symbolPick.isOpen, chosen: g.startSymbolId, blocked: g.canAct(),
  }); })()`)) ?? '{}');
  check(picked.open === false && typeof picked.chosen === 'string' && picked.blocked === true, `№33: символ выбран (${picked.chosen}), панель закрыта, крутить можно`);
  await shot('upgrades-symbol-pick.png');

  // ---------- 14: №32/34/35/36/37/38/39/40 в магазине ----------
  const batchC = {
    'grid-skull-share': 1, 'grid-start-joker': 1, 'grid-jackpot': 1, 'grid-blood-weight': 1,
    'shop-discount': 1, 'shop-extra-row': 1, 'shop-ticket-share': 1, 'shop-amulet-chips': 1, 'shop-gift-item': 1,
  };
  await setPurchases(batchC);
  await reload();
  await val('window.__g.balance = 100000; window.__g.tickets = 99; window.__g.openShop(); 1');
  await sleep(5200);
  const shopC = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    open: g.isShopOpen, shopping: g.isShopping, balance: g.balance, debt: g.debt,
    items: g.offer.map((item) => (item ? { id: item.id, share: item.priceShare } : null)),
    prices: g.shop.prices, rows: g.shop.offerRows, shelf: g.shelf.filter(Boolean).length,
    gift: g.freeGiftGiven,
  }); })()`)) ?? '{}');
  check(shopC.open === true && shopC.shopping === true, '№37/#40: магазин 1 открыт');
  check(shopC.rows === 4 && shopC.items.filter(Boolean).length === 4 && shopC.prices.length === 5, `№37: в витрине 4 ряда предметов + билет (${shopC.rows})`);
  check(shopC.shelf === 1 && shopC.gift === true, `№40: подарок лёг на свободное место полки (${shopC.shelf})`);
  check(shopC.balance === 100000, '№40: подарок не стоил фишек');
  // №36: цена предмета — доля долга × 0,9 (скидка магазина), округление до 5 и минимум 5 прежние.
  const expectedC = (share) => Math.max(5, Math.round((share * shopC.debt * 0.9) / 5) * 5);
  const itemRows = (shopC.items ?? []).map((item, row) => (item ? { ...item, row } : null)).filter((item) => item !== null);
  for (const item of itemRows) check(shopC.prices[item.row] === expectedC(item.share), `№36: ${item.id} стоит ${shopC.prices[item.row]} вместо ${Math.round(item.share * shopC.debt)}`);
  // №38: первый билет — 30% банка, а ещё на нём скидка №36 10%: 100 000 × 0,3 × 0,9 = 27 000.
  check(shopC.prices[4] === 27000, `№38: билет стоит ${shopC.prices[4]} (ждём 30% × 0,9 от 100 000)`);

  // Шаг 35 (№37): четвёртый ряд и ряд билетов теперь покупаются клавишами. Кассета переехала на T (освободила «9»),
  // «9» — четвёртый ряд, «B» — билеты. Проверяем настоящим вводом: цена снимается, ряд меняется, билет приходит.
  // Подарок №40 занял единственное место полки — открываем второе, иначе покупка честно отказала бы.
  await val(`(() => { const g = window.__g;
    if (g.slots < 2) { g.slots += 1; g.shelf.push(null); g.itemShelf.openSlot(g.slots - 1); }
    return 1; })()`);
  await sleep(300);
  const keysBefore = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    balance: g.balance, tickets: g.tickets, shelf: g.shelf.filter(Boolean).length,
    row3: g.offer[3] ? g.offer[3].id : null, price3: g.shop.prices[3], price4: g.shop.prices[4],
  }); })()`)) ?? '{}');
  await key('9');
  const afterNine = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    balance: g.balance, row3: g.offer[3] ? g.offer[3].id : null, shelf: g.shelf.filter(Boolean).length,
  }); })()`)) ?? '{}');
  check(keysBefore.price3 !== null && afterNine.balance === keysBefore.balance - keysBefore.price3,
    `шаг 35: «9» купил четвёртый ряд витрины (фишек ${keysBefore.balance} → ${afterNine.balance}, цена ${keysBefore.price3})`);
  check(afterNine.row3 !== keysBefore.row3 || afterNine.shelf === keysBefore.shelf + 1,
    `шаг 35: после «9» ряд сменился или лёг на полку (ряд ${keysBefore.row3} → ${afterNine.row3}, полка ${keysBefore.shelf} → ${afterNine.shelf})`);
  const ticketsBeforeB = await val('window.__g.tickets');
  const balanceBeforeB = await val('window.__g.balance');
  const priceBeforeB = await val('window.__g.shop.prices[4]'); // цена пересчиталась после покупки «9»: доля банка
  await key('B');
  const afterB = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    tickets: g.tickets, balance: g.balance, price4: g.shop.prices[4],
  }); })()`)) ?? '{}');
  check(afterB.tickets === ticketsBeforeB + 1, `шаг 35: «B» купил билет (билетов ${ticketsBeforeB} → ${afterB.tickets})`);
  check(afterB.balance === balanceBeforeB - priceBeforeB && afterB.price4 === null,
    `шаг 35: за билет списана его цена, ряд погас (фишек ${balanceBeforeB} → ${afterB.balance}, цена была ${priceBeforeB})`);
  // ---------- 14б: мини-чемодан за фишки (DONTLIKE п.7) и мини-автомат без дверцы (п.8) ----------
  const mini = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    places: g.miniCase.goods.length, mainPlaces: g.amuletCase.goods.length,
    miniX: g.miniCase.goods[0].x, mainX: g.amuletCase.goods[0].x,
    miniOpen: g.miniCase.isOpen,
    offer: g.miniCaseOffer.map((a) => (a ? a.id : null)),
    mainOffer: g.amuletOffer.map((a) => (a ? a.id : null)),
    chipZone: g.amuletCase.chipZone === undefined && g.amuletCase.chipButton === undefined,
  }); })()`)) ?? '{}');
  check(mini.places === 2 && mini.mainPlaces === 3, `п.7: мини-чемодан на два места, основной — на три (${mini.places}/${mini.mainPlaces})`);
  check(mini.miniOpen === true && mini.miniX < mini.mainX, `п.7: мини-чемодан открыт и стоит слева от основного (${Math.round(mini.miniX)} < ${Math.round(mini.mainX)})`);
  check(mini.chipZone === true, 'п.7: у основного чемодана больше нет переключателя «ЗА ФИШКИ / ЗА БИЛЕТЫ»');
  const overlap = (mini.offer ?? []).filter((id) => id && (mini.mainOffer ?? []).includes(id));
  check(overlap.length === 0, `п.7: мини-чемодан не повторяет амулеты основного (${(mini.offer ?? []).join(',')} / ${(mini.mainOffer ?? []).join(',')})`);
  // Цена — половина фишек на руках, ниже 300 не опускается; №39 (куплен в этом наборе) делает её вдвое меньше:
  // 100 000 × 0,5 × 0,5 = 25 000. Оплата идёт сразу, окна выбора валюты нет; второй раз за забег — отказ строкой.
  const miniBuy = JSON.parse((await val(`(() => { const g = window.__g;
    g.balance = 100000; g.tickets = 99; g.refreshShop();
    const price = g.miniCase.prices.find((p) => p !== null);
    const place = g.miniCaseOffer.findIndex((a) => a !== null);
    if (place < 0) return JSON.stringify({ ok: false });
    const amulet = g.miniCaseOffer[place];
    const copies = g.amuletCounts[amulet.id] ?? 0;
    const screensOf = () => [g.upgradeScreen, g.actionPanel, g.symbolPick, g.machinePick, g.amuletPick].filter((s) => s && s.isOpen).length;
    const before = g.balance;
    const screensBefore = screensOf();
    g.buyFromMiniCase(place);
    const openAfterBuy = screensOf();
    const paid = before - g.balance;
    const afterCopies = g.amuletCounts[amulet.id] ?? 0;
    const used = g.amuletChipUsedThisRun;
    g.balance = 100000; g.refreshShop();
    const again = g.balance;
    const second = g.miniCaseOffer.findIndex((a) => a !== null);
    if (second >= 0) g.buyFromMiniCase(second);
    const refused = again - g.balance;
    const news = (g.screen.news?.parts ?? []).filter((part) => typeof part.text === 'string').map((part) => part.text).join(' ');
    return JSON.stringify({ ok: true, price, paid, copies, afterCopies, used, refused, news,
      screensBefore, openAfterBuy, screensAfter: screensOf(), shopping: g.isShopping });
  })()`)) ?? '{}');
  check(miniBuy.ok === true && miniBuy.price === 25000, `п.7/№39: амулет за фишки стоит половину рук, с №39 — 25 000 (${miniBuy.price})`);
  check(miniBuy.paid === miniBuy.price && miniBuy.afterCopies === miniBuy.copies + 1 && miniBuy.used === true,
    `п.7: амулет куплен за фишки (${miniBuy.paid}, копий ${miniBuy.copies} → ${miniBuy.afterCopies}), флаг «раз за забег» стоит`);
  check(miniBuy.screensBefore === 0 && miniBuy.openAfterBuy === 0 && miniBuy.screensAfter === 0,
    'п.7: покупка не открывает окно выбора «за фишки / за билеты» — всё на панели магазина');
  check(miniBuy.refused === 0 && /ФИШКИ/.test(miniBuy.news ?? ''),
    `п.7: второй раз за забег — отказ строкой на экране автомата (${miniBuy.news})`);
  await shot('upgrades-mini-case.png');

  // п.8: дверцы витрины маленького автомата нет — товар и цены видны сразу; внизу плашка выдачи.
  const machine = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    door: g.miniShop.door, doorOpen: g.miniShop.isDoorOpen,
    goods: g.miniShop.goods.map((o) => o.visible),
    prices: g.miniShop.priceTexts.map((o) => ({ visible: o.visible, text: o.text })),
    bin: Boolean(g.miniShop.bin), binZone: Boolean(g.miniShop.binZone),
    goodsLeft: g.miniShop.goods[0].x, goodsRight: g.miniShop.goods[0].x,
  }); })()`)) ?? '{}');
  check(machine.door === undefined && machine.doorOpen === undefined, 'п.8: дверцы витрины больше нет — ни полотна, ни ручки, ни флага');
  check(machine.goods.every(Boolean) && machine.prices.every((p) => p.visible && p.text.length > 0),
    `п.8: товар и цены видны сразу, без клика (${machine.prices.map((p) => p.text).join(', ')})`);
  check(machine.bin === true && machine.binZone === true, 'п.8: внизу автомата есть плашка выдачи — и по ней можно кликнуть');
  // Покупка уходит в плашку, клик по плашке её забирает.
  await val('window.__g.balance = 100000; window.__g.refreshShop(); window.__g.buySlot(); 1');
  await sleep(1700); // оплата 4×60 + 400 мс и падение 320 мс
  const inBin = await val('Boolean(window.__g.miniShop.taken)');
  await clickAt(await pagePoint('g.miniShop.binZone.getBounds()'));
  await sleep(400);
  const binEmpty = await val('window.__g.miniShop.taken === null');
  check(inBin === true, 'п.8: купленное падает в плашку выдачи');
  check(binEmpty === true, 'п.8: клик по плашке забирает покупку');
  await shot('upgrades-batch-c-shop.png');

  // ---------- 15: №42/№45 — откат не сбрасывает серию и возвращает билеты ----------
  await setPurchases({ 'tape-keeps-streak': 1, 'tape-refund-tickets': 1 });
  await reload();
  await passPicks();
  const tape = JSON.parse((await val(`(() => { const g = window.__g;
    g.tapeState = 'blank'; g.tapesBought = 1; g.tickets = 10; g.debt = 150; g.balance = 400; g.spinsLeft = 5;
    g.recordTape();
    const recorded = g.tickets;
    const runs = g.runsPlayed; // номер забега до отката: перемотка — тот же забег, номер не должен вырасти
    g.spendRunTickets(4); // так тратят амулет, гнездо и кассета: трата после записи
    g.streak = 9;
    const spent = g.ticketsSpentOnTape;
    g.insertTape();
    return JSON.stringify({ recorded, spent, runs });
  })()`)) ?? '{}');
  await sleep(7500); // плёнка перематывается 1,7 с, потом сцена перезапускается
  const rewind = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ streak: g.streak, tickets: g.tickets, runs: g.runsPlayed }); })()')) ?? '{}');
  check(tape.recorded === 10 && tape.spent === 4, `№45: на записи 10 билетов, после записи потрачено 4 (${JSON.stringify(tape)})`);
  check(rewind.streak === 9, `№42: серия 9 пережила откат (${rewind.streak})`);
  check(rewind.tickets === 14, `№45: откат вернул ровно 4 потраченных: 10 + 4 = ${rewind.tickets}`);
  check(rewind.runs === tape.runs, `№8: откат кассетой не сдвигает номер забега (${tape.runs} → ${rewind.runs})`);

  // ---------- 16: №44 — кассета в магазине бесплатна ----------
  await setPurchases({ 'tape-free': 1 });
  await reload();
  await passPicks();
  await val('window.__g.balance = 100000; window.__g.tickets = 0; window.__g.round = 4; window.__g.openShop(); 1');
  await sleep(5200);
  const freeTape = JSON.parse((await val(`(() => { const g = window.__g;
    const price = g.tapeCost();
    const before = g.tapeState;
    g.buyTape();
    return JSON.stringify({ price, before, after: g.tapeState, tickets: g.tickets });
  })()`)) ?? '{}');
  check(freeTape.price === 0, `№44: кассета стоит 0 билетов (${freeTape.price})`);
  check(freeTape.before === 'forSale' && freeTape.after === 'blank', '№44: кассета без билетов куплена и легла в REC');
  check(freeTape.tickets === 0, `№44: ни одного билета не потрачено (${freeTape.tickets})`);
  await shot('upgrades-tape-free.png');

  // ---------- 17: №46 «5% рекорда» удалён (шаг 38, DONTLIKE п.10): старое сохранение читается ----------
  await val("localStorage.setItem('dolgovaya-yama-chip-record', '1000000'); 1");
  await setPurchases({ 'record-start-chips': 1 }); // чужое id: в пуле его больше нет
  await reload();
  await passPicks();
  const recordStart = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    balance: g.balance, earned: g.earned, purchases: Object.keys(g.upgrades), hasField: 'recordStartShare' in g.upgradeEffects,
  }); })()`)) ?? '{}');
  check(recordStart.balance === 0 && recordStart.earned === 0, `№46: удалённое улучшение не даёт фишек (баланс ${recordStart.balance})`);
  check(recordStart.purchases.length === 0 && recordStart.hasField === false, '№46: старое сохранение с ним читается как «не куплено»');

  // ---------- 18: №47 «билет за ачивку» удалён (шаг 38, DONTLIKE п.1) ----------
  await setPurchases({ 'achievement-ticket': 1 }); // тоже чужое id
  await reload();
  await passPicks();
  const ticket = JSON.parse((await val(`(() => { const g = window.__g; const before = g.tickets;
    g.unlockAchievement('theEnd');
    return JSON.stringify({ before, after: g.tickets, purchases: Object.keys(g.upgrades),
      hasList: 'achievementTicketGiven' in g, hasField: 'achievementTickets' in g.upgradeEffects });
  })()`)) ?? '{}');
  check(ticket.after === ticket.before, `№47: ачивка билетов не даёт (${ticket.before} → ${ticket.after})`);
  check(ticket.purchases.length === 0 && ticket.hasList === false && ticket.hasField === false, '№47: ни списка, ни поля улучшения не осталось');

  // ---------- 19: №48 — смена автомата выключена ----------
  await setPurchases({ 'machine-no-swap': 1 });
  await reload();
  await passPicks();
  const noSwap = JSON.parse((await val(`(() => { const g = window.__g;
    g.machineId = 'classic'; g.round = 6; g.pacts = [];
    for (let i = 0; i < 40; i++) g.startRound(); // 40 начал раунда: со шансом 5% автомат сменился бы почти наверняка
    return JSON.stringify({ machine: g.machineId, flag: g.upgradeEffects.noMachineSwap });
  })()`)) ?? '{}');
  check(noSwap.flag === true && noSwap.machine === 'classic', `№48: за 40 раундов автомат не сменился (${noSwap.machine})`);

  // ---------- 20: №49 — выбор стартового автомата ----------
  await setPurchases({ 'machine-start-pick': 1 });
  await reload();
  const machinePick = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    open: g.machinePick.isOpen, rows: g.machinePick.rows.length, blocked: g.canAct(), machine: g.machineId,
    texts: g.children.list.filter((o) => o.type === 'Text').map((o) => o.text),
  }); })()`)) ?? '{}');
  check(machinePick.open === true && machinePick.rows === 3, `№49: в начале забега панель из трёх автоматов (${machinePick.rows})`);
  check(machinePick.blocked === false && machinePick.machine === 'classic', '№49: пока автомат не выбран, игра ждёт');
  check(machinePick.texts.includes('СТАРТОВЫЙ АВТОМАТ'), '№49: RU-заголовок панели');
  await shot('upgrades-machine-pick.png');
  await val('window.__g.machinePick.press(1); 1');
  await sleep(500);
  const machineAfter = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ open: g.machinePick.isOpen, machine: g.machineId, blocked: g.canAct() }); })()')) ?? '{}');
  check(machineAfter.open === false && machineAfter.machine === 'greedy', `№49: выбран «Жадный» (${machineAfter.machine})`);
  check(machineAfter.blocked === true, '№49: автомат выбран — крутить можно');
  // Оба улучшения сразу: сначала автомат, потом символ (№33).
  await setPurchases({ 'machine-start-pick': 1, 'grid-start-symbol': 1 });
  await reload();
  const order = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ machine: g.machinePick.isOpen, symbol: g.symbolPick.isOpen }); })()')) ?? '{}');
  check(order.machine === true && order.symbol === false, '№49+№33: сначала выбор автомата');
  await val('window.__g.machinePick.press(0); 1');
  await sleep(400);
  const order2 = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ machine: g.machinePick.isOpen, symbol: g.symbolPick.isOpen }); })()')) ?? '{}');
  check(order2.machine === false && order2.symbol === true, '№49+№33: после автомата — выбор символа');
  await val('window.__g.symbolPick.press(0); 1');
  await sleep(400);
  check((await val('window.__g.canAct()')) === true, '№49+№33: оба выбора пройдены — игра идёт');

  // ---------- 21: №50 — отмена черепа один раз за забег ----------
  await setPurchases({ 'skull-cancel': 1 });
  await reload();
  await passPicks();
  const cancel = JSON.parse((await val(`(() => { const g = window.__g;
    // Сетка без черепов, кубика и короны: отмена проверяет только кон и серию, а итог идёт обычным путём.
    const cell = { id: 'lemon', sign: '🍋' };
    const grid = [[cell, cell, cell, cell, cell], [cell, cell, cell, cell, cell], [cell, cell, cell, cell, cell]];
    g.pot = 400; g.streak = 5; g.spinsLeft = 5; g.isSpinning = true;
    g.offerSkullCancel(grid, { kind: 'skull', win: 0, hits: [], tickets: 0 }, false);
    const shown = g.skullCancelBox !== null;
    g.resolveSkullCancel(true);
    return JSON.stringify({ shown, pot: g.pot, streak: g.streak, used: g.skullCancelUsedThisRun,
      plaque: g.skullCancelBox, can: g.canCancelSkull(), spinning: g.isSpinning });
  })()`)) ?? '{}');
  check(cancel.shown === true, '№50: череп выпал — на экране автомата появился список с отменой черепа (шаг 37)');
  check(cancel.pot === 400 && cancel.streak === 5, `№50: после отмены кон цел (${cancel.pot}), серия на месте (${cancel.streak})`);
  check(cancel.used === true && cancel.plaque === null, '№50: отмена одноразовая — флаг стоит, список убран');
  check(cancel.can === false && cancel.spinning === false, '№50: второй отмены нет, прокрутка осела');
  const rescueBlocked = await val(`(() => { const g = window.__g;
    const was = g.skullCancelUsedThisRun; g.skullCancelUsedThisRun = false; g.isRescue = true;
    const blocked = g.canCancelSkull(); g.isRescue = false; g.skullCancelUsedThisRun = was; return blocked; })()`);
  check(rescueBlocked === false, '№50: в раунде спасения череп отменить нельзя');
  // Шаг 37: отмена — строка списка на экране автомата, подсказки про клавиши на ней нет; клавиша C продолжает работать.
  // Сбрасываем расход отмены и ловим новый череп.
  await val(`(() => { const g = window.__g;
    g.skullCancelUsedThisRun = false; g.pot = 400; g.streak = 5; g.isSpinning = true;
    const cell = { id: 'lemon', sign: '🍋' };
    const grid = [[cell, cell, cell, cell, cell], [cell, cell, cell, cell, cell], [cell, cell, cell, cell, cell]];
    g.offerSkullCancel(grid, { kind: 'skull', win: 0, hits: [], tickets: 0 }, false);
    return 1; })()`);
  await sleep(150);
  const plaqueText = await val(`(() => { const g = window.__g;
    const label = (g.skullCancelBox ?? []).find((o) => o.type === 'Text' && String(o.text).includes('ОТМЕНИТЬ'));
    return label ? label.text : null; })()`);
  const listInside = await val(`(() => { const g = window.__g, L = g.skullCancelList;
    if (!L) return false;
    const b = (o) => o.getBounds();
    return L.rows.every((zone) => { const r = b(zone); return r.left >= 569 - 230 && r.right <= 569 + 230 && r.top >= 314 - 144 && r.bottom <= 314 + 144; }); })()`);
  await key('C');
  const byKey = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    pot: g.pot, streak: g.streak, used: g.skullCancelUsedThisRun, plaque: g.skullCancelBox === null, spinning: g.isSpinning,
  }); })()`)) ?? '{}');
  check(plaqueText === 'ОТМЕНИТЬ ЧЕРЕП' && listInside === true,
    '№50 (шаг 37): отмена — строка на экране автомата, без подсказки про клавишу: «' + plaqueText + '»');
  check(byKey.pot === 400 && byKey.streak === 5 && byKey.used === true && byKey.plaque === true && byKey.spinning === false,
    `№50 (шаг 35): клавиша C отменила череп — кон ${byKey.pot}, серия ${byKey.streak}, флаг ${byKey.used}, плашка убрана ${byKey.plaque}`);

  // ---------- 22: вторую фазу можно закрыть с клавиатуры ----------
  await setPurchases({});
  await reload();
  await setTickets(10);
  await die();
  await key('1');
  const phase2 = await state();
  check(phase2.second === true && phase2.cards === 2 && phase2.tickets === 10, 'вторая фаза: две карточки за 6 билетов, билеты целы');
  await key('0');
  const closedByKey = await state();
  check(closedByKey.open === false && closedByKey.cards === 0, 'клавиша «0» закрыла вторую фазу — до витрины памяти');
  check(closedByKey.tickets === 10, 'по «0» билеты не списаны (10)');
  check(Object.keys(closedByKey.purchases).length === 1, 'по «0» куплено только бесплатное улучшение');
  await shot('upgrades-second-closed-by-key.png');

  // ---------- 23: №1 — +1 прокрутка в первом раунде забега ----------
  await setPurchases({});
  await reload();
  const baseSpins = await val('window.__g.spinsLeft');
  await setPurchases({ 'spin-first-round': 1 });
  await reload();
  await passPicks();
  const plusSpins = await val('window.__g.spinsLeft');
  check(plusSpins === baseSpins + 1, `№1: первый раунд ${plusSpins} прокруток вместо ${baseSpins}`);

  // ---------- 24: №8 — прощение первого долга ровно на пятом забеге ----------
  await setPurchases({ 'debt-forgive': 1 });
  await val(`(() => { const p = JSON.parse(localStorage.getItem('${PROGRESS_KEY}') ?? '{}'); p.runs = 4; localStorage.setItem('${PROGRESS_KEY}', JSON.stringify(p)); return 1; })()`);
  await reload();
  await passPicks();
  const fifthRun = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ runs: g.runsPlayed, debt: g.debt, forgiven: g.isDebtForgiven }); })()')) ?? '{}');
  check(fifthRun.runs === 5 && fifthRun.debt === 0, `№8: пятый забег — первый долг прощён (забег ${fifthRun.runs}, долг ${fifthRun.debt})`);
  check(fifthRun.forgiven === true, '№8: сцена знает, что долг прощён — на стекле будет «ДОЛГ ПРОЩЁН»');
  // DONTLIKE п.15: прощённый долг не должен приводить к последнему шансу. Раунд 1 с нулём фишек: банкомата нет,
  // GOOD LUCK и спасения нет, сразу магазин; второй долг — обычный 540.
  const freeDebt = JSON.parse((await val(`(() => { const g = window.__g;
    g.spinsLeft = 0; g.balance = 0; g.endOfSpins(false);
    return JSON.stringify({ rescue: g.isRescue, gameOver: g.isGameOver, debt: g.debt, balance: g.balance, hasDebtDue: g.hasEnoughForDebt() });
  })()`)) ?? '{}');
  check(freeDebt.rescue === false && freeDebt.gameOver === false, '№8/п.15: долг 0 — спасения нет и забег не кончен');
  check(freeDebt.hasDebtDue === true, '№8/п.15: нулевой долг считается оплаченным (hasEnoughForDebt)');
  await sleep(2500);
  const afterFree = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    shop: g.isShopOpen, rescue: g.isRescue, atm: g.collector.isAtmOut, round: g.round, debt: g.debt,
    goodLuck: g.children.list.some((o) => typeof o.text === 'string' && o.text === 'GOOD LUCK'),
  }); })()`)) ?? '{}');
  check(afterFree.rescue === false && afterFree.goodLuck === false, '№8/п.15: GOOD LUCK и спасения при долге 0 нет');
  check(afterFree.atm === false, '№8/п.15: банкомат при долге 0 не выезжает — платить нечего (DONTLIKE п.5)');
  check(afterFree.shop === true && afterFree.round === 2 && afterFree.debt === 540, `№8/п.15: сразу магазин, второй долг 540 (раунд ${afterFree.round}, долг ${afterFree.debt})`);
  // п.5: долг обнулился прямо в раунде (выкуп/сделка) — та же дверь: банкомата, GOOD LUCK и спасения нет,
  // магазин открывается сразу, а «отдать долг раньше» (D) при нуле ничего не делает.
  await val('window.__g.leaveShop(); 1');
  await sleep(2600); // панель магазина уехала, раунд 2 пошёл
  const zeroed = JSON.parse((await val(`(() => { const g = window.__g;
    g.debt = 0; g.collector.markNote(0); g.balance = 100; g.spinsLeft = 5; g.tickets = 3;
    const spinsBefore = g.spinsLeft, ticketsBefore = g.tickets;
    g.payEarly(); // «отдать долг раньше» при нулевом долге: платить нечего
    const early = { spins: g.spinsLeft, tickets: g.tickets, over: g.isRoundOver, rescue: g.isRescue };
    const note = g.collector.noteDebt;
    g.endOfSpins(false);
    return JSON.stringify({ early, spinsBefore, ticketsBefore, note });
  })()`)) ?? '{}');
  check(zeroed.early.spins === zeroed.spinsBefore && zeroed.early.tickets === zeroed.ticketsBefore && zeroed.early.over === false,
    `п.5: при долге 0 «отдать раньше» ничего не делает (прокрутки ${zeroed.spinsBefore}, билеты ${zeroed.ticketsBefore})`);
  check(zeroed.note === 0, 'п.5: записка с долгом показывает 0');
  await sleep(2600);
  const zeroedAfter = JSON.parse((await val(`(() => { const g = window.__g; return JSON.stringify({
    shop: g.isShopOpen, rescue: g.isRescue, gameOver: g.isGameOver, atm: g.collector.isAtmOut, debt: g.debt, round: g.round,
    goodLuck: g.children.list.some((o) => typeof o.text === 'string' && o.text === 'GOOD LUCK'),
  }); })()`)) ?? '{}');
  check(zeroedAfter.atm === false && zeroedAfter.goodLuck === false && zeroedAfter.rescue === false && zeroedAfter.gameOver === false,
    'п.5: долг 0 посреди раунда — банкомата, GOOD LUCK и спасения нет');
  check(zeroedAfter.shop === true && zeroedAfter.debt > 0, `п.5: сразу магазин, следующий долг обычный (${zeroedAfter.debt})`);
  await reload();
  await passPicks();
  const sixthRun = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ runs: g.runsPlayed, debt: g.debt }); })()')) ?? '{}');
  check(sixthRun.runs === 6 && sixthRun.debt === 150, `№8: шестой — долг обычный 150 (забег ${sixthRun.runs}, долг ${sixthRun.debt})`);

  // ---------- 25: DONTLIKE п.9 — взятое улучшение больше не предлагается ----------
  // Берём покупки «всё, кроме двух»: экран показывает ровно оставшиеся, и по нему видно, вернулось ли взятое.
  const twoLeft = { ...Object.fromEntries(ALL_IDS.filter((upgradeId) => upgradeId !== 'win-piggy' && upgradeId !== 'win-insurance').map((upgradeId) => [upgradeId, 1])), 'amulet-copy': 2 };
  await setPurchases(twoLeft);
  await reload();
  await passPicks();
  await setTickets(10); // вторая фаза остаётся на экране: видно, что взятое не вернулось в две оставшиеся карточки
  await die();
  const firstDeath = await state();
  const takenUpgrade = firstDeath.offers[0];
  check(firstDeath.cards === 2 && firstDeath.offers.includes('win-piggy') && firstDeath.offers.includes('win-insurance'),
    'п.9: перед смертью на столе ровно два непокупленных улучшения: ' + JSON.stringify(firstDeath.offers));
  await val(`window.__g.pickUpgrade(${firstDeath.offers.indexOf(takenUpgrade)}); 1`);
  await sleep(300);
  const afterTake = await state();
  check(afterTake.purchases[takenUpgrade] === 1 && afterTake.cards === 1 && !afterTake.offers.includes(takenUpgrade),
    `п.9: взятое ${takenUpgrade} сразу ушло со стола (осталось ${JSON.stringify(afterTake.offers)})`);
  // Новый забег без перезагрузки страницы: снимок покупок читается заново в resetState.
  await restart();
  await setTickets(0);
  await die();
  const nextDeath = await state();
  check(!nextDeath.offers.includes(takenUpgrade),
    `п.9: в новом забеге ${takenUpgrade} не предлагается снова (${JSON.stringify(nextDeath.offers)})`);
  // После перезагрузки страницы: покупки лежат в localStorage, а не в сцене.
  await reload();
  await passPicks();
  await setTickets(0);
  await die();
  const afterReload = await state();
  check(!afterReload.offers.includes(takenUpgrade),
    `п.9: после перезагрузки ${takenUpgrade} не вернулся (${JSON.stringify(afterReload.offers)})`);
  // После отката кассетой: плёнка возвращает забег, а не прогресс — взятое улучшение остаётся взятым.
  await val(`(() => { const g = window.__g; g.tapeState = 'blank'; g.tapesBought = 1; g.recordTape(); g.insertTape(); return 1; })()`);
  await sleep(8000);
  await passPicks();
  await setTickets(0);
  await die();
  const afterTape = await state();
  check(afterTape.purchases[takenUpgrade] === 1 && !afterTape.offers.includes(takenUpgrade),
    `п.9: после отката кассетой ${takenUpgrade} по-прежнему не предлагается (${JSON.stringify(afterTape.offers)})`);
  // «Ещё копия» (repeat: 2, №27): ровно два предложения, третьего нет.
  const copyLeft = { ...Object.fromEntries(ALL_IDS.filter((upgradeId) => upgradeId !== 'amulet-copy').map((upgradeId) => [upgradeId, 1])) };
  await setPurchases(copyLeft);
  await reload();
  await passPicks();
  await setTickets(0);
  await die();
  const copy1 = await state();
  check(JSON.stringify(copy1.offers) === JSON.stringify(['amulet-copy']), 'п.9 №27: осталась одна карта — «Ещё копия»: ' + JSON.stringify(copy1.offers));
  await key('1');
  const copy1After = await state();
  check(copy1After.purchases['amulet-copy'] === 1, 'п.9 №27: первая копия взята');
  await restart();
  await setTickets(0);
  await die();
  const copy2 = await state();
  check(JSON.stringify(copy2.offers) === JSON.stringify(['amulet-copy']), 'п.9 №27: второй раз карта ещё предлагается: ' + JSON.stringify(copy2.offers));
  await key('1');
  await restart();
  await setTickets(0);
  await die();
  const copy3 = await state();
  check(copy3.open === false && copy3.cards === 0, 'п.9 №27: третьего раза нет — экрана улучшений больше нет');

  // ---------- 26: DONTLIKE п.9 — взятая связка Дилера больше не ложится на сукно ----------
  await setPurchases({});
  await reload();
  await passPicks();
  const dealerVisit = async () => {
    await val('window.__g.round = window.__g.round || 3; window.__g.startDealerGame(() => { window.__dealerDone = (window.__dealerDone || 0) + 1; }); 1');
    await sleep(800);
    return JSON.parse((await val(`JSON.stringify((window.__g.pactOffer || []).map((pact) => ({ id: pact.id, needsSymbol: Boolean(pact.needsSymbol), needsMachine: Boolean(pact.needsMachine) })))`)) ?? '[]');
  };
  const visit1 = await dealerVisit();
  check(visit1.length === 3, 'п.9: первое сукно — три карты: ' + JSON.stringify(visit1.map((pact) => pact.id)));
  const takenPacts = [];
  for (let visit = 0; visit < 3; visit++) {
    const offers = visit === 0 ? visit1 : await dealerVisit();
    // Карту с выбором символа/автомата без выбора не берут — её и не трогаем: нам нужны простые карты.
    const pick = offers.find((pact) => !pact.needsSymbol && !pact.needsMachine && !takenPacts.includes(pact.id));
    if (!pick) break;
    await val(`window.__g.acceptPact('${pick.id}'); 1`);
    await sleep(1500);
    if (await val(`window.__g.pacts.some((pact) => pact.id === '${pick.id}')`)) takenPacts.push(pick.id);
  }
  check(takenPacts.length === 3 && takenPacts.every((id, index, list) => list.indexOf(id) === index),
    'п.9: с трёх визитов взяты три разные связки: ' + JSON.stringify(takenPacts));
  check((await val(`window.__g.pacts.length`)) === 3, 'п.9: все три записаны в забег');
  const laterVisits = [];
  for (let visit = 0; visit < 25; visit++) {
    await val('window.__g.round += 2; 1'); // сроки карт давно вышли — они всё равно не должны вернуться
    laterVisits.push((await dealerVisit()).map((pact) => pact.id));
    await val('window.__g.refusePacts(); 1');
    await sleep(900);
  }
  const repeated = laterVisits.flat().filter((id) => takenPacts.includes(id));
  check(repeated.length === 0,
    `п.9: за 25 визитов после срока ни одна из взятых не вернулась (${JSON.stringify(takenPacts)}, повторов ${repeated.length})`);
  check(laterVisits.every((offers) => offers.length === 3), 'п.9: на каждом сукне по-прежнему три разные карты');
  // Кассета: запись забега несёт pacts — после отката взятые связки тоже не возвращаются на сукно.
  await val(`(() => { const g = window.__g; g.tapeState = 'blank'; g.tapesBought = 1; g.recordTape(); g.insertTape(); return 1; })()`);
  await sleep(8000);
  await passPicks();
  const restoredPacts = JSON.parse(await val(`JSON.stringify((window.__g.pacts || []).map((pact) => pact.id))`));
  const afterTapeOffers = (await dealerVisit()).map((pact) => pact.id);
  check(takenPacts.every((id) => restoredPacts.includes(id)), `п.9: кассета вернула связки в список забега (${JSON.stringify(restoredPacts)})`);
  check(!afterTapeOffers.some((id) => takenPacts.includes(id)), `п.9: после кассеты взятые на сукно не легли (${JSON.stringify(afterTapeOffers)})`);

  // ---------- 27: DONTLIKE п.13 — полка на 2, 3 и 4 предмета стоит ровно ----------
  await setPurchases({ 'item-slot': 1 });
  await reload();
  await passPicks();
  const shelfBox = JSON.parse((await val(`(() => {
    const g = window.__g;
    return JSON.stringify({
      top: g.itemShelf.items[0].y,
      x: g.itemShelf.items[0].x,
      step: g.itemShelf.items[1].y - g.itemShelf.items[0].y,
      doorX: g.itemShelf.items[4].x,
    });
  })()`)) ?? '{}');
  check(shelfBox.x === 159 && shelfBox.step === 76, `п.13: гнёзда полки — x ${shelfBox.x}, шаг ${shelfBox.step} (ровно 76)`);
  check(shelfBox.doorX === 79, `п.13: вторая полка левее на 80 (x ${shelfBox.doorX}) — между полками видна стена`);
  const shelfCount = async (count, ids) => {
    await val(`(() => { const g = window.__g; g.slots = ${count}; g.shelf = new Array(${count}).fill(null);
      g.itemShelf.setOpenCount(${count}); g.itemShelf.items.forEach((o) => o.setVisible(false)); return 1; })()`);
    for (const itemId of ids) { await val(`window.__g.devGiveItem('${itemId}'); 1`); await sleep(700); }
    return JSON.parse((await val(`(() => { const g = window.__g;
      return JSON.stringify(g.itemShelf.items.slice(0, ${count}).map((o, slot) => { const b = o.getBounds(); return { slot, y: o.y, w: b.width, h: b.height }; }));
    })()`)) ?? '[]');
  };
  const NICHE = 54;
  for (const [count, ids] of [[2, ['shield', 'garlic']], [3, ['shield', 'garlic', 'triple']], [4, ['shield', 'garlic', 'triple', 'cherries']]]) {
    const shelf = await shelfCount(count, ids);
    const uniform = shelf.every((item, index) => Math.abs(item.y - (248 + index * 76)) < 0.01);
    const inside = shelf.every((item) => item.w <= NICHE + 0.01 && item.h <= NICHE + 0.01);
    check(shelf.length === count && uniform, `п.13: ${count} предмета — ровный шаг 76 (${shelf.map((item) => item.y).join(', ')})`);
    check(inside, `п.13: ${count} предмета — предмет и пульс в нише ${NICHE} (макс ${Math.max(...shelf.map((item) => Math.max(item.w, item.h))).toFixed(1)})`);
  }
  await shot('step39-shelf-4.png');

  // ---------- 28: DONTLIKE п.12 — «Я пролью много крови» на старте раунда, а не остаток ----------
  await setPurchases({});
  await reload();
  await passPicks();
  const blood = JSON.parse((await val(`(() => { const g = window.__g;
    // Жадность ×4 — потолок копий поднимает №27; 12 − 3×4 = 0 → в раунде одна прокрутка.
    g.sockets = 6; g.amulets = []; g.amuletCounts = {};
    g.grantStartAmulet('greed'); g.amuletCounts.greed = 4;
    g.round = 2; g.pacts = []; g.startRound();
    const greedySpins = g.spinsLeft;
    const greedyAch = JSON.parse(localStorage.getItem('${PROGRESS_KEY}') ?? '{}').achievements ?? [];
    // Без жадности обычный раунд — снова 12: проверка условия на остаток сюда не вернётся.
    g.amulets = []; g.amuletCounts = {};
    g.round = 3; g.startRound();
    const plainSpins = g.spinsLeft;
    return JSON.stringify({ greedySpins, greedyAch, plainSpins });
  })()`)) ?? '{}');
  check(blood.greedySpins <= 2 && blood.greedySpins >= 1, `п.12: с жадностью ×4 на старте раунда ${blood.greedySpins} прокрутка`);
  check(blood.greedyAch.includes('bloodSpill'), `п.12: ачивка «Я пролью много крови» выдана на старте раунда (${JSON.stringify(blood.greedyAch)})`);
  check(blood.plainSpins >= 12, `п.12: без жадности в раунде снова обычные прокрутки (${blood.plainSpins})`);

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

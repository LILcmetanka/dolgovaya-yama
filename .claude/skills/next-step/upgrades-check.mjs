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
 * 11) №30: амулет не сгорает при смерти — перенос бесплатный даже без билетов;
 * 12) третья партия (28в): №31 доля черепов −1 п.п., №33 панель выбора первого символа и блокировка игры;
 * 13) №37 четыре ряда витрины, №38 билет 30% (и скидка №36), №40 подарок на полке без списания фишек;
 * 14) №39 покупка амулета за фишки и отказ второй раз за забег;
 * 15) №42/№45 откат: серия 9 пережила перемотку, 10 билетов на записи + 4 потраченных вернулись как 14;
 * 16) №44 кассета в магазине за 0 билетов;
 * 17) №46 рекорд 1 000 000 даёт 50 000 на табло, в «набрано» не идёт; без улучшения — 0;
 * 18) №47 билет за ачивку и отказ второму за ту же ачивку в том же забеге;
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
  'amulet-survives-death': { deathAmuletSave: true },
  // Третья партия (28в): сетка и магазин.
  'grid-skull-share': { skullShareDelta: -0.01 },
  'grid-start-joker': { startJoker: true },
  'grid-start-symbol': { startSymbolPick: true },
  'grid-jackpot': { jackpotWinMul: 1.2 },
  'grid-blood-weight': { bloodWeight: 2 },
  'shop-discount': { shopPriceMul: 0.9 },
  'shop-extra-row': { offerRows: 1 },
  'shop-ticket-share': { ticketShareStart: 0.3 },
  'shop-amulet-chips': { amuletForChips: true },
  'shop-gift-item': { freeItemFirstShop: true },
  // Четвёртая партия (28г): кассета и прочее.
  'tape-keeps-streak': { rewindKeepsStreak: true },
  'tape-free': { freeTape: true },
  'tape-refund-tickets': { rewindRefundsTickets: true },
  'record-start-chips': { recordStartShare: 0.05 },
  'achievement-ticket': { achievementTickets: 1 },
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
  /** Клавиша: как настоящий ввод браузера (Пробел, «1», «2»), а не вызов метода сцены. */
  const key = async (name) => {
    const codes = { Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' }, 0: { key: '0', code: 'Digit0', keyCode: 48, text: '0' }, 1: { key: '1', code: 'Digit1', keyCode: 49, text: '1' }, 2: { key: '2', code: 'Digit2', keyCode: 50, text: '2' } };
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
  const clickCard = async (index) => clickAt(await pagePoint(`g.upgradeScreen.cards[${index}].getBounds()`));
  /** Состояние экрана улучшений — по полям сцены, а не по пикселям. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    const texts = g.children.list.filter((o) => o.type === 'Text').map((o) => o.text);
    return JSON.stringify({
      gameOver: g.isGameOver,
      open: g.upgradeScreen.isOpen,
      cards: g.upgradeScreen.cards.length,
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
  const setPurchases = async (purchases) => {
    await val(`(() => { const p = JSON.parse(localStorage.getItem('${PROGRESS_KEY}') ?? 'null') ?? {};
      p.upgrades = ${JSON.stringify(purchases)}; p.tutorialDone = true;
      localStorage.setItem('${PROGRESS_KEY}', JSON.stringify(p)); return 1; })()`);
  };
  const reload = async () => { await send('Page.reload'); await sleep(4000); };
  /** Стартовые выборы забега: сначала автомат (№49), потом символ (№33) — порядок как в игре. */
  const passPicks = async () => {
    await val('if (window.__g.machinePick.isOpen) window.__g.machinePick.press(0); 1');
    await sleep(300);
    await val('if (window.__g.symbolPick.isOpen) window.__g.symbolPick.press(0); 1');
    await sleep(300);
  };
  /** Смерть: KABOOM 1,8 с + взрыв 0,9 с + затемнение 0,7 с — экран улучшений на ~3,4 с. */
  const die = async () => {
    await val('window.__g.finishTutorial(); window.__g.kaboom(); 1');
    await sleep(4800);
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
  check(s1.texts.includes('Возьми одно бесплатно · 1–3'), 'RU: подпись «Возьми одно бесплатно · 1–3»');
  check(s1.second === false && s1.effectCount === 0, 'до выбора ничего не куплено');
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

  // ---------- 11: №30 — амулет не сгорает при смерти ----------
  await reload();
  await val('window.__g.devGiveAmulet("cherryPit"); window.__g.tickets = 0; 1');
  await sleep(600);
  check((await val('window.__g.amulets.length')) === 1, '№30: в новом забеге амулет в гнезде');
  await die();
  await key('1'); // бесплатное улучшение — билетов 0, поэтому экран закроется сам и покажет витрину памяти
  await sleep(800);
  const memory = JSON.parse((await val('JSON.stringify(window.__g.memoryOptions.map((option) => ({ id: option.amulet.id, price: option.price })))')) ?? '[]');
  check(memory.length === 1 && memory[0].price === 0, `№30: амулет переносится бесплатно даже без билетов (${JSON.stringify(memory)})`);
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
    gift: g.freeGiftGiven, chipPrices: g.amuletChipPrices, chipRate: g.chipRate,
    chipUsed: g.amuletChipUsedThisRun, chipMode: g.amuletCase.isChipMode,
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
  // №39: переключаем витрину на фишки и покупаем самый первый амулет.
  const chipBuy = JSON.parse((await val(`(() => { const g = window.__g;
    if (g.amuletOffer[0] === null) return JSON.stringify({ ok: false });
    g.amuletCase.toggleChipMode();
    const mode = g.amuletCase.isChipMode;
    g.balance = 1000000; g.refreshShop();
    const before = g.balance; const price = g.amuletChipPrices[0];
    const amulet = g.amuletOffer[0]; const copies = g.amuletCounts[amulet.id] ?? 0;
    g.buyFromCase(0);
    const paid = before - g.balance;
    const used = g.amuletChipUsedThisRun;
    const afterCopies = g.amuletCounts[amulet.id] ?? 0;
    g.amuletOffer[0] = amulet; g.tickets = 0; const again = g.balance;
    g.buyFromCase(0);
    return JSON.stringify({ ok: true, mode, price, paid, used, copies, afterCopies, secondPaid: again - g.balance });
  })()`)) ?? '{}');
  check(chipBuy.ok === true && chipBuy.mode === true, '№39: витрина переключилась на фишки');
  check(chipBuy.paid === chipBuy.price && chipBuy.price >= 5, `№39: амулет оплачен фишками по честной цене (${chipBuy.paid})`);
  check(chipBuy.afterCopies === chipBuy.copies + 1 && chipBuy.used === true, '№39: амулет куплен, флаг «раз за забег» стоит');
  check(chipBuy.secondPaid === 0, '№39: второй раз за забег фишками не берут');
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

  // ---------- 17: №46 — рекорд даёт 5% к стартовым фишкам ----------
  await val("localStorage.setItem('dolgovaya-yama-chip-record', '1000000'); 1");
  await setPurchases({ 'record-start-chips': 1 });
  await reload();
  await passPicks();
  const recordStart = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ balance: g.balance, earned: g.earned }); })()')) ?? '{}');
  check(recordStart.balance === 50000, `№46: 5% рекорда 1 000 000 = 50 000 на табло (${recordStart.balance})`);
  check(recordStart.earned === 0, '№46: стартовые фишки не идут в «набрано» — рекорд не раздувается');
  await setPurchases({});
  await reload();
  check((await val('window.__g.balance')) === 0, '№46: без улучшения стартовый баланс 0');

  // ---------- 18: №47 — каждая ачивка даёт билет один раз за забег ----------
  await setPurchases({ 'achievement-ticket': 1 });
  await reload();
  await passPicks();
  const ticket = JSON.parse((await val(`(() => { const g = window.__g; const before = g.tickets;
    g.unlockAchievement('theEnd');
    const first = g.tickets;
    g.unlockAchievement('theEnd'); // повторная проверка той же ачивки — второго билета нет
    return JSON.stringify({ before, first, second: g.tickets, given: g.achievementTicketGiven });
  })()`)) ?? '{}');
  check(ticket.first === ticket.before + 1, `№47: первая ачивка забега дала билет (${ticket.before} → ${ticket.first})`);
  check(ticket.second === ticket.first, '№47: за ту же ачивку в том же забеге второго билета нет');
  check(JSON.stringify(ticket.given) === JSON.stringify(['theEnd']), `№47: список отданных ачивок помнит theEnd (${JSON.stringify(ticket.given)})`);

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
  check(cancel.shown === true, '№50: череп выпал — рядом с полем появилась плашка отмены');
  check(cancel.pot === 400 && cancel.streak === 5, `№50: после отмены кон цел (${cancel.pot}), серия на месте (${cancel.streak})`);
  check(cancel.used === true && cancel.plaque === null, '№50: отмена одноразовая — флаг стоит, плашка убрана');
  check(cancel.can === false && cancel.spinning === false, '№50: второй отмены нет, прокрутка осела');
  const rescueBlocked = await val(`(() => { const g = window.__g;
    const was = g.skullCancelUsedThisRun; g.skullCancelUsedThisRun = false; g.isRescue = true;
    const blocked = g.canCancelSkull(); g.isRescue = false; g.skullCancelUsedThisRun = was; return blocked; })()`);
  check(rescueBlocked === false, '№50: в раунде спасения череп отменить нельзя');

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
  const fifthRun = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ runs: g.runsPlayed, debt: g.debt }); })()')) ?? '{}');
  check(fifthRun.runs === 5 && fifthRun.debt === 0, `№8: пятый забег — первый долг прощён (забег ${fifthRun.runs}, долг ${fifthRun.debt})`);
  await reload();
  await passPicks();
  const sixthRun = JSON.parse((await val('(() => { const g = window.__g; return JSON.stringify({ runs: g.runsPlayed, debt: g.debt }); })()')) ?? '{}');
  check(sixthRun.runs === 6 && sixthRun.debt === 150, `№8: шестой — долг обычный 150 (забег ${sixthRun.runs}, долг ${sixthRun.debt})`);

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

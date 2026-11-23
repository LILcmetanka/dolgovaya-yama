/**
 * Сквозной прогон полного метацикла «Долговой ямы» (шаг 36) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/soak-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в scratchpad, профиль Chrome — в scratchpad/prof-soak. Порт 8777 и Chrome на 9343 — свои.
 *
 * Зачем: до шага 36 никто ни разу не прогнал живьём весь метацикл подряд — забег, смерть, улучшения за билеты,
 * витрина памяти, новый забег с эффектом и перезагрузку со сохранённым прогрессом. Каждый шаг по отдельности
 * проверен (upgrades-check, memory-check), а стык между ними — нет.
 *
 * Что проверяет (47 проверок, ~30 секунд):
 *  1) игра открывается, прогресс чистый, ошибок и предупреждений консоли нет;
 *  2) забег ИГРАЕТСЯ до смерти: сценарий сам жмёт рычаг (g.spin — то же, что дёргает рычаг), платит банкомату,
 *     отказывается от сделок Дилера, выходит из магазина и крутит спасение, пока не KABOOM; ожидания ускорены
 *     timeScale 8 с жёсткими лимитами по времени и числу прокруток;
 *  3) после смерти — экран улучшений: ровно три карточки (UPGRADE_OFFERS) из пула, первая берётся клавишей «1»
 *     (настоящее нажатие), вторая — кликом и стоит UPGRADE_SECOND_PRICE билетов; купленное в текущем забеге
 *     ещё не действует (записано только в localStorage);
 *  4) витрина памяти амулетов: варианты и цены — из memory.ts, клик списывает цену, выбор уходит в localStorage;
 *  5) новый забег: покупки прочитаны, g.upgradeEffects совпадает с upgradeEffects(покупки) из исходника, стартовые
 *     билеты/места/прокрутки/долг — по эффектам, амулет из памяти стоит в гнезде и не списан второй раз, счётчик
 *     забегов +1;
 *  6) перезагрузка страницы: прогресс в localStorage цел, третий забег снова с теми же эффектами, память второй
 *     раз не выдаётся.
 *
 * Билеты забега (12) и пару амулетов в гнездо сценарий кладёт напрямую: за 3–4 минуты честной игры ни 6 билетов
 * на второе улучшение, ни амулет не заработать (билет — за закрытый долг). Так же делает memory-check. Всё
 * остальное — настоящий путь игры: смерть от KABOOM, выбор карточек, память, restartGame и перезагрузка.
 *
 * Время: сборка и загрузка ~8 с, забег до смерти ~5–15 с (timeScale 8), метацикл ~30 с. Весь сценарий — до
 * 3–4 минут; лимиты (90 с на забег, 300 прокруток) не дают зависнуть, если баланс позволит играть дольше.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симулятора: Node находит './rules' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node soak-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = SP;
mkdirSync(SHOTS, { recursive: true });
// Эталоны — из игры, а не из копии чисел: улучшения, память, амулеты и долг считают сами модули.
const SRC = process.env.SOAK_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const UPGRADES = await import(SRC + 'upgrades.ts');
const MEMORY = await import(SRC + 'memory.ts');
const AMULETS = await import(SRC + 'amulets.ts');
const RULES = await import(SRC + 'rules.ts');
const PROGRESS_KEY = 'dolgovaya-yama-progress';
const byId = (id) => AMULETS.AMULETS.find((amulet) => amulet.id === id);
/** Одинаковые покупки: те же id и те же числа копий (порядок ключей в JSON не важен). */
const samePurchases = (a, b) => {
  const left = a ?? {}, right = b ?? {};
  const keys = Object.keys(left).sort();
  return keys.join(',') === Object.keys(right).sort().join(',') && keys.every((upgradeId) => left[upgradeId] === right[upgradeId]);
};
/** Одинаковые эффекты: все поля neutralUpgrades (порядок ключей и лишние ключи не важны). */
const sameEffects = (a, b) => {
  const keys = Object.keys(b ?? {});
  return !!a && keys.length === Object.keys(a).length && keys.every((field) => a[field] === b[field]);
};
/**
 * Поля эффектов, которые видно прямо в начале забега. Карточку с таким полем сценарий берёт охотнее:
 * тогда «улучшение применилось» проверяется не только по upgradeEffects, но и числом на старте.
 */
const VISIBLE_EFFECTS = ['startTickets', 'itemSlots', 'firstRoundSpins', 'startDebtMul', 'debtForgiveEveryRuns'];
const visibleIndex = (offers) => offers.findIndex((upgradeId) => {
  const upgrade = UPGRADES.upgradeById(upgradeId);
  return !!upgrade && VISIBLE_EFFECTS.some((field) => upgrade.apply[field] !== undefined);
});

const srv = spawn('python3', ['-m', 'http.server', '8777', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9343', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-soak', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9343/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9343 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  /** Ошибки и предупреждения: консоль страницы (console.error/warn), необработанные исключения и записи браузера. */
  const consoleErrors = [];
  const consoleWarnings = [];
  const pushText = (list, text) => { const line = String(text ?? '').replace(/\s+/g, ' ').slice(0, 300); if (line) list.push(line); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) pend.get(m.id)(m);
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? a.type ?? '').join(' ');
      if (m.params.type === 'error' || m.params.type === 'assert') pushText(consoleErrors, text);
      else if (m.params.type === 'warning') pushText(consoleWarnings, text);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pushText(consoleErrors, (d.exception && d.exception.description) || d.text);
    }
    if (m.method === 'Log.entryAdded') {
      const entry = m.params.entry;
      if (entry.level === 'error') pushText(consoleErrors, entry.text);
      else if (entry.level === 'warning') pushText(consoleWarnings, entry.text);
    }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Runtime.evaluate: значение выражения или undefined, если страница бросила исключение (ошибку печатаем). */
  const val = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error || r.result.exceptionDetails) {
      const d = r.result && r.result.exceptionDetails;
      console.log('page error:', (d && d.exception && d.exception.description) || (d && d.text) || JSON.stringify(r.error), '| expr:', expr.slice(0, 90).replace(/\s+/g, ' '));
      return undefined;
    }
    return r.result.result.value;
  };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SHOTS + '/' + name, Buffer.from(r.result.data, 'base64')); };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };
  const json = (text) => JSON.parse(text ?? 'null');
  /** Настоящая клавиша браузера: так проверяется ввод, а не метод сцены. */
  const key = async (name) => {
    const codes = {
      Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
      0: { key: '0', code: 'Digit0', keyCode: 48, text: '0' },
      1: { key: '1', code: 'Digit1', keyCode: 49, text: '1' },
      2: { key: '2', code: 'Digit2', keyCode: 50, text: '2' },
    };
    const spec = codes[name];
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode, text: spec.text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: spec.key, code: spec.code, windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode });
    await sleep(400);
  };
  /** Точка раскладки → точка страницы: левый край холста + (x − scrollX) × zoom × масштаб холста. */
  const pagePoint = async (expr) => json(await val(`(() => {
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
  /** Состояние метацикла — по полям сцены и localStorage, а не по пикселям. */
  const state = async () => json(await val(`(() => {
    const g = window.__g;
    const progress = (() => { try { return JSON.parse(localStorage.getItem('${PROGRESS_KEY}') ?? 'null'); } catch { return 'broken'; } })();
    return JSON.stringify({
      gameOver: g.isGameOver, endScreen: g.isEndScreenOpen, runs: g.runsPlayed,
      upgrades: g.upgrades, effects: g.upgradeEffects,
      tickets: g.tickets, slots: g.slots, spinsLeft: g.spinsLeft, debt: g.debt, balance: g.balance,
      amulets: g.amulets.map((amulet) => amulet.id),
      upgOpen: g.upgradeScreen.isOpen, cards: g.upgradeScreen.cards.length, offers: g.upgradeOfferList.map((u) => u.id),
      second: g.upgradeSecondPhase,
      memoryBox: g.memoryBox !== null, memoryOptions: g.memoryOptions.map((option) => ({ id: option.amulet.id, price: option.price })),
      memoryChips: g.memoryChips.length, memoryTitle: g.memoryTitleText ? g.memoryTitleText.text : null,
      purchases: progress && progress !== 'broken' ? progress.upgrades ?? {} : progress,
      memory: progress && progress !== 'broken' ? progress.memoryAmulet ?? null : progress,
      progressRuns: progress && progress !== 'broken' ? progress.runs ?? 0 : progress,
      choosing: g.isChoosingSymbol || g.isChoosingMachine,
    });
  })()`)) ?? {};

  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8777/' });
  await sleep(3500);
  // Язык — русский (headless Chrome англоязычный), прогресс — с чистого листа: сценарий проверяет метацикл с нуля.
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru'); localStorage.removeItem('${PROGRESS_KEY}'); localStorage.removeItem('dolgovaya-yama-record'); 1`);
  await send('Page.reload');
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(600);
  const fresh = await state();
  check(fresh.progressRuns === 1 && Object.keys(fresh.purchases).length === 0 && fresh.memory === null,
    `прогресс чистый: забег ${fresh.progressRuns}, улучшений ${Object.keys(fresh.purchases).length}, памяти нет`);
  /** Подготовка забега: билеты на второе улучшение и витрину памяти, пара амулетов в гнезде, ускорение времени. */
  const prepared = await val(`(() => {
    const g = window.__g;
    const amulets = ${JSON.stringify(['bell', 'boost'].map(byId))};
    g.amulets = amulets;
    g.amuletCounts = ${JSON.stringify(Object.fromEntries(['bell', 'boost'].map((amuletId) => [amuletId, 1])))};
    g.amuletRack.setAmulets(g.amulets, g.amuletCounts);
    g.tickets = 12; // 6 на второе улучшение + 2–3 на память
    g.refreshHud();
    g.time.timeScale = 8; // забег до смерти не должен тянуться минуты: ускоряем таймеры сцены
    g.tweens.timeScale = 8;
    return JSON.stringify({ amulets: g.amulets.map((a) => a.id), tickets: g.tickets });
  })()`);
  check(json(prepared) && json(prepared).amulets.join(',') === 'bell,boost' && json(prepared).tickets === 12,
    'забег подготовлен: билетов 12, в гнезде 🔔 и 🚀 (подложены напрямую, как в memory-check)');

  // ---------- 1. Забег до смерти: рычаг, банкомат, сделки, магазин, спасение ----------
  console.log('--- 1. забег до смерти (timeScale 8)');
  const errorsBeforeRun = consoleErrors.length;
  const played = json(await val(`(async () => {
    const g = window.__g;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { spins: 0, rescueSpins: 0, payments: 0, deals: 0, shops: 0, rounds: [], forced: false };
    const t0 = performance.now();
    let last = '';
    const snapshot = () => {
      const st = g.isGameOver ? 'dead'
        : g.isRescue ? 'rescue'
        : g.isRerolling ? 'reroll'
        : g.isAwaitingPayment ? 'pay'
        : g.isDealing || g.isDealerClosing ? 'dealer'
        : g.isShopOpen || g.isLeavingShop ? 'shop'
        : g.isSpinning || g.isRoundOver || g.isRewinding || g.isVictoryPending ? 'busy'
        : g.isChoosingSymbol ? 'sym' : g.isChoosingMachine ? 'mac'
        : g.isAchievementShown ? 'ach' : g.isPaused ? 'pause' : 'idle';
      // В отчёт — только заметные события и смены раунда: idle/busy мелькают на каждой прокрутке и топят строку.
      const notable = st !== 'idle' && st !== 'busy' && st !== 'ach';
      if (st !== last) {
        last = st;
        if (out.rounds.length < 12 && (notable || out.lastRound !== g.round)) out.rounds.push(st + '@' + g.round);
        out.lastRound = g.round;
      }
      return st;
    };
    for (let i = 0; i < 4000; i++) {
      if (performance.now() - t0 > 90000 || out.spins > 300) { out.forced = !g.isGameOver; break; }
      const st = snapshot();
      if (st === 'dead') break;
      if (st === 'busy' || st === 'ach') { await raf(); continue; }
      if (st === 'sym') { g.symbolPick.press(0); await wait(20); continue; }
      if (st === 'mac') { g.machinePick.press(0); await wait(20); continue; }
      if (st === 'dealer') {
        if (g.isDealing) { g.refusePacts(); out.deals += 1; }
        await wait(80); continue;
      }
      if (st === 'shop') { if (g.isShopOpen) { g.leaveShop(); out.shops += 1; } await wait(120); continue; }
      if (st === 'rescue') {
        if (!g.isSpinning && !g.isRescueIntro && !g.isRescueWinPending && g.rescueSpinsLeft > 0) { g.rescueSpinNow(); out.rescueSpins += 1; }
        await wait(20); continue;
      }
      if (st === 'reroll') {
        const kind = g.pendingReroll && g.pendingReroll.id;
        if (kind === 'shuffle') g.applyShuffle(0); else g.applySwap(0, 0);
        await wait(40); continue;
      }
      if (st === 'pay') { g.payDebt(); out.payments += 1; await wait(60); continue; }
      if (st === 'pause') { g.resumeGame(); await wait(20); continue; }
      if (g.canAct()) { g.spin(); out.spins += 1; await wait(10); continue; }
      await wait(20);
    }
    // Дошли до смерти — возвращаем обычную скорость, чтобы экран смерти и метацикл шли как в игре.
    g.time.timeScale = 1; g.tweens.timeScale = 1;
    out.wall = Math.round(performance.now() - t0);
    out.dead = g.isGameOver;
    out.round = g.round; out.balance = g.balance; out.debt = g.debt; out.tickets = g.tickets;
    return JSON.stringify(out);
  })()`));
  check(played && played.dead === true, `забег дошёл до смерти сам: ${played ? played.spins : '—'} прокруток (спасение ${played ? played.rescueSpins : '—'}), ${played ? played.wall : '—'} мс, платежей банкомату ${played ? played.payments : '—'}, кругов: ${played ? played.rounds.join(' → ') : '—'}`);
  check(played && played.spins > 0 && played.forced === false, `смерть — от игры, а не по лимиту сценария (${played ? played.spins : '—'} прокруток, принудительного KABOOM нет)`);
  check(consoleErrors.length === errorsBeforeRun, `ошибок консоли за забег нет: ${consoleErrors.length - errorsBeforeRun}`);

  // Экран смерти и улучшения: ждём появления, а не «по часам» (KABOOM идёт 1,8 + 0,9 + 0,7 с).
  for (let i = 0; i < 60; i++) {
    if (await val('window.__g.upgradeScreen.isOpen || window.__g.memoryBox !== null')) break;
    await sleep(250);
  }
  await sleep(400);
  const dead = await state();
  check(dead.gameOver === true && dead.endScreen === true, 'KABOOM: экран смерти открыт');
  check(dead.upgOpen === true && dead.cards === UPGRADES.UPGRADE_OFFERS && dead.offers.length === UPGRADES.UPGRADE_OFFERS,
    `после смерти — три карточки улучшений (UPGRADE_OFFERS = ${UPGRADES.UPGRADE_OFFERS}): ${dead.offers.join(', ')}`);
  check(dead.offers.every((upgradeId) => UPGRADES.upgradeById(upgradeId) && UPGRADES.leftToTake(UPGRADES.upgradeById(upgradeId), dead.purchases) > 0),
    'все три карточки — из пула и ещё не купленные: ' + dead.offers.join(', '));
  check(dead.tickets >= UPGRADES.UPGRADE_SECOND_PRICE, `билетов хватает на второе улучшение: ${dead.tickets} ≥ ${UPGRADES.UPGRADE_SECOND_PRICE}`);
  await shot('soak-1-death-upgrades.png');

  // ---------- 2. Первая карточка ключом «1», вторая — кликом за 6 билетов ----------
  console.log('--- 2. улучшения: бесплатное и второе за билеты');
  // Берём карточку с видимым стартовым эффектом, если она есть; иначе — первую. Клавиша — настоящая (1–3).
  const firstPick = Math.max(0, visibleIndex(dead.offers));
  const firstOffer = dead.offers[firstPick];
  const runsBefore = dead.runs;
  await key(String(firstPick + 1));
  const afterFirst = await state();
  check(afterFirst.purchases[firstOffer] === 1 && !dead.purchases[firstOffer], `клавиша «${firstPick + 1}» купила «${firstOffer}»: в localStorage ${afterFirst.purchases[firstOffer] ?? 0}, раньше ${dead.purchases[firstOffer] ?? 0}`);
  check(afterFirst.tickets === dead.tickets, `за бесплатное билеты не списаны: ${afterFirst.tickets} = ${dead.tickets}`);
  check(afterFirst.second === true && afterFirst.cards === 2, `вторая фаза: ${afterFirst.cards} карточки за ${UPGRADES.UPGRADE_SECOND_PRICE} билетов`);
  check(sameEffects(afterFirst.effects, dead.effects), 'купленное на экране смерти ещё не действует: g.upgradeEffects этого забега не изменился');
  await shot('soak-2-second-upgrade.png');
  const secondPick = Math.max(0, visibleIndex(afterFirst.offers));
  const secondOffer = afterFirst.offers[secondPick];
  await clickCard(secondPick);
  const afterSecond = await state();
  check(afterSecond.purchases[secondOffer] === 1, `клик купил «${secondOffer}»`);
  check(afterSecond.tickets === afterFirst.tickets - UPGRADES.UPGRADE_SECOND_PRICE,
    `второе улучшение стоило ровно ${UPGRADES.UPGRADE_SECOND_PRICE} билетов: ${afterFirst.tickets} → ${afterSecond.tickets}`);
  check(afterSecond.upgOpen === false && afterSecond.cards === 0, 'экран улучшений закрыт — дальше витрина памяти');
  check(Object.keys(afterSecond.purchases).length === 2, 'в прогрессе две покупки: ' + Object.keys(afterSecond.purchases).join(', '));

  // ---------- 3. Витрина памяти: варианты из memory.ts, клик по амулету ----------
  console.log('--- 3. витрина памяти амулетов');
  const memory = await state();
  const owned = ['bell', 'boost'];
  const expectedMemory = MEMORY.memoryOptions(owned, memory.tickets, 0).map((option) => ({ id: option.amulet.id, price: option.price }));
  check(memory.memoryBox === true && memory.memoryChips === expectedMemory.length,
    `витрина памяти на экране смерти: значков ${memory.memoryChips} (ждали ${expectedMemory.length})`);
  check(JSON.stringify(memory.memoryOptions) === JSON.stringify(expectedMemory),
    'варианты и цены — из memory.ts: ' + JSON.stringify(expectedMemory));
  check(memory.memoryTitle === 'ВИТРИНА ПАМЯТИ', 'RU: заголовок витрины — ' + JSON.stringify(memory.memoryTitle));
  await shot('soak-3-memory.png');
  const bellIndex = memory.memoryOptions.findIndex((option) => option.id === 'bell');
  const bellPrice = bellIndex >= 0 ? memory.memoryOptions[bellIndex].price : 0;
  check(bellIndex >= 0 && bellPrice === MEMORY.memoryPrice(byId('bell').rarity), `в витрине есть 🔔 за ${bellPrice} (memoryPrice по редкости)`);
  const bellPoint = await pagePoint(`g.memoryChips[${Math.max(0, bellIndex)}].getBounds()`);
  await clickAt(bellPoint);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 });
  await val('window.__g.tooltip.hide(); 1');
  const kept = await state();
  check(kept.tickets === memory.tickets - bellPrice, `клик по амулету списал цену: ${memory.tickets} → ${kept.tickets} (цена ${bellPrice})`);
  check(kept.memory === 'bell', 'выбор записан в localStorage: ' + JSON.stringify(kept.memory));
  check(kept.memoryChips === 0 && kept.memoryTitle === 'В ПАМЯТИ: ' + byId('bell').name.ru, 'витрина стала строкой памяти: ' + JSON.stringify(kept.memoryTitle));

  // ---------- 4. Новый забег: покупки действуют, амулет из памяти в гнезде ----------
  console.log('--- 4. новый забег с улучшениями и памятью');
  const errorsBeforeRestart = consoleErrors.length;
  await val('window.__g.restartGame(); 1');
  await sleep(4500);
  if (await val('window.__g.isChoosingMachine')) { await val('window.__g.machinePick.press(0); 1'); await sleep(300); }
  if (await val('window.__g.isChoosingSymbol')) { await val('window.__g.symbolPick.press(0); 1'); await sleep(300); }
  const next = await state();
  const purchases = next.purchases;
  const effects = UPGRADES.upgradeEffects(purchases);
  const expectedDebt = UPGRADES.forgivesDebt(effects.debtForgiveEveryRuns, next.progressRuns) ? 0 : RULES.startDebt(effects.startDebtMul);
  check(next.gameOver === false && next.upgOpen === false, 'новый забег начался, экрана улучшений нет');
  check(next.runs === runsBefore + 1, `счётчик забегов вырос на один: ${runsBefore} → ${next.runs}`);
  check(samePurchases(next.upgrades, purchases), 'забег прочитал покупки: ' + JSON.stringify(purchases));
  check(sameEffects(next.effects, effects), 'g.upgradeEffects совпадает с upgradeEffects(покупки) из исходника');
  check(!sameEffects(next.effects, UPGRADES.neutralUpgrades()), 'покупки правда применились: эффекты забега не нейтральные');
  check(next.tickets === effects.startTickets, `стартовые билеты по эффектам: ${next.tickets} = ${effects.startTickets}`);
  check(next.slots === UPGRADES.startItemSlots(effects.itemSlots), `мест на полке по эффектам: ${next.slots} = ${UPGRADES.startItemSlots(effects.itemSlots)}`);
  check(next.spinsLeft === RULES.SPINS_PER_ROUND + effects.firstRoundSpins, `прокруток в первом раунде по эффектам: ${next.spinsLeft} = ${RULES.SPINS_PER_ROUND} + ${effects.firstRoundSpins}`);
  check(next.debt === expectedDebt, `первый долг по эффектам: ${next.debt} = ${expectedDebt}`);
  check(next.amulets.includes('bell') && next.memory === null, 'амулет из памяти стоит в гнезде, память стёрта: ' + next.amulets.join(', '));
  check(next.amulets.length === 1, 'в новом забеге только амулет из памяти: ' + next.amulets.join(', '));
  check(consoleErrors.length === errorsBeforeRestart, `ошибок консоли в новом забеге нет: ${consoleErrors.length - errorsBeforeRestart}`);
  await shot('soak-4-new-run.png');

  // ---------- 5. Перезагрузка: localStorage цел, третий забег с теми же эффектами ----------
  console.log('--- 5. перезагрузка страницы и третий забег');
  const errorsBeforeReload = consoleErrors.length;
  const runsBeforeReload = next.runs;
  await send('Page.reload');
  await sleep(4000);
  if (await val('window.__g.isChoosingMachine')) { await val('window.__g.machinePick.press(0); 1'); await sleep(300); }
  if (await val('window.__g.isChoosingSymbol')) { await val('window.__g.symbolPick.press(0); 1'); await sleep(300); }
  const third = await state();
  const expectedDebt3 = UPGRADES.forgivesDebt(effects.debtForgiveEveryRuns, third.progressRuns) ? 0 : RULES.startDebt(effects.startDebtMul);
  check(samePurchases(third.purchases, purchases), 'localStorage сохранил улучшения после перезагрузки: ' + JSON.stringify(third.purchases));
  check(third.memory === null, 'память амулета после перезагрузки чиста');
  check(third.runs === runsBeforeReload + 1, `перезагрузка начала новый (третий) забег: ${runsBeforeReload} → ${third.runs}`);
  check(samePurchases(third.upgrades, purchases) && sameEffects(third.effects, effects),
    'третий забег: покупки и эффекты те же, что до перезагрузки');
  check(!sameEffects(third.effects, UPGRADES.neutralUpgrades()), 'третий забег: эффекты покупок на месте (не нейтральные)');
  check(third.tickets === effects.startTickets && third.slots === UPGRADES.startItemSlots(effects.itemSlots) && third.spinsLeft === RULES.SPINS_PER_ROUND + effects.firstRoundSpins,
    `третий забег: билеты ${third.tickets}, места ${third.slots}, прокрутки ${third.spinsLeft} — по эффектам`);
  check(third.debt === expectedDebt3, `третий забег: первый долг ${third.debt} = ${expectedDebt3}`);
  check(third.amulets.length === 0, 'память амулета второй раз не выдана: гнёзда пусты');
  check(consoleErrors.length === errorsBeforeReload, `ошибок консоли после перезагрузки нет: ${consoleErrors.length - errorsBeforeReload}`);
  await shot('soak-5-reload-run.png');

  // Итог по консоли: ошибки — падение, предупреждения только печатаем (их может писать сам браузер/WebGL).
  check(consoleErrors.length === 0, `за весь прогон ни одной ошибки консоли: ${consoleErrors.length}${consoleErrors.length ? ' — ' + consoleErrors.slice(0, 3).join(' | ') : ''}`);
  if (consoleWarnings.length) console.log('     предупреждения браузера (не ошибки): ' + consoleWarnings.slice(0, 5).join(' | '));
  console.log(`итог ${ok} из ${all}; предупреждений ${consoleWarnings.length}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

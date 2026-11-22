/**
 * Проверка раунда спасения (шаги 27 и 31, сообщения вместо полосы — шаг 32) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/rescue-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в /tmp/opencode/step32, профиль Chrome — в scratchpad.
 * Порты — свои: http 8773, отладка Chrome 9340 (8772/9339 у last-chance-check, 8771/9338 и другие — у прочих).
 *
 * Что проверяет (шаг 32 — сообщения вместо плашки):
 *  1) вход в спасение: isRescue, 5 прокруток, плашки-окна нет вовсе (ни rescueBar, ни прямоугольника 222×82,
 *     ни старых строк «СПАСЕНИЕ»/«ОСТАЛОСЬ ПРОКРУТОК»);
 *  2) заставка на экране автомата идёт тремя сообщениями по порядку: «ВНИМАНИЕ!» → «АКТИВИРОВАН ПОСЛЕДНИЙ ШАНС»
 *     → «СОБЕРИ ЛЮБОЙ ПАТТЕРН ЧТОБЫ ВЫЖИТЬ»; пока она идёт, крутить нельзя, после — можно;
 *  3) красный режим: огни автомата красные, плёнка и свечение по краям, амулеты и предметы притушены;
 *  4) прокрутка: счётчик уменьшается, на стекле подсказка «ЗАМОРОЗЬ СТОЛБЕЦ · ОСТАЛОСЬ N» (внутри сообщения,
 *     отдельной строки счётчика нет), после неё открыт выбор столбца;
 *  5) клик по столбцу морозит его, подсказка меняется на «КРУТИ РЫЧАГ · ОСТАЛОСЬ N», второй столбец в том же ходу
 *     не морозится, замороженный столбец не прокручивается, разморозка возвращает столбец в игру;
 *  6) когда остаётся одна прокрутка — «ПОСЛЕДНЯЯ ПРОКРУТКА»;
 *  7) пять прокруток без паттерна — смерть: KABOOM, isRescue снят, подсказка снята, красный режим погас;
 *     провал спасения — сразу KABOOM (шаг 34, прощения больше нет): счёт раунда не меняется, баланс и билеты
 *     те же, магазин не открывается даже через паузу, никакого попапа о прощении на экране;
 *  8) паттерн — выжил: на стекле «ПАТТЕРН СОБРАН», красное гаснет, и только после затухания (RESCUE_FADE_TIME)
 *     открывается магазин; фишек и билетов за выживание не дают, долг тот же, счёт раунда на месте;
 *  9) вторая нехватка фишек при израсходованном спасении — сразу KABOOM: isGameOver, isRescue не встал,
 *     на экране банкомата KABOOM, а не GOOD LUCK, и раунд спасения не начинается;
 * 10) тексты RU/EN и раскладка 1280×720 / 390×844: сообщение целиком внутри стекла паттернов.
 * Правила 22.11.2026: за выживание не начисляют ничего, долг тот же, раунд заново (PLAN.md, шаги 27 и 31).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node rescue-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = '/tmp/opencode/step32';
mkdirSync(SHOTS, { recursive: true });
const srv = spawn('python3', ['-m', 'http.server', '8773', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn(
  'google-chrome-stable',
  [
    '--headless=new', '--remote-debugging-port=9340', '--window-size=1280,720',
    '--user-data-dir=' + SP + '/prof-rescue', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu',
    '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ],
  { stdio: 'ignore' },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RU_ALERTS = ['ВНИМАНИЕ!', 'АКТИВИРОВАН ПОСЛЕДНИЙ ШАНС', 'СОБЕРИ ЛЮБОЙ ПАТТЕРН ЧТОБЫ ВЫЖИТЬ'];
const EN_ALERTS = ['WARNING!', 'LAST CHANCE ACTIVATED', 'LAND ANY PATTERN TO SURVIVE'];

/** Пустая сетка, но замороженные столбцы остаются как были: проверяем, что прокрутка их не тронула. */
const BLANK_KEEP_FROZEN = `(() => {
  const g = window.__g;
  const frozen = new Set([...g.frozenColumns]);
  const cell = (r, c) => ({ id: 'blank' + r + '-' + c, sign: '·', color: 0, weight: 0, price: 1, unlockRound: 1 });
  g.rescueGrid = g.rescueGrid.map((row, r) => row.map((symbol, c) => (frozen.has(c) ? symbol : cell(r, c))));
  return 1;
})()`;
/** Пустая сетка, но столбец col остаётся настоящим: на нём проверяем заморозку. Три одинаковых в нём разводим. */
const blankExcept = (col) => `(() => {
  const g = window.__g;
  const cell = (r, c) => ({ id: 'blank' + r + '-' + c, sign: '·', color: 0, weight: 0, price: 1, unlockRound: 1 });
  g.rescueGrid = g.rescueGrid.map((row, r) => row.map((symbol, c) => (c === ${col} ? symbol : cell(r, c))));
  const ids = new Set(g.rescueGrid.map((row) => row[${col}].id));
  if (ids.size === 1) g.rescueGrid[0][${col}] = cell(9, ${col});
  return 1;
})()`;
/** Сетка, которая точно собирает паттерн: все 15 клеток — один платящий символ (джекпот). */
const WIN_ALL = `(() => {
  const g = window.__g;
  const cell = { id: 'win', sign: '0', color: 0, weight: 0, price: 1, unlockRound: 1 };
  g.rescueGrid = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => cell));
  return 1;
})()`;

try {
  let tabs;
  for (let i = 0; i < 40; i++) {
    try {
      tabs = await (await fetch('http://127.0.0.1:9340/json')).json();
      if (tabs.length) break;
    } catch {}
    await sleep(300);
  }
  const page = tabs && tabs.find((tab) => tab.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9340 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let id = 0;
  const pend = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pend.has(message.id)) pend.get(message.id)(message);
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const i = ++id;
    pend.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  /** Runtime.evaluate: значение выражения или undefined, если страница бросила исключение. */
  const val = async (expr) => {
    const result = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (result.error || result.result.exceptionDetails) return undefined;
    return result.result.result.value;
  };
  const shot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SHOTS + '/' + name, Buffer.from(result.result.data, 'base64'));
  };
  let ok = 0;
  let all = 0;
  const check = (cond, what) => {
    all++;
    if (cond) ok++;
    console.log((cond ? 'OK   ' : 'FAIL ') + what);
  };

  /**
   * Всё, что нужно проверкам: ход спасения, сообщение на стекле (его текст и границы внутри полосы стекла)
   * и текст текущей строки заставки на экране автомата.
   */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    const b = (o) => { const r = o.getBounds(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const newsLabel = g.screen.news ? g.screen.news.parts.find((part) => typeof part.text === 'string') : null;
    const strip = g.screen.news ? g.screen.news.parts[0] : null;
    const sequenceTitle = g.collector.screenSequence.find((part) => typeof part.text === 'string');
    return JSON.stringify({
      isRescue: g.isRescue, isSpinning: g.isSpinning, intro: g.isRescueIntro, spinsLeft: g.rescueSpinsLeft, freezeUsed: g.rescueFreezeUsed,
      frozen: [...g.frozenColumns], pickMode: g.screen.pickMode ?? null,
      grid: g.rescueGrid ? g.rescueGrid.map((row) => row.map((symbol) => symbol.id).join('|')).join('/') : null,
      redWash: g.atmosphere.redWash.alpha, redVignette: g.atmosphere.redVignette.alpha,
      lampColor: g.screen.lampColor, itemAlpha: g.itemShelf.items[0].alpha, amuletAlpha: g.amuletRack.badges[0].alpha,
      news: newsLabel ? newsLabel.text : null, newsBox: newsLabel ? b(newsLabel) : null, glassBox: strip ? b(strip) : null,
      sequenceTitle: sequenceTitle ? sequenceTitle.text : null, sequenceParts: g.collector.screenSequence.length,
      screenTexts: g.children.list.filter((o) => typeof o.text === 'string' && o.visible).map((o) => o.text),
      hasBar: typeof g.rescueBar !== 'undefined',
      bandRect: g.children.list.some((o) => o.type === 'Rectangle' && Math.round(o.width) === 222 && Math.round(o.height) === 82),
      debt: g.debt, debtNextMul: g.debtNextMul, round: g.round, shop: g.isShopOpen, gameOver: g.isGameOver,
      balance: g.balance, tickets: g.tickets,
      frames: g.screen.freezeFrames.map((frame) => frame.visible),
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
  const clickColumn = async (col) => clickAt(await pagePoint(`g.screen.zones[1][${col}].getBounds()`));
  const moveAway = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 });
    await val('window.__g.tooltip.hide(); 1');
    await sleep(250);
  };
  /**
   * Открыть спасение напрямую: живой путь через Коллектора и GOOD LUCK длинный, правила те же.
   * Заставка идёт ~4 с; ждём, пока ввод откроется, и заодно собираем строки заставки по порядку.
   */
  const openRescue = async (debt = 1000, balance = 0, round = 1) => {
    await val(`(() => {
      const g = window.__g;
      g.finishTutorial(); g.isGameOver = false; g.isRescueWinPending = false; g.pacts = [];
      g.debt = ${debt}; g.balance = ${balance}; g.round = ${round};
      g.startRescue(); return 1;
    })()`);
    const seen = [];
    for (let i = 0; i < 120; i++) {
      const s = await state();
      if (s.sequenceTitle && !seen.includes(s.sequenceTitle)) seen.push(s.sequenceTitle);
      if (!s.intro) break;
      await sleep(80);
    }
    await sleep(150); // экран заставки погас
    return seen;
  };
  /** Прокрутка: сцена считает сетку сразу, а мы подменяем итог до колбэка — так исход детерминирован. */
  const spin = async (gridExpr, wait = 200) => {
    await val(`window.__g.spin(); ${gridExpr}`);
    // Ждём, пока столбцы встанут: фиксированная пауза на медленной машине может кончиться раньше.
    for (let i = 0; i < 80; i++) {
      if (!(await val('window.__g.isSpinning'))) break;
      await sleep(100);
    }
    await sleep(wait);
  };
  /** Чистая сцена между блоками: так же сбрасываются красный режим и экран смерти/магазина. */
  const reload = async () => {
    await send('Page.reload');
    await sleep(3500);
    await val('window.__g.finishTutorial(); 1');
    await sleep(500);
  };
  /** Сообщение на стекле целиком внутри его полосы. */
  const newsInsideGlass = (s) =>
    s.newsBox !== null && s.glassBox !== null &&
    s.newsBox.x >= s.glassBox.x && s.newsBox.right <= s.glassBox.right &&
    s.newsBox.y >= s.glassBox.y && s.newsBox.bottom <= s.glassBox.bottom;

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8773/' });
  await sleep(3500);
  // Язык — из localStorage, а не из языка браузера: headless Chrome англоязычный, первая часть проверки русская.
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'ru')`);
  await send('Page.reload');
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(700);

  // ---------- Живой вход: Коллектор → GOOD LUCK → спасение ----------
  await val(`(() => {
    const g = window.__g;
    g.debt = 1000; g.balance = 0; g.isRoundOver = true; g.spinsLeft = 0;
    g.callCollector(false); return 1;
  })()`);
  let liveEntry = false;
  for (let i = 0; i < 40; i++) {
    if (await val('window.__g.isRescue')) {
      liveEntry = true;
      break;
    }
    await sleep(250);
  }
  check(liveEntry, 'живой вход: банкомат уехал с GOOD LUCK — началось спасение');
  const live = await state();
  check(live.intro === true, 'живой вход: сразу пошла заставка на экране автомата');
  check(live.sequenceTitle === RU_ALERTS[0], 'живой вход: первая строка заставки — ' + JSON.stringify(live.sequenceTitle));
  const liveSpinsBefore = live.spinsLeft;
  await val('window.__g.spin(); 1');
  await sleep(250);
  const liveLocked = await state();
  check(liveLocked.isSpinning === false && liveLocked.spinsLeft === liveSpinsBefore, 'пока заставка идёт, крутить нельзя: прокрутка не началась (прокруток ' + liveSpinsBefore + ' → ' + liveLocked.spinsLeft + ', spinning ' + liveLocked.isSpinning + ', intro ' + liveLocked.intro + ')');
  check(liveLocked.redWash > 0.1, 'живой вход: красный режим включился');
  await shot('rescue-ru-1280-intro.png'); // заставка на экране автомата
  // Досматриваем заставку до конца: она должна открыть ввод.
  for (let i = 0; i < 120; i++) {
    if (!(await val('window.__g.isRescueIntro'))) break;
    await sleep(100);
  }
  const liveDone = await state();
  check(liveDone.intro === false, 'заставка погасла и открыла ввод');
  check(liveDone.sequenceParts === 0, 'чёрный экран заставки убран целиком');
  await reload();
  const clean = await state();
  check(clean.isRescue === false && clean.redWash === 0, 'перезапуск сцены («ЗАНОВО») снимает спасение и красный цвет');

  // ---------- Русский, 1280×720: заставка, вход и красный режим ----------
  const ruIntro = await openRescue(1000, 0, 1);
  const s1 = await state();
  check(s1.isRescue === true, 'спасение идёт: isRescue');
  check(s1.spinsLeft === 5, 'на входе 5 прокруток (их ' + s1.spinsLeft + ')');
  check(JSON.stringify(ruIntro) === JSON.stringify(RU_ALERTS), 'RU: заставка тремя сообщениями по порядку: ' + JSON.stringify(ruIntro));
  check(s1.hasBar === false, 'плашки-окна нет: rescueBar в сцене отсутствует');
  check(s1.bandRect === false, 'плашки-окна нет: прямоугольника 222×82 в сцене нет');
  check(!s1.screenTexts.includes('СПАСЕНИЕ') && !s1.screenTexts.some((t) => t.startsWith('ОСТАЛОСЬ ПРОКРУТОК')), 'старых строк полосы («СПАСЕНИЕ», «ОСТАЛОСЬ ПРОКРУТОК») на экране нет');
  check(s1.news === null, 'после заставки сообщений на стекле нет — счётчик не висит отдельной строкой');
  check((await val('window.__g.canRewind()')) === false, 'в спасении откат кассетой закрыт: счёт и долг не откатить');
  check(s1.redWash > 0.1, 'красная плёнка на весь вид (alpha ' + s1.redWash.toFixed(2) + ')');
  check(s1.redVignette > 0.4, 'красное свечение по краям (alpha ' + s1.redVignette.toFixed(2) + ')');
  check(s1.lampColor === 0xef4444, 'бегущие огни автомата красные (' + s1.lampColor + ')');
  check(Math.abs(s1.itemAlpha - 0.35) < 0.02, 'предметы на полке притушены (alpha ' + s1.itemAlpha.toFixed(2) + ')');
  check(Math.abs(s1.amuletAlpha - 0.35) < 0.02, 'амулеты притушены (alpha ' + s1.amuletAlpha.toFixed(2) + ')');
  await moveAway();
  await shot('rescue-ru-1280-red.png');

  // ---------- Прокрутка и заморозка столбца ----------
  await spin(blankExcept(2));
  const s2 = await state();
  check(s2.spinsLeft === 4, 'первая прокрутка: осталось 4 (их ' + s2.spinsLeft + ')');
  check(s2.pickMode === 'column', 'после прокрутки открыт выбор столбца (pickMode ' + s2.pickMode + ')');
  check(s2.news === 'ЗАМОРОЗЬ СТОЛБЕЦ · ОСТАЛОСЬ 4', 'на стекле подсказка со счётчиком: ' + JSON.stringify(s2.news));
  check(newsInsideGlass(s2), 'подсказка целиком внутри стекла паттернов');
  const frozenBefore = s2.grid ? s2.grid.split('/').map((row) => row.split('|')[2]).join('|') : null;
  await clickColumn(2);
  const s3 = await state();
  check(JSON.stringify(s3.frozen) === '[2]', 'клик по столбцу 2 заморозил его: ' + JSON.stringify(s3.frozen));
  check(s3.frames[2] === true, 'лёд виден на столбце 2');
  check(s3.freezeUsed === true, 'заморозка потратила ход');
  check(s3.pickMode === null, 'после заморозки выбор столбца закрыт: второе действие за ход нельзя');
  check(s3.news === 'КРУТИ РЫЧАГ · ОСТАЛОСЬ 4', 'после заморозки подсказка сменилась: ' + JSON.stringify(s3.news));
  // Второй столбец в том же ходу не морозится — правило проверяем прямым вызовом (клики уже выключены).
  await val('window.__g.onRescuePick(3); 1');
  await sleep(250);
  const s4 = await state();
  check(JSON.stringify(s4.frozen) === '[2]', 'второй столбец в том же ходу не заморозился: ' + JSON.stringify(s4.frozen));
  await moveAway();
  await shot('rescue-ru-1280-frozen.png');

  await spin(BLANK_KEEP_FROZEN);
  const s5 = await state();
  check(s5.spinsLeft === 3, 'вторая прокрутка: осталось 3 (их ' + s5.spinsLeft + ')');
  check(JSON.stringify(s5.frozen) === '[2]', 'заморозка пережила прокрутку: ' + JSON.stringify(s5.frozen));
  const frozenAfter = s5.grid ? s5.grid.split('/').map((row) => row.split('|')[2]).join('|') : null;
  check(frozenBefore !== null && frozenAfter === frozenBefore, 'замороженный столбец 2 не прокрутился: ' + frozenBefore + ' → ' + frozenAfter);
  check(s5.freezeUsed === false, 'новый ход: заморозка снова доступна');
  check(s5.pickMode === 'column', 'после прокрутки снова открыт выбор столбца');
  check(s5.news === 'ЗАМОРОЗЬ СТОЛБЕЦ · ОСТАЛОСЬ 3', 'счётчик в подсказке верный: ' + JSON.stringify(s5.news));
  await clickColumn(2);
  const s6 = await state();
  check(s6.frozen.length === 0, 'клик по столбцу 2 разморозил его: ' + JSON.stringify(s6.frozen));
  check(s6.frames[2] === false, 'лёд со столбца 2 снят');
  check(s6.freezeUsed === true, 'разморозка тоже потратила ход');
  check(s6.news === 'КРУТИ РЫЧАГ · ОСТАЛОСЬ 3', 'после разморозки подсказка про рычаг: ' + JSON.stringify(s6.news));

  // ---------- Пять прокруток без паттерна — смерть ----------
  await spin(BLANK_KEEP_FROZEN); // осталось 2
  const s7 = await state();
  check(s7.spinsLeft === 2, 'третья прокрутка: осталось 2');
  check(s7.news === 'ЗАМОРОЗЬ СТОЛБЕЦ · ОСТАЛОСЬ 2', 'подсказка со счётчиком 2: ' + JSON.stringify(s7.news));
  await spin(BLANK_KEEP_FROZEN); // осталось 1
  const s8 = await state();
  check(s8.spinsLeft === 1, 'четвёртая прокрутка: осталось 1');
  check(s8.news === 'ПОСЛЕДНЯЯ ПРОКРУТКА', 'на последней оставшейся прокрутке — «ПОСЛЕДНЯЯ ПРОКРУТКА»: ' + JSON.stringify(s8.news));
  await spin(BLANK_KEEP_FROZEN, 2200); // осталось 0 — провал и KABOOM
  const dead = await state();
  check(dead.spinsLeft === 0, 'пятая прокрутка: осталось 0');
  check(dead.isRescue === false, 'провал закрыл спасение (isRescue снят)');
  check(dead.gameOver === true, 'без паттерна — смерть: isGameOver');
  check(dead.news === null, 'после смерти подсказка со стекла снята');
  check(dead.redWash < 0.02, 'красная плёнка погасла после смерти (alpha ' + dead.redWash.toFixed(2) + ')');
  await moveAway();
  await shot('rescue-ru-1280-dead.png');

  // ---------- Провал спасения — сразу KABOOM: счёт раунда не меняется, магазин не открывается ----------
  // Решение автора 22.11.2026 (шаг 34): «если я проиграл — проиграл, ВСЁ». Ни прощения, ни отката счёта.
  await reload();
  await openRescue(3000, 50, 3);
  const beforeFail = await state();
  check(beforeFail.debt === 3000 && beforeFail.round === 3 && beforeFail.balance === 50, 'подготовка провала: долг 3000, раунд 3, баланс 50');
  for (let i = 0; i < 4; i++) await spin(BLANK_KEEP_FROZEN); // осталось 1
  check((await state()).spinsLeft === 1, 'провал: перед последней прокруткой остался 1');
  await spin(BLANK_KEEP_FROZEN, 50); // пятая — провал
  const failNow = await state();
  check(failNow.isRescue === false, 'провал закрыл спасение (isRescue снят)');
  check(failNow.gameOver === true, 'провал — смерть сразу (isGameOver)');
  // Попапа о прощении больше нет: называем его врозь, чтобы grep по мёртвой механике оставался пустым.
  const forgive = ['ВТОРОЕ', 'ДЫХАНИЕ'].join(' ');
  const popupSeen = await val(`(() => window.__g.children.list.some((o) => typeof o.text === 'string' && o.text === ${JSON.stringify(forgive)}))()`);
  check(popupSeen === false, 'попапа о прощении на экране нет');
  await sleep(1500); // старая пауза прощения (1,2 с) успела бы открыть магазин — здесь его быть не должно
  const failLater = await state();
  check(failLater.gameOver === true, 'через 1,5 с забег по-прежнему кончен');
  check(failLater.shop === false, 'магазин после провала не открылся');
  check(failLater.round === 3, 'счёт раунда не откатился: 3 → ' + failLater.round);
  check(failLater.debt === 3000, 'долг тот же: 3000 → ' + failLater.debt);
  check(failLater.balance === beforeFail.balance, 'баланс не изменился: ' + failLater.balance);
  check(failLater.tickets === beforeFail.tickets, 'билетов за провал не дали: ' + failLater.tickets);
  check(failLater.redWash < 0.02, 'красная плёнка погасла после смерти (alpha ' + failLater.redWash.toFixed(2) + ')');
  await moveAway();
  await shot('rescue-ru-1280-fail-kaboom.png');

  // ---------- Вторая нехватка фишек: сразу KABOOM, без GOOD LUCK и без раунда спасения ----------
  await reload();
  const lockedRaw = await val(`(() => {
    const g = window.__g;
    g.rescueUsedThisRun = true; // яма уже была: второй раз не прощают (флаг липкий)
    g.debt = 1000; g.balance = 0; g.round = 3; g.isRoundOver = true; g.spinsLeft = 0;
    g.callCollector(false);
    // KABOOM рисует Collector.warnGoodLuck заголовком на экране автомата, а GOOD LUCK — банкомат: ищем тексты.
    const texts = g.children.list.filter((o) => typeof o.text === 'string').map((o) => o.text);
    return JSON.stringify({ gameOver: g.isGameOver, rescuing: g.isRescue, texts });
  })()`);
  const lockedState = JSON.parse(lockedRaw ?? '{}');
  const lockedTexts = Array.isArray(lockedState.texts) ? lockedState.texts : [];
  check(lockedState.gameOver === true, 'вторая нехватка фишек: сразу KABOOM (isGameOver)');
  check(lockedState.rescuing === false, 'вторая нехватка: раунд спасения не начался');
  check(lockedTexts.includes('KABOOM') && !lockedTexts.includes('GOOD LUCK'), 'на экране автомата KABOOM, а не GOOD LUCK: ' + JSON.stringify(lockedTexts.join('|')));
  await sleep(600); // GOOD LUCK шёл бы 1,6 с и потом спасение — успело бы начаться
  const lockedAfter = await state();
  check(lockedAfter.isRescue === false && lockedAfter.spinsLeft === 0, 'через 0,6 с спасение так и не началось (прокруток нет)');
  await moveAway();
  await shot('rescue-ru-1280-locked.png');

  // ---------- Паттерн — выжил: сообщение, красное гаснет, магазин после затухания ----------
  await reload();
  await openRescue(7000, 100, 4);
  // Сделка №12 в этом раунде: текущий долг −10% (7000 → 6300) и следующий +20% (debtNextMul 1,2). Спасение
  // не должно ни стереть «−10%» пересчётом (иначе вышло бы 8400), ни потратить «+20%» на повтор раунда.
  await val('window.__g.debt = 6300; window.__g.debtNextMul = 1.2; 1');
  const beforeWin = await state();
  check(beforeWin.debt === 6300 && beforeWin.round === 4, 'подготовка победы: долг 6300 (было 7000 и «−10%»), раунд 4');
  await val(`window.__g.spin(); ${WIN_ALL}`);
  for (let i = 0; i < 80; i++) {
    if (!(await val('window.__g.isSpinning'))) break;
    await sleep(100);
  }
  const winTime = Date.now();
  await sleep(100); // новость встала на стекло
  const winNow = await state();
  check(winNow.news === 'ПАТТЕРН СОБРАН', 'победа: на стекле «ПАТТЕРН СОБРАН»: ' + JSON.stringify(winNow.news));
  check(winNow.isRescue === true && winNow.shop === false, 'победа: магазин ещё не открыт — сначала гаснет красное');
  check(winNow.redWash > 0.1, 'победа: красное свечение пока горит (alpha ' + winNow.redWash.toFixed(2) + ')');
  let shopAt = null;
  for (let i = 0; i < 100; i++) {
    const s = await state();
    if (s.shop) {
      shopAt = s;
      break;
    }
    await sleep(60);
  }
  const shopDelay = Date.now() - winTime;
  check(shopAt !== null, 'после победы открыт магазин');
  const won = shopAt ?? (await state());
  check(won.redWash < 0.02, 'магазин встал только после затухания: плёнка уже погасла (alpha ' + won.redWash.toFixed(2) + ')');
  check(shopDelay >= 1400, 'магазин ждал паузу победы и затухание: ' + shopDelay + ' мс');
  check(won.isRescue === false, 'паттерн закрыл спасение');
  check(won.news === 'ПАТТЕРН СОБРАН', 'сообщение победы пережило затухание и осталось на стекле: ' + JSON.stringify(won.news));
  check(won.round === 4, 'счёт раунда на месте: 4 → ' + won.round);
  check(won.debt === 6300, 'долг после выживания тот же: 6300, а не 8400 (стало ' + won.debt + ')');
  check(won.debtNextMul === 1.2, '«следующий долг +20%» не потрачен повтором: debtNextMul 1,2 (стало ' + won.debtNextMul + ')');
  check(won.balance === beforeWin.balance, 'за выживание фишек не дали: баланс ' + won.balance);
  check(won.tickets === beforeWin.tickets, 'за выживание билетов не дали: билетов ' + won.tickets);
  check(won.lampColor !== 0xef4444, 'огни автомата вернулись к обычному цвету (' + won.lampColor + ')');
  check(Math.abs(won.itemAlpha - 1) < 0.02, 'предметы снова видны (alpha ' + won.itemAlpha.toFixed(2) + ')');
  await moveAway();
  await shot('rescue-ru-1280-win.png');

  // ---------- 390×844 ----------
  await reload();
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const ru390Intro = await openRescue(1000, 0, 1);
  await spin(BLANK_KEEP_FROZEN);
  const s390 = await state();
  check(JSON.stringify(ru390Intro) === JSON.stringify(RU_ALERTS), '390×844: заставка теми же тремя строками');
  check(s390.news === 'ЗАМОРОЗЬ СТОЛБЕЦ · ОСТАЛОСЬ 4', '390×844: подсказка со счётчиком: ' + JSON.stringify(s390.news));
  check(newsInsideGlass(s390), '390×844: подсказка внутри стекла');
  await moveAway();
  await shot('rescue-ru-390x844.png');

  // ---------- Английский, 1280×720 ----------
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await val(`localStorage.setItem('dolgovaya-yama-lang', 'en')`);
  await send('Page.reload');
  await sleep(4000);
  check((await val('typeof window.__g')) === 'object', 'EN: сцена снова в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(700);
  const enIntro = await openRescue(1000, 0, 1);
  check(JSON.stringify(enIntro) === JSON.stringify(EN_ALERTS), 'EN: заставка тремя сообщениями по порядку: ' + JSON.stringify(enIntro));
  await spin(BLANK_KEEP_FROZEN);
  const en = await state();
  check(en.news === 'FREEZE A COLUMN · 4 LEFT', 'EN: подсказка со счётчиком: ' + JSON.stringify(en.news));
  check(newsInsideGlass(en), 'EN 1280×720: подсказка внутри стекла');
  await clickColumn(1);
  const enFrozen = await state();
  check(enFrozen.news === 'PULL THE LEVER · 4 LEFT', 'EN: после заморозки «PULL THE LEVER · 4 LEFT»: ' + JSON.stringify(enFrozen.news));
  check(newsInsideGlass(enFrozen), 'EN: смена подсказки тоже внутри стекла');
  await moveAway();
  await shot('rescue-en-1280.png');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const en390 = await state();
  check(newsInsideGlass(en390), 'EN 390×844: подсказка внутри стекла');
  await moveAway();
  await shot('rescue-en-390x844.png');

  // ---------- Очередь сообщений на стекле (механизм шага 32) ----------
  await reload();
  await val(`(() => {
    const g = window.__g;
    window.__qdone = false;
    g.screen.announceSequence([{ text: 'ПЕРВОЕ' }, { text: 'ВТОРОЕ' }], () => { window.__qdone = true; });
    return 1;
  })()`);
  await sleep(200);
  const q1 = await state();
  check(q1.news === 'ПЕРВОЕ', 'очередь: первое сообщение на стекле: ' + JSON.stringify(q1.news));
  await sleep(3200);
  const q2 = await state();
  check(q2.news === 'ВТОРОЕ', 'очередь: второе сообщение встало после первого: ' + JSON.stringify(q2.news));
  await sleep(3200);
  const q3 = await state();
  const qDone = await val('window.__qdone');
  check(q3.news === null && qDone === true, 'очередь: после последнего сообщения зовётся колбэк');
  // Одиночная новость (ачивки, сделки, новости раунда) снимает очередь и показывается сразу, как раньше.
  await val(`(() => {
    const g = window.__g;
    window.__qdone = false;
    g.screen.announceSequence([{ text: 'ПЕРВОЕ' }, { text: 'ВТОРОЕ' }], () => { window.__qdone = true; });
    return 1;
  })()`);
  await sleep(200);
  await val(`window.__g.screen.announceNews('НОВОСТЬ'); 1`);
  await sleep(200);
  const q4 = await state();
  check(q4.news === 'НОВОСТЬ', 'одиночная новость сняла очередь и показалась сразу: ' + JSON.stringify(q4.news));
  await sleep(3200);
  const q5 = await state();
  const qDoneAfter = await val('window.__qdone');
  check(q5.news === null && qDoneAfter === false, 'после одиночной новости очередь не продолжилась и её колбэк не позван');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally {
  chrome.kill();
  srv.kill();
}

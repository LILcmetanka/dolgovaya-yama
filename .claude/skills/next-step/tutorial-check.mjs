/**
 * Браузерная проверка обучения текстами (шаг 46б: новый показ, новый сценарий интро, дорожка денег)
 * на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/tutorial-check.mjs <scratchpad>, где <scratchpad>/dist — сборка
 * с хуком window.__g (bash .claude/skills/next-step/hookbuild.sh <scratchpad> .).
 * Снимки — в <scratchpad>/shots-tutorial: первый текст, «Забери кон» (текст и подсветка кнопки), бит lever
 * на висящей строке, записка на «Забери кон», числа долга, полка на «Это ящики», красный текст, дорожка денег,
 * строки спасения, победы в спасении, смерти и действий, самопочинка после перезагрузки. Профиль Chrome — в scratchpad.
 * Порт http 8772 (так задано в брифе; его же берёт memory-check), отладка Chrome 9344 — 9333…9343 заняты
 * прочими сценариями (shot 9333, phone 9334, atm-who/tablet/win-reveal 9337, ticket 9338, memory 9339,
 * rescue/upgrades 9340, lever 9341, actions 9342, soak 9343).
 *
 * Правила Диллера берутся из игры, а не из копии в сценарии: биты интро — introSteps(startDebt()) из
 * src/game/tutorial.ts, строки — tutorialLineText (внутри t() из lang.ts; язык страницы выставляется в ru через
 * localStorage), сетки — tutorialGrid(kind), подсчёт выигрыша — evaluateGrid из patterns.ts, цвета — SCREEN_TONE_COLORS
 * из screenText.ts (сверяются с theme.ts). Текущая строка заставки читается так же, как в rescue-check:
 * collector.screenSequence, элементы с .text. У «богатой» строки кусков несколько: строкой считается их склейка.
 *
 * Что проверяет:
 *  1) чистый профиль: обучение не начато (флагов и шагов нет; счётчик забегов игра пишет сама), тьма первого
 *     забега активна, первым идёт «Что смотришь?» — жёлтый (#fbbf24) текст кегля 36, без мигания;
 *  2) пока идёт текст, game.spin() не уменьшает прокрутки и не начинает крутить;
 *  3) биты нового сценария (11 штук) в порядке introSteps: сетки, эффекты, «забрать», черепа, тьма, полка;
 *     бит ждёт действия с ВИСЯЩЕЙ последней строкой (альфа 1, без твинов), а после нажатия эта строка снята
 *     (у бита с паузой до следующего текста экран автомата пуст совсем);
 *  4) все строки интро показаны ровно в порядке introSteps и лишних нет;
 *  5) цвета: ДОЛГ и ВЕРНУТЬ красные (в строке с настоящим числом долга), «Черепа сожгут весь кон» красная целиком;
 *  6) конец раунда: Коллектор, долг, Enter; после оплаты — шесть строк денег (ФИШКИ белые, БИЛЕТЫ фиолетовые),
 *     и только потом магазин; повторный вызов дорожки молчит — она звучит один раз;
 *  7) первая смерть: спасение даёт 7 строк «Хахахаха…УДАЧИ»; победа в спасении — 3 строки и только потом магазин;
 *     KABOOM — 7 строк перед экраном улучшений, улучшения появляются; следующий забег после первой смерти —
 *     6 строк «Ах да, забыл сказать…», после них мастер-флаг стоит; ещё один забег — тишина;
 *  8) самопочинка после перезагрузки: прогресс с интро на битах NOTE_STEP−1 / NOTE_STEP / PLACES_STEP — записка
 *     закрыта до «Забери кон» и открыта на нём, полка спрятана до «Это ящики» и открыта на нём;
 *     снимки tut-reload-take-note.png и tut-reload-places-shelf.png;
 *  9) гнёзда у экрана — отдельная группа (effectsGroup): видны на всех битах интро, включая те, где полки на стене
 *     ещё нет (ItemShelf.setHidden прячет только полку); снимок tut-nests-no-shelf.png на бите goal;
 * 10) подсказок во время обучения нет вовсе (табличка действий, доля черепов, предмет на полке), а после обучения
 *     подсказка у предмета снова работает; у действий и доли черепов её нет никогда — там подсказку сняли совсем.
 *
 * Порядок событий (строки заставки и открытие магазина) пишется в общий журнал events: по нему видно, что
 * магазин открылся ПОСЛЕ последней строки денег, а не до неё (опрос раз в 120 мс этого не гарантирует).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у сценариев выше: Node находит './rules' без расширения

const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node tutorial-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = SP + '/shots-tutorial';
mkdirSync(SHOTS, { recursive: true });

// Эталоны — из игры.
const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const TUT = await import(SRC + 'tutorial.ts');
const LANG = await import(SRC + 'lang.ts');
const RULES = await import(SRC + 'rules.ts');
const PATTERNS = await import(SRC + 'patterns.ts');
const DEALER = await import(SRC + 'dealerGame.ts');
const SCREEN_TEXT = await import(SRC + 'screenText.ts');
// theme.ts тянет Phaser (в Node его нет), поэтому цвета читаем из исходника: тона заставки обучения обязаны
// совпадать с цветами надписей игры. RED_TEXT — единственный источник «красного» у заставки.
const THEME_SRC = readFileSync(SRC + 'theme.ts', 'utf8');
const themeColor = (name) => {
  const match = THEME_SRC.match(new RegExp(`export const ${name} = '([^']+)'`));
  return match ? match[1].toLowerCase() : '';
};

/** Биты интро как их читает игра: долг — первый, startDebt(). */
const STEPS = TUT.introSteps(RULES.startDebt());
/** Строка с заставки одним текстом: куски склеены, авторские '\n' и пробелы сведены к одному пробелу. */
const norm = (text) => String(text).replace(/\s+/g, ' ').trim();
const flatOf = (line) => norm(TUT.tutorialLineText(line));
/** Строки каждого бита (пусто у последнего молчащего бита), все строки интро лентой и дорожка денег. */
const STEP_LINES = STEPS.map((step) => step.lines.map(flatOf));
const ALL_LINES = STEP_LINES.flat();
const MONEY_FLAT = TUT.MONEY_LINES.map(flatOf);
/** Номера особых битов — из самих битов, а не из чисел: openNote (записка), clearDark (тьма), places (полка). */
const NOTE_STEP = STEPS.findIndex((step) => step.openNote);
const DARK_STEP = STEPS.findIndex((step) => step.clearDark);
const PLACES_STEP = STEPS.findIndex((step) => step.id === 'places');
/** Дорожки вне интро. */
const DEATH_LINES = TUT.DEATH_LINES.map((key) => LANG.t(key));
const WIN_LINES = TUT.RESCUE_WIN_LINES.map((key) => LANG.t(key));
const DEATH_SCREEN = TUT.DEATH_SCREEN_LINES.map((key) => LANG.t(key));
const ACTIONS_LINES = TUT.ACTIONS_LINES.map((key) => LANG.t(key));
/** Событие «магазин открылся» в журнале events: по нему видно, что он идёт после строк денег. */
const SHOP_EVENT = '#shop';
/** id клеток учебной сетки: с ними сравниваем то, что реально стоит на экране. */
const gridIds = (kind) => TUT.tutorialGrid(kind).map((row) => row.map((symbol) => symbol.id));
const byId = new Map(RULES.SYMBOLS.map((symbol) => [symbol.id, symbol]));
/** Сетка из id клеток (снятых с экрана) в символы игры; null — если на экране чужой id. */
const asGrid = (cells) => {
  if (!cells || cells.length !== RULES.GRID_ROWS) return null;
  const grid = cells.map((row) => (row.length === RULES.GRID_COLUMNS ? row.map((id) => byId.get(id) ?? null) : null));
  return grid.every((row) => Array.isArray(row) && row.every((symbol) => symbol)) ? grid : null;
};
/** Итог сетки правилами игры: win === 0 и kind === 'nothing' у пустой, паттерн — у вишен, черепа — у черепов. */
const evaluate = (cells) => {
  const grid = asGrid(cells);
  return grid ? PATTERNS.evaluateGrid(grid) : null;
};
const sameGrid = (cells, kind) => JSON.stringify(cells) === JSON.stringify(gridIds(kind));
/** Следующий долг, который встанет на записку в магазине (та же дверь, что у ShopScene.applyShopDebt). */
const NEXT_DEBT = DEALER.shopDebt(RULES.startDebt(), 2, 1, false, 1).debt; // = debtForRound(2)

const PROFILE = SP + '/prof-tutorial-' + Date.now(); // свежий профиль: вчерашнее сохранение тьму бы погасило
const srv = spawn('python3', ['-m', 'http.server', '8772', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9344', '--window-size=1280,720', '--user-data-dir=' + PROFILE, '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let tabs;
  for (let i = 0; i < 40; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:9344/json')).json(); if (tabs.length) break; } catch {}
    await sleep(300);
  }
  const page = tabs && tabs.find((tab) => tab.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9344 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (event) => { const m = JSON.parse(event.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Runtime.evaluate: значение выражения или undefined, если страница бросила исключение. */
  const val = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error || r.result.exceptionDetails) return undefined;
    return r.result.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(SHOTS + '/' + name, Buffer.from(r.result.data, 'base64'));
  };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };
  const block = (title) => console.log('\n-- ' + title + ' --');

  /**
   * Состояние сцены и текущая строка заставки. Строка — склейка всех кусков (у «богатой» строки их несколько),
   * куски отдаются отдельно с цветом, кеглем, альфой и числом твинов — по ним проверяются цвета и «не мигает».
   */
  const st = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    if (!g) return JSON.stringify({ hook: false });
    const seq = g.collector && g.collector.screenSequence ? g.collector.screenSequence : [];
    const texts = seq.filter((part) => typeof part.text === 'string').map((part) => {
      const tweens = g.tweens.getTweensOf(part);
      return {
        text: part.text,
        color: part.style ? part.style.color : null,
        size: part.style ? part.style.fontSize : null,
        alpha: Math.round(part.alpha * 100) / 100,
        tweens: tweens.length,
        loops: tweens.filter((tween) => tween.repeat === -1).length,
      };
    });
    const line = texts.length > 0 ? texts.map((part) => part.text).join(' ').replace(/\\s+/g, ' ').trim() : null;
    const cells = g.screen && g.screen.cells
      ? g.screen.cells.map((row) => row.map((cell) => String(cell.texture.key).replace('symbol-', '')))
      : null;
    const pay = g.payout;
    return JSON.stringify({
      hook: true, intro: g.introStep, steps: g.intro ? g.intro.length : -1, phase: g.tutorialPhase,
      busy: g.busy, armed: g.armed ?? null,
      line, texts, seqParts: seq.length,
      spinsLeft: g.spinsLeft, pot: g.pot, balance: g.balance, debt: g.debt, round: g.round, closed: g.closedDebts(),
      tickets: g.tickets, board: g.panel ? g.panel.boardText.text : null,
      spinning: g.isSpinning, shop: g.isShopOpen, shopping: g.isShopping, over: g.isRoundOver,
      awaitPay: g.isAwaitingPayment, rescue: g.isRescue, rescueIntro: g.isRescueIntro,
      hasReveal: g.reveal !== null, reveal: g.reveal ? g.reveal.isActive : null, note: g.reveal ? g.reveal.isNoteOpen : null,
      shelfHidden: g.itemShelf && typeof g.itemShelf.isHidden === 'boolean' ? g.itemShelf.isHidden : null,
      shelfGroup: g.itemShelf && g.itemShelf.group ? g.itemShelf.group.visible : null,
      effectGroup: g.itemShelf && g.itemShelf.effectSlots ? g.itemShelf.effectSlots.visible : null,
      effectSpots: g.itemShelf && Array.isArray(g.itemShelf.effectSpots) ? g.itemShelf.effectSpots.filter((part) => part.visible).length : -1,
      upgrade: g.upgradeScreen ? g.upgradeScreen.isOpen : null,
      hl: pay && pay.highlightTweens ? pay.highlightTweens.length : -1,
      glow: pay && pay.buttonGlow ? Math.round(pay.buttonGlow.alpha * 100) / 100 : -1,
      dome: pay && pay.buttonDome ? Math.round(pay.buttonDome.scale * 100) / 100 : -1,
      cells,
      runs: g.runsPlayed,
      progress: localStorage.getItem('dolgovaya-yama-progress'),
    });
  })()`)) ?? { hook: false });

  // Журнал событий: каждая новая строка заставки и открытие магазина — по порядку.
  let lastLine = null;
  const seen = [];
  const events = [];
  const pieces = new Map(); // строка → куски с цветами (первое появление: так видно, каким её нарисовали)
  let shopSeen = false;
  const sample = async () => {
    const s = await st();
    if (s.line && s.line !== lastLine) {
      seen.push(s.line);
      events.push(s.line);
      if (!pieces.has(s.line)) pieces.set(s.line, s.texts);
    }
    lastLine = s.line;
    if (s.shop && !shopSeen) {
      shopSeen = true;
      events.push(SHOP_EVENT);
    }
    return s;
  };
  /** Куски строки нужного цвета: строка → её кусок с точно таким текстом. */
  const pieceOf = (line, text) => (pieces.get(line) || []).find((piece) => piece.text.trim() === text) || null;
  /** Ждём условие с таймаутом; null — не дождались (и это видно в выводе, а не молча). */
  const waitUntil = async (pred, limit, label) => {
    const t0 = Date.now();
    let s = await sample();
    while (Date.now() - t0 < limit) {
      if (pred(s)) return s;
      await sleep(120);
      s = await sample();
    }
    console.log(`     ТАЙМАУТ ${label}; последнее состояние: ${JSON.stringify({ intro: s.intro, line: s.line, busy: s.busy, armed: s.armed, phase: s.phase, spins: s.spinsLeft, shop: s.shop, over: s.over, rescue: s.rescue, upgrade: s.upgrade })}`);
    return null;
  };
  /** Бит интро готов к действию: идёт он, текст кончился, сетка ждёт — ровно та, что задумана битом. */
  const readyPred = (index) => {
    const step = STEPS[index];
    const phase = step.wait === 'take' ? 'waitTake' : 'waitSpin';
    const armed = step.spin ?? null;
    return (s) => s.intro === index && !s.busy && !s.spinning && s.phase === phase && (s.armed ?? null) === armed;
  };
  const readyLabel = (index) => `бит ${STEPS[index].id}: ждёт ${STEPS[index].wait}`;
  /** Дверца полки (видимая) и походит ли по ней ввод: тот же InputManager.inputCandidate, что решает клики в игре. */
  const shelfDoor = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    const door = g.itemShelf.doors.find((part) => part.visible);
    const manager = g.input.manager;
    return JSON.stringify({ found: Boolean(door), candidate: door && manager ? manager.inputCandidate(door, g.cameras.main) : null });
  })()`)) ?? '{"found":false,"candidate":null}');
  /** Следующая строка на экране автомата: у битов с паузой она приходит не сразу, поэтому ждём, а не смотрим один раз. */
  const nextText = async (expected, limit = 14000) => (await waitUntil((s) => s.line === expected, limit, `текст «${expected}»`)) !== null;
  /**
   * Навести мышь на объект сцены по выражению его getBounds() и вернуть, что стало с табличкой подсказки.
   * Точка — та же формула «раскладка → страница», что у кликов в других сценариях: холст 1920, камера zoom.
   */
  const hoverTarget = async (expr, wait = 260) => {
    const point = JSON.parse(await val(`(() => {
      const g = window.__g, cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect(), k = r.width / 1920;
      const b = (${expr}).getBounds();
      return JSON.stringify({ x: r.left + (b.centerX - cam.scrollX) * cam.zoom * k, y: r.top + (b.centerY - cam.scrollY) * cam.zoom * k });
    })()`));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    await sleep(wait);
    return JSON.parse((await val(`JSON.stringify({ visible: window.__g.tooltip.container.visible, title: window.__g.tooltip.title.text })`)) ?? '{}');
  };
  /** Увести мышь в пустой угол и погасить табличку: иначе прошлая подсказка переживёт следующий замер. */
  const moveAway = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 });
    await val('window.__g.tooltip.hide(); 1');
    await sleep(200);
  };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  // Язык ставим до загрузки приложения, а не перезагрузкой: так профиль остаётся первым забегом (счётчик runs = 1).
  // Headless Chrome англоязычный, а строки Диллера проверяем русские.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('dolgovaya-yama-lang','ru');}catch(e){}" });
  await send('Page.navigate', { url: 'http://127.0.0.1:8772/' });
  // Опрос начинаем сразу, а не через 3 с: строки теперь короткие (1 с), и первая может уйти раньше, чем проснёмся.
  await sleep(300);

  // ---------- 1. Чистый профиль: тьма и первый текст ----------
  block('1. чистый профиль: тьма и «Что смотришь?» — жёлтый текст без мигания');
  check((await waitUntil((s) => s.hook === true, 20000, 'hook window.__g')) !== null, 'hook: сцена в window.__g');
  // Тона заставки обучения — те же цвета, что у надписей игры (theme.ts): жёлтый LED, красный, фиолетовый.
  check(SCREEN_TEXT.SCREEN_TONE_COLORS.normal === themeColor('LED_COLOR'), `жёлтый тона = LED_COLOR из theme.ts (${themeColor('LED_COLOR')})`);
  check(SCREEN_TEXT.SCREEN_TONE_COLORS.red === themeColor('RED_TEXT'), `красный тона = RED_TEXT из theme.ts (${themeColor('RED_TEXT')})`);
  check(SCREEN_TEXT.SCREEN_TONE_COLORS.purple === themeColor('PURPLE_TEXT'), `фиолетовый тона = PURPLE_TEXT из theme.ts (${themeColor('PURPLE_TEXT')})`);
  const first = await waitUntil((s) => s.line === ALL_LINES[0], 25000, 'первый текст интро');
  check(first !== null, `первым идёт «${ALL_LINES[0]}» (текст прочитан с заставки collector.screenSequence)`);
  if (first) {
    // beginRun сразу пишет прогресс (счётчик забегов), поэтому «пусто» — это прогресс, где ни один шаг обучения
    // не сдвинут. После первого beginRun mergeTutorial заполняет все ключи нулями, и проверка на число
    // ключей была бы хрупкой — важно только «ни один шаг не ≥ 1».
    const clean = first.progress ? JSON.parse(first.progress) : null;
    const cleanSteps = clean !== null && clean.tutorial ? Object.values(clean.tutorial).every((step) => !(step >= 1)) : false;
    check(clean !== null && clean.tutorialDone === false && clean.darknessDone === false && cleanSteps && clean.runs === 1,
      'профиль чистый: свежий user-data-dir, в прогрессе только счётчик забегов, ни один шаг не ≥ 1, tutorialDone/darknessDone не стоят — ' + first.progress);
    check(first.hasReveal && first.reveal === true, `тьма первого забега есть и активна (reveal !== null, isActive ${first.reveal})`);
    check(first.note === false, `записка с долгом закрыта: она проступает только на бите ${NOTE_STEP} «${STEPS[NOTE_STEP].id}»`);
    check(first.shelfHidden === true && first.shelfGroup === false, `полки предметов на стене ещё нет: она откроется на бите ${PLACES_STEP} «${STEPS[PLACES_STEP].id}»`);
    check(first.seqParts === 2, `на экране автомата чёрный экран + надпись (${first.seqParts} части)`);
    const piece = (first.texts || []).find((part) => part.text.trim().length > 0) || null;
    check(piece !== null && (piece.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.normal,
      `текст жёлтый: ${piece && piece.color} = SCREEN_TONE_COLORS.normal (${SCREEN_TEXT.SCREEN_TONE_COLORS.normal})`);
    check(piece !== null && piece.size === `${SCREEN_TEXT.TUTORIAL_SCREEN_FONT}px`, `кегль ${SCREEN_TEXT.TUTORIAL_SCREEN_FONT}: style.fontSize «${piece && piece.size}»`);
    check(piece !== null && piece.alpha === 1 && piece.tweens === 0, `строка горит ровно: alpha ${piece && piece.alpha}, твинов ${piece && piece.tweens}`);
    check(first.intro === 0 && first.steps === STEPS.length, `идёт первый бит из ${STEPS.length} (introStep ${first.intro})`);
  }

  // ---------- 2. Пока идёт текст, рычаг не крутит ----------
  // Проверка идёт в самой странице одним вызовом: прочитать состояние, дёрнуть рычаг, прочитать снова — без шанса,
  // что строка за это время сменится. Пока текст горит (busy), рычаг обязан молчать.
  block('2. блокировка ввода на время текста');
  const atomicSpin = `(() => {
    const g = window.__g;
    const cellsOf = () => (g.screen && g.screen.cells ? g.screen.cells.map((row) => row.map((cell) => String(cell.texture.key))) : null);
    const seq = g.collector && g.collector.screenSequence ? g.collector.screenSequence : [];
    const texts = seq.filter((part) => typeof part.text === 'string');
    const line = texts.length > 0 ? texts.map((part) => part.text).join(' ').replace(/\\s+/g, ' ').trim() : null;
    const before = { busy: g.busy, spins: g.spinsLeft, spinning: g.isSpinning, cells: cellsOf() };
    if (before.busy) g.spin(); // рычаг дёргаем только пока горит текст — иначе это была бы настоящая прокрутка
    return JSON.stringify({
      busy: before.busy, line, spinsBefore: before.spins, spinsAfter: g.spinsLeft,
      spinningBefore: before.spinning, spinningAfter: g.isSpinning,
      cellsBefore: before.cells, cellsAfter: cellsOf(),
    });
  })()`;
  let blocked = null;
  for (let k = 0; k < 40; k++) {
    const raw = await val(atomicSpin);
    const state = raw ? JSON.parse(raw) : null;
    if (state && state.busy) { blocked = state; break; }
    await sleep(100);
  }
  check(blocked !== null, 'нашли момент, когда текст обучения ещё горит (busy)');
  if (blocked) {
    await shot('tut-first-line.png'); // первый текст (строки первого бита) — крупный жёлтый
    check(blocked.spinsAfter === blocked.spinsBefore, `spin() во время текста не тратит прокрутку: spinsLeft ${blocked.spinsBefore} → ${blocked.spinsAfter}`);
    check(blocked.spinningBefore === false && blocked.spinningAfter === false, 'и прокрутка не началась (isSpinning false)');
    check(JSON.stringify(blocked.cellsAfter) === JSON.stringify(blocked.cellsBefore), 'сетка на экране не сдвинулась — текст держит ввод');
    await sleep(500);
    const after = await sample();
    check(after.spinsLeft === blocked.spinsBefore, `через полсекунды прокрутка так и не началась: spinsLeft ${after.spinsLeft}`);
  }

  // ---------- 1б. «Не мигает»: висящая строка первого бита ----------
  // Висящая строка стоит, пока бит ждёт рычага, и через 400 мс обязана быть той же яркости.
  // Старая заставка мигала твином alpha 0.3 — теперь такого нет.
  const hangLine = STEP_LINES[0][STEP_LINES[0].length - 1];
  const hang = first ? await waitUntil((s) => s.line === hangLine, 12000, `висящая строка «${hangLine}»`) : null;
  check(hang !== null, `первая строка бита сменяется второй — «${hangLine}»`);
  if (hang) {
    await sleep(450);
    const still = await sample();
    const piece = (still.texts || []).find((part) => part.text.trim().length > 0) || null;
    check(still.line === hangLine, `через 400 мс висит та же строка («${hangLine}»)`);
    check(piece !== null && piece.alpha === 1, `и она не мигает: alpha ${piece && piece.alpha} = 1`);
    check(piece !== null && piece.loops === 0 && piece.tweens === 0, `бесконечных твинов на тексте нет (твинов ${piece && piece.tweens}, цикличных ${piece && piece.loops})`);
  }

  // ---------- 1в. Смена языка на живой заставке ----------
  // toggleLanguage зовёт relabelTutorialTexts, и висящая строка встаёт на английском с того же места, а потом
  // возвращается. Английскую строку берём из lang.ts, переключив язык самого модуля (страницу не трогаем).
  const ruHang = norm(LANG.t('tutPullLever'));
  LANG.toggleLang();
  const enHang = norm(LANG.t('tutPullLever'));
  LANG.toggleLang();
  check(ruHang !== enHang && enHang.length > 0, `английский вариант строки есть в lang («${enHang}»)`);
  if (hang) {
    await val('window.__g.toggleLanguage(); 1');
    const en = await waitUntil((s) => s.line === enHang, 8000, `строка на английском «${enHang}»`);
    check(en !== null, 'смена языка пересобирает висящую строку на английском (collector.relabelTutorialSequence)');
    await val('window.__g.toggleLanguage(); 1');
    const back = await waitUntil((s) => s.line === ruHang, 8000, `строка снова по-русски «${ruHang}»`);
    check(back !== null, 'и возвращает русскую строку той же речью');
    // Строка смены языка повторяет ту же надпись: английскую из общего списка убираем, а повтор подряд схлопываем.
    // Всё остальное в списке по-прежнему строгое: лишняя строка интро всплывёт в блоке 4.
    for (let k = seen.length - 1; k >= 0; k--) if (seen[k] === enHang) seen.splice(k, 1);
    const dedup = [];
    for (const line of seen) if (dedup[dedup.length - 1] !== line) dedup.push(line);
    seen.length = 0;
    seen.push(...dedup);
  }

  // ---------- 1г. Гнёзда у экрана: видны всегда, полка — по биту places ----------
  // Полка и гнёзда — две разные группы (ItemShelf.setHidden прячет только полку): гнёзда у экрана остаются
  // на виду, даже когда полки на стене ещё нет.
  block('1г. гнёзда у экрана видны всегда; полка спрятана до бита places');
  check(first !== null && first.effectGroup === true && first.shelfGroup === false,
    `при спрятанной полке гнёзда у экрана на виду (effectsGroup.visible ${first && first.effectGroup}, shelfGroup.visible ${first && first.shelfGroup})`);
  check(first !== null && first.effectSpots === 4, `на экране видны четыре пустых гнезда (сейчас ${first && first.effectSpots})`);
  check(first !== null && first.shelfHidden === true, `а сама полка в это время спрятана (isHidden ${first && first.shelfHidden})`);

  // ---------- 3. Интро бит за битом ----------
  block('3. интро: биты по порядку, сетки, висящие строки и прокрутки');
  let introBroken = false;
  const payoutHighlight = { atTake: null }; // что видно у кнопки «забрать» в бите take
  // Сколько битов было готово к действию и на скольких из них гнёзда у экрана оставались на виду.
  let readyBits = 0, effectBits = 0, spotBits = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const lines = STEP_LINES[i];
    // Строки бита по порядку. Уже показанную строку (первый бит их видел в блоке 1) второй раз не ждём.
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k];
      if (seen.includes(line)) continue;
      const shown = await waitUntil((s) => s.line === line, 14000, `строка ${k + 1}/${lines.length} бита ${step.id} «${line}»`);
      if (!shown) { check(false, `строка ${k + 1}/${lines.length} бита ${step.id} «${line}» показана`); introBroken = true; break; }
      if (k === 0 && step.id === 'take') {
        // Записка с долгом проступает на входе в этот бит, вместе с текстом — тьма ещё стоит.
        check(shown.note === true, 'на «Забери кон» записка с долгом уже проступила (reveal.isNoteOpen)');
        check(shown.hasReveal === true, 'и тьма на этом бите ещё стоит (она гаснет только на «Это монитор»)');
        check(shown.shelfHidden === true && shown.shelfGroup === false, 'полки предметов на стене тут ещё нет');
        await shot('tut-take-note.png');
      }
      if (k === 0 && step.id === 'places') {
        // Первая строка «Это ящики»: полка на стене должна появиться вместе с ней.
        check(shown.shelfHidden === false && shown.shelfGroup === true, 'на «Это ящики» полка уже открыта (ItemShelf.setHidden(false))');
        await shot('tut-places-shelf.png');
      }
    }
    if (introBroken) break;
    // Снимки текстов — пока строка на экране: в готовом состоянии заставка уже погасла (или висит последняя).
    if (step.id === 'take') await shot('tut-take-text.png');
    if (step.id === 'burn') await shot('tut-red-text.png');
    if (step.id === 'debt') await shot('tut-debt-number.png');
    if (step.id === 'goal') await shot('tut-goal-lines.png');
    // Бит без нажатия («Это монитор»): игрок только читает, а бит сам передаёт эстафету следующему.
    if (step.wait === 'none') {
      const atText = await sample();
      if (step.id === 'tv') {
        check(atText.hasReveal === false && atText.reveal === null, 'на «Это монитор» тьма погасла совсем (game.reveal === null)');
        const progress = atText.progress ? JSON.parse(atText.progress) : null;
        check(progress !== null && progress.darknessDone === true, 'и в прогрессе стоит darknessDone — это и есть isDarknessDone() из progress.ts (пишется сразу, markDarknessDone)');
        check(sameGrid(atText.cells, 'empty'), 'на «Это мониторе» на экране пустая сетка обучения');
        check(atText.shelfHidden === true && atText.shelfGroup === false, 'полки предметов тут ещё нет: она откроется на places');
      }
      const moved = await waitUntil((s) => s.intro > i || s.shop || s.over, 20000, `бит ${step.id}: сам идёт дальше`);
      check(moved !== null, `бит ${step.id} (wait: none) сам переходит к следующему — прокрутки не нужно`);
      if (!moved) { introBroken = true; break; }
      check(atText.spinsLeft === moved.spinsLeft, `бит ${step.id} прошёл без прокрутки: spinsLeft ${atText.spinsLeft} → ${moved.spinsLeft}`);
      continue;
    }
    const ready = await waitUntil(readyPred(i), 16000, readyLabel(i));
    if (!ready) {
      check(false, `${readyLabel(i)} — бит готов к действию`);
      introBroken = true;
      break;
    }
    readyBits += 1;
    if (ready.effectGroup === true) effectBits += 1;
    if (ready.effectSpots === 4) spotBits += 1;
    // Бит ждёт действия с висящей последней строкой: она осталась на экране и горит ровно (её снимет игрок).
    const hanging = lines[lines.length - 1] ?? null;
    check(ready.line === hanging, hanging === null ? `бит ${step.id}: молчит и ждёт ${step.wait} на чистом экране` : `бит ${step.id}: ждёт ${step.wait} при висящей строке «${hanging}»`);
    if (hanging !== null) {
      const hangPiece = (ready.texts || []).find((part) => part.text.trim().length > 0) || null;
      check(hangPiece !== null && hangPiece.alpha === 1 && hangPiece.tweens === 0, `бит ${step.id}: висящая строка горит (alpha ${hangPiece && hangPiece.alpha}, твинов ${hangPiece && hangPiece.tweens})`);
    }
    // Полка предметов: до «Это ящики» её на стене нет совсем, с этого бита — есть.
    if (i < PLACES_STEP) {
      check(ready.shelfHidden === true && ready.shelfGroup === false, `бит ${step.id}: полки предметов ещё нет (до бита ${PLACES_STEP} «Это ящики»)`);
      const door = await shelfDoor();
      check(door.found && door.candidate === false, `бит ${step.id}: клик по спрятанной полке не проходит (inputCandidate ${door.candidate})`);
    } else {
      check(ready.shelfHidden === false && ready.shelfGroup === true, `бит ${step.id}: полка предметов открыта`);
      const door = await shelfDoor();
      check(door.found && door.candidate === true, `бит ${step.id}: по открытой полке кликать можно (inputCandidate ${door.candidate})`);
    }
    // Снимок «полки ещё нет, а гнёзда у экрана на виду» — на бите goal: тьма уже погасла, стена видна, places впереди.
    if (step.id === 'goal') await shot('tut-nests-no-shelf.png');
    // Подсказки во время обучения: их нет вовсе. Проверяем на бите places — обучение ещё активно (tutorialActive),
    // но текст уже не идёт (busy false), то есть подсказку держит не busy, а сама блокировка обучения.
    // Предмет кладём на открытую полку: у него подсказка есть, и промах блокировки был бы виден.
    if (step.id === 'places') {
      block('3в. во время обучения подсказок нет вообще');
      await moveAway();
      const boardHint = await hoverTarget('window.__g.actionBoard.box');
      check(boardHint.visible === false, `на табличке действий подсказки нет во время обучения (tooltip.visible ${boardHint.visible})`);
      const skullHint = await hoverTarget('window.__g.panel.skullShareText');
      check(skullHint.visible === false, `у значка доли черепов подсказки нет во время обучения (tooltip.visible ${skullHint.visible})`);
      const gave = await val("window.__g.devGiveItem('shield')");
      await sleep(700); // предмет долетает с планшета в клетку
      const itemHint = await hoverTarget('window.__g.itemShelf.items[0]');
      check(gave === true && itemHint.visible === false, `у предмета на полке подсказки во время обучения тоже нет (предмет выдан: ${gave}, tooltip.visible ${itemHint.visible})`);
      await moveAway();
    }
    if (step.id === 'lever') await shot('tut-lever-clean.png'); // «Крути дальше» ждёт рычага, строка висит
    // Чем запомнилось состояние перед действием — по нему ниже отдельные проверки блока.
    if (step.id === 'take') {
      // Пульс подсветки колеблется: несколько замеров и самый яркий/крупный, иначе один замер попадёт в низ волны.
      let glow = ready.glow;
      let dome = ready.dome;
      for (let k = 0; k < 5; k++) {
        const m = await sample();
        glow = Math.max(glow, m.glow);
        dome = Math.max(dome, m.dome);
        await sleep(120);
      }
      payoutHighlight.atTake = { hl: ready.hl, glow, dome, pot: ready.pot };
    }
    if (step.id === 'last') {
      check(ready.spinsLeft === 1, `перед последней прокруткой остаётся ровно одна (spinsLeft ${ready.spinsLeft})`);
    }
    if (step.id === 'burn') check(ready.hasReveal && ready.reveal === true, 'на красном тексте тьма ещё стоит (гаснет на следующем бите — монитор)');
    if (step.id === 'take') await shot('tut-take-highlight.png'); // «забери кон»: кнопка подсвечена
    // Обход бита «Забери кон» рычагом: пока бит ждёт «забрать», spin() не должен ни крутить, ни двигать обучение,
    // ни трогать кон — иначе бит проскакивал бы без нажатия (партия 5, замечание ревью).
    if (step.wait === 'take') {
      const beforeSpin = await sample();
      await val('window.__g.spin(); 1');
      await sleep(700);
      const afterSpin = await sample();
      check(afterSpin.spinsLeft === beforeSpin.spinsLeft, `бит ${step.id}: spin() не тратит прокрутку (spinsLeft ${beforeSpin.spinsLeft} → ${afterSpin.spinsLeft})`);
      check(afterSpin.intro === beforeSpin.intro, `бит ${step.id}: spin() не двигает интро (introStep ${beforeSpin.intro} → ${afterSpin.intro})`);
      check(afterSpin.pot === beforeSpin.pot, `бит ${step.id}: кон на месте (pot ${beforeSpin.pot} → ${afterSpin.pot})`);
      check(afterSpin.spinning === false, `бит ${step.id}: прокрутка не началась (isSpinning ${afterSpin.spinning})`);
    }
    // Действие бита: «забрать» или прокрутка — так, как это делает игрок.
    if (step.wait === 'take') {
      await val('window.__g.take(); 1');
    } else {
      await val('window.__g.spin(); 1');
    }
    // Висящая строка снимается действием: сразу после нажатия её на экране уже нет.
    const afterAction = await st();
    if (hanging === null) {
      check(afterAction.line === null, `бит ${step.id}: бит молчит, и после нажатия экран пуст («${afterAction.line}»)`);
    } else {
      check(afterAction.line !== hanging, `бит ${step.id}: после нажатия висящей строки на экране нет («${afterAction.line}»)`);
    }
    // У бита again следующий бит (take) начинается с паузы — значит экран автомата пуст целиком.
    if (step.id === 'again') check(afterAction.seqParts === 0, `после прокрутки «Попробуй ещё раз» экран автомата пуст (${afterAction.seqParts} части)`);
    const advanced = await waitUntil((s) => s.intro > i || s.shop || s.over || s.awaitPay || s.upgrade, 25000, `бит ${step.id}: переход дальше`);
    if (!advanced) { check(false, `бит ${step.id}: интро сдвинулось дальше`); introBroken = true; break; }
    // ---------- Проверки по битам ----------
    if (step.id === 'pull') {
      const ev = evaluate(advanced.cells);
      check(sameGrid(advanced.cells, 'empty'), 'прокрутка бита pull кладёт ровно учебную пустую сетку (tutorialGrid("empty"))');
      check(ev !== null && ev.kind === 'nothing' && ev.win === 0, `по этой сетке выигрыш 0 и паттернов нет (kind ${ev && ev.kind}, win ${ev && ev.win})`);
      const forbidden = ['skull', 'dice', 'ticket', 'lock'];
      const found = (advanced.cells || []).flat().filter((cell) => forbidden.includes(cell));
      check(found.length === 0, `в сетке нет черепа, кубика, билета и замка (найдено: ${found.join(', ') || 'ничего'})`);
      check(advanced.pot === ready.pot, `кон не вырос: ${ready.pot} → ${advanced.pot}`);
      check(advanced.spinsLeft === ready.spinsLeft - 1, `прокрутка потратила ровно одну: spinsLeft ${ready.spinsLeft} → ${advanced.spinsLeft}`);
      check(advanced.note === false, 'на первом бите записки с долгом ещё нет');
    }
    if (step.id === 'again') {
      const ev = evaluate(advanced.cells);
      check(sameGrid(advanced.cells, 'pattern'), 'прокрутка бита again кладёт учебный паттерн (tutorialGrid("pattern"))');
      check(ev !== null && ev.kind === 'win' && ev.win > 0, `выигрыш больше нуля: win ${ev && ev.win}`);
      check(advanced.pot > ready.pot, `кон вырос: ${ready.pot} → ${advanced.pot}`);
    }
    if (step.id === 'take') {
      const hl = payoutHighlight.atTake;
      check(hl.hl === 2, `кнопка «забрать» подсвечена: два пульса (свечение и купол), hl ${hl.hl}`);
      check(hl.glow > 0.25 && hl.dome > 1, `подсветка видна: свечение ${hl.glow} > 0.25, купол ${hl.dome} > 1`);
      check(ready.pot > 0, `на кону было что забрать: ${ready.pot}`);
      check(advanced.balance === ready.balance + ready.pot, `кон ушёл на табло: balance ${ready.balance} → ${advanced.balance} (кон ${ready.pot})`);
      check(advanced.pot === 0, `кон обнулён после «забрать»: pot ${advanced.pot}`);
      check(advanced.board === String(advanced.balance), `табло показывает то же число: boardText «${advanced.board}» = balance ${advanced.balance}`);
      check(advanced.hl === 0, `подсветка снята после «забрать»: hl ${advanced.hl}`);
      check(await nextText(LANG.t('tutSpinFurther')), `дальше идёт «${LANG.t('tutSpinFurther')}»`);
      check(advanced.note === true, 'на «забрать» записка с долгом уже открыта (openNote ровно у этого бита)');
    }
    if (step.id === 'lever') {
      const ev = evaluate(advanced.cells);
      check(sameGrid(advanced.cells, 'pattern') && ev !== null && ev.win > 0, `«Крути дальше» → снова паттерн, win ${ev && ev.win}`);
      check(advanced.pot > ready.pot, `кон вырос: ${ready.pot} → ${advanced.pot}`);
      check(advanced.note === true, 'записка с долгом висит открытой с бита take');
    }
    if (step.id === 'debt') {
      // Сценарий автора: после «Ты обязан его ВЕРНУТЬ» прокрутка кладёт черепа.
      const ev = evaluate(advanced.cells);
      const skulls = (advanced.cells || []).flat().filter((cell) => cell === 'skull').length;
      check(skulls >= 3, `прокрутка после «Ты обязан его ВЕРНУТЬ» кладёт черепа (черепов ${skulls})`);
      check(sameGrid(advanced.cells, 'skull'), 'и это ровно учебная сетка с черепами (tutorialGrid("skull"))');
      check(ev !== null && ev.kind === 'skull', `итог сетки — сгорание кона (kind ${ev && ev.kind})`);
      check(advanced.pot === 0, `черепа сожгли кон: pot ${ready.pot} → ${advanced.pot}`);
      check(await nextText(LANG.t('tutSkullsBurnAll')), `следом красный текст «${LANG.t('tutSkullsBurnAll')}»`);
      const burn = ALL_LINES.find((line) => line === norm(LANG.t('tutSkullsBurnAll')));
      const burnPiece = (pieces.get(burn) || []).find((piece) => piece.text.trim().length > 0) || null;
      check(burnPiece !== null && (burnPiece.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.red, `он правда красный: ${burnPiece && burnPiece.color} = SCREEN_TONE_COLORS.red`);
    }
    if (step.id === 'places') {
      const last = await waitUntil(readyPred(STEPS.length - 1), 20000, readyLabel(STEPS.length - 1));
      check(last !== null, 'последний бит (он молчит) готов: ждёт последней прокрутки');
    }
    if (step.id === 'last') {
      const ev = evaluate(advanced.cells);
      check(sameGrid(advanced.cells, 'debt'), 'последняя прокрутка кладёт учебную сетку-долг (tutorialGrid("debt"))');
      check(ev !== null && ev.kind === 'win' && ev.win >= RULES.startDebt(), `эта сетка покрывает первый долг: win ${ev && ev.win} ≥ ${RULES.startDebt()}`);
      check(advanced.spinsLeft === 0, `прокруток после неё не остаётся: spinsLeft ${advanced.spinsLeft}`);
      check(advanced.over === true, 'раунд кончился штатно (isRoundOver)');
      check(advanced.balance >= RULES.startDebt(), `кон забрался сам и долг закрывается с запасом: balance ${advanced.balance}`);
    }
  }

  // ---------- 3б. Гнёзда у экрана на всех битах; полка — по биту places ----------
  block('3б. гнёзда у экрана видны на всех битах интро, полка — только с «Это ящики»');
  // Бит с wait 'none' («Это монитор») игрока ни о чём не просит и проходит сам — до ready он не доходит.
  const actionSteps = STEPS.filter((step) => step.wait !== 'none').length;
  check(!introBroken && readyBits === actionSteps, `дошли до действия на каждом бите интро (${readyBits}/${actionSteps})`);
  check(readyBits === actionSteps && effectBits === readyBits,
    `на всех ${readyBits} битах с действием гнёзда у экрана на виду (effectsGroup.visible true: ${effectBits}/${readyBits}) — и до бита places, и после`);
  check(readyBits === actionSteps && spotBits === readyBits,
    `и четыре пустых гнезда видны на каждом таком бите (${spotBits}/${readyBits})`);
  // Полка: до places её группа скрыта, с places — показана (это же сверялось на каждом бите в блоке 3).
  check(!introBroken, 'полка спрятана до бита places и открывается на нём — отдельные сверки на каждом бите выше');

  // ---------- 3г. После обучения: подсказки у предметов снова работают, у действий и доли черепов — нет ----------
  // Блок 3в шёл при активном обучении, и подсказку мог держать как busy, так и сам tutorialActive. Здесь обучение
  // кончилось — и та же мышь на том же предмете обязана показать табличку, а на действиях и доле черепов её нет
  // никогда: у них подсказку сняли совсем, а не на время.
  block('3г. после обучения: подсказка у предмета есть, у действий и доли черепов — нет никогда');
  await moveAway();
  const itemAfter = await hoverTarget('window.__g.itemShelf.items[0]');
  check(itemAfter.visible === true && itemAfter.title.length > 0, `после обучения подсказка у предмета снова работает: «${itemAfter.title}»`);
  const boardAfter = await hoverTarget('window.__g.actionBoard.box');
  check(boardAfter.visible === false, `у таблички действий подсказки нет и после обучения (tooltip.visible ${boardAfter.visible})`);
  const skullAfter = await hoverTarget('window.__g.panel.skullShareText');
  check(skullAfter.visible === false, `у значка доли черепов подсказки нет и после обучения (tooltip.visible ${skullAfter.visible})`);
  await moveAway();

  // ---------- 4. Все строки интро: порядок и отсутствие лишних; числа долга ----------
  block('4. все строки интро — по порядку, без лишних, числа долга красным');
  check(!introBroken, 'интро дошло до последнего бита');
  const expectedSeen = JSON.stringify(ALL_LINES);
  const actualSeen = JSON.stringify(seen.filter((line) => ALL_LINES.includes(line)));
  check(expectedSeen === actualSeen, `строки интро совпали с introSteps: показано ${seen.length}, ожидалось ${ALL_LINES.length}`);
  if (expectedSeen !== actualSeen) {
    console.log('     ожидалось: ' + expectedSeen);
    console.log('     показано:  ' + actualSeen);
  }
  const extra = seen.filter((line) => !ALL_LINES.includes(line));
  check(extra.length === 0, `лишних строк заставки за всё интро нет (${extra.join(' | ') || 'ни одной'})`);
  // Строка про долг: настоящее число debt и красное слово ДОЛГ; вторая строка — ВЕРНУТЬ красным.
  const debtLine = ALL_LINES.find((line) => line.startsWith(norm(LANG.t('tutDebtPrefix'))));
  check(debtLine !== undefined && debtLine === norm(`${LANG.t('tutDebtPrefix')} ${RULES.startDebt()} ${LANG.t('tutDebtWord')}`),
    `в строке долга настоящее число: «${debtLine}»`);
  const debtPieces = debtLine ? pieces.get(debtLine) || [] : [];
  const debtWord = debtPieces.find((piece) => piece.text.trim() === LANG.t('tutDebtWord')) || null;
  const debtPrefix = debtPieces.find((piece) => piece.text.trim() === LANG.t('tutDebtPrefix')) || null;
  check(debtWord !== null && (debtWord.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.red, `слово ДОЛГ красное: ${debtWord && debtWord.color}`);
  check(debtPrefix !== null && (debtPrefix.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.normal, `«Это твой текущий» жёлтое: ${debtPrefix && debtPrefix.color}`);
  const returnLine = norm(`${LANG.t('tutMustReturn')} ${LANG.t('tutReturnWord')}`);
  const returnWord = (pieces.get(returnLine) || []).find((piece) => piece.text.trim() === LANG.t('tutReturnWord')) || null;
  check(returnWord !== null && (returnWord.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.red, `слово ВЕРНУТЬ красное: ${returnWord && returnWord.color}`);
  // Ни один текст обучения не мигает: бесконечных твинов не было ни у одной строки за весь показ.
  const looping = [...pieces.values()].flat().filter((piece) => piece.loops > 0);
  check(looping.length === 0, `за весь показ ни одного бесконечного твина на текстах (нашлось ${looping.length})`);

  // ---------- 5. Конец раунда: Коллектор, долг, дорожка денег, магазин ----------
  block('5. конец раунда: долг, шесть строк денег, магазин');
  const atm = await waitUntil((s) => s.awaitPay === true || s.shop === true, 25000, 'банкомат за долгом');
  check(atm !== null && atm.awaitPay === true, 'Коллектор выехал за долгом (isAwaitingPayment)');
  if (atm) {
    check(atm.debt === RULES.startDebt(), `долг первого раунда ${atm.debt} = startDebt ${RULES.startDebt()}`);
    const beforePay = atm.balance;
    const moneyFrom = seen.length;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    const moneyLast = await waitUntil((s) => s.line === MONEY_FLAT[MONEY_FLAT.length - 1], 25000, 'последняя строка денег');
    check(moneyLast !== null, `после оплаты идут строки денег: «${MONEY_FLAT[MONEY_FLAT.length - 1]}»`);
    await shot('tut-money-lines.png'); // последняя строка денег — пока она на экране
    const moneySeen = seen.slice(moneyFrom).filter((line) => MONEY_FLAT.includes(line));
    check(JSON.stringify(moneySeen) === JSON.stringify(MONEY_FLAT), `шесть строк денег по порядку: ${moneySeen.join(' → ')}`);
    // Цвета валют: ФИШКИ белые, БИЛЕТЫ фиолетовые.
    const chips = (pieces.get(MONEY_FLAT[2]) || []).find((piece) => piece.text.trim() === LANG.t('tutChipsWord')) || null;
    const tickets = (pieces.get(MONEY_FLAT[2]) || []).find((piece) => piece.text.trim() === LANG.t('tutTicketsWord')) || null;
    check(chips !== null && (chips.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.white, `ФИШКИ белые: ${chips && chips.color}`);
    check(tickets !== null && (tickets.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.purple, `БИЛЕТЫ фиолетовые: ${tickets && tickets.color}`);
    const chipsLast = (pieces.get(MONEY_FLAT[4]) || []).find((piece) => piece.text.trim() === LANG.t('tutChipsWord')) || null;
    const ticketsLast = (pieces.get(MONEY_FLAT[5]) || []).find((piece) => piece.text.trim() === LANG.t('tutTicketsWord')) || null;
    check(chipsLast !== null && (chipsLast.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.white, `на «ФИШКИ на всё простое» ФИШКИ тоже белые`);
    check(ticketsLast !== null && (ticketsLast.color || '').toLowerCase() === SCREEN_TEXT.SCREEN_TONE_COLORS.purple, `на «БИЛЕТЫ редкие…» БИЛЕТЫ тоже фиолетовые`);
    const paid = await waitUntil((s) => s.shop === true, 20000, 'магазин после оплаты');
    check(paid !== null, 'после строк денег магазин открылся (isShopOpen)');
    // Порядок по журналу: магазин встал после последней строки денег, а не раньше неё.
    const shopAt = events.indexOf(SHOP_EVENT);
    const lastMoneyAt = events.lastIndexOf(MONEY_FLAT[MONEY_FLAT.length - 1]);
    check(lastMoneyAt >= 0 && shopAt > lastMoneyAt, `магазин открылся только после строк денег (журнал: строка ${lastMoneyAt}, магазин ${shopAt})`);
    if (paid) {
      check(paid.closed === 1, `долг закрыт: closedDebts() === ${paid.closed}`);
      check(paid.balance === beforePay - RULES.startDebt(), `фишки ушли ровно на долг: ${beforePay} → ${paid.balance} (−${RULES.startDebt()})`);
      check(paid.debt === NEXT_DEBT, `на записке следующий долг ${paid.debt} (= debtForRound(2), оплаченный 150 сменился — openShop всегда так делает)`);
      check(paid.round === 2, `раунд перешёл на ${paid.round}`);
      const progress = JSON.parse(paid.progress || '{}');
      check(progress.tutorial && progress.tutorial.money === 1, `дорожка денег помечена пройденной (tutorial.money = ${progress.tutorial && progress.tutorial.money})`);
    }
    // Повтор: дорожка денег молчит — она звучит ровно один раз (tutorial.money уже 1).
    const repeat = await val(`(() => {
      const g = window.__g;
      let spoke = false;
      g.tutorialMoneyPaid(() => { spoke = true; });
      return JSON.stringify({ spoke, parts: g.collector.screenSequence.length, busy: g.busy });
    })()`);
    const repeatState = repeat ? JSON.parse(repeat) : null;
    check(repeatState !== null && repeatState.spoke === true, 'повторный вызов дорожки сразу зовёт done (магазин не ждёт)');
    check(repeatState !== null && repeatState.parts === 0 && repeatState.busy === false, `и не показывает ни одной строки (частей заставки ${repeatState && repeatState.parts}, busy ${repeatState && repeatState.busy})`);
  }

  // ---------- 6. Первая смерть: спасение, 7 строк ----------
  block('6. первая смерть: раунд спасения говорит 7 строк');
  const shopReady = await waitUntil((s) => s.shopping === true, 20000, 'магазин опустился');
  check(shopReady !== null, 'магазин открыт и покупки доступны (isShopping)');
  await shot('tut-shop.png'); // панель магазина уже на месте, а не в полёте
  if (shopReady) await val('window.__g.leaveShop(); 1');
  const round2 = await waitUntil((s) => !s.shop && !s.shopping && s.spinsLeft > 0, 20000, 'новый раунд после магазина');
  check(round2 !== null, 'из магазина вышли, раунд пошёл (снова есть прокрутки)');
  const tutorialDoneBefore = round2 && round2.progress ? JSON.parse(round2.progress).tutorialDone : null;
  console.log('     мастер-флаг после интро: tutorialDone = ' + tutorialDoneBefore + ' (интро кончилось, но смерть ещё не было — флаг поставит первая смерть)');
  await val(`(() => { const g = window.__g; g.isGameOver = false; g.isRescueWinPending = false; g.pacts = []; g.startRescue(); return 1; })()`);
  const rescueLines = await waitUntil((s) => s.line === DEATH_LINES[DEATH_LINES.length - 1], 40000, 'последняя строка спасения');
  check(rescueLines !== null, `спасение дошло до «${DEATH_LINES[DEATH_LINES.length - 1]}»`);
  const deathSeen = seen.filter((line) => DEATH_LINES.includes(line));
  check(JSON.stringify(deathSeen) === JSON.stringify(DEATH_LINES), `строки спасения идут по порядку: ${deathSeen.join(' → ')}`);
  check(!!deathSeen.length && deathSeen[0] === DEATH_LINES[0], `первая строка — «${DEATH_LINES[0]}»`);
  check(!!deathSeen.length && deathSeen[deathSeen.length - 1] === DEATH_LINES[DEATH_LINES.length - 1], `последняя — «${DEATH_LINES[DEATH_LINES.length - 1]}»`);
  await shot('tut-rescue-lines.png');

  // ---------- 7. Победа в спасении: 3 строки и только потом магазин ----------
  block('7. победа в спасении: 3 строки, магазин после них');
  const introDone = await waitUntil((s) => !s.rescueIntro && !s.busy && s.rescue, 20000, 'строки спасения кончились');
  check(introDone !== null, 'строки спасения отзвучали, спасение ждёт прокрутки');
  const beforeWin = seen.length;
  await val('window.__g.winRescue(); 1');
  const winLast = await waitUntil((s) => s.line === WIN_LINES[WIN_LINES.length - 1], 20000, 'последняя строка победы в спасении');
  check(winLast !== null, `победа в спасении дошла до «${WIN_LINES[WIN_LINES.length - 1]}»`);
  const winSeen = seen.slice(beforeWin).filter((line) => WIN_LINES.includes(line));
  check(JSON.stringify(winSeen) === JSON.stringify(WIN_LINES), `три строки по порядку: ${winSeen.join(' → ')}`);
  check(winSeen[0] === WIN_LINES[0], `первая — «${WIN_LINES[0]}»`);
  const shopAfterWin = winLast !== null && winLast.shop === false;
  check(shopAfterWin, 'пока идут строки, магазин ещё закрыт');
  const winShop = await waitUntil((s) => s.shop === true, 20000, 'магазин после строк победы');
  check(winShop !== null, 'и только после них открылся магазин');
  await shot('tut-rescue-win.png');

  // ---------- 8. KABOOM: 7 строк перед экраном улучшений ----------
  block('8. KABOOM: 7 строк, потом экран улучшений');
  if (winShop) {
    const inShop = await waitUntil((s) => s.shopping === true, 20000, 'магазин после победы в спасении опустился');
    if (inShop) await val('window.__g.leaveShop(); 1');
  }
  const round3 = await waitUntil((s) => !s.shop && !s.shopping && s.spinsLeft > 0, 20000, 'раунд перед KABOOM');
  check(round3 !== null, 'раунд пошёл, забег можно кончать');
  const beforeDeath = seen.length;
  await val('window.__g.kaboom(); 1');
  // Снимок строк смерти — пока они идут (экран улучшений их снимает).
  const deathLine = await waitUntil((s) => s.line === DEATH_SCREEN[1], 40000, 'вторая строка смерти');
  if (deathLine) await shot('tut-death-lines.png');
  const upgradeOpen = await waitUntil((s) => s.upgrade === true, 40000, 'экран улучшений после KABOOM');
  const deathScreenSeen = seen.slice(beforeDeath).filter((line) => DEATH_SCREEN.includes(line));
  check(upgradeOpen !== null, 'экран улучшений всё равно появился после строк');
  check(JSON.stringify(deathScreenSeen) === JSON.stringify(DEATH_SCREEN), `перед ним семь строк по порядку: ${deathScreenSeen.join(' → ')}`);
  check(deathScreenSeen[0] === DEATH_SCREEN[0] && deathScreenSeen[deathScreenSeen.length - 1] === DEATH_SCREEN[DEATH_SCREEN.length - 1],
    `первая «${DEATH_SCREEN[0]}», последняя «${DEATH_SCREEN[DEATH_SCREEN.length - 1]}»`);

  // ---------- 9. Новый забег после первой смерти: 6 строк действий, мастер-флаг ----------
  block('9. забег после первой смерти: 6 строк действий и мастер-флаг');
  const beforeActions = seen.length;
  const runsBefore = (await sample()).runs;
  await val('window.__g.closeUpgrades(); 1');
  const restarted = await waitUntil((s) => s.hook && s.upgrade === false && s.runs === runsBefore + 1, 25000, 'новый забег после улучшений');
  check(restarted !== null, `забег начался заново: счётчик забегов ${runsBefore} → ${restarted && restarted.runs} (scene.restart — тот же инстанс, видно по beginRun)`);
  const actionsLast = await waitUntil((s) => s.line === ACTIONS_LINES[ACTIONS_LINES.length - 1], 30000, 'последняя строка действий');
  check(actionsLast !== null, `строки действий дошли до «${ACTIONS_LINES[ACTIONS_LINES.length - 1]}»`);
  const actionsSeen = seen.slice(beforeActions).filter((line) => ACTIONS_LINES.includes(line));
  check(JSON.stringify(actionsSeen) === JSON.stringify(ACTIONS_LINES), `шесть строк по порядку: ${actionsSeen.join(' → ')}`);
  check(actionsSeen[0] === ACTIONS_LINES[0], `первая — «${ACTIONS_LINES[0]}»`);
  await shot('tut-actions-lines.png');
  const flagOn = await waitUntil((s) => {
    const progress = s.progress ? JSON.parse(s.progress) : null;
    return progress && progress.tutorialDone === true;
  }, 15000, 'мастер-флаг tutorialDone');
  check(flagOn !== null, 'после строк мастер-флаг стоит (progress.tutorialDone === true)');
  if (flagOn) {
    const progress = JSON.parse(flagOn.progress);
    check(progress.tutorial.actions === 1, `дорожка действий пройдена (tutorial.actions = ${progress.tutorial.actions})`);
    check(progress.tutorial.intro === STEPS.length, `интро помечено пройденным целиком (tutorial.intro = ${progress.tutorial.intro})`);
    check(progress.tutorial.money === 1, `дорожка денег тоже не сотрётся (tutorial.money = ${progress.tutorial.money})`);
    check(flagOn.hasReveal === false, 'тьмы нет и в этом забеге (reveal === null)');
  }

  // ---------- 10. Повторный забег: ни одной строки обучения ----------
  block('10. повторный забег с мастер-флагом: строк обучения нет');
  await val('window.__g.kaboom(); 1');
  const secondUpgrade = await waitUntil((s) => s.upgrade === true, 40000, 'экран улучшений второго забега');
  check(secondUpgrade !== null, 'второй KABOOM тоже доходит до экрана улучшений');
  const beforeQuiet = seen.length;
  const runsQuiet = (await sample()).runs;
  await val('window.__g.closeUpgrades(); 1');
  const quietRun = await waitUntil((s) => s.hook && s.upgrade === false && s.runs === runsQuiet + 1, 25000, 'тихий забег');
  check(quietRun !== null, `тихий забег начался: счётчик забегов ${runsQuiet} → ${quietRun && quietRun.runs}`);
  // Весь старт забега (интро, строки действий, смерть) — 9 с с опросом, чтобы не пропустить короткую строку.
  let quietState = quietRun;
  for (let k = 0; k < 75; k++) { quietState = await sample(); await sleep(120); }
  const quietLines = seen.slice(beforeQuiet);
  check(quietLines.length === 0, `за старт повторного забега ни одной строки обучения (появилось: ${quietLines.join(' | ') || 'ни одной'})`);
  const quietProgress = JSON.parse((await val(`localStorage.getItem('dolgovaya-yama-progress')`)) || '{}');
  check(quietProgress.tutorialDone === true, 'мастер-флаг на месте перед повторным забегом (tutorialDone true)');
  check(quietState.hook && quietState.hasReveal === false, 'и тьмы в повторном забеге нет (game.reveal === null)');
  check(quietState.spinsLeft > 0 && !quietState.busy, `забег играется как обычный: прокруток ${quietState.spinsLeft}, ввод открыт`);

  // ---------- 11. Самопочинка после перезагрузки: записка и полка на своих битах ----------
  block('11. перезагрузка посреди обучения: записка на take, полка на places');
  /**
   * Перезагрузить страницу с прогрессом, где интро стоит на бите intro, и дождаться этой сцены.
   * Ждём intro >= intro, а не ровно intro: бит «Забери кон» после перезагрузки нечего забирать (кон в камеру
   * не пишется), и сцена сама честно идёт дальше — на «Крути дальше». Записка при этом уже открыта: бит take позади.
   */
  const reloadAt = async (intro) => {
    const saved = { tutorialDone: false, darknessDone: false, tutorial: { intro }, rescueIntroSeen: true, actionsUnlocked: true, patterns: [], achievements: [], upgrades: {}, runs: 1 };
    await val(`localStorage.setItem('dolgovaya-yama-progress', ${JSON.stringify(JSON.stringify(saved))}); 1`);
    await send('Page.reload');
    const t0 = Date.now();
    let s = await st();
    while (Date.now() - t0 < 30000) {
      if (s.hook && s.intro >= intro && !s.spinning) return s;
      await sleep(200);
      s = await st();
    }
    console.log(`     ТАЙМАУТ перезагрузки на бите ${intro}; последнее: ${JSON.stringify(s)}`);
    return null;
  };
  const beforeNote = await reloadAt(NOTE_STEP - 1); // бит «Попробуй ещё раз»: «Забери кон» ещё впереди
  check(beforeNote !== null, `перезагрузка вернула обучение на бит ${NOTE_STEP - 1} «${STEPS[NOTE_STEP - 1].id}»`);
  if (beforeNote) {
    check(beforeNote.note === false, 'до бита «Забери кон» записка после перезагрузки закрыта (самопочинка не открывает её раньше)');
    check(beforeNote.shelfHidden === true && beforeNote.shelfGroup === false, 'и полка предметов после перезагрузки ещё спрятана');
  }
  const atNote = await reloadAt(NOTE_STEP); // бит «Забери кон»: забирать нечего — записка уже проступила
  check(atNote !== null, `перезагрузка на бите ${NOTE_STEP} «${STEPS[NOTE_STEP].id}» вернула обучение (бит без кона уходит дальше сам)`);
  if (atNote) {
    check(atNote.intro >= NOTE_STEP, `бит take позади (introStep ${atNote.intro} ≥ ${NOTE_STEP})`);
    check(atNote.note === true, 'записка с долгом открыта и после перезагрузки (эффект бита с openNote доведён)');
    check(atNote.shelfHidden === true && atNote.shelfGroup === false, 'полка предметов тут ещё спрятана');
    await shot('tut-reload-take-note.png');
  }
  const atPlaces = await reloadAt(PLACES_STEP); // бит «Это ящики»: полка открыта
  check(atPlaces !== null, `перезагрузка вернула обучение на бит ${PLACES_STEP} «${STEPS[PLACES_STEP].id}»`);
  if (atPlaces) {
    check(atPlaces.shelfHidden === false && atPlaces.shelfGroup === true, 'на бите «Это ящики» полка открывается и после перезагрузки');
    await shot('tut-reload-places-shelf.png');
  }

  const code = ok === all ? 0 : 1;
  console.log(`\nснимки: ${SHOTS}`);
  console.log(`итог ${ok} из ${all}, exit ${code}`);
  ws.close();
  process.exitCode = code;
} finally {
  chrome.kill();
  srv.kill();
}

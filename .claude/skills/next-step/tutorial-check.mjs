/**
 * Браузерная проверка обучения текстами (партия 4) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/tutorial-check.mjs <scratchpad>, где <scratchpad>/dist — сборка
 * с хуком window.__g (bash .claude/skills/next-step/hookbuild.sh <scratchpad> .).
 * Снимки — в <scratchpad>/shots-tutorial: первый текст, «Забери кон» (текст и подсветка кнопки), бит lever
 * на чистом экране, записка на «Это твой долг», полка на «Это места под предметы», красный текст, «2 гнезда»,
 * строки спасения, победы в спасении, смерти и действий, самопочинка после перезагрузки. Профиль Chrome — в scratchpad. 
 * Порт http 8772 (так задано в брифе; его же берёт memory-check), отладка Chrome 9344 — 9333…9343 заняты
 * прочими сценариями (shot 9333, phone 9334, atm-who/tablet/win-reveal 9337, ticket 9338, memory 9339,
 * rescue/upgrades 9340, lever 9341, actions 9342, soak 9343).
 *
 * Правила Диллера берутся из игры, а не из копии в сценарии: биты интро — introSteps(START_SOCKETS) из
 * src/game/tutorial.ts, строки — t() из lang.ts (язык страницы выставляется в ru через localStorage), сетки —
 * tutorialGrid(kind), подсчёт выигрыша — evaluateGrid из patterns.ts, «красный» — RED_TEXT из theme.ts.
 * Текущая строка заставки читается так же, как в rescue-check: collector.screenSequence, у элемента с .text.
 *
 * Что проверяет:
 *  1) чистый профиль: обучение не начато (флагов и шагов нет; счётчик забегов игра пишет сама), тьма первого
 *     забега активна, первым идёт «Привет, нажми на рычаг»;
 *  2) пока идёт текст, game.spin() не уменьшает прокрутки и не начинает крутить;
 *  3) прокрутка бита pull даёт ровно пустую сетку обучения: evaluateGrid по показанным клеткам — win 0,
 *     «nothing», и ни черепа, ни кубика, ни билета, ни замка;
 *  4) «Попробуй ещё раз» → прокрутка даёт паттерн: win > 0 и кон вырос;
 *  5) «Забери кон из автомата»: кнопка «забрать» подсвечена (пульс свечения и купола), take() кладёт кон
 *     на табло (panel.boardText), подсветка снимается, дальше «Жми рычаг». Записки с долгом на этом тексте ещё
 *     нет: она проступает из тьмы на бите debt — «Это твой долг» (замечание автора 24.11);
 *  6) на каждом бите, где ждут рычага или «забрать», экран автомата пуст: collector.screenSequence.length === 0
 *     (ни строки, ни чёрной плашки), и снимок бита lever — «ждёт рычага на чистом экране»;
 *  7) полка предметов (ItemShelf): до бита places её на стене нет совсем (isHidden, группа невидима) и клик по
 *     ней не проходит (InputManager.inputCandidate по дверце === false), с бита places «Это места под предметы» —
 *     открыта и кликается; снимок tut-places-shelf.png;
 *  8) после «отдай его до конца раунда» прокрутка кладёт черепа (бит debt: сетка tutorialGrid("skull")),
 *     кон сгорает, следом красный текст;
 *  9) «Черепа сжигают кон и множитель» красным, кон и серия сгорели; тьма на этом тексте ещё есть, а на
 *     следующем бите («Телевизор») гаснет совсем: reveal === null и progress.darknessDone === true
 *     (isDarknessDone() пишется в localStorage сразу, см. progress.markDarknessDone);
 * 10) все тексты интро идут ровно в порядке introSteps: Телевизор → Тут много информации → Твоя цель не
 *     1.000.000 → Твоя цель → ВЫЖИТЬ → Это места под предметы → покупай в магазине → используй обдуманно;
 *     биты с wait: 'none' (Телевизор, «не 1.000.000», места под предметы) идут дальше сами, без прокрутки.
 *     Прокруток в интро 9 из 12: черепа — на debt, а не на отдельном пустом бите;
 * 11) «Видишь сверху 2 гнезда под амулеты?» — число и форма слова из START_SOCKETS (2), а не «2 слотов»;
 *     дальше «Это амулеты», «Лучшее что есть тут», «Покупай за билеты», «Они работают, пока ты не умрёшь»;
 * 12) перед последней прокруткой spinsLeft === 1; после неё штатный конец раунда: сетка-долг платит больше
 *     первого долга, кон забирается сам, Enter отдаёт долг, closedDebts() === 1, на записке следующий долг,
 *     открывается магазин;
 * 13) повторный забег с мастер-флагом (tutorialDone) не говорит ни одной строки обучения;
 * 14) первая смерть: спасение даёт 7 строк «Хахахаха…УДАЧИ»; победа в спасении — 3 строки и только потом
 *     магазин; KABOOM — 7 строк перед экраном улучшений, улучшения появляются; следующий забег после первой
 *     смерти — 6 строк «Ах да, забыл сказать…», после них мастер-флаг стоит, ещё один забег — тишина;
 * 15) самопочинка после перезагрузки: прогресс с интро на битах NOTE_STEP−1 / NOTE_STEP / PLACES_STEP
 *     (записка на debt, полка на places) — записка закрыта до долга и открыта на нём, полка спрятана до
 *     «Это места под предметы» и открыта на нём; снимки tut-reload-debt-note.png и tut-reload-places-shelf.png.
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
const AMULETS = await import(SRC + 'amulets.ts');
const RULES = await import(SRC + 'rules.ts');
const PATTERNS = await import(SRC + 'patterns.ts');
const DEALER = await import(SRC + 'dealerGame.ts');
// theme.ts тянет Phaser (в Node его нет), поэтому красный цвет и его связь с заставкой читаем из исходников —
// так же, как lever-check читает lang.ts строкой. RED_TEXT — единственный источник «красного» у заставки.
const THEME_SRC = readFileSync(SRC + 'theme.ts', 'utf8');
const COLLECTOR_SRC = readFileSync(SRC + 'parts/collector.ts', 'utf8');
const redMatch = THEME_SRC.match(/export const RED_TEXT = '([^']+)'/);
const RED_TEXT = redMatch ? redMatch[1].toLowerCase() : '';
const TITLE_IS_RED = /SCREEN_TITLE_STYLE = \{[^}]*color: RED_TEXT/.test(COLLECTOR_SRC);

/** Биты интро как их читает игра: число гнёзд — настоящее START_SOCKETS. */
const STEPS = TUT.introSteps(AMULETS.START_SOCKETS);
/** Строки каждого бита на языке страницы (страница — ru). */
const STEP_LINES = STEPS.map((step) => step.lines.map((line) => LANG.t(line.key, ...(line.args ?? []))));
/** Все строки интро одной лентой — по ней сверяем порядок и отсутствие лишних. */
const ALL_LINES = STEP_LINES.flat();
/** Номера особых битов — из самих битов, а не из чисел: openNote (записка с долгом) и places (полка предметов). */
const NOTE_STEP = STEPS.findIndex((step) => step.openNote);
const PLACES_STEP = STEPS.findIndex((step) => step.id === 'places');
/** Первая строка бита амулетов: число гнёзд и правильная форма слова — из START_SOCKETS, а не из копии числа. */
const SLOT_LINE = LANG.t('tutSlots', AMULETS.START_SOCKETS, LANG.socketWord(AMULETS.START_SOCKETS));
/** Дорожки вне интро. */
const DEATH_LINES = TUT.DEATH_LINES.map((key) => LANG.t(key));
const WIN_LINES = TUT.RESCUE_WIN_LINES.map((key) => LANG.t(key));
const DEATH_SCREEN = TUT.DEATH_SCREEN_LINES.map((key) => LANG.t(key));
const ACTIONS_LINES = TUT.ACTIONS_LINES.map((key) => LANG.t(key));
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

  /** Состояние сцены и теккущая строка заставки (collector.screenSequence, элемент с .text — как в rescue-check). */
  const st = async () => JSON.parse((await val(`(() => {
    const g = window.__g;
    if (!g) return JSON.stringify({ hook: false });
    const seq = g.collector && g.collector.screenSequence ? g.collector.screenSequence : [];
    const line = seq.find((part) => typeof part.text === 'string');
    const cells = g.screen && g.screen.cells
      ? g.screen.cells.map((row) => row.map((cell) => String(cell.texture.key).replace('symbol-', '')))
      : null;
    const pay = g.payout;
    return JSON.stringify({
      hook: true, intro: g.introStep, steps: g.intro ? g.intro.length : -1, phase: g.tutorialPhase,
      busy: g.busy, armed: g.armed ?? null,
      title: line ? line.text.replace(/\\s+/g, ' ').trim() : null,
      color: line && line.style ? line.style.color : null,
      seqParts: seq.length,
      spinsLeft: g.spinsLeft, pot: g.pot, balance: g.balance, debt: g.debt, round: g.round, closed: g.closedDebts(),
      tickets: g.tickets, sockets: g.sockets, board: g.panel ? g.panel.boardText.text : null,
      spinning: g.isSpinning, shop: g.isShopOpen, shopping: g.isShopping, over: g.isRoundOver,
      awaitPay: g.isAwaitingPayment, rescue: g.isRescue, rescueIntro: g.isRescueIntro,
      hasReveal: g.reveal !== null, reveal: g.reveal ? g.reveal.isActive : null, note: g.reveal ? g.reveal.isNoteOpen : null,
      shelfHidden: g.itemShelf && typeof g.itemShelf.isHidden === 'boolean' ? g.itemShelf.isHidden : null,
      shelfGroup: g.itemShelf && g.itemShelf.group ? g.itemShelf.group.visible : null,
      upgrade: g.upgradeScreen ? g.upgradeScreen.isOpen : null,
      hl: pay && pay.highlightTweens ? pay.highlightTweens.length : -1,
      glow: pay && pay.buttonGlow ? Math.round(pay.buttonGlow.alpha * 100) / 100 : -1,
      dome: pay && pay.buttonDome ? Math.round(pay.buttonDome.scale * 100) / 100 : -1,
      cells,
      runs: g.runsPlayed,
      progress: localStorage.getItem('dolgovaya-yama-progress'),
    });
  })()`)) ?? { hook: false });

  // Заставка: собираем каждую строку, которую показал экран автомата, — по ней проверяем порядок и лишние строки.
  let lastTitle = null;
  const seen = [];
  const colors = new Map();
  const sample = async () => {
    const s = await st();
    if (s.title && s.title !== lastTitle) {
      seen.push(s.title);
      if (!colors.has(s.title)) colors.set(s.title, s.color);
      lastTitle = s.title;
    }
    return s;
  };
  /** Ждём условие с таймаутом; null — не дождались (и это видно в выводе, а не молча). */
  const waitUntil = async (pred, limit, label) => {
    const t0 = Date.now();
    let s = await sample();
    while (Date.now() - t0 < limit) {
      if (pred(s)) return s;
      await sleep(120);
      s = await sample();
    }
    console.log(`     ТАЙМАУТ ${label}; последнее состояние: ${JSON.stringify({ intro: s.intro, title: s.title, busy: s.busy, armed: s.armed, phase: s.phase, spins: s.spinsLeft, shop: s.shop, over: s.over, rescue: s.rescue, upgrade: s.upgrade })}`);
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
  const nextText = async (expected, limit = 14000) => (await waitUntil((s) => s.title === expected, limit, `текст «${expected}»`)) !== null;

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  // Язык ставим до загрузки приложения, а не перезагрузкой: так профиль остаётся первым забегом (счётчик runs = 1).
  // Headless Chrome англоязычный, а строки Диллера проверяем русские.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('dolgovaya-yama-lang','ru');}catch(e){}" });
  await send('Page.navigate', { url: 'http://127.0.0.1:8772/' });
  await sleep(3000);

  // ---------- 1. Чистый профиль: тьма и первый текст ----------
  block('1. чистый профиль: тьма и «Привет, нажми на рычаг»');
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  const first = await waitUntil((s) => s.title === ALL_LINES[0], 25000, 'первый текст интро');
  check(first !== null, `первым идёт «${ALL_LINES[0]}» (текст прочитан с заставки collector.screenSequence)`);
  if (first) {
    // beginRun сразу пишет прогресс (счётчик забегов), поэтому «пусто» — это прогресс, где ни один шаг обучения
    // не сдвинут. После первого beginRun mergeTutorial заполняет все четыре ключа нулями, и проверка на число
    // ключей была бы хрупкой — важно только «ни один шаг не ≥ 1».
    const clean = first.progress ? JSON.parse(first.progress) : null;
    const cleanSteps = clean !== null && clean.tutorial ? Object.values(clean.tutorial).every((step) => !(step >= 1)) : false;
    check(clean !== null && clean.tutorialDone === false && clean.darknessDone === false && cleanSteps && clean.runs === 1,
      'профиль чистый: свежий user-data-dir, в прогрессе только счётчик забегов, ни один шаг не ≥ 1, tutorialDone/darknessDone не стоят — ' + first.progress);
    check(first.hasReveal && first.reveal === true, `тьма первого забега есть и активна (reveal !== null, isActive ${first.reveal})`);
    check(first.note === false, `записка с долгом закрыта: она проступает только на бите ${NOTE_STEP} «${STEPS[NOTE_STEP].id}»`);
    check(first.shelfHidden === true && first.shelfGroup === false, `полки предметов на стене ещё нет: она откроется на бите ${PLACES_STEP} «${STEPS[PLACES_STEP].id}»`);
    check(first.seqParts === 2, `на экране автомата строка заставки целиком: чёрный экран + надпись (${first.seqParts} части)`);
    const color = (first.color || '').toLowerCase();
    check(TITLE_IS_RED && color === RED_TEXT, `строка красная: ${color} — цвет из theme.RED_TEXT (${RED_TEXT}), заставка его и берёт (SCREEN_TITLE_STYLE.color = RED_TEXT)`);
    check(first.intro === 0 && first.steps === STEPS.length, `идёт первый бит из ${STEPS.length} (introStep ${first.intro})`);
    await shot('tut-first-line.png'); // первый текст — пока он на экране
  }

  // ---------- 2. Пока идёт текст, рычаг не крутит ----------
  block('2. блокировка ввода на время текста');
  if (first) {
    const before = first;
    await val('window.__g.spin(); 1');
    await sleep(500);
    const after = await sample();
    check(after.spinsLeft === before.spinsLeft, `spin() во время текста не тратит прокрутку: spinsLeft ${before.spinsLeft} → ${after.spinsLeft}`);
    check(after.spinning === false, 'и прокрутка не началась (isSpinning false)');
    check(JSON.stringify(after.cells) === JSON.stringify(before.cells), 'сетка на экране не сдвинулась — текст держит ввод');
  }

  // ---------- 3. Интро бит за битом ----------
  block('3. интро: биты по порядку, сетки и прокрутки');
  let introBroken = false;
  const payoutHighlight = { atTake: null }; // что видно у кнопки «забрать» в бите take
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i];
    const lines = STEP_LINES[i];
    // Текст бита (последняя строка): ждём именно её — пауза перед текстом не даст нажать раньше времени.
    // Уже показанную строку (первый бит её видел блок 1) второй раз не ждём: она висит всего TUTORIAL_LINE_HOLD.
    if (lines.length > 0) {
      const line = lines[lines.length - 1];
      if (!seen.includes(line)) {
        if (step.id === 'amulets') {
          // Бит из пяти строк: снимок самой первой — «Видишь сверху 2 гнезда под амулеты?».
          const head = await waitUntil((s) => s.title === lines[0], 10000, `первая строка бита ${step.id}`);
          if (head) await shot('tut-amulets.png');
        }
        if (step.id === 'debt') {
          // Первая строка бита долга: сюда записка с долгом уже должна проступить из тьмы.
          const debtHead = await waitUntil((s) => s.title === lines[0], 20000, `первая строка бита ${step.id} «${lines[0]}»`);
          if (debtHead) {
            check(debtHead.note === true, `на «${lines[0]}» записка с долгом уже проступила (reveal.isNoteOpen)`);
            check(debtHead.shelfHidden === true && debtHead.shelfGroup === false, 'и полки предметов на стене ещё нет');
            await shot('tut-debt-note.png');
          }
        }
        const shown = await waitUntil((s) => s.title === line, lines.length * 3500 + 6000, `текст бита ${step.id} «${line}»`);
        if (!shown) { check(false, `текст бита ${step.id} «${line}» показан`); introBroken = true; break; }
        if (step.id === 'take') {
          check(shown.note === false, 'на тексте «Забери кон из автомата» записка с долгом ещё закрыта (открывается на debt)');
        }
      }
      // Снимки текстов — пока строка на экране: в готовом состоянии заставка уже погасла.
      if (step.id === 'take') await shot('tut-take-text.png');
      if (step.id === 'burn') await shot('tut-red-text.png');
    }
    // Бит без прокрутки («Телевизор», «не 1.000.000», места под предметы): игрок только читает, а бит сам
    // передаёт эстафету следующему — по сценарию автора здесь ничего не нажимают.
    if (step.wait === 'none') {
      const atText = await sample();
      if (step.id === 'places') {
        check(atText.shelfHidden === false && atText.shelfGroup === true, 'на «Это места под предметы» полка уже открыта (ItemShelf.setHidden(false))');
        await shot('tut-places-shelf.png');
      }
      const moved = await waitUntil((s) => s.intro > i || s.shop || s.over, 20000, `бит ${step.id}: сам идёт дальше`);
      check(moved !== null, `бит ${step.id} (wait: none) сам переходит к следующему — прокрутки не нужно`);
      if (!moved) { introBroken = true; break; }
      check(atText.spinsLeft === moved.spinsLeft, `бит ${step.id} прошёл без прокрутки: spinsLeft ${atText.spinsLeft} → ${moved.spinsLeft}`);
      continue;
    }
    const ready = await waitUntil(readyPred(i), 12000, readyLabel(i));
    if (!ready) {
      check(false, `${readyLabel(i)} — бит готов к действию`);
      introBroken = true;
      break;
    }
    // Бит ждёт ввода на чистом экране: ни строки, ни чёрной плашки (не «alpha 0», а пустой screenSequence).
    check(ready.seqParts === 0, `бит ${step.id}: к ожиданию ввода экран автомата пуст (screenSequence ${ready.seqParts})`);
    // Полка предметов: до «Это места под предметы» её на стене нет совсем, с этого бита — есть.
    if (i < PLACES_STEP) {
      check(ready.shelfHidden === true && ready.shelfGroup === false, `бит ${step.id}: полки предметов ещё нет (до бита ${PLACES_STEP} «места под предметы»)`);
      const door = await shelfDoor();
      check(door.found && door.candidate === false, `бит ${step.id}: клик по спрятанной полке не проходит (inputCandidate ${door.candidate})`);
    } else {
      check(ready.shelfHidden === false && ready.shelfGroup === true, `бит ${step.id}: полка предметов открыта`);
      const door = await shelfDoor();
      check(door.found && door.candidate === true, `бит ${step.id}: по открытой полке кликать можно (inputCandidate ${door.candidate})`);
    }
    if (step.id === 'lever') await shot('tut-lever-clean.png'); // «Жми рычаг» ждёт рычага: на экране ничего лишнего
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
    if (step.id === 'amulets') {
      check(ready.spinsLeft === 1, `перед последней прокруткой остаётся ровно одна (spinsLeft ${ready.spinsLeft})`);
      check(ready.sockets === AMULETS.START_SOCKETS, `гнёзд под амулеты ${ready.sockets} = START_SOCKETS ${AMULETS.START_SOCKETS}`);
    }
    if (step.id === 'burn') check(ready.hasReveal && ready.reveal === true, 'на красном тексте тьма ещё стоит (гаснет на следующем бите — телевизор)');
    if (step.id === 'take') await shot('tut-take-highlight.png'); // «забери кон»: кнопка подсвечена (текст к этому времени уже погас)
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
    const advanced = await waitUntil((s) => s.intro > i || s.shop || s.over || s.awaitPay || s.upgrade, 25000, `бит ${step.id}: переход дальше`);
    if (!advanced) { check(false, `бит ${step.id}: интро сдвинулось дальше`); introBroken = true; break; }
    // ---------- Проверки по битам ----------
    if (step.id === 'pull') {
      const ev = evaluate(advanced.cells);
      check(sameGrid(advanced.cells, 'empty'), 'прокрутка бита pull кладёт ровно учебную пустую сетку (tutorialGrid("empty"))');
      check(ev !== null && ev.kind === 'nothing' && ev.win === 0, `по этой сетке выигрыш 0 и паттернов нет (kind ${ev && ev.kind}, win ${ev && ev.win})`);
      const forbidden = ['skull', 'dice', 'ticket', 'lock'];
      const found = (advanced.cells || []).flat().filter((id) => forbidden.includes(id));
      check(found.length === 0, `в сетке нет черепа, кубика, билета и замка (найдено: ${found.join(', ') || 'ничего'})`);
      check(advanced.pot === ready.pot, `кон не вырос: ${ready.pot} → ${advanced.pot}`);
      check(advanced.spinsLeft === ready.spinsLeft - 1, `прокрутка потратила ровно одну: spinsLeft ${ready.spinsLeft} → ${advanced.spinsLeft}`);
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
      check(await nextText(LANG.t('tutLever')), `дальше идёт «${LANG.t('tutLever')}»`);
      check(advanced.note === false, 'на «забери кон» записки с долгом ещё нет: она проступает на следующем бите (debt)');
    }
    if (step.id === 'lever') {
      const ev = evaluate(advanced.cells);
      check(sameGrid(advanced.cells, 'pattern') && ev !== null && ev.win > 0, `«Жми рычаг» → снова паттерн, win ${ev && ev.win}`);
      check(advanced.pot > ready.pot, `кон вырос: ${ready.pot} → ${advanced.pot}`);
    }
    if (step.id === 'debt') {
      // Сценарий автора: после «Это твой долг / отдай его до конца раунда» прокрутка кладёт черепа.
      const ev = evaluate(advanced.cells);
      const skulls = (advanced.cells || []).flat().filter((id) => id === 'skull').length;
      check(skulls >= 3, `прокрутка после «отдай его до конца раунда» кладёт черепа (черепов ${skulls})`);
      check(sameGrid(advanced.cells, 'skull'), 'и это ровно учебная сетка с черепами (tutorialGrid("skull"))');
      check(ev !== null && ev.kind === 'skull', `итог сетки — сгорание кона (kind ${ev && ev.kind})`);
      check(advanced.pot === 0, `черепа сожгли кон: pot ${ready.pot} → ${advanced.pot}`);
      check(await nextText(LANG.t('tutSkullsBurn')), `следом красный текст «${LANG.t('tutSkullsBurn')}»`);
      const redColor = (colors.get(LANG.t('tutSkullsBurn')) || '').toLowerCase();
      check(TITLE_IS_RED && redColor === RED_TEXT, `он правда красный: ${redColor} — цвет theme.RED_TEXT (${RED_TEXT})`);
    }
    if (step.id === 'burn') {
      // Тьма гаснет при входе в следующий бит — это видно по «Телевизору».
      const tv = await waitUntil((s) => s.title === LANG.t('tutTv'), 20000, 'текст «Телевизор»');
      check(tv !== null, `после прокрутки красного текста идёт «${LANG.t('tutTv')}»`);
      if (tv) {
        check(tv.hasReveal === false && tv.reveal === null, 'тьма погасла совсем (game.reveal === null)');
        const progress = tv.progress ? JSON.parse(tv.progress) : null;
        check(progress !== null && progress.darknessDone === true, 'и в прогрессе стоит darknessDone — это и есть isDarknessDone() из progress.ts (пишется сразу, markDarknessDone)');
        check(sameGrid(tv.cells, 'empty'), 'на «Телевизоре» на экране пустая сетка обучения');
      }
    }
    if (step.id === 'tvInfo') {
      check(await nextText(LANG.t('tutGoalNotMillion')), `после прокрутки — «${LANG.t('tutGoalNotMillion')}»`);
    }
    if (step.id === 'goal') {
      check(await nextText(LANG.t('tutItemPlaces')), `после «ВЫЖИТЬ» и прокрутки — «${LANG.t('tutItemPlaces')}»`);
    }
    if (step.id === 'buy') {
      check(await nextText(SLOT_LINE), `после магазинных строк и прокрутки — «${SLOT_LINE}»`);
      check(SLOT_LINE.includes(`${AMULETS.START_SOCKETS} ${LANG.socketWord(AMULETS.START_SOCKETS)}`) && !SLOT_LINE.includes('слотов'),
        'в тексте «2 гнезда», а не «2 слотов»: число и форма из START_SOCKETS');
    }
    if (step.id === 'amulets') {
      const ev = evaluate(advanced.cells);
      check(sameGrid(advanced.cells, 'debt'), 'последняя прокрутка кладёт учебную сетку-долг (tutorialGrid("debt"))');
      check(ev !== null && ev.kind === 'win' && ev.win >= RULES.startDebt(), `эта сетка покрывает первый долг: win ${ev && ev.win} ≥ ${RULES.startDebt()}`);
      check(advanced.spinsLeft === 0, `прокруток после неё не остаётся: spinsLeft ${advanced.spinsLeft}`);
      check(advanced.over === true, 'раунд кончился штатно (isRoundOver)');
      check(advanced.balance >= RULES.startDebt(), `кон забрался сам и долг закрывается с запасом: balance ${advanced.balance}`);
    }
    if (step.id === 'goalNot') {
      check(await nextText(LANG.t('tutGoal')), `после «не 1.000.000» и прокрутки — «${LANG.t('tutGoal')}»`);
    }
  }

  // ---------- 4. Все строки интро: порядок и отсутствие лишних ----------
  block('4. все строки интро — по порядку и без лишних');
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

  // ---------- 5. Конец раунда: Коллектор, долг, магазин ----------
  block('5. конец раунда: долг закрыт, магазин открылся');
  const atm = await waitUntil((s) => s.awaitPay === true || s.shop === true, 25000, 'банкомат за долгом');
  check(atm !== null && atm.awaitPay === true, 'Коллектор выехал за долгом (isAwaitingPayment)');
  if (atm) {
    check(atm.debt === RULES.startDebt(), `долг первого раунда ${atm.debt} = startDebt ${RULES.startDebt()}`);
    const beforePay = atm.balance;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    const paid = await waitUntil((s) => s.shop === true, 15000, 'магазин после оплаты');
    check(paid !== null, 'после Enter магазин открылся (isShopOpen)');
    if (paid) {
      check(paid.closed === 1, `долг закрыт: closedDebts() === ${paid.closed}`);
      check(paid.balance === beforePay - RULES.startDebt(), `фишки ушли ровно на долг: ${beforePay} → ${paid.balance} (−${RULES.startDebt()})`);
      check(paid.debt === NEXT_DEBT, `на записке следующий долг ${paid.debt} (= debtForRound(2), оплаченный 150 сменился — openShop всегда так делает)`);
      check(paid.round === 2, `раунд перешёл на ${paid.round}`);
    }
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
  const rescueLines = await waitUntil((s) => s.title === DEATH_LINES[DEATH_LINES.length - 1], 30000, 'последняя строка спасения');
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
  const winLast = await waitUntil((s) => s.title === WIN_LINES[WIN_LINES.length - 1], 20000, 'последняя строка победы в спасении');
  check(winLast !== null, `победа в спасении дошла до «${WIN_LINES[WIN_LINES.length - 1]}»`);
  const winSeen = seen.slice(beforeWin).filter((line) => WIN_LINES.includes(line));
  check(JSON.stringify(winSeen) === JSON.stringify(WIN_LINES), `три строки по порядку: ${winSeen.join(' → ')}`);
  check(winSeen[0] === WIN_LINES[0], `первая — «${WIN_LINES[0]}»`);
  const shopsDuringWin = seen.slice(beforeWin).length > 0 && winLast !== null && winLast.shop === false;
  check(shopsDuringWin, 'пока идут строки, магазин ещё закрыт');
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
  const deathLine = await waitUntil((s) => s.title === DEATH_SCREEN[1], 40000, 'вторая строка смерти');
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
  const actionsLast = await waitUntil((s) => s.title === ACTIONS_LINES[ACTIONS_LINES.length - 1], 30000, 'последняя строка действий');
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
  block('11. перезагрузка посреди обучения: записка на debt, полка на places');
  /** Перезагрузить страницу с прогрессом, где интро стоит на бите intro, и дождаться этой сцены. */
  const reloadAt = async (intro) => {
    const saved = { tutorialDone: false, darknessDone: false, tutorial: { intro }, rescueIntroSeen: true, actionsUnlocked: true, patterns: [], achievements: [], upgrades: {}, runs: 1 };
    await val(`localStorage.setItem('dolgovaya-yama-progress', ${JSON.stringify(JSON.stringify(saved))}); 1`);
    await send('Page.reload');
    const t0 = Date.now();
    let s = await st();
    while (Date.now() - t0 < 30000) {
      if (s.hook && s.intro === intro && !s.spinning) return s;
      await sleep(200);
      s = await st();
    }
    console.log(`     ТАЙМАУТ перезагрузки на бите ${intro}; последнее: ${JSON.stringify(s)}`);
    return null;
  };
  const beforeNote = await reloadAt(NOTE_STEP - 1); // бит «Жми рычаг»: записки ещё нет
  check(beforeNote !== null, `перезагрузка вернула обучение на бит ${NOTE_STEP - 1} «${STEPS[NOTE_STEP - 1].id}»`);
  if (beforeNote) {
    check(beforeNote.note === false, 'до бита долга записка после перезагрузки закрыта (самопочинка не открывает её раньше)');
    check(beforeNote.shelfHidden === true && beforeNote.shelfGroup === false, 'и полка предметов после перезагрузки ещё спрятана');
  }
  const atNote = await reloadAt(NOTE_STEP); // бит «Это твой долг»: записка проступает
  check(atNote !== null, `перезагрузка вернула обучение на бит ${NOTE_STEP} «${STEPS[NOTE_STEP].id}»`);
  if (atNote) {
    check(atNote.note === true, 'на бите долга записка открывается и после перезагрузки (бит с openNote)');
    check(atNote.shelfHidden === true && atNote.shelfGroup === false, 'полка предметов тут ещё спрятана');
    await shot('tut-reload-debt-note.png');
  }
  const atPlaces = await reloadAt(PLACES_STEP); // бит «Это места под предметы»: полка открыта
  check(atPlaces !== null, `перезагрузка вернула обучение на бит ${PLACES_STEP} «${STEPS[PLACES_STEP].id}»`);
  if (atPlaces) {
    check(atPlaces.shelfHidden === false && atPlaces.shelfGroup === true, 'на бите мест под предметы полка открывается и после перезагрузки (бит места под предметы)');
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

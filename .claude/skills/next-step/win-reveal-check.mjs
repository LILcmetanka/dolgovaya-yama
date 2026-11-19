/**
 * Проверка поэтапного показа выигравших паттернов (DONTLIKE 19.11, «Улучшения» п.1) в headless Chrome.
 * Запуск: node .claude/skills/next-step/win-reveal-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимки и профиль Chrome — в scratchpad.
 * Порт 8772 свой, Chrome на 9337 — общий для сценариев next-step.
 *
 * Время в сценарии — игровое, а не по часам: в headless Chrome кадров мало (10–25 в секунду), а таймеры Phaser идут
 * по дельте кадра, поэтому 2,5 игровых секунды там длятся в разы дольше. Свои часы берём у самой сцены: копим дельту,
 * которую получает Clock (и не копим, пока сцена на паузе), — это ровно то время, в котором живут delayedCall.
 *
 * Что проверяет:
 *  - рамки НЕ копятся: на шаге i на сетке ровно столько клеток, сколько в паттерне i, клетки прошлого шага уже сняты
 *    (считаем рамки по вызовам strokeRoundedRect в графике сцены, а не по числу шагов);
 *  - рамка шага гаснет: alpha графики 1 в начале шага и уходит в ноль к его концу, последняя догорает за паузу hold;
 *  - звук на каждый паттерн и один итоговый: N коротких coin по шагам, win/bigWin — в конце каскада (в начале тишина);
 *  - число в окошке выплаты растёт по шагам, а не появляется разом: промежуточное меньше финального;
 *  - финальное окошко = potBefore + gain, где gain посчитан здесь независимо: цена символа × множитель паттерна × множитель серии;
 *  - 8 паттернов (сетка из одних 🍋) укладываются в 2,6 с от первой рамки до конца показа;
 *  - джекпот — ровно один шаг и 15 клеток в одной рамке;
 *  - пауза посреди показа замораживает его, в окошке стоит промежуточная сумма (а не финал), после снятия кон доначисляется ровно один раз (не дважды);
 *  - бесплатная прокрутка: свой короткий бюджет и без паузы перед итогом (короче платной на тех же 8 паттернах);
 *  - во время показа рычаг, «забрать» и кассета не срабатывают.
 *
 * Как делаются фиксированные сетки: у сцены на одну прокрутку подменяется g.rollGrid — прокрутка берёт готовую сетку,
 * а символы для неё берутся из самой игры (при постоянном Math.random spinGrid кладёт один и тот же настоящий SlotSymbol).
 * Выигрыш сценарий считает сам (цены символов — из игры, множители и клетки паттернов — из таблицы PATTERNS в src/game/patterns.ts,
 * которую читает при запуске), а не читает у сцены.
 *
 * Ещё проверяется ветка KABOOM: экран смерти посреди каскада не должен оставить сцену запертой (isSpinning снят).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node win-reveal-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const srv = spawn('python3', ['-m', 'http.server', '8772', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9337', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-reveal', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Паттерны — из самих PATTERNS (src/game/patterns.ts), а не копией в сценарии: копия тихо разошлась бы
 * с игрой после первой правки таблицы. Читаем файл рядом (сценарий лежит в .claude/skills/next-step) и берём
 * множитель и число клеток из строки «id: '…', multiplier: …, cells: […]» — этого хватает, чтобы посчитать
 * выигрыш и ожидаемое число рамок независимо от сцены. У джекпота cells — allCells(), это все 15 клеток.
 */
function patternTable() {
  const source = readFileSync(new URL('../../../src/game/patterns.ts', import.meta.url), 'utf8');
  const table = {};
  for (const match of source.matchAll(/\bid:\s*'([a-zA-Z0-9]+)',\s*multiplier:\s*([\d.]+),\s*cells:\s*(.+)$/gm)) {
    // В строке «cells: [[0, 0], [0, 1], [0, 2]]» квадратных скобок на одну больше, чем клеток: первая — сам массив.
    // У джекпота вместо массива allCells() — это все клетки сетки 5×3.
    const cells = match[3].includes('allCells()') ? 15 : (match[3].match(/\[/g) || []).length - 1;
    table[match[1]] = { multiplier: Number(match[2]), cells };
  }
  return table;
}
const PATTERNS = patternTable();
const cellsOf = (id) => PATTERNS[id].cells;
const multOf = (id) => PATTERNS[id].multiplier;
try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9337/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9337 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) pend.get(m.id)(m);
    // Ошибки страницы (необработанные исключения игры) печатаем: сценарий должен падать не молча.
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      console.log('page exception:', (d.exception && d.exception.description) || d.text);
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
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SP + '/' + name, Buffer.from(r.result.data, 'base64')); };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };
  /** Разобрать JSON-строку, которую вернула страница (null — если выражение упало). */
  const json = (text) => JSON.parse(text ?? 'null');
  check(Object.keys(PATTERNS).length === 14 && multOf('row3') === 1 && multOf('eye') === 10 && multOf('jackpot') === 100 && cellsOf('jackpot') === 15 && cellsOf('row3') === 3,
    `паттерны прочитаны из patterns.ts: ${Object.keys(PATTERNS).length} паттернов, джекпот ×${multOf('jackpot')} на ${cellsOf('jackpot')} клетках`);

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8772/' });
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(900);

  /**
   * Настоящие символы игры: при постоянном Math.random spinGrid кладёт в каждую клетку один и тот же символ,
   * поэтому перебором значения от 0 до 1 собираем все символы с их ценой. Состояние не трогаем (ржавчину снимаем).
   */
  const symbols = json(await val(`(() => {
    const g = window.__g;
    g.clearRust();
    const base = g.baseWeights(), wf = (s) => g.symbolWeight(s, base, false), orig = Math.random, map = {};
    try {
      for (let i = 1; i < 1000; i++) {
        const v = i / 1000;
        Math.random = () => v;
        const sym = g.rollGrid(wf, false, false)[0][0];
        map[sym.id] = sym; // настоящий SlotSymbol, а не копия: сетка собирается из них же
      }
    } finally { Math.random = orig; }
    window.__sym = map;
    return JSON.stringify(Object.fromEntries(Object.entries(map).map(([k, s]) => [k, { id: s.id, price: s.price, sign: s.sign }])));
  })()`));
  const HAVE = ['seven', 'diamond', 'lemon', 'bell', 'cherry'];
  check(symbols && HAVE.every((s) => symbols[s] && symbols[s].price > 0), 'символы игры найдены: ' + HAVE.map((s) => s + '=' + (symbols && symbols[s] && symbols[s].price)).join(', '));

  /**
   * Часы сценария — дельта, которую сцена отдаёт Clock (scene.events 'preupdate'): ровно в ней живут delayedCall.
   * Кадров в headless мало (9–20 в секунду), а дельта фиксированная, поэтому таймеры тут идут в разы медленнее
   * часов страницы: мерить показ по performance.now() — значит проверять не игру, а загрузку машины.
   *
   * Что подменяем и зачем:
   *  - screen.highlightWin — он получает ровно те паттерны, что зажигаются шагом: calls — шаги показа, perCall — клетки шага;
   *  - screen.cellHighlights.strokeRoundedRect / clear — рамки рисуются в одной графике сцены, поэтому считаем,
   *    сколько рамок на сетке СЕЙЧАС (а не сколько их нарисовали за каскад): именно это ловит накопление рамок;
   *  - sfx.play — вся последовательность звуков с игровым временем, чтобы увидеть «coin на каждый паттерн + итог»;
   *  - каждый кадр каскада — alpha графики рамок и число рамок на сетке (historия для проверки гашения).
   */
  await val(`(() => {
    const g = window.__g;
    window.__clock = 0;
    window.__hl = { calls: 0, cells: 0, firstAt: null, perCall: [] };
    window.__hist = [];
    window.__snd = [];
    window.__popups = [];
    const eff = g.effects, origPopupAt = eff.popupAt.bind(eff);
    eff.popupAt = (x, y, text, color, fontSize) => {
      const label = origPopupAt(x, y, text, color, fontSize);
      if (/^\\+\\d+$/.test(text)) window.__popups.push(label);
      return label;
    };
    const gfx = g.screen.cellHighlights;
    window.__gfx = { drawn: 0 };
    const origStroke = gfx.strokeRoundedRect.bind(gfx);
    gfx.strokeRoundedRect = (...args) => { window.__gfx.drawn += 1; return origStroke(...args); };
    const origClear = gfx.clear.bind(gfx);
    gfx.clear = (...args) => { window.__gfx.drawn = 0; return origClear(...args); };
    const origPlay = g.sfx.play.bind(g.sfx);
    g.sfx.play = (name, delay) => {
      window.__snd.push({ name, t: window.__hl.firstAt === null ? null : Math.round(window.__clock - window.__hl.firstAt) });
      return origPlay(name, delay);
    };
    // Clock подписан на 'update' сценой, своей ссылкой — подмена метода его не ловит; берём ту же дельту из 'preupdate'.
    g.events.on('preupdate', (time, delta) => {
      if (!g.time.paused) window.__clock += delta;
      const hl = window.__hl;
      if (hl.firstAt === null || !g.isSpinning) return; // кадры каскада, а не всей прокрутки
      window.__hist.push({ t: Math.round(window.__clock - hl.firstAt), alpha: Math.round(gfx.alpha * 100) / 100, drawn: window.__gfx.drawn });
    });
    const s = g.screen, origWin = s.highlightWin.bind(s);
    s.highlightWin = (hits) => {
      const h = window.__hl;
      h.calls += 1;
      const cells = hits.reduce((n, hit) => n + hit.cells.length, 0);
      h.cells += cells;
      h.perCall.push(cells);
      if (h.firstAt === null) h.firstAt = window.__clock;
      return origWin(hits);
    };
    /** Ждать игровые ms от первой рамки; дольше wallLimit по часам страницы — ошибка, а не вечное ожидание. */
    window.__at = (ms) => new Promise((resolve, reject) => {
      const started = performance.now();
      const step = () => {
        if (window.__hl.firstAt === null) {
          if (performance.now() - started > 30000) return reject(new Error('каскад так и не начался'));
          return requestAnimationFrame(step);
        }
        const left = window.__hl.firstAt + ms - window.__clock;
        if (left <= 0) resolve(Math.round(window.__clock - window.__hl.firstAt));
        else if (performance.now() - started > 60000) reject(new Error('показ не доехал до ' + ms + ' мс'));
        else requestAnimationFrame(step);
      };
      step();
    });
    /**
     * Снимок состояния через игровые ms после первой рамки — одним вызовом со страницы: между ожиданием
     * и чтением нет ни одного round-trip, иначе кадр-другой показа успевает пройти мимо проверки.
     * drawn — сколько рамок стоит на сетке сейчас, alpha — их прозрачность.
     */
    window.__snap = (ms) => (ms > 0 ? window.__at(ms) : Promise.resolve()).then(() => {
      const g = window.__g, h = window.__hl;
      return JSON.stringify({
        calls: h.calls, cells: h.cells, perCall: h.perCall, drawn: window.__gfx.drawn, alpha: Math.round(g.screen.cellHighlights.alpha * 100) / 100,
        pot: g.payout.pot, gamePot: g.pot, spinning: g.isSpinning,
        popups: window.__popups.filter((l) => l.active).length,
        popupText: window.__popups.filter((l) => l.active).map((l) => l.text).join(','),
        paused: g.isPaused, tape: g.tapeState, record: g.tapeRecord === null,
        spinsLeft: g.spinsLeft, spins: g.spinsThisRun,
      });
    });
    /** Снимок и пауза в одном шаге: между ними ничего не успевает зажечься. */
    window.__pauseAt = (ms) => window.__at(ms).then(() => {
      const g = window.__g;
      g.pauseGame();
      return JSON.stringify({ calls: window.__hl.calls, perCall: window.__hl.perCall, drawn: window.__gfx.drawn, pot: g.payout.pot, paused: g.isPaused });
    });
    /** Ждать, пока первая рамка зажжётся (игровое время первой рамки). */
    window.__waitStart = () => new Promise((resolve, reject) => {
      const started = performance.now();
      const step = () => {
        if (window.__hl.firstAt !== null) return resolve(window.__hl.firstAt);
        if (performance.now() - started > 30000) return reject(new Error('каскад так и не начался'));
        requestAnimationFrame(step);
      };
      step();
    });
    /** Ждать конца показа (isSpinning снят) и вернуть игровую длительность от первой рамки. */
    window.__measure = () => new Promise((resolve, reject) => {
      const started = performance.now();
      const step = () => {
        if (window.__hl.firstAt === null) {
          if (performance.now() - started > 30000) return reject(new Error('каскад так и не начался'));
          return requestAnimationFrame(step);
        }
        if (!window.__g.isSpinning) return resolve(Math.round(window.__clock - window.__hl.firstAt));
        if (performance.now() - started > 60000) return reject(new Error('показ не кончился'));
        requestAnimationFrame(step);
      };
      step();
    });
    /** Кадры каскада и звуки — одним вызовом: между ними ничего не успевает случиться. */
    window.__frames = () => JSON.stringify(window.__hist);
    window.__sounds = () => JSON.stringify(window.__snd);
    return 'patched';
  })()`);

  /** Сброс между сценариями: чистый кон, серия ×1, прокрутки есть, ржавчины, клевера и бесплатных нет. */
  await val(`window.__reset = (pot) => {
    const g = window.__g;
    g.pot = pot; g.streak = 0; g.spinsLeft = 20; g.freeSpins = 0; g.luckyClovers = 0;
    g.isBloodNext = false; g.diceDrought = 0; g.isDealing = false; g.isDealerClosing = false;
    g.clearRust();
    g.payout.showPot(pot, g.debt);
    window.__hl = { calls: 0, cells: 0, firstAt: null, perCall: [] };
    window.__hist = [];
    window.__snd = [];
    window.__popups = [];
    return JSON.stringify({ pot: g.pot, spinsLeft: g.spinsLeft, multiplier: g.multiplier(), debt: g.debt, machine: g.machineId, amulets: g.amuletIds(), pacts: g.pacts.length, spinning: g.isSpinning });
  }; 1`);

  /**
   * Прокрутка фиксированной сетки: g.rollGrid подменяется на одну прокрутку — сетка уходит в анимацию как обычная,
   * дальше всё как в игре (тот же roll, тот же finishSpin, тот же итог).
   */
  const spinGrid = async (cells, isFree = false) => {
    // Бесплатная прокрутка идёт своим путём (spinFree), но сетку берёт из того же rollGrid.
    const made = await val(`(() => {
      const g = window.__g;
      const grid = ${JSON.stringify(cells)}.map((row) => row.map((sid) => window.__sym[sid]));
      g.rollGrid = () => grid;
      ${isFree ? 'g.freeSpins = 1; g.spinFree();' : 'g.spin();'}
      delete g.rollGrid;
      return JSON.stringify({ spinning: g.isSpinning, spinsLeft: g.spinsLeft, pot: g.pot, free: g.isFreeSpinNow });
    })()`);
    return JSON.parse(made ?? 'null');
  };
  const waitStart = async (what) => check((await val('window.__waitStart()')) !== undefined, what);

  /**
   * Кадры каскада по шагам: на шаге i — свои клетки в рамках и alpha графики. Первый кадр окна мог быть снят
   * до delayedCall шага, поэтому «горящая» рамка видна в максимуме alpha, а гашение — в минимуме.
   * У последнего шага окно длиннее на паузу hold: его рамка догорает до самого итога.
   */
  const stepFrames = (hist, stepMs, count, hold) => Array.from({ length: count }, (_, i) => {
    const to = (i + 1) * stepMs + (i === count - 1 ? hold : 0);
    const inStep = hist.filter((f) => f.t >= i * stepMs && f.t < to);
    return {
      frames: inStep.length,
      maxAlpha: inStep.length ? Math.max(...inStep.map((f) => f.alpha)) : -1,
      minAlpha: inStep.length ? Math.min(...inStep.map((f) => f.alpha)) : 2,
      drawn: [...new Set(inStep.map((f) => f.drawn))],
    };
  });
  /** Звуки каскада в порядке вызова: coin/win/bigWin с игровым временем от первой рамки (null — до каскада). */
  const revealSounds = (snd) => snd.filter((s) => (s.name === 'coin' || s.name === 'win' || s.name === 'bigWin') && s.t !== null);

  // ---------- Сценарий 1: три паттерна, каскад рамок, гашение и звуки ----------
  console.log('--- сценарий 1: три паттерна');
  const GRID3 = [
    ['seven', 'seven', 'seven', 'bell', 'lemon'],
    ['seven', 'lemon', 'bell', 'bell', 'cherry'],
    ['bell', 'bell', 'bell', 'lemon', 'lemon'],
  ];
  // Независимый расчёт: row3 из 7 (25×1), row3 из 🔔 (9×1), диагональ вверх из 🔔 (9×1) — 43 до множителя.
  const HITS3 = [
    { pattern: 'row3', symbol: 'seven' },
    { pattern: 'row3', symbol: 'bell' },
    { pattern: 'diagonalUp', symbol: 'bell' },
  ];
  const STEP3 = 340; // шаг платного каскада на трёх паттернах (reveal.ts: WIN_REVEAL_STEP)
  const HOLD3 = 320; // пауза перед итогом (WIN_REVEAL_HOLD)
  const cells3 = HITS3.map((hit) => cellsOf(hit.pattern)); // 3 + 3 + 3 — по шагу, а не суммой на сетке
  const POT_BEFORE = 500;
  const tend3 = HITS3.reduce((sum, hit) => sum + symbols[hit.symbol].price * multOf(hit.pattern), 0);
  const before1 = json(await val(`window.__reset(${POT_BEFORE})`));
  const gain1 = Math.round(tend3 * before1.multiplier);
  const final1 = gain1 >= before1.debt / 2 ? 'bigWin' : 'win';
  console.log(`     potBefore=${before1.pot} multiplier=${before1.multiplier} win=${tend3} gain=${gain1} debt=${before1.debt}`);
  check(before1.machine === 'classic' && before1.amulets.length === 0 && before1.pacts === 0 && before1.multiplier === 1, 'чистые условия: классический автомат, без амулетов и сделок, серия ×1');
  const spin1 = await spinGrid(GRID3);
  check(spin1 && spin1.spinning === true, 'прокрутка пошла (isSpinning)');
  await waitStart('каскад начался: первая рамка зажглась');

  const early1 = json(await val('window.__snap(100)'));
  await shot('reveal-1.png');
  check(early1.calls === 1 && early1.drawn === cells3[0] && early1.cells === cells3[0], `через 0,1 с на сетке только первый паттерн: ${early1.calls} шаг, ${early1.drawn} клеток в рамке (row3)`);
  check(early1.alpha === 1, `через 0,1 с рамка зажглась целиком: alpha ${early1.alpha}`);
  check(early1.pot === POT_BEFORE + symbols.seven.price && early1.pot < POT_BEFORE + gain1, `через 0,1 с в окошке только первая доля: ${early1.pot} (итог ${POT_BEFORE + gain1})`);
  const d1 = symbols.seven.price * multOf('row3') * before1.multiplier;
  check(early1.popups === 1 && early1.popupText === '+' + d1, `через 0,1 с на сетке один попап шага: ${early1.popups} шт «${early1.popupText}» (ждали +${d1})`);

  const middle1 = json(await val('window.__snap(500)'));
  await shot('reveal-2.png');
  check(middle1.calls === 2 && middle1.drawn === cells3[1], `через 0,5 с горит только второй паттерн: ${middle1.calls} шага, ${middle1.drawn} клеток (а не ${cells3[0] + cells3[1]} суммой)`);
  check(middle1.pot === POT_BEFORE + Math.round((symbols.seven.price + symbols.bell.price) * before1.multiplier), `через 0,5 с в окошке ровно две доли: ${middle1.pot}`);
  check(middle1.pot < POT_BEFORE + gain1 && middle1.spinning === true, 'показ ещё идёт, окошко ещё не финальное');
  const d2 = Math.round((symbols.seven.price + symbols.bell.price) * before1.multiplier) - Math.round(symbols.seven.price * before1.multiplier);
  check(middle1.popups === 1 && middle1.popupText === '+' + d2, `через 0,5 с остался только попап второго шага: ${middle1.popups} шт «${middle1.popupText}» (ждали +${d2})`);

  const late1 = json(await val('window.__snap(1500)'));
  await shot('reveal-3.png');
  check(late1.calls === 3 && late1.perCall.join(',') === cells3.join(','), `три шага ровно по своим клеткам: ${late1.perCall.join(' + ')} = ${cells3.join(' + ')}`);
  check(late1.drawn === 0 && late1.alpha === 1, `после итога рамок на сетке нет: ${late1.drawn} рамок, alpha ${late1.alpha}`);
  check(late1.spinning === false, 'через 1,5 с показ кончился, ввод свободен');
  check(late1.pot === POT_BEFORE + gain1, `финальное окошко = potBefore + gain: ${late1.pot} = ${POT_BEFORE} + ${gain1}`);
  check(late1.gamePot === POT_BEFORE + gain1, `на кону ровно посчитанный выигрыш: ${late1.gamePot}`);
  check(late1.popups === 1 && late1.popupText === '+' + gain1, `после итога остался только попап суммы, шаговых нет: ${late1.popups} шт «${late1.popupText}» (ждали +${gain1})`);

  // Кадры каскада: рамка горит одна и гаснет к концу своего шага, в начале следующего — снова alpha 1.
  const frames1 = stepFrames(json(await val('window.__frames()')), STEP3, HITS3.length, HOLD3);
  check(frames1.every((f) => f.maxAlpha === 1), `каждый шаг зажигает рамку заново: alpha ${frames1.map((f) => f.maxAlpha).join(', ')}`);
  check(frames1.every((f, i) => f.drawn.length === 1 && f.drawn[0] === cells3[i]), `на шаге на сетке ровно клетки этого паттерна: ${frames1.map((f) => f.drawn.join('/')).join(', ')}`);
  check(frames1[0].minAlpha < 0.6 && frames1[1].minAlpha < 0.6, `к концу шага рамка гаснет: alpha ${frames1.slice(0, 2).map((f) => f.minAlpha).join(', ')} перед следующей`);
  check(frames1[2].minAlpha <= 0.2, `последняя рамка догорает за паузу hold почти в ноль: alpha ${frames1[2].minAlpha}`);

  // Звук: короткий coin на каждый паттерн и один итог в конце каскада — а не один звук на t0.
  const snd1 = revealSounds(json(await val('window.__sounds()')));
  check(snd1.map((s) => s.name).join(',') === ['coin', 'coin', 'coin', final1].join(','), `звуки каскада: coin на каждый паттерн и ${final1} в конце — ${snd1.map((s) => s.name + '@' + Math.round(s.t)).join(', ')}`);
  check(snd1.slice(0, 3).every((s, i) => Math.abs(s.t - i * STEP3) <= 150), `coin приходит на своём шаге: ${snd1.slice(0, 3).map((s) => Math.round(s.t)).join(', ')} мс при шаге ${STEP3}`);
  check(Math.abs(snd1[3].t - (3 * STEP3 + HOLD3)) <= 160, `итоговый звук — только после последней паузы: ${Math.round(snd1[3].t)} мс при ${3 * STEP3 + HOLD3}`);
  check(snd1.slice(0, 3).every((s) => s.name === 'coin'), 'в начале каскада тишина: win/bigWin не звучит до последнего паттерна');

  // ---------- Сценарий 2: восемь паттернов укладываются в 2,6 с ----------
  console.log('--- сценарий 2: восемь паттернов');
  const GRID8 = [
    ['cherry', 'cherry', 'lemon', 'diamond', 'seven'],
    ['lemon', 'lemon', 'lemon', 'lemon', 'lemon'],
    ['diamond', 'lemon', 'lemon', 'lemon', 'lemon'],
  ];
  // Независимый расчёт: row4 (×2), row5 (×3), столбец (×1), диагональ (×1), три квадрата (×2), зигзаг (×3) — всё из 🍋 (цена 6).
  const HITS8 = [
    { pattern: 'row4', symbol: 'lemon' },
    { pattern: 'row5', symbol: 'lemon' },
    { pattern: 'column', symbol: 'lemon' },
    { pattern: 'diagonalDown', symbol: 'lemon' },
    { pattern: 'square', symbol: 'lemon' },
    { pattern: 'square', symbol: 'lemon' },
    { pattern: 'square', symbol: 'lemon' },
    { pattern: 'zigzag', symbol: 'lemon' },
  ];
  const cells8 = HITS8.map((hit) => cellsOf(hit.pattern)); // 4+5+3+3+4+4+4+5
  const tend8 = HITS8.reduce((sum, hit) => sum + symbols[hit.symbol].price * multOf(hit.pattern), 0);
  const before2 = json(await val('window.__reset(0)'));
  const gain8 = Math.round(tend8 * before2.multiplier);
  const final8 = gain8 >= before2.debt / 2 ? 'bigWin' : 'win';
  console.log(`     win=${tend8} gain=${gain8} multiplier=${before2.multiplier}`);
  await spinGrid(GRID8);
  await waitStart('восемь паттернов: каскад начался');
  const duration8 = await val('window.__measure()');
  const end8 = json(await val('window.__snap(0)'));
  check(end8.calls === 8 && end8.perCall.join(',') === cells8.join(','), `восемь шагов по своим клеткам: ${end8.perCall.join(',')}`);
  check(end8.drawn === 0, `после восьми шагов сетка чистая: ${end8.drawn} рамок`);
  check(typeof duration8 === 'number' && duration8 <= 2600, `весь показ укладывается в 2,6 с: ${duration8} мс игрового времени`);
  check(end8.pot === gain8 && end8.spinning === false, `после показа в окошке весь выигрыш: ${end8.pot} = ${gain8}`);
  const snd8 = revealSounds(json(await val('window.__sounds()')));
  check(snd8.map((s) => s.name).join(',') === Array(8).fill('coin').concat(final8).join(','), `восемь coin по паттернам и один ${final8}: ${snd8.map((s) => s.name).join(', ')}`);

  // ---------- Сценарий 3: джекпот — один шаг на 15 клетках, кадр в момент гашения ----------
  console.log('--- сценарий 3: джекпот');
  const before3 = json(await val('window.__reset(0)'));
  const gain3 = Math.round(symbols.seven.price * multOf('jackpot') * before3.multiplier);
  await spinGrid(Array.from({ length: 3 }, () => ['seven', 'seven', 'seven', 'seven', 'seven']));
  await waitStart('джекпот: каскад начался');
  const midway3 = json(await val('window.__snap(120)'));
  check(midway3.calls === 1 && midway3.drawn === 15, `джекпот — одна рамка на 15 клеток: ${midway3.calls} шаг, ${midway3.drawn} клеток`);
  check(midway3.spinning === true, 'джекпот: на 0,1 с показ ещё идёт (пауза перед итогом)');
  // Кадр в момент гашения: рамка уже тает, но ещё видна (alpha ~0,5) — последняя рамка каскада догорает за hold.
  await val('window.__at(400)');
  const fadeShot = json(await val('window.__snap(0)'));
  await shot('reveal-fade.png');
  check(fadeShot.alpha > 0.05 && fadeShot.alpha < 0.95 && fadeShot.drawn === 15, `кадр гашения: alpha ${fadeShot.alpha} у ${fadeShot.drawn} клеток`);
  await val('window.__measure()');
  const jack = json(await val('window.__snap(0)'));
  check(jack.pot === gain3 && jack.gamePot === gain3, `джекпот выплачен целиком: ${jack.pot} = ${gain3}`);
  check(jack.spinning === false && jack.drawn === 0, 'джекпот: показ кончился, рамка снята');

  // ---------- Сценарий 4: пауза замораживает показ, кон доначисляется один раз ----------
  console.log('--- сценарий 4: пауза посреди показа');
  const gain4 = Math.round(tend3 * 1);
  // На паузе (400 мс — вторая рамка на 340, третья на 680) горит вторая фигура, и в окошке её доля, а не весь gain:
  // ровно то, что успело выйти. Если гвард revealShown сломан, refreshHud на паузе выдаст финальную сумму — тест упадёт.
  // Кон перед этим сценарием обнулён (__reset(0)), поэтому промежуточная сумма — просто доля двух первых паттернов.
  const interim4 = Math.round((symbols.seven.price + symbols.bell.price) * 1);
  const before4 = json(await val('window.__reset(0)'));
  await spinGrid(GRID3);
  await waitStart('пауза: каскад начался');
  const frozenBefore = json(await val('window.__pauseAt(400)'));
  check(frozenBefore.calls === 2 && frozenBefore.paused === true, `до паузы зажглись две фигуры: ${frozenBefore.calls} шага`);
  check(frozenBefore.drawn === cells3[1], `на паузе горит только вторая фигура: ${frozenBefore.drawn} клеток, а не ${cells3[0] + cells3[1]}`);
  check(frozenBefore.pot === interim4, `на паузе в окошке промежуточная сумма, а не финал: ${frozenBefore.pot} = ${interim4}`);
  check(interim4 < gain4, `промежуточная сумма меньше финальной: ${interim4} < ${gain4}`);
  // Гвард revealShown: любой refreshHud посреди каскада (снятие паузы, новость, смена языка) обязан вернуть
  // промежуточную сумму, а не финальный кон — иначе игрок увидит итог раньше последней рамки.
  const frozenRefresh = json(await val(`(() => {
    const g = window.__g;
    g.refreshHud();
    return JSON.stringify({ pot: g.payout.pot, gamePot: g.pot, paused: g.isPaused, spinning: g.isSpinning });
  })()`));
  check(frozenRefresh.pot === interim4 && frozenRefresh.gamePot === gain4, `refreshHud на паузе не выдаёт финал: в окошке ${frozenRefresh.pot}, на кону уже ${frozenRefresh.gamePot}`);
  await sleep(1200); // часы страницы идут, а игровые стоят: показ не должен сдвинуться
  const frozenAfter = json(await val('window.__snap(0)'));
  check(frozenAfter.paused === true, 'пауза включилась');
  check(frozenAfter.calls === frozenBefore.calls && frozenAfter.drawn === frozenBefore.drawn, `на паузе новые рамки не зажигаются: ${frozenAfter.calls} шага и ${frozenAfter.drawn} клеток было и осталось`);
  check(frozenAfter.pot === frozenBefore.pot && frozenAfter.pot === interim4, `на паузе число в окошке стоит и остаётся промежуточным: ${frozenAfter.pot}`);
  await val('window.__g.resumeGame(); 1');
  const afterResume = await val('window.__measure()');
  const done4 = json(await val('window.__snap(0)'));
  check(typeof afterResume === 'number', 'после снятия паузы показ доехал до конца');
  check(done4.calls === 3 && done4.perCall.join(',') === cells3.join(','), `после паузы остальные фигуры зажглись, лишних шагов нет: ${done4.perCall.join(' + ')}`);
  check(done4.gamePot === gain4 && done4.pot === gain4, `кон начислен один раз: ${done4.gamePot} = ${gain4}, в окошке ${done4.pot}`);
  await sleep(800);
  const later4 = json(await val('window.__snap(0)'));
  check(later4.gamePot === gain4 && later4.pot === gain4, `через 0,8 с после конца повторов нет: кон ${later4.gamePot}, окошко ${later4.pot}`);
  const snd4 = revealSounds(json(await val('window.__sounds()')));
  const final4 = gain4 >= before4.debt / 2 ? 'bigWin' : 'win';
  check(snd4.length === 4 && snd4.filter((s) => s.name === 'coin').length === 3 && snd4[3].name === final4, `на паузе звук не теряется: ${snd4.map((s) => s.name).join(', ')}`);

  // ---------- Сценарий 5: бесплатная прокрутка — свой, короткий показ и без паузы перед итогом ----------
  console.log('--- сценарий 5: бесплатная прокрутка');
  await val('window.__reset(0)');
  const spin5 = await spinGrid(GRID8, true);
  check(spin5 && spin5.free === true, 'бесплатная прокрутка пошла (isFreeSpinNow)');
  await waitStart('бесплатная: каскад начался');
  const duration5 = await val('window.__measure()');
  const end5free = json(await val('window.__snap(0)'));
  check(end5free.calls === 8 && end5free.perCall.join(',') === cells8.join(','), `бесплатная: те же восемь шагов по своим клеткам: ${end5free.perCall.join(',')}`);
  check(typeof duration5 === 'number' && duration5 <= 1200, `бесплатная укладывается в свой бюджет 1,1 с: ${duration5} мс игрового времени`);
  check(typeof duration8 === 'number' && duration5 < duration8, `бесплатная короче платной (${duration5} < ${duration8} мс) — паузы перед итогом нет`);
  check(end5free.pot === gain8 && end5free.spinning === false, `бесплатная: выигрыш в окошке целиком: ${end5free.pot} = ${gain8}`);
  check(end5free.drawn === 0, 'бесплатная: последняя рамка снята, сетка чистая');

  // ---------- Сценарий 6: во время показа рычаг, «забрать» и кассета не срабатывают ----------
  console.log('--- сценарий 6: ввод во время показа');
  await val(`window.__reset(${POT_BEFORE})`);
  await val("window.__g.tapeState = 'blank'; window.__g.tapeRecord = null; window.__g.refreshHud(); 1");
  const before6 = json(await val("JSON.stringify({ spinsLeft: window.__g.spinsLeft, spins: window.__g.spinsThisRun, pot: window.__g.pot, tape: window.__g.tapeState })"));
  const gain6 = Math.round(tend3 * 1);
  await spinGrid(GRID3);
  await waitStart('ввод: каскад начался');
  const during6 = json(await val(`window.__at(300).then(() => {
    const g = window.__g;
    g.spin(); g.take(); g.useTape(); // рычаг, «забрать» и кассета — прямо посреди показа
    return JSON.stringify({ spinsLeft: g.spinsLeft, spins: g.spinsThisRun, pot: g.pot, tape: g.tapeState, record: g.tapeRecord === null, spinning: g.isSpinning, drawn: window.__gfx.drawn });
  })`));
  check(during6.spinning === true, 'показ ещё идёт — нажатия не оборвали его');
  check(during6.spinsLeft === before6.spinsLeft - 1, `рычаг не крутит: прокруток ${during6.spinsLeft} (было ${before6.spinsLeft}, одну съела сама прокрутка)`);
  check(during6.spins === before6.spins + 1, `новая прокрутка не началась: за забег ${during6.spins} прокрутка`);
  // Кон начислен в t0, поэтому «забрать» был бы виден сразу: он обнулил бы кон.
  check(during6.pot === POT_BEFORE + gain6, `«забрать» не забрал: кон ${during6.pot} = ${POT_BEFORE} + ${gain6}`);
  check(during6.tape === 'blank' && during6.record === true, 'кассета не сработала: плёнка по-прежнему пустая');
  await val('window.__measure()');
  const end6 = json(await val('window.__snap(0)'));
  check(end6.gamePot === POT_BEFORE + gain6 && end6.pot === POT_BEFORE + gain6, `после показа выигрыш начислен как обычно: кон ${end6.pot}`);
  check(end6.tape === 'blank', 'кассета так и осталась пустой');

  // ---------- Сценарий 7: KABOOM посреди показа снимает ввод, а не запирает сцену ----------
  console.log('--- сценарий 7: KABOOM посреди показа');
  await val(`window.__reset(${POT_BEFORE})`);
  await spinGrid(GRID3);
  await waitStart('KABOOM: каскад начался');
  const kaboom7 = json(await val(`window.__at(300).then(() => {
    const g = window.__g;
    g.isGameOver = true; // экран смерти посреди каскада: его последний шаг придёт уже после
    return JSON.stringify({ spinning: g.isSpinning, shown: g.payout.pot });
  })`));
  check(kaboom7.spinning === true, 'KABOOM не обрывает показ раньше времени — шаги гаснут сами');
  await val('window.__measure()'); // конец показа: isSpinning снят
  const after7 = json(await val(`(() => {
    const g = window.__g;
    const out = JSON.stringify({ spinning: g.isSpinning, pot: g.payout.pot, gamePot: g.pot, over: g.isGameOver });
    g.isGameOver = false; // дальше сцена живёт обычно
    return out;
  })()`));
  check(after7.over === true && after7.spinning === false, 'после KABOOM isSpinning снят: сцена не заперта');
  check(after7.pot === after7.gamePot, `после KABOOM окошко снова показывает кон обычным путём: ${after7.pot}`);

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

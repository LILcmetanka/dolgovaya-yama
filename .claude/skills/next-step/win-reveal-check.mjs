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
 *  - рамка шага гаснет: alpha графики 1 в начале шага и уходит в ноль к его концу, последняя догорает за паузу hold.
 *    Замер гашения — отдельный заход по игровому времени (шаг 36): прежний порог «minAlpha по кадрам < 0,6» стоял ровно
 *    на границе и плавал (116/117). Теперь на время каскада сцена замедляется (timeScale 0,1 у Clock и TweenManager),
 *    поэтому кадров на шаг в разы больше, шаги режутся по записанным вызовам затухания (а не по расчётным окнам),
 *    а проверка сравнивает «до/после» с явным запасом: alpha 1 в начале шага и ≤ 0,35 на последнем кадре, который
 *    заведомо не раньше 3/4 затухания (на 3/4 кривая Quad.easeIn даёт 0,44, а без гашения там 1,0). Тайминги (задержка и длительность
 *    твина, включая паузу hold у последнего шага) сверяются с reveal.ts — шаг, доля затухания и пауза читаются
 *    из исходника, а не держатся числами в сценарии;
 *  - звук на каждый паттерн и один итоговый: N коротких coin по шагам, win/bigWin — в конце каскада (в начале тишина);
 *  - число в окошке выплаты растёт по шагам, а не появляется разом: промежуточное меньше финального;
 *  - финальное окошко = potBefore + gain, где gain посчитан здесь независимо: цена символа × множитель паттерна × множитель серии;
 *  - 8 паттернов (сетка из одних 🍋) укладываются в 2,6 с от первой рамки до конца показа;
 *  - джекпот — ровно один шаг и 15 клеток в одной рамке;
 *  - пауза посреди показа замораживает его, в окошке стоит промежуточная сумма (а не финал), после снятия кон доначисляется ровно один раз (не дважды);
 *  - бесплатная прокрутка: свой короткий бюджет и без паузы перед итогом (короче платной на тех же 8 паттернах);
 *  - во время показа рычаг, «забрать» и кассета не срабатывают;
 *  - KABOOM посреди показа снимает ввод, но не запирает сцену.
 *
 * Шаг 19: каскад сдвинул поток, и проверяется, что всё, что раньше шло сразу после прокрутки, идёт ПОСЛЕ последней рамки:
 *  - выигрыш + 🎲: пока идёт показ, Дилер ещё не пришёл (isDealing снят, карт на сукне нет) и звука dice нет; Дилер садится
 *    ровно в конце каскада (isDealing, карт = PACT_OFFER_COUNT), звук dice — после последней паузы каскада (по игровому
 *    времени), а отказ возвращает раунд в игру, не съев ни рамки, ни окошко;
 *  - выигрыш + 🕷: во время показа в окошке показанные доли, а кон на t0 = potBefore + gain (паук ещё не ел); укус
 *    считается независимо — по SPIDER_BITE из evil.ts и свежему кону — и приходится на конец каскада (звук spider там же);
 *  - смена языка (L, дважды — назад к исходному) посреди каскада: числа в окошке не меняются, каскад не сбрасывается,
 *    после конца кон финальный, язык исходный;
 *  - записанная кассета: во время каскада перемотка отклонена (deny, запись цела, кон не откачен), после каскада откат
 *    работает — сцена пересоздаётся, кон/прокрутки как на плёнке, кассету съел автомат. Этот сценарий последний:
 *    рестарт убивает старые хуки показа.
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
import { fileURLToPath } from 'node:url';
import './ts-resolve.mjs'; // тот же резолвер, что у симулятора: Node находит './reveal' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node win-reveal-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const srv = spawn('python3', ['-m', 'http.server', '8772', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9337', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-reveal', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Тайминги показа — из самого src/game/reveal.ts (шаг 36): длину шага считает revealStepMs, паузу перед итогом
 * и долю затухания отдаёт сам модуль. Копии чисел в сценарии больше нет: правка reveal.ts сразу видна проверке.
 * Модуль чистый (без Phaser), поэтому Node читает его через ts-resolve, как симулятор.
 */
const REVEAL = await import(fileURLToPath(new URL('../../../src/game/reveal.ts', import.meta.url)));
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
/**
 * Числа злых знаков — тоже из игры, а не копией: доля укуса паука лежит в src/game/evil.ts (SPIDER_BITE), число карт
 * Дилера — в src/game/dealerGame.ts (PACT_OFFER_COUNT). Иначе проверка держала бы в себе магическое 54 фишки.
 */
const SPIDER_BITE = Number(/SPIDER_BITE\s*=\s*([\d.]+)/.exec(readFileSync(new URL('../../../src/game/evil.ts', import.meta.url), 'utf8'))[1]);
const PACT_COUNT = Number(/PACT_OFFER_COUNT\s*=\s*(\d+)/.exec(readFileSync(new URL('../../../src/game/dealerGame.ts', import.meta.url), 'utf8'))[1]);
try {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9337/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9337 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  /** Необработанные исключения страницы: считаем их, чтобы откат кассетой проверялся не только по числам, но и по консоли. */
  const pageErrors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) pend.get(m.id)(m);
    // Ошибки страницы (необработанные исключения игры) печатаем: сценарий должен падать не молча.
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push((d.exception && d.exception.description) || d.text);
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
  check(SPIDER_BITE > 0 && SPIDER_BITE < 1 && PACT_COUNT >= 1,
    `числа злых знаков прочитаны из игры: SPIDER_BITE ${SPIDER_BITE} (evil.ts), карт у Дилера ${PACT_COUNT} (dealerGame.ts)`);

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
    // Часы сценария — дельта, которую получает Clock (и не копим, пока сцена на паузе), умноженная на его timeScale:
    // это ровно то время, в котором живут delayedCall, и оно же остаётся игровым при замедлении показа на шаге 36.
    g.events.on('preupdate', (time, delta) => {
      if (!g.time.paused) window.__clock += delta * g.time.timeScale;
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
      if (h.firstAt === null) {
        h.firstAt = window.__clock;
        // Замер гашения (шаг 36): __slowReveal замедляет каскад, чтобы на шаг пришлось в разы больше кадров.
        if (window.__slowReveal) {
          g.time.timeScale = window.__slowReveal;
          g.tweens.timeScale = window.__slowReveal;
        }
      }
      return origWin(hits);
    };
    /**
     * Затухание рамки: записываем, когда оно позвано и с какими таймингами. По этим записям шаги и режутся
     * на замер (рамка шага i гаснет от __fades[i] до __fades[i+1]), а сами числа сверяются с reveal.ts.
     */
    window.__fadeLog = [];
    const origFade = s.fadeWinHighlights.bind(s);
    s.fadeWinHighlights = (delay, duration) => {
      window.__fadeLog.push({ t: Math.round(window.__clock - (window.__hl.firstAt ?? window.__clock)), delay, duration });
      return origFade(delay, duration);
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
    window.__fades = () => JSON.stringify(window.__fadeLog ?? []);
    window.__sounds = () => JSON.stringify(window.__snd);
    /**
     * Ждать условие на странице по ИГРОВОМУ времени: expr — строка-предикат. Нужен там, где конец шага определяет
     * не таймер показа, а твин сцены (стол Дилера уезжает, пауза, фаза) — спать на удачу не приходится.
     * Предел 60 с по часам страницы — только страховка от вечного ожидания.
     */
    window.__waitFor = (expr, gameLimit = 5000) => new Promise((resolve, reject) => {
      const started = performance.now();
      const t0 = window.__clock;
      const fn = new Function('return (' + expr + ')');
      const step = () => {
        if (fn()) return resolve(Math.round(window.__clock - t0));
        if (window.__clock - t0 > gameLimit) return reject(new Error('не дождались по игровому времени: ' + expr));
        if (performance.now() - started > 60000) return reject(new Error('не дождались: ' + expr));
        requestAnimationFrame(step);
      };
      step();
    });
    /**
     * Ждать пересоздания сцены после отката кассетой. Phaser перезапускает ТОТ ЖЕ экземпляр сцены (shutdown → create),
     * поэтому «новая сцена» — это счётчик shutdown и новые части (create строит их заново), а не новый window.__g.
     * После create статус снова RUNNING (5) — по нему и понимаем, что игра готова.
     */
    window.__waitRestart = () => new Promise((resolve, reject) => {
      const started = performance.now();
      const step = () => {
        const g = window.__g;
        const running = g && g.sys && g.sys.settings && g.sys.settings.status === 5;
        if (window.__restartSeen === 1 && running) return resolve(true);
        if (performance.now() - started > 40000) return reject(new Error('сцена не перезапустилась'));
        requestAnimationFrame(step);
      };
      step();
    });
    /** Язык по постоянной надписи «ПАУЗА»/«PAUSE» (её relabel'ит toggleLanguage); резерв — золотая рамка RU/EN. */
    window.__lang = () => {
      const g = window.__g;
      const title = g.pauseScreen && g.pauseScreen.title && g.pauseScreen.title.text;
      if (title === 'ПАУЗА' || title === 'PAUSE') return title === 'ПАУЗА' ? 'ru' : 'en';
      const frames = g.settingsPanel && g.settingsPanel.languageFrames;
      if (frames) for (const [key, frame] of frames) if (frame.lineWidth === 3) return key;
      return '?';
    };
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
    window.__fadeLog = [];
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
  /**
   * Настоящий символ злого знака (🎲, 🕷): они открываются позже (раунды 4 и 6), поэтому в общий перебор из rollGrid
   * на первом раунде не попадают. Берём их тем же rollGrid с весом только на нужный id — это тот же объект SlotSymbol
   * игры (с ценой и знаком), а не копия.
   */
  const takeSym = async (id) => json(await val(`(() => {
    const g = window.__g;
    if (!window.__sym['${id}']) window.__sym['${id}'] = g.rollGrid((s) => (s.id === '${id}' ? 1 : 0), false, false)[0][0];
    const s = window.__sym['${id}'];
    return JSON.stringify({ id: s.id, price: s.price, sign: s.sign });
  })()`));
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
  const STEP3 = REVEAL.revealStepMs(HITS3.length, false); // шаг платного каскада на трёх паттернах (reveal.ts: revealStepMs)
  const HOLD3 = REVEAL.WIN_REVEAL_HOLD; // пауза перед итогом (WIN_REVEAL_HOLD)
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

  // ---------- Затухание рамки: замер по игровому времени, с замедлением сцены (шаг 36) ----------
  // Прежняя проверка «minAlpha по кадрам < 0,6» стояла ровно на границе и плавала (116/117, alpha ровно 0,60).
  // Здесь тот же каскад идёт при timeScale 0,1 у Clock и TweenManager: вдесятеро больше кадров на шаг, поэтому последний
  // кадр шага надёжно попадает в самую последнюю часть затухания. Шаги режутся не по расчётным окнам, а по записанным
  // вызовам fadeWinHighlights — сдвиг на пару игровых миллисекунд ничего не ломает. Проверка «до/после» с явным
  // запасом: в начале шага alpha 1, к концу — ≤ 0,35; на 3/4 кривой Quad.easeIn alpha = 1 − 0,75² = 0,44, а если
  // рамка не гаснет вовсе, там будет 1,0. Числа (шаг, пауза, доля затухания) — из src/game/reveal.ts.
  console.log('--- затухание: замер по игровому времени (timeScale 0,1)');
  const FADE = REVEAL.WIN_REVEAL_FADE_SHARE;
  const fadeMs = STEP3 * FADE;
  const fadeDelay = STEP3 - fadeMs;
  await val('window.__slowReveal = 0.1; 1');
  await val(`window.__reset(${POT_BEFORE})`);
  await spinGrid(GRID3);
  await waitStart('затухание: каскад начался');
  await val('window.__at(300)');
  await shot('reveal-fade-slow.png');
  await val('window.__measure()');
  await val('window.__g.time.timeScale = 1; window.__g.tweens.timeScale = 1; window.__slowReveal = null; 1');
  const fades = json(await val('window.__fades()'));
  const fadeHist = json(await val('window.__frames()'));
  const wantFades = HITS3.map((_, i) => ({ delay: fadeDelay, duration: fadeMs + (i === HITS3.length - 1 ? HOLD3 : 0) }));
  check(
    fades.length === HITS3.length && fades.every((f, i) => Math.abs(f.delay - wantFades[i].delay) < 0.01 && Math.abs(f.duration - wantFades[i].duration) < 0.01),
    `тушение идёт по таймингам reveal.ts: ${fades.map((f) => `${f.delay}+${f.duration}`).join(', ')} мс (шаг ${STEP3}, доля ${FADE}, hold ${HOLD3})`,
  );
  const fadeBins = fades.map((f, i) => {
    const to = i + 1 < fades.length ? fades[i + 1].t : Infinity;
    const inBin = fadeHist.filter((frame) => frame.t >= f.t && frame.t < to);
    const last = inBin[inBin.length - 1] ?? null;
    const u = last === null ? -1 : Math.min(1, Math.max(0, (last.t - f.t - f.delay) / f.duration));
    return { frames: inBin.length, max: inBin.length ? Math.max(...inBin.map((x) => x.alpha)) : -1, min: inBin.length ? Math.min(...inBin.map((x) => x.alpha)) : 2, last, u };
  });
  check(fadeBins.every((b) => b.frames >= 20), `замер плотный: кадров на шаг ${fadeBins.map((b) => b.frames).join(', ')} (замедление 0,1)`);
  check(fadeBins.every((b) => b.max === 1), `в начале шага рамка загорается целиком: alpha ${fadeBins.map((b) => b.max).join(', ')}`);
  check(fadeBins.every((b) => b.u >= 0.75), `последний кадр шага — не раньше 3/4 затухания: ${fadeBins.map((b) => b.u.toFixed(2)).join(', ')}`);
  check(fadeBins.every((b) => b.last !== null && b.last.alpha <= 0.35), `к концу шага рамка гаснет с запасом: alpha на последнем кадре ${fadeBins.map((b) => (b.last ? b.last.alpha : '—')).join(', ')} ≤ 0,35 (в начале 1,0)`);
  check(fadeBins[2].min <= 0.2, `последняя рамка догорает за паузу hold почти в ноль: alpha ${fadeBins[2].min}`);

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
  // Бюджет показа — тоже из reveal.ts: WIN_REVEAL_BUDGET на весь показ плюс пауза hold; +150 мс — допуск кадра замера.
  const budget8 = REVEAL.WIN_REVEAL_BUDGET + REVEAL.WIN_REVEAL_HOLD;
  check(typeof duration8 === 'number' && duration8 <= budget8 + 150, `весь показ укладывается в бюджет reveal.ts: ${duration8} мс при ${budget8} мс + кадр`);
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
  check(typeof duration5 === 'number' && duration5 <= REVEAL.WIN_REVEAL_FREE_BUDGET + 150, `бесплатная укладывается в свой бюджет reveal.ts: ${duration5} мс при ${REVEAL.WIN_REVEAL_FREE_BUDGET} мс + кадр`);
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

  // ---------- Сценарий 8: выигрыш + кубик 🎲 — Дилер садится только после каскада ----------
  console.log('--- сценарий 8: выигрыш + кубик 🎲');
  const diceSym = await takeSym('dice');
  check(diceSym && diceSym.id === 'dice' && diceSym.price === 0, `кубик взят из игры: ${diceSym && diceSym.sign} цена ${diceSym && diceSym.price} (не платит)`);
  const GRID_DICE = GRID3.map((row) => [...row]);
  GRID_DICE[0][4] = 'dice'; // кубик в клетке вне выигравших линий: те же три паттерна
  const before8 = json(await val(`window.__reset(${POT_BEFORE})`));
  const gainDice = Math.round(tend3 * before8.multiplier);
  await spinGrid(GRID_DICE);
  await waitStart('кубик: каскад начался');
  const during8 = json(await val(`window.__at(300).then(() => {
    const g = window.__g;
    return JSON.stringify({
      calls: window.__hl.calls, spinning: g.isSpinning, shown: g.payout.pot,
      dealing: g.isDealing, offer: Array.isArray(g.pactOffer) ? g.pactOffer.length : -1,
      dice: window.__snd.filter((s) => s.name === 'dice').length,
    });
  })`));
  check(during8.dealing === false && during8.offer === 0, `во время каскада Дилер ещё не пришёл: isDealing ${during8.dealing}, карт на сукне ${during8.offer}`);
  check(during8.dice === 0, `во время каскада звук dice не звучит: ${during8.dice} раз`);
  check(during8.spinning === true && during8.shown < POT_BEFORE + gainDice,
    `показ идёт своим ходом: ${during8.calls} шага, в окошке промежуточные ${during8.shown} (итог ${POT_BEFORE + gainDice})`);
  await val('window.__measure()');
  const end8d = json(await val(`(() => {
    const g = window.__g;
    return JSON.stringify({
      calls: window.__hl.calls, perCall: window.__hl.perCall, drawn: window.__gfx.drawn,
      spinning: g.isSpinning, dealing: g.isDealing, offer: Array.isArray(g.pactOffer) ? g.pactOffer.length : -1,
      shown: g.payout.pot, gamePot: g.pot,
    });
  })()`));
  check(end8d.calls === 3 && end8d.perCall.join(',') === cells3.join(',') && end8d.drawn === 0,
    `каскад доехал до финала, Дилер его не съел: ${end8d.perCall.join(' + ')}, рамок на сетке ${end8d.drawn}`);
  check(end8d.spinning === false && end8d.shown === POT_BEFORE + gainDice && end8d.gamePot === POT_BEFORE + gainDice,
    `после показа окошко и кон = potBefore + gain: ${end8d.shown} = ${POT_BEFORE} + ${gainDice}`);
  check(end8d.dealing === true && end8d.offer === PACT_COUNT,
    `Дилер пришёл только после каскада: isDealing ${end8d.dealing}, карт ${end8d.offer} (PACT_OFFER_COUNT = ${PACT_COUNT})`);
  const snd8d = json(await val('window.__sounds()'));
  const dice8 = snd8d.filter((s) => s.name === 'dice');
  const coin8 = snd8d.filter((s) => s.name === 'coin');
  const lastCoin8 = Math.max(...coin8.map((s) => s.t));
  check(dice8.length === 1 && coin8.length > 0 && dice8[0].t >= 3 * STEP3 + HOLD3 - 40 && dice8[0].t > lastCoin8,
    `звук dice — после последней паузы каскада: ${dice8.length} раз, ${dice8[0] ? Math.round(dice8[0].t) : '—'} мс при ${3 * STEP3 + HOLD3}, coin ${coin8.length} раз, последний ${coin8.length ? Math.round(lastCoin8) : '—'}`);
  const refused8 = json(await val(`(() => {
    const g = window.__g;
    g.refusePacts();
    return JSON.stringify({ closing: g.isDealerClosing, dealing: g.isDealing, pacts: g.pacts.length });
  })()`));
  check(refused8.closing === true && refused8.dealing === true && refused8.pacts === 0, 'отказ закрывает стол, а не раунд: isDealerClosing, сделок нет');
  const after8 = json(await val(`window.__waitFor('!window.__g.isDealing && !window.__g.isDealerClosing', 8000).then(() => {
    const g = window.__g;
    return JSON.stringify({ dealing: g.isDealing, offer: g.pactOffer.length, pacts: g.pacts.length, pot: g.pot, spinning: g.isSpinning, canAct: g.canAct(), spinsLeft: g.spinsLeft });
  })`));
  check(after8.dealing === false && after8.offer === 0 && after8.pacts === 0, `после отказа Дилер ушёл без сделки: карт ${after8.offer}, сделок ${after8.pacts}`);
  check(after8.pot === POT_BEFORE + gainDice && after8.spinning === false && after8.canAct === true,
    `раунд идёт дальше: кон ${after8.pot}, ввод свободен ${after8.canAct}, прокруток ${after8.spinsLeft}`);

  // ---------- Сценарий 9: выигрыш + паук 🕷 — укус тоже после каскада ----------
  console.log('--- сценарий 9: выигрыш + паук 🕷');
  const spiderSym = await takeSym('spider');
  check(spiderSym && spiderSym.id === 'spider' && spiderSym.price === 0, `паук взят из игры: ${spiderSym && spiderSym.sign} цена ${spiderSym && spiderSym.price}`);
  const GRID_SPIDER = GRID3.map((row) => [...row]);
  GRID_SPIDER[0][4] = 'spider'; // один паук вне выигравших линий
  const before9 = json(await val(`window.__reset(${POT_BEFORE})`));
  const gainSpider = Math.round(tend3 * before9.multiplier);
  const potWin9 = POT_BEFORE + gainSpider;
  const bite9 = Math.min(potWin9, Math.floor(potWin9 * SPIDER_BITE * 1)); // ровно spiderBite(pot, 1) из evil.ts
  await spinGrid(GRID_SPIDER);
  await waitStart('паук: каскад начался');
  const during9 = json(await val(`window.__at(500).then(() => {
    const g = window.__g;
    return JSON.stringify({
      calls: window.__hl.calls, shown: g.payout.pot, gamePot: g.pot,
      spider: window.__snd.filter((s) => s.name === 'spider').length, spinning: g.isSpinning,
    });
  })`));
  const shown9two = POT_BEFORE + Math.round((symbols.seven.price + symbols.bell.price) * before9.multiplier);
  check(during9.calls === 2 && during9.shown === shown9two,
    `во время каскада в окошке показанные доли без укуса: ${during9.shown} = ${shown9two}, а не ${potWin9 - bite9}`);
  check(during9.gamePot === potWin9, `на t0 кон = potBefore + gain, паук ещё не ел: ${during9.gamePot} = ${potWin9}`);
  check(during9.spider === 0 && during9.spinning === true, `во время каскада звук spider не звучит: ${during9.spider} раз`);
  await val('window.__measure()');
  const end9 = json(await val(`(() => {
    const g = window.__g;
    return JSON.stringify({ calls: window.__hl.calls, shown: g.payout.pot, gamePot: g.pot, spinning: g.isSpinning });
  })()`));
  check(end9.gamePot === potWin9 - bite9 && end9.shown === potWin9 - bite9,
    `после каскада паук съел ${bite9} (${Math.round(SPIDER_BITE * 100)}% кона): кон ${end9.gamePot} = ${potWin9} − ${bite9}, в окошке ${end9.shown}`);
  check(end9.calls === 3 && end9.spinning === false, `показ доехал до конца до укуса: ${end9.calls} шага, ввод свободен ${!end9.spinning}`);
  const snd9 = json(await val('window.__sounds()'));
  const spider9 = snd9.filter((s) => s.name === 'spider');
  check(spider9.length === 1 && spider9[0].t >= 3 * STEP3 + HOLD3 - 40,
    `звук spider — после последней паузы каскада: ${spider9.length} раз, ${spider9[0] ? Math.round(spider9[0].t) : '—'} мс при ${3 * STEP3 + HOLD3}`);

  // ---------- Сценарий 10: смена языка посреди каскада ----------
  console.log('--- сценарий 10: смена языка посреди каскада');
  const langBefore = json(await val("JSON.stringify({ lang: window.__lang(), store: localStorage.getItem('dolgovaya-yama-lang') })"));
  const beforeLang = json(await val(`window.__reset(${POT_BEFORE})`));
  const gainLang = Math.round(tend3 * beforeLang.multiplier);
  await spinGrid(GRID3);
  await waitStart('язык: каскад начался');
  const during10 = json(await val(`window.__at(400).then(() => {
    const g = window.__g;
    const shown = g.payout.pot, pot = g.pot, calls = window.__hl.calls;
    g.toggleLanguage(); // RU → EN посреди каскада
    const first = { lang: window.__lang(), shown: g.payout.pot, pot: g.pot, calls: window.__hl.calls, spinning: g.isSpinning };
    g.toggleLanguage(); // и назад, к исходному
    const second = { lang: window.__lang(), shown: g.payout.pot, pot: g.pot, calls: window.__hl.calls, spinning: g.isSpinning };
    return JSON.stringify({ shown, pot, calls, first, second });
  })`));
  check(during10.first.lang !== langBefore.lang && (during10.first.lang === 'ru' || during10.first.lang === 'en'),
    `первое нажатие сменило язык: ${langBefore.lang} → ${during10.first.lang}`);
  check(during10.second.lang === langBefore.lang, `второе вернуло исходный язык: ${during10.second.lang} = ${langBefore.lang}`);
  check(during10.second.shown === during10.shown && during10.second.pot === during10.pot,
    `смена языка не тронула числа: в окошке ${during10.second.shown} (было ${during10.shown}), кон ${during10.second.pot}`);
  check(during10.second.spinning === true && during10.second.calls === during10.calls,
    `каскад не сброшен: шагов ${during10.second.calls} (было ${during10.calls}), показ идёт ${during10.second.spinning}`);
  check(during10.second.shown < POT_BEFORE + gainLang, `в окошке по-прежнему промежуточная сумма: ${during10.second.shown} < ${POT_BEFORE + gainLang}`);
  await val('window.__measure()');
  const end10 = json(await val(`(() => {
    const g = window.__g;
    return JSON.stringify({ calls: window.__hl.calls, perCall: window.__hl.perCall, shown: g.payout.pot, gamePot: g.pot, spinning: g.isSpinning, lang: window.__lang() });
  })()`));
  check(end10.calls === 3 && end10.perCall.join(',') === cells3.join(',') && end10.spinning === false,
    `после смены языка каскад дошёл как обычно: ${end10.perCall.join(' + ')}, ввод свободен ${!end10.spinning}`);
  check(end10.shown === POT_BEFORE + gainLang && end10.gamePot === POT_BEFORE + gainLang,
    `финальный кон после смены языка: ${end10.shown} = ${POT_BEFORE} + ${gainLang}`);
  check(end10.lang === langBefore.lang, `язык к концу сценария исходный: ${end10.lang}`);
  // toggleLang пишет выбор в localStorage — возвращаем хранилище как было (сам язык уже исходный).
  await val(`(() => { const raw = ${JSON.stringify(langBefore.store)}; if (raw === null) localStorage.removeItem('dolgovaya-yama-lang'); else localStorage.setItem('dolgovaya-yama-lang', raw); return 'ok'; })()`);

  // ---------- Сценарий 11: кассета посреди каскада и откат после него (последний: рестарт убивает хуки показа) ----------
  console.log('--- сценарий 11: кассета посреди каскада и откат после него');
  const errorsBefore11 = pageErrors.length;
  await val(`window.__reset(${POT_BEFORE})`);
  check((await val("window.__waitFor('!window.__g.isSpinning && !window.__g.isDealing && !window.__g.isRewinding', 4000)")) !== undefined,
    'сцена перед кассетой успокоилась: каскад, стол Дилера и перемотка закончились (иначе recordTape() упадёт)');
  const rec11 = json(await val(`(() => {
    const g = window.__g;
    g.tapeState = 'blank'; g.tapeRecord = null; g.refreshHud();
    g.recordTape();
    const rec = g.tapeRecord;
    return JSON.stringify({ tape: g.tapeState, saved: rec !== null, pot: rec && rec.pot, spinsLeft: rec && rec.spinsLeft, round: rec && rec.round, streak: rec && rec.streak });
  })()`));
  check(rec11.tape === 'recorded' && rec11.saved === true && rec11.pot === POT_BEFORE,
    `кассета записана в чистом состоянии: ${rec11.tape}, на плёнке кон ${rec11.pot}, прокруток ${rec11.spinsLeft}`);
  const gainTape = Math.round(tend3 * 1);
  await spinGrid(GRID3);
  await waitStart('кассета: каскад начался');
  const during11 = json(await val(`window.__at(300).then(() => {
    const g = window.__g;
    g.useTape(); // записанная кассета — посреди показа
    return JSON.stringify({
      tape: g.tapeState, rewinding: g.isRewinding, spinning: g.isSpinning, pot: g.pot,
      saved: g.tapeRecord !== null, deny: window.__snd.filter((s) => s.name === 'deny').length,
    });
  })`));
  check(during11.tape === 'recorded' && during11.rewinding === false && during11.saved === true,
    `перемотка посреди каскада отклонена: кассета ${during11.tape}, isRewinding ${during11.rewinding}, запись цела ${during11.saved}`);
  check(during11.deny === 1, `на отказ кассета ответила deny: ${during11.deny} раз`);
  check(during11.spinning === true && during11.pot === POT_BEFORE + gainTape,
    `показ не откачен: isSpinning ${during11.spinning}, кон ${during11.pot} = ${POT_BEFORE} + ${gainTape}`);
  await val('window.__measure()');
  const end11 = json(await val(`(() => {
    const g = window.__g;
    return JSON.stringify({ shown: g.payout.pot, gamePot: g.pot, tape: g.tapeState, spinning: g.isSpinning });
  })()`));
  check(end11.shown === POT_BEFORE + gainTape && end11.spinning === false && end11.tape === 'recorded',
    `после каскада кон финальный, кассета цела: окошко ${end11.shown}, ${end11.tape}`);
  // Откат после конца показа. Phaser перезапускает тот же экземпляр сцены (shutdown → create), поэтому «новая сцена» —
  // это счётчик shutdown и заново построенные части, а не новый объект window.__g. Старые хуки (__hl, __snap) после
  // рестарта недействительны: дальше читаем только поля через window.__g.
  const started11 = json(await val(`(() => {
    const g = window.__g;
    window.__oldG = g; window.__oldScreen = g.screen; window.__restartSeen = 0;
    g.events.once('shutdown', () => { window.__restartSeen += 1; });
    g.useTape();
    return JSON.stringify({ rewinding: g.isRewinding, tape: g.tapeState });
  })()`));
  check(started11.rewinding === true, `после каскада откат пошёл: isRewinding ${started11.rewinding}`);
  check((await val('window.__waitRestart()')) === true, 'сцена перезапустилась после отката');
  const after11 = json(await val(`(() => {
    const g = window.__g;
    return JSON.stringify({
      restarted: window.__restartSeen, freshParts: g.screen !== window.__oldScreen,
      pot: g.pot, spinsLeft: g.spinsLeft, round: g.round, streak: g.streak,
      tape: g.tapeState, record: g.tapeRecord === null, spinning: g.isSpinning, rewinding: g.isRewinding, shown: g.payout.pot,
    });
  })()`));
  check(after11.restarted === 1 && after11.freshParts === true,
    `сцена действительно пересоздана: shutdown ${after11.restarted} раз, части новые ${after11.freshParts}`);
  check(after11.pot === rec11.pot && after11.spinsLeft === rec11.spinsLeft && after11.round === rec11.round && after11.streak === rec11.streak,
    `кон, прокрутки, раунд и серия — как на записи: кон ${after11.pot}, прокруток ${after11.spinsLeft}, раунд ${after11.round}, серия ${after11.streak}`);
  check(after11.tape === 'forSale' && after11.record === true,
    `кассету съел автомат: состояние ${after11.tape}, записи нет ${after11.record}`);
  check(after11.spinning === false && after11.rewinding === false && after11.shown === after11.pot,
    `после отката сцена не заперта: isSpinning ${after11.spinning}, окошко ${after11.shown} = кон ${after11.pot}`);
  check(pageErrors.length === errorsBefore11, `исключений страницы за сценарий кассеты нет: ${pageErrors.length - errorsBefore11}`);

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

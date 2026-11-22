/**
 * Проверка раунда спасения (шаг 27) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/rescue-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»).
 * Снимки — в /tmp/opencode/step27, профиль Chrome — в scratchpad.
 * Порты — свои: http 8773, отладка Chrome 9340 (8772/9339 у last-chance-check, 8771/9338 и другие — у прочих).
 *
 * Что проверяет:
 *  1) вход в спасение: isRescue, 5 прокруток, полоса без кнопок, тексты RU;
 *  2) красный режим: огни автомата красные, красная плёнка и свечение по краям проявились,
 *     амулеты и предметы притушены;
 *  3) прокрутка уменьшает счётчик, после неё открыт выбор столбца;
 *  4) клик по столбцу морозит его, второй столбец в том же ходу не морозится,
 *     замороженный столбец не прокручивается (символы те же), разморозка возвращает столбец в игру;
 *  5) пять прокруток без паттерна — смерть: KABOOM, isRescue снят, красный режим погас;
 *     с запасом «второго дыхания» — не смерть: попап rescueSecondWind, забег жив, магазин, счёт раунда на месте;
 *  6) паттерн — выжил: магазин открыт, счёт раунда +1, долг нового раунда — по кривой (debtForRound), красный режим погас;
 *  7) тексты RU/EN и раскладка 1280×720 / 390×844: строки полосы внутри неё.
 * Выбранный замером режим долга — curve: следующий долг считается от номера раунда, а не замирает.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node rescue-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
const SHOTS = '/tmp/opencode/step27';
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

/** Сетка без паттернов: у каждой клетки свой платящий символ, совпадений нет. */
const BLANK_ALL = `(() => {
  const g = window.__g;
  const cell = (i) => ({ id: 'blank' + i, sign: '·', color: 0, weight: 0, price: 1, unlockRound: 1 });
  g.rescueGrid = Array.from({ length: 3 }, (_, r) => Array.from({ length: 5 }, (_, c) => cell(r * 5 + c)));
  return 1;
})()`;
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

  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g, bar = g.rescueBar;
    const b = (o) => { const r = o.getBounds(); return { x: Math.round(r.x), y: Math.round(r.y), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    return JSON.stringify({
      isRescue: g.isRescue, spinsLeft: g.rescueSpinsLeft, freezeUsed: g.rescueFreezeUsed,
      frozen: [...g.frozenColumns], pickMode: g.screen.pickMode ?? null,
      grid: g.rescueGrid ? g.rescueGrid.map((row) => row.map((symbol) => symbol.id).join('|')).join('/') : null,
      redWash: g.atmosphere.redWash.alpha, redVignette: g.atmosphere.redVignette.alpha,
      lampColor: g.screen.lampColor, itemAlpha: g.itemShelf.items[0].alpha, amuletAlpha: g.amuletRack.badges[0].alpha,
      title: bar.titleText.text, spinsText: bar.spinsText.text, goalText: bar.goalText.text,
      debtText: bar.debtText.text, hint: bar.hintText.text,
      hasButtons: bar.buttons !== undefined, band: b(bar.band),
      titleBox: b(bar.titleText), spinsBox: b(bar.spinsText), goalBox: b(bar.goalText),
      debtBox: b(bar.debtText), hintBox: b(bar.hintText),
      debt: g.debt, round: g.round, shop: g.isShopOpen, gameOver: g.isGameOver,
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
  /** Открыть спасение напрямую: живой путь через Коллектора и GOOD LUCK длинный, правила те же. */
  const openRescue = async (debt = 1000, balance = 0, round = 1) => {
    await val(`(() => {
      const g = window.__g;
      g.finishTutorial(); g.isGameOver = false; g.isRescueWinPending = false; g.pacts = [];
      g.secondWindLeft = 1; g.debt = ${debt}; g.balance = ${balance}; g.round = ${round};
      g.startRescue(); return 1;
    })()`);
    await sleep(800); // красный режим проявляется за 400 мс
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
  const layoutOk = (s) => {
    const inside = (box) => box.x >= s.band.x && box.right <= s.band.right && box.y >= s.band.y && box.bottom <= s.band.bottom;
    return !s.hasButtons && inside(s.titleBox) && inside(s.spinsBox) && inside(s.goalBox) && inside(s.debtBox) && inside(s.hintBox);
  };

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
  await sleep(500); // красный режим проявляется
  check(liveEntry, 'живой вход: банкомат уехал с GOOD LUCK — началось спасение');
  check((await state()).redWash > 0.1, 'живой вход: красный режим включился');
  await reload();
  const clean = await state();
  check(clean.isRescue === false && clean.redWash === 0, 'перезапуск сцены («ЗАНОВО») снимает спасение и красный цвет');

  // ---------- Русский, 1280×720: вход и красный режим ----------
  await openRescue(1000, 0, 1);
  const s1 = await state();
  check(s1.isRescue === true, 'спасение идёт: isRescue');
  check(s1.spinsLeft === 5, 'на входе 5 прокруток (их ' + s1.spinsLeft + ')');
  check(s1.title === 'СПАСЕНИЕ', 'RU: название режима: ' + JSON.stringify(s1.title));
  check(s1.spinsText === 'ОСТАЛОСЬ ПРОКРУТОК: 5', 'RU: счётчик прокруток: ' + JSON.stringify(s1.spinsText));
  check(s1.goalText === 'СОБЕРИ ПАТТЕРН', 'RU: цель: ' + JSON.stringify(s1.goalText));
  check(s1.debtText === 'ДОЛГ ОСТАЁТСЯ', 'RU: строка долга: ' + JSON.stringify(s1.debtText));
  check(/Клик по столбцу/.test(s1.hint), 'RU: подсказка про заморозку: ' + JSON.stringify(s1.hint));
  check(s1.hasButtons === false, 'на полосе нет кнопок (старая докупка и клавиша 5 не остались)');
  check((await val('window.__g.canRewind()')) === false, 'в спасении откат кассетой закрыт: счёт и долг не откатить');
  check(s1.redWash > 0.1, 'красная плёнка на весь вид (alpha ' + s1.redWash.toFixed(2) + ')');
  check(s1.redVignette > 0.4, 'красное свечение по краям (alpha ' + s1.redVignette.toFixed(2) + ')');
  check(s1.lampColor === 0xef4444, 'бегущие огни автомата красные (' + s1.lampColor + ')');
  check(Math.abs(s1.itemAlpha - 0.35) < 0.02, 'предметы на полке притушены (alpha ' + s1.itemAlpha.toFixed(2) + ')');
  check(Math.abs(s1.amuletAlpha - 0.35) < 0.02, 'амулеты притушены (alpha ' + s1.amuletAlpha.toFixed(2) + ')');
  check(layoutOk(s1), '1280×720: строки полосы внутри неё');
  await moveAway();
  await shot('rescue-ru-1280-red.png');

  // ---------- Прокрутка и заморозка столбца ----------
  await spin(blankExcept(2));
  const s2 = await state();
  check(s2.spinsLeft === 4, 'первая прокрутка: осталось 4 (их ' + s2.spinsLeft + ')');
  check(s2.pickMode === 'column', 'после прокрутки открыт выбор столбца (pickMode ' + s2.pickMode + ')');
  check(s2.spinsText === 'ОСТАЛОСЬ ПРОКРУТОК: 4', 'полоса показывает остаток 4: ' + JSON.stringify(s2.spinsText));
  const frozenBefore = s2.grid ? s2.grid.split('/').map((row) => row.split('|')[2]).join('|') : null;
  await clickColumn(2);
  const s3 = await state();
  check(JSON.stringify(s3.frozen) === '[2]', 'клик по столбцу 2 заморозил его: ' + JSON.stringify(s3.frozen));
  check(s3.frames[2] === true, 'лёд виден на столбце 2');
  check(s3.freezeUsed === true, 'заморозка потратила ход');
  check(s3.pickMode === null, 'после заморозки выбор столбца закрыт: второе действие за ход нельзя');
  check(/использована/.test(s3.hint), 'подсказка говорит, что заморозка использована: ' + JSON.stringify(s3.hint));
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
  await clickColumn(2);
  const s6 = await state();
  check(s6.frozen.length === 0, 'клик по столбцу 2 разморозил его: ' + JSON.stringify(s6.frozen));
  check(s6.frames[2] === false, 'лёд со столбца 2 снят');
  check(s6.freezeUsed === true, 'разморозка тоже потратила ход');

  // ---------- Пять прокруток без паттерна — смерть ----------
  await val('window.__g.secondWindLeft = 0; 1');
  await spin(BLANK_KEEP_FROZEN); // осталось 2
  check((await state()).spinsLeft === 2, 'третья прокрутка: осталось 2');
  await spin(BLANK_KEEP_FROZEN); // осталось 1
  check((await state()).spinsLeft === 1, 'четвёртая прокрутка: осталось 1');
  await spin(BLANK_KEEP_FROZEN, 2200); // осталось 0 — провал и KABOOM
  const dead = await state();
  check(dead.spinsLeft === 0, 'пятая прокрутка: осталось 0');
  check(dead.isRescue === false, 'провал закрыл спасение (isRescue снят)');
  check(dead.gameOver === true, 'без паттерна — смерть: isGameOver');
  check(dead.redWash < 0.02, 'красная плёнка погасла после смерти (alpha ' + dead.redWash.toFixed(2) + ')');
  await moveAway();
  await shot('rescue-ru-1280-dead.png');

  // ---------- Второе дыхание: провал прощён, вместо смерти — магазин ----------
  await reload();
  await openRescue(3000, 50, 3);
  await val('window.__g.secondWindLeft = 1; 1'); // запас есть: первый провал спасения не убивает
  for (let i = 0; i < 4; i++) await spin(BLANK_KEEP_FROZEN); // осталось 1
  check((await state()).spinsLeft === 1, 'второе дыхание: перед последней прокруткой остался 1');
  await spin(BLANK_KEEP_FROZEN, 50); // пятая — провал, но с запасом
  const popupSeen = await val(`(() => window.__g.children.list.some((o) => typeof o.text === 'string' && o.text === 'ВТОРОЕ ДЫХАНИЕ'))()`);
  check(popupSeen === true, 'провал с запасом: попап «ВТОРОЕ ДЫХАНИЕ» на экране');
  await sleep(500); // плёнка гаснет за 400 мс — даём ей погаснуть
  const sw = await state();
  check(sw.isRescue === false, 'второе дыхание закрыло спасение (isRescue снят)');
  check(sw.gameOver === false, 'второе дыхание: забег жив (isGameOver не встал)');
  check(sw.redWash < 0.02, 'второе дыхание погасило красную плёнку (alpha ' + sw.redWash.toFixed(2) + ')');
  await sleep(1300); // пауза «второго дыхания» 1,2 с от провала → магазин
  const swShop = await state();
  check(swShop.shop === true, 'после второго дыхания открыт магазин');
  check(swShop.round === 3, 'счёт раунда не вырос: 3 → ' + swShop.round);
  await moveAway();
  await shot('rescue-ru-1280-second-wind.png');

  // ---------- Паттерн — выжил, долг идёт по кривой ----------
  await reload();
  await openRescue(7000, 100, 4);
  const beforeWin = await state();
  check(beforeWin.debt === 7000 && beforeWin.round === 4, 'подготовка победы: долг 7000, раунд 4');
  await val(`window.__g.spin(); ${WIN_ALL}`);
  await sleep(3400); // прокрутка ~1,1 с + пауза победы 1,2 с + панель магазина
  const won = await state();
  check(won.isRescue === false, 'паттерн закрыл спасение');
  check(won.shop === true, 'после победы открыт магазин');
  check(won.round === 5, 'счёт раунда идёт вперёд: 4 → ' + won.round);
  check(won.debt === 25190, 'долг нового раунда по кривой: debtForRound(5) = 25190 (стало ' + won.debt + ')');
  check(won.redWash < 0.02, 'красная плёнка погасла после победы (alpha ' + won.redWash.toFixed(2) + ')');
  check(won.lampColor !== 0xef4444, 'огни автомата вернулись к обычному цвету (' + won.lampColor + ')');
  check(Math.abs(won.itemAlpha - 1) < 0.02, 'предметы снова видны (alpha ' + won.itemAlpha.toFixed(2) + ')');
  await moveAway();
  await shot('rescue-ru-1280-win.png');

  // ---------- 390×844 ----------
  await reload();
  await openRescue(1000, 0, 1);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const s390 = await state();
  check(layoutOk(s390), '390×844: строки полосы внутри неё');
  check(s390.title === 'СПАСЕНИЕ' && s390.spinsText === 'ОСТАЛОСЬ ПРОКРУТОК: 5', '390×844: тексты те же');
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
  await openRescue(1000, 0, 1);
  const en = await state();
  check(en.title === 'RESCUE', 'EN: название режима: ' + JSON.stringify(en.title));
  check(en.spinsText === 'SPINS LEFT: 5', 'EN: счётчик прокруток: ' + JSON.stringify(en.spinsText));
  check(en.goalText === 'LAND A PATTERN', 'EN: цель: ' + JSON.stringify(en.goalText));
  check(en.debtText === 'THE DEBT STAYS', 'EN: строка долга: ' + JSON.stringify(en.debtText));
  check(/Click a column/.test(en.hint), 'EN: подсказка про заморозку: ' + JSON.stringify(en.hint));
  check(layoutOk(en), 'EN 1280×720: строки полосы внутри неё');
  await moveAway();
  await shot('rescue-en-1280.png');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const en390 = await state();
  check(layoutOk(en390), 'EN 390×844: строки полосы внутри неё');
  await moveAway();
  await shot('rescue-en-390x844.png');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally {
  chrome.kill();
  srv.kill();
}

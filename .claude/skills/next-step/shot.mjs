// Сценарий Дилера (шаг 9): сукно с тремя картами-сделками, клик по карте, отказ.
// Нужна сборка с хуком window.__g: bash .claude/skills/next-step/hookbuild.sh <scratchpad> .
// Запуск из scratchpad: node shot.mjs <scratchpad>   (снимки и prof ложатся в <scratchpad>)
//
// Что проверяет:
//  1) startDealerGame кладёт на сукно три разные карты из dealerGame.PACTS и держит ввод закрытым (isDealing);
//  2) клик по карте берёт сделку: она ложится в pacts, «+1 билет» приходит на табло, стол уходит;
//  3) действующую сделку второй раз взять нельзя (стол остаётся), а «✕ ОТКАЗАТЬСЯ» закрывает стол без сделки.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SP = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8766', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9333', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let tabs;
  for (let i = 0; i < 30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SP + '/' + name, Buffer.from(r.result.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8766/' });
  await sleep(3000);
  console.log('hook', JSON.stringify((await ev('typeof window.__g')).result));
  const val = async (e) => (await ev(e)).result.value;
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  // Экранная точка объекта в единицах раскладки: камера увеличивает вид, canvas растянут до окна (rect.width / 1920).
  const pointOf = async (expr) => JSON.parse(await val(`(() => {
    const g = window.__g, cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    const o = ${expr};
    return JSON.stringify({ x: r.left + (o.x - cam.scrollX) * cam.zoom * k, y: r.top + (o.y - cam.scrollY) * cam.zoom * k });
  })()`));
  const click = async (pt) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await sleep(150);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  };
  // Стол Дилера: колбэк startDealerGame считает, сколько раз раунд продолжился.
  const openTable = async () => {
    await ev('window.__g.pot = 40; window.__done = 0; window.__g.startDealerGame(() => { window.__done = (window.__done || 0) + 1; }); 1');
    await sleep(900);
  };
  const state = async () => JSON.parse(await val(`JSON.stringify({
    dealing: window.__g.isDealing,
    done: window.__done || 0,
    offer: (window.__g.pactOffer || []).map((pact) => pact.id),
    pacts: (window.__g.pacts || []).map((pact) => pact.id + '@' + pact.untilRound),
    tickets: window.__g.tickets,
    round: window.__g.round,
  })`));
  const refuseTable = async () => {
    await click(await pointOf('g.dealerTable.refuse'));
    await sleep(1200);
  };

  // A: три карты на сукне, ввод закрыт.
  await openTable();
  let st = await state();
  await shot('dealer-table.png');
  check(st.dealing && st.offer.length === 3 && new Set(st.offer).size === 3, 'на сукне три разные сделки: ' + st.offer.join(', '));
  check(st.pacts.length === 0 && st.done === 0, 'до клика сделок нет, раунд ждёт');

  // B: клик по карте «tickets-shop» (или по первой, если её нет): сделка ложится в кассету, билет приходит на табло.
  // Карту «выбранный символ» (№11) здесь не берём: она сначала просит символ — это отдельная проверка E.
  const nonSymbol = st.offer.findIndex((id) => id !== 'symbol-weight');
  const index = st.offer.includes('tickets-shop') ? st.offer.indexOf('tickets-shop') : Math.max(0, nonSymbol);
  const takenId = st.offer[index];
  const ticketsBefore = st.tickets;
  await click(await pointOf(`g.dealerTable.cards[${index}].container`));
  await sleep(1200);
  st = await state();
  await shot('dealer-taken.png');
  check(!st.dealing && st.done === 1, 'стол ушёл, раунд продолжился один раз');
  check(st.pacts.length === 1 && st.pacts[0].startsWith(takenId), 'сделка легла в кассету: ' + st.pacts.join(', '));
  if (takenId === 'tickets-shop') check(st.tickets === ticketsBefore + 1, '«+1 билет сразу»: ' + ticketsBefore + ' → ' + st.tickets);
  else check(true, 'на столе не было tickets-shop — билет не проверяем');

  // C: та же сделка второй раз не берётся, а отказ закрывает стол без новой записи.
  await openTable();
  st = await state();
  const same = st.offer.indexOf(takenId);
  if (same >= 0) {
    await click(await pointOf(`g.dealerTable.cards[${same}].container`));
    await sleep(500);
    st = await state();
    check(st.dealing && st.pacts.length === 1, 'действующую сделку второй раз не взяли, стол на месте');
  } else {
    check(true, 'та же карта второй раз не выпала — дубликат проверяется тестами (tests/dealer.test.mjs)');
  }
  await refuseTable();
  st = await state();
  await shot('dealer-refused.png');
  check(!st.dealing && st.pacts.length === 1 && st.done === 1, '«✕ ОТКАЗАТЬСЯ» закрыл стол, второй сделки нет');

  // E: карта №11 «выбранный символ» — клик по карте открывает ряд символов, символ берёт сделку с ним.
  let luckyOffer = null;
  for (let tries = 0; tries < 25 && !luckyOffer; tries++) {
    await openTable();
    const test = await state();
    const symbolCard = test.offer.indexOf('symbol-weight');
    if (symbolCard < 0) { await refuseTable(); continue; }
    await click(await pointOf(`g.dealerTable.cards[${symbolCard}].container`));
    await sleep(400);
    const picks = await val('(window.__g.dealerTable.picks || []).length');
    check(picks > 0, 'карта «выбранный символ» положила на сукно ряд символов: ' + picks);
    await shot('dealer-symbol-picks.png');
    const before = (await state()).pacts.length;
    // «←» рядом с рядом символов: назад к картам, от Дилера не отказываемся, карта №11 снова нажимается.
    await click(await pointOf('g.dealerTable.back'));
    await sleep(400);
    const back = await state();
    const picksAfterBack = await val('(window.__g.dealerTable.picks || []).length');
    const cardsBack = await val('(window.__g.dealerTable.cards || []).filter((card) => card.container.visible).length');
    check(back.dealing && back.pacts.length === before && picksAfterBack === 0 && cardsBack > 0,
      '«←» вернул к картам без отказа: карт на сукне ' + cardsBack + ', выбор закрыт');
    await click(await pointOf(`g.dealerTable.cards[${symbolCard}].container`));
    await sleep(400);
    check(await val('(window.__g.dealerTable.picks || []).length') > 0, 'карта №11 после возврата снова показывает символы');
    await click(await pointOf('g.dealerTable.picks[0]'));
    await sleep(1200);
    const after = await state();
    const taken = await val('JSON.stringify((window.__g.pacts || []).map((pact) => ({ id: pact.id, symbol: pact.symbol && pact.symbol.id })))');
    check(!after.dealing && after.pacts.length === before + 1, 'символ выбран — сделка взята, стол ушёл');
    check(/symbol-weight/.test(taken) && /"symbol":"[a-z]+"/.test(taken), 'у сделки записан выбранный символ: ' + taken);
    luckyOffer = taken;
  }
  check(luckyOffer !== null, 'карта «выбранный символ» встретилась за 25 визитов Дилера');

  // F: выбирать не из чего (пустой список символов) — карта №11 ведёт себя как отказ, клика в пустоту нет.
  let emptyChecked = false;
  for (let tries = 0; tries < 25 && !emptyChecked; tries++) {
    await openTable();
    const test = await state();
    const symbolCard = test.offer.indexOf('symbol-weight');
    if (symbolCard < 0) { await refuseTable(); continue; }
    await ev('window.__g.dealerTable.pickSymbols = []; 1'); // сломали список так, будто выбирать не из чего
    const before = test.pacts.length;
    await click(await pointOf(`g.dealerTable.cards[${symbolCard}].container`));
    await sleep(1200);
    const after = await state();
    check(!after.dealing && after.done > test.done && after.pacts.length === before,
      'пустой список символов — карта отказала: стол ушёл, сделки нет');
    emptyChecked = true;
  }
  check(emptyChecked, 'карта «выбранный символ» встретилась для проверки отказа');

  console.log(`итог ${ok} из ${all}`);
  ws.close();
} finally { chrome.kill(); srv.kill(); }
process.exit(0);

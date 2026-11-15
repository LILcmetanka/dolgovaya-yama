/**
 * Проверка четвёртого ряда торгового автомата — билета за фишки (шаг 13) на живой сборке в headless Chrome.
 * Запуск: node .claude/skills/next-step/ticket-check.mjs <scratchpad>, где <scratchpad>/dist — сборка с хуком
 * window.__g (см. hookbuild.sh: «bash .claude/skills/next-step/hookbuild.sh <scratchpad> .»). Снимок и профиль Chrome — в scratchpad.
 *
 * Что проверяет:
 *  1) магазин открыт, в витрине четыре ряда, четвёртый — билет: он виден и подсказка у него про долю фишек;
 *  2) цена билета равна items.ticketForChips(balance, 0): эталон считает сам код игры (src/game/items.ts),
 *     копий чисел в сценарии нет — поменяли доли в items.ts, и проверка пойдёт за ними;
 *  3) клик по ряду даёт +1 билет и списывает ровно цену;
 *  4) потолок за заход (items.TICKETS_PER_SHOP): после покупки ряд гаснет, ценника нет, подсказка говорит почему,
 *     второй клик по погасшему ряду не продаёт;
 *  5) следующий магазин снова зажигает ряд, а цена растёт с покупками за забег — items.ticketForChips(balance, bought);
 *  6) фишек меньше цены — покупка не проходит: ни билета, ни списания.
 * Порт 8771 — свой: dev-сервер 5173 и порты 8766/8770 из других сценариев не трогаем.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import './ts-resolve.mjs'; // тот же резолвер, что у симулятора: Node находит './rules' без расширения
const SP = process.argv[2];
if (!SP) {
  console.log('нужен scratchpad: node ticket-check.mjs <scratchpad> (там dist с хуком window.__g)');
  process.exit(2);
}
// Эталон цены — из игры, а не из копии чисел: items.ticketForChips и items.TICKETS_PER_SHOP как в src/game/items.ts.
const SRC = process.env.SIM_SRC ?? fileURLToPath(new URL('../../../src/game/', import.meta.url));
const I = await import(SRC + 'items.ts');
const srv = spawn('python3', ['-m', 'http.server', '8771', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9338', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof-ticket', '--no-sandbox', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=gl', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ticketForChips = (balance, bought) => I.ticketForChips(balance, bought); // цена билета — правило игры
try {
  let tabs;
  for (let i = 0; i < 30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9338/json')).json(); if (tabs.length) break; } catch {} await sleep(300); }
  const page = tabs && tabs.find((t) => t.type === 'page');
  if (!page) throw new Error('Chrome не отдал вкладку: порт 9338 занят?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) pend.get(m.id)(m); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  /** Runtime.evaluate: значение выражения или undefined, если страница бросила исключение. */
  const val = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.error || r.result.exceptionDetails) return undefined;
    return r.result.result.value;
  };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(SP + '/' + name, Buffer.from(r.result.data, 'base64')); };
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8771/' });
  await sleep(3500);
  check((await val('typeof window.__g')) === 'object', 'hook: сцена в window.__g');
  await val('window.__g.finishTutorial(); 1');
  await sleep(900);

  // Магазин с известным банком: баланс ставим до открытия панели, цену билета считает refreshShop.
  const balance = 1000;
  await val(`window.__g.balance = ${balance}; window.__g.tickets = 0; window.__g.ticketsBought = 0; window.__g.openShop(); 1`);
  await sleep(2200);
  await val('window.__g.refreshShop(); 1');
  await sleep(300);

  /** Состояние витрины: ряды, их видимость, цены и текст ценника билета. */
  const state = async () => JSON.parse((await val(`(() => {
    const g = window.__g, shop = g.shop;
    const b = (o) => { const r = o.getBounds(); return { x: Math.round(r.centerX), y: Math.round(r.centerY), w: Math.round(r.width), h: Math.round(r.height) }; };
    return JSON.stringify({
      shopping: g.isShopping, balance: g.balance, tickets: g.tickets, bought: g.ticketsBought,
      rows: shop.goods.length, prices: shop.prices.slice(0, 4), texts: shop.priceTexts.slice(0, 4).map((t) => t.text),
      chips: shop.priceChips.slice(0, 4).map((c) => c.visible),
      visible: shop.goods.map((o) => o.visible), ticket: b(shop.goods[3]), ticketVisible: shop.goods[3].visible,
      ticketAlpha: shop.goods[3].alpha, ticketTexture: shop.goods[3].texture.key, glass: shop.goods[0].texture.key,
      hint: shop.hintFor(3),
    });
  })()`)) ?? '{}');

  const s1 = await state();
  console.log('витрина:', JSON.stringify({ rows: s1.rows, prices: s1.prices, texts: s1.texts, visible: s1.visible, ticketTexture: s1.ticketTexture }));
  check(s1.shopping === true, 'магазин открыт, покупки разрешены');
  check(s1.rows === 4, 'в витрине четыре ряда (их ' + s1.rows + ')');
  check(s1.ticketVisible === true && s1.ticketTexture === 'ticket', 'четвёртый ряд — билет, он виден');
  check(s1.ticket.w > 30 && s1.ticket.h > 15, 'билет в ряду размером с предмет: ' + s1.ticket.w + '×' + s1.ticket.h);
  check(Array.isArray(s1.hint) && /^(Билет|Ticket)$/.test(s1.hint[0]) && /фишек|chips/.test(s1.hint[1]), 'подсказка ряда: ' + JSON.stringify(s1.hint));

  const price0 = ticketForChips(balance, 0);
  check(s1.prices[3] === price0, 'цена билета = ticketForChips(' + balance + ', 0) = ' + price0 + ' (в игре ' + s1.prices[3] + ')');
  check(s1.texts[3] === '× ' + price0 && s1.chips[3] === true, 'ценник ряда показывает «× ' + price0 + '»: ' + JSON.stringify(s1.texts[3]));
  // Билет лежит в нижнем ряду витрины: выше нижней полки и ниже верхней.
  const glassTop = 244, glassBottom = 524; // VENDING_GLASS.y ∓ height/2 (layout.ts)
  check(s1.ticket.y > glassTop && s1.ticket.y < glassBottom, 'билет внутри витрины (y ' + s1.ticket.y + ' в ' + glassTop + '…' + glassBottom + ')');

  // Клик по билету: +1 билет, фишки списались ровно на цену.
  const point = await val(`(() => {
    const g = window.__g, cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    const o = g.shop.goods[3].getBounds();
    return JSON.stringify({ x: r.left + (o.centerX - cam.scrollX) * cam.zoom * k, y: r.top + (o.centerY - cam.scrollY) * cam.zoom * k });
  })()`);
  const pt = JSON.parse(point);
  const click = async (p) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  };
  await click(pt);
  await sleep(900);
  const s2 = await state();
  await shot('shop-ticket.png');
  check(s2.tickets === s1.tickets + 1, 'клик дал +1 билет (' + s1.tickets + ' → ' + s2.tickets + ')');
  check(s2.balance === s1.balance - price0, 'фишек списано ровно ' + price0 + ' (' + s1.balance + ' → ' + s2.balance + ')');
  check(s2.bought === s1.bought + 1, 'счётчик покупок за забег вырос на 1 (' + s2.bought + ')');
  // Потолок за заход (items.TICKETS_PER_SHOP = 1): ряд погас, ценника нет, подсказка объясняет почему.
  check(s2.ticketVisible === true && Math.abs(s2.ticketAlpha - 0.4) < 0.02, 'ряд билета погас до следующего магазина (alpha ' + s2.ticketAlpha.toFixed(2) + ')');
  check(s2.prices[3] === null && s2.texts[3] === '', 'у погасшего ряда нет цены: ' + JSON.stringify(s2.texts[3]));
  check(s2.chips[3] === false, 'у погасшего ряда нет и значка ценника — пустой ценник не висит');
  check(Array.isArray(s2.hint) && /больше не продают|No more this visit/.test(s2.hint[1]), 'подсказка объясняет потолок: ' + JSON.stringify(s2.hint));

  // Второй клик по погасшему ряду ничего не продаёт: ни билета, ни списания, ряд так и лежит тусклым.
  await click(pt);
  await sleep(700);
  const s2b = await state();
  check(s2b.tickets === s2.tickets && s2b.balance === s2.balance, 'второй билет за заход не продают (' + s2b.tickets + ' билетов, ' + s2b.balance + ' фишек)');

  // Следующий магазин: ряд снова горит, а цена — уже по числу купленных за забег билетов: первый уже куплен.
  await val('window.__g.openShop(); 1');
  await sleep(2200);
  await val('window.__g.balance = ' + balance + '; window.__g.refreshShop(); 1');
  await sleep(300);
  const s2c = await state();
  const price1 = ticketForChips(balance, s2c.bought);
  check(s2c.ticketVisible === true && s2c.ticketAlpha > 0.9, 'в новом магазине ряд билета снова горит (alpha ' + s2c.ticketAlpha.toFixed(2) + ')');
  check(s2c.prices[3] === price1, 'следующая цена = ticketForChips(' + balance + ', ' + s2c.bought + ') = ' + price1 + ' (в игре ' + s2c.prices[3] + ')');
  check(price1 > price0, 'следующий билет дороже: ' + price0 + ' → ' + price1);

  // Не хватает фишек: цена — доля банка, поэтому покупка не проходит только когда банк не дотягивает до минимума.
  const before = await state();
  await val('window.__g.balance = 3; window.__g.refreshShop(); 1');
  await sleep(300);
  const denied = await state();
  const priceDeny = ticketForChips(3, denied.bought);
  check(denied.prices[3] === priceDeny, 'при банке 3 фишки цена билета — минимум ' + priceDeny + ' (в игре ' + denied.prices[3] + ')');
  await click(pt);
  await sleep(700);
  const s3 = await state();
  check(s3.tickets === before.tickets && s3.bought === before.bought, 'фишек меньше цены — билет не куплен (' + s3.tickets + ' билетов)');
  check(s3.balance === 3, 'фишки не списаны: ' + s3.balance);

  await shot('shop-ticket-deny.png');
  console.log(`итог ${ok} из ${all}`);
  ws.close();
  process.exitCode = ok === all ? 0 : 1;
} finally { chrome.kill(); srv.kill(); }

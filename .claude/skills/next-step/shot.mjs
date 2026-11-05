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
  const errors = []; const prevOnMessage = null;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:8766/' });
  await sleep(3000);
  console.log('hook', JSON.stringify((await ev('typeof window.__g')).result));
  const val = async (e) => (await ev(e)).result.value;
  let ok = 0, all = 0;
  const check = (cond, what) => { all++; if (cond) ok++; console.log((cond ? 'OK   ' : 'FAIL ') + what); };
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const withRandom = (r, code) => ev(`window.__rnd = window.__rnd || Math.random; Math.random = () => ${r}; try { ${code} } finally { Math.random = window.__q ? () => (window.__q.length ? window.__q.shift() : window.__rnd()) : window.__rnd; } 1`);
  const open = async (card) => { await withRandom((card - 0.5) / 10, 'window.__g.pot = 60; window.__g.startDealerGame(() => { window.__done = (window.__done || 0) + 1; });'); await sleep(700); };
  const state = () => val(`JSON.stringify({ card: window.__g.dealerCard, stake: window.__g.dealerStakeNow, guessing: window.__g.isGuessing, dealing: window.__g.isDealing, pot: window.__g.pot, alphas: window.__g.dealerTable.choices.map(([d, c]) => d + ':' + c.alpha.toFixed(2) + ':' + (c.input && c.input.enabled)) })`).then(JSON.parse);
  const guess = async (dir, next) => { await withRandom((next - 0.5) / 10, `window.__g.guess('${dir}');`); await sleep(1300); };
  // A: карта 5 — все три яркие
  await open(5); let st = await state(); await shot('d-5.png');
  check(st.card === 5 && st.alphas.every((a) => a.includes(':1.00:true')), 'карта 5: >, =, < яркие и нажимаются ' + st.alphas);
  // B: «=» и следующая 5 — ×8, можно дальше
  await guess('equal', 5); st = await state();
  check(st.stake === 480 && st.guessing && st.card === 5, '«=» угадал: 60 → ' + st.stake + ', можно играть дальше');
  await shot('d-equal-win.png');
  // C: «>» с 5, следующая 9 — ×1,5; на 9 всё яркое
  await guess('higher', 9); st = await state();
  check(st.stake === 720 && st.card === 9, '«>» угадал: 480 → ' + st.stake);
  // D: Enter-остановка — stopDealing
  await ev('window.__g.stopDealing(); 1'); await sleep(1500); st = await state();
  check(!st.dealing && st.pot === 720, 'остановился: кон ' + st.pot);
  // E: карта 1 — «<» тусклая, не нажимается, guess('lower') ничего не делает
  await open(1); st = await state(); await shot('d-1.png');
  check(st.alphas.find((a) => a.startsWith('lower')).includes(':0.25:false') && st.alphas.find((a) => a.startsWith('higher')).includes(':1.00:true'), 'карта 1: «<» тусклая ' + st.alphas);
  await guess('lower', 1); st = await state();
  check(st.guessing && st.card === 1 && st.stake === 60, 'карта 1: «<» не сработал');
  // очередь: следующее число Math.random — из неё, один раз, дальше настоящий
  await ev('window.__rnd = window.__rnd || Math.random; window.__q = []; Math.random = () => (window.__q.length ? window.__q.shift() : window.__rnd()); 1');
  // F: клавиша «=» — промах (следующая 4) — сгорело
  await ev('window.__q = [0.35]; 1');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '=', code: 'Equal', windowsVirtualKeyCode: 187 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '=', code: 'Equal', windowsVirtualKeyCode: 187 });
  await sleep(250); console.log('после «=»', JSON.stringify(await state()), 'очередь', await val('window.__q.length')); await shot('d-equal-lose.png'); await sleep(1500); st = await state();
  check(!st.dealing && st.pot === 0, 'клавиша «=», промах: стол ушёл, кон ' + st.pot);
  // G: карта 10 — «>» тусклая; клик мышью по «=» (следующая 10) — ×8
  await open(10); st = await state(); await shot('d-10.png');
  check(st.alphas.find((a) => a.startsWith('higher')).includes(':0.25:false'), 'карта 10: «>» тусклая');
  const pt = JSON.parse(await val(`(() => { const g = window.__g, c = g.dealerTable.choices[1][1], cam = g.cameras.main, r = g.game.canvas.getBoundingClientRect(); const k = r.width / 1920; return JSON.stringify({ x: r.left + (c.x - cam.scrollX) * cam.zoom * k, y: r.top + (c.y - cam.scrollY) * cam.zoom * k }); })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await sleep(200);
  console.log('точка', JSON.stringify(pt), 'указатель', await val(`(() => { const g = window.__g, p = g.input.activePointer, c = g.dealerTable.choices[1][1]; return JSON.stringify({ wx: p.worldX, wy: p.worldY, cx: c.x, cy: c.y, vis: c.visible, depth: c.depth, hits: g.input.hitTestPointer(p).map((o) => o.type + ':' + (o.texture && o.texture.key)) }); })()`));
  await ev('window.__q = [0.95]; 1');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(1300); st = await state();
  check(st.stake === 480 && st.card === 10, 'клик мышью по «=» на 10: ×8 → ' + st.stake);
  console.log(`итог ${ok} из ${all}`);
  ws.close();
} finally { chrome.kill(); srv.kill(); }
process.exit(0);

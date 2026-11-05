import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const SP = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8766', '--directory', SP + '/dist', '--bind', '127.0.0.1'], { stdio: 'ignore' });
const chrome = spawn('google-chrome-stable', ['--headless=new', '--remote-debugging-port=9333', '--window-size=1280,720', '--user-data-dir=' + SP + '/prof', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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
  await shot('off.png');
  await ev('window.__g.pot = 40; window.__g.payout.addWin(40, 100); 1');
  await sleep(900); await shot('on.png');
  await ev('window.__g.payout.burn(); 1'); await sleep(150); await shot('burn.png');
  await sleep(1200);
  await ev('window.__g.payout.addWin(900, 100); 1'); await sleep(900);
  console.log('interactive', JSON.stringify((await ev('window.__g.payout.button.input && window.__g.payout.button.input.enabled')).result));
  await shot('big.png');
  ws.close();
} finally { chrome.kill(); srv.kill(); }
process.exit(0);

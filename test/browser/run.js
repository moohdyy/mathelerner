// Drives the page through headless Chrome over CDP. No dependency: the
// WebSocket is the one built into Node.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

// Without an argument the checks run against the worktree this file sits in —
// that is the normal case now that the harness lives in the repository.
const ROOT = process.argv[2] || path.resolve(__dirname, '..', '..');
const PORT = 8099, DEBUG_PORT = 9222;
const MOCKS = fs.readFileSync(path.join(__dirname, 'mocks.js'), 'utf8');

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html',
      'Cache-Control': 'no-store'
    }).end(data);
  });
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function cdpTargets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page;
    } catch (e) { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('no CDP target');
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const consoleLines = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleLines.push(msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
  });
  const ready = new Promise(r => ws.addEventListener('open', r));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, (m) => m.error ? reject(new Error(method + ': ' + m.error.message))
                                     : resolve(m.result));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  return { ready, send, consoleLines, close: () => ws.close() };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const profileDir = fs.mkdtempSync('/tmp/cdp-profile-');
  const chrome = spawn('google-chrome', [
    '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', `http://127.0.0.1:${PORT}/`
  ], { stdio: 'ignore' });

  let cdp;
  try {
    const target = await cdpTargets();
    cdp = connect(target.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCKS });
    await cdp.send('Page.reload', { ignoreCache: true });

    const evaluate = async (expr) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(async () => { ${expr} })()`,
        awaitPromise: true, returnByValue: true
      });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description
                        || JSON.stringify(r.exceptionDetails));
      }
      return r.result.value;
    };

    // Waiting for the page instead of sleeping a fixed span: on a cold Chrome
    // the old 1200 ms were not enough, and the run then failed with
    // "cannot read setSttActive of undefined" — a harness error that looks
    // exactly like a broken application.
    for (let i = 0; i < 100; i++) {
      if (await evaluate('return typeof window.__app === "object";')) break;
      await sleep(100);
    }

    const scenario = fs.readFileSync(path.join(__dirname, 'scenario.js'), 'utf8');
    const out = await evaluate(scenario);
    console.log(JSON.stringify(out, null, 2));
    const bad = out.checks.filter(c => !c.ok);
    console.log(bad.length === 0
      ? `\nALLE ${out.checks.length} PRUEFUNGEN BESTANDEN`
      : `\n${bad.length} VON ${out.checks.length} FEHLGESCHLAGEN`);
    process.exitCode = bad.length === 0 ? 0 : 1;
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    // server.close() only stops NEW connections; it waits for the open ones,
    // and one of Chrome's keep-alive sockets survives chrome.kill() long
    // enough to hold the process for ever. Measured: after the run the only
    // handle left is a single Socket, zero pending requests, and the run never
    // reaches its exit code. Every green run then looked like a failure,
    // because the only way out was to kill it from outside.
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();   // Node 18.2+
    }
    server.close();
  }
})().catch(e => { console.error('FEHLER:', e.message); process.exitCode = 2; });

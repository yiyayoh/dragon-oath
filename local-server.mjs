import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { accountStatus, narrateWithChatGPT } from './local-codex.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PORT = 8787;
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function json(res, status, object) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(object));
}
async function readPrompt(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw { http: 415, code: 'invalid_request' };
  const chunks = []; let length = 0;
  await new Promise((resolve, reject) => {
    const cleanup = () => { req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const data = chunk => {
      length += chunk.length;
      if (length > 512 * 1024) { cleanup(); req.resume(); reject({ http: 413, code: 'invalid_request' }); }
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(); };
    const error = () => { cleanup(); reject({ http: 400, code: 'invalid_request' }); };
    const aborted = () => { cleanup(); reject({ code: 'cancelled' }); };
    req.on('data', data); req.once('end', end); req.once('error', error); req.once('aborted', aborted);
  });
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw { http: 400, code: 'invalid_request' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 200000) throw { http: 400, code: 'invalid_request' };
  return data.prompt;
}

export function createGameServer({ port = DEFAULT_PORT, getStatus = accountStatus, narrate = narrateWithChatGPT, root = ROOT } = {}) {
  let active = false;
  const inflight = new Set();
  const server = http.createServer(async (req, res) => {
    let expected = server.address();
    expected = typeof expected === 'object' && expected ? expected.port : port;
    const hosts = new Set([`127.0.0.1:${expected}`, `localhost:${expected}`]);
    if (!hosts.has(req.headers.host)) return json(res, 403, { error: 'forbidden' });
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, { error: 'forbidden' });
    try {
      const url = new URL(req.url, `http://127.0.0.1:${expected}`);
      if (url.pathname === '/__gpt/status' && req.method === 'GET') {
        const status = await getStatus();
        // Deliberate allowlist: account identity and credentials never cross into the page.
        return json(res, 200, {
          available: true, ready: !!status.ready, authenticated: !!status.authenticated,
          authType: status.authType || null, model: status.model || null, plan: status.plan || null,
          ...(status.error ? { error: status.error } : {}),
        });
      }
      if (url.pathname === '/__gpt/narrate' && req.method === 'POST') {
        if (active) return json(res, 409, { error: 'chatgpt_busy', code: 'rate_limited' });
        // Reserve the single narrator before reading the body, including concurrent uploads.
        active = true;
        const controller = new AbortController();
        inflight.add(controller);
        res.on('close', () => { if (!res.writableEnded) controller.abort(); });
        req.on('aborted', () => controller.abort());
        let heartbeat;
        const event = data => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };
        try {
          const prompt = await readPrompt(req);
          if (controller.signal.aborted) return;
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'keep-alive' });
          res.flushHeaders();
          heartbeat = setInterval(() => { if (!res.destroyed) res.write(': waiting\n\n'); }, 12000);
          const text = await narrate(prompt, { signal: controller.signal, onText: text => event({ type: 'text', text }), runtimeDir: path.join(root, '.dragon-oath-local', 'runtime') });
          if (!controller.signal.aborted) event({ type: 'done', text });
        } catch (error) {
          const allowed = new Set(['chatgpt_auth', 'chatgpt_unavailable', 'rate_limited', 'network', 'refused', 'empty_completion', 'timeout']);
          const code = allowed.has(error?.code) ? error.code : 'chatgpt_unavailable';
          if (!controller.signal.aborted) {
            if (res.headersSent) event({ type: 'error', code });
            else json(res, error.http || 500, { error: error.http ? 'invalid_request' : code, code: error.http ? 'invalid_request' : code });
          }
        } finally {
          clearInterval(heartbeat); active = false; inflight.delete(controller);
          if (!res.writableEnded) res.end();
        }
        return;
      }
      if (url.pathname.startsWith('/__gpt/')) return json(res, 405, { error: 'method_not_allowed' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
      if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      let filename, type;
      if (url.pathname === '/' || url.pathname === '/index.html') { filename = path.join(root, 'index.html'); type = 'text/html; charset=utf-8'; }
      else if (url.pathname.startsWith('/portraits/')) {
        const decoded = decodeURIComponent(url.pathname.slice('/portraits/'.length));
        type = TYPES[path.extname(decoded).toLowerCase()];
        if (!type || !/^[a-z0-9_-]+\.(webp|png|jpe?g)$/i.test(decoded)) return json(res, 404, { error: 'not_found' });
        const base = await realpath(path.join(root, 'portraits'));
        filename = await realpath(path.join(base, decoded));
        if (path.dirname(filename).toLowerCase() !== base.toLowerCase()) return json(res, 404, { error: 'not_found' });
      } else return json(res, 404, { error: 'not_found' });
      const info = await stat(filename);
      if (!info.isFile()) return json(res, 404, { error: 'not_found' });
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') res.end();
      else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      json(res, error?.code === 'ENOENT' || error instanceof URIError ? 404 : 500, { error: 'not_found' });
    }
  });
  server.on('close', () => { for (const controller of inflight) controller.abort(); });
  server.closeNarration = () => { for (const controller of inflight) controller.abort(); };
  return server;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.DRAGON_OATH_PORT || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid DRAGON_OATH_PORT');
  const server = createGameServer({ port });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用；如本机游戏已启动，请打开 http://127.0.0.1:${port}/` : '本机游戏启动失败。');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`醉龙酒馆已启动：http://127.0.0.1:${port}/\n使用本机 Codex 的 ChatGPT 账号授权；无需填写 API Key。关闭此窗口即可停止。`));
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { server.closeNarration(); server.close(); server.closeAllConnections(); });
}

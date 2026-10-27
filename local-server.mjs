import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath, mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
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
async function readBody(req, limit) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw { http: 415, code: 'invalid_request' };
  const chunks = []; let length = 0;
  await new Promise((resolve, reject) => {
    const cleanup = () => { req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const data = chunk => {
      length += chunk.length;
      if (length > limit) { cleanup(); req.resume(); reject({ http: 413, code: 'invalid_request' }); }
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); resolve(); };
    const error = () => { cleanup(); reject({ http: 400, code: 'invalid_request' }); };
    const aborted = () => { cleanup(); reject({ code: 'cancelled' }); };
    req.on('data', data); req.once('end', end); req.once('error', error); req.once('aborted', aborted);
  });
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw { http: 400, code: 'invalid_request' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw { http: 400, code: 'invalid_request' };
  return data;
}
async function readPrompt(req) {
  const data = await readBody(req, 512 * 1024);
  if (typeof data.prompt !== 'string' || !data.prompt.trim() || data.prompt.length > 200000) throw { http: 400, code: 'invalid_request' };
  // 可选：玩家在游戏设置里选的模型名；不在账号目录里的由 narrate 退回默认模型
  if (data.model !== undefined && (typeof data.model !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(data.model))) throw { http: 400, code: 'invalid_request' };
  return { prompt: data.prompt, model: data.model };
}
const modelList = list => Array.isArray(list) ? list.filter(m => m && typeof m.model === 'string').slice(0, 20).map(m => ({
  model: m.model.slice(0, 64), displayName: String(m.displayName || m.model).slice(0, 64), description: String(m.description || '').slice(0, 200), isDefault: !!m.isDefault,
})) : null;

// ---------- 硬盘存档：.dragon-oath-local/saves/{auto,slot1..3}.json，覆盖前把旧版本留进 backups/ ----------
const SAVE_KEYS = new Set(['auto', 'slot1', 'slot2', 'slot3']);
const BACKUP_ID = /^(auto|slot[1-3])-(\d{13})$/;
const SAVE_LIMIT = 20 * 1024 * 1024;
const validSave = d => typeof d.t === 'number' && Number.isFinite(d.t) && d.state && typeof d.state === 'object' && !Array.isArray(d.state)
  && d.state.phase === 'play' && d.state.player && typeof d.state.player === 'object' && Array.isArray(d.state.log);
const saveMeta = d => ({ t: d.t, name: String(d.state?.player?.name ?? '').slice(0, 40), scene: String(d.state?.scene ?? '').slice(0, 40), combat: !!d.state?.combat });
function createSaveStore(dir, { backupGapMs, maxBackups }) {
  const backups = path.join(dir, 'backups');
  let queue = Promise.resolve();
  const serial = fn => (queue = queue.then(fn, fn)); // 写操作排队，避免同时改同一个文件
  const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
  const listBackups = async () => (await readdir(backups).catch(() => []))
    .map(f => f.replace(/\.json$/, '')).filter(id => BACKUP_ID.test(id))
    .sort((a, b) => Number(BACKUP_ID.exec(b)[2]) - Number(BACKUP_ID.exec(a)[2]));
  return {
    async list() {
      const slots = {};
      for (const key of SAVE_KEYS) { try { slots[key] = saveMeta(await readJson(path.join(dir, key + '.json'))); } catch {} }
      const list = [];
      for (const id of await listBackups()) { try { list.push({ id, slot: BACKUP_ID.exec(id)[1], ...saveMeta(await readJson(path.join(backups, id + '.json'))) }); } catch {} }
      return { slots, backups: list };
    },
    read: key => readFile(path.join(dir, key + '.json'), 'utf8'),
    readBackup: id => readFile(path.join(backups, id + '.json'), 'utf8'),
    write: (key, data) => serial(async () => {
      await mkdir(backups, { recursive: true });
      const file = path.join(dir, key + '.json');
      let prev = null;
      try { prev = await readJson(file); } catch {}
      if (prev && validSave(prev) && prev.t !== data.t) {
        const last = (await listBackups()).find(id => id.startsWith(key + '-'));
        // 进度倒退（开新局、读旧档后接着玩）一定备份；平时最多每 backupGapMs 留一份
        const regress = data.state.log.length < prev.state.log.length;
        if (regress || !last || prev.t - Number(BACKUP_ID.exec(last)[2]) >= backupGapMs) {
          await writeFile(path.join(backups, `${key}-${String(Math.trunc(prev.t)).padStart(13, '0')}.json`), JSON.stringify(prev));
          for (const old of (await listBackups()).slice(maxBackups)) await unlink(path.join(backups, old + '.json')).catch(() => {});
        }
      }
      const tmp = file + '.tmp';
      await writeFile(tmp, JSON.stringify(data));
      await rename(tmp, file);
    }),
  };
}

export function createGameServer({ port = DEFAULT_PORT, getStatus = accountStatus, narrate = narrateWithChatGPT, root = ROOT, backupGapMs = 10 * 60 * 1000, maxBackups = 20 } = {}) {
  const saves = createSaveStore(path.join(root, '.dragon-oath-local', 'saves'), { backupGapMs, maxBackups });
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
        const models = modelList(status.models);
        // Deliberate allowlist: account identity and credentials never cross into the page.
        return json(res, 200, {
          available: true, ready: !!status.ready, authenticated: !!status.authenticated,
          authType: status.authType || null, model: status.model || null, plan: status.plan || null,
          ...(models ? { models } : {}),
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
          const { prompt, model } = await readPrompt(req);
          if (controller.signal.aborted) return;
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'keep-alive' });
          res.flushHeaders();
          heartbeat = setInterval(() => { if (!res.destroyed) res.write(': waiting\n\n'); }, 12000);
          const text = await narrate(prompt, { signal: controller.signal, onText: text => event({ type: 'text', text }), runtimeDir: path.join(root, '.dragon-oath-local', 'runtime'), model });
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
      if (url.pathname.startsWith('/__save/')) {
        const [, , kind, name] = url.pathname.split('/');
        if (kind === 'list' && name === undefined && req.method === 'GET') return json(res, 200, await saves.list());
        if (kind === 'slot' && SAVE_KEYS.has(name)) {
          if (req.method === 'GET') {
            try { return json(res, 200, JSON.parse(await saves.read(name))); } catch { return json(res, 404, { error: 'not_found' }); }
          }
          if (req.method === 'PUT') {
            let data;
            try { data = await readBody(req, SAVE_LIMIT); } catch (error) { return json(res, error.http || 400, { error: 'invalid_request' }); }
            if (!validSave(data)) return json(res, 400, { error: 'invalid_request' });
            await saves.write(name, { t: data.t, state: data.state });
            return json(res, 200, { ok: true, t: data.t });
          }
        }
        if (kind === 'backup' && BACKUP_ID.test(name || '') && req.method === 'GET') {
          try { return json(res, 200, JSON.parse(await saves.readBackup(name))); } catch { return json(res, 404, { error: 'not_found' }); }
        }
        return json(res, 404, { error: 'not_found' });
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

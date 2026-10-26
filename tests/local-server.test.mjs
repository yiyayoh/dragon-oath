import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createGameServer } from '../local-server.mjs';

const fixture = await mkdtemp(path.join(os.tmpdir(), 'dragon-oath-http-test-'));
await mkdir(path.join(fixture, 'portraits'));
await mkdir(path.join(fixture, 'docs'));
await mkdir(path.join(fixture, '.git'));
await Promise.all([
  writeFile(path.join(fixture, 'index.html'), '<!doctype html><title>Test tavern</title>'),
  writeFile(path.join(fixture, 'portraits', 'selene_neutral.webp'), 'test-portrait'),
  writeFile(path.join(fixture, 'docs', 'private.md'), 'private-document'),
  writeFile(path.join(fixture, '.git', 'config'), 'private-git-config'),
  writeFile(path.join(fixture, 'local-server.mjs'), 'private-server-source'),
]);
after(async () => {
  assert.equal(path.dirname(fixture), os.tmpdir());
  await rm(fixture, { recursive: true, force: true });
});

const readyStatus = () => ({ available: true, ready: true, authenticated: true, authType: 'chatgpt', model: 'test-model', plan: 'test-plan' });
async function startServer(t, options = {}) {
  const server = createGameServer({ root: fixture, getStatus: readyStatus, narrate: async () => 'test story', ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeNarration();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return server;
}
function request(server, { method = 'GET', pathname = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: pathname, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('HTTP test timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
const post = (server, prompt) => request(server, { method: 'POST', pathname: '/__gpt/narrate', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
const events = body => body.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)));

test('Host and Origin checks reject foreign pages before account access', async t => {
  let accesses = 0;
  const server = await startServer(t, { getStatus: () => { accesses++; return readyStatus(); } });
  const port = server.address().port;
  for (const headers of [{ Host: `attacker.test:${port}` }, { Origin: 'https://attacker.test' }, { Origin: 'null' }, { Origin: `http://localhost:${port}` }]) {
    const response = await request(server, { pathname: '/__gpt/status', headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(accesses, 0);
  assert.equal((await request(server, { pathname: '/__gpt/status', headers: { Origin: `http://127.0.0.1:${port}` } })).status, 200);
  assert.equal((await request(server, { pathname: '/__gpt/status', headers: { Host: `localhost:${port}`, Origin: `http://localhost:${port}` } })).status, 200);
});

test('only game HTML and valid portrait files are served', async t => {
  const server = await startServer(t);
  const page = await request(server);
  assert.equal(page.status, 200);
  assert.match(page.body, /Test tavern/);
  assert.match(page.headers['content-type'], /^text\/html/);
  const head = await request(server, { method: 'HEAD', pathname: '/index.html' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(page.body));
  const portrait = await request(server, { pathname: '/portraits/selene_neutral.webp' });
  assert.equal(portrait.status, 200);
  assert.equal(portrait.headers['content-type'], 'image/webp');
  for (const pathname of ['/.git/config', '/docs/private.md', '/local-server.mjs', '/local-codex.mjs', '/portraits/../local-server.mjs', '/portraits/%2e%2e%2flocal-server.mjs', '/portraits/nested/selene_neutral.webp', '/portraits/%ZZ.webp']) {
    const response = await request(server, { pathname });
    assert.equal(response.status, 404, pathname);
    assert.doesNotMatch(response.body, /private-(document|git-config|server-source)/);
  }
});

test('status exposes readiness without account identity or credentials', async t => {
  const server = await startServer(t, { getStatus: () => ({ ...readyStatus(), email: 'secret@example.test', token: 'secret-token', account: { id: 'secret-account' }, refreshToken: 'secret-refresh' }) });
  const response = await request(server, { pathname: '/__gpt/status' });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), readyStatus());
  assert.doesNotMatch(response.body, /secret/);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('narration rejects invalid JSON media types, shapes and prompt lengths', async t => {
  let calls = 0;
  const server = await startServer(t, { narrate: async () => { calls++; return 'unexpected'; } });
  for (const [type, body, expected] of [
    [undefined, '{}', 415], ['text/plain', '{"prompt":"hello"}', 415],
    ['application/json', '{', 400], ['application/json', 'null', 400],
    ['application/json', '[]', 400], ['application/json', '{}', 400],
    ['application/json', '{"prompt":12}', 400], ['application/json', '{"prompt":false}', 400],
    ['application/json', '{"prompt":"  "}', 400], ['application/json', JSON.stringify({ prompt: 'x'.repeat(200001) }), 400],
  ]) {
    const response = await request(server, { method: 'POST', pathname: '/__gpt/narrate', headers: type ? { 'Content-Type': type } : {}, body });
    assert.equal(response.status, expected, `type=${type}, body=${body.slice(0, 30)}`);
    assert.equal(JSON.parse(response.body).code, 'invalid_request');
  }
  assert.equal(calls, 0);
});

test('request body limit produces 413 without invoking the narrator', async t => {
  let calls = 0;
  const server = await startServer(t, { narrate: async () => { calls++; return 'unexpected'; } });
  const response = await post(server, 'x'.repeat(600 * 1024));
  assert.equal(response.status, 413);
  assert.equal(JSON.parse(response.body).code, 'invalid_request');
  assert.equal(calls, 0);
});

test('SSE streams cumulative text followed by one complete result', async t => {
  const final = '雨夜酒馆。\n@@@\n{"suggestions":[]}';
  const server = await startServer(t, { narrate: async (prompt, { signal, onText }) => {
    assert.equal(prompt, '走进酒馆');
    assert.equal(signal.aborted, false);
    onText('雨夜'); onText(final);
    return final;
  } });
  const response = await post(server, '走进酒馆');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^text\/event-stream/);
  assert.deepEqual(events(response.body), [{ type: 'text', text: '雨夜' }, { type: 'text', text: final }, { type: 'done', text: final }]);
});

test('SSE errors use allowed codes without leaking upstream messages', async t => {
  const allowed = ['chatgpt_auth', 'chatgpt_unavailable', 'rate_limited', 'network', 'refused', 'empty_completion', 'timeout'];
  const server = await startServer(t, { narrate: async (prompt, { onText }) => { onText('partial story'); throw Object.assign(new Error('secret-token secret-account private-stack'), { code: prompt }); } });
  for (const code of [...allowed, 'secret-unexpected-code']) {
    const response = await post(server, code);
    assert.equal(response.status, 200);
    assert.deepEqual(events(response.body), [{ type: 'text', text: 'partial story' }, { type: 'error', code: allowed.includes(code) ? code : 'chatgpt_unavailable' }]);
    assert.doesNotMatch(response.body, /secret|private-stack/);
  }
});

test('concurrent narration is rejected while the first request can finish', async t => {
  const gate = Promise.withResolvers(), entered = Promise.withResolvers();
  t.after(() => gate.resolve());
  let calls = 0;
  const server = await startServer(t, { narrate: async () => { calls++; entered.resolve(); await gate.promise; return 'finished'; } });
  const first = post(server, 'first');
  await entered.promise;
  const second = await post(server, 'second');
  assert.equal(second.status, 409);
  assert.equal(JSON.parse(second.body).code, 'rate_limited');
  assert.equal(calls, 1);
  gate.resolve();
  assert.deepEqual(events((await first).body), [{ type: 'done', text: 'finished' }]);
});

test('client disconnect aborts narration, emits no done, and releases the next request', async t => {
  const aborted = Promise.withResolvers(), finished = Promise.withResolvers();
  let received = '';
  const server = await startServer(t, { narrate: async (prompt, { signal, onText }) => {
    if (prompt === 'retry') return 'retried successfully';
    await new Promise(resolve => {
      signal.addEventListener('abort', () => { aborted.resolve(signal.aborted); resolve(); }, { once: true });
      onText('partial story');
    });
    onText('late text after disconnect');
    finished.resolve();
    return 'must not become done';
  } });
  await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/__gpt/narrate', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      res.on('error', () => {});
      res.on('data', chunk => {
        received += chunk.toString('utf8');
        if (received.includes('\n\n')) { res.destroy(); req.destroy(); resolve(); }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Disconnect test timed out')));
    req.on('error', reject);
    req.end(JSON.stringify({ prompt: 'disconnect' }));
  });
  assert.equal(await aborted.promise, true);
  await finished.promise;
  await nextTurn();
  assert.deepEqual(events(received), [{ type: 'text', text: 'partial story' }]);
  const retry = await post(server, 'retry');
  assert.equal(retry.status, 200);
  assert.deepEqual(events(retry.body), [{ type: 'done', text: 'retried successfully' }]);
});

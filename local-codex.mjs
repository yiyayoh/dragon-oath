import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import path from 'node:path';
import os from 'node:os';

export class NarratorError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Resolve the installed CLI, never copy or read its OAuth credentials ourselves.
export function findCodex() {
  const names = process.platform === 'win32' ? ['codex.exe', 'codex.cmd', 'codex.ps1'] : ['codex'];
  const dirs = (process.env.PATH || '').split(path.delimiter);
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'npm'));
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (!existsSync(candidate)) continue;
      if (name.endsWith('.exe')) return { command: candidate, prefix: [] };
      const cli = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
      if (existsSync(cli)) {
        // Calling the native executable directly makes cancellation terminate the owned process.
        if (process.platform === 'win32') {
          try {
            const require = createRequire(cli);
            const platform = process.arch === 'arm64' ? 'arm64' : 'x64';
            const pkg = require.resolve(`@openai/codex-win32-${platform}/package.json`);
            const triple = platform === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
            const native = path.join(path.dirname(pkg), 'vendor', triple, 'bin', 'codex.exe');
            if (existsSync(native)) return { command: native, prefix: [] };
          } catch {}
        }
        return { command: process.execPath, prefix: [cli] };
      }
      if (process.platform !== 'win32') return { command: candidate, prefix: [] };
    }
  }
  throw new NarratorError('chatgpt_unavailable');
}

function classify(error) {
  if (error instanceof NarratorError) return error;
  const message = String(error?.message || error || '');
  if (/429|rate.?limit|quota|usage.?limit|usage_limit/i.test(message)) return new NarratorError('rate_limited');
  if (/401|unauthoriz|auth.?token|not.?logged|sign.?in|authentication/i.test(message)) return new NarratorError('chatgpt_auth');
  if (/refus|safety|policy/i.test(message)) return new NarratorError('refused');
  if (/timeout|timed.?out/i.test(message)) return new NarratorError('timeout');
  return new NarratorError('network');
}

const DISABLED_FEATURES = [
  'hooks', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access',
  'computer_use', 'code_mode', 'code_mode_host', 'shell_tool', 'unified_exec',
  'apps', 'plugins', 'memories', 'multi_agent', 'skill_search', 'tool_suggest',
  'image_generation', 'artifact', 'workspace_dependencies', 'sleep_tool',
];

class RpcClient {
  constructor(signal) {
    if (signal?.aborted) throw new NarratorError('cancelled');
    const { command, prefix } = findCodex();
    this.child = spawn(command, [...prefix, 'app-server', '--listen', 'stdio://', ...DISABLED_FEATURES.flatMap(feature => ['--disable', feature])], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    this.pending = new Map(); this.seq = 0; this.closed = false;
    this.listeners = new Set(); this.signal = signal;
    this.child.stderr.on('data', () => {}); // CLI diagnostics may contain account data; keep them private.
    this.child.stdin.on('error', () => {});
    this.child.on('error', () => this.fail(new NarratorError('chatgpt_unavailable')));
    this.child.on('exit', () => this.fail(new NarratorError('chatgpt_unavailable')));
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => this.message(line));
    this.abort = () => this.fail(new NarratorError('cancelled'));
    signal?.addEventListener('abort', this.abort, { once: true });
  }
  message(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method && message.id !== undefined) {
      // This integration never executes model-requested tools or approval actions.
      this.send({ id: message.id, error: { code: -32601, message: 'Narration does not support tools' } });
      this.fail(new NarratorError('chatgpt_unavailable'));
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending) {
      this.pending.delete(message.id); clearTimeout(pending.timer);
      message.error ? pending.reject(classify(message.error)) : pending.resolve(message.result);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }
  send(message) {
    if (!this.closed && this.child.stdin.writable) this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  rpc(method, params) {
    if (this.closed) return Promise.reject(new NarratorError('chatgpt_unavailable'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new NarratorError('timeout')); }, 25000);
      this.pending.set(id, { resolve, reject, timer }); this.send({ id, method, params });
    });
  }
  fail(error) {
    if (this.closed) return;
    for (const listener of this.listeners) listener({ method: 'local/error', error });
    this.close(error);
  }
  close(error = new NarratorError('cancelled')) {
    if (this.closed) return;
    this.closed = true;
    this.signal?.removeEventListener('abort', this.abort);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear(); this.listeners.clear(); this.lines.close();
    this.child.stdin.end(); this.child.kill();
  }
  async initialize() {
    await this.rpc('initialize', {
      clientInfo: { name: 'dragon_oath_local', title: 'Dragon Oath Local', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
    const account = (await this.rpc('account/read', { refreshToken: false })).account;
    if (account?.type !== 'chatgpt') throw new NarratorError('chatgpt_auth');
    const settings = await this.rpc('config/read', { includeLayers: false });
    // Read only the configured MCP names; never log configuration values or secrets.
    if (!settings.config || typeof settings.config !== 'object') throw new NarratorError('chatgpt_unavailable');
    this.mcpOverrides = {};
    for (const name of Object.keys(settings.config.mcp_servers || {})) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new NarratorError('chatgpt_unavailable');
      this.mcpOverrides[`mcp_servers.${name}.enabled`] = false;
    }
    const catalog = (await this.rpc('model/list', {})).data || [];
    const selected = catalog.find(model => model.isDefault && !model.hidden) || catalog.find(model => !model.hidden);
    if (!selected) throw new NarratorError('chatgpt_unavailable');
    return { available: true, ready: true, authenticated: true, authType: 'chatgpt', plan: account.planType || null, model: selected.model };
  }
}

export async function accountStatus() {
  let client;
  try { client = new RpcClient(); return await client.initialize(); }
  catch (error) { return { available: true, ready: false, authenticated: false, authType: null, model: null, plan: null, error: classify(error).code }; }
  finally { client?.close(); }
}

export async function narrateWithChatGPT(prompt, { signal, onText, onItem, runtimeDir } = {}) {
  const client = new RpcClient(signal);
  const work = runtimeDir || path.join(os.tmpdir(), 'dragon-oath-narrator');
  let timer;
  try {
    const status = await client.initialize();
    await mkdir(work, { recursive: true });
    const started = await client.rpc('thread/start', {
      model: status.model, cwd: work, ephemeral: true, environments: [], dynamicTools: [],
      approvalPolicy: 'never', sandbox: 'read-only',
      baseInstructions: 'You are the text-only game narrator for the fantasy RPG Drunken Dragon Tavern: Dragon Oath. Follow the supplied game rules and output contract. Return only in-world Simplified Chinese narrative, then a line containing @@@, then the game-state JSON object. Never inspect files, execute commands, use tools, or act as a coding assistant. Do not announce analysis or write a preamble.',
      config: {
        ...client.mcpOverrides,
        'features.shell_tool': false, 'features.unified_exec': false, 'features.apps': false,
        'features.plugins': false, 'features.multi_agent': false, 'features.image_generation': false,
        'web_search': 'disabled', 'model_reasoning_effort': 'low', 'project_doc_max_bytes': 0,
      },
    });
    let text = '';
    let settle;
    const completed = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    // Attach a rejection handler immediately: aborts can arrive while turn/start is pending.
    completed.catch(() => {});
    client.listeners.add(message => {
      const params = message.params || {};
      if (message.method === 'local/error') { settle.reject(message.error); return; }
      if (params.threadId && params.threadId !== started.thread.id) return;
      if ((message.method === 'item/started' || message.method === 'item/completed') && params.item) {
        const type = params.item.type;
        onItem?.(type);
        if (!['userMessage', 'reasoning', 'agentMessage', 'contextCompaction'].includes(type)) {
          client.fail(new NarratorError('chatgpt_unavailable')); return;
        }
      }
      if (message.method === 'item/agentMessage/delta') { text += params.delta || ''; onText?.(text); }
      if (message.method === 'item/completed' && params.item?.type === 'agentMessage') { text = params.item.text || text; onText?.(text); }
      if (message.method === 'turn/completed') {
        if (params.turn?.status === 'completed') settle.resolve();
        else settle.reject(classify(params.turn?.error || { message: params.turn?.status }));
      }
    });
    timer = setTimeout(() => client.fail(new NarratorError('timeout')), 180000);
    await client.rpc('turn/start', { threadId: started.thread.id, effort: 'low', input: [{ type: 'text', text: prompt }] });
    await completed;
    if (!text.trim()) throw new NarratorError('empty_completion');
    return text;
  } catch (error) { throw classify(error); }
  finally { clearTimeout(timer); client.close(); }
}

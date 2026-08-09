#!/usr/bin/env node
// boss_mint_stoken.mjs — 无头 Edge 里为 BOSS直聘凭证补全/刷新 __zp_stoken__。
//
// 原理：`__zp_stoken__` 是 BOSS直聘反爬 JS 在真实页面流程里生成的令牌，纯 HTTP 终端永远
//   拿不到（搜索 API 返回 {"code":37,"seed":...}，seed 需在浏览器里由 JS 求解）。
//   登录 cookie（wt2/wbg/zp_at）由原生扫码拿到；本脚本把这些 cookie 注入无头 Edge，
//   导航到搜索页 → 页面 JS 触发 joblist API → 服务器发挑战 → JS 求解 → 写回 cookie。
//
// 用法: node boss_mint_stoken.mjs <credential.json> [--port 9333]
//   - 读取凭证 → mint → 把结果（含 __zp_stoken__）写回同一文件
//   - stdout 打印结果 JSON：{ok, stokenPresent, cookieCount, savedPath, tookMs}
//   - 退出码 0=成功拿到 stoken，1=失败
// 依赖：本机 Node ≥ 20（全局 WebSocket），Microsoft Edge。脚本只读凭证、只写凭证文件。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
// 真实 Edge 的 UA（去掉 --headless 追加的 HeadlessChrome 标记），让页面按正常浏览器流程跑
const REAL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.4129.72';
// 搜索页会触发 /wapi/zpgeek/search/joblist.json → code37 挑战 → JS 求解。city=101010100 北京
const SEARCH_URL = 'https://www.zhipin.com/web/geek/job?query=%E9%87%8F%E5%8C%96&city=101010100';
const MINT_PROFILE = join(tmpdir(), 'edge-boss-mint');
const BASE = '127.0.0.1';
let PORT = 9333;

const args = process.argv.slice(2);
const CRED_PATH = args.find((a) => !a.startsWith('--'));
if (!CRED_PATH) {
  console.log(JSON.stringify({ ok: false, error: '缺少凭证路径参数' }));
  process.exit(1);
}
const portArg = args.find((a) => a.startsWith('--port='));
if (portArg) PORT = Number(portArg.split('=')[1]);
const START = Date.now();

function getJson(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

async function portOpen() {
  try { await getJson(`http://${BASE}:${PORT}/json/version`, 2000); return true; } catch { return false; }
}

function launchEdge() {
  const edge = EDGE_PATHS.find((p) => existsSync(p));
  if (!edge) throw new Error('未找到 Microsoft Edge');
  const args = [
    edge,
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${MINT_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ];
  spawn(args[0], args.slice(1), {
    stdio: 'ignore',
    windowsHide: true,
  });
}

async function waitForPort(deadlineMs = 30000) {
  const waitEnd = Date.now() + deadlineMs;
  while (Date.now() < waitEnd) {
    if (await portOpen()) return;
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`无头 Edge 启动超时（端口 ${PORT} 未就绪）`);
}

async function main() {
  let cred;
  try { cred = JSON.parse(readFileSync(CRED_PATH, 'utf-8')); } catch (e) { throw new Error(`读取凭证失败: ${e.message}`); }
  const cookies = cred.cookies || {};
  const hadStoken = !!cookies.__zp_stoken__;
  console.error(`[mint] 读取 ${CRED_PATH}（${Object.keys(cookies).length} cookies，原 stoken: ${hadStoken}）`);

  if (!(await portOpen())) {
    console.error('[mint] 启动无头 Edge...');
    launchEdge();
    await waitForPort();
  }

  const targets = await getJson(`http://${BASE}:${PORT}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('无头 Edge 无页面 target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Network.enable');
  await send('Network.setUserAgentOverride', { userAgent: REAL_UA });
  await send('Network.clearBrowserCookies');

  const items = Object.entries(cookies).map(([name, value]) => ({
    name, value,
    domain: '.zhipin.com',
    path: '/',
    httpOnly: ['wt2', 'wbg'].includes(name),
    secure: true,
  }));
  await send('Network.setCookies', { cookies: items });
  console.error(`[mint] 注入 ${items.length} 个 auth cookie，导航搜索页触发挑战...`);
  await send('Page.navigate', { url: SEARCH_URL });

  // 轮询等 JS 求解（搜索页 API → code37 → solve → 写 cookie），最多 ~70s
  let zp = {};
  let stoken = null;
  const pollEnd = Date.now() + 70000;
  while (Date.now() < pollEnd) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const { cookies: all } = await send('Network.getAllCookies');
      zp = {};
      for (const c of all) if ((c.domain || '').includes('zhipin.com')) zp[c.name] = c.value;
      if (zp.__zp_stoken__) { stoken = zp.__zp_stoken__; break; }
    } catch (e) { /* 页面导航中偶发断连，重试 */ }
  }
  ws.close();

  if (!stoken) {
    console.log(JSON.stringify({
      ok: false, stokenPresent: false, cookieCount: Object.keys(zp).length,
      error: '70s 内未 mint 出 __zp_stoken__', tookMs: Date.now() - START,
    }));
    process.exit(1);
  }

  // 写回：浏览器 jar 里含注入的 auth cookies + 新 mint 的 stoken + 其它
  const merged = { ...cookies, ...zp, __zp_stoken__: stoken };
  const payload = { cookies: merged, saved_at: Math.floor(Date.now() / 1000) };
  writeFileSync(CRED_PATH, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(JSON.stringify({
    ok: true, stokenPresent: true, cookieCount: Object.keys(merged).length,
    stokenPrefix: stoken.slice(0, 16), savedPath: CRED_PATH, tookMs: Date.now() - START,
  }));
}
main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message, tookMs: Date.now() - START }));
  process.exit(1);
});

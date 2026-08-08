#!/usr/bin/env node
/**
 * boss-cli CDP 登录提取器 —— 让浏览器自己解密自己的 cookie，写入 boss-cli 凭证文件。
 *
 * 为什么需要这个：新版 Edge/Chrome (127+) 用 v20 App-Bound 加密存储 cookie，
 * boss-cli 依赖的 browser-cookie3 不支持解密（工具链硬上限）。此脚本通过
 * DevTools Protocol (CDP) 连接一个浏览器实例，浏览器持有 v20 密钥、能解密
 * 自己的 cookie，我们把它写入 boss-cli 凭证文件即可。
 *
 * 用法（交互式，需要一个独立浏览器窗口，用户在窗口里扫码登录 zhipin）：
 *   node boss_cdp_login.js
 *
 * 流程：
 *   1. 检查 9222 调试端口是否已打开（edge 实例是否在跑）
 *   2. 若未打开，启动一个独立 Edge 实例（全新临时 profile，与用户正式 Edge 隔离）
 *   3. 导航到 zhipin.com，等待用户扫码登录
 *   4. 登录后提取 zhipin.com 全部 cookie
 *   5. 写入 boss-cli 凭证文件
 *   6. 提示：可关闭临时 Edge（凭证已落盘）
 */
const { execSync, spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 9222;
const BOSS_CREDENTIAL = path.join(os.homedir(), '.config', 'boss-cli', 'credential.json');
const TEMP_PROFILE = path.join(os.tmpdir(), 'edge-boss-cdp-login');
const EDGE_BIN = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ZHIPIN_URL = 'https://www.zhipin.com';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function portOpen() {
  try {
    await getJson(`http://127.0.0.1:${PORT}/json/version`);
    return true;
  } catch (e) {
    return false;
  }
}

async function killTempProfileEdge() {
  // 只杀使用临时 profile 的残留 msedge 进程，绝不动用户的正式 Edge
  const ps = [
    'powershell -NoProfile -Command',
    `"Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -match 'edge-boss-cdp-login' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
  ];
  try { execSync(ps.join(' '), { stdio: 'ignore' }); } catch (e) {}
  await sleep(1200);
}

async function launchEdge() {
  console.log('[boss-cdp] 启动独立 Edge 实例（全新 profile，与你的正式 Edge 隔离）...');
  await killTempProfileEdge();
  // 清理旧的临时 profile
  try { fs.rmSync(TEMP_PROFILE, { recursive: true, force: true }); } catch (e) {}
  await sleep(1000);

  const child = spawn(EDGE_BIN, [
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${TEMP_PROFILE}`,
    '--no-first-run',
    '--new-window',
    ZHIPIN_URL,
  ], { stdio: 'ignore', detached: true });
  child.unref();

  // 等待调试端口就绪
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (await portOpen()) {
      console.log('[boss-cdp] 调试端口已就绪。');
      return true;
    }
  }
  console.error('[boss-cdp] 调试端口未在 ' + PORT + ' 上就绪。Edge 可能被系统策略阻止。');
  return false;
}

async function extractCookies() {
  // 复用交互式提取逻辑
  const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const target = targets.find((t) => t.type === 'page');
  if (!target) throw new Error('未找到页面 target');
  const wsUrl = target.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  let msgId = 0;
  const pending = new Map();

  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = (e) => rej(new Error('ws error ' + (e.message || '')));
  });

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Network.enable');

  // 若当前不在 zhipin，导航过去让 JS 刷新 __zp_stoken__
  await send('Page.navigate', { url: ZHIPIN_URL });
  console.log('[boss-cdp] 已在窗口中打开 zhipin.com，等待扫码登录...');

  const required = ['__zp_stoken__', 'wbg', 'wt2', 'zp_at'];

  // 自动轮询：每 3 秒查一次必需 cookie，齐全即提取。无需用户按 Enter。
  let map = null;
  for (let i = 0; i < 200; i++) {
    await sleep(3000);
    const { cookies } = await send('Network.getAllCookies');
    const zhipin = cookies.filter((c) => (c.domain || '').includes('zhipin.com'));
    const m = {};
    for (const c of zhipin) m[c.name] = c.value;
    const present = required.filter((r) => m[r]);
    if (present.length === required.length) {
      map = m;
      console.log('[boss-cdp] 已检测到登录（必需 cookie 齐全）。');
      console.log('[boss-cdp] 抓到 zhipin cookies:', Object.keys(map).sort().join(', '));
      break;
    }
    if (i % 10 === 0) console.log(`[boss-cdp] 等待登录中... (${Math.round(i * 3)}s)`);
  }

  if (!map) {
    console.error('[boss-cdp] 等待登录超时（10 分钟）。请重新运行脚本再试。');
    ws.close();
    return false;
  }
  const present = required.filter((r) => map[r]);
  console.log('[boss-cdp] 必需 cookie:', present.join(', ') || '无');

  fs.mkdirSync(path.dirname(BOSS_CREDENTIAL), { recursive: true });
  const cred = { cookies: map, saved_at: Math.floor(Date.now() / 1000) };
  fs.writeFileSync(BOSS_CREDENTIAL, JSON.stringify(cred, null, 2), 'utf-8');
  console.log('[boss-cdp] 凭证已写入', BOSS_CREDENTIAL);

  ws.close();
  return true;
}

async function main() {
  let alreadyRunning = await portOpen();
  if (!alreadyRunning) {
    const launched = await launchEdge();
    if (!launched) process.exit(1);
  } else {
    console.log(`[boss-cdp] 检测到 ${PORT} 端口已有调试实例，直接复用。`);
  }

  console.log('\n============================================');
  console.log('  请在弹出的浏览器窗口中扫码登录 zhipin.com');
  console.log('  登录成功（看到个人主页）后，脚本会自动检测并写入凭证，无需任何操作。');
  console.log('============================================\n');

  const ok = await extractCookies();
  if (!ok) {
    console.error('[boss-cdp] 提取失败。可重新运行本脚本重试。');
    process.exit(1);
  }

  console.log('\n[boss-cdp] 完成。现在可以关闭临时 Edge 窗口（凭证已存盘）。');
  console.log('[boss-cdp] 之后运行: boss status --json 验证 search_authenticated=true');
  process.exit(0);
}

main().catch((e) => {
  console.error('[boss-cdp] FAIL:', e.message);
  process.exit(1);
});

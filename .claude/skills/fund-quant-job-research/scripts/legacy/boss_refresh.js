#!/usr/bin/env node
/**
 * boss-cli 凭证自动刷新 —— 复用已登录的调试窗口，无需用户扫码。
 *
 * 背景：BOSS 直聘的 `__zp_stoken__` 是短时效 CSRF token（分钟~小时级），会频繁过期。
 * 但只要登录会话还在（隔离 Edge 窗口仍开着、已登录），token 就能被页面 JS 重新生成——
 * 无需重新扫码。本脚本做这件事：
 *
 *   1. 检查 9222 调试端口是否有已登录的隔离 Edge 实例
 *   2. 有 → 导航到 zhipin.com 让 JS 刷新 token，等几秒后提取全部 cookie，原子写入凭证
 *   3. 没有 → 提示用户改用交互式脚本 boss_cdp_login.js 扫码登录（会话本身已死）
 *
 * 用法：
 *   node boss_refresh.js          # 尝试自动刷新；成功 exit 0
 *
 * 注意：凭证写入是原子的（tmp + rename），并发调用安全，后写者胜。
 * 若刷新成功但 auth 仍不过，可能是会话已死，转 boss_cdp_login.js。
 */
const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 9222;
const BOSS_CREDENTIAL = path.join(os.homedir(), '.config', 'boss-cli', 'credential.json');
const ZHIPIN_URL = 'https://www.zhipin.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function refreshFromLiveWindow() {
  const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
  const target = targets.find((t) => t.type === 'page');
  if (!target) throw new Error('9222 端口有实例但没有页面 target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = (e) => rej(new Error('ws error ' + (e.message || '')));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Network.enable');
  await send('Page.navigate', { url: ZHIPIN_URL });
  console.log('[boss-refresh] 已导航到 zhipin.com，等待 JS 刷新 __zp_stoken__...');
  await sleep(8000);

  const { cookies } = await send('Network.getAllCookies');
  const zhipin = cookies.filter((c) => (c.domain || '').includes('zhipin.com'));
  const map = {};
  for (const c of zhipin) map[c.name] = c.value;

  const required = ['__zp_stoken__', 'wbg', 'wt2', 'zp_at'];
  const present = required.filter((r) => map[r]);
  console.log('[boss-refresh] 必需 cookie:', present.join(', ') || '无');

  if (present.length < required.length) {
    console.error('[boss-refresh] 必需 cookie 不全 —— 会话可能已失效，请改用 boss_cdp_login.js 重新扫码。');
    ws.close();
    return false;
  }

  const tmp = BOSS_CREDENTIAL + '.tmp';
  fs.mkdirSync(path.dirname(BOSS_CREDENTIAL), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify({ cookies: map, saved_at: Math.floor(Date.now() / 1000) }, null, 2), 'utf-8');
  fs.renameSync(tmp, BOSS_CREDENTIAL);
  console.log('[boss-refresh] 凭证已原子写入', BOSS_CREDENTIAL);
  ws.close();
  return true;
}

async function main() {
  if (!(await portOpen())) {
    console.error('[boss-refresh] 9222 端口没有调试实例（隔离 Edge 未运行）。会话已死，请运行:');
    console.error('  node <skill-dir>/scripts/boss_cdp_login.js  （会启动窗口，用户扫码登录）');
    process.exit(2);
  }
  console.log('[boss-refresh] 检测到已登录的调试实例，自动刷新中...');
  const ok = await refreshFromLiveWindow();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('[boss-refresh] FAIL:', e.message);
  process.exit(1);
});

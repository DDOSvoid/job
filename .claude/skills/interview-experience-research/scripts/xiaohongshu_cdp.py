#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小红书 CDP 工具 —— 用用户自己的 Edge 登录态读取小红书笔记正文。

镜像 fund-quant-job-research 的 boss-agent-cli 与 zhihu_cdp.py 模式：驱动**用户
自己登录的 Edge**（Chrome DevTools Protocol），真实浏览器携带真实 UA 与 cookie
访问 xiaohongshu.com。本工具不做任何逆向签名、不做指纹伪装、不提取 cookie 值
（登录态以 __INITIAL_STATE__.user.loggedIn 布尔判断为准，web_session 是 httpOnly
读不到）、不伪造 UA —— 只读取"用户已登录账号本来就能看"的页面，低频率访问。

小红书 Web 端要点（2026-08 实测前的调研）：
- 搜索页 `https://www.xiaohongshu.com/search_result?keyword=<词>&source=web_search_result_notes`
- 笔记页 `https://www.xiaohongshu.com/explore/{note_id}`，但**直接拼 URL 常 404**，
  需要带 `xsec_token`（由前端动态生成，与会话/路由绑定）。因此搜索时把结果 URL
  带上 token 一起返回；read 优先读带 token 的完整 URL。
- 页面数据内嵌在 `window.__INITIAL_STATE__`：
  搜索 → `state.search.feeds`；笔记详情 → `state.note.noteDetailMap[noteId].note`
  （含 title / desc / time / user / tagList / interactInfo）。
- 反爬：搜索/评论必须登录（web_session）；>30 req/min 触发验证码/限流；浏览器
  指纹检测（webdriver 需为 false，真实 Edge 天然满足）。

边界（硬性）：
- 只读公开/用户登录可见内容；触发验证码/风控/登录墙 → 立即停止、如实返回
  blocked 信息，绝不自动过验证码、绝不反复重试硬闯。
- 内置节流（~/.xiaohongshu-agent/throttle.json 全局生效，跨进程）+ 单实例锁。
- 不提取/不打印 cookie 值；登录态只输出布尔 `logged_in`。

用法（Windows 下先设 UTF-8）:
    PYTHONUTF8=1 python xiaohongshu_cdp.py launch                        # 启动独立 Edge CDP（端口 9224）
    PYTHONUTF8=1 python xiaohongshu_cdp.py --json status                 # CDP 存活 + 小红书登录态
    PYTHONUTF8=1 python xiaohongshu_cdp.py --json search "九坤 量化 面经"
    PYTHONUTF8=1 python xiaohongshu_cdp.py --json read "https://www.xiaohongshu.com/explore/<note_id>?xsec_token=..."
    PYTHONUTF8=1 python xiaohongshu_cdp.py --json probe "https://www.xiaohongshu.com/search_result?keyword=..."  # 调试：dump 页面结构

全局选项（放在子命令前，与 boss/zhihu 一致）:
    --json          stdout 输出 JSON（供 skill 解析）
    --delay "3-6"   命令间最小间隔（秒，默认 "3-6"，随机抖动）
    --cdp-url URL   覆盖 CDP 地址（默认 http://127.0.0.1:9224）
"""

import argparse
import json
import os
import random
import re
import subprocess
import sys
import time

import requests
import websocket

DATA_DIR = os.path.join(os.path.expanduser("~"), ".xiaohongshu-agent")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
THROTTLE_FILE = os.path.join(DATA_DIR, "throttle.json")
LOCK_FILE = os.path.join(DATA_DIR, "lock")
EDGE_PROFILE = os.path.join(DATA_DIR, "edge-cdp")
DEFAULT_CDP = "http://127.0.0.1:9224"
DEFAULT_PORT = 9224
LOCK_TTL = 300  # 秒；超过视为陈旧锁

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

# 风控/登录墙/404 关键词（检测到即降级，不硬闯）
RISK_RE = re.compile(r"验证|安全验证|滑动|访问过于频繁|访问频率过高|请稍后再试|访问异常")
LOGIN_WALL_RE = re.compile(r"登录|扫码登录|扫码")
NOTFOUND_RE = re.compile(r"页面不存在|笔记已删除|内容已删除|404|找不到了")

# 小红书搜索页结果提取 JS：优先 __INITIAL_STATE__.search.feeds，DOM 链接兜底。
# 注意：st 是 Vue reactive 状态，字段多是 Ref（数据在 ._value/.value，用 unwrap 解包）；
# 搜索 feed 项真实数据在 item.noteCard，标题字段是 displayTitle（不是 title）。
# （raw 字符串：写什么 JS 就是什么，\s、\n 原样传给浏览器。）
_SEARCH_JS = r"""
(() => {
  const unwrap = (v) => v && (('_value' in v && '__v_isRef' in v) ? v._value : (('value' in v && '__v_isRef' in v) ? v.value : v));
  const st = window.__INITIAL_STATE__ || {};
  const raw = unwrap((st.search || {}).feeds);
  const feeds = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of feeds) {
    const card = unwrap(item.noteCard) || item || {};
    const id = card.id || item.id || '';
    if (id && !/^[0-9a-f]{24}$/i.test(id)) continue;   // 过滤用户卡/话题卡，只留笔记
    const title = (card.displayTitle || card.title || '').trim();
    if (!title) continue;
    const xsec = item.xsecToken || card.xsecToken || '';
    let url = 'https://www.xiaohongshu.com/explore/' + id;
    if (xsec) url += '?xsec_token=' + encodeURIComponent(xsec) + '&xsec_source=pc_search';
    const author = (card.user && (card.user.nickname || card.user.nickName)) || '';
    const key = url.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const likes = (card.interactInfo && card.interactInfo.likedCount) || '';
    const snip = title + (author ? ' —— 作者：' + author : '') + (likes ? ' · 赞' + likes : '');
    out.push({url: url, title: title, snippet: snip.slice(0, 300), author: author});
  }
  if (!out.length) {
    const hrefs = Array.from(document.querySelectorAll('a[href*="/explore/"], a[href*="/search_result/"], a[href*="/discovery/item/"]'));
    for (const a of hrefs) {
      const href = a.href || '';
      const m = href.match(/(?:explore|search_result|discovery\/item)\/([0-9a-z]{24})/i);
      if (!m) continue;
      const title = (a.textContent || '').trim();
      if (title) out.push({url: href, title: title.slice(0, 120), snippet: '', author: ''});
    }
  }
  return out.slice(0, 15);
})()
"""

# 笔记正文提取 JS：优先 __INITIAL_STATE__.note.noteDetailMap（含 Vue Ref 解包 +
# 垃圾 key 过滤），DOM 兜底。
_EXTRACT_JS = r"""
(() => {
  const unwrap = (v) => v && (('_value' in v && '__v_isRef' in v) ? v._value : (('value' in v && '__v_isRef' in v) ? v.value : v));
  const out = {url: location.href, title: document.title, content: '', author: '', time: '', date: '', tags: [], type: '', noteId: ''};
  const st = window.__INITIAL_STATE__ || {};
  const map = unwrap((st.note || {}).noteDetailMap) || {};
  // 页面水合时 noteDetailMap 常带 "undefined"/"" 垃圾 key，只认合法笔记 id
  const keys = Object.keys(map).filter(k => /^[0-9a-f]{24}$/i.test(k) || (k && k !== 'undefined'));
  const k0 = keys[0];
  const wrap = k0 ? map[k0] : null;
  const n = wrap ? (wrap.note ? unwrap(wrap.note) : unwrap(wrap)) : null;
  if (n && (n.id || n.noteId)) {
    out.noteId = n.noteId || n.id;
    out.title = n.title || out.title;
    out.content = n.desc || '';
    out.author = (n.user && (n.user.nickname || n.user.nickName)) || '';
    out.time = String(n.time || '');
    out.type = n.type || '';
    out.tags = (n.tagList || []).map(t => (t && (t.name || t.tagName)) || '').filter(Boolean);
    try {
      if (n.time) out.date = new Date(Number(n.time)).toISOString().slice(0, 10);
    } catch (e) {}
    return out;
  }
  // DOM 兜底（__INITIAL_STATE__ 缺失/为空壳时）
  const titleEl = document.querySelector('#detail-title, h1[class*="title"], .title');
  const bodyEl = document.querySelector('#detail-desc, #detail-content, .note-content, .content, .desc');
  if (bodyEl) {
    out.content = (bodyEl.innerText || '').trim();
    if (titleEl) out.title = (titleEl.innerText || '').trim();
    return out;
  }
  out.content = (document.body.innerText || '').trim();
  return out;
})()
"""

# 调试/状态用 probe：dump 页面结构 + 登录态（首轮校准选择器用）
_PROBE_JS = r"""
(() => {
  const unwrap = (v) => v && (('_value' in v && '__v_isRef' in v) ? v._value : (('value' in v && '__v_isRef' in v) ? v.value : v));
  const st = window.__INITIAL_STATE__ || {};
  const u = st.user || {};
  const userInfo = unwrap(u.userInfo) || {};
  const li = unwrap(u.loggedIn);
  const loggedIn = li === true || li === 'true' || li === 1;
  const rawFeeds = unwrap((st.search || {}).feeds);
  const feeds = Array.isArray(rawFeeds) ? rawFeeds : [];
  const mapRaw = unwrap((st.note || {}).noteDetailMap) || {};
  const mapKeys = Object.keys(mapRaw).filter(k => /^[0-9a-f]{24}$/i.test(k) || (k && k !== 'undefined' && k !== ''));
  const k0 = mapKeys[0];
  const n0 = k0 ? mapRaw[k0] : null;
  return {
    host: location.host, href: location.href, title: document.title,
    logged_in: loggedIn,
    login_user: userInfo.nickname || userInfo.nickName || null,
    user_id: userInfo.userId || null,
    state_keys: Object.keys(st),
    has_search_feeds: feeds.length > 0,
    search_feed_count: feeds.length,
    note_detail_count: mapKeys.length,
    note_keys: mapKeys.slice(0, 3),
    note_first: n0 ? {id: n0.id || n0.noteId, title: n0.title, desc: (n0.desc || '').slice(0, 120)} : null,
    explore_links: Array.from(document.querySelectorAll('a[href*="/explore/"]')).slice(0, 3).map(a => a.href),
    login_wall: /登录|扫码/.test(document.body.innerText || ''),
    risk_wall: /验证|访问过于频繁|安全/.test(document.body.innerText || ''),
    body_snippet: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
  };
})()
"""


class XhsToolError(Exception):
    pass


# ---------- 配置 / 节流 / 锁 ----------

def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def load_config():
    cfg = {"cdp_url": DEFAULT_CDP, "port": DEFAULT_PORT}
    if os.path.exists(CONFIG_FILE):
        try:
            cfg.update(json.load(open(CONFIG_FILE, encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    return cfg


def save_config(cfg):
    _ensure_data_dir()
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def _load_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        return json.load(open(path, encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def throttle_wait(interval_range: tuple[float, float]):
    """全局节流：距上次命令开始至少 interval（+随机抖动）秒。状态跨进程共享。"""
    data = _load_json(THROTTLE_FILE, {})
    now = time.time()
    next_slot = data.get("next_slot", 0.0)
    wait = next_slot - now
    if wait > 0:
        sys.stderr.write(f"[xhs] 节流等待 {wait:.1f}s\n")
        time.sleep(wait)
    low, high = interval_range
    data["next_slot"] = time.time() + random.uniform(low, high)
    counts = data.get("counts", [])[-200:]
    counts.append(time.time())
    data["counts"] = counts
    _ensure_data_dir()
    with open(THROTTLE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    sys.stderr.write("[xhs] 命令开始，节流窗口已推进\n")


def acquire_lock():
    _ensure_data_dir()
    if os.path.exists(LOCK_FILE):
        age = time.time() - os.path.getmtime(LOCK_FILE)
        if age < LOCK_TTL:
            raise XhsToolError(
                f"另一个 xiaohongshu 命令仍在运行（锁文件 {LOCK_FILE}，<{LOCK_TTL}s 前创建）。"
                "请等它结束，或删除该锁文件后重试。"
            )
        sys.stderr.write("[xhs] 检测到陈旧锁，覆盖。\n")
    open(LOCK_FILE, "w", encoding="utf-8").close()


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except OSError:
        pass


# ---------- CDP 客户端 ----------

class Cdp:
    def __init__(self, cdp_url: str):
        self.cdp_url = cdp_url.rstrip("/")
        self._ws = None
        self._next_id = 0

    # -- HTTP 层（/json/*）--
    def version(self) -> dict:
        r = requests.get(f"{self.cdp_url}/json/version", timeout=5)
        r.raise_for_status()
        return r.json()

    def tabs(self) -> list[dict]:
        r = requests.get(f"{self.cdp_url}/json/list", timeout=5)
        r.raise_for_status()
        return r.json()

    def new_tab(self, url: str) -> dict:
        r = requests.put(f"{self.cdp_url}/json/new", params={"url": url}, timeout=5)
        r.raise_for_status()
        return r.json()

    # -- WebSocket 层 --
    def connect(self, ws_url: str):
        self._ws = websocket.create_connection(ws_url, timeout=45)
        self._send("Page.enable")
        self._send("Runtime.enable")

    def close(self):
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass
            self._ws = None

    def _send(self, method: str, params: dict | None = None) -> dict:
        if not self._ws:
            raise XhsToolError("未连接 CDP WebSocket")
        self._next_id += 1
        mid = self._next_id
        self._ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self._ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise XhsToolError(f"CDP {method} 失败: {msg['error'].get('message', msg['error'])}")
                return msg.get("result", {})

    def evaluate(self, expr: str, await_promise: bool = False):
        res = self._send(
            "Runtime.evaluate",
            {
                "expression": expr,
                "returnByValue": True,
                "awaitPromise": await_promise,
                "userGesture": True,
            },
        )
        if "exceptionDetails" in res:
            raise XhsToolError("页面 JS 执行异常: " + json.dumps(res["exceptionDetails"], ensure_ascii=False)[:300])
        return (res.get("result") or {}).get("value")

    def navigate(self, url: str, wait_ready: float = 3.0):
        self._send("Page.navigate", {"url": url})
        deadline = time.time() + 25
        while time.time() < deadline:
            time.sleep(0.5)
            try:
                if self.evaluate("document.readyState") == "complete":
                    break
            except XhsToolError:
                break  # 页面在跳转，重连或忽略
        time.sleep(wait_ready)  # SPA 数据渲染需要额外时间

    def wait_for(self, expr: str, timeout: float = 15.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.evaluate(expr):
                    return True
            except XhsToolError:
                pass
            time.sleep(0.6)
        return False


def find_xhs_tab(cdp: Cdp) -> dict | None:
    for t in cdp.tabs():
        if t.get("type") == "page" and "xiaohongshu.com" in t.get("url", ""):
            return t
    return None


def connect_xhs(cdp: Cdp, cdp_url: str) -> Cdp:
    """拿一个小红书 tab 并连上 WebSocket；没有就新建一个。"""
    tab = find_xhs_tab(cdp)
    if tab is None:
        tab = cdp.new_tab("https://www.xiaohongshu.com/explore")
    ws_url = tab.get("webSocketDebuggerUrl")
    if not ws_url:
        raise XhsToolError("CDP tab 没有 webSocketDebuggerUrl（Edge 可能正在启动，稍后重试）")
    cdp.connect(ws_url)
    return cdp


# ---------- 各命令 ----------

def cmd_status(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {"ok": False, "cdp": False, "logged_in": False, "login_user": None, "error": None}
    try:
        ver = Cdp(cdp_url).version()
        out["cdp"] = True
        out["browser"] = ver.get("Browser")
        cdp = Cdp(cdp_url)
        connect_xhs(cdp, cdp_url)
        cdp.navigate("https://www.xiaohongshu.com/explore", wait_ready=2.5)
        info = cdp.evaluate(_PROBE_JS)
        if not info:
            raise XhsToolError("页面未返回任何结构信息")
        # 登录态以 __INITIAL_STATE__.user.loggedIn / userInfo 为准（web_session 是
        # httpOnly cookie，document.cookie 读不到，不能用来判断）
        out["logged_in"] = bool(info.get("logged_in"))
        out["login_user"] = info.get("login_user")
        if not out["logged_in"]:
            out["error"] = "未登录（st.user.loggedIn 为 false），请先登录小红书（launch 后手动登录一次）"
        out["ok"] = True
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if (out["ok"] and out["cdp"] and out["logged_in"]) else 1


def cmd_search(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {"ok": False, "error": None, "results": [], "warn": None}
    try:
        cdp = Cdp(cdp_url)
        connect_xhs(cdp, cdp_url)
        url = (
            "https://www.xiaohongshu.com/search_result?keyword="
            + requests.utils.quote(args.query)
            + "&source=web_search_result_notes"
        )
        cdp.navigate(url, wait_ready=2.5)
        cdp.wait_for(
            "(() => { const u = (v) => v && (('_value' in v && '__v_isRef' in v) ? v._value : (('value' in v && '__v_isRef' in v) ? v.value : v));"
            " const st = window.__INITIAL_STATE__ || {};"
            " const f = u((st.search || {}).feeds);"
            " const bt = document.body ? document.body.innerText : '';"
            " return (Array.isArray(f) && f.length > 0) || /登录|验证|访问过于频繁/.test(bt); })()",
            timeout=15,
        )
        data = cdp.evaluate(_SEARCH_JS) or []
        bt = cdp.evaluate("document.body ? document.body.innerText : ''") or ""
        # 风控/登录墙检测（空结果时区分原因）
        if not data:
            li = cdp.evaluate(
                "(() => { const u=(v)=>v&&(('_value' in v&&'__v_isRef' in v)?v._value:(('value' in v&&'__v_isRef' in v)?v.value:v));"
                " const st=window.__INITIAL_STATE__||{}; const v=u((st.user||{}).loggedIn);"
                " return v===true||v==='true'||v===1; })()"
            )
            if RISK_RE.search(bt):
                out["warn"] = "页面出现风控/验证（小红书限流），已停手。请稍后重试或降级 blocked。"
            elif not li:
                out["warn"] = "未登录（st.user.loggedIn 为 false）。请 launch 后登录小红书。"
            else:
                out["warn"] = "搜索页未返回结果（可能无匹配或页面结构变化）。"
        out["results"] = data or []
        out["ok"] = True
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if out["ok"] else 1


def cmd_read(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {
        "ok": False, "error": None, "url": args.url, "title": None, "content": None,
        "author": None, "date": None, "tags": [], "partial_reason": None, "blocked_reason": None,
    }
    try:
        cdp = Cdp(cdp_url)
        connect_xhs(cdp, cdp_url)
        cdp.navigate(args.url, wait_ready=2.5)
        # 等待合法笔记 id 出现（noteDetailMap 水合时带 "undefined"/"" 垃圾 key，不当作命中）
        # 或正文容器出现 或 判定为登录/风控/404
        cdp.wait_for(
            "(() => { const u = (v) => v && (('_value' in v && '__v_isRef' in v) ? v._value : (('value' in v && '__v_isRef' in v) ? v.value : v));"
            " const st = window.__INITIAL_STATE__ || {};"
            " const m = u((st.note || {}).noteDetailMap) || {};"
            " const hasNote = Object.keys(m).some(k => /^[0-9a-f]{24}$/i.test(k));"
            " const bt = document.body ? document.body.innerText : '';"
            " return hasNote"
            "   || document.querySelector('#detail-desc, .note-content, #detail-content') !== null"
            "   || /登录|验证|页面不存在|笔记已删除|访问过于频繁/.test(bt); })()",
            timeout=15,
        )
        data = cdp.evaluate(_EXTRACT_JS) or {}
        # SPA 懒加载/异步水合：等内容稳定（两次提取一致）再返回
        for _ in range(8):
            time.sleep(1.2)
            new = cdp.evaluate(_EXTRACT_JS) or {}
            if new.get("content") == data.get("content"):
                break
            data = new
        content = data.get("content") or ""
        out["title"] = data.get("title")
        out["content"] = content
        out["author"] = data.get("author") or None
        out["date"] = data.get("date") or None
        out["tags"] = data.get("tags") or []
        out["note_id"] = data.get("noteId") or None
        if data.get("url") and data.get("url") != args.url:
            out["redirected_to"] = data.get("url")
        if content:
            out["ok"] = True
            if not out["title"]:
                out["title"] = "（无标题）"
        else:
            bt = cdp.evaluate("document.body ? document.body.innerText : ''") or ""
            if RISK_RE.search(bt):
                out["blocked_reason"] = "页面出现风控/验证，已停手。请降级 blocked，稍后手动查看。"
            elif LOGIN_WALL_RE.search(bt):
                out["blocked_reason"] = "未登录或登录墙拦截，请先登录小红书。"
            elif NOTFOUND_RE.search(bt):
                out["blocked_reason"] = "页面不存在/笔记已删除（可能是无 xsec_token 的直链，请改用 search 返回的带 token URL）。"
            else:
                out["blocked_reason"] = "页面未返回正文（可能为视频笔记无文字，或页面结构变化）。"
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if out["ok"] else 1


def cmd_probe(args) -> int:
    """调试用：打开一个小红书页面，dump 结构与选择器命中情况，供校准。"""
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {"ok": False, "error": None, "url": args.url, "info": None}
    try:
        cdp = Cdp(cdp_url)
        connect_xhs(cdp, cdp_url)
        cdp.navigate(args.url, wait_ready=4.0)
        out["info"] = cdp.evaluate(_PROBE_JS)
        out["ok"] = True
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if out["ok"] else 1


def cmd_launch(args) -> int:
    cfg = load_config()
    edge = next((p for p in EDGE_PATHS if os.path.exists(p)), None)
    if not edge:
        _emit({"ok": False, "error": "未找到 msedge.exe，请在 EDGE_PATHS 中补路径"}, args)
        return 1
    port = args.port or cfg.get("port", DEFAULT_PORT)
    profile = EDGE_PROFILE
    cmd = [
        edge,
        f"--user-data-dir={profile}",
        f"--remote-debugging-port={port}",
        "--profile-directory=Default",
        "--no-first-run",
        "--no-default-browser-check",
        # 新版 Edge 默认拒绝非浏览器 origin 的 CDP WebSocket，必须显式放行
        "--remote-allow-origins=*",
        "https://www.xiaohongshu.com/explore",
    ]
    flags = subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "DETACHED_PROCESS", 0)
    subprocess.Popen(cmd, creationflags=flags)
    cfg["cdp_url"] = f"http://127.0.0.1:{port}"
    cfg["port"] = port
    save_config(cfg)
    _emit(
        {
            "ok": True,
            "edge": edge,
            "profile": profile,
            "cdp_url": cfg["cdp_url"],
            "message": f"已启动独立 Edge（CDP {cfg['cdp_url']}）。请在弹出的窗口里登录 xiaohongshu.com，"
            "然后运行 `--json status` 验证登录态。",
        },
        args,
    )
    return 0


def _emit(obj: dict, args) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def parse_delay(s: str) -> tuple[float, float]:
    """'3-6' / '5' → (low, high)。"""
    s = s.strip()
    if "-" in s:
        a, b = s.split("-", 1)
        return float(a), float(b)
    v = float(s)
    return v, v


def main() -> int:
    # Windows 控制台默认 GBK，强制 UTF-8 输出
    if sys.stdout and hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    parser = argparse.ArgumentParser(description="小红书 CDP 工具：用用户自己的 Edge 登录态读取笔记正文")
    parser.add_argument("--json", action="store_true", help="stdout 输出 JSON")
    parser.add_argument("--delay", default="3-6", help="命令间最小间隔秒（默认 3-6，随机抖动）")
    parser.add_argument("--cdp-url", default=None, help="覆盖 CDP 地址（默认见 ~/.xiaohongshu-agent/config.json）")
    sub = parser.add_subparsers(dest="command", required=True)

    p_status = sub.add_parser("status", help="CDP 存活 + 小红书登录态")
    p_status.set_defaults(func=cmd_status)

    p_search = sub.add_parser("search", help="小红书搜索，返回笔记结果列表（带 xsec_token URL）")
    p_search.add_argument("query", help="搜索词，如 '九坤 量化 面经'")
    p_search.set_defaults(func=cmd_search)

    p_read = sub.add_parser("read", help="打开小红书笔记页并提取渲染正文")
    p_read.add_argument("url", help="笔记完整 URL（建议带 xsec_token，来自 search 结果）")
    p_read.set_defaults(func=cmd_read)

    p_probe = sub.add_parser("probe", help="调试：dump 页面结构（校准选择器用）")
    p_probe.add_argument("url", help="要检查的小红书页面 URL")
    p_probe.set_defaults(func=cmd_probe)

    p_launch = sub.add_parser("launch", help="启动独立 Edge CDP 窗口（供登录小红书）")
    p_launch.add_argument("--port", type=int, default=None, help="CDP 端口（默认 9224）")
    p_launch.set_defaults(func=cmd_launch)

    args = parser.parse_args()

    if args.command in ("search", "read", "probe"):
        try:
            acquire_lock()
        except XhsToolError as exc:
            _emit({"ok": False, "error": str(exc)}, args)
            return 1
        try:
            throttle_wait(parse_delay(args.delay))
            return args.func(args)
        finally:
            release_lock()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

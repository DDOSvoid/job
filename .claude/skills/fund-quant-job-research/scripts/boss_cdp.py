#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Boss直聘 CDP 工具 —— 用用户自己的 Edge 登录态读网页版岗位列表。

当 boss-agent-cli（API 通道）触发风控（code=36 / TOKEN_REFRESH_FAILED）时，
skill 会通过 boss_throttle.py 自动切换到本脚本：直接驱动**用户自己登录的
Edge**（Chrome DevTools Protocol）打开 Boss直聘网页版搜索页，读取岗位卡片。
真实浏览器自己携带真实 UA、cookie 与登录态；本工具不做任何逆向签名、不伪造
UA、不提取 cookie 值、不自动解验证码 —— 只读取"用户已登录账号本来就能看"
的页面，低频率访问。

边界（硬性）：
- 只读网页版搜索页/职位页；若页面出现安全验证、登录墙、空结果，立即停止、
  如实返回错误，绝不重试硬闯、绝不自动解验证码。
- 内置节流（~/.boss-agent/cdp-throttle.json 全局生效，跨进程）+ 单实例锁。
- 复用 boss 的登录 profile（~/.boss-agent/edge-cdp），登录态在 Edge 重启后
  保留在磁盘上，重启不丢。
- 若 9222 上已有 Edge 但未放行非浏览器 origin（WebSocket 403），search 会
  自动用独立 profile 重启该窗口（带 --remote-allow-origins=*）；只杀匹配
  boss profile 的 msedge 进程，绝不动用户的正式 Edge。

用法（Windows 下先设 UTF-8）:
    PYTHONUTF8=1 python boss_cdp.py launch                       # 启动/重启独立 Edge CDP（端口 9222，带 origin 放行）
    PYTHONUTF8=1 python boss_cdp.py --json status                # CDP 存活 + Boss 登录态
    PYTHONUTF8=1 python boss_cdp.py --json search "量化研究员" --city 上海
    PYTHONUTF8=1 python boss_cdp.py --json detail <job_id>

全局选项（放在子命令前，与 boss 一致）:
    --json          stdout 输出 JSON（供 skill 解析）
    --delay "15-25" 命令间最小间隔（秒，默认 "15-25"，随机抖动；网页版比 API 更敏感）
    --cdp-url URL   覆盖 CDP 地址（默认 http://127.0.0.1:9222）
"""

import argparse
import json
import os
import random
import subprocess
import sys
import time

import requests
import websocket

DATA_DIR = os.path.join(os.path.expanduser("~"), ".boss-agent")
CONFIG_FILE = os.path.join(DATA_DIR, "cdp-config.json")
THROTTLE_FILE = os.path.join(DATA_DIR, "cdp-throttle.json")
LOCK_FILE = os.path.join(DATA_DIR, "cdp-lock")
EDGE_PROFILE = os.path.join(DATA_DIR, "edge-cdp")  # 与 boss login --cdp 同一 profile，登录态共用
DEFAULT_CDP = "http://127.0.0.1:9222"
DEFAULT_PORT = 9222
LOCK_TTL = 300  # 秒；超过视为陈旧锁

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

# Boss直聘网页版 geek 搜索页常用城市代码（缺失时省略 city 参数，用浏览器当前城市）
CITY_CODES = {
    "北京": "101010100", "上海": "101020100", "天津": "101030100", "重庆": "101040100",
    "沈阳": "101070100", "大连": "101070200", "长春": "101060100", "哈尔滨": "101050100",
    "石家庄": "101090100", "太原": "101100100", "西安": "101110100", "济南": "101120100",
    "青岛": "101120200", "南京": "101190100", "苏州": "101190400", "无锡": "101190200",
    "杭州": "101210100", "宁波": "101210400", "合肥": "101220100", "福州": "101230100",
    "厦门": "101230200", "武汉": "101200100", "长沙": "101250100", "广州": "101280100",
    "深圳": "101280600", "成都": "101270100", "郑州": "101180100", "昆明": "101290100",
}

# 页面级风控特征（出现即停，不自动解验证码）。
# 搜索页真实结果卡片容器是 li.job-card-box（顶部"城市推荐"模块的 sub-li 卡片不是结果，不参与计数）。
# 必须等到卡片里出现 job_detail 锚点才算渲染完成——只出现卡片壳（骨架）时提取会拿到空结果。
_WAIT_CARDS_JS = (
    "(document.querySelectorAll('li.job-card-box a[href*=\"/job_detail/\"]').length > 0"
    " || /安全验证|请完成验证|拖动滑块|验证码|访问过于频繁|访问异常/.test(document.body.innerText)"
    " || document.body.innerText.includes('没有找到相关职位')"
    " || document.body.innerText.includes('请登录'))"
)

_CHECK_RISK_JS = r"""
(() => {
  const txt = document.body ? document.body.innerText : '';
  const href = location.href || '';
  const onZhipin = /^https?:\/\/(www\.)?zhipin\.com/.test(href);
  const marks = ['安全验证', '请完成验证', '拖动滑块', '验证码', '访问过于频繁', '访问异常', '滑动拼图'];
  for (const m of marks) {
    if (txt.includes(m)) return { blocked: true, type: 'verification', href, onZhipin, detail: '页面出现「' + m + '」，已停止，不自动解验证码' };
  }
  const cards = document.querySelectorAll('li.job-card-box').length;
  if (cards === 0) {
    // 空白页/非同源文档上读 cookie 会抛 SecurityError，这里捕获后当未登录处理
    let loggedIn = false;
    try { loggedIn = /__zp_stoken__|zp_at/.test(document.cookie); } catch (e) { loggedIn = false; }
    if (!loggedIn) return { blocked: true, type: 'login_wall', href, onZhipin, detail: '浏览器未登录 zhipin（无 __zp_stoken__/zp_at）。请先登录，再重试' };
    if (txt.includes('没有找到相关职位')) return { blocked: false, no_result: true, href, onZhipin, detail: '无匹配岗位' };
  }
  return { blocked: false, no_result: false, href, onZhipin };
})()
"""

_EXTRACT_CARDS_JS = r"""
(() => {
  const PUA = /[\uE000-\uF8FF]/;
  const cards = Array.from(document.querySelectorAll('li.job-card-box')).slice(0, 15);
  const out = [];
  for (const li of cards) {
    const a = li.querySelector('a[href*="/job_detail/"]');
    if (!a) continue;
    const href = a.getAttribute('href') || a.href;
    // Boss 岗位 ID 是 base64 风格，含 - 和 _（如 ...0nJ-2tS6FlpQ / ...31_2tm5ElNX），
    // 只取 [a-zA-Z0-9] 会把它们整条丢掉，导致 results 为 0。
    const m = href.match(/job_detail\/([A-Za-z0-9_-]+)\.html/);
    if (!m) continue;
    const raw = href.split('?')[0];
    const url = raw.startsWith('http') ? raw : 'https://www.zhipin.com' + raw;
    const title = (li.querySelector('.job-name') || a).textContent.trim();
    let salary = (li.querySelector('.job-salary')?.textContent || '').trim();
    // 列表页薪资数字被字体混淆（PUA 私用区字符）。不逆向解码反爬字体，
    // 如实标记为空；需要真实薪资就走 detail 命令打开岗位详情页。
    const salaryObf = PUA.test(salary);
    if (salaryObf) salary = '';
    const company = (li.querySelector('.boss-name')?.textContent || '').trim();
    const location = (li.querySelector('.company-location')?.textContent || '').trim().replace(/\s+/g, ' ');
    const tags = Array.from(li.querySelectorAll('.tag-list li')).map(e => e.textContent.trim()).slice(0, 5);
    out.push({
      job_id: m[1],
      url: url,
      title: title.slice(0, 80),
      salary: salary.slice(0, 30),
      salary_obfuscated: salaryObf,
      company: company.slice(0, 60),
      location: location.slice(0, 30),
      tags: tags,
    });
  }
  return out;
})()
"""

_EXTRACT_DETAIL_JS = r"""
(() => {
  const txt = document.body.innerText;
  if (/安全验证|请完成验证|拖动滑块/.test(txt)) return { blocked: true };
  const h1 = document.querySelector('h1');
  const title = h1 ? (h1.textContent || '').trim().slice(0, 80) : '';
  // 岗位自己的薪资在 .info-primary/.job-primary 的 .name 下，是明文；
  // 页面下方"看了又看"相似职位的 similar-job-salary 不要误取。
  const salaryEl = document.querySelector('.info-primary .salary, .job-primary .salary, .name .salary');
  const salary = salaryEl ? (salaryEl.textContent || '').trim().slice(0, 30) : '';
  const sec = document.querySelector('.job-sec-text, .job-description, .job-sec, .detail-content, .job-detail');
  const description = sec ? (sec.innerText || '').trim() : (document.body.innerText || '').slice(0, 3000);
  return { blocked: false, title, salary, description };
})()
"""


class BossCdpError(Exception):
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
        sys.stderr.write(f"[boss-cdp] 节流等待 {wait:.1f}s\n")
        time.sleep(wait)
    low, high = interval_range
    data["next_slot"] = time.time() + random.uniform(low, high)
    counts = data.get("counts", [])[-200:]
    counts.append(time.time())
    data["counts"] = counts
    _ensure_data_dir()
    with open(THROTTLE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    sys.stderr.write("[boss-cdp] 命令开始，节流窗口已推进\n")


def acquire_lock():
    _ensure_data_dir()
    if os.path.exists(LOCK_FILE):
        age = time.time() - os.path.getmtime(LOCK_FILE)
        if age < LOCK_TTL:
            raise BossCdpError(
                f"另一个 boss_cdp 命令仍在运行（锁文件 {LOCK_FILE}，<{LOCK_TTL}s 前创建）。"
                "请等它结束，或删除该锁文件后重试。"
            )
        sys.stderr.write("[boss-cdp] 检测到陈旧锁，覆盖。\n")
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

    def new_tab(self, url: str = "") -> dict:
        """开一个空白新 tab。新版 Chrome 的 PUT /json/new 会忽略 url 参数（实测
        带 url 也停在 about:blank），所以只开空白页，导航交给 WebSocket 的 Page.navigate。"""
        r = requests.put(f"{self.cdp_url}/json/new", timeout=5)
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
            raise BossCdpError("未连接 CDP WebSocket")
        self._next_id += 1
        mid = self._next_id
        self._ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self._ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise BossCdpError(f"CDP {method} 失败: {msg['error'].get('message', msg['error'])}")
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
            raise BossCdpError("页面 JS 执行异常: " + json.dumps(res["exceptionDetails"], ensure_ascii=False)[:300])
        return (res.get("result") or {}).get("value")

    def navigate(self, url: str, wait_ready: float = 3.0):
        self._send("Page.navigate", {"url": url})
        deadline = time.time() + 25
        while time.time() < deadline:
            time.sleep(0.5)
            try:
                if self.evaluate("document.readyState") == "complete":
                    break
            except BossCdpError:
                pass  # 页面跳转瞬间执行上下文会短暂失效，忽略并继续轮询
        time.sleep(wait_ready)  # SPA 数据渲染需要额外时间

    def wait_href_zhipin(self, timeout: float = 12.0) -> bool:
        """等页面导航离开 about:blank、落到 zhipin.com 上。导航失败时用。"""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                href = self.evaluate("location.href") or ""
                if href and href != "about:blank" and "zhipin.com" in href:
                    return True
            except BossCdpError:
                pass
            time.sleep(0.5)
        return False

    def wait_for(self, expr: str, timeout: float = 12.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.evaluate(expr):
                    return True
            except BossCdpError:
                pass
            time.sleep(0.6)
        return False


# ---------- Edge 生命周期 ----------

def _port_open(cdp_url: str) -> bool:
    try:
        requests.get(cdp_url + "/json/version", timeout=5)
        return True
    except Exception:
        return False


def _ws_ok(cdp: Cdp) -> bool:
    """探测 9222 上的 Edge 是否接受非浏览器 WebSocket（有 --remote-allow-origins=*）。"""
    try:
        for t in cdp.tabs():
            if t.get("type") == "page":
                ws_url = t.get("webSocketDebuggerUrl")
                if not ws_url:
                    continue
                ws = websocket.create_connection(ws_url, timeout=8)
                ws.close()
                return True
    except Exception:
        return False
    return False


def _kill_boss_edge():
    """只杀匹配 boss profile（~/.boss-agent/edge-cdp）的 msedge 进程，绝不动用户正式 Edge。"""
    ps = (
        "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
        "Where-Object { $_.CommandLine -like '*boss-agent*edge-cdp*' } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            timeout=30, capture_output=True, text=True,
        )
    except Exception:
        pass
    # 等端口释放（旧实例可能短暂残存）
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            requests.get(f"http://127.0.0.1:{DEFAULT_PORT}/json/version", timeout=2)
            time.sleep(0.5)
        except Exception:
            return


def _launch(port: int):
    edge = next((p for p in EDGE_PATHS if os.path.exists(p)), None)
    if not edge:
        raise BossCdpError("未找到 msedge.exe，请在 EDGE_PATHS 中补路径")
    cmd = [
        edge,
        f"--user-data-dir={EDGE_PROFILE}",
        f"--remote-debugging-port={port}",
        "--profile-directory=Default",
        "--no-first-run",
        "--no-default-browser-check",
        # 新版 Edge 默认拒绝非浏览器 origin 的 CDP WebSocket，必须显式放行
        "--remote-allow-origins=*",
        "https://www.zhipin.com",
    ]
    flags = subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "DETACHED_PROCESS", 0)
    subprocess.Popen(cmd, creationflags=flags)


def ensure_cdp(cdp: Cdp, cdp_url: str) -> None:
    """保证 9222 上有一个可用的 Boss Edge：端口没开→启动；开了但 WS 403→重启。
    重启用同一 profile（~/.boss-agent/edge-cdp），登录态保留在磁盘上。"""
    cfg = load_config()
    port = cfg.get("port", DEFAULT_PORT)
    if _port_open(cdp_url) and _ws_ok(cdp):
        return
    if _port_open(cdp_url):
        sys.stderr.write(
            "[boss-cdp] 9222 上的 Edge 未放行 CDP WebSocket（403）。"
            "将用独立 profile 重启该窗口（登录态保留）…\n"
        )
    else:
        sys.stderr.write("[boss-cdp] 未检测到 9222 的 CDP，启动独立 Edge…\n")
    _kill_boss_edge()
    _launch(port)
    deadline = time.time() + 60
    while time.time() < deadline:
        time.sleep(1)
        try:
            if _port_open(cdp_url) and _ws_ok(cdp):
                return
        except Exception:
            pass
    raise BossCdpError("Edge 启动后 CDP 仍不可用（60s 内未就绪）")


def find_boss_tab(cdp: Cdp) -> dict | None:
    """优先返回 geek/jobs 搜索结果页 tab（SPA），否则任意 zhipin 页 tab。
    首页推荐模块（sub-li）和搜索结果（li.job-card-box）的 DOM 结构不同，
    选错 tab 会让提取结果不可靠，所以要优先挑 geek SPA tab。"""
    pages = [t for t in cdp.tabs() if t.get("type") == "page" and "zhipin.com" in t.get("url", "")]
    if not pages:
        return None
    for t in pages:
        u = t.get("url", "")
        if "/geek/" in u or "geek/jobs" in u:
            return t
    return pages[0]


def _close_other_zhipin_tabs(cdp: Cdp, keep_tab_id: str | None) -> None:
    """关掉多余的 zhipin tab，避免后续 search 被陈旧 tab 干扰（会话恢复会开多个）。"""
    for t in cdp.tabs():
        if t.get("type") != "page" or "zhipin.com" not in t.get("url", ""):
            continue
        if keep_tab_id and t.get("id") == keep_tab_id:
            continue
        try:
            requests.put(f"{cdp.cdp_url}/json/close/{t['id']}", timeout=5)
        except Exception:
            pass


def connect_boss(cdp: Cdp, cdp_url: str) -> Cdp:
    """拿一个 zhipin tab 并连上 WebSocket；没有就新建一个。连接后关掉多余 tab。
    仅用于 status 这类不需要整页加载目标的诊断命令。"""
    tab = find_boss_tab(cdp)
    if tab is None:
        tab = cdp.new_tab()
    ws_url = tab.get("webSocketDebuggerUrl")
    if not ws_url:
        raise BossCdpError("CDP tab 没有 webSocketDebuggerUrl（Edge 可能正在启动，稍后重试）")
    cdp.connect(ws_url)
    _close_other_zhipin_tabs(cdp, tab.get("id"))
    return cdp


def open_fresh_zhipin_tab(cdp: Cdp, url: str) -> Cdp:
    """关掉所有旧 zhipin tab，开一个全新空白 tab 并整页导航到 url。

    复用已有 tab 导航到搜索 URL 不可靠：首页 tab 的 SPA 路由会把
    web/geek/jobs?query=… 的查询参数吞掉、退成通用列表。全新 tab 走整页
    加载，服务器按完整 URL 渲染，结果最稳定。"""
    tab = cdp.new_tab()
    ws_url = tab.get("webSocketDebuggerUrl")
    if not ws_url:
        raise BossCdpError("新 tab 没有 webSocketDebuggerUrl（Edge 可能正在启动，稍后重试）")
    cdp.connect(ws_url)
    # 先开好新 tab 再清理旧 zhipin tab——若先关旧 tab 且它是最后一个 page tab，
    # Edge 会整个退出（浏览器在最后一个 tab 关闭时自动退出）。
    _close_other_zhipin_tabs(cdp, tab.get("id"))
    # 整页加载；约 10s 内没离开 about:blank 就重试一次导航（偶尔一次导航不生效）
    for _attempt in (1, 2):
        cdp.navigate(url, wait_ready=2.0)
        if cdp.wait_href_zhipin(timeout=10):
            return cdp
    raise BossCdpError(
        "搜索页加载失败：导航后仍停留在空白页（about:blank）。可能被网页侧限流，请稍后再试"
    )


# ---------- 各命令 ----------

def cmd_status(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {"ok": False, "cdp": False, "ws": False, "logged_in": False, "browser": None, "error": None}
    try:
        ver = Cdp(cdp_url).version()
        out["cdp"] = True
        out["browser"] = ver.get("Browser")
        cdp = Cdp(cdp_url)
        if not _ws_ok(cdp):
            out["error"] = "Edge 未放行 CDP WebSocket（403）。请运行 `boss_cdp.py launch`（或 search 会自动重启）"
            _emit(out, args)
            return 1
        out["ws"] = True
        connect_boss(cdp, cdp_url)
        if "zhipin.com" not in (cdp.evaluate("location.host") or ""):
            cdp.navigate("https://www.zhipin.com", wait_ready=2.0)
        state = cdp.evaluate(
            "(() => { const c = document.cookie; "
            "return {host: location.host, logged_in: /__zp_stoken__|zp_at/.test(c)}; })()"
        ) or {}
        out["logged_in"] = bool(state.get("logged_in"))
        if not out["logged_in"]:
            out["error"] = "浏览器未登录 zhipin（无 __zp_stoken__/zp_at）。请先在 launch 的窗口里登录"
        out["ok"] = True
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if (out["ok"] and out["cdp"] and out["logged_in"]) else 1


def cmd_launch(args) -> int:
    cfg = load_config()
    port = args.port or cfg.get("port", DEFAULT_PORT)
    cdp_url = f"http://127.0.0.1:{port}"
    ok = False
    error = None
    try:
        _kill_boss_edge()
        _launch(port)
        deadline = time.time() + 60
        while time.time() < deadline:
            time.sleep(1)
            try:
                if _port_open(cdp_url) and _ws_ok(Cdp(cdp_url)):
                    ok = True
                    break
            except Exception:
                pass
        if not ok:
            error = "Edge 启动后 CDP 仍不可用（60s 内未就绪）"
    except BossCdpError as exc:
        error = str(exc)
    if not ok:
        _emit({"ok": False, "error": error}, args)
        return 1
    cfg["cdp_url"] = cdp_url
    cfg["port"] = port
    save_config(cfg)
    _emit(
        {
            "ok": True,
            "cdp_url": cdp_url,
            "profile": EDGE_PROFILE,
            "message": "已启动独立 Edge（CDP 9222，带 origin 放行）。登录态保留在 profile 里；"
            "若弹出的窗口里未登录 zhipin，请先登录，然后运行 `--json status` 验证。",
        },
        args,
    )
    return 0


def cmd_search(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {
        "ok": False,
        "error": None,
        "risk": False,
        "risk_type": None,
        "query": args.query,
        "city": args.city,
        "city_code": None,
        "searched_url": None,
        "results": [],
    }
    try:
        cdp = Cdp(cdp_url)
        ensure_cdp(cdp, cdp_url)
        code = CITY_CODES.get(args.city or "", "")
        out["city_code"] = code or None
        url = "https://www.zhipin.com/web/geek/jobs?query=" + requests.utils.quote(args.query)
        if code:
            url += "&city=" + code
        out["searched_url"] = url
        open_fresh_zhipin_tab(cdp, url)
        if not cdp.wait_for(_WAIT_CARDS_JS, timeout=20):
            # 超时：可能是空白/验证页，交给风险检测定夺
            pass
        risk = cdp.evaluate(_CHECK_RISK_JS) or {}
        if risk.get("blocked"):
            out["risk"] = True
            out["risk_type"] = risk.get("type")
            if risk.get("type") == "login_wall" and not risk.get("onZhipin"):
                # 空白页/未加载页读不到 cookie 被当成未登录——其实多半是导航失败/限流
                out["error"] = (
                    "搜索页未加载（当前页面 "
                    + str(risk.get("href", ""))[:40]
                    + "，不在 zhipin.com）。可能被网页侧限流，请稍后再试"
                )
            else:
                out["error"] = risk.get("detail", "页面出现风控/登录墙，已停止")
            cdp.close()
            _emit(out, args)
            return 1
        if risk.get("no_result"):
            # 合法空结果：搜索确实没有匹配岗位，不是渲染失败
            out["ok"] = True
            out["note"] = risk.get("detail", "无匹配岗位")
            cdp.close()
            _emit(out, args)
            return 0
        state = cdp.evaluate(
            "(() => ({href: location.href, cards: document.querySelectorAll('li.job-card-box a[href*=\"/job_detail/\"]').length}))()"
        ) or {}
        if not state.get("cards"):
            # 没有卡片且不在搜索页：多半被网页侧限流弹回首页，报错而不是假空结果
            if "geek/jobs" not in (state.get("href") or ""):
                out["error"] = (
                    "搜索页未停留在搜索结果页（当前 "
                    + str(state.get("href"))[:50]
                    + "）。可能是网页侧限流跳转或页面未加载，请稍后再试。"
                )
            else:
                out["error"] = "搜索页未渲染出岗位卡片（li.job-card-box 为空）"
            cdp.close()
            _emit(out, args)
            return 1
        results = cdp.evaluate(_EXTRACT_CARDS_JS) or []
        out["results"] = results
        out["ok"] = True
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if out["ok"] else 1


def cmd_detail(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {"ok": False, "error": None, "job_id": args.job_id, "url": None, "title": None, "salary": None, "description": None}
    try:
        cdp = Cdp(cdp_url)
        ensure_cdp(cdp, cdp_url)
        url = "https://www.zhipin.com/job_detail/" + args.job_id + ".html"
        out["url"] = url
        open_fresh_zhipin_tab(cdp, url)
        cdp.wait_for(
            "(document.querySelector('.job-sec-text, .job-description, .job-sec') !== null"
            " || /安全验证|请完成验证|拖动滑块/.test(document.body.innerText))",
            timeout=15,
        )
        data = cdp.evaluate(_EXTRACT_DETAIL_JS) or {}
        if data.get("blocked"):
            out["error"] = "职位页出现安全验证，已停止，不自动解验证码"
            cdp.close()
            _emit(out, args)
            return 1
        out["title"] = data.get("title")
        out["salary"] = data.get("salary")
        out["description"] = data.get("description")
        out["ok"] = bool(data.get("description"))
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if out["ok"] else 1


def _emit(obj: dict, args) -> None:
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def parse_delay(s: str) -> tuple[float, float]:
    """'15-25' / '5' → (low, high)。"""
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

    parser = argparse.ArgumentParser(description="Boss直聘 CDP 工具：用用户自己的 Edge 登录态读网页版岗位列表")
    parser.add_argument("--json", action="store_true", help="stdout 输出 JSON")
    parser.add_argument("--delay", default="15-25", help="命令间最小间隔秒（默认 15-25，随机抖动）")
    parser.add_argument("--cdp-url", default=None, help="覆盖 CDP 地址（默认见 ~/.boss-agent/cdp-config.json）")
    sub = parser.add_subparsers(dest="command", required=True)

    p_status = sub.add_parser("status", help="CDP 存活 + Boss 登录态")
    p_status.set_defaults(func=cmd_status)

    p_launch = sub.add_parser("launch", help="启动/重启独立 Edge CDP（供登录 Boss，带 origin 放行）")
    p_launch.add_argument("--port", type=int, default=None, help="CDP 端口（默认 9222）")
    p_launch.set_defaults(func=cmd_launch)

    p_search = sub.add_parser("search", help="Boss直聘网页版搜索岗位，返回岗位卡片")
    p_search.add_argument("query", help="搜索词，如 '量化研究员'")
    p_search.add_argument("--city", default=None, help="城市（中文，如 上海）；未知城市则省略 city 参数")
    p_search.set_defaults(func=cmd_search)

    p_detail = sub.add_parser("detail", help="打开职位页并提取岗位描述")
    p_detail.add_argument("job_id", help="职位 job_id")
    p_detail.set_defaults(func=cmd_detail)

    args = parser.parse_args()

    if args.command in ("search", "detail"):
        try:
            acquire_lock()
        except BossCdpError as exc:
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

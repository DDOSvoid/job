#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知乎 CDP 工具 —— 用用户自己的 Edge 登录态读取知乎正文。

镜像 fund-quant-job-research 的 boss-agent-cli 模式：驱动**用户自己登录的
Edge**（Chrome DevTools Protocol），真实浏览器自己计算 x-zse-96 签名、携带
真实 UA 与 cookie。本工具不做任何逆向签名、不做指纹伪装、不提取 cookie、
不伪造 UA —— 只读取"用户已登录账号本来就能看"的页面，低频率访问。

边界（硬性）：
- 只读公开/用户登录可见内容；游客搜索知乎已关闭，必须登录后才能 search。
- 内置节流（~/.zhihu-agent/throttle.json 全局生效，跨进程）+ 单实例锁，
  防止并行命令把风控引到用户账号上。
- 若知乎触发验证码/风控（页面出现验证、返回空结果等），立即停止、如实
  返回错误，不要反复重试硬闯。

用法（Windows 下先设 UTF-8）:
    PYTHONUTF8=1 python zhihu_cdp.py launch                       # 启动独立 Edge CDP（端口 9223）
    PYTHONUTF8=1 python zhihu_cdp.py --json status                # CDP 存活 + 知乎登录态
    PYTHONUTF8=1 python zhihu_cdp.py --json search "九坤 量化 面经"
    PYTHONUTF8=1 python zhihu_cdp.py --json read "https://www.zhihu.com/question/549344901"
    PYTHONUTF8=1 python zhihu_cdp.py --json read "https://zhuanlan.zhihu.com/p/619631351"

全局选项（放在子命令前，与 boss 一致）:
    --json          stdout 输出 JSON（供 skill 解析）
    --delay "2-5"   命令间最小间隔（秒，默认 "3-6"，随机抖动）
    --cdp-url URL   覆盖 CDP 地址（默认 http://127.0.0.1:9223）
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

DATA_DIR = os.path.join(os.path.expanduser("~"), ".zhihu-agent")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
THROTTLE_FILE = os.path.join(DATA_DIR, "throttle.json")
LOCK_FILE = os.path.join(DATA_DIR, "lock")
EDGE_PROFILE = os.path.join(DATA_DIR, "edge-cdp")
DEFAULT_CDP = "http://127.0.0.1:9223"
DEFAULT_PORT = 9223
LOCK_TTL = 300  # 秒；超过视为陈旧锁

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

# 知乎搜索页结果卡片 / 正文容器选择器（保留多候选，站点改版时兜底用）
SEARCH_CARD_SELS = [".SearchResult-Card"]
SEARCH_TITLE_SELS = ["h2 a", ".ContentItem-title a", "a.css-4rbku5", "a"]
SEARCH_SNIPPET_SELS = [".SearchItem-excerpt", ".RichText", ".Highlight", ".ContentItem-content"]
POST_CONTENT_SELS = [
    ".Post-RichTextContainer",
    ".Post-Main .Post-RichText",
    ".RichText.ztext.Post-RichText",
    "article",
]
ANSWER_SELS = [".AnswerItem"]
AUTHOR_SELS = [".AuthorInfo-name", ".AuthorInfo .UserLink-link", ".UserLink"]
ANSWER_TEXT_SELS = [".RichContent-inner"]

# 读正文提取 JS：专栏文章 → 问答页回答块 → 通用正文兜底
_EXTRACT_JS = (
    "(() => { const out = {url: location.href, title: document.title, content: '', collapsed: false};"
    " const post = document.querySelector('.Post-RichTextContainer, .RichText.ztext.Post-RichText, article');"
    " if (post) { out.content = post.innerText; return out; }"
    " const items = Array.from(document.querySelectorAll('.AnswerItem')).filter(el => el.querySelector('.RichContent'));"
    " if (items.length) {"
    "   out.content = items.map(el => {"
    "     const au = el.querySelector('.AuthorInfo-name, .UserLink');"
    "     const tx = el.querySelector('.RichContent-inner');"
    "     const head = au ? '【' + au.textContent.trim() + '】\\n' : '';"
    "     return head + (tx ? tx.innerText.trim() : '');"
    "   }).join('\\n\\n---\\n\\n');"
    "   out.collapsed = document.body.innerText.includes('查看全部');"
    "   return out;"
    " }"
    " const main = document.querySelector('.RichText, .RichContent, main');"
    " if (main) { out.content = main.innerText; return out; }"
    " out.content = document.body.innerText;"
    " return out; })()"
)


class ZhihuToolError(Exception):
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
        sys.stderr.write(f"[zhihu] 节流等待 {wait:.1f}s\n")
        time.sleep(wait)
    low, high = interval_range
    data["next_slot"] = time.time() + random.uniform(low, high)
    counts = data.get("counts", [])[-200:]
    counts.append(time.time())
    data["counts"] = counts
    _ensure_data_dir()
    with open(THROTTLE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    sys.stderr.write("[zhihu] 命令开始，节流窗口已推进\n")


def acquire_lock():
    _ensure_data_dir()
    if os.path.exists(LOCK_FILE):
        age = time.time() - os.path.getmtime(LOCK_FILE)
        if age < LOCK_TTL:
            raise ZhihuToolError(
                f"另一个 zhihu 命令仍在运行（锁文件 {LOCK_FILE}，<{LOCK_TTL}s 前创建）。"
                "请等它结束，或删除该锁文件后重试。"
            )
        sys.stderr.write("[zhihu] 检测到陈旧锁，覆盖。\n")
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
            raise ZhihuToolError("未连接 CDP WebSocket")
        self._next_id += 1
        mid = self._next_id
        self._ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self._ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise ZhihuToolError(f"CDP {method} 失败: {msg['error'].get('message', msg['error'])}")
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
            raise ZhihuToolError("页面 JS 执行异常: " + json.dumps(res["exceptionDetails"], ensure_ascii=False)[:300])
        return (res.get("result") or {}).get("value")

    def navigate(self, url: str, wait_ready: float = 3.0):
        self._send("Page.navigate", {"url": url})
        deadline = time.time() + 25
        while time.time() < deadline:
            time.sleep(0.5)
            try:
                if self.evaluate("document.readyState") == "complete":
                    break
            except ZhihuToolError:
                break  # 页面在跳转，重连或忽略
        time.sleep(wait_ready)  # SPA 数据渲染需要额外时间

    def wait_for(self, expr: str, timeout: float = 12.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.evaluate(expr):
                    return True
            except ZhihuToolError:
                pass
            time.sleep(0.6)
        return False


def find_zhihu_tab(cdp: Cdp) -> dict | None:
    for t in cdp.tabs():
        if t.get("type") == "page" and "zhihu.com" in t.get("url", ""):
            return t
    return None


def connect_zhihu(cdp: Cdp, cdp_url: str) -> Cdp:
    """拿一个知乎 tab 并连上 WebSocket；没有就新建一个。"""
    tab = find_zhihu_tab(cdp)
    if tab is None:
        tab = cdp.new_tab("https://www.zhihu.com")
    ws_url = tab.get("webSocketDebuggerUrl")
    if not ws_url:
        raise ZhihuToolError("CDP tab 没有 webSocketDebuggerUrl（Edge 可能正在启动，稍后重试）")
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
        connect_zhihu(cdp, cdp_url)
        # 确保在 www.zhihu.com 域上再探测登录态
        if "zhihu.com" not in (cdp.evaluate("location.host") or ""):
            cdp.navigate("https://www.zhihu.com", wait_ready=2.0)
        cdp.navigate("https://www.zhihu.com", wait_ready=2.0)
        login = cdp.evaluate(
            "(async () => { try { const r = await fetch('/api/v4/me', {credentials:'include'});"
            " const j = await r.json(); return j && j.name ? j.name : 'NOT_LOGGED_IN'; }"
            " catch (e) { return 'ERR:' + (e && e.message || e); } })()",
            await_promise=True,
        )
        if login and login != "NOT_LOGGED_IN" and not login.startswith("ERR"):
            out["logged_in"] = True
            out["login_user"] = login
        else:
            out["error"] = "NOT_LOGGED_IN 或 /api/v4/me 探测失败: " + str(login)
        out["ok"] = True
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if (out["ok"] and out["cdp"] and out["logged_in"]) else 1


def cmd_search(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {"ok": False, "error": None, "results": []}
    try:
        cdp = Cdp(cdp_url)
        connect_zhihu(cdp, cdp_url)
        url = "https://www.zhihu.com/search?type=content&q=" + requests.utils.quote(args.query)
        cdp.navigate(url, wait_ready=2.0)
        if not cdp.wait_for(
            "(document.querySelectorAll('.SearchResult-Card').length > 0 ||"
            " document.body.innerText.includes('请先登录') || document.body.innerText.includes('登录'))",
            timeout=15,
        ):
            raise ZhihuToolError("搜索页 15s 内未渲染出结果卡片或登录提示")
        results = cdp.evaluate(
            "(() => { const cards = Array.from(document.querySelectorAll('.SearchResult-Card')).slice(0, 10);"
            " if (!cards.length) return [];"
            " return cards.map(c => {"
            "   const a = c.querySelector('h2 a, .ContentItem-title a, a');"
            "   const url = a ? a.href : '';"
            "   const title = a ? a.textContent.trim() : '';"
            "   let snippet = (c.innerText || '').replace(title, '').trim();"
            "   snippet = snippet.replace(/赞同[\\s\\S]*$/, '').replace(/\\s+/g, ' ').replace(/阅读全文\\s*$/, '').trim();"
            "   return {url, title, snippet};"
            " }).filter(x => x.url && /zhihu\\.com\\/(question|zhuanlan|p\\/|answer)/.test(x.url) && x.title);"
            " })()"
        )
        out["results"] = results or []
        out["ok"] = True
        cdp.close()
    except Exception as exc:  # noqa: BLE001
        out["error"] = f"{type(exc).__name__}: {exc}"
    _emit(out, args)
    return 0 if out["ok"] else 1


def cmd_read(args) -> int:
    cfg = load_config()
    cdp_url = args.cdp_url or cfg["cdp_url"]
    out = {"ok": False, "error": None, "url": args.url, "title": None, "content": None, "partial_reason": None}
    try:
        cdp = Cdp(cdp_url)
        connect_zhihu(cdp, cdp_url)
        cdp.navigate(args.url, wait_ready=2.5)
        # 等待正文容器出现（专栏文章）或回答块出现（问答页）
        cdp.wait_for(
            "(document.querySelector('.Post-RichTextContainer, .RichText.ztext.Post-RichText, article') !== null"
            " || document.querySelectorAll('.AnswerItem').length > 0)",
            timeout=15,
        )
        data = cdp.evaluate(_EXTRACT_JS) or {}
        # SPA 懒加载：正文可能仍在渲染，等内容稳定（两次提取一致）再返回
        for _ in range(8):
            time.sleep(1.2)
            new = cdp.evaluate(_EXTRACT_JS) or {}
            if new.get("content") == data.get("content"):
                break
            data = new
        content = data.get("content") or ""
        if not content:
            raise ZhihuToolError("页面未返回任何内容（可能被验证墙拦截，返回空）")
        out["title"] = data.get("title")
        out["content"] = content
        if data.get("collapsed"):
            out["partial_reason"] = "问答页存在未展开的'查看全部'回答，正文可能不完整"
        if data.get("url") and data.get("url") != args.url:
            out["redirected_to"] = data.get("url")
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
        "https://www.zhihu.com",
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
            "message": f"已启动独立 Edge（CDP {cfg['cdp_url']}）。请在弹出的窗口里登录 zhihu.com，"
            "然后运行 `--json status` 验证登录态。",
        },
        args,
    )
    return 0


def _emit(obj: dict, args) -> None:
    if args.json:
        print(json.dumps(obj, ensure_ascii=False, indent=2))
    else:
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

    parser = argparse.ArgumentParser(description="知乎 CDP 工具：用用户自己的 Edge 登录态读取知乎正文")
    parser.add_argument("--json", action="store_true", help="stdout 输出 JSON")
    parser.add_argument("--delay", default="3-6", help="命令间最小间隔秒（默认 3-6，随机抖动）")
    parser.add_argument("--cdp-url", default=None, help="覆盖 CDP 地址（默认见 ~/.zhihu-agent/config.json）")
    sub = parser.add_subparsers(dest="command", required=True)

    p_status = sub.add_parser("status", help="CDP 存活 + 知乎登录态")
    p_status.set_defaults(func=cmd_status)

    p_search = sub.add_parser("search", help="知乎搜索，返回结果列表")
    p_search.add_argument("query", help="搜索词，如 '九坤 量化 面经'")
    p_search.set_defaults(func=cmd_search)

    p_read = sub.add_parser("read", help="打开知乎页面并提取渲染正文")
    p_read.add_argument("url", help="知乎问题/专栏文章 URL")
    p_read.set_defaults(func=cmd_read)

    p_launch = sub.add_parser("launch", help="启动独立 Edge CDP 窗口（供登录知乎）")
    p_launch.add_argument("--port", type=int, default=None, help="CDP 端口（默认 9223）")
    p_launch.set_defaults(func=cmd_launch)

    args = parser.parse_args()

    if args.command in ("search", "read"):
        try:
            acquire_lock()
        except ZhihuToolError as exc:
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

#!/usr/bin/env python3
"""Boss直聘 原生扫码登录 + 无头 Edge 补全 __zp_stoken__。

背景：
- `__zp_stoken__` 是 BOSS直聘反爬 JS 生成的令牌，纯 HTTP 终端登录永远拿不到
  （搜索 API 返回 {"code":37,"message":"您的环境存在异常","zpData":{"seed":...}}，
  seed 需在浏览器里由 JS 求解）。原生 `boss login --qrcode` 扫码后因此报
  "缺少关键 Cookie: __zp_stoken__"。
- 解法（两步合一步）：扫码先拿到登录 cookie（wt2/wbg/zp_at 等），立即存盘作兜底，
  再交给 `boss_mint_stoken.mjs`（无头 Edge 跑页面 JS）mint 出 `__zp_stoken__`，
  写回同一凭证文件。
- 好处：登录 cookie 约 7 天才过期；期间 stoken 过期只需重跑 mint（5 秒，无需再扫码），
  或直接交给 boss_auth_check.py 自动 mint。

用法:
    <venv-python> scripts/boss_login_ui.py [--mint-only]
      --mint-only  跳过扫码，直接用已有凭证刷新 __zp_stoken__（等同跑 mint 脚本）
退出码: 0=成功(含 stoken), 1=失败(二维码过期/超时/mint 失败), 2=运行时错误

依赖: Pillow（二维码 PNG）、boss_cli（同 venv）、node ≥20、本机 Microsoft Edge。
"""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

import qrcode

from boss_cli import auth
from boss_cli.constants import BASE_URL, CREDENTIAL_FILE, HEADERS

MINT_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boss_mint_stoken.mjs")


def _render_qr_image(data: str) -> str:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    path = os.path.join(tempfile.gettempdir(), "boss_zhipin_login_qr.png")
    img.save(path)
    return path


def _open_image(path: str) -> None:
    if sys.platform == "win32":
        os.startfile(path)  # noqa: S606
    else:
        subprocess.Popen(["xdg-open", path])


async def _qr_get_cookies() -> dict[str, str]:
    """执行扫码登录，收集 dispatcher+warmup 的 cookies（可能缺 __zp_stoken__，不硬失败）。"""
    async with auth.httpx.AsyncClient(
        base_url=BASE_URL,
        headers=HEADERS,
        follow_redirects=True,
        timeout=auth.httpx.Timeout(30, read=40),
    ) as client:
        session = await auth._get_qr_session(client)
        qr_id = session["qrId"]
        img_path = _render_qr_image(qr_id)
        _open_image(img_path)
        print(f"📱 二维码图片已打开: {img_path}", flush=True)
        print("   请在手机 Boss直聘 APP 中扫码，并在手机上点确认登录。", flush=True)
        print(f"   (QR ID: {qr_id[:20]}...) 约 2-3 分钟内有效", flush=True)

        scanned = False
        for _ in range(12):
            scanned = await auth._wait_for_scan(client, qr_id)
            if scanned:
                break
            await asyncio.sleep(2)
        if not scanned:
            raise RuntimeError("二维码已过期，请重新运行本脚本重试。")

        print("   📲 已扫码，请在手机上确认...", flush=True)
        confirmed = False
        for _ in range(12):
            confirmed = await auth._wait_for_confirm(client, qr_id)
            if confirmed:
                break
            await asyncio.sleep(2)
        if not confirmed:
            raise RuntimeError("确认超时，请重新运行本脚本重试。")

        # 复制 _dispatch_login 的 cookie 收集，但缺 __zp_stoken__ 时不硬失败
        resp = await client.get(
            auth.QR_DISPATCHER_URL, params={"qrId": qr_id, "pk": "header-login"}
        )
        resp.raise_for_status()
        cookies: dict[str, str] = {}
        for name, value in resp.cookies.items():
            cookies[name] = value
        for name, value in client.cookies.items():
            cookies[name] = value
        try:
            warmup = await client.get("/", timeout=15)
            for name, value in warmup.cookies.items():
                cookies[name] = value
            for name, value in client.cookies.items():
                cookies[name] = value
        except Exception:  # noqa: BLE001  warmup 失败不影响扫码结果
            pass
        return cookies


def _save_credential(cookies: dict[str, str]) -> None:
    CREDENTIAL_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {"cookies": cookies, "saved_at": int(time.time())}
    CREDENTIAL_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _write_result(ok: bool, message: str) -> None:
    """写结果标记文件，便于外部（Claude Code）轮询登录是否完成。"""
    out = CREDENTIAL_FILE.parent / "boss_login_result.json"
    out.write_text(json.dumps({"ok": ok, "message": message}, ensure_ascii=False), encoding="utf-8")


def _kill_mint_edge() -> None:
    """只杀本脚本/测试启动的 edge-boss-mint 无头进程；绝不碰用户真实 Edge。"""
    ps = (
        "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
        "Where-Object { $_.CommandLine -like '*edge-boss-mint*' } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, text=True, timeout=30)


def _run_mint(credential: str) -> dict:
    """调用 node boss_mint_stoken.mjs 刷新 stoken，返回其 stdout JSON。"""
    node = shutil.which("node")
    if not node:
        raise RuntimeError("未找到 node（需要 ≥20）。")
    proc = subprocess.run(
        [node, MINT_SCRIPT, credential],
        capture_output=True, text=True, encoding="utf-8", timeout=150,
    )
    line = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout else ""
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        raise RuntimeError(f"mint 脚本输出无法解析: {proc.stdout[-300:]}")


def main() -> int:
    mint_only = "--mint-only" in sys.argv
    try:
        if mint_only:
            if not CREDENTIAL_FILE.exists():
                print("❌ 无已有凭证，请去掉 --mint-only 先扫码登录。", flush=True)
                _write_result(False, "无已有凭证")
                return 1
            print("使用已有凭证刷新 __zp_stoken__（无需扫码）...", flush=True)
            cookies = None
        else:
            print("正在请求登录二维码...", flush=True)
            cookies = asyncio.run(_qr_get_cookies())
            _save_credential(cookies)  # 兜底：扫码后立即存盘，mint 失败也不丢登录态
            print(f"   ✅ 扫码登录成功，已存 {len(cookies)} 个 cookie 兜底，开始 mint stoken...", flush=True)

        result = _run_mint(str(CREDENTIAL_FILE))
        if result.get("ok") and result.get("stokenPresent"):
            msg = (f"凭证已写入 {CREDENTIAL_FILE}（{result.get('cookieCount')} cookies，"
                   f"含 __zp_stoken__，耗时 {result.get('tookMs', 0)}ms）")
            print(f"✅ {msg}", flush=True)
            _write_result(True, msg)
            return 0

        _write_result(False, result.get("error", "mint 未产出 stoken"))
        print(f"⚠️ 未 mint 出 __zp_stoken__：{result.get('error', '未知')}", flush=True)
        print("   兜底 cookie 已保存，可稍后重跑本脚本，或检查无头 Edge/网络。", flush=True)
        return 1

    except RuntimeError as exc:
        _write_result(False, str(exc))
        print(f"❌ {exc}", flush=True)
        return 1
    except Exception as exc:  # noqa: BLE001
        _write_result(False, str(exc))
        print(f"❌ 运行时错误: {exc}", flush=True)
        return 2
    finally:
        _kill_mint_edge()


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""boss-cli 认证状态检查（含 __zp_stoken__ 自动刷新）。

背景：`__zp_stoken__` 是 BOSS直聘反爬 JS 生成的令牌，分钟级过期。登录 cookie
（wt2/wbg/zp_at）约 7 天才过期。所以 stoken 一过期，不必重新扫码——只需把已有
登录 cookie 交给无头 Edge 跑一次页面 JS 就能重新 mint（见 boss_mint_stoken.mjs）。
本脚本在检测到未认证时先自动 mint 一次，仍失败才提示重新扫码。

用法:
    python boss_auth_check.py            # 检查认证；AUTH_OK 则 exit 0
    python boss_auth_check.py --json     # 输出完整 JSON 状态（含是否发生过 auto-mint）
    python boss_auth_check.py --no-mint  # 跳过自动 mint，只做纯检查

Windows 下必须先设置 UTF-8 环境变量再调用:
    PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python boss_auth_check.py
"""
import json
import os
import shutil
import subprocess
import sys

BOSS = os.environ.get("BOSS_CLI_BIN", r"C:\Users\DDOSvoid\.claude\tools\boss-cli\venv\Scripts\boss.exe")
MINT_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boss_mint_stoken.mjs")
CREDENTIAL_FILE = os.environ.get(
    "BOSS_CLI_CREDENTIAL",
    os.path.join(os.path.expanduser("~"), ".config", "boss-cli", "credential.json"),
)


def _env():
    env = dict(os.environ)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def _run_status(timeout: int = 90) -> dict:
    try:
        proc = subprocess.run(
            [BOSS, "status", "--json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            env=_env(),
        )
        return json.loads(proc.stdout or "{}")
    except (FileNotFoundError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        return {"authenticated": False, "search_authenticated": False,
                "reason": f"status 调用失败: {exc}"}


def _try_mint() -> bool:
    """调用 boss_mint_stoken.mjs 刷新 __zp_stoken__。返回是否成功拿到新 token。"""
    if not os.path.exists(MINT_SCRIPT):
        print(f"AUTO_MINT_SKIP: 未找到 {MINT_SCRIPT}", file=sys.stderr)
        return False
    if not os.path.exists(CREDENTIAL_FILE):
        print("AUTO_MINT_SKIP: 无凭证文件，需要先扫码登录", file=sys.stderr)
        return False
    node = shutil.which("node")
    if not node:
        print("AUTO_MINT_SKIP: 未找到 node", file=sys.stderr)
        return False
    try:
        proc = subprocess.run(
            [node, MINT_SCRIPT, CREDENTIAL_FILE],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
            env=_env(),
        )
        line = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout else ""
        result = json.loads(line) if line else {}
        if result.get("ok") and result.get("stokenPresent"):
            print(f"AUTO_MINT_OK: 已刷新 __zp_stoken__（{result.get('cookieCount')} cookies, "
                  f"{result.get('tookMs', 0)}ms）", file=sys.stderr)
            return True
        print(f"AUTO_MINT_FAIL: {result.get('error', '未知')}（{result.get('tookMs', 0)}ms）",
              file=sys.stderr)
        return False
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"AUTO_MINT_FAIL: {exc}", file=sys.stderr)
        return False


def main() -> int:
    no_mint = "--no-mint" in sys.argv
    status = _run_status()
    minted = False

    ok = bool(status.get("authenticated") and status.get("search_authenticated"))

    if not ok and not no_mint:
        if _try_mint():
            minted = True
            status = _run_status()
            ok = bool(status.get("authenticated") and status.get("search_authenticated"))

    if "--json" in sys.argv:
        status = dict(status)
        status["auto_minted"] = minted
        print(json.dumps(status, ensure_ascii=False, indent=2))
    else:
        if ok:
            note = "（auto-mint 已刷新 stoken）" if minted else ""
            print(f"AUTH_OK{note}")
        else:
            reason = status.get("reason", "未认证")
            print(f"AUTH_NEEDED: {reason}")
            if minted:
                print("   即使 mint 了 stoken 仍失败 —— 登录 cookie 可能已过期（约 7 天）。")
            print("   重新登录：运行 `python scripts/boss_login_ui.py`（弹二维码图片，手机扫码确认）")
            print("   无人值守环境（子代理/评估）请勿等待扫码：直接标记 boss 来源为 blocked，继续其它来源。")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

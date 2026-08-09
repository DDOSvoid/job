#!/usr/bin/env python3
"""boss-agent-cli 认证状态检查。

工具：boss-agent-cli（C:\\Users\\DDOSvoid\\.local\\bin\\boss.exe）。
凭证：自带 TokenStore，`~/.boss-agent/auth/session.enc`（Fernet 加密）。
stoken（`__zp_stoken__`，分钟级）过期时工具内部自动刷新（优先 CDP、其次 headless），
本脚本只做检查，不再负责 mint —— 旧 boss-cli 的 boss_mint_stoken.mjs 已归档到 legacy/。

用法:
    python boss_auth_check.py            # 检查认证；AUTH_OK 则 exit 0
    python boss_auth_check.py --json     # 输出完整 JSON 状态
    python boss_auth_check.py --live     # 额外跑一次只读实时探针（boss status --live）

Windows 下必须先设置 UTF-8 环境变量再调用:
    PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python boss_auth_check.py
"""
import json
import os
import subprocess
import sys

BOSS = os.environ.get("BOSS_CLI_BIN", r"C:\Users\DDOSvoid\.local\bin\boss.exe")


def _env():
    env = dict(os.environ)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def _run_status(live: bool = False, timeout: int = 60) -> dict:
    """调用 boss-agent-cli 的 status。返回完整 JSON envelope。"""
    cmd = [BOSS, "--json", "status"]
    if live:
        cmd.append("--live")
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            env=_env(),
        )
        return json.loads(proc.stdout or "{}")
    except (FileNotFoundError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        return {
            "ok": False,
            "error": {"code": "STATUS_CALL_FAILED", "message": str(exc)},
            "reason": f"status 调用失败: {exc}",
        }


def _summary(status: dict) -> tuple[bool, str]:
    """从 envelope 提取 (logged_in, reason)。"""
    if status.get("ok"):
        data = status.get("data") or {}
        logged_in = bool(data.get("logged_in"))
        auth = data.get("auth_state") or "missing"
        live = "live" if data.get("live") else "local"
        return logged_in, f"{auth}（{live}，{data.get('auth_summary', '?')}）"
    err = status.get("error") or {}
    return False, f"{err.get('code', '?')}: {err.get('message', status.get('reason', '未知'))}"


def main() -> int:
    live = "--live" in sys.argv
    status = _run_status(live=live)
    ok, reason = _summary(status)

    if "--json" in sys.argv:
        out = dict(status)
        out["authenticated"] = ok
        out["reason"] = reason
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        if ok:
            print(f"AUTH_OK（{reason}）")
        else:
            print(f"AUTH_NEEDED: {reason}")
            print("   登录态缺失或过期。重新登录（二选一）：")
            print("   1. 用户在场 —— 启动独立 Edge CDP 后运行：`boss --cdp-url http://127.0.0.1:9222 login --cdp`")
            print("      （Edge CDP 启动命令见 references/research-sources.md 的 Boss 章节）")
            print("   2. 或用本机已登录的浏览器提取：`boss login --cookie-source chrome/firefox/edge`")
            print("   无人值守环境（子代理/评估）请勿等待登录：直接标记 boss 来源为 blocked，继续其它来源。")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

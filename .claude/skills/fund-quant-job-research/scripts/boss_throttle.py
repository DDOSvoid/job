#!/usr/bin/env python3
"""boss-agent-cli 全局限速包装器（防风控 code=36）。

问题：批量调研时连续快速调用 boss 命令（search/detail）容易被 Boss直聘风控判定
"账户存在异常行为"（code=36），是账号级风险。本脚本在真实 boss 调用前做两层保护：

1. 串行化 + 最小间隔（硬性）
   所有走本脚本的 boss 命令共享一个状态文件（~/.boss-agent/throttle.json），
   按"占位 → 等待 → 执行"的方式保证**任意两次 boss 命令开始执行的间隔 ≥
   interval 秒**（默认 12s，含随机抖动），即使跨多个进程/终端/连续 shell 调用也生效。
   （内部用 next_slot 递增实现，进程崩溃只留一个未来时刻的槽位，无陈旧锁问题。）

2. 风控冷却（硬性）
   检测到输出含 code=36 / 异常行为 → 把冷却槽推到 cooldown 秒后（默认 30 分钟），
   期间任何后续命令都会等到冷却结束才执行；同时打印警告并返回非 0。这保证了
   触发风控后不会被"换一条命令再试一次"继续加重账号风险。

3. 搜索预算可见（软性）
   统计 1 小时滚动窗口内的 search 次数，超过阈值打印剩余预算提醒（不硬性拦截，
   每任务 ≤3 次的纪律由调用方按 skill 文档控制）。

用法（所有 boss 命令都通过本脚本执行，参数原样透传给 boss.exe）：

    python boss_throttle.py --json search "量化研究员" --city 上海
    python boss_throttle.py --interval 20 --json detail <security_id> --job-id <job_id>
    python boss_throttle.py --json status
    python boss_throttle.py --check            # 只显示当前节流状态，不执行命令
    python boss_throttle.py --bypass --json status   # 紧急诊断，跳过节流

选项（须放在命令最前；其余 token 原样透传）：
    --interval SECONDS   最小命令间隔（默认 12）
    --jitter SECONDS     随机抖动上界，实际间隔 ∈ [interval, interval+jitter]（默认 4）
    --check              仅打印节流状态后退出（不占位、不执行 boss）
    --bypass             跳过节流直接执行（紧急诊断用，会打印警告）
    --search-budget N    1 小时窗口 search 阈值，超过打印提醒（默认 20）

环境变量：
    BOSS_CLI_BIN            boss.exe 路径（默认 C:\\Users\\DDOSvoid\\.local\\bin\\boss.exe）
    BOSS_THROTTLE_STATE     状态文件（默认 ~/.boss-agent/throttle.json）
    BOSS_THROTTLE_INTERVAL  默认 interval（秒）
    BOSS_THROTTLE_COOLDOWN  触发 code=36 后的冷却秒数（默认 1800）

说明：boss 命令的 stdout 会原样透传给调用方（含 --json 时是 JSON），节流日志只写
stderr，不会污染 JSON 解析。认证状态探测（boss_auth_check.py）保持直连 boss.exe，
因为它必须是快速的一次性只读探针；真正的查询类命令一律走本脚本。
"""
import json
import os
import random
import subprocess
import sys
import time

# 强制本脚本自己的 stdio 用 UTF-8，避免 Windows 控制台按 GBK 编码导致日志乱码
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except (ValueError, OSError):
            pass

BOSS = os.environ.get("BOSS_CLI_BIN", r"C:\Users\DDOSvoid\.local\bin\boss.exe")
STATE_FILE = os.environ.get(
    "BOSS_THROTTLE_STATE", os.path.join(os.path.expanduser("~"), ".boss-agent", "throttle.json")
)
LOCK_FILE = STATE_FILE + ".lock"
DEFAULT_INTERVAL = float(os.environ.get("BOSS_THROTTLE_INTERVAL", "12"))
DEFAULT_JITTER = 4.0
DEFAULT_COOLDOWN = float(os.environ.get("BOSS_THROTTLE_COOLDOWN", "1800"))
DEFAULT_BUDGET = 20
LOCK_STALE_SECS = 60
# Boss 风控返回的特征串（搜索返回 code=36 您的账户存在异常行为）
CODE36_MARKERS = ("code=36", "code\":36", "账户存在异常行为", "异常行为", "风控")
CMD_TIMEOUT = 120


def _log(msg):
    print(f"[throttle] {msg}", file=sys.stderr, flush=True)


def read_state():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"next_slot": 0.0, "last_code36": None, "counts": []}


def write_state(st):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False)
    os.replace(tmp, STATE_FILE)


def _acquire_lock():
    """O_EXCL 锁文件，只保护读改写状态文件的临界区（微秒级），睡等不持锁。
    超过 LOCK_STALE_SECS 的锁视为陈旧自动清除（正常流程锁不会存活这么久）。"""
    os.makedirs(os.path.dirname(LOCK_FILE), exist_ok=True)
    for _ in range(2000):  # 最多重试 20s
        try:
            fd = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                if time.time() - os.path.getmtime(LOCK_FILE) > LOCK_STALE_SECS:
                    os.unlink(LOCK_FILE)
                    continue
            except OSError:
                pass
            time.sleep(0.01)
    _log("获取锁超时，跳过节流继续（并发异常）")
    return False


def _release_lock():
    try:
        os.unlink(LOCK_FILE)
    except OSError:
        pass


def _critical(fn):
    """持锁执行 fn，保证 finally 释放。"""
    _acquire_lock()
    try:
        return fn()
    finally:
        _release_lock()


def claim_slot(interval, jitter):
    """占一个执行槽位：任意两次调用返回的 slot 至少间隔 interval(+jitter) 秒。"""

    def _claim():
        st = read_state()
        now = time.time()
        slot = max(st.get("next_slot", 0.0), now)
        st["next_slot"] = slot + interval + random.uniform(0.0, jitter)
        write_state(st)
        return slot

    return _critical(_claim)


def push_cooldown(cooldown):
    """触发风控后把 next_slot 推到 now+cooldown。"""

    def _push():
        st = read_state()
        now = time.time()
        st["next_slot"] = max(st.get("next_slot", 0.0), now + cooldown)
        st["last_code36"] = now
        write_state(st)

    _critical(_push)


def _record(cmd):
    """记录一次命令到 1 小时滚动窗口，返回 (search_count, budget)。"""

    def _rec():
        st = read_state()
        now = time.time()
        counts = [c for c in st.get("counts", []) if now - c[0] < 3600]
        counts.append([now, cmd])
        st["counts"] = counts
        write_state(st)
        return len([c for c in counts if c[1] == "search"])

    return _critical(_rec)


def search_count():
    st = read_state()
    now = time.time()
    return len([c for c in st.get("counts", []) if now - c[0] < 3600 and c[1] == "search"])


def detect_cmd(boss_args):
    """取第一个非 - 前缀 token 作为子命令名（--json search ... → search）。"""
    for a in boss_args:
        if not a.startswith("-"):
            return a
    return "?"


def parse_args(argv):
    interval = DEFAULT_INTERVAL
    jitter = DEFAULT_JITTER
    cooldown = DEFAULT_COOLDOWN
    budget = DEFAULT_BUDGET
    check = bypass = False
    boss_args = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--interval" and i + 1 < len(argv):
            interval = float(argv[i + 1])
            i += 2
        elif a == "--jitter" and i + 1 < len(argv):
            jitter = float(argv[i + 1])
            i += 2
        elif a == "--cooldown" and i + 1 < len(argv):
            cooldown = float(argv[i + 1])
            i += 2
        elif a == "--search-budget" and i + 1 < len(argv):
            budget = int(argv[i + 1])
            i += 2
        elif a == "--check":
            check = True
            i += 1
        elif a == "--bypass":
            bypass = True
            i += 1
        else:
            boss_args.append(a)
            i += 1
    return interval, jitter, cooldown, budget, check, bypass, boss_args


def run_boss(boss_args):
    """执行 boss.exe，stdout/stderr 原样透传；返回 (returncode, combined_output)。"""
    env = dict(os.environ)
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        proc = subprocess.run(
            [BOSS] + boss_args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=CMD_TIMEOUT,
            env=env,
        )
    except FileNotFoundError:
        _log(f"找不到 boss.exe：{BOSS}（请检查 BOSS_CLI_BIN）")
        return 127, ""
    except subprocess.TimeoutExpired:
        _log(f"boss 命令超时（>{CMD_TIMEOUT}s），未完成")
        return 124, ""
    if proc.stdout:
        sys.stdout.write(proc.stdout)
        sys.stdout.flush()
    if proc.stderr:
        sys.stderr.write(proc.stderr)
        sys.stderr.flush()
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def cmd_check():
    st = read_state()
    now = time.time()
    next_slot = st.get("next_slot", 0.0)
    wait = max(0.0, next_slot - now)
    when = time.strftime("%H:%M:%S", time.localtime(next_slot)) if wait > 0 else "现在"
    print(f"下次 boss 命令可执行：{wait:.0f}s 后（{when}）")
    print(f"1 小时内 search 次数：{search_count()}")
    if st.get("last_code36"):
        print(f"上次触发风控：{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(st['last_code36']))}")
    return 0


def main():
    interval, jitter, cooldown, budget, check, bypass, boss_args = parse_args(sys.argv[1:])

    if check:
        return cmd_check()

    if bypass:
        _log("--bypass：跳过节流直接执行（紧急诊断用，注意风控风险）")
        rc, _ = run_boss(boss_args)
        return rc

    if not boss_args:
        _log("用法：python boss_throttle.py [--interval SEC] [--jitter SEC] [--check] <boss 参数...>")
        return 2

    cmd = detect_cmd(boss_args)

    slot = claim_slot(interval, jitter)
    wait = slot - time.time()
    if wait > 0:
        _log(f"等待 {wait:.1f}s（限速间隔 {interval:.0f}-{interval + jitter:.0f}s）")
        time.sleep(wait)

    rc, combined = run_boss(boss_args)

    if rc != 0 and any(m in combined for m in CODE36_MARKERS):
        push_cooldown(cooldown)
        _log(
            f"⚠️ 检测到 Boss 风控（code=36），已进入 {cooldown / 60:.0f} 分钟冷却。"
            "请停止所有 boss 命令，把 Boss 来源标为 blocked，改用官网/公众号来源。"
        )
        return 1

    if rc == 0 and cmd == "search":
        searches = _record(cmd)
        if searches >= budget:
            _log(
                f"1 小时内已 {searches} 次 search（预算 {budget}）。"
                "提醒：每个调研任务 search ≤3 次，够用就停。"
            )
    return rc


if __name__ == "__main__":
    sys.exit(main())

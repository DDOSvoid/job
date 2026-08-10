# 三来源调研策略

## 公司别名映射

归一化公司身份时参考以下映射（id 已与网站 `data/companies.json` 对齐，写盘时可 upsert 同名条目）：

| 公司 | id | 类型 | 别名 |
|---|---|---|---|
| 幻方量化 | highflyer | private | 幻方 / High-Flyer / 浙江九章?（注意区分九章=幻方关联） |
| 九坤投资 | ubiquant | private | 九坤 / Ubiquant / 九坤投资管理 |
| 明汯投资 | minghong | private | 明汯 / 明汯投资管理 |
| 衍复投资 | yanfu | private | 衍复 |
| 稳博投资 | winbao | private | 稳博 |
| 易方达基金 | efund | public | 易方达 / E Fund |
| 华夏基金 | chinaamc | public | 华夏 / ChinaAMC |
| 富国基金 | fullgoal | public | 富国 / Fullgoal |

新公司：用拼音/英文简称做 id（小写、连字符），类型无法确定时搜索"X 公募还是私募"确认。

## 官网

1. WebSearch 找招聘入口：`"{公司名} 校园招聘"`、`"{公司名} 校招 2026"`、`"{公司名} 招聘"`、`"{公司名} 官网"`。
2. 找到官网后 WebFetch 招聘/校园招聘页（常有 `/campus`、`/careers`、`/join` 路径），再抓具体岗位页。
3. 提取：岗位名、职责、任职要求、薪资区间、投递入口、是否开启 2026 秋招（看有没有"2026 届""校园招聘"字样）。
4. **降级判定**：
   - 正文完整读到了岗位详情 → `status: "complete"`。
   - 只拿到招聘页目录/部分内容 → `status: "partial"`，note 注明缺岗位详情。
   - 页面需 JS 渲染 / 跳转 / 403 → `status: "partial"`，note "页面需 JS 渲染，请手动查看"。
   - 找不到官网或招聘页 → 不填 sources，`fetchStatus: "manual_required"`，报告里说明。

## Boss 直聘（优先用 boss-agent-cli 真实数据）

**首选**：用本机 boss-agent-cli（`C:\Users\DDOSvoid\.local\bin\boss.exe`，下称 `boss`）直接搜索 Boss直聘，拿**真实岗位数据**（非搜索引擎摘要）。它是用户自己的登录会话，不是绕过登录墙——只是用 CLI 方式访问用户已登录的账号。工具自带凭证存储（`~/.boss-agent/auth/session.enc`，Fernet 加密），stoken（`__zp_stoken__`，分钟级）过期时内部自动刷新，无需每次手动 mint。

### 全局限速：所有查询一律走 boss_throttle.py（防风控 code=36）

批量调研时连续快速调用 boss 命令（尤其 `search`/`detail`）会被风控判定"账户存在异常行为"（`code=36`），是**账号级风险**。为此提供包装器 `scripts/boss_throttle.py`，**除认证探测外，任何 boss 查询命令一律经它执行，禁止直接调 boss.exe**：

```bash
python <skill-dir>/scripts/boss_throttle.py --json search "<量化关键词>" --city <城市>
python <skill-dir>/scripts/boss_throttle.py --interval 20 --json detail <security_id> --job-id <job_id>
python <skill-dir>/scripts/boss_throttle.py --check        # 只读查看当前节流状态
```

- **串行化 + 最小间隔（硬性）**：两次 boss 命令**开始执行**至少间隔 `--interval` 秒（默认 12s，另加 `--jitter` 随机抖动 0-4s）。间隔状态存 `~/.boss-agent/throttle.json`，**跨进程、跨终端、跨连续 shell 调用全局生效**——即使多个子代理并行调研也不会撞车。
- **触发 code=36 自动冷却（硬性）**：包装器检测到输出含 code=36/异常行为 → 把冷却推到 `--cooldown` 秒后（默认 30 分钟），期间任何后续命令都等到冷却结束才执行，并打印警告、返回非 0。调用方仍须按纪律立即把 Boss 来源标 `blocked`、改用官网/公众号来源。
- **search 预算软提醒**：1 小时滚动窗口内 `search` 达到 `--search-budget`（默认 20）时打印剩余预算提醒，不硬性拦截（每任务 ≤3 次的纪律由调用方掌握）。
- 节流日志只写 stderr，`--json` 的 stdout 原样透传，不会污染 JSON 解析。
- **唯一例外**：`boss_auth_check.py` 的认证探测保持直连 boss.exe（必须是一次性快速只读探针）；其余查询一律走包装器。
- 批量成本估算：N 条命令额外耗时 ≈ N × 14s（默认间隔），大批量调研要留足时间预算。

### 0. 认证检查（每次必做）

```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python <skill-dir>/scripts/boss_auth_check.py
```

- 输出 `AUTH_OK` → 直接进搜索。
- 输出 `AUTH_NEEDED` / 退出码非 0 = 登录态缺失或 cookie（wt2/wbg/zp_at，~7 天级）真过期。重新登录（二选一）：
  - **用户在场**：启动独立 Edge CDP（见下"CDP 登录"）后 `boss login --cdp`；或用本机已登录浏览器提取 `boss login --cookie-source chrome|firefox|edge`。
  - **无人值守环境**（子代理/自动评估，用户不在场无法扫码）→ **不等待扫码**，直接把 Boss 来源标为 `blocked`，note "登录态已过期，需用户运行 boss login --cdp 重新登录"，报告清单标 `[TODO]`，继续官网与公众号来源。
- `boss` 不可用（找不到可执行文件 / 持续超时）→ 降级到 WebSearch 摘要方式（见下方"降级"）。

### CDP 登录（重新登录用，约 7 天一次）

1. 启动独立 Edge 调试会话（**主 Edge 配置会忽略 `--remote-debugging-port`，必须用独立 `--user-data-dir`**）：
   ```bash
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
     --user-data-dir=C:\Users\DDOSvoid\.boss-agent\edge-cdp \
     --remote-debugging-port=9222 \
     --profile-directory=Default --no-first-run --no-default-browser-check
   ```
2. 在打开的 Edge 里登录 zhipin.com（保持登录态）。
3. `boss --cdp-url http://127.0.0.1:9222 login --cdp` 完成凭证落地。
4. 后续 stoken 刷新优先走这个 CDP（指纹一致，风控风险低）。**请保持该 Edge 窗口存活**；若关闭，boss 会退回 headless 刷新（风控风险更高）。

### 1. 搜索公司岗位

```bash
python <skill-dir>/scripts/boss_throttle.py --json search "<量化关键词>" --city <城市>
```

- 一律经 `boss_throttle.py` 执行（见上文"全局限速"）。包装器自身已强制 UTF-8，无需 `PYTHONUTF8` 前缀。
- `--json` 是**全局选项**，必须放在命令前（`boss --json search ...`，不是 `search --json`）。
- 城市名用中文（北京/上海/杭州/深圳等），可用 `boss cities` 查支持的城市。
- **不要直接搜公司名**（如 `search "幻方"` 会返回一堆无关的"幻方*"公司）。正确做法：搜量化关键词 + 城市，然后在结果里按 `company` 过滤目标公司。
- 返回的 `data` 是**裸数组**（不是 dict），按列表处理。可选过滤：`--experience`、`--education`、`--salary`（叠加过严时去掉）。

### 2. 字段映射（search → job 字段）

| boss search 返回字段 | 网站 job 字段 | 说明 |
|---|---|---|
| `title` | `title` | 岗位名 |
| `salary` | `salary` | 薪资（第三方来源，见薪资规则） |
| `company` | （company.name） | 公司名（纯字符串），用于过滤/归属 |
| `city` + `district` | company.location / 备注 | 所在地 |
| `skills` | `description` 的一部分 | 技能标签 |
| `education` + `experience` | 备注 | 学历/经验要求 |
| `job_id` | `officialUrl` 或 sources.url | 构造职位页 URL |
| `security_id` | — | 用于 `boss detail` 取详情 |

职位页 URL 构造：`https://www.zhipin.com/job_detail/<job_id>.html`（已核实可用）。

### 3. 取详情（可选，增强 description）

```bash
python <skill-dir>/scripts/boss_throttle.py --json detail <security_id> --job-id <job_id>
```
可拿到职责/要求正文充实 `job.description`。同样经 `boss_throttle.py` 执行（保持限速）。注意：detail 偶尔会触发内部令牌刷新而变慢（可能数秒~几十秒），超时后重试一次即可，不要死等。

### 4. 记录 sources[] 与降级

- 搜索成功拿到岗位 → `sources[]` 加一条：
  ```json
  { "type": "boss", "title": "<title>", "url": "https://www.zhipin.com/job_detail/<job_id>.html",
    "accessedAt": "<今日>", "status": "complete", "note": "boss-agent-cli 实时搜索（用户已登录账号）" }
  ```
- **薪资规则**：boss 是第三方渠道，`salary` 保留数字但必须标注。如 `"19-20K（Boss直聘，未经官方核实）"`，`salaryIsEstimate: true`，`notes` 注明。
- 登录墙/认证失败/搜索无结果 → `status: "blocked"`，note "Boss直聘登录墙，需手动查看"（认证已过期时先重登录，仍失败再标 blocked）。报告清单里标 `[TODO]`。

### 降级（boss 完全不可用时）

1. 只用 WebSearch：`"Boss直聘 {公司} 量化研究员"`、`"site:zhipin.com {公司} 量化"`。
2. 从搜索结果提取：岗位名、薪资区间、城市、职位页 URL。
3. Boss 详情页有登录墙，WebFetch 拿不到正文，禁止尝试绕过。
4. 一律 `status: "blocked"`，note "登录墙，需手动查看"，`url` 填搜索结果或职位页链接。

### 纪律（硬性）

- **只读**：只用 `search` / `detail` / `cities` / `status`。**禁止** `greet` / `batch-greet`（打招呼=主动投递，必须用户亲自操作）。
- cookie 是用户凭证：不打印、不写入任何日志或报告。`boss --json status` 的输出里 token 字段已 `[REDACTED]`，无需手动脱敏。
- 尊重限速：**所有 boss 查询命令一律经 `boss_throttle.py` 执行**（全局限速，默认 12s 最小间隔，跨进程/终端全局生效），**不要直接调 boss.exe、不要并行跑多个 boss 命令**。**控制搜索量**：每个调研任务 boss `search` 总计 ≤3 次，优先用"公司全称"精确搜索而非泛搜关键词；够用就停，拿到的岗位再 `detail` 拉详情。
- **风控 code=36**：搜索返回 `code=36 您的账户存在异常行为` → **立即停止一切 boss 命令**（不要在风控期间反复重试或继续搜索；包装器检测到会自动进入 30 分钟冷却，期间命令会一直等到冷却结束），把 Boss 来源标为 `blocked`，note "触发 Boss 风控，暂停 boss 搜索；风控通常 20-60 分钟自行解除"，报告清单标 `[TODO]`，改用官网/公众号来源。Boss 风控是账号级风险，宁可少拿数据也不要触发。
- stoken（`__zp_stoken__`，分钟级）过期时工具内部自动刷新，通常无需干预；若搜索连续报环境异常，先跑 `boss --json status` / `boss status --live` 确认登录态，再重跑一次搜索，**不要立刻让用户重新扫码**。只有 status 明确 `logged_in: false`（cookie 过期）才需要 `boss login`。批量调研时先跑一次 `boss --json status` 确认健康再连续执行命令。

## 微信公众号

1. 用 WebSearch：`"微信公众号 {公司} 2026 校园招聘"`、`"{公司} 秋招 量化 公众号"`、`"mp.weixin.qq.com {公司} 招聘"`。
2. 优先找 mp.weixin.qq.com 文章链接，WebFetch 读正文（招聘推文常有岗位清单）。
3. 搜不到文章、或正文不可读 → 用搜索摘要里的信息。
4. **降级判定**：
   - 正文完整 → `status: "complete"`。
   - 只有摘要/标题 → `status: "partial"`，note "公众号正文未抓取，需手动查看"。
   - 搜不到 → 不填 sources，报告里说明"未找到该公司的公众号招聘推文"。

## 报告与字段的关联

报告第 4 节"需手动确认清单"必须覆盖所有 `blocked` / `partial` 的 sources 项，写明：缺什么信息、去哪手动看（URL）。**本次无法解决的项（登录墙、验证墙、需人工投递等）加 `[TODO]` 前缀**，便于后续跟进。

- Boss直聘用 boss-agent-cli 拿到实时数据 → 清单里只需列"建议在 Boss 页面试投递/确认"，**不需要 [TODO]**。
- boss 不可用或认证失败且无法重登录 → 清单里标 `[TODO] 打开 Boss直聘职位页手动确认岗位详情`。

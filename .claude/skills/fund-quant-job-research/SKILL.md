---
name: fund-quant-job-research
description: 调研公募/私募基金公司及券商（证券公司）的量化研究类岗位（量化研究员、量化研究助理、量化开发、量化投研、量化实习生等），从官网校园招聘页、Boss直聘、微信公众号三个来源收集岗位介绍、薪资、官网、投递链接、是否开启 2026 秋招，输出中文调研报告，并把结果按招聘记录网站的数据 schema 写入 D:\workspace\job\data\ 下的 companies.json 与 jobs.json。当用户提到某家基金公司（公募、私募或券商）的量化岗位、量化秋招/校招/社招、投递、招聘、薪资，或要求"查一下 X 公司的量化岗位并写进网站/更新招聘记录"时务必使用本技能；公司别名（幻方/High-Flyer、九坤/Ubiquant、明汯、衍复、稳博、易方达、华夏、富国等）也应触发。
---

# 基金量化岗位调研（fund-quant-job-research）

## 目标与边界

**目标**：为给定公司产出（1）一份中文调研报告（2）schema 合规的 `company` + `job` JSON 条目，按 id upsert 合并进招聘记录网站的数据目录（默认 `D:\workspace\job\data\`；若环境变量 `QUANT_JOB_DATA_DIR` 已设置，则用它作为数据目录，便于在沙盒/测试环境中运行）。

**边界**：不绕过任何登录墙或反爬机制，不伪造字段；拿不到的如实标注"需手动查看"并保留来源链接。这条边界是硬性的——调研的价值在于可信，编造薪资或链接只会误导用户。

## 输入

用户给出公司名称（可能带别名、可能只说"那家私募"）。先归一化公司身份（见 references/research-sources.md 的别名映射），如果无法确定是哪家公司，先向用户确认再继续。

## 工作流（按顺序执行）

1. **归一化公司**：确定正式公司名、英文 slug id、类型（`public` 公募 / `private` 私募 / `securities` 券商）、所在地。
2. **并行调研三来源**：官网（WebSearch + WebFetch）、Boss直聘（**优先本机 boss-agent-cli 真实搜索**，见下）、微信公众号（WebSearch + WebFetch）。每个来源产出一条 `sources[]` 记录，无论成败都要记录；**来源分流**：公司级渠道（官网「加入我们」/招聘系统/公众号/校招公告转载等）进 `company.sources[]`；岗位级来源（点名该岗位的招聘页/申请短链/第三方岗位帖）进该岗位 `job.sources[]`，每岗位只保留 1 条最相关来源。Boss 直聘注意：先跑认证检查，再按公司过滤搜索。
3. **聚合 `fetchStatus`**（规则见下）。
4. **输出可读报告**（固定模板）。
5. **写盘**：读现有 `data/companies.json`、`data/jobs.json` → 按 id upsert → 原子写回。优先用脚本 `scripts/merge_and_write.mjs`（会做校验）。数据目录取 `QUANT_JOB_DATA_DIR` 环境变量，**未设置时默认就是 `D:\workspace\job\data`（网站真实数据目录）**；该环境变量只在测试/沙盒场景使用。

三个来源的详细策略（查询词示例、降级规则）在 `references/research-sources.md`，动手前先读它。

## 来源调研

### 官网（校园招聘页）
- 查询：`"{公司} 校园招聘 量化"`、`"{公司} 校招 2026"`、`"{公司} 招聘 官网"`。
- WebFetch 招聘页或具体岗位页，提取：岗位名、职责、任职要求、薪资区间（如有）、投递入口、秋招信息。
- 降级：页面需 JS 渲染 / 登录 / 抓取失败 → `status: "partial"`，note 写明缺什么、去哪手动看，保留 URL。

### Boss 直聘（优先用 boss-agent-cli 真实数据）
- **首选本机 boss-agent-cli**（`C:\Users\DDOSvoid\.local\bin\boss.exe`）直接搜索 Boss直聘拿真实岗位数据（用户自己的登录会话，非绕过登录墙）。工具自带加密凭证存储，stoken 过期自动刷新。完整命令、字段映射、认证与降级规则见 `references/research-sources.md`。**所有查询命令一律经 `scripts/boss_throttle.py` 执行**（全局限速、防风控，见下），不直接调 boss.exe。**触发 `code=36`/`TOKEN_REFRESH_FAILED` 风控时，包装器会自动切到 CDP 网页版（`scripts/boss_cdp.py`）搜索同一查询**——用户浏览器登录态还在，网页版仍可读岗位数据；CDP 网页版也失败才标 blocked。
- **认证分层**（`__zp_stoken__` 是分钟级令牌、登录 cookie 是 ~7 天级，二者要分开看待）：
  - **日常**：每次调研前跑 `scripts/boss_auth_check.py`（内部跑 `boss --json status`，只读）。输出 `AUTH_OK` 即登录态健康，直接搜索。stoken 过期时工具内部自动刷新，无需额外操作。
  - **`AUTH_NEEDED`（= 登录 cookie 真过期，约 7 天一次）**：用户在场时，请用户启动独立 Edge CDP（`--user-data-dir=C:\Users\DDOSvoid\.boss-agent\edge-cdp --remote-debugging-port=9222`，在其中登录 zhipin 后）再 `boss login --cdp`。无人值守环境（子代理/自动评估，用户无法扫码）**不要等待登录**，直接把 Boss 来源标为 `blocked`，note "登录态已过期，需用户运行 boss login --cdp 重新登录"，报告清单标 `[TODO]`，继续官网与公众号来源。
- **纪律**：只读（search/detail/cities/status），禁止 greet/batch-greet；不打印 cookie（status 输出已自动 REDACTED）；**所有查询命令一律经 `scripts/boss_throttle.py` 执行**（包装器做全局限速：串行 + 默认 12s 最小间隔，跨进程/终端全局生效；检测到 `code=36` 自动进入 30 分钟冷却，并**自动切 CDP 网页版回退**），不直接调 boss.exe；每个调研任务 `search` ≤3 次、优先公司全称精确搜索；`--json` 是全局选项要放在命令名前；**风控时不要反复重试**——包装器会自动切 CDP 网页版同查询，CDP 也失败才标 blocked + `[TODO]`（详见 references/research-sources.md）。
- 降级：boss 不可用/认证失败 → 先试 CDP 网页版（`boss_cdp.py --json status` / `--json search`，见 references/research-sources.md"CDP 网页版回退"节）；CDP 也拿不到才 WebSearch 摘要 + `status: "blocked"`，note "登录墙，需手动查看"，保留搜索结果与职位页链接。

### 微信公众号
- 查询：`"微信公众号 {公司} 2026 校园招聘"`、`"{公司} 秋招 量化 公众号"`。
- mp.weixin.qq.com 文章若能 WebFetch 则读正文提取信息；否则用搜索摘要。
- 降级：正文不可读 → `status: "partial"`，note "公众号正文未抓取，需手动查看"，保留文章链接。

## 优雅降级总规则

- 每个 `sources[]` 项必须带 `status`；非 `complete` 必须有 `note` 说明缺什么、用户去哪手动看。
- `fetchStatus` 聚合（一岗一来源）：该岗位 `job.sources[0].status` 为 `complete` → `complete`；`partial` → `partial`；`blocked`/`manual_required` → `manual_required`。
- 每个岗位 `job.sources[]` **必须恰好 1 条**（一岗一来源）；公司级来源一律进 `company.sources[]`（按 url 去重），不要塞进 job。
- **薪资分三种情况处理**：
  - 官方来源确认（招聘页/官方公告写明区间）→ `salaryIsEstimate: false`，如实填写，并把官方来源放进 `sources[]`。
  - **来自第三方渠道**（Boss直聘搜索摘要、boss-agent-cli 实时数据、论坛、小红书、媒体爆料等）→ `salaryIsEstimate: true`，`salary` 保留数字但明确标注来源，如 `"30-50万/年（Boss直聘，未经官方核实）"`，同时在 `notes` 注明"薪资来自第三方，未核实"。这很重要——数字可以给出，但绝不能让它看起来像是官方确认的。boss-agent-cli 是实时数据、比搜索引擎摘要可靠，但**仍是第三方**，同样要标注。
  - 完全没查到 → `salary: "示例：面议"`、`salaryIsEstimate: true`。
- 投递链接未知：`applyUrl: "https://example.com/<companyId>-apply"` 占位并标注。
- 报告"需手动确认清单"中的每一项都要标注能否本次解决：能解决就写具体操作；**因登录墙/验证墙/需人工投递等本次无法解决的，用 `[TODO]` 前缀**，如 "`[TODO]` 打开 Boss直聘职位页手动确认岗位详情"。这让后续处理有明确的待办清单。
- **绝不编造数字、日期、URL。** 拿不到就如实写"需手动查看"。

## 输出 1：可读报告（固定模板）

```
# 调研报告：{公司} 量化岗位（{YYYY-MM-DD}）

## 一、概览
类型 / 所在地 / 官网 / 是否已识别为公募、私募或券商

## 二、岗位汇总表
| 岗位名 | 薪资 | 投递链接 | 是否 2026 秋招 | 主要来源 |

## 三、分来源详情
### 官网
### Boss直聘
### 微信公众号
（各来源列可用信息与链接）

## 四、需手动确认清单
（逐条列出 blocked/partial 项：缺什么、去哪看；本次无法解决的项用 `[TODO]` 前缀，如 Boss 直聘登录墙）

## 五、写入文件与条目
- data/companies.json：写入/更新了哪些 id
- data/jobs.json：写入/更新了哪些 id
```

## 输出 2：结构化 JSON（写盘）

- 字段完全遵循 `references/data-schema.md`，写盘前必须对照。
- `job.sources[]` 恰好 1 条（该岗位最相关来源）；`company.sources[]`（可选）放公司级来源，按 url 去重。
- 把要写入的条目组成一个 payload（`{ "companies": [...], "jobs": [...] }`），用脚本合并：
  ```bash
  node <skill-dir>/scripts/merge_and_write.mjs "${QUANT_JOB_DATA_DIR:-D:\workspace\job\data}" <payload.json>
  ```
- 只写 `companies` 与 `jobs`，**不写** `applications`（那是用户手动记录的推进进度）。
- 写盘后提示用户到网站点"刷新"查看新条目。

## 参考资料

- `references/data-schema.md` —— 字段定义、取值枚举、合并约定（写盘前必读）
- `references/research-sources.md` —— 三来源查找策略、别名映射、降级模板、**Boss直聘 boss-agent-cli 完整命令与字段映射**

## 辅助脚本（scripts/）

- `boss_auth_check.py` —— 检查 boss-agent-cli 认证状态（跑 `boss --json status`，只读；stoken 过期由工具自动刷新）。每次调研前跑
- `boss_throttle.py` —— boss 命令全局限速包装器（防 `code=36` 风控）：所有查询命令走它执行，串行 + 最小间隔、触发风控自动冷却并**自动切 CDP 网页版回退**。`--check` 看当前节流状态
- `boss_cdp.py` —— CDP 网页版搜索（用用户自己已登录的 Edge，端口 9222）：`search` / `detail` / `status` / `launch`，输出 JSON。boss 风控时由包装器自动调用；也可手动用。**列表页薪资是字体混淆（PUA）读不到，真实薪资走 `detail`**
- `merge_and_write.mjs` —— 把调研结果按 schema 合并写盘

> 旧 boss-cli 工具（boss_mint_stoken.mjs / boss_login_ui.py / boss_login.cmd）已随切换归档到 `scripts/legacy/`，仅作历史参考，不再使用。

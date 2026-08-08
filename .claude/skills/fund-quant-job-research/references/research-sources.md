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

## Boss 直聘（优先用 boss-cli 真实数据）

**首选**：用本机 boss-cli 工具直接搜索 Boss直聘 API，拿**真实岗位数据**（非搜索引擎摘要）。它是用户自己的登录会话，不是绕过登录墙——只是用 CLI 方式访问用户已登录的账号。

### 0. 认证检查（每次必做）

```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python <skill-dir>/scripts/boss_auth_check.py
```

- 输出 `AUTH_OK` → 直接进搜索。
- 输出 `AUTH_NEEDED` / 退出码非 0：
  - **先判断是哪种过期**。`__zp_stoken__` 是分钟级令牌、登录 cookie（wt2/wbg/zp_at）是 ~7 天级。boss_auth_check.py 在检测到未认证时会**先自动 mint 一次**（`boss_mint_stoken.mjs`：把已有登录 cookie 交给无头 Edge 跑一次页面 JS 重新求解 stoken，约 5 秒，无需扫码）。多数 AUTH_NEEDED 是 stoken 过期，会自动转成 `AUTH_OK`。
  - 若 mint 后仍 `AUTH_NEEDED`（= 登录 cookie 真过期，约 7 天一次）→ **引导用户扫码**，用专用脚本（弹二维码 PNG 图片，避免终端乱码）：
    ```bash
    PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python <skill-dir>/scripts/boss_login_ui.py
    ```
    它会：① 打开二维码 PNG 图片（os.startfile，手机 Boss直聘 APP 扫码并确认）；② 收集登录 cookie 并立即存盘兜底；③ 自动调用 mint 补全 `__zp_stoken__` 写回 `~/.config/boss-cli/credential.json`。完成后重跑认证检查确认 `search_authenticated: true`。
- **无人值守环境**（子代理/自动评估，用户不在场无法扫码）→ 不等待扫码（自动 mint 已尝试过仍失败的话），直接把 Boss 来源标为 `blocked`，note "登录态已过期，需用户手动运行 boss_login_ui.py 扫码"，报告清单标 `[TODO]`，继续官网与公众号来源。
- boss-cli 不可用（找不到可执行文件 / 持续超时）→ 降级到 WebSearch 摘要方式（见下方"降级"）。

### 1. 搜索公司岗位

```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 <boss> search "<量化关键词>" --city <城市> --json
```

- 城市名用中文（北京/上海/杭州/深圳等），可用 `<boss> cities` 查支持的城市。
- **不要直接搜公司名**（如 `search "幻方"` 会返回一堆无关的"幻方*"公司）。正确做法：搜量化关键词 + 城市，然后在结果里按 `brandName` 过滤目标公司。
- 可选过滤：`--degree 硕士`、`--salary 30-50K`、`--industry 金融`、`--exp 3-5年`（叠加过严时去掉）。

### 2. 字段映射（search --json → job 字段）

| boss search 返回字段 | 网站 job 字段 | 说明 |
|---|---|---|
| `jobName` | `title` | 岗位名 |
| `salaryDesc` | `salary` | 薪资（第三方来源，见薪资规则） |
| `brandName` | （company.name） | 公司名，用于过滤/归属 |
| `cityName` + `areaDistrict` | company.location / 备注 | 所在地 |
| `skills` | `description` 的一部分 | 技能标签 |
| `jobDegree` | 备注 | 学历要求 |
| `encryptJobId` | `officialUrl` 或 sources.url | 构造职位页 URL |
| `securityId` | — | 用于 `boss detail` 取详情 |

职位页 URL 构造：`https://www.zhipin.com/job_detail/<encryptJobId>.html`（已核实可用）。

### 3. 取详情（可选，增强 description）

```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 <boss> detail <securityId> --json
```
返回 `jobInfo.postDescription`（职责/要求正文）、`jobInfo.showSkills`（技能）、`jobInfo.degreeName` 等，可充实 `job.description`。

### 4. 记录 sources[] 与降级

- 搜索成功拿到岗位 → `sources[]` 加一条：
  ```json
  { "type": "boss", "title": "<jobName>", "url": "https://www.zhipin.com/job_detail/<encryptJobId>.html",
    "accessedAt": "<今日>", "status": "complete", "note": "boss-cli 实时搜索（用户已登录账号）" }
  ```
- **薪资规则**：boss 是第三方渠道，`salary` 保留数字但必须标注。如 `"30-50K·13薪（Boss直聘，未经官方核实）"`，`salaryIsEstimate: true`，`notes` 注明。
- 登录墙/认证失败/搜索无结果 → `status: "blocked"`，note "Boss直聘登录墙，需手动查看"（认证已过期时先重登录，仍失败再标 blocked）。报告清单里标 `[TODO]`。

### 降级（boss-cli 完全不可用时）

1. 只用 WebSearch：`"Boss直聘 {公司} 量化研究员"`、`"site:zhipin.com {公司} 量化"`。
2. 从搜索结果提取：岗位名、薪资区间、城市、职位页 URL。
3. Boss 详情页有登录墙，WebFetch 拿不到正文，禁止尝试绕过。
4. 一律 `status: "blocked"`，note "登录墙，需手动查看"，`url` 填搜索结果或职位页链接。

### 纪律（硬性）

- **只读**：只用 `search` / `detail` / `cities` / `status`。**禁止** `greet` / `batch-greet`（打招呼=主动投递，必须用户亲自操作）。
- cookie 是用户凭证：不打印、不写入任何日志或报告。
- 尊重限速：**不要并行跑多个 boss 命令**，一次一个，之间留间隔（几秒）。**控制搜索量**：每个调研任务 boss `search` 总计 ≤3 次，优先用"公司全称"精确搜索而非泛搜关键词；够用就停，拿到的岗位再 `detail` 拉详情。
- **风控 code=36**：搜索返回 `code=36 您的账户存在异常行为` → **立即停止一切 boss 命令**（不要在风控期间反复重试或继续搜索），把 Boss 来源标为 `blocked`，note "触发 Boss 风控，暂停 boss-cli 搜索；风控通常 20-60 分钟自行解除"，报告清单标 `[TODO]`，改用官网/公众号来源。Boss 风控是账号级风险，宁可少拿数据也不要触发。
- `__zp_stoken__` 会过期（分钟级）：搜索报 `环境异常` / `search_authenticated: false` 时，**不要立刻扫码**——先跑 `python <skill-dir>/scripts/boss_login_ui.py --mint-only`（约 5 秒重新 mint stoken），或直接重跑 `boss_auth_check.py`（内含自动 mint）。只有 mint 后仍失败（登录 cookie 过期）才需要扫码。批量调研时先 mint 一次再连续执行命令，能省去反复刷新。

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

- Boss直聘用 boss-cli 拿到实时数据 → 清单里只需列"建议在 Boss 页面试投递/确认"，**不需要 [TODO]**。
- boss-cli 不可用或认证失败且无法重登录 → 清单里标 `[TODO] 打开 Boss直聘职位页手动确认岗位详情`。

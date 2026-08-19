# 招聘记录网站数据 Schema

网站数据唯一事实源在 `D:\workspace\job\data\`：
- `companies.json` —— 公司数组
- `jobs.json` —— 岗位数组
- `applications.json` —— 申请推进数组（**skill 不写这个文件**）
- `interviews.json` —— 面试经历数组（**归 `interview-experience-research` skill 管理，本 skill 不写**）

本 skill 只写入/更新 `companies.json` 与 `jobs.json`。所有日期用 ISO `YYYY-MM-DD`。

## 枚举取值

| 枚举 | 取值 |
|---|---|
| company.type | `public`（公募）/ `private`（私募）/ `securities`（券商） |
| company.source | `example` / `skill` / `manual`（skill 写入用 `skill`） |
| job.source | `official` / `boss` / `wechat` / `manual`（来源条目 `type` 额外可记 `secondary`，转载聚合用） |
| sources[].type | `official` / `boss` / `wechat` / `manual` / `secondary` |
| sources[].status | `complete` / `partial` / `manual_required` / `blocked` |
| job.fetchStatus | `complete` / `partial` / `manual_required` |
| job.autumn2026 | `open` / `not_started` / `ended` / `unknown` |
| job.recruitmentType | `campus`（校招）/ `social`（社招）/ `intern`（实习）/ `unknown`（未知）；按岗位标题/描述关键词判定，无信号标 `unknown` |

## company

```json
{
  "id": "highflyer",
  "name": "幻方量化",
  "type": "private",
  "website": "https://example.com/highflyer",
  "location": "杭州",
  "about": "以 AI 驱动的量化私募（示例简介，请核实）。",
  "source": "skill",
  "createdAt": "2026-08-06",
  "updatedAt": "2026-08-06",
  "sources": [
    {
      "type": "official",
      "title": "幻方量化官网「加入我们」",
      "url": "https://www.high-flyer.cn/join",
      "accessedAt": "2026-08-06",
      "status": "partial",
      "note": "公司级来源：官网招聘入口，岗位级来源见各 job.sources"
    }
  ]
}
```

- `id`：公司名英文 slug，必须稳定唯一（upsert 的键）。优先使用别名映射表中已有的 id，新公司自行生成（拼音/英文简称）。
- `website`：官网地址。未核实的官网 URL 不要填真实猜测值，用 `https://example.com/<id>` 占位并在 `about` 标注"请核实"。
- `about`：一句简介即可；**未经核实的内容必须标注"请核实"**。
- `sources[]`（可选）：**公司级信息来源**——官网「加入我们」/招聘系统/公众号/校招公告转载等，按 url 去重。公司级渠道一律放这里，**不要写进 job.sources**。

## job

```json
{
  "id": "highflyer-quant-researcher-2026",
  "companyId": "highflyer",
  "title": "量化研究员（2026 届校招）",
  "description": "岗位职责与任职要求（示例，请以官网为准）。",
  "salary": "示例：面议",
  "salaryIsEstimate": true,
  "applyUrl": "https://example.com/highflyer-apply",
  "officialUrl": "https://www.high-flyer.cn/campus",
  "autumn2026": "unknown",
  "autumn2026Note": "示例占位，未核实",
  "recruitmentType": "campus",
  "source": "official",
  "fetchStatus": "manual_required",
  "sources": [
    {
      "type": "official",
      "title": "幻方 2026 校园招聘",
      "url": "https://www.high-flyer.cn/campus",
      "accessedAt": "2026-08-06",
      "status": "partial",
      "note": "页面需 JS 渲染，正文未能读取，请手动查看"
    }
  ],
  "notes": "未核实，薪资为占位。",
  "createdAt": "2026-08-06",
  "updatedAt": "2026-08-06"
}
```

规则：
- 薪资分三种情况，见下表；`salaryIsEstimate: true` 时界面会加黄标。

| 情况 | salary 写法 | salaryIsEstimate |
|---|---|---|
| 官方来源确认 | 如实写区间，如 `"30k-50k·14薪"`，来源进 sources | false |
| 第三方渠道（Boss直聘摘要/论坛/媒体） | 保留数字但标注，如 `"30-50万/年（第三方渠道，未经官方核实）"`，notes 注明 | true |
| 没查到 | `"示例：面议"` | true |
- `sources[]` 是**一岗一来源**：必须恰好 1 条，为该岗位最相关来源——岗位级招聘页/申请短链/点名该岗位的第三方帖子（如 `Boss直聘·公司 岗位`、实习僧岗位页）。公司级渠道（官网/招聘系统/公众号/公告转载）进 `company.sources`。`status: "blocked"` 用于登录墙；其余非 `complete` 用 `partial` 或 `manual_required`。
- `fetchStatus` 聚合规则：该条来源 `complete` → `complete`；`partial` → `partial`；`blocked`/`manual_required` → `manual_required`。
- `applyUrl` 未确凿时用 `https://example.com/<companyId>-apply` 占位。
- 一个岗位一个 job 对象；同一公司多个岗位（如校招+实习）就写多条，id 用 `-` 区分（`<companyId>-quant-researcher-2026`、`<companyId>-quant-intern-2026`）。
- 同一来源同时属于某岗位最相关来源**且**是公司级渠道时（如官网校招页既支撑某岗位、又属公司渠道），该来源写进该 job 的 `sources[]`，同时进 `company.sources`——岗位级归 job，公司级归公司，互不排斥。

## 合并约定（写盘）

1. 先读现有 `companies.json` / `jobs.json`（可能已存在 skill 之前写入或示例数据）。
2. 按 `id` upsert：同 id 覆盖字段（`{...existing, ...new}`），其余条目保持不变。
3. 校验：`companyId` 必须存在（含同批新增的 company）；`id`/`title` 非空；`job.sources` 必须恰好 1 条且 `url` 非空；`company.sources` 存在时必须是数组。
4. 写盘时 `company.sources[]` 按 url 去重。
5. 原子写回：写临时文件再 rename，防止写一半损坏。
6. 推荐直接用 `scripts/merge_and_write.mjs`，它完成第 1/2/3/4/5 步。

## 反例（不要这么做）

- 编造薪资数字（如"年薪百万"）却没有来源 —— 界面会显示为黄标"示例"，但谎言会误导用户。
- 填一个凭记忆的官网 URL 却不核实 —— 用 example.com 占位 + 标注更诚实。
- 覆盖用户已有的数据 —— 只更新本次调研的 id，别动其他条目。

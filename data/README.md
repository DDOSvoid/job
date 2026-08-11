# 数据说明（data/）

本目录是网站数据的**唯一事实源**。前端只读、后端读写、`fund-quant-job-research` skill 直接写入。

四个文件均为 JSON 数组：

- `companies.json` —— 公司（公募/私募/券商）
- `jobs.json` —— 岗位
- `applications.json` —— 申请推进进程
- `interviews.json` —— 面试经历（由 `interview-experience-research` skill 写入）

## company

```json
{
  "id": "highflyer",
  "name": "幻方量化",
  "type": "private",
  "website": "https://example.com/highflyer",
  "location": "杭州",
  "about": "以 AI 驱动的量化私募（示例简介，请核实）。",
  "source": "example",
  "createdAt": "2026-08-06",
  "updatedAt": "2026-08-06"
}
```

- `type`: `public`（公募）| `private`（私募）| `securities`（券商）
- `source`: `example`（示例占位）| `skill`（skill 调研）| `manual`（手动）
- 所有链接用 `https://example.com/...` 占位时，`about`/`notes` 需注明"示例/未核实"。

## job

```json
{
  "id": "highflyer-quant-researcher-2026",
  "companyId": "highflyer",
  "title": "量化研究员（示例）",
  "description": "岗位职责与任职要求请以官网为准（示例数据）。",
  "salary": "示例：面议",
  "salaryIsEstimate": true,
  "applyUrl": "https://example.com/highflyer-apply",
  "officialUrl": "https://example.com/highflyer-careers",
  "autumn2026": "unknown",
  "autumn2026Note": "示例占位，未核实",
  "recruitmentType": "unknown",
  "source": "manual",
  "fetchStatus": "manual_required",
  "sources": [
    {
      "type": "official",
      "title": "幻方量化官方招聘页（示例占位）",
      "url": "https://example.com/highflyer-careers",
      "accessedAt": "2026-08-06",
      "status": "partial",
      "note": "示例占位链接，请手动核实"
    }
  ],
  "notes": "示例数据，薪资与链接均为占位，请用 skill 调研后替换。",
  "createdAt": "2026-08-06",
  "updatedAt": "2026-08-06"
}
```

- `autumn2026`: `open`（秋招已开启）| `not_started` | `ended` | `unknown`（待确认）——**秋招窗口状态**，不等同于招聘类型
- `recruitmentType`: `campus`（校招）| `social`（社招）| `intern`（实习）| `unknown`（未知）——岗位招聘类型，由岗位自身文本关键词判定，无信号如实标 `unknown`
- `fetchStatus`: `complete`（已抓取完整）| `partial`（部分抓取）| `manual_required`（需手动确认）
- `salaryIsEstimate: true` 时 `salary` 必须以"示例"开头，界面会加黄标。
- `sources[]` 是证据链，每条含来源类型、URL、抓取状态（`status` 可为 `complete`/`partial`/`manual_required`/`blocked`）与说明。**未核实的信息必须如实标注，禁止编造。**

## application

```json
{
  "id": "app-highflyer-quant-researcher-2026",
  "jobId": "highflyer-quant-researcher-2026",
  "companyId": "highflyer",
  "currentStatus": "written_test",
  "timeline": [
    { "date": "2026-08-01", "stage": "applied", "note": "官网投递，简历已提交" },
    { "date": "2026-08-05", "stage": "written_test", "note": "收到笔试链接" }
  ],
  "createdAt": "2026-08-01",
  "updatedAt": "2026-08-05"
}
```

- `timeline` 是唯一事实源；`currentStatus` 是派生缓存字段，取 timeline 按日期排序后的最后一条 `stage`，由后端自动重算，不要手动编辑。
- `stage`: `interested`（关注中）| `applied`（已投递）| `written_test`（笔试）| `interview`（面试）| `offer` | `rejected`（已拒绝）| `withdrawn`（已放弃）

## interview

```json
{
  "id": "ubiquant-quant-research-intern-interview-2026",
  "companyId": "ubiquant",
  "jobTitle": "量化研究实习生",
  "rounds": [
    { "name": "一面", "content": "自我介绍 + 概率题", "date": "2026-07" }
  ],
  "summary": "两轮技术面，偏概率统计。",
  "result": "unknown",
  "difficulty": "medium",
  "source": "nowcoder",
  "sourceUrl": "https://www.nowcoder.com/discuss/xxxxx",
  "sourceTitle": "九坤量化实习面经",
  "collectedAt": "2026-08-09",
  "sourceStatus": "complete",
  "createdAt": "2026-08-09",
  "updatedAt": "2026-08-09"
}
```

- `rounds[]` 每轮含 `name`（如"一面"）与 `content`（该轮主要题目/内容），`date` 可选。
- `source`: `xiaohongshu`（小红书）| `nowcoder`（牛客）| `zhihu`（知乎）| `1point3acres`（一亩三分地）| `forum`（论坛）| `manual`（手动）
- `sourceStatus`: `complete`（正文完整读到）| `partial` | `manual_required` | `blocked`（登录墙）——**注意它只表示"帖子正文读到多少"，不代表内容经官方核实**；社区面经是发帖人自述。
- `result`: `offer` | `no_offer` | `in_progress` | `unknown`；`difficulty`: `easy` | `medium` | `hard` | `unknown`
- `sourceUrl` 必填且为真实帖子 URL；`companyId` 必须已存在于 companies.json。

## 编辑约定

- 日期统一 `YYYY-MM-DD`；`rounds[].date` 额外允许 `YYYY-MM`、`YYYY`、`YYYY春招`/`YYYY秋招`（只知道年份或季节时如实记录，不编造月份）。
- skill 写入时按 `id` upsert（同名覆盖、保留其余字段），并做原子写回。

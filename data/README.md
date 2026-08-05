# 数据说明（data/）

本目录是网站数据的**唯一事实源**。前端只读、后端读写、`fund-quant-job-research` skill 直接写入。

三个文件均为 JSON 数组：

- `companies.json` —— 公司（公募/私募）
- `jobs.json` —— 岗位
- `applications.json` —— 申请推进进程

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

- `type`: `public`（公募）| `private`（私募）
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

- `autumn2026`: `open`（秋招已开启）| `not_started` | `ended` | `unknown`（待确认）
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

## 编辑约定

- 日期统一 `YYYY-MM-DD`。
- skill 写入时按 `id` upsert（同名覆盖、保留其余字段），并做原子写回。

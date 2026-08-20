# 数据说明（data/）

本目录是网站数据的**唯一事实源**。前端只读、后端读写、`fund-quant-job-research` skill 直接写入。

六个文件均为 JSON 数组：

- `companies.json` —— 公司（公募/私募/券商）
- `jobs.json` —— 岗位
- `applications.json` —— 申请推进进程
- `interviews.json` —— 面试经历（由 `interview-experience-research` skill 写入）
- `questions.json` —— 真实面试题目（一条帖子拆成多条逐题记录，由 `interview-experience-research` skill 写入）
- `answers.json` —— 用户/AI 对每道题的回答（用户在网站上自产，skill 不写入）

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
- `sources[]`（可选）：**公司级信息来源**——官网「加入我们」/招聘系统/公众号/校招公告转载等，按 url 去重。岗位自身最相关来源留在 `job.sources`，公司级渠道一律上移到公司（不要写进 job）。
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
- `sources[]` 是**一岗一来源**：必须恰好 1 条，为该岗位最相关来源（岗位级招聘页/申请短链/点名该岗位的第三方帖子）。公司级渠道（官网/招聘系统/公众号/公告转载）不写进这里，而是进 `company.sources`。每条含来源类型、URL、抓取状态（`status` 可为 `complete`/`partial`/`manual_required`/`blocked`）与说明。**未核实的信息必须如实标注，禁止编造。**

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
  "questions": [
    { "round": "一面", "date": "2026-07", "text": "自我介绍" },
    { "round": "一面", "text": "概率题：掷骰子直到出现6的期望次数" }
  ],
  "summary": "两轮技术面，偏概率统计。",
  "result": "unknown",
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
- `questions[]` 可选：从各轮 `content` 拆出的逐条题目，每项 `{ round, date?, text }`；详情页逐条展示，缺失时降级用 `rounds` 整段展示。
- `source`: `xiaohongshu`（小红书）| `nowcoder`（牛客）| `zhihu`（知乎）| `1point3acres`（一亩三分地）| `csdn`（CSDN博客）| `cnblogs`（博客园）| `bilibili`（B站）| `wenku`（百度文库）| `book118`（原创力文档）| `questionbank`（题库站）| `zhidao`（百度知道）| `aggregator`（内容农场）| `career`（求职辅导）| `manual`（手动）
- `sourceStatus`: `complete`（正文完整读到）| `partial` | `manual_required` | `blocked`（登录墙）——**注意它只表示"帖子正文读到多少"，不代表内容经官方核实**；社区面经是发帖人自述。
- `result`: `offer` | `no_offer` | `in_progress` | `unknown`
- `sourceUrl` 必填且为真实帖子 URL；`companyId` 必须已存在于 companies.json。

## question

```json
{
  "id": "q-20250930-efund-qresearch-01",
  "companyId": "efund",
  "jobTitle": "量化研究",
  "category": "portfolio",
  "text": "请解释因子投资的基本原理，以及常见的因子类型（如价值、成长、动量）。",
  "source": "nowcoder",
  "sourceUrl": "https://www.nowcoder.com/discuss/802558059049467904",
  "sourceTitle": "易方达量化研究面经",
  "sourceStatus": "complete",
  "sourceDate": "2025-09-30",
  "collectedAt": "2026-08-20",
  "createdAt": "2026-08-20",
  "updatedAt": "2026-08-20"
}
```

- `companyId`：**必须存在于 companies.json，或为 `null`**（null = 通用/汇总题，帖子未点名具体公司，前端展示为"通用/汇总"）。
- `category`: `probability`（数理统计）| `machine_learning`（机器学习）| `algo`（数据结构与算法）| `portfolio`（投资组合/因子）| `dev`（量化开发/C++）| `system_design`（系统设计）| `hr`（HR/行为面）| `brainteaser`（脑筋急转弯）| `other`（其他）
- `source` / `sourceStatus` 与 interview 同枚举（`sourceStatus` 只表示题目读到多少，不代表官方核实）。
- 一条帖子拆多条记录（追问独立成条、标注"（追问）"）；`companyHint`/`round`/`note` 可选。
- `sourceUrl` 必填且为真实帖子 URL；`sourceDate` 允许 `YYYY-MM-DD` / `YYYY-MM` / `YYYY`。

## answer

```json
{
  "id": "ans-q-20250728-dice-01",
  "questionId": "q-20250728-dice-01",
  "myAnswer": "我的回答（用户自产）",
  "aiAnswer": "AI 生成的回答",
  "aiModel": "deepseek-chat",
  "aiGeneratedAt": "2026-08-20",
  "createdAt": "2026-08-20",
  "updatedAt": "2026-08-20"
}
```

- 每道题至多一条，`id` = `ans-<questionId>`，`questionId` 必须存在于 questions.json。
- 这是**用户/AI 自产数据**，由网站前端通过 `PUT /api/questions/:id/my-answer`、`POST /api/questions/:id/ai-answer` 写入，**skill 不写入该文件**（questions.json 才是 skill 的唯一事实源）。
- `myAnswer` / `aiAnswer` 为空串表示清空（保存后字段省略）；`aiAnswer` 由后端生成端点写入（未配置 `AI_API_KEY` 时该端点返回 503「未接入」，不编造答案）。

## 编辑约定

- 日期统一 `YYYY-MM-DD`；`rounds[].date` 额外允许 `YYYY-MM`、`YYYY`、`YYYY春招`/`YYYY秋招`（只知道年份或季节时如实记录，不编造月份）。
- skill 写入时按 `id` upsert（同名覆盖、保留其余字段），并做原子写回。
- answers.json 的写入由后端按 `ans-<questionId>` **整体替换**（不是合并字段），保证清空的字段真正消失。

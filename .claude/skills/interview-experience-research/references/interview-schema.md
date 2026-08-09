# 面试经历数据 Schema（interview）

面试经历唯一事实源在 `D:\workspace\job\data\interviews.json`，由本 skill 写入/更新。
所有日期用 ISO `YYYY-MM-DD`；`rounds[].date` 允许 `YYYY-MM`（只知道大致月份）、`YYYY`（只知道年份）、`YYYY春招`/`YYYY秋招`（只知道招聘季节）。面试经历不限于秋招——春招/暑期实习同样收录，季节信息在帖子里出现就如实保留，不要因为不是秋招就丢弃。

## 枚举取值

| 枚举 | 取值 |
|---|---|
| interview.source | `xiaohongshu`（小红书）/ `nowcoder`（牛客）/ `zhihu`（知乎）/ `1point3acres`（一亩三分地）/ `forum`（论坛）/ `manual`（手动） |
| interview.sourceStatus | `complete` / `partial` / `manual_required` / `blocked`（复用 job 的 SOURCE_STATUSES） |
| interview.result | `offer`（拿到Offer）/ `no_offer`（未通过）/ `in_progress`（进行中）/ `unknown`（未知） |
| interview.difficulty | `easy`（简单）/ `medium`（中等）/ `hard`（困难）/ `unknown`（未知） |

**sourceStatus 语义（与 job.fetchStatus 不同，务必分清）**：
- `complete` 只表示"帖子正文被完整读到、题目细节齐全"，**不表示内容经公司/官方核实**。
- 社区帖子（小红书/牛客/知乎）的内容天然是发帖人自述——发帖人自称"拿到offer"也不代表真的拿到，报告里要标注"未经核验"。

## interview 示例

```json
{
  "id": "ubiquant-quant-research-intern-interview-2026",
  "companyId": "ubiquant",
  "jobTitle": "量化研究实习生",
  "rounds": [
    { "name": "一面", "content": "自我介绍 + 概率题：掷骰子直到出现6的期望次数", "date": "2026-07" },
    { "name": "二面", "content": "手撕二叉树层序遍历，追问红黑树" }
  ],
  "summary": "整体感受：两轮技术面，偏概率统计与脑筋急转弯。",
  "result": "unknown",
  "difficulty": "medium",
  "source": "nowcoder",
  "sourceUrl": "https://www.nowcoder.com/discuss/xxxxx",
  "sourceTitle": "九坤量化实习面经",
  "collectedAt": "2026-08-09",
  "sourceStatus": "complete",
  "notes": "帖子发布于2026-07；发帖人自称通过，未经公司核验。",
  "createdAt": "2026-08-09",
  "updatedAt": "2026-08-09"
}
```

字段规则：
- `id`：`<companyId>-<岗位/主题slug>-interview`，必须稳定唯一（upsert 键）。同一条帖子被多轮提取时同 id 覆盖。
- `companyId`：**必须已在 `data/companies.json` 中存在**。库内为主（63 家公司优先）；确属新公司时，先向用户确认公司类型（公募/私募/券商），再用 fund-quant-job-research 的 `merge_and_write.mjs` 把公司写进 companies.json，再写面试经历。
- `jobTitle`：面试的岗位名（按帖子描述，不必与库内 job 完全同名）。
- `rounds[]`：每轮必填 `name`（如"一面/HR面/笔试"）与 `content`（该轮主要题目/内容）；`date` 可选。**只能写帖子里确实出现的内容，不能脑补**。
- `summary`：整体感受的短摘要（可选但建议）。
- `result`/`difficulty`：帖子有明确说法才填；说不清就 `unknown`。
- `source`/`sourceUrl`：来源平台 + **真实帖子 URL（必填）**。`sourceUrl` 不能是 `example.com` 占位——这是证据链核心，绝不编造。
- `sourceTitle`：帖子标题（用于列表展示，可选）。
- `collectedAt`：本 skill 抓取整理日期（今日）。
- `sourceStatus`：按降级规则填（见 interview-sources.md）。
- `notes`：补充说明，如"帖子自称 3 轮、另一条帖子说 4 轮，存疑"。

## 合并约定（写盘）

1. 先读现有 `companies.json`（只读，校验 companyId）+ `interviews.json`。
2. 按 `id` upsert：同 id 覆盖字段（`{...existing, ...new}`），其余条目保持不变。
3. 校验：`id`/`companyId`/`jobTitle` 非空、`companyId` 存在、`rounds` 至少一条且每轮有 `name`/`content`、`sourceUrl` 非空。
4. 原子写回：写临时文件再 rename。
5. 推荐直接用 `scripts/merge_and_write_interviews.mjs`，它完成以上所有步骤。它**只写 interviews.json**。

## 反例（不要这么做）

- 编造题目、轮次、结果 —— 界面会展示出来误导用户。
- 填一个搜到的公司名就当作 companyId —— 必须先用库里的正式 id，或先加公司再引用。
- 把"搜索摘要里的一句话"当成完整面经标 `complete` —— 摘要只是 partial。
- 覆盖用户已有的面试记录 —— 只更新本次调研的 id，别动其他条目。

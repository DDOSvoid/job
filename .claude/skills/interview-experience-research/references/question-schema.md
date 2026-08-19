# 真实面试题目数据 Schema（question）

面试题目唯一事实源在 `D:\workspace\job\data\questions.json`，由本 skill 写入/更新。
与 `interviews.json` 的**区别**：interview 以"一条面经帖子"为单位（`rounds[]` + 帖子内的 `questions[]`）；question 以"一道题"为单位，**一条帖子拆成多条题目记录**，独立于具体公司，用于题库/刷题视角（"真实面试题目"板块逐题展示、按分类/公司筛选）。

## 枚举取值

| 枚举 | 取值 |
|---|---|
| question.source | `xiaohongshu`（小红书）/ `nowcoder`（牛客）/ `zhihu`（知乎）/ `1point3acres`（一亩三分地）/ `csdn`（CSDN博客）/ `cnblogs`（博客园）/ `bilibili`（B站）/ `wenku`（百度文库）/ `book118`（原创力文档）/ `questionbank`（题库站）/ `zhidao`（百度知道）/ `aggregator`（内容农场）/ `career`（求职辅导）/ `manual`（手动）——与 interview.source 同一枚举 |
| question.sourceStatus | `complete` / `partial` / `manual_required` / `blocked`（复用 SOURCE_STATUSES，语义同 interview：只表示题目正文读到多少，**不表示内容经官方核实**） |
| question.category | `probability`（数理统计）/ `machine_learning`（机器学习）/ `algo`（数据结构与算法）/ `portfolio`（投资组合/因子）/ `dev`（量化开发/C++）/ `system_design`（系统设计）/ `hr`（HR/行为面）/ `brainteaser`（脑筋急转弯）/ `other`（其他） |

## question 示例

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

通用题目示例（帖子未点名公司）：

```json
{
  "id": "q-20250523-liangjing-prob-01",
  "companyId": null,
  "category": "probability",
  "text": "抛出 6 面骰子，直到所有面都出现一次的期望次数。",
  "companyHint": null,
  "source": "xiaohongshu",
  "sourceUrl": "https://www.xiaohongshu.com/explore/68305537000000001101d37e",
  "sourceTitle": "25量化面试凉经(第一弹)",
  "sourceStatus": "complete",
  "sourceDate": "2025-05-23",
  "note": "帖子未点名具体公司，按通用/汇总收录",
  "collectedAt": "2026-08-20",
  "createdAt": "2026-08-20",
  "updatedAt": "2026-08-20"
}
```

字段规则：

- `id`：`q-<yyyymmdd>-<slug>-<nn>`，必须稳定唯一（upsert 键）。`yyyymmdd` 取帖子发布日期（`sourceDate` 的紧凑形式）；帖子无日期时用 `collectedAt`。`slug` 有 `companyId` 时用公司 slug，通用题目用帖子主题词（如帖子标题的核心词，必要时追加分类）。`nn` 为该帖子内序号（2 位补零）。
- `companyId`：**必须已在 `data/companies.json` 中存在，或为 `null`**。`null` = 通用/汇总题（帖子未点名具体公司、跨公司通用题），前端展示为"通用/汇总"。确属新公司时先按 interview-experience-research 的规则加公司再引用。
- `companyHint`（可选）：`companyId` 为 `null` 时，帖子隐含的公司线索（如"百亿私募"、"付费专栏《…》"，不点名）放这里供用户判断归属；没有就不写。
- `jobTitle`（可选）：题目对应的岗位（有 `companyId` 时常用，如"量化研究"）。
- `category`：**必填**，从上面的枚举里选最贴切的一类；拿不准的用 `other`。
- `text`：**必填**，一道题的完整题干。只能写帖子里确实出现的原文/忠实转述，**不能脑补**（追问单独成条，标注"（追问）"）。
- `round`（可选）：题目来自哪一轮（如"一面/笔试/HR面"），帖子明确标注才写。
- `source`/`sourceUrl`：来源平台 + **真实帖子 URL（必填）**。`sourceUrl` 不能是 `example.com` 占位——这是证据链核心，绝不编造。
- `sourceTitle`（可选）：帖子标题。
- `sourceStatus`：按降级规则填（见 interview-sources.md，与 interview 一致）。
- `sourceDate`（可选）：帖子发布日期，`YYYY` / `YYYY-MM` / `YYYY-MM-DD` 三选一，不知道就不写。
- `note`（可选）：该题的补充说明——帖子未点名公司、付费墙截断、答案缺失、与另一条帖子矛盾等。
- `collectedAt`/`createdAt`/`updatedAt`：本 skill 抓取整理日期（今日），`YYYY-MM-DD`。

## 拆分规则（一条帖子 → 多条 question）

- **可拆则拆**：一条面经帖子的每道独立题目各成一条记录，共用同一 `sourceUrl`/`sourceTitle`，`nn` 序号递增。
- **追问单独成条**：紧跟的追问是独立题目（如"（追问）因子在不同市场环境下表现有何差异？…"），`text` 里标注"（追问）"。
- **题库站/叙述段落**：正文是一整段叙述、拆不出明确题号/题面时，整段作为 1 条保留，不硬拆。
- **正文读不到题目**（图片题/付费墙）：不编造题目——图片中的题目整条降级为 `partial` + `note` 注明"题目在图片中，需手动核对"，不录入空题；付费墙截断的题按实际读到程度标 `partial` 并在 `note` 里写清楚差什么。

## 合并约定（写盘）

1. 先读现有 `companies.json`（只读，校验 companyId）+ `questions.json`。
2. 按 `id` upsert：同 id 覆盖字段（`{...existing, ...new}`），其余条目保持不变。
3. 校验：`id`/`category`/`text`/`sourceUrl` 非空；`companyId` 存在或为 null；`source` ∈ 来源枚举；`sourceStatus` ∈ SOURCE_STATUSES；日期格式正确。
4. 原子写回：写临时文件再 rename。
5. 推荐直接用 `scripts/merge_and_write_questions.mjs`，它完成以上所有步骤。它**只写 questions.json**。

## 反例（不要这么做）

- 编造题目或题干细节 —— 界面逐条展示，会误导用户。
- 用 `example.com` 或顺手编的 URL 当 `sourceUrl` —— 证据链核心，必须真实。
- 图片题/付费题硬编题干标 `complete` —— 读不到就 `partial` + `note` 说明。
- 一条帖子整块复制成一条超长 question —— 可拆则拆，除非正文确为叙述段。
- 覆盖用户已有记录 —— 只更新本次调研的 id，别动其他条目。

---
name: interview-experience-research
description: 从网络社区（小红书、牛客、知乎、论坛等）搜集量化岗位（量化研究员、量化开发、量化实习等）的面试经历/面经，提取公司、岗位、面试轮次、主要题目、结果、难度、来源链接，输出中文调研报告，并按 schema 写入 D:\workspace\job\data\interviews.json（招聘记录网站的"面试经历"板块）。当用户提到"面试经历""面经""面试题""X 的面试分享""小红书/牛客上的量化面试""查一下某公司的面试流程"等，或要求搜集/更新面试经历数据时，务必使用本技能；公司别名（九坤/Ubiquant、幻方/High-Flyer、明汯等）也应触发。
---

# 面试经历调研（interview-experience-research）

## 目标与边界

**目标**：为给定公司/岗位从社区帖子搜集真实的量化面试经历，产出（1）中文调研报告（2）schema 合规的 `interview` JSON 条目，按 id upsert 合并进 `data/interviews.json`（数据目录可用 `QUANT_JOB_DATA_DIR` 环境变量覆盖，便于沙盒/测试）。

**边界**：只读社区公开或**用户已登录账号可见**的内容；**不绕过任何登录墙或反爬机制**（小红书/牛客等正文需登录时，禁止抓包、伪造 UA、Cookie 提取、付费墙绕过——拿不到就降级）。**知乎例外（与 fund-quant 的 boss-agent-cli 同模式）**：`scripts/zhihu_cdp.py` 驱动**用户自己登录的 Edge**（CDP）读知乎正文——真实浏览器自己算签名、带真实 UA 与 cookie，不逆向、不伪装、不提取 cookie；只读用户登录后可见的页面、低频率访问，知乎触发验证/风控立即停手降级 `blocked`。**绝不编造**题目/轮次/结果/日期/URL——正文读不到就如实标 `partial`/`blocked`/`manual_required` 并保留来源链接，报告清单加 `[TODO]`。这条边界是硬性的——面经的价值在于可信，编造的题目只会误导用户。

## 输入

用户给出公司名（可能带别名）或直接说"量化私募的面经"。先归一化公司（见 `references/interview-sources.md` 的归一化与 fund-quant-job-research 的别名映射）；`companyId` 优先用 `data/companies.json` 已有的；无法确定公司、或确属库外新公司时，先向用户确认。

## 工作流（按顺序执行）

1. **归一化公司**：确定 `companyId`（必须已在 companies.json 中；新公司先确认类型、写库）。
2. **搜索来源**：按 `references/interview-sources.md` 的查询模板找帖子。牛客/小红书/其他论坛用 WebSearch；**知乎用 `scripts/zhihu_cdp.py --json search "<查询>"`**（需用户已登录知乎 CDP；返回真实结果 URL 列表，优先于 site:zhihu.com 的 WebSearch 摘要）。
3. **读正文提取**：读帖子正文。牛客等可用 WebFetch；**知乎用 `scripts/zhihu_cdp.py --json read "<url>"`**（返回渲染后 innerText，含轮次/题目/作者/时间）。提取岗位、轮次（`name`/`content`/`date`）、结果、难度、帖子标题与原始 URL。
4. **聚合 `sourceStatus`**：按降级规则（见下）。
5. **输出可读报告**（固定模板）。
6. **写盘**：把 interview 条目组成 payload（`{ "interviews": [...] }`），用 `scripts/merge_and_write_interviews.mjs` 合并写盘。该脚本只写 interviews.json；需要新增公司时先用 fund-quant-job-research 的 `merge_and_write.mjs` 把公司写进 companies.json。

来源策略、降级规则与链接卫生在 `references/interview-sources.md`，动手前先读它；字段定义与枚举在 `references/interview-schema.md`，写盘前对照。

## 提取与降级要点

- `rounds[]` 是核心：每轮 `{ name, content, date? }`，只写帖子里确实出现的内容。
- **`sourceStatus` 不等于"内容是否属实"**：`complete` 只表示帖子正文完整读到；社区内容是发帖人自述，报告必须标注"未经公司/官方核验"。
- 降级判定：正文完整 → `complete`；只有摘要/标题 → `partial`；登录墙/验证墙 → `blocked`；搜不到 → 不写条目。
- `sourceUrl` 必填且必须是真实原始帖子 URL——绝不编造、不用 example.com 占位。
- 同岗位多条帖子 → 多条不同 id 的 interview；帖子内容矛盾时各自记录、notes 互注存疑。

## 输出 1：可读报告（固定模板）

```
# 面试经历调研：{公司} 量化岗位（{YYYY-MM-DD}）

## 一、概览
公司 / companyId / 找到的帖子数 / 各来源命中情况

## 二、面经汇总表
| 岗位 | 轮次概要 | 结果 | 难度 | 来源平台 | 原文链接 |

## 三、分来源详情
### 牛客
### 小红书
### 知乎 / 论坛
（每条帖子：标题、URL、正文读到什么、降级说明）

## 四、需手动确认清单
（逐条列出 partial/blocked 项：缺什么、去哪看原文 URL；本次无法解决的用 `[TODO]` 前缀）

## 五、写入文件与条目
- data/interviews.json：写入/更新了哪些 id
- 未新增公司时注明"库内公司，未新增"；新增公司则注明写入了哪个 companyId
```

## 输出 2：结构化 JSON（写盘）

- 字段完全遵循 `references/interview-schema.md`，写盘前必须对照。
- payload 只含 `interviews`：
  ```bash
  node <skill-dir>/scripts/merge_and_write_interviews.mjs "${QUANT_JOB_DATA_DIR:-D:\workspace\job\data}" <payload.json>
  ```
- 若需新增公司：先 `node <fund-quant-skill>/scripts/merge_and_write.mjs ...` 写入该公司，再合并 interviews。
- 写盘后提示用户到网站"面试"板块点刷新查看新条目。

## 参考资料

- `references/interview-schema.md` —— 字段定义、取值枚举、合并约定、反例（写盘前必读）
- `references/interview-sources.md` —— 查询模板、各来源降级、链接卫生

## 辅助脚本（scripts/）

- `merge_and_write_interviews.mjs` —— 把调研结果按 schema 合并写盘（只写 interviews.json，校验 companyId/rounds/sourceUrl）
- `zhihu_cdp.py` —— 知乎正文读取工具（CDP 驱动用户自己的 Edge；命令 status/search/read/launch，见 `references/interview-sources.md` 的知乎章节）。**前置**：用户先 `launch` 并在弹出的 Edge 里登录 zhihu.com 一次。

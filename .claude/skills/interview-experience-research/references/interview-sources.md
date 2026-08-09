# 面试经历来源调研策略

## 公司归一化

复用 `fund-quant-job-research/references/research-sources.md` 的别名映射（幻方=highflyer、九坤=ubiquant、明汯=minghong 等）。`companyId` 优先取 `data/companies.json` 已有 id；确属新公司须先向用户确认类型再入库。

## 查询模板（WebSearch，逐个换公司名）

- `"{公司} 量化 面经"`
- `"{公司} 量化研究员 面试"`
- `"{公司} 量化实习 面试"`
- `"site:nowcoder.com {公司} 量化"`
- `"site:xiaohongshu.com {公司} 面经"` / `"site:xiaohongshu.com {公司} 面试"`
- `"site:zhihu.com {公司} 量化 面试"`
- 岗位泛化：`"量化私募 面经 概率 智力题"`、`"量化研究员 面试 常见题"`（命中的帖子归属到帖子里实际提到的公司）。

## 各来源特点与降级

| 来源 | 特点 | 正文可读性 |
|---|---|---|
| 牛客 nowcoder.com | 讨论区/面经帖结构清晰，很多可直接 WebFetch | 常可读到 complete |
| 小红书 xiaohongshu.com | 需 App/登录，网页版常有验证，WebFetch 常拿不到正文 | 常 partial / blocked |
| 知乎 zhihu.com | 登录墙常见，正文常需展开 | 常 partial / blocked |
| 一亩三分地 1point3acres.com | 海外华人量化面经多，反爬 403 常见 | 常 partial（需搜索摘要） |
| 其他论坛（力扣讨论、CSDN、虎扑等） | 看具体站点 | 视情况 |
| 微信公众号 | 面试经历有时发在公众号 | 视情况 |

一亩三分地的帖子 `source` 用专用值 `1point3acres`（不是 `forum`）。

**降级判定**（写入 `sourceStatus`）：
- WebFetch 完整读到帖子正文，题目/轮次齐全 → `complete`。
- 只拿到搜索摘要/标题，或正文读到一半 → `partial`，note 写明缺什么、原文 URL 放 `sourceUrl`。
- 登录墙/验证墙挡住 → `blocked`，note "登录墙/验证墙，需手动查看原文"，报告清单标 `[TODO]`。
- 完全搜不到 → 不写条目，报告说明"未找到该公司相关面经"。

**hard 纪律：**
- **不绕过登录墙/反爬**：小红书/牛客/知乎正文需登录时不尝试抓包、伪造 UA、Cookie 提取或付费墙绕过——拿不到就降级。
- **绝不编造**题目/轮次/结果/日期/URL。正文里没有的轮次不写，题目记不清就只写帖子里有的。
- 一个帖子通常只算一条 interview；同一公司不同帖子 → 多条不同 id 的 interview。
- 帖子内容矛盾（如两个人对同岗位面试轮数说法不一）→ 每条独立记录，notes 里互相注明存疑。

## 链接卫生

- `sourceUrl` 一律存**原始帖子 URL**（浏览器地址栏里那条），不要存分享短链或重定向中间页。
- 搜到的结果如果只有搜索页 URL，先 WebFetch 落地到真实帖子 URL 再记录。

## 报告与字段的关联

报告"需手动确认清单"必须覆盖所有非 `complete` 的条目：缺什么信息、去哪手动看（URL）。**本次无法解决（登录墙等）的项加 `[TODO]` 前缀**。

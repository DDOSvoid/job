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
| 小红书 xiaohongshu.com | 搜索/评论需登录；正文内嵌在 `__INITIAL_STATE__`（Vue Ref 结构）；WebFetch 只能拿到登录墙；用本机 `xiaohongshu_cdp.py`（用户自己登录的 Edge CDP）可读正文 | 用 CDP 可 complete；未登录/CDP 不可用则 partial / blocked |
| 知乎 zhihu.com | 游客搜索已关闭、纯 HTTP 403；用本机 `zhihu_cdp.py`（用户自己登录的 Edge CDP）可读正文 | 用 CDP 可 complete；未登录/CDP 不可用则 partial / blocked |
| 一亩三分地 1point3acres.com | 海外华人量化面经多，反爬 403 常见 | 常 partial（需搜索摘要） |
| 其他论坛（力扣讨论、CSDN、虎扑等） | 看具体站点 | 视情况 |
| 微信公众号 | 面试经历有时发在公众号 | 视情况 |

一亩三分地的帖子 `source` 用专用值 `1point3acres`。来源按具体平台细分：CSDN → `csdn`、博客园 → `cnblogs`、B站 → `bilibili`、百度文库 → `wenku`、原创力文档 → `book118`、题库站（如 zcmima）→ `questionbank`、百度知道 → `zhidao`、淘宝书店等聚合页 → `aggregator`、求职辅导类 → `career`。

## 知乎（`zhihu_cdp.py` —— 用户自己的 Edge 登录态）

知乎对非浏览器直连一律 403（实测 `curl` 被拦）、游客搜索已关闭，WebFetch 也被 claude.ai 域名层拦截。因此知乎正文走**专用工具** `scripts/zhihu_cdp.py`——驱动用户自己登录的 Edge（CDP），真实浏览器自己算 x-zse-96 签名、带真实 UA/cookie，**不逆向签名、不伪造 UA、不提取 cookie**（与 fund-quant 的 boss-agent-cli 同模式）。

**前置（一次性）**：用户运行
```bash
PYTHONUTF8=1 python scripts/zhihu_cdp.py --json launch   # 弹出独立 Edge（端口 9223，profile ~/.zhihu-agent/edge-cdp，与日常浏览器隔离）
```
在弹出的窗口里登录 zhihu.com 一次，然后
```bash
PYTHONUTF8=1 python scripts/zhihu_cdp.py --json status   # 输出 logged_in: true 即可用
```
登录态约 7 天有效，过期后重新 `launch` 登录一次即可。

**命令**（Windows 一律 `PYTHONUTF8=1 PYTHONIOENCODING=utf-8` 前缀；`--json` 放子命令前）：
```bash
# 搜知乎（返回 results: [{url, title, snippet}]）
PYTHONUTF8=1 python scripts/zhihu_cdp.py --json search "九坤 量化 面经"
# 读正文（专栏/问答页均可，返回渲染后 innerText + title + url）
PYTHONUTF8=1 python scripts/zhihu_cdp.py --json read "https://zhuanlan.zhihu.com/p/647900875"
# CDP/登录态检查
PYTHONUTF8=1 python scripts/zhihu_cdp.py --json status
```

**纪律（硬性）**：
- 只读用户登录后可见的内容，低频率：工具内置节流（命令间 3-6s，`~/.zhihu-agent/throttle.json` 全局生效）+ 单实例锁，**不要并行跑多个 zhihu 命令**；每任务 `search` ≤3 次、优先精确公司名查询，够用就转 `read`。
- 知乎触发验证码/风控（搜索返回空、页面出验证）→ **立即停手**，标 `blocked`，note "知乎风控/验证，需手动查看"，报告清单标 `[TODO]`。不要反复重试硬闯。
- **正文完整性**：专栏文章通常一次读全 → `complete`；问答页回答可能折叠（`read` 返回 `partial_reason` 提示"查看全部"未展开）→ `partial`，note 注明缺折叠回答、去哪看原文。
- 抽取到的帖子标题/URL 是证据链核心，`sourceUrl` 用 `read` 返回的真实 URL（可能是登录后的 canonical URL），不编造。

**降级**：CDP 不可用 / 用户未登录 / 工具报错 → 退回 WebSearch `"site:zhihu.com {公司} 量化 面经"` 摘要，标 `partial`（note "CDP 不可用，仅搜索摘要"），原文 URL 放 `sourceUrl`；搜索本身搜不到 → 不写条目。

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

## 小红书（`xiaohongshu_cdp.py` —— 用户自己的 Edge 登录态）

小红书网页版搜索/浏览需登录（`web_session` 是 httpOnly cookie，`document.cookie` 看不到，登录态从页面状态 `st.user.loggedIn` 判断）；正文不在 DOM 里，内嵌在 `window.__INITIAL_STATE__`，且是 **Vue reactive 结构**（字段是 Ref，需 `.value`/`._value` 解包，用 `'__v_isRef' in v` 探测）。纯 HTTP 抓取/WebFetch 只能拿到登录墙。因此小红书正文走**专用工具** `scripts/xiaohongshu_cdp.py`——驱动用户自己登录的 Edge（CDP），真实浏览器自己算 xsec 签名、带真实 UA/cookie，**不逆向签名、不伪造 UA、不提取 cookie 值**（登录态只做布尔判断，与 zhihu_cdp.py / boss-agent-cli 同模式）。

**前置（一次性）**：用户运行
```bash
PYTHONUTF8=1 python scripts/xiaohongshu_cdp.py --json launch   # 弹出独立 Edge（端口 9224，profile ~/.xiaohongshu-agent/edge-cdp，与日常浏览器隔离）
```
在弹出的窗口里登录 xiaohongshu.com 一次，然后
```bash
PYTHONUTF8=1 python scripts/xiaohongshu_cdp.py --json status   # 输出 logged_in: true、login_user 即可用
```
登录态约 7 天有效，过期后重新 `launch` 登录一次即可。

**命令**（Windows 一律 `PYTHONUTF8=1 PYTHONIOENCODING=utf-8` 前缀；`--json` 放子命令前）：
```bash
# 搜笔记（返回 results: [{url, title, snippet}]，title 取 displayTitle；snippet 由作者+点赞数拼成，卡片无 desc）
PYTHONUTF8=1 python scripts/xiaohongshu_cdp.py --json search "九坤 量化 面经"
# 读正文（笔记 URL 必须带 xsec_token，bare URL 会 404；返回 title + content + date + author + tags + type + url）
PYTHONUTF8=1 python scripts/xiaohongshu_cdp.py --json read "https://www.xiaohongshu.com/explore/{note_id}?xsec_token={token}&xsec_source=pc_search"
# CDP/登录态检查（登录态看 logged_in/login_user，不看 cookie）
PYTHONUTF8=1 python scripts/xiaohongshu_cdp.py --json status
```

**纪律（硬性）**：
- 只读用户登录后可见的内容，低频率：工具内置节流（命令间 3-6s，`~/.xiaohongshu-agent/throttle.json` 全局生效）+ 单实例锁，**不要并行跑多个 xhs 命令**；每任务 `search` ≤3 次、优先精确公司名查询，够用就转 `read`。
- 小红书触发验证/风控（搜索返回空、页面出现"验证/访问过于频繁"等，>30 req/min 会弹验证码）→ **立即停手**，标 `blocked`，note "小红书风控/验证，需手动查看"，报告清单标 `[TODO]`。不要反复重试硬闯。
- **正文完整性**：`read` 一次读到完整 `content` → `complete`；读到的内容明显不完整（图为主/被折叠）→ `partial`，note 注明缺什么、去哪看原文。
- 笔记 URL 必须带 `xsec_token`（search 结果里会带，直接用那条 URL 去 read）；`sourceUrl` 用 `read` 返回的真实 URL，不编造。

**降级**：CDP 不可用 / 用户未登录 / 工具报错 → 退回 WebSearch `"site:xiaohongshu.com {公司} 面经"` 摘要，标 `partial`（note "CDP 不可用，仅搜索摘要"），原文 URL 放 `sourceUrl`；搜索本身搜不到 → 不写条目。

**降级判定**（写入 `sourceStatus`）同知乎一节：正文完整读到 → `complete`；只有摘要/读到一半 → `partial`；登录墙/验证墙 → `blocked` + `[TODO]`；完全搜不到 → 不写条目。**`complete` 只表示正文完整读到，不表示内容经官方核验**——小红书帖子是发帖人自述，报告标注"未经公司/官方核验"。

## 链接卫生

- `sourceUrl` 一律存**原始帖子 URL**（浏览器地址栏里那条），不要存分享短链或重定向中间页。
- 搜到的结果如果只有搜索页 URL，先 WebFetch 落地到真实帖子 URL 再记录。

## 报告与字段的关联

报告"需手动确认清单"必须覆盖所有非 `complete` 的条目：缺什么信息、去哪手动看（URL）。**本次无法解决（登录墙等）的项加 `[TODO]` 前缀**。

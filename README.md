# 量化岗位招聘记录网站

个人使用的量化研究岗位（公募/私募）招聘记录工具。集中查看各公司量化岗位的
岗位介绍、薪资、官网、投递链接、秋招状态，并记录每个岗位的投递推进进程。

## 运行

```bash
npm install
npm run dev   # 打开 http://localhost:5173
```

数据保存在 `data/*.json`，无数据库。后端以 Vite middleware 形式挂在 `/api` 下。

## 数据来源

初始数据为**示例占位**（薪资、链接均为 `示例/example.com` 占位，界面会以黄标提示）。
真实岗位信息可用 `fund-quant-job-research` skill 调研后写入：

> 在 Claude Code 里输入如"查一下幻方量化的量化研究员岗位，写进网站"，
> skill 会从官网、Boss直聘、微信公众号查找，输出调研报告并把结构化 JSON
> 写入 `data/` 目录。写盘后点页面右上角"刷新"即可看到。

## 目录结构

- `data/` —— 数据唯一事实源（companies / jobs / applications），见 `data/README.md`
- `server/` —— 数据 API（读盘 / 原子写回 / /api/import 导入）
- `src/` —— React 前端
- `shared/constants.js` —— 枚举常量（前后端与 skill 共用）

## API 摘要

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/jobs` | 岗位列表（`?companyId=&autumn2026=&fetchStatus=`） |
| GET | `/api/jobs/:id` | 岗位详情（含 company 与 application） |
| GET | `/api/companies` | 公司列表 |
| GET | `/api/companies/:id` | 公司详情（含旗下岗位） |
| GET | `/api/applications` | 申请列表（`?status=`） |
| POST | `/api/applications` | 为某岗位创建申请记录 |
| POST | `/api/applications/:id/timeline` | 追加时间线条目（自动重算当前状态） |
| POST | `/api/import` | 批量导入 skill 生成的 JSON（按 id upsert） |
| PUT | `/api/questions/:id/my-answer` | 保存我的回答 |
| POST | `/api/questions/:id/ai-answer` | 生成 AI 回答（按 OpenAI 兼容协议调用） |

## AI 回答

题目详情页可让 AI 对一道量化面试题作答（参考已保存的"我的回答"给出改进）。
密钥与模型配置在项目根目录 `.env`（已 gitignore，不进版本库）：

```
AI_API_KEY=sk-xxxxx   # 必填
AI_MODEL=deepseek-v4-flash   # 默认 deepseek-chat
AI_BASE_URL=https://api.deepseek.com   # 可选，OpenAI 兼容网关可换
AI_MAX_TOKENS=8000   # 可选，默认 8000；推理型模型链式思考吃 token，预算不足会返回空答案
```

改完 `.env` 后重启 dev server 生效（AI 生成接口在 `server/ai-provider.js`）。

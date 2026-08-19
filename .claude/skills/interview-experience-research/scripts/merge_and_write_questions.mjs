#!/usr/bin/env node
// 把面试题目调研（interview-experience-research skill 的题目抽取）的 payload 合并进
// 招聘记录网站的数据目录（data/questions.json，与 server/validate.js 的 validateQuestion 对齐）。
//
// 用法：
//   node merge_and_write_questions.mjs <dataDir> <payload.json>
//
// payload.json 形如：
//   { "questions": [...] }
//
// 行为：读现有 companies.json（只读，校验 question.companyId 必须存在或为 null）+
// questions.json → 按 id upsert questions（保留其余条目）→ 原子写回（写临时文件再 rename）。
// 只写 questions.json，不触碰 companies / jobs / applications / interviews。
import fs from 'node:fs'
import path from 'node:path'

// 从 shared/constants.js 导入枚举，与网站前后端保持同一事实源。
// 用 file:// URL 动态导入（Windows 下 fileURLToPath 会丢 scheme，直接传 href）。
const { INTERVIEW_SOURCES, QUESTION_CATEGORIES, SOURCE_STATUSES } = await import(
  new URL('../../../../shared/constants.js', import.meta.url).href
)

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('用法: node merge_and_write_questions.mjs <dataDir> <payload.json>')
  process.exit(1)
}

const dataDir = path.resolve(args[0])
const payloadPath = path.resolve(args[1])
let payload
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'))
} catch (err) {
  console.error(`读取 payload 失败: ${err.message}`)
  process.exit(1)
}

function readFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

function writeFile(file, data) {
  const target = path.join(dataDir, file)
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, target)
}

function upsert(list, item) {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx >= 0) list[idx] = { ...list[idx], ...item }
  else list.push(item)
}

const companies = readFile('companies.json')
const questions = readFile('questions.json')

const companyIds = new Set(companies.map((c) => c.id))
const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/
const errors = []
for (const q of payload.questions ?? []) {
  const label = q.id ?? '(无 id)'
  if (!q.id || !q.category || !q.text || !q.sourceUrl) errors.push(`question ${label}: 缺少 id/category/text/sourceUrl`)
  if (q.companyId != null && !companyIds.has(q.companyId))
    errors.push(`question ${label}: companyId '${q.companyId}' 不存在（需先写入 companies.json；通用题请用 null）`)
  if (!QUESTION_CATEGORIES.includes(q.category)) errors.push(`question ${label}: category '${q.category}' 非法`)
  if (!INTERVIEW_SOURCES.includes(q.source)) errors.push(`question ${label}: source '${q.source}' 非法`)
  if (!SOURCE_STATUSES.includes(q.sourceStatus)) errors.push(`question ${label}: sourceStatus '${q.sourceStatus}' 非法`)
  if (q.collectedAt !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(q.collectedAt))
    errors.push(`question ${label}: collectedAt '${q.collectedAt}' 格式应为 YYYY-MM-DD`)
  if (q.sourceDate !== undefined && !DATE_RE.test(q.sourceDate))
    errors.push(`question ${label}: sourceDate '${q.sourceDate}' 格式应为 YYYY / YYYY-MM / YYYY-MM-DD`)
}

if (errors.length > 0) {
  console.error('校验失败，未写入：')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}

const created = []
for (const q of payload.questions ?? []) {
  if (!questions.some((x) => x.id === q.id)) created.push(q.id)
  upsert(questions, q)
}

writeFile('questions.json', questions)

console.log(`写入完成：questions.json ${questions.length} 条`)
console.log(`新增 question: ${created.join(', ') || '无'}`)

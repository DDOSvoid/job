#!/usr/bin/env node
// 把面试经历调研（interview-experience-research skill）的 payload 合并进招聘记录网站的数据目录。
//
// 用法：
//   node merge_and_write_interviews.mjs <dataDir> <payload.json>
//
// payload.json 形如：
//   { "interviews": [...] }
//
// 行为：读现有 companies.json（只读，校验 interview.companyId 必须存在）+
// interviews.json → 按 id upsert interviews（保留其余条目）→ 原子写回
// （写临时文件再 rename）。只写 interviews.json，不触碰 companies / jobs / applications。
//
// 需要新增公司时，先用 fund-quant-job-research 的 merge_and_write.mjs（或 /api/import）
// 把公司写进 companies.json，再来合并面试经历。
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('用法: node merge_and_write_interviews.mjs <dataDir> <payload.json>')
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
const interviews = readFile('interviews.json')

const companyIds = new Set(companies.map((c) => c.id))
const errors = []
for (const iv of payload.interviews ?? []) {
  const label = iv.id ?? '(无 id)'
  if (!iv.id || !iv.companyId || !iv.jobTitle) errors.push(`interview ${label}: 缺少 id/companyId/jobTitle`)
  if (!companyIds.has(iv.companyId)) errors.push(`interview ${label}: companyId '${iv.companyId}' 不存在（需先写入 companies.json）`)
  if (!Array.isArray(iv.rounds) || iv.rounds.length === 0) errors.push(`interview ${label}: rounds 至少需要一条`)
  else
    iv.rounds.forEach((r, i) => {
      if (!r?.name || !r?.content) errors.push(`interview ${label}: rounds[${i}] 缺少 name/content`)
      // 空串日期 = 未知，直接删键；非空但格式不合法则报错（避免"空串/乱值"混进数据）
      if (r?.date === '') delete r.date
      else if (r?.date !== undefined && !/^\d{4}(?:-\d{2}(?:-\d{2})?|春招|秋招|春|秋)?$/.test(r.date))
        errors.push(`interview ${label}: rounds[${i}].date '${r.date}' 格式应为 YYYY / YYYY-MM / YYYY-MM-DD 或 YYYY春招/秋招`)
    })
  if (!iv.sourceUrl) errors.push(`interview ${label}: sourceUrl 缺失（必须带真实来源链接）`)
}

if (errors.length > 0) {
  console.error('校验失败，未写入：')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}

const created = []
for (const iv of payload.interviews ?? []) {
  if (!interviews.some((x) => x.id === iv.id)) created.push(iv.id)
  upsert(interviews, iv)
}

writeFile('interviews.json', interviews)

console.log(`写入完成：interviews.json ${interviews.length} 条`)
console.log(`新增 interview: ${created.join(', ') || '无'}`)

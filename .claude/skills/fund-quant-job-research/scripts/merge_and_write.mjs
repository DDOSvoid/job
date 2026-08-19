#!/usr/bin/env node
// 把 skill 调研结果的 payload 合并进招聘记录网站的数据目录。
//
// 用法：
//   node merge_and_write.mjs <dataDir> <payload.json>
//
// payload.json 形如：
//   { "companies": [...], "jobs": [...] }
//
// 行为：读现有 companies.json / jobs.json → 按 id upsert（保留其余条目）→
// 校验 job.companyId 存在 → 原子写回（写临时文件再 rename）。
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('用法: node merge_and_write.mjs <dataDir> <payload.json>')
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

// 公司级来源按 url 去重（同一 URL 只保留一条）
function dedupSources(items) {
  if (!Array.isArray(items)) return items
  const seen = new Set()
  return items.filter((s) => {
    if (!s || !s.url) return true
    if (seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
}

const companies = readFile('companies.json')
const jobs = readFile('jobs.json')

// 校验：company 必填 id/name/type；job 必填 id/title 且 companyId 必须存在（含同批新增）
const companyIds = new Set(companies.map((c) => c.id))
const errors = []
for (const c of payload.companies ?? []) {
  if (!c.id || !c.name || !c.type) errors.push(`company ${c.id ?? '(无 id)'}: 缺少 id/name/type`)
  if (c.sources !== undefined && !Array.isArray(c.sources)) errors.push(`company ${c.id ?? '(无 id)'}: sources 必须是数组`)
  companyIds.add(c.id)
}
for (const j of payload.jobs ?? []) {
  if (!j.id || !j.title) errors.push(`job ${j.id ?? '(无 id)'}: 缺少 id/title`)
  if (!Array.isArray(j.sources) || j.sources.length !== 1)
    errors.push(`job ${j.id ?? '(无 id)'}: sources 必须恰好 1 条（一岗一来源）`)
  else if (!j.sources[0]?.url) errors.push(`job ${j.id ?? '(无 id)'}: sources[0].url 缺失`)
  if (!companyIds.has(j.companyId)) errors.push(`job ${j.id ?? '(无 id)'}: companyId '${j.companyId}' 不存在`)
}

if (errors.length > 0) {
  console.error('校验失败，未写入：')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}

const created = { companies: [], jobs: [] }
for (const c of payload.companies ?? []) {
  if (c.sources) c.sources = dedupSources(c.sources)
  if (!companies.some((x) => x.id === c.id)) created.companies.push(c.id)
  upsert(companies, c)
}
for (const j of payload.jobs ?? []) {
  if (!jobs.some((x) => x.id === j.id)) created.jobs.push(j.id)
  upsert(jobs, j)
}

writeFile('companies.json', companies)
writeFile('jobs.json', jobs)

console.log(`写入完成：companies.json ${companies.length} 条，jobs.json ${jobs.length} 条`)
console.log(`新增 company: ${created.companies.join(', ') || '无'}`)
console.log(`新增 job: ${created.jobs.join(', ') || '无'}`)

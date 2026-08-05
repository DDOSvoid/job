import { readCollection, writeCollection, today } from './store.js'
import {
  validateCompany,
  validateJob,
  validateApplication,
  validateTimelineEntry,
} from './validate.js'
import { APPLICATION_STAGES } from '../shared/constants.js'

function sendJSON(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('请求体不是有效的 JSON'))
      }
    })
    req.on('error', reject)
  })
}

// timeline 是唯一事实源，currentStatus 是派生缓存：取 timeline 按 date 排序后的最后一条 stage
function deriveStatus(timeline) {
  if (!timeline || timeline.length === 0) return null
  const sorted = [...timeline].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
  return sorted[sorted.length - 1].stage
}

// 把筛选条件统一映射到目标字段；application 的 status 映射到 currentStatus
function applyFilters(items, searchParams) {
  const byType = searchParams.get('type')
  const byCompany = searchParams.get('companyId')
  const byAutumn = searchParams.get('autumn2026')
  const byFetch = searchParams.get('fetchStatus')
  const bySource = searchParams.get('source')
  const byStatus = searchParams.get('status')
  return items.filter((item) => {
    if (byType && item.type !== byType) return false
    if (byCompany && item.companyId !== byCompany) return false
    if (byAutumn && item.autumn2026 !== byAutumn) return false
    if (byFetch && item.fetchStatus !== byFetch) return false
    if (bySource && item.source !== bySource) return false
    if (byStatus && item.currentStatus !== byStatus) return false
    return true
  })
}

function upsert(list, item) {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx >= 0) list[idx] = { ...list[idx], ...item }
  else list.push(item)
}

function upsertCollection(file, payload) {
  const list = readCollection(file)
  const created = []
  const updated = []
  for (const item of payload) {
    const exists = list.some((x) => x.id === item.id)
    upsert(list, item)
    ;(exists ? updated : created).push(item.id)
  }
  return { list, created, updated }
}

export function createApiRouter() {
  return async function apiMiddleware(req, res, next) {
    const url = new URL(req.url, 'http://localhost')
    const { pathname } = url
    if (!pathname.startsWith('/api/')) return next()

    try {
      const method = req.method

      // ---- POST /api/import 导入 skill 生成的 JSON ----
      if (pathname === '/api/import' && method === 'POST') {
        const body = await readBody(req)
        const mode = body.mode === 'replace' ? 'replace' : 'merge'
        const companies = body.companies ?? []
        const jobs = body.jobs ?? []
        const applications = body.applications ?? []

        const errors = []
        // 校验时用"合并后的公司集合"，保证同批 payload 内 job 引用新 company 也合法
        const mergedCompanies = mode === 'replace' ? [] : readCollection('companies')
        for (const c of companies) {
          if (!mergedCompanies.some((x) => x.id === c?.id)) mergedCompanies.push(c)
          validateCompany(c).forEach((m) => errors.push(`companies[${c?.id}] ${m}`))
        }
        const mergedJobs = mode === 'replace' ? [] : readCollection('jobs')
        for (const j of jobs) {
          if (!mergedJobs.some((x) => x.id === j?.id)) mergedJobs.push(j)
          validateJob(j, { companies: mergedCompanies }).forEach((m) => errors.push(`jobs[${j?.id}] ${m}`))
        }
        for (const a of applications) validateApplication(a, { jobs: mergedJobs }).forEach((m) => errors.push(`applications[${a?.id}] ${m}`))

        const result = { ok: errors.length === 0, errors }
        if (errors.length === 0) {
          const stamp = today()
          const stampItem = (x) => ({ ...x, updatedAt: x.updatedAt ?? stamp })
          const files = [
            ['companies', companies],
            ['jobs', jobs],
            ['applications', applications],
          ]
          for (const [file, payload] of files) {
            const { list, created, updated } = upsertCollection(file, payload.map(stampItem))
            await writeCollection(file, list)
            result[file] = { created: created.length, updated: updated.length }
          }
        }
        sendJSON(res, result.ok ? 200 : 422, result)
        return
      }

      // ---- applications 时间线 ----
      const tlMatch = pathname.match(/^\/api\/applications\/([^/]+)\/timeline$/)
      if (tlMatch && method === 'POST') {
        const appId = decodeURIComponent(tlMatch[1])
        const body = await readBody(req)
        const errors = validateTimelineEntry(body)
        if (errors.length > 0) return sendJSON(res, 422, { error: errors.join('；') })
        const apps = readCollection('applications')
        const app = apps.find((a) => a.id === appId)
        if (!app) return sendJSON(res, 404, { error: 'application 不存在' })
        const entry = { stage: body.stage, date: body.date || today(), ...(body.note ? { note: body.note } : {}) }
        app.timeline.push(entry)
        app.currentStatus = deriveStatus(app.timeline)
        app.updatedAt = today()
        await writeCollection('applications', apps)
        sendJSON(res, 200, app)
        return
      }

      // ---- 通用 CRUD ----
      const match = pathname.match(/^\/api\/(companies|jobs|applications)(?:\/([^/]+))?$/)
      if (!match) return sendJSON(res, 404, { error: '未找到接口' })
      const resource = match[1]
      const id = match[2] ? decodeURIComponent(match[2]) : null

      if (method === 'GET') {
        if (!id) {
          let list = readCollection(resource)
          list = applyFilters(list, url.searchParams)
          // jobs 返回时附带 company 简名，便于列表展示
          if (resource === 'jobs') {
            const companies = readCollection('companies')
            list = list.map((j) => ({ ...j, companyName: companies.find((c) => c.id === j.companyId)?.name ?? null }))
          }
          if (resource === 'companies') {
            const jobs = readCollection('jobs')
            list = list.map((c) => ({ ...c, jobCount: jobs.filter((j) => j.companyId === c.id).length }))
          }
          if (resource === 'applications') {
            const jobs = readCollection('jobs')
            list = list.map((a) => ({ ...a, jobTitle: jobs.find((j) => j.id === a.jobId)?.title ?? null }))
          }
          return sendJSON(res, 200, list)
        }
        if (resource === 'companies') {
          const company = readCollection('companies').find((c) => c.id === id)
          if (!company) return sendJSON(res, 404, { error: '公司不存在' })
          const jobs = readCollection('jobs').filter((j) => j.companyId === id)
          return sendJSON(res, 200, { ...company, jobs })
        }
        if (resource === 'jobs') {
          const job = readCollection('jobs').find((j) => j.id === id)
          if (!job) return sendJSON(res, 404, { error: '岗位不存在' })
          const company = readCollection('companies').find((c) => c.id === job.companyId) ?? null
          const application = readCollection('applications').find((a) => a.jobId === id) ?? null
          return sendJSON(res, 200, { ...job, company, application })
        }
        if (resource === 'applications') {
          const app = readCollection('applications').find((a) => a.id === id)
          if (!app) return sendJSON(res, 404, { error: 'application 不存在' })
          return sendJSON(res, 200, app)
        }
      }

      if (method === 'POST') {
        const body = await readBody(req)
        if (resource === 'applications') {
          const errors = validateApplication(body, { jobs: readCollection('jobs') })
          if (errors.length > 0) return sendJSON(res, 422, { error: errors.join('；') })
          const apps = readCollection('applications')
          if (apps.some((a) => a.jobId === body.jobId)) return sendJSON(res, 409, { error: '该岗位已存在申请记录' })
          const stamp = today()
          const app = {
            id: body.id || `app-${body.jobId}`,
            jobId: body.jobId,
            companyId: readCollection('jobs').find((j) => j.id === body.jobId)?.companyId ?? '',
            currentStatus: deriveStatus(body.timeline),
            timeline: body.timeline,
            createdAt: stamp,
            updatedAt: stamp,
          }
          apps.push(app)
          await writeCollection('applications', apps)
          return sendJSON(res, 201, app)
        }
        const validate = resource === 'companies' ? validateCompany : validateJob
        const ctx = resource === 'jobs' ? { companies: readCollection('companies') } : {}
        const errors = validate(body, ctx)
        if (errors.length > 0) return sendJSON(res, 422, { error: errors.join('；') })
        const list = readCollection(resource)
        upsert(list, { ...body, createdAt: body.createdAt ?? today(), updatedAt: today() })
        await writeCollection(resource, list)
        return sendJSON(res, 200, body)
      }

      if (method === 'PUT' && id) {
        const body = await readBody(req)
        const list = readCollection(resource)
        const idx = list.findIndex((x) => x.id === id)
        if (idx < 0) return sendJSON(res, 404, { error: '记录不存在' })
        const validate = resource === 'companies' ? validateCompany : validateJob
        const ctx = resource === 'jobs' ? { companies: readCollection('companies') } : {}
        const merged = { ...list[idx], ...body, id, updatedAt: today() }
        const errors = validate(merged, ctx)
        if (errors.length > 0) return sendJSON(res, 422, { error: errors.join('；') })
        list[idx] = merged
        await writeCollection(resource, list)
        return sendJSON(res, 200, merged)
      }

      if (method === 'DELETE' && id) {
        const list = readCollection(resource)
        const next = list.filter((x) => x.id !== id)
        if (next.length === list.length) return sendJSON(res, 404, { error: '记录不存在' })
        await writeCollection(resource, next)
        if (resource === 'jobs') {
          const apps = readCollection('applications')
          await writeCollection('applications', apps.filter((a) => a.jobId !== id))
        }
        return sendJSON(res, 200, { ok: true })
      }

      return sendJSON(res, 405, { error: '方法不允许' })
    } catch (err) {
      sendJSON(res, 500, { error: err.message })
    }
  }
}

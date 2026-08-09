import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApplications, useCompanies, useJobs } from '../hooks/useApi'
import { APPLICATION_STAGE_LABELS } from '../constants'
import type { ApplicationStage, CompanyType } from '../types'

const FUNNEL: ApplicationStage[] = ['applied', 'written_test', 'interview', 'offer']

export default function StatsPage() {
  const companies = useCompanies()
  const jobs = useJobs()
  const apps = useApplications()

  const stats = useMemo(() => {
    const jobList = jobs.data ?? []
    const appList = apps.data ?? []
    const byCompany = new Map<string, number>()
    for (const j of jobList) byCompany.set(j.companyId, (byCompany.get(j.companyId) ?? 0) + 1)

    const autumnOpen = jobList.filter((j) => j.autumn2026 === 'open').length
    const funnel: Record<ApplicationStage, number> = {
      interested: 0,
      applied: 0,
      written_test: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
    }
    for (const a of appList) funnel[a.currentStatus] += 1
    return { jobList, appList, byCompany, autumnOpen, funnel }
  }, [jobs.data, apps.data])

  const companyRows = (companies.data ?? [])
    .map((c) => ({
      name: c.name,
      count: stats.byCompany.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .filter((r) => r.count > 0)

  const typeCounts = useMemo(() => {
    const counts: Record<CompanyType, number> = { public: 0, private: 0, securities: 0 }
    for (const c of companies.data ?? []) counts[c.type] += 1
    return counts
  }, [companies.data])

  const CAT_STATS: { key: CompanyType; name: string; dot: string }[] = [
    { key: 'public', name: '公募基金', dot: 'pub' },
    { key: 'private', name: '量化私募', dot: 'hedge' },
    { key: 'securities', name: '证券公司', dot: 'sec' },
  ]

  const maxCount = Math.max(1, ...companyRows.map((r) => r.count))

  return (
    <section>
      <h1>统计</h1>
      <div className="stat-cards">
        <div className="card stat-card">
          <div className="stat-num">{stats.jobList.length}</div>
          <div className="muted">岗位总数</div>
        </div>
        <div className="card stat-card">
          <div className="stat-num">{stats.autumnOpen}</div>
          <div className="muted">秋招已开启</div>
        </div>
        <div className="card stat-card">
          <div className="stat-num">{stats.appList.length}</div>
          <div className="muted">申请中/已申请</div>
        </div>
      </div>

      <div className="card detail-card">
        <h3>机构分类</h3>
        <div className="cat-stats">
          {CAT_STATS.map((s) => (
            <div key={s.key} className={`cat-stat ${s.dot}`}>
              <span className={`cat-dot ${s.dot}`} />
              <span className="cat-stat-name">{s.name}</span>
              <span className="cat-stat-num">{typeCounts[s.key]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card detail-card">
        <h3>各公司岗位数</h3>
        {companyRows.length === 0 ? (
          <p className="muted">暂无数据。</p>
        ) : (
          companyRows.map((r) => (
            <div key={r.name} className="bar-row">
              <span className="bar-label">{r.name}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(r.count / maxCount) * 100}%` }} />
              </div>
              <span className="bar-value">{r.count}</span>
            </div>
          ))
        )}
      </div>

      <div className="card detail-card">
        <h3>申请漏斗（投递 → 笔试 → 面试 → Offer）</h3>
        <div className="funnel">
          {FUNNEL.map((s, i) => (
            <div key={s} className="funnel-step">
              <span className="funnel-stage">
                {i + 1}. {APPLICATION_STAGE_LABELS[s]}
              </span>
              <span className="funnel-num">{stats.funnel[s]}</span>
            </div>
          ))}
        </div>
        <p className="muted small">
          注：以当前状态统计。投递过但已处于后续阶段的岗位不会被重复计入早期阶段。
        </p>
      </div>

      <Link to="/" className="link">
        ← 返回岗位列表
      </Link>
    </section>
  )
}

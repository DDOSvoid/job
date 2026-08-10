import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCompanies, useJobs } from '../hooks/useApi'
import FilterBar, { filtersToParams, paramsToFilters, type FilterState } from '../components/FilterBar'
import { CompanyTypeBadge } from '../components/StatusBadge'
import { SkeletonGrid } from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'
import type { CompanyType, Job } from '../types'

const SECTIONS: { type: CompanyType; title: string; dot: string }[] = [
  { type: 'public', title: '公募基金', dot: 'pub' },
  { type: 'private', title: '量化私募', dot: 'hedge' },
  { type: 'securities', title: '证券公司', dot: 'sec' },
  { type: 'tech', title: '科技/量化科技', dot: 'tech' },
]

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * 目录表的一行：公司 | 量化岗位 | 官网 | 投递入口。
 * 行内含有多个可点击链接，故行本身用 <div> 而非外层 <Link>。
 */
function DirRow({
  company,
  jobs,
}: {
  company: { id: string; name: string; type: CompanyType; website: string; location: string }
  jobs: Job[]
}) {
  // 投递入口去重（同一入口下的多个岗位只展示一次），最多展示 2 个
  const applyLinks = useMemo(() => {
    const seen = new Set<string>()
    const out: { url: string; label: string }[] = []
    for (const j of jobs) {
      if (!j.applyUrl || seen.has(j.applyUrl)) continue
      seen.add(j.applyUrl)
      out.push({ url: j.applyUrl, label: hostOf(j.applyUrl) })
      if (out.length >= 2) break
    }
    return out
  }, [jobs])

  return (
    <div className="dir-row">
      <div className="dir-cell">
        <Link to={`/companies/${company.id}`} className="dir-company-name">
          {company.name}
        </Link>
        <div className="dir-company-sub">
          <CompanyTypeBadge type={company.type} />
          <span className="dir-company-loc">{company.location}</span>
        </div>
      </div>
      <div className="dir-cell dir-jobs">
        {jobs.length === 0 ? (
          <span className="muted small">（暂无岗位记录）</span>
        ) : (
          jobs.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="dir-job-link">
              {j.title}
            </Link>
          ))
        )}
      </div>
      <div className="dir-cell">
        {company.website && (
          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="dir-link"
            title={company.website}
          >
            {hostOf(company.website)} ↗
          </a>
        )}
      </div>
      <div className="dir-cell dir-links">
        {applyLinks.length === 0 ? (
          <span className="muted small">—</span>
        ) : (
          applyLinks.map((a) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="dir-link"
              title={a.url}
            >
              {a.label} ↗
            </a>
          ))
        )}
      </div>
    </div>
  )
}

export default function CompanyListPage() {
  const companies = useCompanies()
  const jobsQ = useJobs()
  // 筛选状态以 URL search params 为源：筛选后进公司详情、浏览器后退，可恢复筛选前的列表
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<FilterState>(() => paramsToFilters(searchParams))

  const updateFilters = (f: FilterState) => {
    setFilters(f)
    setSearchParams(filtersToParams(f), { replace: true })
  }

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return (companies.data ?? []).filter((c) => {
      if (filters.type && c.type !== filters.type) return false
      if (q) {
        const hay = `${c.name} ${c.location ?? ''} ${c.about ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [companies.data, filters])

  // 每家公司 → 岗位列表（目录表的岗位列 / 投递入口列需要）
  const jobsByCompany = useMemo(() => {
    const m = new Map<string, Job[]>()
    for (const j of jobsQ.data ?? []) {
      const arr = m.get(j.companyId) ?? []
      arr.push(j)
      m.set(j.companyId, arr)
    }
    return m
  }, [jobsQ.data])

  const sections = SECTIONS.map((s) => ({
    ...s,
    companies: list.filter((c) => c.type === s.type),
  })).filter((s) => s.companies.length > 0)

  return (
    <section>
      <div className="page-head">
        <h1>机构目录</h1>
        <p className="sub">{companies.data?.length ?? 0} 家机构 · 公募 / 私募 / 券商 / 科技</p>
      </div>
      <FilterBar
        filters={filters}
        onChange={updateFilters}
        companies={companies.data ?? []}
        total={list.length}
        unit="家机构"
      />
      {companies.isLoading || jobsQ.isLoading ? (
        <SkeletonGrid />
      ) : list.length === 0 ? (
        <EmptyState
          title="没有符合条件的机构"
          hint="试试用 skill 调研更多公司，例如「查一下九坤的量化岗位并写入」"
        />
      ) : (
        sections.map((s) => (
          <section key={s.type} className="dir-section" data-type={s.type}>
            <div className="dir-head">
              <span className={`cat-dot ${s.dot}`} />
              <span className="dir-title">{s.title}</span>
              <span className="dir-count">{s.companies.length} 家</span>
            </div>
            <div className="dir-table">
              <div className="dir-row-head">
                <span>公司</span>
                <span>量化岗位</span>
                <span>官网</span>
                <span>投递入口</span>
              </div>
              {s.companies.map((c) => (
                <DirRow key={c.id} company={c} jobs={jobsByCompany.get(c.id) ?? []} />
              ))}
            </div>
          </section>
        ))
      )}
    </section>
  )
}

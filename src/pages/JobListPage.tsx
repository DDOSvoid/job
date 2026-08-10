import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApplications, useCompanies, useJobs } from '../hooks/useApi'
import FilterBar, { filtersToParams, paramsToFilters, type FilterState } from '../components/FilterBar'
import JobRow from '../components/JobRow'
import MarketStrip from '../components/MarketStrip'
import { SkeletonList } from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'
import type { ApplicationStage, CompanyType, Job } from '../types'

const AUTUMN_ORDER = ['open', 'not_started', 'unknown', 'ended']

function applyFilters(
  jobs: Job[],
  appByJob: Map<string, ApplicationStage>,
  filters: FilterState,
  companyInfo: (id: string) => { name: string; type?: CompanyType },
): Job[] {
  const q = filters.q.trim().toLowerCase()
  const filtered = jobs.filter((j) => {
    const info = companyInfo(j.companyId)
    if (filters.companyId && j.companyId !== filters.companyId) return false
    if (filters.autumn2026 && j.autumn2026 !== filters.autumn2026) return false
    if (filters.type && info.type !== filters.type) return false
    if (filters.stage && appByJob.get(j.id) !== filters.stage) return false
    if (q) {
      const hay = `${j.title} ${info.name} ${j.description ?? ''} ${j.salary ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  switch (filters.sort) {
    case 'recent':
      return [...filtered].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    case 'autumn':
      return [...filtered].sort((a, b) => AUTUMN_ORDER.indexOf(a.autumn2026) - AUTUMN_ORDER.indexOf(b.autumn2026))
    case 'verified':
      return [...filtered].sort((a, b) => Number(a.salaryIsEstimate) - Number(b.salaryIsEstimate))
    default:
      return filtered
  }
}

export default function JobListPage() {
  const companies = useCompanies()
  const jobsQ = useJobs()
  const appsQ = useApplications()

  // 筛选状态以 URL search params 为源：筛选后进详情、浏览器后退，可恢复筛选前的列表
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<FilterState>(() => paramsToFilters(searchParams))

  const updateFilters = (f: FilterState) => {
    setFilters(f)
    setSearchParams(filtersToParams(f), { replace: true })
  }

  const jobs = jobsQ.data ?? []
  const apps = appsQ.data ?? []
  const appByJob = useMemo(
    () => new Map(apps.map((a) => [a.jobId, a.currentStatus])),
    [apps],
  )
  const nameOf = useMemo(() => {
    const map = new Map((companies.data ?? []).map((c) => [c.id, { name: c.name, type: c.type }]))
    return (id: string) => map.get(id) ?? { name: '', type: undefined }
  }, [companies.data])

  const filtered = useMemo(
    () => applyFilters(jobs, appByJob, filters, nameOf),
    [jobs, appByJob, filters, nameOf],
  )

  const autumnOpen = useMemo(() => jobs.filter((j) => j.autumn2026 === 'open').length, [jobs])
  const activeStatus = new Set<ApplicationStage>(['applied', 'written_test', 'interview'])
  const appliedTotal = apps.filter((a) => activeStatus.has(a.currentStatus)).length

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="eyebrow">2026 秋招</p>
          <h1>量化研究岗位</h1>
        </div>
        <p className="sub">
          {jobs.length} 个岗位 · {companies.data?.length ?? 0} 家公司
        </p>
      </div>
      <MarketStrip jobsTotal={jobs.length} autumnOpen={autumnOpen} appliedTotal={appliedTotal} />
      <FilterBar
        filters={filters}
        onChange={updateFilters}
        companies={companies.data ?? []}
        showStage
        total={filtered.length}
        unit="个岗位"
      />
      {jobsQ.isLoading ? (
        <SkeletonList />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="没有符合条件的岗位"
          hint={filters.q ? '试试调整关键词或清除筛选。' : '试试用 skill 调研更多公司，例如「查一下幻方的量化岗位并写入」'}
        />
      ) : (
        <>
          <div className="list-head" aria-hidden="true">
            <span className="list-head-cell">公司</span>
            <span className="list-head-cell">岗位</span>
            <span className="list-head-cell num">薪资</span>
            <span className="list-head-cell num">进展</span>
            <span />
          </div>
          <div className="job-list">
            {filtered.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                stage={appByJob.get(job.id)}
                companyType={nameOf(job.companyId).type}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

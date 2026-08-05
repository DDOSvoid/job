import { useMemo, useState } from 'react'
import { useApplications, useCompanies, useJobs } from '../hooks/useApi'
import FilterBar, { type FilterState } from '../components/FilterBar'
import JobCard from '../components/JobCard'
import { StageBadge } from '../components/StatusBadge'
import type { ApplicationStage, Job } from '../types'

export default function JobListPage() {
  const companies = useCompanies()
  const jobsQ = useJobs()
  const appsQ = useApplications()

  const [filters, setFilters] = useState<FilterState>({
    companyId: '',
    type: '',
    autumn2026: '',
    stage: '',
  })

  const jobs = jobsQ.data ?? []
  const appByJob = useMemo(
    () => new Map(appsQ.data?.map((a) => [a.jobId, a]) ?? []),
    [appsQ.data],
  )

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (filters.companyId && j.companyId !== filters.companyId) return false
      if (filters.autumn2026 && j.autumn2026 !== filters.autumn2026) return false
      const company = companies.data?.find((c) => c.id === j.companyId)
      if (filters.type && company?.type !== filters.type) return false
      if (filters.stage && appByJob.get(j.id)?.currentStatus !== filters.stage) return false
      return true
    })
  }, [jobs, appByJob, companies.data, filters])

  return (
    <section>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        companies={companies.data ?? []}
        showStage
      />
      {jobsQ.isLoading ? (
        <p className="muted">加载中…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">没有符合条件的岗位。</p>
      ) : (
        <div className="card-grid">
          {filtered.map((job) => (
            <JobListCard key={job.id} job={job} stage={appByJob.get(job.id)?.currentStatus} />
          ))}
        </div>
      )}
    </section>
  )
}

function JobListCard({ job, stage }: { job: Job; stage?: ApplicationStage }) {
  return (
    <div className="job-card-wrap">
      <JobCard job={job} />
      {stage && (
        <div className="job-card-stage">
          申请进度：<StageBadge stage={stage} />
        </div>
      )}
    </div>
  )
}

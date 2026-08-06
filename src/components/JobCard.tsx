import { Link } from 'react-router-dom'
import type { Job } from '../types'
import { displaySalary } from '../lib/salary'
import { AutumnBadge, FetchBadge, SourceTypeBadge } from './StatusBadge'
import CompanyAvatar from './CompanyAvatar'

export default function JobCard({ job }: { job: Job }) {
  const sal = displaySalary(job.salary, job.salaryIsEstimate)
  return (
    <Link to={`/jobs/${job.id}`} className="card job-card">
      <div className="job-card-head">
        <div className="job-card-title-row">
          <CompanyAvatar name={job.companyName ?? job.companyId} id={job.companyId} />
          <h3>{job.title}</h3>
        </div>
        {job.salaryIsEstimate ? (
          <span className="salary-est" title={job.salary}>
            <span>{sal.main}</span>
            <span className="chip chip-amber">未核实</span>
          </span>
        ) : (
          <span className="salary salary-verified">{sal.main}</span>
        )}
      </div>
      <div className="job-card-meta">
        <span className="company-name">{job.companyName ?? job.companyId}</span>
        <SourceTypeBadge type={job.source} />
        <AutumnBadge status={job.autumn2026} />
        <FetchBadge status={job.fetchStatus} />
      </div>
      <p className="desc">{job.description}</p>
    </Link>
  )
}

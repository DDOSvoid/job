import { Link } from 'react-router-dom'
import type { Job } from '../types'
import { JOB_SOURCE_LABELS } from '../constants'
import { AutumnBadge, FetchBadge } from './StatusBadge'

export default function JobCard({ job }: { job: Job }) {
  return (
    <Link to={`/jobs/${job.id}`} className="card job-card">
      <div className="job-card-head">
        <h3>{job.title}</h3>
        {job.salaryIsEstimate ? (
          <span className="salary salary-est" title="薪资为占位/未核实">
            {job.salary}
          </span>
        ) : (
          <span className="salary">{job.salary}</span>
        )}
      </div>
      <div className="job-card-meta">
        <span className="company-name">{job.companyName ?? job.companyId}</span>
        <span className="badge badge-4">{JOB_SOURCE_LABELS[job.source]}</span>
        <AutumnBadge status={job.autumn2026} />
        <FetchBadge status={job.fetchStatus} />
      </div>
      <p className="desc">{job.description}</p>
    </Link>
  )
}

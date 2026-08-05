import { Link } from 'react-router-dom'
import type { Company } from '../types'
import { CompanyTypeBadge } from './StatusBadge'

export default function CompanyCard({ company }: { company: Company }) {
  return (
    <Link to={`/companies/${company.id}`} className="card company-card">
      <div className="job-card-head">
        <h3>{company.name}</h3>
        <CompanyTypeBadge type={company.type} />
      </div>
      <div className="job-card-meta">
        <span className="muted">📍 {company.location}</span>
        {typeof company.jobCount === 'number' && (
          <span className="muted">{company.jobCount} 个岗位</span>
        )}
      </div>
      <p className="desc">{company.about}</p>
    </Link>
  )
}

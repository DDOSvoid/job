import { Link, useParams } from 'react-router-dom'
import { useCompany } from '../hooks/useApi'
import JobCard from '../components/JobCard'
import { CompanyTypeBadge } from '../components/StatusBadge'

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const company = useCompany(id ?? '')

  if (company.isLoading) return <p className="muted">加载中…</p>
  if (!company.data) return <p className="error">公司不存在。</p>

  const c = company.data
  return (
    <section>
      <h1>
        {c.name} <CompanyTypeBadge type={c.type} />
      </h1>
      <div className="meta-line">
        <span>📍 {c.location}</span>
        <a href={c.website} target="_blank" rel="noreferrer" className="link">
          官方网站
        </a>
      </div>
      <p>{c.about}</p>

      <h2>旗下岗位（{c.jobs.length}）</h2>
      {c.jobs.length === 0 ? (
        <p className="muted">暂无岗位记录，可用 skill 调研后补充。</p>
      ) : (
        <div className="card-grid">
          {c.jobs.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}
      <Link to="/companies" className="link">
        ← 返回公司列表
      </Link>
    </section>
  )
}

import { Link } from 'react-router-dom'
import type { ApplicationStage, CompanyType, Job } from '../types'
import CompanyAvatar from './CompanyAvatar'
import PipelineBar from './PipelineBar'
import SalaryDisplay from './SalaryDisplay'
import { AutumnBadge, CompanyTypeBadge, FetchBadge, RecruitmentTypeBadge, SourceTypeBadge } from './StatusBadge'

interface Props {
  job: Job
  stage?: ApplicationStage
  companyType?: CompanyType
}

/**
 * 岗位宽行卡片 —— 模块化布局：
 * [ 公司 ] [ 岗位 ] [ 薪资 ] [ 进展/信息 ] [ › ]
 */
export default function JobRow({ job, stage, companyType }: Props) {
  const companyName = job.companyName ?? job.companyId
  return (
    <Link to={`/jobs/${job.id}`} className="card job-row" data-type={companyType}>
      {/* 公司模块 */}
      <div className="row-mod mod-company">
        <CompanyAvatar name={companyName} id={job.companyId} size="md" />
        <div className="mod-company-text">
          <div className="mod-company-name" title={companyName}>
            {companyName}
          </div>
          {companyType && <CompanyTypeBadge type={companyType} />}
        </div>
      </div>

      {/* 岗位模块 */}
      <div className="row-mod mod-sep mod-job">
        <h3 className="mod-job-title">{job.title}</h3>
        <p className="mod-job-desc">{job.description}</p>
      </div>

      {/* 薪资模块 */}
      <div className="row-mod mod-sep mod-salary">
        <div className="mod-label">薪资</div>
        <SalaryDisplay salary={job.salary} isEstimate={job.salaryIsEstimate} />
      </div>

      {/* 进展 / 信息来源模块 */}
      <div className="row-mod mod-sep mod-status">
        <div className="mod-label">进展</div>
        <div className="mod-badges">
          <AutumnBadge status={job.autumn2026} />
          <RecruitmentTypeBadge recruitmentType={job.recruitmentType} />
          {stage && <PipelineBar stage={stage} />}
        </div>
        <div className="mod-sub">
          <SourceTypeBadge type={job.source} />
          <FetchBadge status={job.fetchStatus} />
        </div>
      </div>

      {/* 箭头模块 */}
      <div className="row-mod mod-sep mod-arrow" aria-hidden="true">
        <span className="row-chevron">›</span>
      </div>
    </Link>
  )
}

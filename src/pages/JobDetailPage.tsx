import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppendTimeline, useCreateApplication, useJob } from '../hooks/useApi'
import { todayStr } from '../constants'
import { displaySalary } from '../lib/salary'
import {
  AutumnBadge,
  CompanyTypeBadge,
  FetchBadge,
  SourceBadge,
  SourceTypeBadge,
  StageBadge,
} from '../components/StatusBadge'
import CompanyAvatar from '../components/CompanyAvatar'
import ApplicationTimeline from '../components/ApplicationTimeline'
import ApplicationForm from '../components/ApplicationForm'
import type { ApplicationStage } from '../types'

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const jobQ = useJob(id ?? '')
  const createApp = useCreateApplication()
  const appendTl = useAppendTimeline()
  const [actionError, setActionError] = useState<string | null>(null)

  if (jobQ.isLoading) return <p className="muted">加载中…</p>
  const job = jobQ.data
  if (!job) return <p className="error">岗位不存在。</p>

  const company = job.company
  const application = job.application
  const sal = displaySalary(job.salary, job.salaryIsEstimate)

  const handleStart = async () => {
    setActionError(null)
    try {
      await createApp.mutateAsync({
        jobId: job.id,
        timeline: [{ date: todayStr(), stage: 'applied', note: '开始记录投递进度' }],
      })
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  const handleAppend = async (entry: { stage: ApplicationStage; date: string; note: string }) => {
    if (!application) return
    setActionError(null)
    try {
      await appendTl.mutateAsync({ appId: application.id, entry })
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  const submitting = createApp.isPending || appendTl.isPending

  return (
    <section>
      <h1>{job.title}</h1>
      <div className="meta-line">
        {company && (
          <>
            <CompanyAvatar name={company.name} id={company.id} />
            <Link to={`/companies/${company.id}`} className="link">
              {company.name}
            </Link>
            <CompanyTypeBadge type={company.type} />
            <span className="muted">📍 {company.location}</span>
          </>
        )}
        <AutumnBadge status={job.autumn2026} />
        <FetchBadge status={job.fetchStatus} />
      </div>

      <div className="card detail-card detail-hero">
        <div className="hero-head">
          <div className="salary-block">
            <div className="salary-label">预计薪资</div>
            <div className="salary-main-row">
              {job.salaryIsEstimate ? (
                <>
                  <span className="salary-est-lg" title={job.salary}>
                    {sal.main}
                  </span>
                  <span className="chip chip-amber">未核实</span>
                </>
              ) : (
                <>
                  <span className="salary salary-lg salary-verified" title={job.salary}>
                    {sal.main}
                  </span>
                  <span className="chip chip-verified">已核实</span>
                </>
              )}
            </div>
            {sal.note && <div className="salary-note">{sal.note}</div>}
          </div>
          <div className="cta-row">
            <a className="btn btn-primary btn-lg" href={job.applyUrl} target="_blank" rel="noreferrer">
              去投递 ↗
            </a>
            {job.autumn2026 === 'open' && <span className="muted small">秋招进行中</span>}
          </div>
        </div>
        <div className="detail-rows">
          {job.autumn2026Note && (
            <div className="detail-row">
              <span className="detail-label">秋招</span>
              <span className="muted detail-value">{job.autumn2026Note}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-label">官网</span>
            <a href={job.officialUrl} target="_blank" rel="noreferrer" className="link detail-value">
              {job.officialUrl}
            </a>
          </div>
          <div className="detail-row">
            <span className="detail-label">投递</span>
            <a href={job.applyUrl} target="_blank" rel="noreferrer" className="link detail-value">
              {job.applyUrl}
            </a>
          </div>
        </div>
      </div>

      <div className="card detail-card">
        <h3>岗位介绍</h3>
        <p className="pre-line">{job.description}</p>
        {job.notes && <p className="muted">备注：{job.notes}</p>}
      </div>

      <div className="card detail-card">
        <h3>信息来源（{job.sources.length}）</h3>
        <ul className="source-list">
          {job.sources.map((s, i) => (
            <li key={i} className="source-item">
              <div className="source-head">
                <SourceTypeBadge type={s.type} />
                <SourceBadge status={s.status} />
                <a href={s.url} target="_blank" rel="noreferrer" className="link">
                  打开原文 ↗
                </a>
              </div>
              <div className="source-title">{s.title}</div>
              <div className="muted small">抓取于 {s.accessedAt}</div>
              {s.note && <p className="source-note">{s.note}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div className="card detail-card">
        <h3>
          推进进程
          {application && (
            <>
              {' '}
              当前状态：<StageBadge stage={application.currentStatus} />
            </>
          )}
        </h3>
        {!application ? (
          <div>
            <p className="muted">还没有投递记录。</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStart}
              disabled={submitting}
            >
              开始记录投递
            </button>
          </div>
        ) : (
          <div>
            <ApplicationTimeline application={application} />
            <ApplicationForm
              appId={application.id}
              onSubmit={handleAppend}
              submitting={submitting}
              error={actionError}
            />
          </div>
        )}
      </div>

      {actionError && !application && <p className="error">{actionError}</p>}

      <Link to="/" className="link">
        ← 返回岗位列表
      </Link>
    </section>
  )
}

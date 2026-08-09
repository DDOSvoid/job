import { Link, useParams } from 'react-router-dom'
import { useCompanies, useInterview } from '../hooks/useApi'
import {
  InterviewDifficultyBadge,
  InterviewResultBadge,
  InterviewSourceBadge,
  SourceBadge,
} from '../components/StatusBadge'
import SkeletonCard from '../components/SkeletonCard'

// sourceStatus 非 complete 时给用户的提示语
const SOURCE_STATUS_NOTE = {
  partial: '只抓取到摘要/部分内容',
  manual_required: '需手动确认',
  blocked: '被登录墙/验证墙拦截',
} as const

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>()
  const interviewQ = useInterview(id ?? '')
  const companiesQ = useCompanies()

  if (interviewQ.isLoading) {
    return (
      <section>
        <p className="muted">加载中…</p>
        <SkeletonCard />
      </section>
    )
  }
  const interview = interviewQ.data
  if (!interview) return <p className="error">面试经历不存在。</p>

  const company = companiesQ.data?.find((c) => c.id === interview.companyId) ?? null

  return (
    <section>
      <Link to="/interviews" className="link">
        ← 返回面试经历
      </Link>

      <div className="page-head">
        <h1>
          {company?.name ?? interview.companyName ?? '未知公司'} · {interview.jobTitle}
        </h1>
        <p className="sub">
          <InterviewResultBadge result={interview.result} /> <InterviewDifficultyBadge difficulty={interview.difficulty} />
        </p>
      </div>

      <div className="card detail-card detail-hero">
        <div className="detail-rows">
          <div className="detail-row">
            <span className="detail-label">来源</span>
            <span className="detail-value" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <InterviewSourceBadge source={interview.source} />
              <SourceBadge status={interview.sourceStatus} />
              <span className="muted small">发布于 {interview.collectedAt}</span>
            </span>
          </div>
          {interview.sourceTitle && (
            <div className="detail-row">
              <span className="detail-label">标题</span>
              <span className="detail-value">{interview.sourceTitle}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-label">原文</span>
            <a href={interview.sourceUrl} target="_blank" rel="noreferrer" className="link detail-value">
              {interview.sourceUrl}
            </a>
          </div>
          {interview.sourceStatus !== 'complete' && (
            <div className="detail-row">
              <span className="detail-label">提醒</span>
              <span className="muted detail-value">
                该来源{SOURCE_STATUS_NOTE[interview.sourceStatus]}，题目细节请打开原文手动核对。
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card detail-card">
        <h3>面试轮次（{interview.rounds.length}）</h3>
        <div className="iv-rounds">
          {interview.rounds.map((r, i) => (
            <div key={i} className="iv-round">
              <div className="iv-round-head">
                <span className="iv-round-name">{r.name}</span>
                {r.date && <span className="muted small">{r.date}</span>}
              </div>
              <p className="iv-round-content pre-line">{r.content}</p>
            </div>
          ))}
        </div>
      </div>

      {interview.summary && (
        <div className="card detail-card">
          <h3>整体感受</h3>
          <p className="pre-line">{interview.summary}</p>
        </div>
      )}

      {interview.notes && (
        <div className="card detail-card">
          <h3>备注</h3>
          <p className="muted pre-line">{interview.notes}</p>
        </div>
      )}
    </section>
  )
}

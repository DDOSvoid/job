import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCompanies, useGenerateAiAnswer, useQuestion, useUpdateMyAnswer } from '../hooks/useApi'
import {
  InterviewSourceBadge,
  QuestionCategoryBadge,
  SourceBadge,
} from '../components/StatusBadge'
import { ApiError } from '../api/client'
import SkeletonCard from '../components/SkeletonCard'

/** AI 生成未接入（503）时给用户的提示 */
const AI_NOT_CONFIGURED_HINT =
  'AI 回答未接入：后端尚未配置 AI_API_KEY（server/ai-provider.js，默认 DeepSeek）。配置后此按钮即生效。'

export default function QuestionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const questionQ = useQuestion(id ?? '')
  const companiesQ = useCompanies()
  const updateMy = useUpdateMyAnswer()
  const genAi = useGenerateAiAnswer()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [aiHint, setAiHint] = useState<string | null>(null)

  // 进入编辑态时，把当前已保存的回答预填进草稿
  const answer = questionQ.data?.answer ?? null
  useEffect(() => {
    if (editing) setDraft(answer?.myAnswer ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  if (questionQ.isLoading) {
    return (
      <section>
        <p className="muted">加载中…</p>
        <SkeletonCard />
      </section>
    )
  }
  const question = questionQ.data
  if (!question) return <p className="error">题目不存在。</p>

  const company = companiesQ.data?.find((c) => c.id === question.companyId) ?? null
  const companyName = company?.name ?? question.companyName ?? '通用/汇总'

  const handleSaveMyAnswer = () => {
    updateMy.mutate(
      { id: question.id, myAnswer: draft },
      { onSuccess: () => setEditing(false) },
    )
  }

  const handleGenerateAi = () => {
    setAiHint(null)
    genAi.mutate(question.id, {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 503) setAiHint(AI_NOT_CONFIGURED_HINT)
        else setAiHint(err instanceof Error ? err.message : 'AI 生成失败')
      },
    })
  }

  return (
    <section>
      <Link to="/questions" className="link">
        ← 返回真实面试题目
      </Link>

      <div className="page-head">
        <h1>{companyName} · 面试题</h1>
        <p className="sub">
          <QuestionCategoryBadge category={question.category} />
          {question.companyHint && <span className="muted">{question.companyHint}</span>}
        </p>
      </div>

      {/* 题面 */}
      <div className="card detail-card detail-hero">
        <div className="q-text">{question.text}</div>
        <div className="q-meta" style={{ marginTop: 12 }}>
          <span className="q-company">{companyName}</span>
          {question.round && <span className="badge badge-neutral">{question.round}</span>}
          <span className="q-source">
            <InterviewSourceBadge source={question.source} />
            <SourceBadge status={question.sourceStatus} />
            <a href={question.sourceUrl} target="_blank" rel="noreferrer" className="link">
              原帖 ↗
            </a>
          </span>
          {question.sourceTitle && (
            <span className="q-source-title muted small" title={question.sourceTitle}>
              {question.sourceTitle}
            </span>
          )}
          {question.sourceDate && <span className="q-date muted small">{question.sourceDate}</span>}
        </div>
        {question.note && <p className="muted small pre-line" style={{ marginTop: 10 }}>{question.note}</p>}
      </div>

      {/* Part 1：我的回答 */}
      <div className="card detail-card">
        <h3>我的回答</h3>
        {editing ? (
          <>
            <textarea
              className="answer-textarea"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="写下你对这道题的回答…（可留空保存以清空）"
              aria-label="我的回答"
            />
            <div className="answer-toolbar">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={updateMy.isPending}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveMyAnswer} disabled={updateMy.isPending}>
                {updateMy.isPending ? '保存中…' : '保存回答'}
              </button>
            </div>
            {updateMy.isError && <p className="error">{updateMy.error?.message}</p>}
          </>
        ) : (
          <>
            {answer?.myAnswer ? (
              <p className="answer-content">{answer.myAnswer}</p>
            ) : (
              <p className="answer-empty">还没有写回答。</p>
            )}
            <div className="answer-toolbar">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
                {answer?.myAnswer ? '✎ 修改回答' : '写下回答'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Part 2：AI 回答 */}
      <div className="card detail-card">
        <h3>AI 回答</h3>
        {answer?.aiAnswer ? (
          <>
            <p className="answer-content">{answer.aiAnswer}</p>
            {(answer.aiModel || answer.aiGeneratedAt) && (
              <p className="muted small" style={{ marginTop: 8 }}>
                {[answer.aiModel, answer.aiGeneratedAt].filter(Boolean).join(' · ')}
              </p>
            )}
          </>
        ) : (
          <p className="answer-empty">还没有 AI 回答。</p>
        )}
        <div className="answer-toolbar">
          <button type="button" className="btn btn-primary" onClick={handleGenerateAi} disabled={genAi.isPending}>
            {genAi.isPending ? '生成中…' : answer?.aiAnswer ? '重新生成' : '生成 AI 回答'}
          </button>
        </div>
        {aiHint && <p className="muted small" style={{ marginTop: 8 }}>{aiHint}</p>}
        {genAi.isError && !aiHint && <p className="error">{genAi.error?.message}</p>}
      </div>
    </section>
  )
}

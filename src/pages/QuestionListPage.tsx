import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCompanies, useQuestions } from '../hooks/useApi'
import {
  InterviewSourceBadge,
  QuestionCategoryBadge,
  SourceBadge,
} from '../components/StatusBadge'
import ChipGroup from '../components/ChipGroup'
import MultiSelect from '../components/MultiSelect'
import { SkeletonGrid } from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'
import {
  INTERVIEW_SOURCES,
  INTERVIEW_SOURCE_LABELS,
  QUESTION_CATEGORIES,
  QUESTION_CATEGORY_LABELS,
  SOURCE_STATUSES,
  SOURCE_STATUS_LABELS,
} from '../constants'
import type { InterviewSource, QuestionCategory, SourceStatus } from '../types'

/** 「通用/汇总」公司的哨兵值（companyId 为 null 的题目） */
const GENERIC = '__generic__'

interface QuestionFilter {
  q: string
  /** 多选：空数组 = 不过滤；含 GENERIC 表示勾选"通用/汇总" */
  companyId: string[]
  category: QuestionCategory[]
  source: InterviewSource[]
  status: SourceStatus[]
}

const defaultFilter: QuestionFilter = { q: '', companyId: [], category: [], source: [], status: [] }

// 筛选状态 ⇄ URL search params（与面试列表页一致的模式）
function filtersToParams(f: QuestionFilter): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.companyId.length) sp.set('companyId', f.companyId.join(','))
  if (f.category.length) sp.set('category', f.category.join(','))
  if (f.source.length) sp.set('source', f.source.join(','))
  if (f.status.length) sp.set('status', f.status.join(','))
  return sp
}

function parseList<T extends string>(sp: URLSearchParams, key: string, allowed: T[]): T[] {
  const raw = sp.get(key)
  if (!raw) return []
  return raw.split(',').filter((v): v is T => (allowed as string[]).includes(v))
}

function paramsToFilters(sp: URLSearchParams): QuestionFilter {
  return {
    q: sp.get('q') ?? '',
    companyId: (sp.get('companyId') ?? '').split(',').filter(Boolean),
    category: parseList(sp, 'category', QUESTION_CATEGORIES),
    source: parseList(sp, 'source', INTERVIEW_SOURCES),
    status: parseList(sp, 'status', SOURCE_STATUSES),
  }
}

/**
 * 真实面试题目库：一条帖子拆成多条题目，逐条展示。
 * 题目可挂公司（companyId）或通用/汇总（companyId 为 null）。
 */
export default function QuestionListPage() {
  const questionsQ = useQuestions()
  const companiesQ = useCompanies()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<QuestionFilter>(() => paramsToFilters(searchParams))

  const set = (patch: Partial<QuestionFilter>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    setSearchParams(filtersToParams(next), { replace: true })
  }
  const hasActive =
    filters.q !== '' ||
    filters.companyId.length > 0 ||
    filters.category.length > 0 ||
    filters.source.length > 0 ||
    filters.status.length > 0

  const stats = useMemo(() => {
    const all = questionsQ.data ?? []
    const withCompany = all.filter((q) => q.companyId)
    return {
      total: all.length,
      companies: new Set(withCompany.map((q) => q.companyId)).size,
      generic: all.length - withCompany.length,
    }
  }, [questionsQ.data])

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return (questionsQ.data ?? [])
      .filter((it) => {
        if (filters.category.length && !filters.category.includes(it.category)) return false
        if (filters.source.length && !filters.source.includes(it.source)) return false
        if (filters.status.length && !filters.status.includes(it.sourceStatus)) return false
        if (filters.companyId.length) {
          if (it.companyId) {
            if (!filters.companyId.includes(it.companyId)) return false
          } else if (!filters.companyId.includes(GENERIC)) {
            return false
          }
        }
        if (q) {
          const hay =
            `${it.text} ${it.companyName ?? ''} ${it.companyHint ?? ''} ${it.round ?? ''} ${it.sourceTitle ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      // 默认按搜集日期倒序（新抓取的题在前）
      .sort((a, b) => (a.collectedAt === b.collectedAt ? 0 : a.collectedAt < b.collectedAt ? 1 : -1))
  }, [questionsQ.data, filters])

  return (
    <section>
      <div className="page-head">
        <h1>真实面试题目</h1>
        <p className="sub">
          {stats.total} 道题 · 覆盖 {stats.companies} 家公司{stats.generic > 0 && ` · 通用 ${stats.generic} 道`}
        </p>
      </div>

      <div className="filter-bar">
        <div className="filter-row">
          <div className="filter-search">
            <span className="search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="text"
              className="search-input"
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="搜索题目 / 公司 / 帖子…"
              aria-label="关键词搜索"
            />
          </div>
          {hasActive && (
            <button type="button" className="btn btn-ghost" onClick={() => set(defaultFilter)}>
              ✕ 清除筛选
            </button>
          )}
        </div>
        <div className="filter-row">
          <MultiSelect
            label="公司"
            options={[
              { value: GENERIC, label: '通用/汇总' },
              ...(companiesQ.data ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
            values={filters.companyId}
            onChange={(v) => set({ companyId: v })}
            allLabel="全部"
            searchPlaceholder="搜索公司…"
          />
          <ChipGroup
            label="分类"
            options={QUESTION_CATEGORIES.map((c) => ({ value: c, label: QUESTION_CATEGORY_LABELS[c] }))}
            values={filters.category}
            onChange={(v) => set({ category: v })}
          />
          <ChipGroup
            label="来源"
            options={INTERVIEW_SOURCES.map((s) => ({ value: s, label: INTERVIEW_SOURCE_LABELS[s] }))}
            values={filters.source}
            onChange={(v) => set({ source: v })}
          />
          <ChipGroup
            label="抓取"
            options={SOURCE_STATUSES.map((s) => ({ value: s, label: SOURCE_STATUS_LABELS[s] }))}
            values={filters.status}
            onChange={(v) => set({ status: v })}
          />
        </div>
        <p className="filter-count">
          共 <b>{list.length}</b> 道题{hasActive && '（已筛选）'}
        </p>
      </div>

      {questionsQ.isLoading ? (
        <SkeletonGrid />
      ) : list.length === 0 ? (
        <EmptyState
          title="还没有符合条件的题目"
          hint="用 interview-experience-research skill 从牛客/知乎/小红书抓取量化面试题目"
        />
      ) : (
        <div className="q-list">
          {list.map((q) => (
            <div key={q.id} className="card q-card">
              <div className="q-main">
                <QuestionCategoryBadge category={q.category} />
                <div className="q-text">{q.text}</div>
              </div>
              <div className="q-meta">
                <span className="q-company">{q.companyName ?? '通用/汇总'}</span>
                {q.companyHint && <span className="q-hint muted">{q.companyHint}</span>}
                {q.round && <span className="badge badge-neutral">{q.round}</span>}
                <span className="q-source">
                  <InterviewSourceBadge source={q.source} />
                  <SourceBadge status={q.sourceStatus} />
                  <a href={q.sourceUrl} target="_blank" rel="noreferrer" className="link">
                    原帖 ↗
                  </a>
                </span>
                {q.sourceTitle && (
                  <span className="q-source-title muted small" title={q.sourceTitle}>
                    {q.sourceTitle}
                  </span>
                )}
                {q.sourceDate && <span className="q-date muted small">{q.sourceDate}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

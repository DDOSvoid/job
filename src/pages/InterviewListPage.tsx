import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCompanies, useInterviews } from '../hooks/useApi'
import {
  CompanyTypeBadge,
  InterviewDifficultyBadge,
  InterviewResultBadge,
  InterviewSourceBadge,
} from '../components/StatusBadge'
import { SkeletonGrid } from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'
import {
  INTERVIEW_DIFFICULTIES,
  INTERVIEW_DIFFICULTY_LABELS,
  INTERVIEW_RESULTS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_SOURCES,
  INTERVIEW_SOURCE_LABELS,
} from '../constants'
import type { CompanyType, InterviewDifficulty, InterviewResult, InterviewSource } from '../types'

interface InterviewFilter {
  q: string
  companyId: string
  result: '' | InterviewResult
  difficulty: '' | InterviewDifficulty
  source: '' | InterviewSource
}

const defaultFilter: InterviewFilter = { q: '', companyId: '', result: '', difficulty: '', source: '' }

// 筛选状态 ⇄ URL search params：筛选后进面经详情、浏览器后退，可恢复筛选前的列表
const FILTER_PARAM_KEYS: (keyof InterviewFilter)[] = ['q', 'companyId', 'result', 'difficulty', 'source']

function filtersToParams(f: InterviewFilter): URLSearchParams {
  const sp = new URLSearchParams()
  for (const k of FILTER_PARAM_KEYS) {
    const v = f[k]
    if (v !== '') sp.set(k, v)
  }
  return sp
}

function paramsToFilters(sp: URLSearchParams): InterviewFilter {
  const pick = <T extends string>(key: keyof InterviewFilter, allowed: T[]): '' | T => {
    const v = sp.get(key)
    return v && (allowed as string[]).includes(v) ? (v as T) : ''
  }
  return {
    q: sp.get('q') ?? '',
    companyId: sp.get('companyId') ?? '',
    result: pick('result', INTERVIEW_RESULTS),
    difficulty: pick('difficulty', INTERVIEW_DIFFICULTIES),
    source: pick('source', INTERVIEW_SOURCES),
  }
}

/**
 * 面试经历目录表：公司 | 岗位 | 结果 | 难度 | 来源。
 * 整行是单个 <Link>，故不使用外层多链接的 .dir-row 结构。
 */
export default function InterviewListPage() {
  const interviewsQ = useInterviews()
  const companiesQ = useCompanies()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<InterviewFilter>(() => paramsToFilters(searchParams))

  const companyById = useMemo(() => {
    const m = new Map<string, { name: string; type: CompanyType }>()
    for (const c of companiesQ.data ?? []) m.set(c.id, { name: c.name, type: c.type })
    return m
  }, [companiesQ.data])

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return (interviewsQ.data ?? [])
      .filter((iv) => {
        if (filters.companyId && iv.companyId !== filters.companyId) return false
        if (filters.result && iv.result !== filters.result) return false
        if (filters.difficulty && iv.difficulty !== filters.difficulty) return false
        if (filters.source && iv.source !== filters.source) return false
        if (q) {
          const hay = `${iv.companyName ?? ''} ${iv.jobTitle} ${iv.summary ?? ''} ${iv.sourceTitle ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      // 默认按搜集日期倒序（最新面经在前）
      .sort((a, b) => (a.collectedAt === b.collectedAt ? 0 : a.collectedAt < b.collectedAt ? 1 : -1))
  }, [interviewsQ.data, filters])

  const set = (patch: Partial<InterviewFilter>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    setSearchParams(filtersToParams(next), { replace: true })
  }
  const hasActive = filters.q !== '' || filters.companyId !== '' || filters.result !== '' || filters.difficulty !== '' || filters.source !== ''

  return (
    <section>
      <div className="page-head">
        <h1>面试经历</h1>
        <p className="sub">{interviewsQ.data?.length ?? 0} 条量化面经 · 小红书 / 牛客 / 知乎 / 论坛</p>
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
              placeholder="搜索公司 / 岗位 / 题目摘要…"
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
          <select value={filters.companyId} onChange={(e) => set({ companyId: e.target.value })} aria-label="按公司筛选">
            <option value="">全部公司</option>
            {(companiesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={filters.result} onChange={(e) => set({ result: e.target.value as InterviewFilter['result'] })} aria-label="按结果筛选">
            <option value="">面试结果</option>
            {INTERVIEW_RESULTS.map((r) => (
              <option key={r} value={r}>
                {INTERVIEW_RESULT_LABELS[r]}
              </option>
            ))}
          </select>
          <select value={filters.difficulty} onChange={(e) => set({ difficulty: e.target.value as InterviewFilter['difficulty'] })} aria-label="按难度筛选">
            <option value="">面试难度</option>
            {INTERVIEW_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {INTERVIEW_DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>
          <select value={filters.source} onChange={(e) => set({ source: e.target.value as InterviewFilter['source'] })} aria-label="按来源筛选">
            <option value="">来源平台</option>
            {INTERVIEW_SOURCES.map((s) => (
              <option key={s} value={s}>
                {INTERVIEW_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <p className="filter-count">
          共 <b>{list.length}</b> 条{hasActive && '（已筛选）'}
        </p>
      </div>

      {interviewsQ.isLoading ? (
        <SkeletonGrid />
      ) : list.length === 0 ? (
        <EmptyState
          title="还没有符合条件的面经"
          hint="用 interview-experience-research skill 从网络搜集相关岗位的面试经历"
        />
      ) : (
        <div className="dir-table">
          <div className="iv-row-head">
            <span>公司</span>
            <span>岗位</span>
            <span>结果</span>
            <span>难度</span>
            <span>来源</span>
          </div>
          {list.map((iv) => {
            const comp = companyById.get(iv.companyId)
            return (
              <Link key={iv.id} to={`/interviews/${iv.id}`} className="iv-row" title={iv.summary}>
                <div className="dir-cell">
                  <span className="iv-company">{iv.companyName ?? '—'}</span>
                  {comp && (
                    <div className="dir-company-sub">
                      <CompanyTypeBadge type={comp.type} />
                    </div>
                  )}
                </div>
                <div className="dir-cell">
                  <span className="dir-job-link">{iv.jobTitle}</span>
                </div>
                <div className="dir-cell">
                  <InterviewResultBadge result={iv.result} />
                </div>
                <div className="dir-cell">
                  <InterviewDifficultyBadge difficulty={iv.difficulty} />
                </div>
                <div className="dir-cell iv-source-cell">
                  <span className="iv-source-top">
                    <InterviewSourceBadge source={iv.source} />
                    <span className="iv-date">{iv.collectedAt}</span>
                  </span>
                  {iv.sourceTitle && (
                    <span className="iv-source-title" title={iv.sourceTitle}>
                      {iv.sourceTitle}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCompanies, useInterviews } from '../hooks/useApi'
import {
  CompanyTypeBadge,
  InterviewResultBadge,
  InterviewSourceBadge,
} from '../components/StatusBadge'
import ChipGroup from '../components/ChipGroup'
import MultiSelect from '../components/MultiSelect'
import { SkeletonGrid } from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'
import {
  INTERVIEW_RESULTS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_SOURCES,
  INTERVIEW_SOURCE_LABELS,
} from '../constants'
import type { CompanyType, InterviewResult, InterviewSource } from '../types'

interface InterviewFilter {
  q: string
  /** 多选：空数组 = 不过滤 */
  companyId: string[]
  result: InterviewResult[]
  source: InterviewSource[]
}

const defaultFilter: InterviewFilter = { q: '', companyId: [], result: [], source: [] }

// 筛选状态 ⇄ URL search params：筛选后进面经详情、浏览器后退，可恢复筛选前的列表。
// 多选值用逗号 join 进单个参数。
function filtersToParams(f: InterviewFilter): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.companyId.length) sp.set('companyId', f.companyId.join(','))
  if (f.result.length) sp.set('result', f.result.join(','))
  if (f.source.length) sp.set('source', f.source.join(','))
  return sp
}

function parseList<T extends string>(sp: URLSearchParams, key: string, allowed: T[]): T[] {
  const raw = sp.get(key)
  if (!raw) return []
  return raw.split(',').filter((v): v is T => (allowed as string[]).includes(v))
}

function paramsToFilters(sp: URLSearchParams): InterviewFilter {
  return {
    q: sp.get('q') ?? '',
    companyId: (sp.get('companyId') ?? '').split(',').filter(Boolean),
    result: parseList(sp, 'result', INTERVIEW_RESULTS),
    source: parseList(sp, 'source', INTERVIEW_SOURCES),
  }
}

/**
 * 面试经历目录表：公司 | 岗位 | 结果 | 来源。
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

  // 有面经的公司数（区别于 companies.json 总家数）
  const coveredCount = useMemo(() => {
    return new Set((interviewsQ.data ?? []).map((iv) => iv.companyId)).size
  }, [interviewsQ.data])

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return (interviewsQ.data ?? [])
      .filter((iv) => {
        if (filters.companyId.length && !filters.companyId.includes(iv.companyId)) return false
        if (filters.result.length && !filters.result.includes(iv.result)) return false
        if (filters.source.length && !filters.source.includes(iv.source)) return false
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
  const hasActive =
    filters.q !== '' ||
    filters.companyId.length > 0 ||
    filters.result.length > 0 ||
    filters.source.length > 0

  return (
    <section>
      <div className="page-head">
        <h1>面试经历</h1>
        <p className="sub">
          {interviewsQ.data?.length ?? 0} 条量化面经 · 覆盖 {coveredCount} 家公司
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
          <MultiSelect
            label="公司"
            options={(companiesQ.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            values={filters.companyId}
            onChange={(v) => set({ companyId: v })}
            allLabel="全部公司"
            searchPlaceholder="搜索公司…"
          />
          <ChipGroup
            label="结果"
            options={INTERVIEW_RESULTS.map((r) => ({ value: r, label: INTERVIEW_RESULT_LABELS[r] }))}
            values={filters.result}
            onChange={(v) => set({ result: v })}
          />
          <ChipGroup
            label="来源"
            options={INTERVIEW_SOURCES.map((s) => ({ value: s, label: INTERVIEW_SOURCE_LABELS[s] }))}
            values={filters.source}
            onChange={(v) => set({ source: v })}
          />
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

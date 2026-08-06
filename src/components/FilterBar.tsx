import { APPLICATION_STAGE_LABELS, AUTUMN_STATUSES, AUTUMN_STATUS_LABELS } from '../constants'
import type { AutumnStatus, ApplicationStage, CompanyType } from '../types'

export type SortKey = 'default' | 'recent' | 'autumn' | 'verified'

export const SORT_LABELS: Record<SortKey, string> = {
  default: '默认排序',
  recent: '最近更新',
  autumn: '秋招开启优先',
  verified: '核实薪资优先',
}

export interface FilterState {
  companyId: string
  type: '' | CompanyType
  autumn2026: '' | AutumnStatus
  stage: '' | ApplicationStage
  q: string
  sort: SortKey
}

export const defaultFilters: FilterState = {
  companyId: '',
  type: '',
  autumn2026: '',
  stage: '',
  q: '',
  sort: 'default',
}

export interface FilterProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  companies: { id: string; name: string }[]
  showStage?: boolean
  total?: number
  unit?: string
}

export default function FilterBar({ filters, onChange, companies, showStage, total, unit = '条' }: FilterProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })
  const hasActive =
    filters.companyId !== '' || filters.type !== '' || filters.autumn2026 !== '' ||
    filters.stage !== '' || filters.q !== ''
  const reset = () => onChange(defaultFilters)

  return (
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
            placeholder="搜索岗位 / 公司 / 描述…"
            aria-label="关键词搜索"
          />
        </div>
        <select
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as SortKey })}
          aria-label="排序方式"
        >
          {Object.entries(SORT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {hasActive && (
          <button type="button" className="btn btn-ghost" onClick={reset}>
            ✕ 清除筛选
          </button>
        )}
      </div>
      <div className="filter-row">
        <select
          value={filters.companyId}
          onChange={(e) => set({ companyId: e.target.value })}
          aria-label="按公司筛选"
        >
          <option value="">全部公司</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filters.type}
          onChange={(e) => set({ type: e.target.value as FilterState['type'] })}
          aria-label="按类型筛选"
        >
          <option value="">公募/私募</option>
          <option value="public">公募</option>
          <option value="private">私募</option>
        </select>
        <select
          value={filters.autumn2026}
          onChange={(e) => set({ autumn2026: e.target.value as FilterState['autumn2026'] })}
          aria-label="按秋招状态筛选"
        >
          <option value="">秋招状态</option>
          {AUTUMN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {AUTUMN_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {showStage && (
          <select
            value={filters.stage}
            onChange={(e) => set({ stage: e.target.value as FilterState['stage'] })}
            aria-label="按申请状态筛选"
          >
            <option value="">申请状态</option>
            {Object.entries(APPLICATION_STAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
      </div>
      {typeof total === 'number' && (
        <p className="filter-count">
          共 <b>{total}</b> {unit}
          {hasActive && '（已筛选）'}
        </p>
      )}
    </div>
  )
}

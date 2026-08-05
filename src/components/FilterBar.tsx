import { APPLICATION_STAGE_LABELS, AUTUMN_STATUSES, AUTUMN_STATUS_LABELS } from '../constants'
import type { AutumnStatus, ApplicationStage, CompanyType } from '../types'

export interface FilterState {
  companyId: string
  type: '' | CompanyType
  autumn2026: '' | AutumnStatus
  stage: '' | ApplicationStage
}

export interface FilterProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  companies: { id: string; name: string }[]
  showStage?: boolean
}

export default function FilterBar({ filters, onChange, companies, showStage }: FilterProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })
  return (
    <div className="filter-bar">
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
  )
}

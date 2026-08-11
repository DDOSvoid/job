import {
  APPLICATION_STAGE_LABELS,
  APPLICATION_STAGES,
  AUTUMN_STATUS_LABELS,
  AUTUMN_STATUSES,
  COMPANY_TYPE_LABELS,
  RECRUITMENT_TYPE_LABELS,
  RECRUITMENT_TYPES,
} from '../constants'
import type { AutumnStatus, ApplicationStage, CompanyType, RecruitmentType } from '../types'
import ChipGroup from './ChipGroup'
import MultiSelect from './MultiSelect'

export type SortKey = 'default' | 'recent' | 'autumn' | 'verified'

export const SORT_LABELS: Record<SortKey, string> = {
  default: '默认排序',
  recent: '最近更新',
  autumn: '秋招开启优先',
  verified: '核实薪资优先',
}

export interface FilterState {
  /** 多选：空数组 = 不过滤 */
  companyId: string[]
  type: CompanyType[]
  autumn2026: AutumnStatus[]
  recruitmentType: RecruitmentType[]
  stage: ApplicationStage[]
  q: string
  sort: SortKey
}

export const defaultFilters: FilterState = {
  companyId: [],
  type: [],
  autumn2026: [],
  recruitmentType: [],
  stage: [],
  q: '',
  sort: 'default',
}

// ---- 筛选状态 ⇄ URL search params ----
// 列表页以 URL 为筛选状态源：筛选后进入详情页，浏览器后退时会恢复到筛选过的列表。
// 多选值用逗号 join 进单个参数（取值不含逗号）。

const COMPANY_TYPES: CompanyType[] = ['public', 'private', 'securities', 'tech']
const SORTS = Object.keys(SORT_LABELS) as SortKey[]

function parseList<T extends string>(sp: URLSearchParams, key: string, allowed: T[]): T[] {
  const raw = sp.get(key)
  if (!raw) return []
  return raw.split(',').filter((v): v is T => (allowed as string[]).includes(v))
}

function parseParam<T extends string>(sp: URLSearchParams, key: string, allowed: T[]): '' | T {
  const v = sp.get(key)
  return v && (allowed as string[]).includes(v) ? (v as T) : ''
}

/** 把筛选状态序列化进 URLSearchParams（空数组与默认排序不写入，保持 URL 干净）。 */
export function filtersToParams(filters: FilterState): URLSearchParams {
  const sp = new URLSearchParams()
  if (filters.companyId.length) sp.set('companyId', filters.companyId.join(','))
  if (filters.type.length) sp.set('type', filters.type.join(','))
  if (filters.autumn2026.length) sp.set('autumn2026', filters.autumn2026.join(','))
  if (filters.recruitmentType.length) sp.set('recruitmentType', filters.recruitmentType.join(','))
  if (filters.stage.length) sp.set('stage', filters.stage.join(','))
  if (filters.q) sp.set('q', filters.q)
  if (filters.sort !== 'default') sp.set('sort', filters.sort)
  return sp
}

/** 从 URLSearchParams 解析筛选状态；非法/未知值回落为默认。 */
export function paramsToFilters(sp: URLSearchParams): FilterState {
  return {
    companyId: (sp.get('companyId') ?? '').split(',').filter(Boolean),
    type: parseList(sp, 'type', COMPANY_TYPES),
    autumn2026: parseList(sp, 'autumn2026', AUTUMN_STATUSES),
    recruitmentType: parseList(sp, 'recruitmentType', RECRUITMENT_TYPES),
    stage: parseList(sp, 'stage', APPLICATION_STAGES),
    q: sp.get('q') ?? '',
    sort: parseParam(sp, 'sort', SORTS) || 'default',
  }
}

export interface FilterProps {
  filters: FilterState
  onChange: (f: FilterState) => void
  companies: { id: string; name: string }[]
  showCompany?: boolean
  showType?: boolean
  showAutumn?: boolean
  showRecruitment?: boolean
  showStage?: boolean
  total?: number
  unit?: string
}

export default function FilterBar({
  filters,
  onChange,
  companies,
  showCompany = true,
  showType = true,
  showAutumn = true,
  showRecruitment = true,
  showStage,
  total,
  unit = '条',
}: FilterProps) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })
  const hasActive =
    filters.companyId.length > 0 ||
    filters.type.length > 0 ||
    filters.autumn2026.length > 0 ||
    filters.recruitmentType.length > 0 ||
    filters.stage.length > 0 ||
    filters.q !== ''
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
      {(showCompany || showType || showAutumn || showRecruitment || showStage) && (
        <div className="filter-row">
          {showCompany && (
            <MultiSelect
              label="公司"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              values={filters.companyId}
              onChange={(v) => set({ companyId: v })}
              allLabel="全部公司"
              searchPlaceholder="搜索公司…"
            />
          )}
          {showType && (
            <ChipGroup
              label="类型"
              options={COMPANY_TYPES.map((t) => ({ value: t, label: COMPANY_TYPE_LABELS[t] }))}
              values={filters.type}
              onChange={(v) => set({ type: v })}
            />
          )}
          {showAutumn && (
            <ChipGroup
              label="秋招"
              options={AUTUMN_STATUSES.map((s) => ({ value: s, label: AUTUMN_STATUS_LABELS[s] }))}
              values={filters.autumn2026}
              onChange={(v) => set({ autumn2026: v })}
            />
          )}
          {showRecruitment && (
            <ChipGroup
              label="招聘"
              options={RECRUITMENT_TYPES.map((r) => ({ value: r, label: RECRUITMENT_TYPE_LABELS[r] }))}
              values={filters.recruitmentType}
              onChange={(v) => set({ recruitmentType: v })}
            />
          )}
          {showStage && (
            <ChipGroup
              label="进展"
              options={APPLICATION_STAGES.map((s) => ({ value: s, label: APPLICATION_STAGE_LABELS[s] }))}
              values={filters.stage}
              onChange={(v) => set({ stage: v })}
            />
          )}
        </div>
      )}
      {typeof total === 'number' && (
        <p className="filter-count">
          共 <b>{total}</b> {unit}
          {hasActive && '（已筛选）'}
        </p>
      )}
    </div>
  )
}

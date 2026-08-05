import { useState } from 'react'
import { useCompanies } from '../hooks/useApi'
import FilterBar, { type FilterState } from '../components/FilterBar'
import CompanyCard from '../components/CompanyCard'
import type { CompanyType } from '../types'

export default function CompanyListPage() {
  const companies = useCompanies()
  const [filters, setFilters] = useState<FilterState>({
    companyId: '',
    type: '',
    autumn2026: '',
    stage: '',
  })

  const list = (companies.data ?? []).filter(
    (c) => !filters.type || c.type === (filters.type as CompanyType),
  )

  return (
    <section>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        companies={companies.data ?? []}
      />
      {companies.isLoading ? (
        <p className="muted">加载中…</p>
      ) : list.length === 0 ? (
        <p className="muted">没有符合条件公司。</p>
      ) : (
        <div className="card-grid">
          {list.map((c) => (
            <CompanyCard key={c.id} company={c} />
          ))}
        </div>
      )}
    </section>
  )
}

import { useMemo, useState } from 'react'
import { useCompanies } from '../hooks/useApi'
import FilterBar, { defaultFilters, type FilterState } from '../components/FilterBar'
import CompanyCard from '../components/CompanyCard'
import { SkeletonGrid } from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'

export default function CompanyListPage() {
  const companies = useCompanies()
  const [filters, setFilters] = useState<FilterState>(defaultFilters)

  const list = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return (companies.data ?? []).filter((c) => {
      if (filters.type && c.type !== filters.type) return false
      if (q) {
        const hay = `${c.name} ${c.location ?? ''} ${c.about ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [companies.data, filters])

  return (
    <section>
      <div className="page-head">
        <h1>基金公司</h1>
        <p className="sub">{companies.data?.length ?? 0} 家 · 公募/私募</p>
      </div>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        companies={companies.data ?? []}
        total={list.length}
        unit="家公司"
      />
      {companies.isLoading ? (
        <SkeletonGrid />
      ) : list.length === 0 ? (
        <EmptyState
          title="没有符合条件的公司"
          hint="试试用 skill 调研更多公司，例如「查一下九坤的量化岗位并写入」"
        />
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

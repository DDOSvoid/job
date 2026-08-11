import { useEffect, useRef, useState } from 'react'

interface Option {
  value: string
  label: string
}

interface MultiSelectProps {
  label: string
  options: Option[]
  values: string[]
  onChange: (next: string[]) => void
  allLabel?: string
  searchPlaceholder?: string
}

/**
 * 多选下拉：按钮显示已选数量，展开面板带搜索 + 复选框列表。
 * 用于取值较多的筛选（如 117 家公司）。空数组 = 不过滤（全选）。
 */
export default function MultiSelect({
  label,
  options,
  values,
  onChange,
  allLabel = '全部',
  searchPlaceholder = '搜索…',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }

  const needle = q.trim().toLowerCase()
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options
  const summary = values.length === 0 ? allLabel : `${values.length} 项`

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className={`multiselect-btn${open ? ' open' : ''}`}
        onClick={() => {
          setOpen((v) => !v)
          setQ('')
        }}
        aria-expanded={open}
        aria-label={label}
      >
        <span className="multiselect-label">{label}</span>
        <span className="multiselect-value">{summary}</span>
        <span className="multiselect-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="multiselect-panel">
          <input
            type="text"
            className="multiselect-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`${label}搜索`}
          />
          <div className="multiselect-list">
            {filtered.length === 0 ? (
              <div className="multiselect-empty">无匹配</div>
            ) : (
              filtered.map((o) => (
                <label key={o.value} className="multiselect-item">
                  <input
                    type="checkbox"
                    checked={values.includes(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="multiselect-item-label">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

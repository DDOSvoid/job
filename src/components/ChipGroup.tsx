interface ChipOption<T extends string> {
  value: T
  label: string
}

interface ChipGroupProps<T extends string> {
  label: string
  options: ChipOption<T>[]
  values: T[]
  onChange: (next: T[]) => void
}

/**
 * 多选筛选：一组可点击切换的胶囊 chip。空数组 = 不过滤（全选）。
 * 用于取值较少的枚举筛选（类型/秋招状态/进展/结果/来源等）。
 */
export default function ChipGroup<T extends string>({ label, options, values, onChange }: ChipGroupProps<T>) {
  const toggle = (v: T) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])
  }

  return (
    <div className="chip-group">
      <span className="chip-label">{label}</span>
      <div className="chip-list">
        {options.map((o) => {
          const on = values.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              className={`filter-chip${on ? ' on' : ''}`}
              onClick={() => toggle(o.value)}
              aria-pressed={on}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

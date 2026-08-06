import { displaySalary } from '../lib/salary'

interface Props {
  salary: string
  isEstimate: boolean
  size?: 'row' | 'card'
}

/**
 * 薪资展示：主干数字 + 口径注解，注解换行完整显示，不截断。
 * 已核实 → 绿色报价；未核实 → 灰色 + 「未核实」标签。
 */
export default function SalaryDisplay({ salary, isEstimate, size = 'row' }: Props) {
  const sal = displaySalary(salary, isEstimate)
  const valueClass = isEstimate
    ? size === 'card'
      ? 'salary-est'
      : 'salary-est-row'
    : size === 'card'
      ? 'salary salary-verified'
      : 'salary salary-row salary-verified'
  return (
    <div className="salary-stack">
      <div className={valueClass} title={salary}>
        <span>{sal.main}</span>
        {isEstimate && <span className="chip chip-amber">未核实</span>}
      </div>
      {sal.note && <div className="salary-stack-note">{sal.note}</div>}
    </div>
  )
}

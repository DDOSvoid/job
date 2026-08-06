export interface ParsedSalary {
  /** 主干（数字 + 单位），如 "30万+/年" */
  main: string
  /** 括号注解，如 "（应届投研类总包，第三方渠道）" */
  note?: string
}

/** 把薪资字符串拆成"主干 + 括号注解"，括号内容通常是渠道/口径说明 */
export function parseSalary(salary: string): ParsedSalary {
  const s = salary.trim()
  const cn = s.indexOf('（')
  const en = s.indexOf('(')
  let cut = -1
  if (cn > -1 && en > -1) cut = Math.min(cn, en)
  else if (cn > -1) cut = cn
  else if (en > -1) cut = en
  if (cut > 0) {
    return { main: s.slice(0, cut).trim(), note: s.slice(cut).trim() }
  }
  return { main: s }
}

/** 展示用：去掉示例占位的"示例："前缀（"未核实"标签已说明性质） */
export function displaySalary(salary: string, isEstimate: boolean): ParsedSalary {
  const { main, note } = parseSalary(salary)
  const cleaned = isEstimate ? main.replace(/^示例[:：]\s*/, '') : main
  return { main: cleaned || salary, note }
}

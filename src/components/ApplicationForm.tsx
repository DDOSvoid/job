import { useMemo, useState, type FormEvent } from 'react'
import type { ApplicationStage } from '../types'
import { APPLICATION_STAGES, APPLICATION_STAGE_LABELS, todayStr } from '../constants'
import { StageBadge } from './StatusBadge'

interface Props {
  appId: string
  /** 当前状态，用于把阶段默认值推进到"下一个漏斗阶段" */
  currentStatus?: ApplicationStage | null
  onSubmit: (entry: { stage: ApplicationStage; date: string; note: string }) => void
  submitting: boolean
  error?: string | null
}

// 推进漏斗：默认阶段 = 当前状态的下一个阶段，符合"记录推进进度"的直觉
const FUNNEL: ApplicationStage[] = ['interested', 'applied', 'written_test', 'interview', 'offer']

function nextStage(current?: ApplicationStage | null): ApplicationStage {
  if (!current) return 'applied'
  const i = FUNNEL.indexOf(current)
  return i >= 0 && i < FUNNEL.length - 1 ? FUNNEL[i + 1] : 'applied'
}

// 备注 → 阶段强信号推断：用户把「已通过笔试」等写在备注里时自动同步阶段。
// 只在用户没有手动改过阶段下拉时生效，手动选择优先。
function inferStage(note: string): ApplicationStage | null {
  const n = note.trim()
  if (!n) return null
  // 优先级：Offer > 拒绝 > 放弃 > 面试通过 > 笔试通过 > 投递
  if (/(拿到|收到|收获).{0,8}offer|offer\s*已到手|被录用|录用通知|offer\s*$/i.test(n)) return 'offer'
  if (/(挂了|淘汰|被拒|不通过|没通过|未通过|拒了)/.test(n)) return 'rejected'
  if (/(放弃|撤回|不去了|不再考虑)/.test(n)) return 'withdrawn'
  if (/通过.{0,8}面试|面试.{0,8}通过/.test(n)) return 'interview'
  if (/通过.{0,8}笔试|笔试.{0,8}通过|笔试已过/.test(n)) return 'written_test'
  if (/投递|提交.{0,4}简历|简历.{0,4}提交|内推|网申/.test(n)) return 'applied'
  return null
}

export default function ApplicationForm({
  appId,
  currentStatus,
  onSubmit,
  submitting,
  error,
}: Props) {
  const [stage, setStage] = useState<ApplicationStage>(() => nextStage(currentStatus))
  const [stageTouched, setStageTouched] = useState(false)
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')

  const handleStageChange = (value: ApplicationStage) => {
    setStage(value)
    setStageTouched(true)
  }

  const handleNoteChange = (value: string) => {
    setNote(value)
    if (!stageTouched) {
      const inferred = inferStage(value)
      if (inferred) setStage(inferred)
    }
  }

  // 提交前预览：把即将落库的内容亮出来，阶段错了提交前就能发现
  const preview = useMemo(() => {
    const d = date || todayStr()
    const n = note.trim()
    return { date: d, note: n }
  }, [date, note])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!appId) return
    onSubmit({ stage, date: date || todayStr(), note: note.trim() })
    setNote('')
  }

  return (
    <form className="app-form" onSubmit={handleSubmit}>
      <h4>记录推进进度</h4>
      <div className="form-row">
        <label className="form-label" htmlFor="stage-select">
          阶段
        </label>
        <select
          id="stage-select"
          value={stage}
          onChange={(e) => handleStageChange(e.target.value as ApplicationStage)}
        >
          {APPLICATION_STAGES.map((s) => (
            <option key={s} value={s}>
              {APPLICATION_STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="日期" />
        <input
          type="text"
          placeholder="备注（如：收到笔试链接）"
          value={note}
          onChange={(e) => handleNoteChange(e.target.value)}
          className="grow"
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '保存中…' : '添加记录'}
        </button>
      </div>
      <div className="form-preview" aria-live="polite">
        将记录：<StageBadge stage={stage} /> · <span className="form-preview-date">{preview.date}</span>
        {preview.note && <span className="form-preview-note"> · {preview.note}</span>}
      </div>
      {!stageTouched && (
        <p className="form-hint">备注里写「通过笔试 / 面试通过 / 拿到 offer」会自动匹配阶段</p>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  )
}

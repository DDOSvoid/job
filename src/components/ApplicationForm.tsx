import { useState, type FormEvent } from 'react'
import type { ApplicationStage } from '../types'
import { APPLICATION_STAGES, APPLICATION_STAGE_LABELS, todayStr } from '../constants'

interface Props {
  appId: string
  onSubmit: (entry: { stage: ApplicationStage; date: string; note: string }) => void
  submitting: boolean
  error?: string | null
}

export default function ApplicationForm({ appId, onSubmit, submitting, error }: Props) {
  const [stage, setStage] = useState<ApplicationStage>('applied')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')

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
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as ApplicationStage)}
          aria-label="阶段"
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
          onChange={(e) => setNote(e.target.value)}
          className="grow"
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '保存中…' : '添加记录'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

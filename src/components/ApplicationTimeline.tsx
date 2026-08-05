import type { Application } from '../types'
import { StageBadge } from './StatusBadge'

export default function ApplicationTimeline({ application }: { application: Application }) {
  // 时间线按日期升序展示，最新的在最底部
  const sorted = [...application.timeline].sort((a, b) =>
    a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
  )
  return (
    <div className="timeline">
      {sorted.map((entry, i) => (
        <div key={`${entry.date}-${i}`} className="timeline-item">
          <div className="timeline-dot" />
          <div className="timeline-body">
            <div className="timeline-head">
              <span className="timeline-date">{entry.date}</span>
              <StageBadge stage={entry.stage} />
            </div>
            {entry.note && <p className="timeline-note">{entry.note}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

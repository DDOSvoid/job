import { APPLICATION_STAGE_LABELS } from '../constants'
import type { ApplicationStage } from '../types'

const FUNNEL: ApplicationStage[] = ['applied', 'written_test', 'interview', 'offer']
const FAILED: ApplicationStage[] = ['rejected', 'withdrawn']

/** 管道进度：投递 → 笔试 → 面试 → Offer 四段填充，一眼看清在漏斗哪一步 */
export default function PipelineBar({ stage }: { stage: ApplicationStage }) {
  const idx = FUNNEL.indexOf(stage)
  const filled = idx >= 0 ? idx + 1 : 0
  const failed = FAILED.includes(stage)
  const tone = stage === 'offer' ? 'pos' : stage === 'interview' ? 'warn' : 'info'
  return (
    <div
      className="pipeline"
      data-tone={tone}
      title={`当前阶段：${APPLICATION_STAGE_LABELS[stage]}`}
    >
      <div className="pipeline-segs" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`pipeline-seg${filled >= n ? ' on' : ''}`} />
        ))}
      </div>
      <span className={`pipeline-label${failed ? ' fail' : ''}`}>
        {APPLICATION_STAGE_LABELS[stage]}
      </span>
    </div>
  )
}

import type { CompanyType, AutumnStatus, ApplicationStage, FetchStatus, SourceStatus } from '../types'
import {
  APPLICATION_STAGE_LABELS,
  AUTUMN_STATUS_LABELS,
  COMPANY_TYPE_LABELS,
  FETCH_STATUS_LABELS,
  SOURCE_STATUS_LABELS,
} from '../constants'

// 各枚举在界面上的配色等级，见 styles.css 中 .badge-*
const typeTone: Record<CompanyType, number> = { public: 3, private: 4 }
const autumnTone: Record<AutumnStatus, number> = { open: 1, not_started: 3, ended: 5, unknown: 0 }
const stageTone: Record<ApplicationStage, number> = {
  interested: 0,
  applied: 3,
  written_test: 3,
  interview: 2,
  offer: 1,
  rejected: 5,
  withdrawn: 5,
}
const fetchTone: Record<FetchStatus, number> = { complete: 1, partial: 2, manual_required: 5 }
const sourceTone: Record<SourceStatus, number> = { complete: 1, partial: 2, manual_required: 5, blocked: 5 }

export function CompanyTypeBadge({ type }: { type: CompanyType }) {
  return <span className={`badge badge-${typeTone[type]}`}>{COMPANY_TYPE_LABELS[type]}</span>
}

export function AutumnBadge({ status }: { status: AutumnStatus }) {
  return (
    <span className={`badge badge-${autumnTone[status]}`} title={AUTUMN_STATUS_LABELS[status]}>
      {AUTUMN_STATUS_LABELS[status]}
    </span>
  )
}

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <span className={`badge badge-${stageTone[stage]}`}>{APPLICATION_STAGE_LABELS[stage]}</span>
}

export function FetchBadge({ status }: { status: FetchStatus }) {
  return (
    <span className={`badge badge-${fetchTone[status]}`} title="信息抓取/核实状态">
      {FETCH_STATUS_LABELS[status]}
    </span>
  )
}

export function SourceBadge({ status }: { status: SourceStatus }) {
  return (
    <span className={`badge badge-${sourceTone[status]}`} title="该来源抓取状态">
      {SOURCE_STATUS_LABELS[status]}
    </span>
  )
}

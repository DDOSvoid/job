import type {
  CompanyType,
  AutumnStatus,
  ApplicationStage,
  FetchStatus,
  InterviewResult,
  InterviewSource,
  JobSource,
  RecruitmentType,
  SourceStatus,
} from '../types'
import {
  APPLICATION_STAGE_LABELS,
  AUTUMN_STATUS_LABELS,
  COMPANY_TYPE_LABELS,
  FETCH_STATUS_LABELS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_SOURCE_LABELS,
  JOB_SOURCE_LABELS,
  RECRUITMENT_TYPE_LABELS,
  SOURCE_STATUS_LABELS,
} from '../constants'

type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'purple'
  | 'pub'
  | 'hedge'
  | 'sec'
  | 'tech'

const toneClass = (tone: Tone) => `badge badge-${tone}`

// 各枚举在界面上的语义配色
// 公司类型：四分类色（公募橙 / 私募青 / 券商靛 / 科技石墨），见 styles.css --cat-*
const typeTone: Record<CompanyType, Tone> = { public: 'pub', private: 'hedge', securities: 'sec', tech: 'tech' }
const autumnTone: Record<AutumnStatus, Tone> = {
  open: 'success',
  not_started: 'info',
  ended: 'neutral',
  unknown: 'warning',
}
const stageTone: Record<ApplicationStage, Tone> = {
  interested: 'neutral',
  applied: 'info',
  written_test: 'info',
  interview: 'warning',
  offer: 'success',
  rejected: 'danger',
  withdrawn: 'danger',
}
const fetchTone: Record<FetchStatus, Tone> = { complete: 'success', partial: 'warning', manual_required: 'neutral' }
const sourceTone: Record<SourceStatus, Tone> = {
  complete: 'success',
  partial: 'warning',
  manual_required: 'neutral',
  blocked: 'danger',
}
const sourceTypeTone: Record<JobSource, Tone> = { official: 'info', boss: 'purple', wechat: 'warning', manual: 'neutral' }
const recruitmentTypeTone: Record<RecruitmentType, Tone> = {
  campus: 'info',
  social: 'warning',
  intern: 'purple',
  unknown: 'neutral',
}
const interviewResultTone: Record<InterviewResult, Tone> = {
  offer: 'success',
  no_offer: 'danger',
  in_progress: 'warning',
  unknown: 'neutral',
}
const interviewSourceTone: Record<InterviewSource, Tone> = {
  xiaohongshu: 'purple',
  nowcoder: 'info',
  zhihu: 'info',
  '1point3acres': 'neutral',
  csdn: 'neutral',
  cnblogs: 'neutral',
  bilibili: 'purple',
  wenku: 'warning',
  book118: 'warning',
  questionbank: 'danger',
  zhidao: 'neutral',
  aggregator: 'danger',
  career: 'warning',
  manual: 'neutral',
}

export function CompanyTypeBadge({ type }: { type: CompanyType }) {
  return <span className={toneClass(typeTone[type])}>{COMPANY_TYPE_LABELS[type]}</span>
}

export function AutumnBadge({ status }: { status: AutumnStatus }) {
  return (
    <span className={toneClass(autumnTone[status])} title={AUTUMN_STATUS_LABELS[status]}>
      {AUTUMN_STATUS_LABELS[status]}
    </span>
  )
}

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <span className={toneClass(stageTone[stage])}>{APPLICATION_STAGE_LABELS[stage]}</span>
}

export function FetchBadge({ status }: { status: FetchStatus }) {
  return (
    <span className={toneClass(fetchTone[status])} title="信息抓取/核实状态">
      {FETCH_STATUS_LABELS[status]}
    </span>
  )
}

export function SourceBadge({ status }: { status: SourceStatus }) {
  return (
    <span className={toneClass(sourceTone[status])} title="该来源抓取状态">
      {SOURCE_STATUS_LABELS[status]}
    </span>
  )
}

export function SourceTypeBadge({ type }: { type: JobSource }) {
  return (
    <span className={toneClass(sourceTypeTone[type])} title="信息来源">
      {JOB_SOURCE_LABELS[type]}
    </span>
  )
}

export function InterviewResultBadge({ result }: { result: InterviewResult }) {
  return <span className={toneClass(interviewResultTone[result])}>{INTERVIEW_RESULT_LABELS[result]}</span>
}

export function RecruitmentTypeBadge({ recruitmentType }: { recruitmentType?: RecruitmentType }) {
  const rt = recruitmentType ?? 'unknown'
  return (
    <span className={toneClass(recruitmentTypeTone[rt])} title="招聘类型">
      {RECRUITMENT_TYPE_LABELS[rt]}
    </span>
  )
}

export function InterviewSourceBadge({ source }: { source: InterviewSource }) {
  return (
    <span className={toneClass(interviewSourceTone[source])} title="信息来源">
      {INTERVIEW_SOURCE_LABELS[source]}
    </span>
  )
}

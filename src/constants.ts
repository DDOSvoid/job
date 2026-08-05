// 与 shared/constants.js 对应的中文显示映射（保持同步）
import type {
  AutumnStatus,
  ApplicationStage,
  CompanyType,
  FetchStatus,
  JobSource,
  SourceStatus,
} from './types'

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  public: '公募',
  private: '私募',
}

export const JOB_SOURCE_LABELS: Record<JobSource, string> = {
  official: '官网',
  boss: 'Boss直聘',
  wechat: '微信公众号',
  manual: '手动',
}

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  complete: '已抓取',
  partial: '部分抓取',
  manual_required: '需手动确认',
  blocked: '无法抓取',
}

export const FETCH_STATUS_LABELS: Record<FetchStatus, string> = {
  complete: '已抓取完整',
  partial: '部分抓取',
  manual_required: '需手动确认',
}

export const AUTUMN_STATUS_LABELS: Record<AutumnStatus, string> = {
  open: '秋招已开启',
  not_started: '秋招未开始',
  ended: '秋招已结束',
  unknown: '待确认',
}

export const APPLICATION_STAGES: ApplicationStage[] = [
  'interested',
  'applied',
  'written_test',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
]

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  interested: '关注中',
  applied: '已投递',
  written_test: '笔试',
  interview: '面试',
  offer: 'Offer',
  rejected: '已拒绝',
  withdrawn: '已放弃',
}

export const AUTUMN_STATUSES: AutumnStatus[] = ['open', 'not_started', 'ended', 'unknown']

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

// 与 shared/constants.js 对应的中文显示映射（保持同步）
import type {
  AutumnStatus,
  ApplicationStage,
  CompanyType,
  FetchStatus,
  InterviewResult,
  InterviewSource,
  JobSource,
  QuestionCategory,
  RecruitmentType,
  SourceStatus,
} from './types'

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  public: '公募',
  private: '私募',
  securities: '券商',
  tech: '科技',
}

export const JOB_SOURCE_LABELS: Record<JobSource | 'secondary', string> = {
  official: '官网',
  boss: 'Boss直聘',
  wechat: '微信公众号',
  manual: '手动',
  secondary: '转载',
}

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  complete: '已抓取',
  partial: '部分抓取',
  manual_required: '需手动确认',
  blocked: '无法抓取',
}

export const SOURCE_STATUSES: SourceStatus[] = ['complete', 'partial', 'manual_required', 'blocked']

export const FETCH_STATUS_LABELS: Record<FetchStatus, string> = {
  complete: '已抓取完整',
  partial: '部分抓取',
  manual_required: '需手动确认',
}

export const FETCH_STATUSES: FetchStatus[] = ['complete', 'partial', 'manual_required']

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

export const RECRUITMENT_TYPE_LABELS: Record<RecruitmentType, string> = {
  campus: '校招',
  social: '社招',
  intern: '实习',
  unknown: '未知',
}

export const RECRUITMENT_TYPES: RecruitmentType[] = ['campus', 'social', 'intern', 'unknown']

export const INTERVIEW_SOURCE_LABELS: Record<InterviewSource, string> = {
  xiaohongshu: '小红书',
  nowcoder: '牛客',
  zhihu: '知乎',
  '1point3acres': '一亩三分地',
  csdn: 'CSDN博客',
  cnblogs: '博客园',
  bilibili: 'B站',
  wenku: '百度文库',
  book118: '原创力文档',
  questionbank: '题库站',
  zhidao: '百度知道',
  aggregator: '内容农场',
  career: '求职辅导',
  manual: '手动',
}

export const INTERVIEW_SOURCES: InterviewSource[] = [
  'xiaohongshu',
  'nowcoder',
  'zhihu',
  '1point3acres',
  'csdn',
  'cnblogs',
  'bilibili',
  'wenku',
  'book118',
  'questionbank',
  'zhidao',
  'aggregator',
  'career',
  'manual',
]

export const INTERVIEW_RESULT_LABELS: Record<InterviewResult, string> = {
  offer: '拿到Offer',
  no_offer: '未通过',
  in_progress: '进行中',
  unknown: '未知',
}

export const INTERVIEW_RESULTS: InterviewResult[] = ['offer', 'no_offer', 'in_progress', 'unknown']

export const QUESTION_CATEGORY_LABELS: Record<QuestionCategory, string> = {
  probability: '数理统计',
  machine_learning: '机器学习',
  algo: '数据结构与算法',
  portfolio: '投资组合/因子',
  dev: '量化开发/C++',
  system_design: '系统设计',
  hr: 'HR/行为面',
  brainteaser: '脑筋急转弯',
  other: '其他',
}

export const QUESTION_CATEGORIES: QuestionCategory[] = [
  'probability',
  'machine_learning',
  'algo',
  'portfolio',
  'dev',
  'system_design',
  'hr',
  'brainteaser',
  'other',
]

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

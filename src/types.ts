export type CompanyType = 'public' | 'private' | 'securities' | 'tech'
export type JobSource = 'official' | 'boss' | 'wechat' | 'manual'
export type FetchStatus = 'complete' | 'partial' | 'manual_required'
export type SourceStatus = FetchStatus | 'blocked'
export type AutumnStatus = 'open' | 'not_started' | 'ended' | 'unknown'
export type RecruitmentType = 'campus' | 'social' | 'intern' | 'unknown'
export type ApplicationStage =
  | 'interested'
  | 'applied'
  | 'written_test'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
export type InterviewSource =
  | 'xiaohongshu'
  | 'nowcoder'
  | 'zhihu'
  | '1point3acres'
  | 'csdn'
  | 'cnblogs'
  | 'bilibili'
  | 'wenku'
  | 'book118'
  | 'questionbank'
  | 'zhidao'
  | 'aggregator'
  | 'career'
  | 'manual'
export type InterviewResult = 'offer' | 'no_offer' | 'in_progress' | 'unknown'
export type QuestionCategory =
  | 'probability'
  | 'machine_learning'
  | 'algo'
  | 'portfolio'
  | 'dev'
  | 'system_design'
  | 'hr'
  | 'brainteaser'
  | 'other'

export interface Company {
  id: string
  name: string
  type: CompanyType
  website: string
  location: string
  about: string
  source: 'example' | 'skill' | 'manual'
  createdAt: string
  updatedAt: string
  jobCount?: number
  /** 公司级信息来源（官网/招聘系统/公众号/公告转载等），按 url 去重 */
  sources?: SourceItem[]
}

/** 来源条目类型：official/boss/wechat/manual 之外，转载聚合（牛企/upjianli 等）记作 secondary */
export type SourceItemType = JobSource | 'secondary'

export interface SourceItem {
  type: SourceItemType
  title: string
  url: string
  accessedAt: string
  status: SourceStatus
  note?: string
}

export interface Job {
  id: string
  companyId: string
  companyName?: string | null
  title: string
  description: string
  salary: string
  salaryIsEstimate: boolean
  applyUrl: string
  officialUrl: string
  autumn2026: AutumnStatus
  autumn2026Note?: string
  recruitmentType?: RecruitmentType
  source: JobSource
  fetchStatus: FetchStatus
  /** 一岗一来源：恰好 1 条，为该岗位最相关来源 */
  sources: SourceItem[]
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface TimelineEntry {
  date: string
  stage: ApplicationStage
  note?: string
}

export interface Application {
  id: string
  jobId: string
  companyId: string
  currentStatus: ApplicationStage
  timeline: TimelineEntry[]
  createdAt: string
  updatedAt: string
  jobTitle?: string | null
}

export interface CompanyDetail extends Company {
  jobs: Job[]
}

export interface JobDetail extends Job {
  company: Company | null
  application: Application | null
}

export interface InterviewRound {
  name: string
  content: string
  date?: string
}

export interface InterviewQuestion {
  round: string
  date?: string
  text: string
}

export interface Interview {
  id: string
  companyId: string
  companyName?: string | null
  jobTitle: string
  rounds: InterviewRound[]
  /** 从各轮 content 拆出的逐条题目；缺失时详情页降级用 rounds 展示 */
  questions?: InterviewQuestion[]
  summary: string
  result: InterviewResult
  source: InterviewSource
  sourceUrl: string
  sourceTitle?: string
  collectedAt: string
  sourceStatus: SourceStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface InterviewDetail extends Interview {
  company: Company | null
}

export interface Question {
  id: string
  /** 可空：null = 通用/汇总（帖子未点名公司） */
  companyId: string | null
  companyName?: string | null
  /** 帖子匿名提到公司时的线索（如"某复"，疑似衍复），不当作确定归属 */
  companyHint?: string
  jobTitle?: string
  category: QuestionCategory
  text: string
  /** 笔试/一面/二面/HR面 等，可选 */
  round?: string
  source: InterviewSource
  sourceUrl: string
  sourceTitle?: string
  sourceStatus: SourceStatus
  /** 帖子发布日期，可选：YYYY / YYYY-MM / YYYY-MM-DD */
  sourceDate?: string
  note?: string
  collectedAt: string
  createdAt: string
  updatedAt: string
}

export interface QuestionDetail extends Question {
  company: Company | null
}

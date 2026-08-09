export type CompanyType = 'public' | 'private' | 'securities'
export type JobSource = 'official' | 'boss' | 'wechat' | 'manual'
export type FetchStatus = 'complete' | 'partial' | 'manual_required'
export type SourceStatus = FetchStatus | 'blocked'
export type AutumnStatus = 'open' | 'not_started' | 'ended' | 'unknown'
export type ApplicationStage =
  | 'interested'
  | 'applied'
  | 'written_test'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
export type InterviewSource = 'xiaohongshu' | 'nowcoder' | 'zhihu' | '1point3acres' | 'forum' | 'manual'
export type InterviewResult = 'offer' | 'no_offer' | 'in_progress' | 'unknown'
export type InterviewDifficulty = 'easy' | 'medium' | 'hard' | 'unknown'

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
}

export interface SourceItem {
  type: JobSource
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
  source: JobSource
  fetchStatus: FetchStatus
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

export interface Interview {
  id: string
  companyId: string
  companyName?: string | null
  jobTitle: string
  rounds: InterviewRound[]
  summary: string
  result: InterviewResult
  difficulty: InterviewDifficulty
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

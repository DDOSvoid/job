import type {
  Application,
  ApplicationStage,
  Company,
  CompanyDetail,
  Interview,
  InterviewDetail,
  Job,
  JobDetail,
  Question,
  QuestionDetail,
  TimelineEntry,
} from '../types'

export class ApiError extends Error {}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(data.error || `请求失败：${res.status}`)
  }
  return data as T
}

function qs(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v)
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export interface JobFilters {
  companyId?: string
  autumn2026?: string
  fetchStatus?: string
}

export interface InterviewFilters {
  companyId?: string
  result?: string
  source?: string
}

export const api = {
  getCompanies(): Promise<Company[]> {
    return request('/companies')
  },
  getCompany(id: string): Promise<CompanyDetail> {
    return request(`/companies/${encodeURIComponent(id)}`)
  },
  getJobs(filters: JobFilters = {}): Promise<Job[]> {
    return request(`/jobs${qs({ ...filters })}`)
  },
  getJob(id: string): Promise<JobDetail> {
    return request(`/jobs/${encodeURIComponent(id)}`)
  },
  getApplications(): Promise<Application[]> {
    return request('/applications')
  },
  createApplication(jobId: string, timeline: TimelineEntry[]): Promise<Application> {
    // validateApplication 要求 id 必填；沿用后端默认规则 `app-<jobId>`
    return request('/applications', {
      method: 'POST',
      body: JSON.stringify({ id: `app-${jobId}`, jobId, timeline }),
    })
  },
  appendTimeline(
    appId: string,
    entry: { stage: ApplicationStage; date?: string; note?: string },
  ): Promise<Application> {
    return request(`/applications/${encodeURIComponent(appId)}/timeline`, {
      method: 'POST',
      body: JSON.stringify(entry),
    })
  },
  deleteApplication(id: string): Promise<{ ok: true }> {
    return request(`/applications/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  getInterviews(filters: InterviewFilters = {}): Promise<Interview[]> {
    return request(`/interviews${qs({ ...filters })}`)
  },
  getInterview(id: string): Promise<InterviewDetail> {
    return request(`/interviews/${encodeURIComponent(id)}`)
  },
  getQuestions(): Promise<Question[]> {
    return request('/questions')
  },
  getQuestion(id: string): Promise<QuestionDetail> {
    return request(`/questions/${encodeURIComponent(id)}`)
  },
}

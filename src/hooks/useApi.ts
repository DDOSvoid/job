import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ApplicationStage, TimelineEntry } from '../types'
import { api, type InterviewFilters, type JobFilters } from '../api/client'

export function useCompanies() {
  return useQuery({ queryKey: ['companies'], queryFn: () => api.getCompanies() })
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => api.getCompany(id),
    enabled: !!id,
  })
}

export function useJobs(filters: JobFilters = {}) {
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => api.getJobs(filters),
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => api.getJob(id),
    enabled: !!id,
  })
}

export function useApplications() {
  return useQuery({ queryKey: ['applications'], queryFn: () => api.getApplications() })
}

export function useInterviews(filters: InterviewFilters = {}) {
  return useQuery({
    queryKey: ['interviews', filters],
    queryFn: () => api.getInterviews(filters),
  })
}

export function useInterview(id: string) {
  return useQuery({
    queryKey: ['interview', id],
    queryFn: () => api.getInterview(id),
    enabled: !!id,
  })
}

export function useQuestions() {
  return useQuery({ queryKey: ['questions'], queryFn: () => api.getQuestions() })
}

export function useQuestion(id: string) {
  return useQuery({
    queryKey: ['question', id],
    queryFn: () => api.getQuestion(id),
    enabled: !!id,
  })
}

// 变更后使相关查询失效，刷新界面
function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['applications'] })
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['job'] })
    qc.invalidateQueries({ queryKey: ['company'] })
    qc.invalidateQueries({ queryKey: ['companies'] })
    qc.invalidateQueries({ queryKey: ['interviews'] })
    qc.invalidateQueries({ queryKey: ['interview'] })
    qc.invalidateQueries({ queryKey: ['questions'] })
    qc.invalidateQueries({ queryKey: ['question'] })
  }
}

export function useCreateApplication() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ jobId, timeline }: { jobId: string; timeline: TimelineEntry[] }) =>
      api.createApplication(jobId, timeline),
    onSuccess: invalidate,
  })
}

export function useAppendTimeline() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({
      appId,
      entry,
    }: {
      appId: string
      entry: { stage: ApplicationStage; date?: string; note?: string }
    }) => api.appendTimeline(appId, entry),
    onSuccess: invalidate,
  })
}

export function useDeleteApplication() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: string) => api.deleteApplication(id),
    onSuccess: invalidate,
  })
}

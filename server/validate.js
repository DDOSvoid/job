import {
  COMPANY_TYPES,
  COMPANY_SOURCES,
  JOB_SOURCES,
  SOURCE_STATUSES,
  FETCH_STATUS,
  AUTUMN_STATUS,
  RECRUITMENT_TYPES,
  APPLICATION_STAGES,
  INTERVIEW_SOURCES,
  INTERVIEW_RESULTS,
  QUESTION_CATEGORIES,
} from '../shared/constants.js'
import { readCollection } from './store.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isStr(v, max = 2000) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max
}

function inEnum(v, list) {
  return list.includes(v)
}

export function validateCompany(c) {
  const errors = []
  if (!isStr(c?.id)) errors.push('id 缺失')
  if (!isStr(c?.name)) errors.push('name 缺失')
  if (!inEnum(c?.type, COMPANY_TYPES)) errors.push(`type 必须是 ${COMPANY_TYPES.join('/')}`)
  if (c?.source && !inEnum(c.source, COMPANY_SOURCES)) errors.push('source 非法')
  if (c?.sources !== undefined) {
    if (!Array.isArray(c.sources)) errors.push('sources 必须是数组')
    else
      c.sources.forEach((s, i) => {
        if (!isStr(s?.url)) errors.push(`sources[${i}].url 缺失`)
        if (!inEnum(s?.status, SOURCE_STATUSES)) errors.push(`sources[${i}].status 非法`)
      })
  }
  return errors
}

export function validateJob(j, { companies }) {
  const errors = []
  if (!isStr(j?.id)) errors.push('id 缺失')
  if (!isStr(j?.title)) errors.push('title 缺失')
  if (!isStr(j?.companyId)) errors.push('companyId 缺失')
  else if (!companies.some((c) => c.id === j.companyId)) errors.push(`companyId '${j.companyId}' 不存在`)
  if (j?.source && !inEnum(j.source, JOB_SOURCES)) errors.push('source 非法')
  if (j?.fetchStatus && !inEnum(j.fetchStatus, FETCH_STATUS)) errors.push('fetchStatus 非法')
  if (j?.autumn2026 && !inEnum(j.autumn2026, AUTUMN_STATUS)) errors.push('autumn2026 非法')
  if (j?.recruitmentType != null && !inEnum(j.recruitmentType, RECRUITMENT_TYPES)) errors.push('recruitmentType 非法')
  if (j?.salary !== undefined && typeof j.salary !== 'string') errors.push('salary 必须是字符串')
  if (!Array.isArray(j?.sources) || j.sources.length !== 1) {
    errors.push('sources 必须恰好 1 条（一岗一来源）')
  } else
    j.sources.forEach((s, i) => {
      if (!isStr(s?.url)) errors.push(`sources[${i}].url 缺失`)
      if (!inEnum(s?.status, SOURCE_STATUSES)) errors.push(`sources[${i}].status 非法`)
    })
  return errors
}

export function validateTimelineEntry(e) {
  const errors = []
  if (!inEnum(e?.stage, APPLICATION_STAGES)) errors.push(`stage 必须是 ${APPLICATION_STAGES.join('/')}`)
  if (e?.date !== undefined && !DATE_RE.test(e.date)) errors.push('date 格式应为 YYYY-MM-DD')
  if (e?.note !== undefined && typeof e.note !== 'string') errors.push('note 必须是字符串')
  return errors
}

export function validateApplication(a, { jobs }) {
  const errors = []
  if (!isStr(a?.id)) errors.push('id 缺失')
  if (!isStr(a?.jobId)) errors.push('jobId 缺失')
  else if (!jobs.some((j) => j.id === a.jobId)) errors.push(`jobId '${a.jobId}' 不存在`)
  if (!Array.isArray(a?.timeline) || a.timeline.length === 0) errors.push('timeline 至少需要一条记录')
  else a.timeline.forEach((e, i) => validateTimelineEntry(e).forEach((m) => errors.push(`timeline[${i}] ${m}`)))
  return errors
}

export function validateInterview(i, { companies }) {
  const errors = []
  if (!isStr(i?.id)) errors.push('id 缺失')
  if (!isStr(i?.companyId)) errors.push('companyId 缺失')
  else if (!companies.some((c) => c.id === i.companyId)) errors.push(`companyId '${i.companyId}' 不存在`)
  if (!isStr(i?.jobTitle)) errors.push('jobTitle 缺失')
  if (!Array.isArray(i?.rounds) || i.rounds.length === 0) errors.push('rounds 至少需要一条记录')
  else
    i.rounds.forEach((r, idx) => {
      if (!isStr(r?.name)) errors.push(`rounds[${idx}].name 缺失`)
      if (!isStr(r?.content)) errors.push(`rounds[${idx}].content 缺失`)
      if (r?.date !== undefined && !/^\d{4}(?:-\d{2}(?:-\d{2})?|春招|秋招|春|秋)?$/.test(r.date)) errors.push(`rounds[${idx}].date 格式应为 YYYY / YYYY-MM / YYYY-MM-DD 或 YYYY春招/秋招`)
    })
  if (i?.result !== undefined && !inEnum(i.result, INTERVIEW_RESULTS)) errors.push('result 非法')
  if (i?.source && !inEnum(i.source, INTERVIEW_SOURCES)) errors.push('source 非法')
  if (i?.questions !== undefined) {
    if (!Array.isArray(i.questions)) errors.push('questions 必须是数组')
    else
      i.questions.forEach((q, idx) => {
        if (!isStr(q?.text)) errors.push(`questions[${idx}].text 缺失`)
        if (q?.date !== undefined && !/^\d{4}(?:-\d{2}(?:-\d{2})?|春招|秋招|春|秋)?$/.test(q.date))
          errors.push(`questions[${idx}].date 格式应为 YYYY / YYYY-MM / YYYY-MM-DD 或 YYYY春招/秋招`)
      })
  }
  if (i?.sourceStatus && !inEnum(i.sourceStatus, SOURCE_STATUSES)) errors.push('sourceStatus 非法')
  if (i?.sourceUrl !== undefined && typeof i.sourceUrl !== 'string') errors.push('sourceUrl 必须是字符串')
  if (i?.collectedAt !== undefined && !DATE_RE.test(i.collectedAt)) errors.push('collectedAt 格式应为 YYYY-MM-DD')
  return errors
}

// 真实面试题目（question）：一条帖子可拆成多条题目记录，每条独立入库。
// companyId 可空（null = 通用/汇总，帖子未点名公司）。
export function validateQuestion(q, { companies }) {
  const errors = []
  if (!isStr(q?.id)) errors.push('id 缺失')
  if (q?.companyId != null && !companies.some((c) => c.id === q.companyId))
    errors.push(`companyId '${q.companyId}' 不存在`)
  if (!inEnum(q?.category, QUESTION_CATEGORIES)) errors.push(`category 必须是 ${QUESTION_CATEGORIES.join('/')}`)
  if (!isStr(q?.text)) errors.push('text 缺失')
  if (q?.source && !inEnum(q.source, INTERVIEW_SOURCES)) errors.push('source 非法')
  if (!isStr(q?.sourceUrl)) errors.push('sourceUrl 缺失')
  if (q?.sourceStatus && !inEnum(q.sourceStatus, SOURCE_STATUSES)) errors.push('sourceStatus 非法')
  if (q?.collectedAt !== undefined && !DATE_RE.test(q.collectedAt)) errors.push('collectedAt 格式应为 YYYY-MM-DD')
  if (q?.sourceDate !== undefined && !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(q.sourceDate))
    errors.push('sourceDate 格式应为 YYYY / YYYY-MM / YYYY-MM-DD')
  return errors
}

// 用户/AI 对某道题的回答（data/answers.json，一道题至多一条）。
// myAnswer/aiAnswer 可为空字符串（表示清空）；非空时长度上限放宽到 5000。
export function validateAnswer(a, { questions }) {
  const errors = []
  if (!isStr(a?.id)) errors.push('id 缺失')
  if (!isStr(a?.questionId)) errors.push('questionId 缺失')
  else if (!questions.some((q) => q.id === a.questionId)) errors.push(`questionId '${a.questionId}' 不存在`)
  const strOrEmpty = (v, max = 5000) => v === undefined || v === '' || (typeof v === 'string' && v.length <= max)
  if (!strOrEmpty(a?.myAnswer)) errors.push('myAnswer 应为字符串（≤ 5000 字符，空串表示清空）')
  if (!strOrEmpty(a?.aiAnswer)) errors.push('aiAnswer 应为字符串（≤ 5000 字符，空串表示清空）')
  if (a?.aiModel !== undefined && !isStr(a.aiModel, 200)) errors.push('aiModel 应为非空字符串')
  if (a?.aiGeneratedAt !== undefined && !DATE_RE.test(a.aiGeneratedAt))
    errors.push('aiGeneratedAt 格式应为 YYYY-MM-DD')
  return errors
}

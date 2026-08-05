// 前后端与 skill 共用的枚举常量与中文显示映射。
// 修改枚举时，请同步更新 src/constants.ts 中的类型与 src/types.ts 中的类型。

export const COMPANY_TYPES = ['public', 'private']

export const COMPANY_TYPE_LABELS = {
  public: '公募',
  private: '私募',
}

export const JOB_SOURCES = ['official', 'boss', 'wechat', 'manual']

export const JOB_SOURCE_LABELS = {
  official: '官网',
  boss: 'Boss直聘',
  wechat: '微信公众号',
  manual: '手动',
}

// 单条来源抓取状态（比 job.fetchStatus 多一个 blocked：登录墙/反爬拦住了）
export const SOURCE_STATUSES = ['complete', 'partial', 'manual_required', 'blocked']

export const SOURCE_STATUS_LABELS = {
  complete: '已抓取',
  partial: '部分抓取',
  manual_required: '需手动确认',
  blocked: '无法抓取',
}

// 岗位整体抓取状态：全 complete → complete；至少一条 complete → partial；否则 manual_required
export const FETCH_STATUS = ['complete', 'partial', 'manual_required']

export const FETCH_STATUS_LABELS = {
  complete: '已抓取完整',
  partial: '部分抓取',
  manual_required: '需手动确认',
}

export const AUTUMN_STATUS = ['open', 'not_started', 'ended', 'unknown']

export const AUTUMN_STATUS_LABELS = {
  open: '秋招已开启',
  not_started: '秋招未开始',
  ended: '秋招已结束',
  unknown: '待确认',
}

export const APPLICATION_STAGES = [
  'interested',
  'applied',
  'written_test',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
]

export const APPLICATION_STAGE_LABELS = {
  interested: '关注中',
  applied: '已投递',
  written_test: '笔试',
  interview: '面试',
  offer: 'Offer',
  rejected: '已拒绝',
  withdrawn: '已放弃',
}

export const COMPANY_SOURCES = ['example', 'skill', 'manual']

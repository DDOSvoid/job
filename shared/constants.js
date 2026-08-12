// 前后端与 skill 共用的枚举常量与中文显示映射。
// 修改枚举时，请同步更新 src/constants.ts 中的类型与 src/types.ts 中的类型。

export const COMPANY_TYPES = ['public', 'private', 'securities', 'tech']

export const COMPANY_TYPE_LABELS = {
  public: '公募',
  private: '私募',
  securities: '券商',
  tech: '科技',
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

// 岗位招聘类型：校招 / 社招 / 实习；unknown 为无信号兜底
export const RECRUITMENT_TYPES = ['campus', 'social', 'intern', 'unknown']

export const RECRUITMENT_TYPE_LABELS = {
  campus: '校招',
  social: '社招',
  intern: '实习',
  unknown: '未知',
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

// 面试经历（interview）：来源平台（论坛已按平台细分）/ 结果
export const INTERVIEW_SOURCES = [
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

export const INTERVIEW_SOURCE_LABELS = {
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

export const INTERVIEW_RESULTS = ['offer', 'no_offer', 'in_progress', 'unknown']

export const INTERVIEW_RESULT_LABELS = {
  offer: '拿到Offer',
  no_offer: '未通过',
  in_progress: '进行中',
  unknown: '未知',
}

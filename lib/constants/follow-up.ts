/**
 * 跟进看板 Tab 配置（代码质量专项：自 follow-up/page.tsx 抽出）。
 *
 * key 同时用作 URL 状态值与列表接口的 from 参数，改动需同步后端筛选逻辑。
 * 页面已做过 B8/B9 拆分，这里继续把纯配置从 900 行的编排组件里剥离。
 */

export const FOLLOW_UP_TABS = [
  { key: 'CONTACTING', label: '沟通中', from: 'CONTACTING' },
  { key: 'INTERVIEW_SCHEDULED', label: '待面试', from: 'INTERVIEW_SCHEDULED' },
  { key: 'INTERVIEWED', label: '已面试', from: 'INTERVIEWED' },
  { key: 'OFFER_SENT', label: '已发offer', from: 'OFFER_SENT' },
  { key: 'PENDING_ONBOARD', label: '待入职', from: 'PENDING_ONBOARD' },
  { key: 'HIRED', label: '已入职', from: 'HIRED' },
  { key: 'RESIGNED', label: '已离职', from: 'RESIGNED' },
  { key: 'OFFER_REJECTED', label: '拒offer', from: 'OFFER_REJECTED' },
  { key: 'INTERVIEW_CANCELLED', label: '取消面试', from: 'INTERVIEW_CANCELLED' },
  { key: 'UNSUITABLE', label: '不合适', from: 'UNSUITABLE' },
] as const

export type FollowUpTabKey = (typeof FOLLOW_UP_TABS)[number]['key']

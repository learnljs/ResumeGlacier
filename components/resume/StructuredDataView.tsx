'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface StructuredResumeData {
  name?: string | null
  gender?: string | null
  age?: number | null
  phone?: string | null
  email?: string | null
  location?: string | null
  education?: Array<{
    school?: string
    degree?: string
    major?: string
    startDate?: string
    endDate?: string
    description?: string
  }>
  experience?: Array<{
    company?: string
    position?: string
    type?: string
    startDate?: string
    endDate?: string
    description?: string
  }>
  projects?: Array<{
    name?: string
    role?: string
    startDate?: string
    endDate?: string
    description?: string
  }>
  campusActivities?: Array<{
    organization?: string
    role?: string
    startDate?: string
    endDate?: string
    description?: string
  }>
  skills?: {
    programming?: string[]
    tools?: string[]
    languages?: string[]
    certifications?: string[]
  }
  awards?: string[]
  selfEvaluation?: string | null
  currentStatus?: string | null
  /** 兼容旧版嵌套格式：部分数据把基本信息放在 basicInfo 下 */
  basicInfo?: {
    name?: string | null
    gender?: string | null
    age?: number | null
    phone?: string | null
    email?: string | null
    location?: string | null
    currentCity?: string | null
  }
}

interface StructuredDataViewProps {
  data: StructuredResumeData
  className?: string
}

export function StructuredDataView({ data, className = '' }: StructuredDataViewProps) {
  // 兼容两种格式：顶层字段 或 basicInfo 嵌套
  const basicInfo = data.basicInfo
  const getName = () => data.name ?? basicInfo?.name ?? null
  const getGender = () => data.gender ?? basicInfo?.gender ?? null
  const getAge = () => data.age ?? basicInfo?.age ?? null
  const getPhone = () => data.phone ?? basicInfo?.phone ?? null
  const getEmail = () => data.email ?? basicInfo?.email ?? null
  const getLocation = () => data.location ?? basicInfo?.location ?? basicInfo?.currentCity ?? null

  // 技能卡片：任一技能分类有内容才显示，避免空白卡片
  const showSkillsCard = !!(
    data.skills &&
    ((data.skills.programming && data.skills.programming.length > 0) ||
      (data.skills.tools && data.skills.tools.length > 0) ||
      (data.skills.languages && data.skills.languages.length > 0) ||
      (data.skills.certifications && data.skills.certifications.length > 0))
  )

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 基本信息 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {getName() && (
              <div>
                <span className="text-muted-foreground">姓名</span>
                <p className="font-medium">{getName()}</p>
              </div>
            )}
            {getGender() && (
              <div>
                <span className="text-muted-foreground">性别</span>
                <p className="font-medium">{getGender()}</p>
              </div>
            )}
            {getAge() && (
              <div>
                <span className="text-muted-foreground">年龄</span>
                <p className="font-medium">{getAge()} 岁</p>
              </div>
            )}
            {getPhone() && (
              <div>
                <span className="text-muted-foreground">电话</span>
                <p className="font-medium">{getPhone()}</p>
              </div>
            )}
            {getEmail() && (
              <div>
                <span className="text-muted-foreground">邮箱</span>
                <p className="font-medium">{getEmail()}</p>
              </div>
            )}
            {getLocation() && (
              <div>
                <span className="text-muted-foreground">所在地</span>
                <p className="font-medium">{getLocation()}</p>
              </div>
            )}
            {data.currentStatus && (
              <div>
                <span className="text-muted-foreground">当前状态</span>
                <p className="font-medium">{data.currentStatus}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 教育经历 */}
      {data.education && data.education.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">教育经历</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.education.map((edu, index) => (
              <div key={index} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{edu.school}</span>
                  <span className="text-muted-foreground text-xs">
                    {edu.startDate} - {edu.endDate}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {edu.degree} · {edu.major}
                </p>
                {edu.description && (
                  <p className="text-muted-foreground mt-1">{edu.description}</p>
                )}
                {index < data.education!.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 工作经历（正式工作） */}
      {(() => {
        const fulltimeExps = (data.experience || []).filter(e => e.type !== 'internship')
        if (fulltimeExps.length === 0) return null
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">工作经历</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fulltimeExps.map((exp, index) => (
                <div key={index} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{exp.company}</span>
                    <span className="text-muted-foreground text-xs">
                      {exp.startDate} - {exp.endDate}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{exp.position}</p>
                  {exp.description && (
                    <p className="mt-1 whitespace-pre-wrap">{exp.description}</p>
                  )}
                  {index < fulltimeExps.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })()}

      {/* 实习经历 */}
      {(() => {
        const internshipExps = (data.experience || []).filter(e => e.type === 'internship')
        if (internshipExps.length === 0) return null
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">实习经历</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {internshipExps.map((exp, index) => (
                <div key={index} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{exp.company}</span>
                    <span className="text-muted-foreground text-xs">
                      {exp.startDate} - {exp.endDate}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{exp.position}</p>
                  {exp.description && (
                    <p className="mt-1 whitespace-pre-wrap">{exp.description}</p>
                  )}
                  {index < internshipExps.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })()}

      {/* 项目经历 */}
      {data.projects && data.projects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">项目经历</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.projects.map((proj, index) => (
              <div key={index} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{proj.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {proj.startDate} - {proj.endDate}
                  </span>
                </div>
                {proj.role && <p className="text-muted-foreground">{proj.role}</p>}
                {proj.description && (
                  <p className="mt-1 whitespace-pre-wrap">{proj.description}</p>
                )}
                {index < data.projects!.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 校园经历 */}
      {data.campusActivities && data.campusActivities.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">校园经历</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.campusActivities.map((act, index) => (
              <div key={index} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{act.organization}</span>
                  <span className="text-muted-foreground text-xs">
                    {act.startDate} - {act.endDate}
                  </span>
                </div>
                {act.role && <p className="text-muted-foreground">{act.role}</p>}
                {act.description && (
                  <p className="mt-1 whitespace-pre-wrap">{act.description}</p>
                )}
                {index < data.campusActivities!.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 技能 */}
      {showSkillsCard && data.skills && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">技能</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.skills.programming && data.skills.programming.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">编程语言/框架: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.skills.programming.map((skill, i) => (
                    <Badge key={i} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.skills.tools && data.skills.tools.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">工具软件: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.skills.tools.map((skill, i) => (
                    <Badge key={i} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.skills.languages && data.skills.languages.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">语言能力: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.skills.languages.map((skill, i) => (
                    <Badge key={i} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.skills.certifications && data.skills.certifications.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">证书资质: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {data.skills.certifications.map((cert, i) => (
                    <Badge key={i} variant="outline">{cert}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 奖项荣誉 */}
      {data.awards && data.awards.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">奖项荣誉</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside text-sm space-y-1">
              {data.awards.map((award, i) => (
                <li key={i}>{award}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 自我评价 */}
      {data.selfEvaluation && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">自我评价</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{data.selfEvaluation}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

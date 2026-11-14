'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { MultiSelect } from '@/components/ui/multi-select'
import { Filter, ChevronDown, Search, Loader2, GraduationCap, Building2, Languages, Briefcase, Clock, Sparkles } from 'lucide-react'
import type { ReevaluatePosition, ReevaluateFilterValues } from '@/types/reevaluate'

/**
 * 简历复用评估页「评估条件」卡片（B9 从 page.tsx 提取）。
 * 目标岗位 + 投递岗位多选（按部门联动）+ 学历/院校/英语/工作年限/毕业年限/专业硬性条件。
 */
export function ReevaluateFilterCard({
  positions,
  positionsLoading,
  selectedPositionId,
  onSelectPosition,
  appliedPositionIds,
  onAppliedPositionIdsChange,
  appliedPositionOptions,
  hasModel,
  filters,
  onFilterChange,
  showFilters,
  onToggleFilters,
  hasAnyFilter,
  onResetFilters,
  loading,
  onRefresh,
}: {
  positions: ReevaluatePosition[]
  positionsLoading: boolean
  selectedPositionId: string
  onSelectPosition: (id: string) => void
  appliedPositionIds: string[]
  onAppliedPositionIdsChange: (ids: string[]) => void
  appliedPositionOptions: { value: string; label: string }[]
  hasModel: boolean
  filters: ReevaluateFilterValues
  onFilterChange: (key: keyof ReevaluateFilterValues, value: string) => void
  showFilters: boolean
  onToggleFilters: () => void
  hasAnyFilter: boolean
  onResetFilters: () => void
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <Card className="overflow-hidden transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">评估条件</CardTitle>
            <CardDescription>（均为选填，设置后筛选候选池）</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasAnyFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                清除筛选
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFilters}
              className="h-8 w-8 p-0 hover:bg-muted/80 hover:text-current"
              aria-label={showFilters ? '收起筛选' : '展开筛选'}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-300 ${showFilters ? '' : '-rotate-90'}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <div
        className={`transition-all duration-300 ease-out overflow-hidden ${
          showFilters ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <CardContent>
          {/* 第一行：岗位选择（必须） + 投递岗位多选 */}
          <div className="mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  选择目标岗位 <span className="text-destructive">*</span>
                </label>
                <Select
                  value={selectedPositionId}
                  onChange={(e) => onSelectPosition(e.target.value)}
                  className={positionsLoading ? 'animate-pulse' : ''}
                >
                  <option value="">请选择岗位</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  投递岗位
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    （多选，筛选投递过这些岗位的简历）
                  </span>
                </label>
                <MultiSelect
                  options={appliedPositionOptions}
                  value={appliedPositionIds}
                  onChange={onAppliedPositionIdsChange}
                  placeholder="不限投递岗位"
                  showSelectAll
                  disabled={!selectedPositionId}
                  className="w-full"
                />
              </div>
            </div>
            {selectedPositionId && hasModel && (
              <p className="text-xs text-success mt-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                该岗位已配置默认初筛模型，可正常评估
              </p>
            )}
            {selectedPositionId && !hasModel && (
              <p className="text-xs text-destructive mt-1">目标岗位未配置默认初筛模型，无法发起评估</p>
            )}
          </div>

          <Separator className="mb-4" />

          {/* 筛选条件 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                <GraduationCap className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                最低学历
              </label>
              <Select value={filters.minEducation} onChange={(e) => onFilterChange('minEducation', e.target.value)}>
                <option value="">不限</option>
                <option value="大专">大专</option>
                <option value="本科">本科</option>
                <option value="硕士">硕士</option>
                <option value="博士">博士</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                <Building2 className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                院校档次
              </label>
              <Select value={filters.schoolTier} onChange={(e) => onFilterChange('schoolTier', e.target.value)}>
                <option value="">不限</option>
                <option value="985/211">985/211</option>
                <option value="985">985</option>
                <option value="211">211</option>
                <option value="海归">海归</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                <Languages className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                英语等级
              </label>
              <Select value={filters.englishLevel} onChange={(e) => onFilterChange('englishLevel', e.target.value)}>
                <option value="">不限</option>
                <option value="四级">四级</option>
                <option value="六级">六级</option>
                <option value="专四">专四</option>
                <option value="专八">专八</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                <Briefcase className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                最低工作年限
              </label>
              <Select value={filters.minWorkYears} onChange={(e) => onFilterChange('minWorkYears', e.target.value)}>
                <option value="">不限</option>
                <option value="1">1 年</option>
                <option value="3">3 年</option>
                <option value="5">5 年</option>
                <option value="10">10 年</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                <Clock className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                毕业年限
              </label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={filters.minGraduationYears}
                  onChange={(e) => onFilterChange('minGraduationYears', e.target.value)}
                  placeholder="不限"
                  min={0}
                  max={30}
                  className="h-9 px-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-muted-foreground text-sm shrink-0">-</span>
                <Input
                  type="number"
                  value={filters.maxGraduationYears}
                  onChange={(e) => onFilterChange('maxGraduationYears', e.target.value)}
                  placeholder="不限"
                  min={0}
                  max={30}
                  className="h-9 px-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-muted-foreground text-sm shrink-0">年</span>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-3 mt-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                专业要求
              </label>
              <Input
                placeholder="多个专业用逗号分隔，如：计算机科学,软件工程"
                value={filters.majors}
                onChange={(e) => onFilterChange('majors', e.target.value)}
              />
            </div>
            <Button
              onClick={onRefresh}
              disabled={loading || !selectedPositionId}
              className="shadow-soft hover:shadow-card transition-all duration-200 shrink-0"
              size="default"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  查询中...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  刷新候选人列表
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

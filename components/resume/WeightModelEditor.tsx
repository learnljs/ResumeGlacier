'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Loader2, Save, RotateCcw, Plus, Info, Layers, Target, Check } from 'lucide-react'
import { DimensionLabel } from './DimensionLabel'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiPost, apiPut } from '@/lib/api/client'
import {
  DEFAULT_WEIGHT_MODEL_TEMPLATES,
  EVALUATION_DIMENSIONS,
  ICEBERG_DIMENSIONS,
  INITIAL_DIMENSIONS,
  type DimensionKey,
} from '@/lib/constants/evaluation'
import { parseWeightsJson, useWeightInput, weightsToNum, weightsToStr } from '@/lib/hooks/use-weight-input'
import type { WeightModelRecord } from '@/types/resume-detail'

interface WeightModelEditorProps {
  positionId: string
  category: 'initial' | 'iceberg'
  /** 该职位唯一的模型；null 表示尚未配置 */
  model: WeightModelRecord | null
  isDisabled: boolean
  onChanged: () => void
}

const META = {
  initial: {
    icon: Target,
    title: '初筛权重模型',
    description: '用于初筛评估，只计知识与技能两个维度',
    dims: INITIAL_DIMENSIONS,
  },
  iceberg: {
    icon: Layers,
    title: '冰山权重模型',
    description: '用于综合评估，覆盖冰山之上与之下全部 6 个维度',
    dims: ICEBERG_DIMENSIONS,
  },
} as const

const BAR_COLORS = [
  'from-chart-4 to-chart-4/80',
  'from-chart-3 to-chart-3/80',
  'from-chart-8 to-chart-8/80',
  'from-chart-5 to-chart-5/80',
  'from-chart-9 to-chart-9/80',
  'from-chart-10 to-chart-10/80',
]

/**
 * 单份权重模型编辑器。
 *
 * 一个职位每个分类只允许一份模型（初筛 / 冰山各一），所以这里不再有
 * 模型列表、新建表单、设为默认、删除这些「多模型」才需要的东西：
 * 未配置时给一个创建入口，已配置时直接进编辑态。
 */
export function WeightModelEditor({
  positionId,
  category,
  model,
  isDisabled,
  onChanged,
}: WeightModelEditorProps) {
  const meta = META[category]
  const Icon = meta.icon
  const dims = meta.dims as unknown as DimensionKey[]
  const template = DEFAULT_WEIGHT_MODEL_TEMPLATES[category]

  const initialWeights = useMemo(
    () => (model ? parseWeightsJson(model.weights) : weightsToStr({ ...template.weights })),
    [model, template]
  )

  const { weights, nums, sum, isValid, handleChange, handleBlur, setWeight, reset } =
    useWeightInput(initialWeights)

  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  // 外部刷新（保存后重新拉取）时同步输入态
  useEffect(() => {
    reset(initialWeights)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id, model?.weights])

  const savedNums = useMemo(
    () => (model ? weightsToNum(parseWeightsJson(model.weights)) : {}),
    [model]
  )

  const isDirty = useMemo(
    () => dims.some((key) => (nums[key] || 0) !== (savedNums[key] || 0)),
    [dims, nums, savedNums]
  )

  const handleCreate = async () => {
    setCreating(true)
    try {
      await apiPost(
        `/api/positions/${positionId}/weight-models`,
        {
          name: template.name,
          category,
          weights: { ...template.weights },
        },
        { fallbackMessage: '创建失败' }
      )
      toast.success(`${meta.title}已创建`)
      onChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async () => {
    if (!model || !isValid) return
    setSaving(true)
    try {
      await apiPut(
        `/api/positions/${positionId}/weight-models/${model.id}`,
        { weights: nums },
        { fallbackMessage: '保存失败' }
      )
      toast.success('权重已保存')
      onChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card">
      {/* 头部 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <Icon className="h-4 w-4 text-foreground/70" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{meta.title}</h3>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                model
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {model ? '已配置' : '未配置'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
        </div>
      </div>

      {!model ? (
        /* 未配置：只给创建入口 */
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            该职位还没有{meta.title}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground/70">
            创建后按推荐占比初始化，可随时调整；每个职位每个分类只需一份
          </p>
          {!isDisabled && (
            <Button
              size="sm"
              className="mt-4 h-9 gap-1.5 rounded-lg px-4"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {creating ? '创建中...' : '创建权重模型'}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4 px-5 py-4">
          {/* 权重行 */}
          <div
            className={cn(
              'grid gap-x-8 gap-y-3',
              category === 'iceberg' ? 'sm:grid-cols-2' : 'grid-cols-1'
            )}
          >
            {dims.map((key, idx) => {
              const dim = EVALUATION_DIMENSIONS[key]
              const rawVal = weights[key] ?? ''
              const numVal = nums[key] || 0
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="flex w-[104px] shrink-0 flex-col">
                    <DimensionLabel dimension={key} className="text-sm font-medium" />
                    {/* 初筛只含冰山之上两维度，无需逐行标注层级 */}
                    {category === 'iceberg' && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {dim.icebergLayer === 'visible' ? '冰山之上' : '冰山之下'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 items-center gap-2.5">
                    {/* 窄屏下拖 50px 的滑块不如直接输数字，滑块只在 sm 以上出现 */}
                    <div className="hidden flex-1 sm:block">
                      <Slider
                        value={numVal}
                        min={0}
                        max={100}
                        step={1}
                        disabled={isDisabled}
                        colorClass={BAR_COLORS[idx % BAR_COLORS.length]}
                        onChange={(v) => setWeight(key, v)}
                        aria-label={`${dim.label} 权重`}
                      />
                    </div>
                    <Input
                      inputMode="numeric"
                      value={rawVal}
                      onChange={(e) => handleChange(key, e.target.value)}
                      onBlur={() => handleBlur(key)}
                      disabled={isDisabled}
                      className="ml-auto h-8 w-14 text-center font-mono text-sm tabular-nums sm:ml-0"
                    />
                    <span className="w-3 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 底部：合计 + 操作 */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular-nums',
                  isValid
                    ? 'bg-success/10 text-success'
                    : 'bg-warning/10 text-warning'
                )}
              >
                {isValid ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Info className="h-3 w-3" />
                )}
                合计 {sum}%
              </span>
              <span className="text-muted-foreground">
                {isValid
                  ? '权重分配合理'
                  : `需恰好 100%，当前${sum > 100 ? '超出' : '还差'} ${Math.abs(100 - sum)}%`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-3 text-xs"
                onClick={() => reset(weightsToStr({ ...template.weights }))}
                disabled={isDisabled || saving}
                title="恢复为推荐占比"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                推荐占比
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 rounded-lg px-4 text-xs"
                onClick={handleSave}
                disabled={isDisabled || saving || !isValid || !isDirty}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? '保存中...' : isDirty ? '保存权重' : '已保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

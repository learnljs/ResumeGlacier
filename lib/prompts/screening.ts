/**
 * 评估提示词（开发方案 9.1）
 *
 * 原硬编码的 SCREENING_SYSTEM_PROMPT / buildScreeningUserPrompt /
 * buildGenericScreeningUserPrompt / buildDetailedCriteria 已全部移除。
 * 评估提示词改为从数据库 PromptRecord 读取 bodyText + knowledgeContent +
 * skillContent + overallRules 动态拼接，逻辑统一收敛到 prompt-assembler.ts。
 *
 * 本文件仅作兼容再导出，保持 `@/lib/prompts/screening` 导入路径可用。
 */
export {
  assemblePrompt,
  loadAndAssemblePrompt,
  parseDimensionMarkdown,
  validateDimensionMarkdown,
  validateDimensionStructure,
  validateAIOutput,
  generateJsonTemplate,
  getCurrentPromptRecord,
  getInitialWeights,
  replacePlaceholders,
  PLACEHOLDERS,
  REQUIRED_PLACEHOLDER,
} from '@/lib/services/prompt-assembler'

export type {
  QuestionItem,
  DirectionData,
  DimensionData,
  AssembleParams,
  AssembledPrompt,
  PlaceholderValues,
  ValidationResult,
} from '@/lib/services/prompt-assembler'

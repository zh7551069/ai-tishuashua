export const PRODUCT_NAME = '题刷刷';

/** 错题入卷比例上限。组卷时未消灭错题最多占 floor(题量 × 此值)。 */
export const WRONG_QUESTION_RATIO_MAX = 0.5;

/** 课件对象大小上限：50MB。 */
export const COURSEWARE_MAX_BYTES = 50 * 1024 * 1024;

/** BullMQ 队列名。API 入队与 Worker 消费使用同一名称。 */
export const JOB_GENERATE_QUIZ = 'quiz.generate';
export const JOB_EXTRACT_COURSEWARE = 'courseware.extract';

/** 国内 LLM 供应商标识。Worker 按此调用 DeepSeek 或通义。小程序不持有 Key。 */
export const LLM_PROVIDERS = ['deepseek', 'tongyi'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

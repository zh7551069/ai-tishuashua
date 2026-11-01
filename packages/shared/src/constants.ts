export const PRODUCT_NAME = '题刷刷';

/** 错题入卷比例上限。架构约定 ≤ 50%，组卷算法后续实现。 */
export const WRONG_QUESTION_RATIO_MAX = 0.5;

/** 课件对象大小上限：50MB。 */
export const COURSEWARE_MAX_BYTES = 50 * 1024 * 1024;

/** BullMQ 队列名。API 未来入队与 Worker 消费必须使用同一名称。 */
export const JOB_GENERATE_QUIZ = 'quiz.generate';
export const JOB_EXTRACT_COURSEWARE = 'courseware.extract';

/** 架构已拍板的国内 LLM 供应商标识。客户端调用尚未实现。 */
export const LLM_PROVIDERS = ['deepseek', 'tongyi'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

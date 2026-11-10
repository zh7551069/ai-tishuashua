import { parsePublicSkuList as parsePublicSkuListFromPayment } from './payment';
import type { CommerceSkuPublic } from './payment';
import {
  DAILY_PLAN_CTA_LABEL as dailyPlanCtaLabel,
  DAILY_PLAN_EMPTY_HINT as dailyPlanEmptyHint,
  DAILY_PLAN_ENCOURAGEMENT as dailyPlanEncouragement,
  DAILY_PLAN_GREETING as dailyPlanGreeting,
  DAILY_PLAN_MULTI_PACE as dailyPlanMultiPace,
  DAILY_PLAN_WEEK_STARTS_ON as dailyPlanWeekStartsOn,
  DAILY_PLAN_WEEKDAY_LABELS as dailyPlanWeekdayLabels,
  dailyPlanDayNumber as dailyPlanDayNumberFromPlan,
  dailyPlanFootnote as dailyPlanFootnoteFromPlan,
  dailyPlanLayout as dailyPlanLayoutFromPlan,
  dailyPlanPercent as dailyPlanPercentFromPlan,
  dailyPlanQuizPath as dailyPlanQuizPathFromPlan,
  dailyPlanRing as dailyPlanRingFromPlan,
  dailyPlanWeek as dailyPlanWeekFromPlan,
  formatDailyPlanDate as formatDailyPlanDateFromPlan,
  resolveDailyPlanCta as resolveDailyPlanCtaFromPlan,
} from './daily-plan';
import type {
  DailyPlanActivePack,
  DailyPlanCta,
  DailyPlanLayout,
  DailyPlanRing,
  DailyPlanView,
} from './daily-plan';

export {
  COURSEWARE_MAX_BYTES,
  JOB_EXTRACT_COURSEWARE,
  JOB_GENERATE_QUIZ,
  LLM_PROVIDERS,
  PRODUCT_NAME,
  QUIZ_SCORE_LIST_LIMIT,
  QUIZ_SCORE_LIST_TRUNCATED_HINT,
  WRONG_QUESTION_RATIO_MAX,
} from './constants';
export type { LlmProvider } from './constants';
export { ApiErrorCode } from './errors';
export type { ApiErrorBody, ApiErrorCode as ApiErrorCodeValue } from './errors';
export {
  BUSINESS_TZ,
  DEFAULT_DAILY_FREE_SESSIONS,
  ENTITLEMENT_BUCKETS,
  ENTITLEMENT_CTA_TYPES,
  ENTITLEMENT_DAY_RECONCILE_CRON,
  ENTITLEMENT_DAY_RECONCILE_JOB,
  ENTITLEMENT_EXHAUSTED_CTA,
  ENTITLEMENT_LEDGER_REASONS,
  REFINE_LIFETIME_LIMIT_FREE,
  EntitlementFlowError,
  businessDate,
  isEntitlementDevGrantEnabled,
  parseDailyFreeQuota,
  parseGrantCommand,
  parseLedgerQuery,
  refineAccess,
  reserveIdempotencyKey,
  runEntitlementDayReconcile,
  sessionConsumesEntitlement,
} from './entitlement-types';
export type {
  DayReconcileResult,
  EntitlementBalances,
  EntitlementBucket,
  EntitlementCtaType,
  EntitlementDb,
  EntitlementExhaustedDetails,
  EntitlementLedgerItem,
  EntitlementLedgerPage,
  EntitlementLedgerReason,
  EntitlementMembership,
  EntitlementReservation,
  EntitlementView,
  GrantCommand,
  GrantResult,
} from './entitlement-types';
export type { HealthStatus } from './health';
export { parseRedisUrl } from './redis';
export type { RedisEndpoint } from './redis';
export {
  BUILTIN_QUIZ_PROMPT,
  BUILTIN_QUIZ_VARIANT_PROMPT,
  buildPromptVariables,
  buildVariantPromptVariables,
  mockAiQuestions,
  mockVariantQuestion,
  normalizeQuestionScores,
  normalizeQuizRequest,
  normalizeSelection,
  parseAiQuestions,
  parseCreateQuizSessionRequest,
  pickPublishedPrompt,
  pickPublishedVariantPrompt,
  preferVariantTypes,
  renderPrompt,
  sealVariantPrompt,
  selectBankQuestions,
  takeWrongCarry,
  wrongCarryQuota,
} from './quiz-engine';
export type {
  AcceptedQuizSessionRequest,
  AiQuestionDraft,
  BankCandidate,
  PaperDraft,
  PromptCandidate,
  PromptTemplateBody,
  WrongItemRecord,
} from './quiz-engine';
export { questionContentKey } from './question-content-key';
export {
  FREE_USER_BANK_FIRST_CACHE_KEY,
  FREE_USER_BANK_FIRST_CACHE_TTL_SECONDS,
  FREE_USER_BANK_FIRST_SETTING_KEY,
  readFreeUserBankFirst,
  readFreeUserBankFirstRecord,
  SettingsCacheError,
  writeFreeUserBankFirst,
} from './system-settings';
export type { FreeUserBankFirstSetting, SettingsCache, SettingsDb } from './system-settings';
export {
  COMMERCE_AI_REVIEW_SUMMARY,
  COMMERCE_AUDIT_ACTIONS,
  COMMERCE_CLEARING_RULE_TEXT,
  COMMERCE_DEDUCT_ORDER_TEXT,
  COMMERCE_SETTING_CACHE_TTL_SECONDS,
  COMMERCE_SKUS_CACHE_KEY,
  DAILY_FREE_SESSIONS_CACHE_KEY,
  DAILY_FREE_SESSIONS_KEY,
  DEFAULT_REFINE_LIFETIME_LIMIT_FREE,
  GROWTH_CONFIG_CACHE_KEY,
  GROWTH_CONFIG_KEY,
  MEMBER_DAILY_CAP_LOCKED,
  REFINE_LIFETIME_LIMIT_FREE_CACHE_KEY,
  REFINE_LIFETIME_LIMIT_FREE_KEY,
  SKU_CODE_PATTERN,
  SKU_TYPE_LABELS,
  SKU_TYPES,
  commerceQuotaFixed,
  defaultGrowthConfig,
  formatPriceYuan,
  parseGrowthConfig,
  parseQuotaWrite,
  parseRefineLifetimeLimit,
  parseSkuCreate,
  parseSkuListQuery,
  parseSkuUpdate,
  priceFenFromYuanInput,
  priceYuanFromFen,
} from './commerce-config';
export type {
  CommerceQuotaView,
  CommerceSku,
  GrowthConfig,
  GrowthConfigView,
  GrowthInvite,
  SkuDraft,
  SkuPatch,
  SkuType,
} from './commerce-config';
export {
  GROWTH_INVITE_CODE_ALPHABET,
  GROWTH_INVITE_INVENTORY_EXPIRE_DAYS,
  GROWTH_LOT_SOURCE,
  GROWTH_MEMBER_SKIP_REASON,
  GROWTH_MEMBER_SKIP_TEXT,
  GROWTH_PENDING_SOURCE,
  growthRef,
  growthSharePath,
  growthShareStatus,
  growthWeekStart,
  isGrowthShareToken,
  isInviteCode,
  isInviterRewardRef,
  parseInviteBindBody,
  parseShareOpenBody,
} from './growth';
export type {
  GrowthCheckinResult,
  GrowthInviteBindResult,
  GrowthLotSource,
  GrowthParse,
  GrowthRewardOutcome,
  GrowthShareOpenResult,
  GrowthShareTokenResult,
  GrowthView,
} from './growth';
export {
  DEFAULT_INVENTORY_EXPIRE_DAYS,
  ORDER_KINDS,
  ORDER_PREPAY_TTL_MS,
  ORDER_STATUSES,
  PAY_CURRENCY,
  PAY_NOTIFY_ACK,
  WECHAT_PAY_BILL_RECONCILE_JOB,
  addWholeDays,
  buildOutTradeNo,
  encodeOrderCursor,
  isMockNotifyEnabled,
  membershipEndsAt,
  orderGrantRef,
  parseAdminOrderQuery,
  parseCreateOrderBody,
  parseMockNotifyBody,
  parseOrderListQuery,
  parsePriceSnapshot,
  parseSkuCatalogQuery,
  parseUpgradeQuoteBody,
  quoteMemberUpgrade,
  resolveOrderKind,
  resolveWechatPayMode,
} from './payment';

/**
 * 小程序经 barrel 调用。不要改回 `export { parsePublicSkuList } from './payment'`。
 * 那种再导出会被 tsc 编成 `exports.parsePublicSkuList = void 0` 再加 getter。
 * 开发者工具里的命名导入会拿到非函数，开通会员页就报 is not a function。
 */
export function parsePublicSkuList(value: unknown): CommerceSkuPublic[] | null {
  return parsePublicSkuListFromPayment(value);
}

export type {
  AdminOrderItem,
  CommerceSkuPublic,
  OrderCreated,
  OrderCursor,
  OrderDetail,
  OrderKind,
  OrderMembership,
  OrderStatus,
  OrderSummary,
  UpgradeQuote,
  WechatPayMode,
  WechatPayParams,
  WechatPaySettings,
} from './payment';
export { readProcessLlmEnv, resolveLlmMode } from './llm-env';
export type { LlmMode, LlmRuntimeEnv } from './llm-env';
export { examDeadlineAt, gradeSelection, summarizeGrades } from './quiz-grade';
export type { GradedSelection, QuizGradeSummary } from './quiz-grade';
export {
  DEFAULT_PAPER_MINUTES,
  DEFAULT_PER_QUESTION_SECONDS,
  DEFAULT_QUIZ_COUNT,
  DEFAULT_QUIZ_DIFFICULTY,
  DEFAULT_QUIZ_MODE,
  QUIZ_COUNTS,
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_MODES,
  QUIZ_MODE_LABELS,
  QUIZ_OUTCOMES,
  QUIZ_OUTCOME_LABELS,
  QUIZ_SESSION_SOURCES,
  QUIZ_SESSION_STATUSES,
  QUIZ_SUBMIT_REASONS,
  QUIZ_SUBMIT_REASON_LABELS,
  QUIZ_TYPE_LABELS,
  QUIZ_TYPES,
  BANK_INGEST_SOURCES,
  BANK_STATUSES,
  QUESTION_SOURCES,
  VARIANT_QUIZ_COUNT,
} from './quiz';
export type {
  CreateQuizSessionRequest,
  GenerateQuizJobPayload,
  QuizAnswerResult,
  QuizCount,
  QuizDifficulty,
  QuizMode,
  QuizOption,
  QuizOutcome,
  QuizPaperView,
  QuizProgress,
  QuizQuestionReview,
  QuizQuestionView,
  QuizResultView,
  QuizScoreList,
  QuizScoreSummary,
  QuizSessionContext,
  QuizSessionError,
  QuizSessionStatus,
  QuizSessionView,
  QuizSettings,
  QuizSubmitReason,
  QuizTimer,
  QuizTimerOff,
  QuizTimerPaper,
  QuizTimerPerQuestion,
  QuizTypeCode,
  BankIngestSource,
  BankStatus,
  QuestionSource,
  QuizSessionSource,
  SaveQuizAnswerRequest,
  SubmitQuizRequest,
} from './quiz';
export { WRONG_ITEM_STATUSES, WRONG_ITEM_STATUS_LABELS } from './wrong-book';
export type { WrongBookItem, WrongBookList, WrongItemStatus } from './wrong-book';
export type {
  AdminWrongBookDetail,
  AdminWrongBookList,
  AdminWrongBookSummary,
} from './admin-wrong-book';
export {
  ADMIN_QUESTION_BANK_DEFAULT_RANGE,
  ADMIN_QUESTION_BANK_RANGES,
  ADMIN_QUESTION_BANK_SOURCE_LABELS,
  ADMIN_QUESTION_BANK_SUMMARY_MAX,
  summarizeQuestionBankStem,
} from './admin-question-bank';
export type {
  AdminQuestionBankDetail,
  AdminQuestionBankList,
  AdminQuestionBankRange,
  AdminQuestionBankSummary,
} from './admin-question-bank';
export {
  ADMIN_COURSEWARE_STAGE_LABELS,
  ADMIN_COURSEWARE_STATUS_LABELS,
  ADMIN_COURSEWARE_UNREADABLE_FILE,
} from './admin-courseware';
export type {
  AdminCoursewareDetail,
  AdminCoursewareError,
  AdminCoursewareList,
  AdminCoursewareSummary,
} from './admin-courseware';
export {
  ADMIN_CERTIFICATE_SOURCE_LABELS,
  ADMIN_CERTIFICATE_SOURCES,
  ADMIN_CERTIFICATE_UNREADABLE_PACK,
  ADMIN_CERTIFICATE_UNREADABLE_SCORE,
} from './admin-certificates';
export type {
  AdminCertificateScoreDetail,
  AdminCertificateScoreList,
  AdminCertificateScoreQuestion,
  AdminCertificateScoreSummary,
  AdminCertificateSource,
} from './admin-certificates';
export { ADMIN_USER_STATUSES, ADMIN_USER_STATUS_LABELS } from './admin-users';
export type {
  AdminUserDetail,
  AdminUserList,
  AdminUserStatus,
  AdminUserSummary,
} from './admin-users';
export {
  ADMIN_QUIZ_SESSION_SOURCE_LABELS,
  ADMIN_QUIZ_SESSION_SOURCES,
  ADMIN_QUIZ_SESSION_STATUS_LABELS,
  ADMIN_QUIZ_SESSION_STATUSES,
  ADMIN_QUIZ_SESSION_UNREADABLE_PACK,
} from './admin-quiz-sessions';
export type {
  AdminQuizSessionDetail,
  AdminQuizSessionError,
  AdminQuizSessionList,
  AdminQuizSessionProgress,
  AdminQuizSessionSource,
  AdminQuizSessionStatus,
  AdminQuizSessionSummary,
} from './admin-quiz-sessions';
export {
  COURSEWARE_EXTENSIONS,
  EXTRACT_JOB_STATUSES,
  EXTRACT_STAGES,
  USER_COURSEWARE_TEXTBOOK,
  coursewareContentType,
  coursewareExtension,
  estimateExtractMinutes,
  validateCoursewareFile,
} from './courseware';
export type {
  CommitExtractRequest,
  CommitExtractResult,
  CoursewareExtension,
  CoursewareFileMeta,
  CoursewareRef,
  ExtractCoursewareJobPayload,
  ExtractJobStatus,
  ExtractJobView,
  ExtractStage,
  ExtractedDraft,
} from './courseware';
export type {
  CatalogTreeNode,
  CertificateList,
  CertificateSummary,
  DomainList,
  DomainSummary,
  KnowledgePointNode,
  KnowledgeTree,
  PublishStatus,
  TextbookNode,
} from './catalog';
export type {
  CertificateLatestScore,
  CertificateQueryItem,
  CertificateQueryList,
} from './certificate-query';
export {
  CATALOG_CODE_MAX_LENGTH,
  CATALOG_CODE_PATTERN,
  CATALOG_EXTRA_MAX_LENGTH,
  CATALOG_NAME_MAX_LENGTH,
  CATALOG_PROMPT_MAX_LENGTH,
  CATALOG_SCORE_MAX,
  CATALOG_SORT_MAX,
  CATALOG_SOURCE_REF_MAX_LENGTH,
} from './admin-catalog';
export type {
  AdminCatalogDeleteResult,
  AdminCatalogTree,
  AdminCertificate,
  AdminCertificateList,
  AdminCertificatePatch,
  AdminCertificateWrite,
  AdminDomain,
  AdminDomainList,
  AdminDomainPatch,
  AdminDomainWrite,
  AdminKnowledgeNode,
  AdminKnowledgePatch,
  AdminKnowledgeWrite,
  AdminTextbook,
  AdminTextbookLink,
  AdminTextbookPatch,
  AdminTextbookSummary,
  AdminTextbookWrite,
  CatalogNodeKind,
} from './admin-catalog';
export type {
  CreatePackRequest,
  DeletePackResult,
  PackKnowledgePoint,
  PackList,
  PackView,
  UpdatePackRequest,
} from './pack';
export { PACK_KNOWLEDGE_POINT_MAX, PACK_NAME_MAX_LENGTH } from './pack';

/**
 * 小程序经 barrel 调用。不要改回 `export { ... } from './daily-plan'`。
 * 那种再导出会被 tsc 编成 `exports.dailyPlanLayout = void 0` 再加 getter。
 * 开发者工具里的命名导入会拿到非函数，首页就报 dailyPlanLayout is not a function。
 * 常量和函数一样改成本地绑定，避免下一个导出又是 undefined。
 */
export const DAILY_PLAN_CTA_LABEL = dailyPlanCtaLabel;
export const DAILY_PLAN_EMPTY_HINT = dailyPlanEmptyHint;
export const DAILY_PLAN_ENCOURAGEMENT = dailyPlanEncouragement;
export const DAILY_PLAN_GREETING = dailyPlanGreeting;
export const DAILY_PLAN_MULTI_PACE = dailyPlanMultiPace;
export const DAILY_PLAN_WEEK_STARTS_ON = dailyPlanWeekStartsOn;
export const DAILY_PLAN_WEEKDAY_LABELS = dailyPlanWeekdayLabels;

export function dailyPlanDayNumber(isoDate: string): number {
  return dailyPlanDayNumberFromPlan(isoDate);
}

export function dailyPlanFootnote(plan: DailyPlanView): string {
  return dailyPlanFootnoteFromPlan(plan);
}

export function dailyPlanLayout(plan: {
  empty: boolean;
  packs: readonly unknown[];
}): DailyPlanLayout {
  return dailyPlanLayoutFromPlan(plan);
}

export function dailyPlanPercent(completed: number, total: number): number {
  return dailyPlanPercentFromPlan(completed, total);
}

export function dailyPlanQuizPath(packId: string, knowledgePointId: string): string {
  return dailyPlanQuizPathFromPlan(packId, knowledgePointId);
}

export function dailyPlanRing(plan: DailyPlanView): DailyPlanRing | null {
  return dailyPlanRingFromPlan(plan);
}

export function dailyPlanWeek(businessDate: string): Array<{ date: string; weekday: number }> {
  return dailyPlanWeekFromPlan(businessDate);
}

export function formatDailyPlanDate(businessDate: string): string {
  return formatDailyPlanDateFromPlan(businessDate);
}

export function resolveDailyPlanCta(plan: {
  empty: boolean;
  activePack: DailyPlanActivePack | null;
}): DailyPlanCta {
  return resolveDailyPlanCtaFromPlan(plan);
}

export type {
  DailyPlanActivePack,
  DailyPlanCta,
  DailyPlanItem,
  DailyPlanLayout,
  DailyPlanPackChip,
  DailyPlanRing,
  DailyPlanSummary,
  DailyPlanView,
  DailyPlanWeekDay,
} from './daily-plan';
export {
  collectKnowledgePointIds,
  filterCatalogTree,
  textbookCheckState,
  toggleKnowledgePoint,
  toggleTextbook,
} from './selection';
export type { CheckState } from './selection';
export type {
  AdminLoginRequest,
  AdminLoginResponse,
  AdminLogoutResponse,
  AdminPingResponse,
  AdminSummary,
  BindWechatPhoneRequest,
  UserStatus,
  UserSummary,
  WechatLoginRequest,
  WechatLoginResponse,
} from './auth';

import type {
  CoursewareExtension,
  ExtractedDraft,
  ExtractJobStatus,
  ExtractStage,
} from './courseware';

/**
 * 后管列表用的状态文案。小程序步骤条写的是「上传文件 / AI 学习材料」，
 * 这里按落库阶段：uploading 表示文件已入库、等待学习。
 */
export const ADMIN_COURSEWARE_STATUS_LABELS: Record<ExtractJobStatus, string> = {
  pending: '等待提炼',
  running: '提炼中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const ADMIN_COURSEWARE_STAGE_LABELS: Record<ExtractStage, string> = {
  uploading: '已入库，等待学习',
  learning: '学习材料',
  extracting: '提炼知识点',
  done: '已结束',
};

/** 与后管错题「题目内容无法读取」同一类回落。文件元数据读不出来时不把这一行丢掉。 */
export const ADMIN_COURSEWARE_UNREADABLE_FILE = '文件信息无法读取';

export interface AdminCoursewareError {
  code: string;
  message: string;
}

/**
 * 一次上传的摘要。id 是 user_uploads.id。
 * jobId 为空表示还没有提炼任务。不带草稿正文、对象键和 run_token。
 */
export interface AdminCoursewareSummary {
  id: string;
  jobId: string | null;
  userId: string;
  userNick: string | null;
  certId: string | null;
  certName: string | null;
  domainId: string | null;
  domainName: string | null;
  status: ExtractJobStatus;
  stage: ExtractStage | null;
  progress: number;
  estimatedMinutes: number | null;
  fileName: string;
  extension: CoursewareExtension | null;
  byteSize: number;
  committed: boolean;
  draftCount: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCoursewareList {
  items: AdminCoursewareSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情补上库里的草稿和错误说明。仍然不返回对象键。 */
export interface AdminCoursewareDetail extends AdminCoursewareSummary {
  drafts: ExtractedDraft[];
  extractedKpIds: string[];
  acceptedDraftIds: string[];
  error: AdminCoursewareError | null;
}

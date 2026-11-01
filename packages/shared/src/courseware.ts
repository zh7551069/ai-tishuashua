import { COURSEWARE_MAX_BYTES } from './constants';
import { ApiErrorCode } from './errors';

/** 允许上传的课件。DOC 与 DOCX、PPT 与 PPTX 都收。 */
export const COURSEWARE_EXTENSIONS = ['ppt', 'pptx', 'pdf', 'doc', 'docx'] as const;
export type CoursewareExtension = (typeof COURSEWARE_EXTENSIONS)[number];

export const EXTRACT_JOB_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type ExtractJobStatus = (typeof EXTRACT_JOB_STATUSES)[number];

/** uploading 表示文件已入库、等待学习。客户端上传中的进度不落库。 */
export const EXTRACT_STAGES = ['uploading', 'learning', 'extracting', 'done'] as const;
export type ExtractStage = (typeof EXTRACT_STAGES)[number];

/** 勾选回树时挂在这本教材下。只对上传者、当前证书可见。 */
export const USER_COURSEWARE_TEXTBOOK = '我的课件';

export interface CoursewareRef {
  id: string;
  objectKey: string;
  byteSize: number;
}

export interface ExtractCoursewareJobPayload {
  uploadId: string;
  jobId: string;
  userId: string;
  objectKey: string;
  fileName: string;
}

export interface CoursewareFileMeta {
  fileName: string;
  extension: CoursewareExtension;
  mimeType: string;
  byteSize: number;
  objectKey: string;
}

export interface ExtractedDraft {
  id: string;
  name: string;
  promptHint: string;
  excerpt: string;
}

export interface ExtractJobView {
  id: string;
  uploadId: string;
  certificateId: string;
  status: ExtractJobStatus;
  stage: ExtractStage;
  progress: number;
  estimatedMinutes: number;
  file: {
    fileName: string;
    extension: CoursewareExtension;
    byteSize: number;
  };
  drafts: ExtractedDraft[];
  extractedKpIds: string[];
  committed: boolean;
  error: { code: string; message: string } | null;
}

export interface CommitExtractRequest {
  draftIds: string[];
  packId?: string;
}

export interface CommitExtractResult {
  jobId: string;
  certificateId: string;
  textbookId: string;
  textbookName: string;
  knowledgePointIds: string[];
  packId: string | null;
}

/** 大约每 1MB 一分钟，限制在 1 到 30 分钟。mock 会更快结束，提示仍按体积估算。 */
export function estimateExtractMinutes(byteSize: number): number {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return 1;
  }
  return Math.min(30, Math.max(1, Math.ceil(byteSize / (1024 * 1024))));
}

export function coursewareContentType(extension: CoursewareExtension): string {
  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
}

export function coursewareExtension(fileName: string): CoursewareExtension | null {
  const base = fileName.split(/[/\\]/).pop() ?? '';
  const match = /\.([a-z0-9]+)$/i.exec(base.trim());
  if (!match?.[1]) {
    return null;
  }
  const extension = match[1].toLowerCase();
  return (COURSEWARE_EXTENSIONS as readonly string[]).includes(extension)
    ? (extension as CoursewareExtension)
    : null;
}

export function validateCoursewareFile(input: {
  fileName: string;
  byteSize: number;
}):
  | { ok: true; extension: CoursewareExtension; safeName: string }
  | { ok: false; code: ApiErrorCode; message: string } {
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, code: ApiErrorCode.VALIDATION_ERROR, message: '文件是空的' };
  }
  if (input.byteSize > COURSEWARE_MAX_BYTES) {
    return {
      ok: false,
      code: ApiErrorCode.COURSEWARE_TOO_LARGE,
      message: '单个文件不能超过 50MB',
    };
  }
  const extension = coursewareExtension(input.fileName);
  if (!extension) {
    return {
      ok: false,
      code: ApiErrorCode.COURSEWARE_UNSUPPORTED,
      message: '只支持 PPT、PPTX、PDF、DOC、DOCX',
    };
  }
  return { ok: true, extension, safeName: safeCoursewareName(input.fileName, extension) };
}

function safeCoursewareName(fileName: string, extension: CoursewareExtension): string {
  const base = (fileName.split(/[/\\]/).pop() ?? `upload.${extension}`).trim();
  const cleaned = base.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').replace(/^\.+/, '');
  const clipped = cleaned.slice(-80);
  if (!clipped.toLowerCase().endsWith(`.${extension}`)) {
    return `upload.${extension}`;
  }
  return clipped || `upload.${extension}`;
}

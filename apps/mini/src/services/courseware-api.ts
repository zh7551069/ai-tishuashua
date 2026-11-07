import Taro from '@tarojs/taro';
import type { CommitExtractResult, ExtractJobView } from '@tishuashua/shared';
import { miniApiBase } from './api-base';
import { HttpError, apiRequest } from './http';

const JOB_KEY = 'tishuashua.courseware.jobs';

export function uploadCourseware(
  token: string,
  file: { path: string; name: string },
  certificateId: string,
  onProgress?: (percent: number) => void,
  onTask?: (task: { abort?: () => void }) => void,
): Promise<ExtractJobView> {
  const task = Taro.uploadFile({
    url: `${miniApiBase()}/courseware/uploads`,
    filePath: file.path,
    name: 'file',
    formData: {
      certificateId,
      fileName: file.name,
    },
    header: {
      authorization: `Bearer ${token}`,
    },
  }) as Promise<Taro.uploadFile.SuccessCallbackResult> & {
    onProgressUpdate?: (callback: (event: { progress: number }) => void) => void;
    abort?: () => void;
  };
  onTask?.(task);
  task.onProgressUpdate?.((event) => {
    onProgress?.(event.progress);
  });
  return task.then((response) => {
    const body = parseBody(response.data);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body as unknown as ExtractJobView;
    }
    throw new HttpError(body.message || '上传失败', response.statusCode, body.code);
  });
}

export function fetchExtractJob(token: string, jobId: string): Promise<ExtractJobView> {
  return apiRequest<ExtractJobView>(`/courseware/jobs/${jobId}`, { method: 'GET', token });
}

export function cancelExtractJob(token: string, jobId: string): Promise<ExtractJobView> {
  return apiRequest<ExtractJobView>(`/courseware/jobs/${jobId}/cancel`, {
    method: 'POST',
    token,
  });
}

export function commitExtractJob(
  token: string,
  jobId: string,
  draftIds: string[],
  packId?: string,
): Promise<CommitExtractResult> {
  return apiRequest<CommitExtractResult>(`/courseware/jobs/${jobId}/commit`, {
    method: 'POST',
    token,
    data: { draftIds, ...(packId ? { packId } : {}) },
  });
}

export function readCoursewareJob(certificateId: string): string {
  const value: unknown = Taro.getStorageSync(JOB_KEY);
  if (!value || typeof value !== 'object') {
    return '';
  }
  const jobId = (value as Record<string, unknown>)[certificateId];
  return typeof jobId === 'string' ? jobId : '';
}

export function rememberCoursewareJob(certificateId: string, jobId: string): void {
  const value: unknown = Taro.getStorageSync(JOB_KEY);
  const current =
    value && typeof value === 'object' ? { ...(value as Record<string, string>) } : {};
  current[certificateId] = jobId;
  Taro.setStorageSync(JOB_KEY, current);
}

export function forgetCoursewareJob(certificateId: string): void {
  const value: unknown = Taro.getStorageSync(JOB_KEY);
  if (!value || typeof value !== 'object') {
    return;
  }
  const current = { ...(value as Record<string, string>) };
  delete current[certificateId];
  Taro.setStorageSync(JOB_KEY, current);
}

function parseBody(raw: string | ArrayBuffer | object): { message?: string; code?: string } {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as { message?: string; code?: string };
    } catch {
      return { message: '上传失败' };
    }
  }
  if (raw && typeof raw === 'object' && !ArrayBuffer.isView(raw)) {
    return raw as { message?: string; code?: string };
  }
  return { message: '上传失败' };
}

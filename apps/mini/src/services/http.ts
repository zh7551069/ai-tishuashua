import Taro from '@tarojs/taro';
import { miniApiBase } from './api-base';
import { HttpError } from './http-error';
import { dispatchApiRequest, type JsonRequestOptions, type TransportTask } from './http-exchange';

export { HttpError };

export function apiRequest<T>(path: string, options: JsonRequestOptions): Promise<T> {
  return dispatchApiRequest<T>(`${miniApiBase()}${path}`, options, (request) => {
    const task = Taro.request<unknown>({
      url: request.url,
      method: request.method,
      data: request.data,
      header: request.header,
      ...(request.dataType ? { dataType: request.dataType } : {}),
      ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
      ...(request.enableCache !== undefined ? { enableCache: request.enableCache } : {}),
    });
    const pending: TransportTask = task.then((response) => ({
      statusCode: response.statusCode,
      data: response.data,
    }));
    pending.abort = () => {
      task.abort();
    };
    return pending;
  });
}

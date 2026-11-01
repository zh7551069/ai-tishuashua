import type { WrongBookItem, WrongBookList, WrongItemStatus } from '@tishuashua/shared';
import { apiRequest } from './http';

export function fetchWrongBook(
  token: string,
  status: WrongItemStatus | 'all' = 'pending',
): Promise<WrongBookList> {
  const query = status === 'pending' ? '' : `?status=${status}`;
  return apiRequest<WrongBookList>(`/wrong-book${query}`, { method: 'GET', token });
}

export function fetchWrongItem(token: string, itemId: string): Promise<WrongBookItem> {
  return apiRequest<WrongBookItem>(`/wrong-book/${itemId}`, { method: 'GET', token });
}

export function clearWrongItem(token: string, itemId: string): Promise<WrongBookItem> {
  return apiRequest<WrongBookItem>(`/wrong-book/${itemId}/clear`, { method: 'POST', token });
}

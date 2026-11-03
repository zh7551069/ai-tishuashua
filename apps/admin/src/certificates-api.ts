import type {
  AdminCertificateLinkDetail,
  AdminCertificateLinkList,
  AdminScoreDetail,
  AdminScoreList,
  QuizMode,
} from '@tishuashua/shared';
import { adminFetch } from './api';

export type AdminScoreModeFilter = QuizMode | 'all';

export interface CertificateLinkFilterInput {
  userId: string;
  certId: string;
  domainId: string;
  touchedFrom: string;
  touchedTo: string;
}

export interface ScoreFilterInput {
  userId: string;
  certId: string;
  domainId: string;
  mode: AdminScoreModeFilter;
  submittedFrom: string;
  submittedTo: string;
}

export const EMPTY_LINK_FILTERS: CertificateLinkFilterInput = {
  userId: '',
  certId: '',
  domainId: '',
  touchedFrom: '',
  touchedTo: '',
};

export const EMPTY_SCORE_FILTERS: ScoreFilterInput = {
  userId: '',
  certId: '',
  domainId: '',
  mode: 'all',
  submittedFrom: '',
  submittedTo: '',
};

export function listAdminCertificateLinks(
  token: string,
  query: CertificateLinkFilterInput & { page: number },
): Promise<AdminCertificateLinkList> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  setText(params, 'userId', query.userId);
  setText(params, 'certId', query.certId);
  setText(params, 'domainId', query.domainId);
  setText(params, 'touchedFrom', toIsoBound(query.touchedFrom));
  setText(params, 'touchedTo', toIsoBound(query.touchedTo));
  return adminFetch(`/admin/certificate-links?${params.toString()}`, { token });
}

export function getAdminCertificateLink(
  token: string,
  userId: string,
  certId: string,
): Promise<AdminCertificateLinkDetail> {
  return adminFetch(`/admin/certificate-links/${userId}/${certId}`, { token });
}

export function listAdminScores(
  token: string,
  query: ScoreFilterInput & { page: number },
): Promise<AdminScoreList> {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('mode', query.mode);
  setText(params, 'userId', query.userId);
  setText(params, 'certId', query.certId);
  setText(params, 'domainId', query.domainId);
  setText(params, 'submittedFrom', toIsoBound(query.submittedFrom));
  setText(params, 'submittedTo', toIsoBound(query.submittedTo));
  return adminFetch(`/admin/scores?${params.toString()}`, { token });
}

export function getAdminScore(token: string, id: string): Promise<AdminScoreDetail> {
  return adminFetch(`/admin/scores/${id}`, { token });
}

function setText(params: URLSearchParams, key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}

function toIsoBound(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) {
    return trimmed;
  }
  return new Date(time).toISOString();
}

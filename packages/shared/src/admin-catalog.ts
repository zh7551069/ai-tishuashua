import type { CertificateSummary, PublishStatus } from './catalog';

/** 后管维护的官方目录。含下架项、分组和空教材。用户课件不在这里。 */

export const CATALOG_CODE_MAX_LENGTH = 64;
export const CATALOG_NAME_MAX_LENGTH = 80;
export const CATALOG_PROMPT_MAX_LENGTH = 500;
export const CATALOG_SOURCE_REF_MAX_LENGTH = 200;
export const CATALOG_EXTRA_MAX_LENGTH = 500;
export const CATALOG_SORT_MAX = 10_000;
export const CATALOG_SCORE_MAX = 1_000;
export const CATALOG_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CatalogNodeKind = 'knowledge_point' | 'group';

export interface AdminDomain {
  id: string;
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: number;
}

export interface AdminDomainList {
  items: AdminDomain[];
}

export interface AdminDomainWrite {
  code: string;
  name: string;
  status?: PublishStatus;
  sortOrder?: number;
}

export interface AdminDomainPatch {
  code?: string;
  name?: string;
  status?: PublishStatus;
  sortOrder?: number;
}

export interface AdminCertificate extends CertificateSummary {
  sortOrder: number;
}

export interface AdminCertificateList {
  items: AdminCertificate[];
}

export interface AdminCertificateWrite {
  code: string;
  name: string;
  status?: PublishStatus;
  totalScore: number;
  passScore?: number | null;
  enabledQuestionTypeCodes?: string[];
  extraConstraint?: string | null;
  sortOrder?: number;
}

export interface AdminCertificatePatch {
  code?: string;
  name?: string;
  status?: PublishStatus;
  totalScore?: number;
  passScore?: number | null;
  enabledQuestionTypeCodes?: string[];
  extraConstraint?: string | null;
  sortOrder?: number;
}

export interface AdminKnowledgeNode {
  id: string;
  code: string;
  name: string;
  kind: CatalogNodeKind;
  promptHint: string | null;
  sourceRef: string | null;
  level: number;
  status: PublishStatus;
  sortOrder: number;
  parentId: string | null;
  children: AdminKnowledgeNode[];
}

export interface AdminTextbookSummary {
  id: string;
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: number;
  certificateIds: string[];
}

export interface AdminTextbook extends AdminTextbookSummary {
  nodes: AdminKnowledgeNode[];
}

export interface AdminCatalogTree {
  certificateId: string;
  certificateName: string;
  certificateStatus: PublishStatus;
  domainId: string;
  domainName: string;
  domainStatus: PublishStatus;
  textbooks: AdminTextbook[];
  independentPoints: AdminKnowledgeNode[];
  linkableTextbooks: AdminTextbookSummary[];
}

export interface AdminTextbookWrite {
  code: string;
  name: string;
  status?: PublishStatus;
  sortOrder?: number;
}

export interface AdminTextbookPatch {
  code?: string;
  name?: string;
  status?: PublishStatus;
  sortOrder?: number;
}

export interface AdminTextbookLink {
  textbookId: string;
}

export interface AdminKnowledgeWrite {
  code: string;
  name: string;
  kind?: CatalogNodeKind;
  promptHint?: string | null;
  sourceRef?: string | null;
  status?: PublishStatus;
  sortOrder?: number;
  parentId?: string | null;
}

export interface AdminKnowledgePatch {
  code?: string;
  name?: string;
  kind?: CatalogNodeKind;
  promptHint?: string | null;
  sourceRef?: string | null;
  status?: PublishStatus;
  sortOrder?: number;
  parentId?: string | null;
}

export interface AdminCatalogDeleteResult {
  id: string;
}

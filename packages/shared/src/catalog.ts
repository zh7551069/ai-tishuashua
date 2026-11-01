/** 配置实体上下架。Catalog 只下发 online。 */
export type PublishStatus = 'online' | 'offline';

export interface DomainSummary {
  id: string;
  code: string;
  name: string;
  status: PublishStatus;
}

export interface CertificateSummary {
  id: string;
  domainId: string;
  code: string;
  name: string;
  status: PublishStatus;
  totalScore: number;
  passScore: number | null;
  enabledQuestionTypeCodes: string[];
  extraConstraint: string | null;
}

/** 可入包的知识点。教材 id 不能放进刷题包。 */
export interface KnowledgePointNode {
  id: string;
  kind: 'knowledge_point';
  name: string;
  promptHint: string;
  sourceRef: string | null;
  parentId: string | null;
  level: number;
}

/** 教材是树上的父节点。勾选语义由客户端表达，服务端不返回半选状态。 */
export interface TextbookNode {
  id: string;
  kind: 'textbook';
  name: string;
  children: KnowledgePointNode[];
}

export type CatalogTreeNode = TextbookNode | KnowledgePointNode;

export interface KnowledgeTree {
  certificateId: string;
  certificateName: string;
  domainId: string;
  domainName: string;
  nodes: CatalogTreeNode[];
}

export interface DomainList {
  items: DomainSummary[];
}

export interface CertificateList {
  items: CertificateSummary[];
}

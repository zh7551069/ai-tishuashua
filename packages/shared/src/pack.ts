export const PACK_NAME_MAX_LENGTH = 40;
export const PACK_KNOWLEDGE_POINT_MAX = 200;

export interface PackKnowledgePoint {
  id: string;
  name: string;
}

/** 读模型。unavailable 由证书是否上架计算，不单独落库。 */
export interface PackView {
  id: string;
  userId: string;
  domainId: string;
  certId: string;
  name: string;
  knowledgePointIds: string[];
  knowledgePoints: PackKnowledgePoint[];
  knowledgePointCount: number;
  domainName: string;
  certName: string;
  totalScore: number;
  enabledQuestionTypeCodes: string[];
  active: boolean;
  unavailable: boolean;
}

export interface PackList {
  activePackId: string | null;
  items: PackView[];
}

export interface CreatePackRequest {
  domainId: string;
  certId: string;
  knowledgePointIds: string[];
  name?: string;
}

export interface UpdatePackRequest {
  name?: string;
  knowledgePointIds?: string[];
}

export interface DeletePackResult {
  id: string;
  activePackId: string | null;
}

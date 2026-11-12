import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  QUIZ_TYPES,
  type AdminCatalogDeleteResult,
  type AdminCatalogTree,
  type AdminCertificate,
  type AdminCertificateList,
  type AdminCertificatePatch,
  type AdminCertificateWrite,
  type AdminDomain,
  type AdminDomainList,
  type AdminDomainPatch,
  type AdminDomainWrite,
  type AdminKnowledgeNode,
  type AdminKnowledgePatch,
  type AdminKnowledgeWrite,
  type AdminTextbookSummary,
  type AdminTextbookPatch,
  type AdminTextbookWrite,
  type CatalogNodeKind,
} from '@tishuashua/shared';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiException } from '../common/api.exception';
import { levelUnderParent, resolvePromptHint, subtreeLevelsFit } from './admin-catalog-rules';
import { assembleAdminNodes } from './admin-catalog-tree';
import {
  AdminCatalogRepository,
  type CertificateUsage,
  type OfficialKnowledge,
} from './admin-catalog.repository';

@Injectable()
export class AdminCatalogService {
  constructor(@Inject(AdminCatalogRepository) private readonly catalog: AdminCatalogRepository) {}

  listDomains(): Promise<AdminDomainList> {
    return this.catalog.listDomains().then((items) => ({ items }));
  }

  createDomain(input: AdminDomainWrite, actor: string): Promise<AdminDomain> {
    return this.catalog.write(async (client) => {
      const saved = await this.catalog.insertDomain(client, {
        id: randomUUID(),
        code: input.code,
        name: input.name,
        status: input.status ?? 'online',
        sortOrder: input.sortOrder ?? 0,
      });
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.domain.create',
        target: `domain:${saved.id}`,
        before: null,
        after: domainAudit(saved),
      });
      return saved;
    });
  }

  async updateDomain(id: string, input: AdminDomainPatch, actor: string): Promise<AdminDomain> {
    assertChange(input);
    return this.catalog.write(async (client) => {
      const current = await this.requireDomain(client, id);
      const saved = await this.catalog.updateDomain(client, current.id, input);
      if (!saved) {
        throw notFound('领域不存在');
      }
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.domain.update',
        target: `domain:${saved.id}`,
        before: domainAudit(current),
        after: domainAudit(saved),
      });
      return saved;
    });
  }

  async deleteDomain(id: string, actor: string): Promise<AdminCatalogDeleteResult> {
    await this.catalog.write(async (client) => {
      const current = await this.requireDomain(client, id);
      const count = await this.catalog.countCertificates(client, current.id);
      if (count > 0) {
        throw inUse('领域下还有证书，不能删除。可以改为下架。');
      }
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.domain.delete',
        target: `domain:${current.id}`,
        before: domainAudit(current),
        after: null,
      });
      await this.catalog.deleteDomain(client, current.id);
    });
    return { id };
  }

  async listCertificates(domainId: string): Promise<AdminCertificateList> {
    const domain = await this.catalog.findDomain(domainId);
    if (!domain) {
      throw notFound('领域不存在');
    }
    return { items: await this.catalog.listCertificates(domain.id) };
  }

  async createCertificate(
    domainId: string,
    input: AdminCertificateWrite,
    actor: string,
  ): Promise<AdminCertificate> {
    const types = input.enabledQuestionTypeCodes ?? [...QUIZ_TYPES];
    assertScores(input.totalScore, input.passScore ?? null);
    return this.catalog.write(async (client) => {
      const domain = await this.requireDomain(client, domainId);
      await this.assertQuestionTypes(client, types);
      const saved = await this.catalog.insertCertificate(client, {
        id: randomUUID(),
        domainId: domain.id,
        code: input.code,
        name: input.name,
        status: input.status ?? 'online',
        totalScore: input.totalScore,
        passScore: input.passScore ?? null,
        enabledQuestionTypeCodes: types,
        extraConstraint: input.extraConstraint ?? null,
        sortOrder: input.sortOrder ?? 0,
      });
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.certificate.create',
        target: `certificate:${saved.id}`,
        before: null,
        after: certificateAudit(saved),
      });
      return saved;
    });
  }

  async updateCertificate(
    id: string,
    input: AdminCertificatePatch,
    actor: string,
  ): Promise<AdminCertificate> {
    assertChange(input);
    return this.catalog.write(async (client) => {
      const current = await this.requireCertificate(client, id);
      const totalScore = input.totalScore ?? current.totalScore;
      const passScore = input.passScore === undefined ? current.passScore : input.passScore;
      assertScores(totalScore, passScore);
      if (input.enabledQuestionTypeCodes) {
        await this.assertQuestionTypes(client, input.enabledQuestionTypeCodes);
      }
      const saved = await this.catalog.updateCertificate(client, current.id, input);
      if (!saved) {
        throw notFound('证书不存在');
      }
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.certificate.update',
        target: `certificate:${saved.id}`,
        before: certificateAudit(current),
        after: certificateAudit(saved),
      });
      return saved;
    });
  }

  async deleteCertificate(id: string, actor: string): Promise<AdminCatalogDeleteResult> {
    await this.catalog.write(async (client) => {
      const current = await this.requireCertificate(client, id);
      const usage = await this.catalog.certificateUsage(client, current.id);
      if (usage.packs + usage.wrongItems + usage.uploads > 0) {
        throw inUse(certificateInUse(usage));
      }
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.certificate.delete',
        target: `certificate:${current.id}`,
        before: certificateAudit(current),
        after: null,
      });
      await this.catalog.deleteCertificate(client, current.id);
    });
    return { id };
  }

  async getTree(certificateId: string): Promise<AdminCatalogTree> {
    const header = await this.catalog.findCertificateHeader(certificateId);
    if (!header) {
      throw notFound('证书不存在');
    }
    const textbooks = await this.catalog.listLinkedTextbooks(header.certificateId);
    const rows = await this.catalog.listTextbookNodes(textbooks.map((textbook) => textbook.id));
    const independent = await this.catalog.listIndependent(header.certificateId);
    const linkableTextbooks = await this.catalog.listLinkableTextbooks(header.certificateId);
    return {
      ...header,
      textbooks: textbooks.map((textbook) => ({
        ...textbook,
        nodes: assembleAdminNodes(rows.filter((row) => row.textbookId === textbook.id)),
      })),
      independentPoints: assembleAdminNodes(independent),
      linkableTextbooks,
    };
  }

  async createTextbook(
    certificateId: string,
    input: AdminTextbookWrite,
    actor: string,
  ): Promise<AdminTextbookSummary> {
    return this.catalog.write(async (client) => {
      const certificate = await this.requireCertificate(client, certificateId);
      const id = randomUUID();
      await this.catalog.insertTextbook(client, {
        id,
        code: input.code,
        name: input.name,
        status: input.status ?? 'online',
        sortOrder: input.sortOrder ?? 0,
      });
      await this.catalog.linkTextbook(client, id, certificate.id);
      const saved = await this.requireTextbook(client, id);
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.textbook.create',
        target: `textbook:${saved.id}`,
        before: null,
        after: textbookAudit(saved),
      });
      return saved;
    });
  }

  async linkTextbook(
    certificateId: string,
    textbookId: string,
    actor: string,
  ): Promise<AdminTextbookSummary> {
    return this.catalog.write(async (client) => {
      const certificate = await this.requireCertificate(client, certificateId);
      await this.requireTextbook(client, textbookId);
      await this.catalog.linkTextbook(client, textbookId, certificate.id);
      const saved = await this.requireTextbook(client, textbookId);
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.textbook.link',
        target: `textbook:${saved.id}`,
        before: null,
        after: { textbookId: saved.id, certificateId: certificate.id },
      });
      return saved;
    });
  }

  async updateTextbook(
    id: string,
    input: AdminTextbookPatch,
    actor: string,
  ): Promise<AdminTextbookSummary> {
    assertChange(input);
    return this.catalog.write(async (client) => {
      const current = await this.requireTextbook(client, id);
      await this.catalog.updateTextbook(client, current.id, input);
      const saved = await this.requireTextbook(client, current.id);
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.textbook.update',
        target: `textbook:${saved.id}`,
        before: textbookAudit(current),
        after: textbookAudit(saved),
      });
      return saved;
    });
  }

  async unlinkTextbook(
    certificateId: string,
    textbookId: string,
    actor: string,
  ): Promise<AdminCatalogDeleteResult> {
    await this.catalog.write(async (client) => {
      const certificate = await this.requireCertificate(client, certificateId);
      await this.requireTextbook(client, textbookId);
      const removed = await this.catalog.unlinkTextbook(client, textbookId, certificate.id);
      if (!removed) {
        throw notFound('这本教材没有挂在该证书上');
      }
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.textbook.unlink',
        target: `textbook:${textbookId}`,
        before: { textbookId, certificateId: certificate.id },
        after: null,
      });
    });
    return { id: textbookId };
  }

  async deleteTextbook(id: string, actor: string): Promise<AdminCatalogDeleteResult> {
    await this.catalog.write(async (client) => {
      const current = await this.requireTextbook(client, id);
      const usage = await this.catalog.textbookUsage(client, current.id);
      if (usage.userPoints > 0) {
        throw inUse('教材下还有用户课件知识点，不能删除。可以改为下架。');
      }
      if (usage.packPoints > 0) {
        throw inUse('教材下的知识点仍在刷题包里，不能删除。可以改为下架。');
      }
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.textbook.delete',
        target: `textbook:${current.id}`,
        before: textbookAudit(current),
        after: null,
      });
      await this.catalog.deleteTextbook(client, current.id);
    });
    return { id };
  }

  createTextbookNode(
    textbookId: string,
    input: AdminKnowledgeWrite,
    actor: string,
  ): Promise<AdminKnowledgeNode> {
    return this.catalog.write(async (client) => {
      const textbook = await this.requireTextbook(client, textbookId);
      const kind = input.kind ?? 'knowledge_point';
      const parent = await this.resolveNewParent(client, textbook.id, input.parentId ?? null);
      const id = randomUUID();
      await this.catalog.insertKnowledge(client, {
        id,
        textbookId: textbook.id,
        parentId: parent.id,
        code: input.code,
        name: input.name,
        kind,
        promptHint: requiredPrompt(kind, input.promptHint ?? null, null),
        sourceRef: input.sourceRef ?? null,
        level: parent.level,
        status: input.status ?? 'online',
        sortOrder: input.sortOrder ?? 0,
      });
      const saved = await this.requireNode(client, id);
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.knowledge.create',
        target: `knowledge:${saved.id}`,
        before: null,
        after: knowledgeAudit(saved),
      });
      return saved;
    });
  }

  createIndependentPoint(
    certificateId: string,
    input: AdminKnowledgeWrite,
    actor: string,
  ): Promise<AdminKnowledgeNode> {
    if (input.kind === 'group') {
      throw validation('独立知识点不能是分组');
    }
    if (input.parentId) {
      throw validation('独立知识点不能设置父节点');
    }
    return this.catalog.write(async (client) => {
      const certificate = await this.requireCertificate(client, certificateId);
      const id = randomUUID();
      await this.catalog.insertKnowledge(client, {
        id,
        textbookId: null,
        parentId: null,
        code: input.code,
        name: input.name,
        kind: 'knowledge_point',
        promptHint: requiredPrompt('knowledge_point', input.promptHint ?? null, null),
        sourceRef: input.sourceRef ?? null,
        level: 1,
        status: input.status ?? 'online',
        sortOrder: input.sortOrder ?? 0,
      });
      await this.catalog.linkKnowledge(client, id, certificate.id);
      const saved = await this.requireNode(client, id);
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.knowledge.create',
        target: `knowledge:${saved.id}`,
        before: null,
        after: knowledgeAudit(saved),
      });
      return saved;
    });
  }

  updateKnowledge(
    id: string,
    input: AdminKnowledgePatch,
    actor: string,
  ): Promise<AdminKnowledgeNode> {
    assertChange(input);
    return this.catalog.write(async (client) => {
      const current = await this.requireOwned(client, id);
      if (current.textbookId === null && input.kind === 'group') {
        throw validation('独立知识点不能是分组');
      }
      if (current.textbookId === null && input.parentId) {
        throw validation('独立知识点不能设置父节点');
      }
      const kind = input.kind ?? current.kind;
      const placement = await this.resolveMove(client, current, input.parentId);
      await this.catalog.updateKnowledge(client, current.id, {
        code: input.code ?? current.code,
        name: input.name ?? current.name,
        kind,
        promptHint: requiredPrompt(kind, input.promptHint, current.promptHint),
        sourceRef: input.sourceRef === undefined ? current.sourceRef : input.sourceRef,
        status: input.status ?? current.status,
        sortOrder: input.sortOrder ?? current.sortOrder,
        parentId: placement.parentId,
      });
      if (placement.delta !== 0) {
        await this.catalog.shiftLevels(client, current.id, placement.delta);
      }
      const saved = await this.requireNode(client, current.id);
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.knowledge.update',
        target: `knowledge:${saved.id}`,
        before: knowledgeAudit(current),
        after: knowledgeAudit(saved),
      });
      return saved;
    });
  }

  async deleteKnowledge(id: string, actor: string): Promise<AdminCatalogDeleteResult> {
    await this.catalog.write(async (client) => {
      const current = await this.requireOwned(client, id);
      const usage = await this.catalog.subtreeUsage(client, current.id);
      if (usage.userPoints > 0) {
        throw inUse('节点下还有用户课件知识点，不能删除。可以改为下架。');
      }
      if (usage.packPoints > 0) {
        throw inUse('知识点或子节点仍在刷题包里，不能删除。可以改为下架。');
      }
      await this.catalog.audit(client, {
        actor,
        action: 'catalog.knowledge.delete',
        target: `knowledge:${current.id}`,
        before: knowledgeAudit(current),
        after: null,
      });
      await this.catalog.deleteKnowledgeSubtree(client, current.id);
    });
    return { id };
  }

  private async requireDomain(client: PoolClient, id: string): Promise<AdminDomain> {
    const domain = await this.catalog.findDomain(id, client);
    if (!domain) {
      throw notFound('领域不存在');
    }
    return domain;
  }

  private async requireCertificate(client: PoolClient, id: string): Promise<AdminCertificate> {
    const certificate = await this.catalog.findCertificate(id, client);
    if (!certificate) {
      throw notFound('证书不存在');
    }
    return certificate;
  }

  private async requireTextbook(client: PoolClient, id: string): Promise<AdminTextbookSummary> {
    const textbook = await this.catalog.findTextbook(id, client);
    if (!textbook || textbook.ownerUserId) {
      throw notFound('教材不存在');
    }
    return {
      id: textbook.id,
      code: textbook.code,
      name: textbook.name,
      status: textbook.status,
      sortOrder: textbook.sortOrder,
      certificateIds: textbook.certificateIds,
    };
  }

  private async requireOwned(client: PoolClient, id: string): Promise<OfficialKnowledge> {
    const node = await this.catalog.findKnowledge(id, client);
    if (!node || node.ownerUserId) {
      throw notFound('知识点不存在');
    }
    return node;
  }

  private async requireNode(client: PoolClient, id: string): Promise<AdminKnowledgeNode> {
    const node = await this.requireOwned(client, id);
    return {
      id: node.id,
      code: node.code,
      name: node.name,
      kind: node.kind,
      promptHint: node.promptHint,
      sourceRef: node.sourceRef,
      level: node.level,
      status: node.status,
      sortOrder: node.sortOrder,
      parentId: node.parentId,
      children: [],
    };
  }

  private async resolveNewParent(
    client: PoolClient,
    textbookId: string,
    parentId: string | null,
  ): Promise<{ id: string | null; level: number }> {
    if (!parentId) {
      return { id: null, level: 1 };
    }
    const parent = await this.catalog.findKnowledge(parentId, client);
    if (!parent || parent.ownerUserId || parent.textbookId !== textbookId) {
      throw validation('父节点必须属于同一本教材');
    }
    const level = levelUnderParent(parent.level);
    if (level === null) {
      throw validation('知识点层级只能是 1 到 4');
    }
    return { id: parent.id, level };
  }

  private async resolveMove(
    client: PoolClient,
    current: OfficialKnowledge,
    parentId: string | null | undefined,
  ): Promise<{ parentId: string | null; delta: number }> {
    if (parentId === undefined || sameId(parentId, current.parentId)) {
      return { parentId: current.parentId, delta: 0 };
    }
    if (current.textbookId === null) {
      throw validation('独立知识点不能设置父节点');
    }
    if (parentId === null) {
      const delta = 1 - current.level;
      await this.assertShift(client, current.id, delta);
      return { parentId: null, delta };
    }
    const parent = await this.catalog.findKnowledge(parentId, client);
    if (!parent || parent.ownerUserId || parent.textbookId !== current.textbookId) {
      throw validation('父节点必须属于同一本教材');
    }
    if (await this.catalog.isInSubtree(client, current.id, parent.id)) {
      throw validation('不能把节点移到自己下面');
    }
    const level = levelUnderParent(parent.level);
    if (level === null) {
      throw validation('知识点层级只能是 1 到 4');
    }
    const delta = level - current.level;
    await this.assertShift(client, current.id, delta);
    return { parentId: parent.id, delta };
  }

  private async assertShift(client: PoolClient, rootId: string, delta: number): Promise<void> {
    if (delta === 0) {
      return;
    }
    const bounds = await this.catalog.subtreeLevelBounds(client, rootId);
    if (!subtreeLevelsFit(bounds.min, bounds.max, delta)) {
      throw validation('知识点层级只能是 1 到 4');
    }
  }

  private async assertQuestionTypes(client: PoolClient, types: readonly string[]): Promise<void> {
    if (types.length === 0) {
      throw validation('请至少选择一种题型');
    }
    const enabled = await this.catalog.listEnabledQuestionTypes(client);
    if (types.some((type) => !enabled.includes(type))) {
      throw validation('题型未启用');
    }
  }
}

function requiredPrompt(
  kind: CatalogNodeKind,
  requested: string | null | undefined,
  current: string | null,
): string | null {
  const resolved = resolvePromptHint({ kind, requested, current });
  if (!resolved.ok) {
    throw validation(resolved.message);
  }
  return resolved.promptHint;
}

function assertScores(totalScore: number, passScore: number | null): void {
  if (passScore !== null && passScore > totalScore) {
    throw validation('及格分必须在 0 和总分之间');
  }
}

function assertChange(patch: object): void {
  if (!Object.values(patch).some((value) => value !== undefined)) {
    throw validation('没有要修改的内容');
  }
}

function certificateInUse(usage: CertificateUsage): string {
  const reasons: string[] = [];
  if (usage.packs > 0) {
    reasons.push('刷题包');
  }
  if (usage.wrongItems > 0) {
    reasons.push('错题');
  }
  if (usage.uploads > 0) {
    reasons.push('课件');
  }
  return `证书仍被${reasons.join('、')}引用，不能删除。请改为下架；下架后已有刷题包只能删除。`;
}

function sameId(left: string | null, right: string | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.toLowerCase() === right.toLowerCase();
}

function domainAudit(item: AdminDomain) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    status: item.status,
    sortOrder: item.sortOrder,
  };
}

function certificateAudit(item: AdminCertificate) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    status: item.status,
    totalScore: item.totalScore,
    passScore: item.passScore,
    enabledQuestionTypeCodes: item.enabledQuestionTypeCodes,
  };
}

function textbookAudit(item: AdminTextbookSummary) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    status: item.status,
    sortOrder: item.sortOrder,
    certificateIds: item.certificateIds,
  };
}

function knowledgeAudit(item: {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  parentId: string | null;
}) {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    kind: item.kind,
    status: item.status,
    parentId: item.parentId,
  };
}

function notFound(message: string): ApiException {
  return new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, message);
}

function inUse(message: string): ApiException {
  return new ApiException(HttpStatus.CONFLICT, ApiErrorCode.CATALOG_IN_USE, message);
}

function validation(message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, message);
}

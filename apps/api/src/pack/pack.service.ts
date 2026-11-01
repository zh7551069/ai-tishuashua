import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  PACK_NAME_MAX_LENGTH,
  type CreatePackRequest,
  type DeletePackResult,
  type PackList,
  type PackView,
  type UpdatePackRequest,
} from '@tishuashua/shared';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiException } from '../common/api.exception';
import { PackRepository } from './pack.repository';

@Injectable()
export class PackService {
  constructor(@Inject(PackRepository) private readonly packs: PackRepository) {}

  async list(userId: string): Promise<PackList> {
    const items = await this.packs.list(userId);
    return {
      activePackId: items.find((item) => item.active)?.id ?? null,
      items,
    };
  }

  async get(userId: string, packId: string): Promise<PackView> {
    const pack = await this.packs.findById(userId, packId);
    if (!pack) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '刷题包不存在');
    }
    return pack;
  }

  async create(userId: string, input: CreatePackRequest): Promise<PackView> {
    const knowledgePointIds = normalizeIds(input.knowledgePointIds);
    return this.packs.transaction(async (client) => {
      await this.packs.lockUser(client, userId);
      const domain = await this.packs.findDomain(client, input.domainId);
      if (!domain || domain.status !== 'online') {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '领域不存在或已下架',
        );
      }
      const cert = await this.packs.findCertificate(client, input.certId);
      if (!cert || cert.status !== 'online') {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '证书不存在或已下架',
        );
      }
      if (cert.domainId !== domain.id) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '证书不属于该领域',
        );
      }
      await this.assertKnowledgePoints(client, userId, cert.id, knowledgePointIds);
      const name = (input.name?.trim() || cert.name).trim().slice(0, PACK_NAME_MAX_LENGTH);
      if (!name) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '请填写刷题包名称',
        );
      }
      await this.packs.deactivateAll(client, userId);
      const id = randomUUID();
      await this.packs.insertPack(client, {
        id,
        userId,
        domainId: domain.id,
        certId: cert.id,
        name,
      });
      await this.packs.replaceKnowledgePoints(client, id, knowledgePointIds);
      return this.requirePack(userId, id, client);
    });
  }

  async update(userId: string, packId: string, input: UpdatePackRequest): Promise<PackView> {
    if (input.name === undefined && input.knowledgePointIds === undefined) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        '没有要修改的内容',
      );
    }
    const knowledgePointIds = input.knowledgePointIds
      ? normalizeIds(input.knowledgePointIds)
      : undefined;
    return this.packs.transaction(async (client) => {
      await this.packs.lockUser(client, userId);
      const current = await this.requirePack(userId, packId, client);
      if (current.unavailable) {
        throw unavailable();
      }
      const name = input.name === undefined ? current.name : input.name.trim();
      if (!name || name.length > PACK_NAME_MAX_LENGTH) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '请填写刷题包名称',
        );
      }
      if (knowledgePointIds) {
        await this.assertKnowledgePoints(client, userId, current.certId, knowledgePointIds);
        await this.packs.replaceKnowledgePoints(client, current.id, knowledgePointIds);
      }
      await this.packs.rename(client, current.id, userId, name);
      return this.requirePack(userId, current.id, client);
    });
  }

  async activate(userId: string, packId: string): Promise<PackView> {
    return this.packs.transaction(async (client) => {
      await this.packs.lockUser(client, userId);
      const current = await this.requirePack(userId, packId, client);
      await this.packs.deactivateAll(client, userId);
      await this.packs.markActive(client, current.id, userId);
      return this.requirePack(userId, current.id, client);
    });
  }

  async remove(userId: string, packId: string): Promise<DeletePackResult> {
    return this.packs.transaction(async (client) => {
      await this.packs.lockUser(client, userId);
      const current = await this.requirePack(userId, packId, client);
      await this.packs.deletePack(client, current.id, userId);
      const activePackId = current.active
        ? await this.packs.promoteLatest(client, userId)
        : await this.packs.findActiveId(client, userId);
      return { id: current.id, activePackId };
    });
  }

  private async assertKnowledgePoints(
    client: PoolClient,
    userId: string,
    certId: string,
    ids: readonly string[],
  ): Promise<void> {
    const rows = await this.packs.findSelectableKnowledgePoints(client, certId, ids, userId);
    const found = new Set(rows.map((row) => row.id.toLowerCase()));
    if (found.size !== ids.length || ids.some((id) => !found.has(id))) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        '只能选择该证书下已上架的知识点',
      );
    }
  }

  private async requirePack(userId: string, packId: string, client: PoolClient): Promise<PackView> {
    const pack = await this.packs.findById(userId, packId, client);
    if (!pack) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '刷题包不存在');
    }
    return pack;
  }
}

function normalizeIds(ids: readonly string[]): string[] {
  return ids.map((id) => id.toLowerCase());
}

function unavailable(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    ApiErrorCode.PACK_UNAVAILABLE,
    '关联证书已下架，此包只能删除',
  );
}

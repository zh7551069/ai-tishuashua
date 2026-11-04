import {
  DEFAULT_QUIZ_DIFFICULTY,
  QUIZ_TYPES,
  VARIANT_QUIZ_COUNT,
  type CreateQuizSessionRequest,
  type PackList,
  type PackView,
  type QuizDifficulty,
  type QuizTypeCode,
} from '@tishuashua/shared';

const KNOWN_TYPES = new Set<string>(QUIZ_TYPES);

/** 定稿 160:2。两钮一起禁用时用这一句。 */
export const EMPTY_KP_HELP = '该错题暂无可用知识点，无法复练同类或题型变异';

export const CERT_OFFLINE_HELP = '证书已下架，无法复练同类或题型变异';

export const NO_PACK_HELP = '当前证书还没有可用刷题包，无法复练同类或题型变异';

export const RETRAIN_KP_HELP = '没有可用的知识点，无法复练同类';

export function isQuizType(value: string): value is QuizTypeCode {
  return KNOWN_TYPES.has(value);
}

export function parseIdList(value: string): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of value.split(',')) {
    let id = part.trim();
    try {
      id = decodeURIComponent(id).trim();
    } catch {
      id = part.trim();
    }
    id = id.toLowerCase();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export type RetrainBlockReason = 'empty-kp' | 'cert-offline' | 'no-pack' | 'kp-unavailable';

export type RetrainTarget =
  | { ok: true; packId: string; kpIds: string[] }
  | { ok: false; reason: RetrainBlockReason; message: string };

/**
 * 同证书可用包里，优先当前包；知识点必须落在该包已绑范围内。
 * 没有交集时不回退整包。
 */
export function resolveRetrainTarget(
  item: { certId: string; kpIds: readonly string[] },
  list: PackList,
): RetrainTarget {
  const wanted = parseIdList(item.kpIds.join(','));
  if (wanted.length === 0) {
    return { ok: false, reason: 'empty-kp', message: EMPTY_KP_HELP };
  }
  const certId = item.certId.toLowerCase();
  const sameCert = list.items.filter((pack) => pack.certId.toLowerCase() === certId);
  const available = sameCert.filter((pack) => !pack.unavailable);
  if (sameCert.length > 0 && available.length === 0) {
    return { ok: false, reason: 'cert-offline', message: CERT_OFFLINE_HELP };
  }
  if (available.length === 0) {
    return { ok: false, reason: 'no-pack', message: NO_PACK_HELP };
  }
  const active = available.find((pack) => pack.id === list.activePackId || pack.active);
  const activeIds = active ? overlap(wanted, active) : [];
  if (active && activeIds.length > 0) {
    return { ok: true, packId: active.id, kpIds: activeIds };
  }
  const ranked = available
    .map((pack) => ({ pack, ids: overlap(wanted, pack) }))
    .filter((row) => row.ids.length > 0)
    .sort((a, b) => b.ids.length - a.ids.length);
  const best = ranked[0];
  if (!best) {
    return { ok: false, reason: 'kp-unavailable', message: EMPTY_KP_HELP };
  }
  return { ok: true, packId: best.pack.id, kpIds: best.ids };
}

export function retrainSimilarUrl(input: {
  wrongItemId: string;
  packId: string;
  kpIds: readonly string[];
}): string {
  const query = [
    'from=retrainSimilar',
    `wrongItemId=${encodeURIComponent(input.wrongItemId)}`,
    `packId=${encodeURIComponent(input.packId)}`,
    `kpIds=${input.kpIds.map((id) => encodeURIComponent(id)).join(',')}`,
  ].join('&');
  return `/pages/quiz/index?${query}`;
}

export function variantProgressUrl(input: {
  sessionId: string;
  wrongItemId: string;
  packId: string;
}): string {
  const query = [
    `sessionId=${encodeURIComponent(input.sessionId)}`,
    'from=variant',
    `wrongItemId=${encodeURIComponent(input.wrongItemId)}`,
    `packId=${encodeURIComponent(input.packId)}`,
  ].join('&');
  return `/pages/quiz/progress/index?${query}`;
}

/**
 * 题型变异创建体。count 固定 1，mode 固定练习。
 * 没带题型时省略 types，让服务端用证书白名单。
 */
export function variantSessionInput(input: {
  packId: string;
  wrongItemId: string;
  difficulty?: QuizDifficulty;
  types?: readonly string[];
}): CreateQuizSessionRequest {
  const types = (input.types ?? []).filter(isQuizType);
  const body: CreateQuizSessionRequest = {
    packId: input.packId,
    count: VARIANT_QUIZ_COUNT,
    difficulty: input.difficulty ?? DEFAULT_QUIZ_DIFFICULTY,
    types: types.length > 0 ? types : ['single'],
    timer: { enabled: false },
    mode: 'practice',
    source: 'variant',
    wrongItemId: input.wrongItemId,
  };
  if (types.length === 0) {
    const rest: Partial<CreateQuizSessionRequest> = { ...body };
    delete rest.types;
    return rest as CreateQuizSessionRequest;
  }
  return body;
}

function overlap(wanted: readonly string[], pack: PackView): string[] {
  const bound = new Set(pack.knowledgePointIds.map((id) => id.toLowerCase()));
  return wanted.filter((id) => bound.has(id));
}

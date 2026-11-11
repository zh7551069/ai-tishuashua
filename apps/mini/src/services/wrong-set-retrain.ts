import type { CreateQuizSessionRequest } from '@tishuashua/shared';

/** N 为未过滤错题总数。N<=0 不露出「再练这 N 道」。 */
export function wrongSetRetrainLabel(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) {
    return null;
  }
  return `再练这 ${count} 道`;
}

/** 最小成功体。知识点、题单和题量都不传，出卷由服务端按来源场次计算。 */
export function wrongSetCreateBody(sourceSessionId: string): CreateQuizSessionRequest {
  return { source: 'wrongSet', sourceSessionId };
}

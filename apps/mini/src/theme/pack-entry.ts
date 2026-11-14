import { dailyPlanQuizPath, resolveDailyPlanCta, type DailyPlanView } from '@tishuashua/shared';

export const PACK_INDEX_ROUTE = '/pages/pack/index';
export const PACK_DOMAIN_ROUTE = '/pages/pack/domain/index';
export const ME_ROUTE = '/pages/me/index';

export type HomeEntry = 'plus' | 'cta' | 'create' | 'profile' | 'knowledge';

/**
 * 首页去向。左侧人物按钮进「我」，不写性别。
 * 「+」/ 主 CTA / 空态「创建刷题包」都进刷题包页。
 * 知识点行仍直达出题，且必须带一个 kp。
 */
export function homeEntryTarget(
  entry: HomeEntry,
  knowledge?: { packId: string; knowledgePointId: string },
): string {
  if (entry === 'profile') {
    return ME_ROUTE;
  }
  if (entry === 'knowledge') {
    return dailyPlanQuizPath(knowledge?.packId ?? '', knowledge?.knowledgePointId ?? '');
  }
  return PACK_INDEX_ROUTE;
}

export type PackStart =
  | { action: 'pick' }
  | { action: 'disabled'; reason: 'unavailable' | 'no-kp' }
  | { action: 'quiz'; url: string; knowledgePointId: string };

/** 「开始刷题」上的 K=1 护栏。空 kp 不会生成路径。 */
export function packStartAction(plan: {
  empty: boolean;
  activePack: DailyPlanView['activePack'];
}): PackStart {
  const cta = resolveDailyPlanCta(plan);
  if (!cta.enabled) {
    if (cta.reason === 'empty') {
      return { action: 'pick' };
    }
    return { action: 'disabled', reason: cta.reason };
  }
  return {
    action: 'quiz',
    knowledgePointId: cta.knowledgePointId,
    url: dailyPlanQuizPath(cta.packId, cta.knowledgePointId),
  };
}

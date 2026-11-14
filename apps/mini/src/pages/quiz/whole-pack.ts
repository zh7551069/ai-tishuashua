/** 今日计划出题设置里的知识点选择。整包打开时 kept 仍记下全部 id，提交时另走省略。 */
export interface DailyPlanPointSelection {
  wholePack: boolean;
  kept: string[];
}

/**
 * 整包练习开关。
 * 打开：选中当前包全部知识点。
 * 关闭：清空全部知识点。
 */
export function applyWholePackSwitch(
  on: boolean,
  packPointIds: readonly string[],
): DailyPlanPointSelection {
  if (on) {
    return { wholePack: true, kept: normalizeIds(packPointIds) };
  }
  return { wholePack: false, kept: [] };
}

/** 芯片是否选中。整包打开时每个知识点都显示为选中。 */
export function dailyPlanPointSelected(
  selection: Pick<DailyPlanPointSelection, 'wholePack' | 'kept'>,
  id: string,
): boolean {
  if (selection.wholePack) {
    return true;
  }
  const pointId = normalizeId(id);
  return pointId.length > 0 && normalizeIds(selection.kept).includes(pointId);
}

/**
 * 点一个知识点。
 * 整包打开时退出整包，只去掉被点中的那一个，其余保持选中。
 * 手动点满当前包时同步打开整包。
 */
export function toggleDailyPlanPoint(
  selection: DailyPlanPointSelection,
  id: string,
  packPointIds: readonly string[],
): DailyPlanPointSelection {
  const all = normalizeIds(packPointIds);
  const pointId = normalizeId(id);
  if (!pointId) {
    return selection.wholePack
      ? { wholePack: true, kept: all }
      : { wholePack: false, kept: normalizeIds(selection.kept) };
  }
  if (selection.wholePack) {
    return { wholePack: false, kept: all.filter((item) => item !== pointId) };
  }
  const current = normalizeIds(selection.kept);
  const kept = current.includes(pointId)
    ? current.filter((item) => item !== pointId)
    : [...current, pointId];
  if (all.length > 0 && all.every((item) => kept.includes(item))) {
    return { wholePack: true, kept: all };
  }
  return { wholePack: false, kept };
}

/**
 * 创建会话时的知识点覆盖。
 * 整包打开时返回 undefined，调用方省略 knowledgePointIds，避免只提交部分列表。
 */
export function dailyPlanSessionKnowledgePointIds(
  selection: Pick<DailyPlanPointSelection, 'wholePack' | 'kept'>,
): string[] | undefined {
  if (selection.wholePack) {
    return undefined;
  }
  return normalizeIds(selection.kept);
}

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function normalizeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of ids) {
    const id = normalizeId(raw);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  dailyPlanFootnote,
  dailyPlanPercent,
  dailyPlanQuizPath,
  dailyPlanWeek,
  formatDailyPlanDate,
  resolveDailyPlanCta,
  type DailyPlanItem,
  type DailyPlanView,
} from '@tishuashua/shared';

describe('daily plan rules', () => {
  test('百分比向下取整，空分母为 0', () => {
    assert.equal(dailyPlanPercent(0, 0), 0);
    assert.equal(dailyPlanPercent(1, 3), 33);
    assert.equal(dailyPlanPercent(2, 3), 66);
    assert.equal(dailyPlanPercent(2, 5), 40);
  });

  test('周从周一开始，2026-11-10 是星期二', () => {
    const week = dailyPlanWeek('2026-11-10');
    assert.deepEqual(
      week.map((day) => day.date),
      [
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
      ],
    );
    assert.deepEqual(
      week.map((day) => day.weekday),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(formatDailyPlanDate('2026-11-12'), '2026年11月12日 · 星期四');
  });

  test('主 CTA 默认第一个待练知识点，全完成仍可再练', () => {
    const pending = plan({
      items: [
        item('kp-b', false),
        item('kp-a', true),
      ],
    });
    const cta = resolveDailyPlanCta(pending);
    assert.equal(cta.enabled, true);
    if (cta.enabled) {
      assert.equal(cta.knowledgePointId, 'kp-b');
      assert.equal(dailyPlanQuizPath(cta.packId, cta.knowledgePointId).includes('kpIds=kp-b'), true);
      assert.equal(dailyPlanQuizPath(cta.packId, cta.knowledgePointId).includes('intent=dailyPlan'), true);
    }
    const done = plan({
      items: [item('kp-a', true), item('kp-b', true)],
      remainingCount: 0,
      completedCount: 2,
    });
    const again = resolveDailyPlanCta(done);
    assert.equal(again.enabled, true);
    if (again.enabled) {
      assert.equal(again.knowledgePointId, 'kp-a');
      assert.equal(again.rehearse, true);
    }
    assert.throws(() => dailyPlanQuizPath('pack', ''), /知识点/);
  });

  test('空态、不可用、无知识点禁用，多包脚注用当前包剩余', () => {
    const empty = plan({ empty: true, activePack: null, packs: [] });
    const emptyCta = resolveDailyPlanCta(empty);
    assert.equal(emptyCta.enabled, false);
    if (!emptyCta.enabled) {
      assert.equal(emptyCta.hint, '创建刷题包后，即可开始今日练习');
    }
    assert.equal(dailyPlanFootnote(empty), '创建刷题包后，即可开始今日练习');

    const off = plan({ unavailable: true });
    const offCta = resolveDailyPlanCta(off);
    assert.equal(offCta.enabled, false);

    const bare = plan({ items: [] });
    assert.equal(resolveDailyPlanCta(bare).enabled, false);

    const multi = plan({
      packs: [
        { packId: 'a', name: '甲', unavailable: false, active: true, knowledgePointCount: 3, completedCount: 1, remainingCount: 2 },
        { packId: 'b', name: '乙', unavailable: true, active: false, knowledgePointCount: 9, completedCount: 9, remainingCount: 0 },
      ],
      remainingCount: 2,
    });
    assert.equal(dailyPlanFootnote(multi), '将继续 当前包 剩余的 2 项练习');
  });
});

function item(id: string, done: boolean) {
  return {
    knowledgePointId: id,
    name: id,
    done,
    completedAt: done ? '2026-11-10T00:00:00.000Z' : null,
  };
}

function plan(patch: {
  empty?: boolean;
  unavailable?: boolean;
  activePack?: DailyPlanView['activePack'];
  packs?: DailyPlanView['packs'];
  items?: DailyPlanItem[];
  remainingCount?: number;
  completedCount?: number;
}): DailyPlanView {
  const items = patch.items ?? [item('kp-a', false)];
  const active =
    patch.activePack === null
      ? null
      : {
          packId: 'pack',
          name: '当前包',
          domainName: '领域',
          certName: '证书',
          unavailable: patch.unavailable ?? false,
          knowledgePointCount: items.length,
          completedCount: patch.completedCount ?? items.filter((row) => row.done).length,
          remainingCount: patch.remainingCount ?? items.filter((row) => !row.done).length,
          percent: 0,
          items,
        };
  return {
    businessDate: '2026-11-10',
    weekStartsOn: 'monday',
    empty: patch.empty ?? false,
    activePackId: active?.packId ?? null,
    summary: {
      availablePackCount: 1,
      completedCount: active?.completedCount ?? 0,
      totalCount: active?.knowledgePointCount ?? 0,
      remainingCount: active?.remainingCount ?? 0,
      percent: 0,
    },
    activePack: patch.empty ? null : active,
    packs:
      patch.packs ??
      (active
        ? [
            {
              packId: active.packId,
              name: active.name,
              unavailable: active.unavailable,
              active: true,
              knowledgePointCount: active.knowledgePointCount,
              completedCount: active.completedCount,
              remainingCount: active.remainingCount,
            },
          ]
        : []),
    week: [],
  };
}

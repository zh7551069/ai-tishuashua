import { Inject, Injectable } from '@nestjs/common';
import {
  DAILY_PLAN_WEEK_STARTS_ON,
  businessDate,
  dailyPlanPercent,
  dailyPlanWeek,
  type DailyPlanActivePack,
  type DailyPlanItem,
  type DailyPlanPackChip,
  type DailyPlanSummary,
  type DailyPlanView,
  type DailyPlanWeekDay,
} from '@tishuashua/shared';
import { bumpDailyPlanMetric } from './daily-plan.metrics';
import {
  DailyPlanRepository,
  type DailyPlanCompletionRow,
  type DailyPlanPackRow,
} from './daily-plan.repository';

@Injectable()
export class DailyPlanService {
  constructor(@Inject(DailyPlanRepository) private readonly plans: DailyPlanRepository) {}

  async get(userId: string, now = new Date()): Promise<DailyPlanView> {
    const today = businessDate(now);
    const weekDays = dailyPlanWeek(today);
    const [packs, completions, marked] = await Promise.all([
      this.plans.listPacks(userId),
      this.plans.listCompletions(userId, today),
      this.plans.listCompletionDates(userId, weekDays[0]?.date ?? today, weekDays[6]?.date ?? today),
    ]);
    const done = indexCompletions(completions);
    const markedDays = new Set(marked);
    const chips = packs.map((pack) => toChip(pack, done));
    const active = packs.find((pack) => pack.active) ?? null;
    const summary = summarize(chips);
    const week: DailyPlanWeekDay[] = weekDays.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      hasCompletion: markedDays.has(day.date),
    }));
    if (packs.length === 0) {
      return {
        businessDate: today,
        weekStartsOn: DAILY_PLAN_WEEK_STARTS_ON,
        empty: true,
        activePackId: null,
        summary: emptySummary(),
        activePack: null,
        packs: [],
        week,
      };
    }
    return {
      businessDate: today,
      weekStartsOn: DAILY_PLAN_WEEK_STARTS_ON,
      empty: false,
      activePackId: active?.id ?? null,
      summary,
      activePack: active ? toActive(active, done) : null,
      packs: chips,
      week,
    };
  }

  /**
   * submit 已经成功之后调用。失败只记日志和计数，不抛回交卷。
   * 重复交卷也会进来，冲突时保留第一次的 completed_at。
   */
  async recordAfterSubmit(userId: string, sessionId: string, now = new Date()): Promise<void> {
    let day = '';
    let packId = '';
    let coveredCount = 0;
    try {
      day = businessDate(now);
      const session = await this.plans.findSessionMeta(userId, sessionId);
      if (!session || session.status !== 'submitted') {
        return;
      }
      if (session.source !== 'normal' || session.mode !== 'practice' || !session.packId) {
        return;
      }
      packId = session.packId;
      const covered = await this.plans.coveredKnowledgePointIds(sessionId, packId);
      coveredCount = covered.length;
      if (covered.length > 0) {
        await this.plans.upsertCompletions({
          userId,
          businessDate: day,
          packId,
          knowledgePointIds: covered,
          sessionId,
          completedAt: now,
        });
      }
      bumpDailyPlanMetric('daily_plan_upsert_success');
    } catch (error) {
      bumpDailyPlanMetric('daily_plan_upsert_fail');
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(
        `[api] daily-plan upsert failed userId=${userId} sessionId=${sessionId} businessDate=${day} packId=${packId} coveredKp=${coveredCount} ${message}`,
      );
    }
  }
}

function indexCompletions(rows: readonly DailyPlanCompletionRow[]): Map<string, Date> {
  const done = new Map<string, Date>();
  for (const row of rows) {
    done.set(key(row.packId, row.knowledgePointId), row.completedAt);
  }
  return done;
}

function toChip(pack: DailyPlanPackRow, done: Map<string, Date>): DailyPlanPackChip {
  const counts = countPoints(pack, done);
  return {
    packId: pack.id,
    name: pack.name,
    unavailable: pack.unavailable,
    active: pack.active,
    knowledgePointCount: counts.total,
    completedCount: counts.completed,
    remainingCount: counts.remaining,
  };
}

function toActive(pack: DailyPlanPackRow, done: Map<string, Date>): DailyPlanActivePack {
  const counts = countPoints(pack, done);
  const items = pack.points
    .map((point): DailyPlanItem & { position: number } => {
      const completedAt = done.get(key(pack.id, point.id)) ?? null;
      return {
        knowledgePointId: point.id,
        name: point.name,
        done: completedAt !== null,
        completedAt: completedAt ? completedAt.toISOString() : null,
        position: point.position,
      };
    })
    .sort((left, right) => {
      if (left.done !== right.done) {
        return left.done ? 1 : -1;
      }
      return left.position - right.position;
    })
    .map(({ position: _position, ...item }) => item);
  return {
    packId: pack.id,
    name: pack.name,
    domainName: pack.domainName,
    certName: pack.certName,
    unavailable: pack.unavailable,
    knowledgePointCount: counts.total,
    completedCount: counts.completed,
    remainingCount: counts.remaining,
    percent: dailyPlanPercent(counts.completed, counts.total),
    items,
  };
}

function countPoints(
  pack: DailyPlanPackRow,
  done: Map<string, Date>,
): { total: number; completed: number; remaining: number } {
  const total = pack.points.length;
  const completed = pack.points.filter((point) => done.has(key(pack.id, point.id))).length;
  return { total, completed, remaining: total - completed };
}

function summarize(packs: readonly DailyPlanPackChip[]): DailyPlanSummary {
  const available = packs.filter((pack) => !pack.unavailable);
  const completedCount = available.reduce((sum, pack) => sum + pack.completedCount, 0);
  const totalCount = available.reduce((sum, pack) => sum + pack.knowledgePointCount, 0);
  return {
    availablePackCount: available.length,
    completedCount,
    totalCount,
    remainingCount: totalCount - completedCount,
    percent: dailyPlanPercent(completedCount, totalCount),
  };
}

function emptySummary(): DailyPlanSummary {
  return {
    availablePackCount: 0,
    completedCount: 0,
    totalCount: 0,
    remainingCount: 0,
    percent: 0,
  };
}

function key(packId: string, knowledgePointId: string): string {
  return `${packId.toLowerCase()}:${knowledgePointId.toLowerCase()}`;
}

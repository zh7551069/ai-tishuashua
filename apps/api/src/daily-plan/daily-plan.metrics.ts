const counters = {
  daily_plan_upsert_success: 0,
  daily_plan_upsert_fail: 0,
};

export type DailyPlanMetricName = keyof typeof counters;

export function bumpDailyPlanMetric(name: DailyPlanMetricName): void {
  counters[name] += 1;
}

export function readDailyPlanMetrics(): { [Key in DailyPlanMetricName]: number } {
  return { ...counters };
}

export function resetDailyPlanMetrics(): void {
  counters.daily_plan_upsert_success = 0;
  counters.daily_plan_upsert_fail = 0;
}

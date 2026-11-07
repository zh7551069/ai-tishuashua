import type { QuizMode, QuizScoreSummary } from '@tishuashua/shared';

/** 练习记录列表的纯展示。点评不是接口，只按已拉回的成绩粗算。 */

export type RecordFilter = 'all' | QuizMode;

export type ScoreTone = 'good' | 'weak';

export interface RecordCardModel {
  title: string;
  badge: string;
  mode: QuizMode;
  score: string;
  tone: ScoreTone;
  /** 交卷时间 · 做对题数。列表接口没有时长，不编分钟。 */
  meta: string;
}

export interface InsightBar {
  key: string;
  name: string;
  percent: number;
  tone: ScoreTone;
}

export interface InsightModel {
  scope: string;
  score: number;
  headline: string;
  strong: string | null;
  weak: string | null;
  bars: InsightBar[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 导出里 70% 为绿、58% 为橙，60 分是分界。 */
const PASS_PERCENT = 60;
/** 导出把 80%、90% 写成「扎实」。 */
const STRONG_PERCENT = 80;
const BAR_LIMIT = 4;

export function countRecords(items: readonly QuizScoreSummary[]): Record<RecordFilter, number> {
  let practice = 0;
  let exam = 0;
  for (const item of items) {
    if (item.mode === 'exam') {
      exam += 1;
    } else {
      practice += 1;
    }
  }
  return { all: items.length, practice, exam };
}

export function filterRecords(
  items: readonly QuizScoreSummary[],
  filter: RecordFilter,
): QuizScoreSummary[] {
  if (filter === 'all') {
    return [...items];
  }
  return items.filter((item) => item.mode === filter);
}

export function recordCard(item: QuizScoreSummary, now: Date): RecordCardModel {
  const exam = item.mode === 'exam';
  const percent = exam ? scorePercent(item) : accuracyPercent(item);
  return {
    title: recordTitle(item),
    badge: exam ? '考试' : '练习',
    mode: item.mode,
    score: exam ? `${showNum(item.earnedScore)}分` : `${percent}%`,
    tone: percent >= PASS_PERCENT ? 'good' : 'weak',
    meta: `${formatRecordWhen(item.submittedAt, now)} · ${item.correctCount}/${item.questionCount}`,
  };
}

export function buildInsight(items: readonly QuizScoreSummary[], now: Date): InsightModel | null {
  if (items.length === 0) {
    return null;
  }
  const recent = items.filter((item) => inRecentWeek(item.submittedAt, now));
  const window = recent.length > 0 ? recent : items;
  const rates = window.map(sessionRate);
  const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const score = Math.round(average * 100);
  const groups = packGroups(window);
  const weakGroups = groups.filter((group) => group.percent < PASS_PERCENT);
  return {
    scope: scopeLine(window, recent.length > 0),
    score,
    headline: masteryLine(score, weakGroups.length > 0),
    strong: nameLine(
      groups.filter((group) => group.percent >= STRONG_PERCENT),
      '扎实',
      '✓',
    ),
    weak: nameLine(weakGroups, '偏弱', '!'),
    bars: pickBars(groups),
  };
}

export function formatRecordWhen(iso: string, now: Date): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return iso;
  }
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayGap = localDayStart(now) - localDayStart(date);
  const days = Math.round(dayGap / (24 * 60 * 60 * 1000));
  if (days === 0) {
    return `今天 ${clock}`;
  }
  if (days === 1) {
    return `昨天 ${clock}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

export function recordTitle(item: QuizScoreSummary): string {
  const cert = item.certName.trim();
  const pack = item.packName.trim();
  if (cert && pack && cert !== pack) {
    return `${cert} · ${pack}`;
  }
  return cert || pack || '一次刷题';
}

function masteryLine(score: number, hasWeak: boolean): string {
  if (score >= 85) {
    return hasWeak ? '整体扎实，弱项还能再提' : '整体扎实，保持手感';
  }
  if (score >= 70) {
    return hasWeak ? '整体中上，弱项可突击' : '整体中上，继续保持';
  }
  if (score >= PASS_PERCENT) {
    return '整体刚过线，优先补弱项';
  }
  return '整体偏弱，优先补弱项';
}

function nameLine(groups: readonly PackGroup[], ending: string, mark: string): string | null {
  if (groups.length === 0) {
    return null;
  }
  const names = [...groups]
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'zh'))
    .slice(0, 2)
    .map((group) => group.name);
  const listed = groups.length > 2 ? `${names.join('、')}等` : names.join('、');
  return `${mark}  ${listed}${ending}`;
}

function pickBars(groups: readonly PackGroup[]): InsightBar[] {
  const sorted = [...groups].sort(
    (a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'zh'),
  );
  const picked = sorted.length <= BAR_LIMIT ? sorted : [...sorted.slice(0, 2), ...sorted.slice(-2)];
  const seen = new Set<string>();
  const bars: InsightBar[] = [];
  for (const group of picked) {
    if (seen.has(group.key)) {
      continue;
    }
    seen.add(group.key);
    bars.push({
      key: group.key,
      name: group.name,
      percent: group.percent,
      tone: group.percent >= PASS_PERCENT ? 'good' : 'weak',
    });
  }
  return bars.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'zh'));
}

interface PackGroup {
  key: string;
  name: string;
  percent: number;
}

function packGroups(items: readonly QuizScoreSummary[]): PackGroup[] {
  const order: string[] = [];
  const rows = new Map<string, { cert: string; pack: string; sum: number; count: number }>();
  for (const item of items) {
    const cert = item.certName.trim();
    const pack = item.packName.trim();
    const key = `${cert}\n${pack}`;
    const current = rows.get(key);
    if (!current) {
      order.push(key);
      rows.set(key, { cert, pack, sum: sessionRate(item), count: 1 });
      continue;
    }
    current.sum += sessionRate(item);
    current.count += 1;
  }
  const named = order.map((key) => {
    const row = rows.get(key)!;
    return {
      key,
      cert: row.cert,
      pack: row.pack,
      label: row.pack || row.cert || '一次刷题',
      percent: Math.round((row.sum / row.count) * 100),
    };
  });
  const labelCount = new Map<string, number>();
  for (const row of named) {
    labelCount.set(row.label, (labelCount.get(row.label) ?? 0) + 1);
  }
  return named.map((row) => ({
    key: row.key,
    percent: row.percent,
    name:
      (labelCount.get(row.label) ?? 0) > 1 && row.cert && row.pack
        ? `${row.cert} · ${row.pack}`
        : row.label,
  }));
}

function scopeLine(items: readonly QuizScoreSummary[], recent: boolean): string {
  const certs: string[] = [];
  const ordered = [...items].sort((a, b) => parseTime(b.submittedAt) - parseTime(a.submittedAt));
  for (const item of ordered) {
    const name = item.certName.trim();
    if (name && !certs.includes(name)) {
      certs.push(name);
    }
  }
  let certText = '全部证书';
  if (certs.length === 1) {
    certText = certs[0]!;
  } else if (certs.length === 2) {
    certText = `${certs[0]} / ${certs[1]}`;
  } else if (certs.length > 2) {
    certText = `${certs[0]} / ${certs[1]} 等`;
  }
  return `${recent ? '近 7 天' : '全部记录'} · ${certText}`;
}

function inRecentWeek(iso: string, now: Date): boolean {
  const time = parseTime(iso);
  return time > 0 && time >= now.getTime() - WEEK_MS;
}

function sessionRate(item: QuizScoreSummary): number {
  if (Number.isFinite(item.scoreRate)) {
    return clamp01(item.scoreRate);
  }
  if (item.totalScore > 0) {
    return clamp01(item.earnedScore / item.totalScore);
  }
  return 0;
}

function scorePercent(item: QuizScoreSummary): number {
  return Math.round(sessionRate(item) * 100);
}

function accuracyPercent(item: QuizScoreSummary): number {
  return Math.round(clamp01(item.accuracy) * 100);
}

function showNum(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Math.round(value * 10) / 10);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function parseTime(iso: string): number {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : 0;
}

function localDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

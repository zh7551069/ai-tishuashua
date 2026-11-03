import {
  QUIZ_TYPE_LABELS,
  type AdminCertificateLinkSummary,
  type AdminScoreSummary,
  type CertificateLatestScore,
} from '@tishuashua/shared';

export function formatTime(value: string | null): string {
  if (!value) {
    return '无';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function sourceLine(item: AdminCertificateLinkSummary): string {
  if (
    item.packCount === 0 &&
    item.pendingWrongCount === 0 &&
    item.uploadCount === 0 &&
    item.submittedCount === 0
  ) {
    return '已消灭错题';
  }
  return `刷题包 ${item.packCount} · 未消灭错题 ${item.pendingWrongCount} · 课件 ${item.uploadCount} · 交卷 ${item.submittedCount}`;
}

export function latestScoreLabel(score: CertificateLatestScore | null): string {
  if (!score) {
    return '无';
  }
  const verdict = score.passed === null ? '未设及格线' : score.passed ? '及格' : '未及格';
  return `${score.earnedScore} / ${score.totalScore} · ${verdict}`;
}

export function scoreCertTitle(item: AdminScoreSummary): string {
  const historical = item.certName.trim();
  const current = item.resolvedCertName?.trim() ?? '';
  const name = historical || current || '未关联证书';
  return item.domainName ? `${item.domainName} / ${name}` : name;
}

export function scorePackTitle(item: AdminScoreSummary): string {
  return item.packName.trim() || '快照未写刷题包名';
}

export function scorePoints(item: AdminScoreSummary): string {
  if (!item.readable || item.earnedScore === null || item.totalScore === null) {
    return '成绩无法读取';
  }
  return `${item.earnedScore} / ${item.totalScore}`;
}

export function passLabel(item: AdminScoreSummary): string {
  if (!item.readable) {
    return '成绩无法读取';
  }
  const verdict = item.passed === null ? '未设及格线' : item.passed ? '及格' : '未及格';
  return item.passScore === null ? verdict : `${verdict} · 及格线 ${item.passScore}`;
}

export function percent(value: number | null, readable: boolean): string {
  if (!readable || value === null) {
    return '成绩无法读取';
  }
  return `${Math.round(value * 100)}%`;
}

export function typeNames(codes: string[]): string {
  if (codes.length === 0) {
    return '无';
  }
  return codes
    .map((code) =>
      code === 'single' || code === 'multi' || code === 'judge' ? QUIZ_TYPE_LABELS[code] : code,
    )
    .join('、');
}

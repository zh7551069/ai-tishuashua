import type { DomainSummary } from '@tishuashua/shared';

/** 目录接口没有领域简介。文案按名称/编码对齐稿面信息架构，未知领域用中性一句。 */
export type DomainIcon = 'ai' | 'edu' | 'money' | 'plain';

export function domainIcon(domain: Pick<DomainSummary, 'name' | 'code'>): DomainIcon {
  const hay = `${domain.name} ${domain.code}`.toLowerCase();
  if (/人工智能|算法|ai/.test(hay)) {
    return 'ai';
  }
  if (/学历|教师|教育|专升本|teacher|edu/.test(hay)) {
    return 'edu';
  }
  if (/财会|金融|会计|finance/.test(hay)) {
    return 'money';
  }
  return 'plain';
}

export function domainBlurb(domain: Pick<DomainSummary, 'name' | 'code'>): string {
  const icon = domainIcon(domain);
  if (icon === 'ai') {
    return 'AI 工程与应用类证书';
  }
  if (icon === 'edu' && domain.name.includes('学历')) {
    return '各省专升本备考';
  }
  if (icon === 'edu' && (domain.name.includes('教师') || domain.code.includes('teacher'))) {
    return '教师资格考试备考';
  }
  if (icon === 'edu') {
    return '教育类证书备考';
  }
  if (icon === 'money') {
    return '财会金融类证书';
  }
  return '进入后选择证书';
}

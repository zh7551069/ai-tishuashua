export interface EntitlementLookupItem {
  userId: string;
  nick: string | null;
  phoneMasked: string | null;
  openIdMasked: string;
  status: string;
}

export interface EntitlementOpsEntry {
  kind: 'pending' | 'lot' | 'daily_task';
  id: string;
  sourceLabel: string;
  bucket: 'inventory' | 'daily_task' | null;
  qty: number;
  remain: number;
  status: string;
  riskText: string | null;
  expiresAt: string | null;
  expiresLabel?: string;
  actions: Array<'grant' | 'void'>;
}

export interface EntitlementOpsDetail {
  user: EntitlementLookupItem;
  membership: {
    active: boolean;
    startsAt: string | null;
    endsAt: string | null;
    skuCode: string | null;
    skuName: string | null;
  };
  businessDate: string;
  timezone: string;
  balances: {
    dailyFreeRemain: number;
    dailyFreeQuota: number;
    dailyTaskRemain: number;
    inventoryRemain: number;
    pendingQty: number;
  };
  entries: EntitlementOpsEntry[];
}

export interface EntitlementAuditItem {
  id: number;
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: { reason?: string; userId?: string } | null;
  createdAt: string;
}

export interface EntitlementAuditPage {
  items: EntitlementAuditItem[];
  page: number;
  pageSize: number;
  total: number;
}

export function shortUserId(userId: string): string {
  return `u_${userId.slice(0, 8)}`;
}

export function shanghaiDay(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
}

export function entryStatusLabel(status: string): string {
  if (status === 'pending') return '待发放';
  if (status === 'available') return '可用';
  if (status === 'exhausted') return '已耗尽';
  if (status === 'expired') return '已过期';
  if (status === 'today') return '今日有效';
  return status;
}

export function bucketLabel(entry: EntitlementOpsEntry): string {
  if (entry.bucket) return entry.bucket;
  if (entry.kind === 'pending') return 'pending';
  return '—';
}

export function expiryLabel(entry: EntitlementOpsEntry): string {
  if (entry.expiresLabel) return entry.expiresLabel;
  if (entry.kind === 'pending') return '—';
  const day = shanghaiDay(entry.expiresAt);
  return day ?? '不过期';
}

export function auditReason(after: EntitlementAuditItem['after']): string {
  if (!after || typeof after !== 'object') return '—';
  const reason = after.reason;
  return typeof reason === 'string' && reason.trim() ? reason : '—';
}

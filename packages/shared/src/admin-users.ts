/** 后管用户列表只读。没有封禁写接口，status 只能展示。 */
export const ADMIN_USER_STATUSES = ['active', 'banned'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

export const ADMIN_USER_STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: '正常',
  banned: '已封禁',
};

/**
 * 后管看到的用户摘要。
 * nick 已脱敏，不是 users.nick 原文。
 * phoneMasked 只在库里的值已经是脱敏号码时才返回。
 * 不带微信 openId、unionId 和头像。
 */
export interface AdminUserSummary {
  id: string;
  nick: string | null;
  phoneMasked: string | null;
  phoneBound: boolean;
  status: AdminUserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserList {
  items: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情与列表是同一份摘要。没有更多字段，也没有封禁操作。 */
export type AdminUserDetail = AdminUserSummary;

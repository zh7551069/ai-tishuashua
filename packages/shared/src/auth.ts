/** wx.login 的 code。AppSecret 只存在于 API。昵称和头像可选，微信 code 本身不带资料。 */
export interface WechatLoginRequest {
  code: string;
  nick?: string;
  avatar?: string;
}

/** 架构 User.status。封禁账号不能签发会话。 */
export type UserStatus = 'active' | 'banned';

/** 登录响应与 GET /users/me 的用户摘要。手机号只以脱敏形式出现。 */
export interface UserSummary {
  id: string;
  wxOpenId: string;
  unionId: string | null;
  nick: string | null;
  phoneMasked: string | null;
  avatar: string | null;
  status: UserStatus;
}

/** 不透明会话 token。服务端把会话放在 Redis，响应里没有 session_key。 */
export interface WechatLoginResponse {
  token: string;
  /** 签发时的到期时间。之后每次带 token 的请求会把 Redis TTL 顺延。 */
  expiresAt: string;
  user: UserSummary;
}

/** 管理后台帐密登录。与微信登录分开。口令只出现在请求里。 */
export interface AdminLoginRequest {
  username: string;
  password: string;
}

/** 后管会话里的操作者。没有微信 openId，也没有用户表 id。 */
export interface AdminSummary {
  username: string;
}

/**
 * 后管登录成功的响应。
 * 占位时期的 `implemented: false` 不是契约；这是本切片定下的形状。
 */
export interface AdminLoginResponse {
  token: string;
  /** 签发时的到期时间。之后每次带后管 token 的请求会把 Redis TTL 顺延。 */
  expiresAt: string;
  admin: AdminSummary;
}

/** GET /api/admin/ping。需要后管会话，微信 token 不行。 */
export interface AdminPingResponse {
  ok: true;
  admin: AdminSummary;
}

/** POST /api/admin/logout。只删除当前后管 token。 */
export interface AdminLogoutResponse {
  ok: true;
}

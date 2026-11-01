/** wx.login 的 code。AppSecret 只存在于 API。 */
export interface WechatLoginRequest {
  code: string;
}

/** 管理后台帐密登录。与微信登录分开。 */
export interface AdminLoginRequest {
  username: string;
  password: string;
}

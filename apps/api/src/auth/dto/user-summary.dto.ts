import { ApiProperty } from '@nestjs/swagger';
import type { UserStatus, UserSummary, WechatLoginResponse } from '@tishuashua/shared';

export class UserSummaryDto implements UserSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  wxOpenId!: string;

  @ApiProperty({ nullable: true })
  unionId!: string | null;

  @ApiProperty({ nullable: true })
  nick!: string | null;

  @ApiProperty({ nullable: true, description: '脱敏手机号。未授权时为 null。不返回完整号码。' })
  phoneMasked!: string | null;

  @ApiProperty({ description: '是否已绑定微信授权手机号。未绑定时为 false。' })
  phoneBound!: boolean;

  @ApiProperty({ nullable: true })
  avatar!: string | null;

  @ApiProperty({ enum: ['active', 'banned'] })
  status!: UserStatus;
}

export class WechatLoginResponseDto implements WechatLoginResponse {
  @ApiProperty({ description: '不透明会话 token，放在 Authorization: Bearer。' })
  token!: string;

  @ApiProperty({ description: '签发时的到期时间。后续请求会顺延 Redis TTL。' })
  expiresAt!: string;

  @ApiProperty({ type: UserSummaryDto })
  user!: UserSummaryDto;
}

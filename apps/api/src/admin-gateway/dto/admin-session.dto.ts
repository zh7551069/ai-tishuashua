import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminLoginResponse,
  AdminLogoutResponse,
  AdminPingResponse,
  AdminSummary,
} from '@tishuashua/shared';

export class AdminSummaryDto implements AdminSummary {
  @ApiProperty()
  username!: string;
}

export class AdminLoginResponseDto implements AdminLoginResponse {
  @ApiProperty({
    description: '不透明会话 token，放在 Authorization: Bearer。不是微信登录 token。',
  })
  token!: string;

  @ApiProperty({ description: '签发时的到期时间。后续请求会顺延 Redis TTL。' })
  expiresAt!: string;

  @ApiProperty({ type: AdminSummaryDto })
  admin!: AdminSummaryDto;
}

export class AdminPingResponseDto implements AdminPingResponse {
  @ApiProperty({ enum: [true] })
  ok!: true;

  @ApiProperty({ type: AdminSummaryDto })
  admin!: AdminSummaryDto;
}

export class AdminLogoutResponseDto implements AdminLogoutResponse {
  @ApiProperty({ enum: [true] })
  ok!: true;
}

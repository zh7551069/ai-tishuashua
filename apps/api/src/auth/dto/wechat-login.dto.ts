import { ApiProperty } from '@nestjs/swagger';
import type { WechatLoginRequest } from '@tishuashua/shared';
import { IsNotEmpty, IsString } from 'class-validator';

export class WechatLoginDto implements WechatLoginRequest {
  @ApiProperty({ description: 'wx.login 返回的 code。AppSecret 不经过客户端。' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

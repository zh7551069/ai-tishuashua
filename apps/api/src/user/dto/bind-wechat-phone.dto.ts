import { ApiProperty } from '@nestjs/swagger';
import type { BindWechatPhoneRequest } from '@tishuashua/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BindWechatPhoneDto implements BindWechatPhoneRequest {
  @ApiProperty({
    description:
      'button open-type=getPhoneNumber 回调里的 code。不是 wx.login 的 code，也不是短信验证码。',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'code 必须是字符串' })
  @IsNotEmpty({ message: 'code 不能为空' })
  @MaxLength(256, { message: 'code 不能超过 256 个字符' })
  code!: string;
}

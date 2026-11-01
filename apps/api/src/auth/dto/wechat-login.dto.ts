import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WechatLoginRequest } from '@tishuashua/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class WechatLoginDto implements WechatLoginRequest {
  @ApiProperty({ description: 'wx.login 返回的 code。AppSecret 不经过客户端。' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'code 必须是字符串' })
  @IsNotEmpty({ message: 'code 不能为空' })
  @MaxLength(128, { message: 'code 不能超过 128 个字符' })
  code!: string;

  @ApiPropertyOptional({ description: '可选昵称。微信 code 不包含资料，不传则保留已有昵称。' })
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsString({ message: 'nick 必须是字符串' })
  @MaxLength(64, { message: 'nick 不能超过 64 个字符' })
  nick?: string;

  @ApiPropertyOptional({ description: '可选头像 URL。不传则保留已有头像。' })
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsString({ message: 'avatar 必须是字符串' })
  @MaxLength(1024, { message: 'avatar 不能超过 1024 个字符' })
  avatar?: string;
}

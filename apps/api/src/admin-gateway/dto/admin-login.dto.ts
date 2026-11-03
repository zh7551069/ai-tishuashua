import { ApiProperty } from '@nestjs/swagger';
import type { AdminLoginRequest } from '@tishuashua/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto implements AdminLoginRequest {
  @ApiProperty({ description: '环境变量 ADMIN_USERNAME。大小写敏感。' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'username 必须是字符串' })
  @IsNotEmpty({ message: 'username 不能为空' })
  @MaxLength(64, { message: 'username 不能超过 64 个字符' })
  username!: string;

  @ApiProperty({ description: '环境变量 ADMIN_PASSWORD。不会出现在响应里。' })
  @IsString({ message: 'password 必须是字符串' })
  @IsNotEmpty({ message: 'password 不能为空' })
  @MaxLength(128, { message: 'password 不能超过 128 个字符' })
  password!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import type { AdminLoginRequest } from '@tishuashua/shared';
import { IsNotEmpty, IsString } from 'class-validator';

export class AdminLoginDto implements AdminLoginRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}

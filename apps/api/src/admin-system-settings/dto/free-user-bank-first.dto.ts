import { ApiProperty } from '@nestjs/swagger';
import { FREE_USER_BANK_FIRST_SETTING_KEY, type FreeUserBankFirstSetting } from '@tishuashua/shared';
import { IsBoolean } from 'class-validator';

export class UpdateFreeUserBankFirstDto {
  @ApiProperty({ description: '是否让免费用户优先从题库抽题。只接受布尔值。' })
  @IsBoolean({ message: 'enabled 必须是布尔值' })
  enabled!: boolean;
}

export class FreeUserBankFirstDto implements FreeUserBankFirstSetting {
  @ApiProperty({ enum: [FREE_USER_BANK_FIRST_SETTING_KEY] })
  key!: FreeUserBankFirstSetting['key'];

  @ApiProperty({ description: '未配置时为 false。' })
  enabled!: boolean;

  @ApiProperty({ nullable: true, type: String })
  updatedAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  updatedBy!: string | null;
}

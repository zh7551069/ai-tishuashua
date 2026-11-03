import { ApiProperty } from '@nestjs/swagger';
import { ADMIN_USER_STATUSES, type AdminUserList, type AdminUserSummary } from '@tishuashua/shared';

export class AdminUserSummaryDto implements AdminUserSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, description: '脱敏昵称。不是 users.nick 原文。空昵称为 null。' })
  nick!: string | null;

  @ApiProperty({
    nullable: true,
    description: '只在库里已经是脱敏号码时返回。未绑定，或值不是脱敏格式时为 null。',
  })
  phoneMasked!: string | null;

  @ApiProperty({ description: 'phoneMasked 有值时为 true。' })
  phoneBound!: boolean;

  @ApiProperty({ enum: ADMIN_USER_STATUSES, description: '只读。没有封禁写接口。' })
  status!: AdminUserSummary['status'];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AdminUserListDto implements AdminUserList {
  @ApiProperty({ type: [AdminUserSummaryDto] })
  items!: AdminUserSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

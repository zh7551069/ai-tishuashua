import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WRONG_ITEM_STATUSES, type WrongBookItem, type WrongBookList } from '@tishuashua/shared';

export class WrongBookItemDto implements WrongBookItem {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  certId!: string;

  @ApiProperty()
  certName!: string;

  @ApiProperty({ enum: WRONG_ITEM_STATUSES })
  status!: WrongBookItem['status'];

  @ApiProperty()
  wrongCount!: number;

  @ApiProperty({ nullable: true })
  type!: WrongBookItem['type'];

  @ApiProperty()
  stem!: string;

  @ApiProperty({ type: 'array' })
  options!: WrongBookItem['options'];

  @ApiProperty({ type: [String] })
  answer!: string[];

  @ApiProperty()
  analysis!: string;

  @ApiProperty()
  score!: number;

  @ApiProperty({ type: [String], description: 'wrong_items.kp_ids。没有则为空数组。' })
  kpIds!: string[];

  @ApiPropertyOptional({ type: [String], description: '与 kpIds 对齐的展示名。缺失时为空串。' })
  kpNames?: string[];

  @ApiProperty()
  updatedAt!: string;
}

export class WrongBookListDto implements WrongBookList {
  @ApiProperty({ type: [WrongBookItemDto] })
  items!: WrongBookItemDto[];
}

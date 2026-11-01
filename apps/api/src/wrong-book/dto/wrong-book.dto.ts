import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty()
  updatedAt!: string;
}

export class WrongBookListDto implements WrongBookList {
  @ApiProperty({ type: [WrongBookItemDto] })
  items!: WrongBookItemDto[];
}

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { UserSummary } from '@tishuashua/shared';
import { CurrentUser } from '../common/current-user';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { WrongBookItemDto, WrongBookListDto } from './dto/wrong-book.dto';
import { WrongBookService } from './wrong-book.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('wrong-book')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('wrong-book')
export class WrongBookController {
  constructor(@Inject(WrongBookService) private readonly book: WrongBookService) {}

  @Get()
  @ApiOperation({
    summary: '错题本列表',
    description: '默认只返回未消灭的错题。status 可以是 pending、cleared 或 all。最多 100 条。',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'cleared', 'all'] })
  @ApiOkResponse({ type: WrongBookListDto })
  list(@CurrentUser() user: UserSummary, @Query('status') status?: string) {
    return this.book.list(user.id, status);
  }

  @Get(':id')
  @ApiOperation({
    summary: '错题详情',
    description: '返回题干、选项、正确答案和解析。只能看自己的错题。',
  })
  @ApiOkResponse({ type: WrongBookItemDto })
  getOne(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.book.get(user.id, id);
  }

  @Post(':id/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '消灭错题',
    description: '把错题标为已消灭。已消灭的错题不会再被带入新试卷。重复调用仍返回已消灭。',
  })
  @ApiOkResponse({ type: WrongBookItemDto })
  clear(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.book.clear(user.id, id);
  }
}

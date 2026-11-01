import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JOB_GENERATE_QUIZ, WRONG_QUESTION_RATIO_MAX, type UserSummary } from '@tishuashua/shared';
import { CurrentUser } from '../common/current-user';
import { parseDto } from '../common/parse-dto';
import { SessionAuthGuard } from '../session/session-auth.guard';
import {
  CreateQuizSessionDto,
  QuizAnswerResultDto,
  QuizSessionViewDto,
  SaveQuizAnswerDto,
} from './dto/quiz.dto';
import { QuizService } from './quiz.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('quiz')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('quiz/sessions')
export class QuizSessionController {
  constructor(@Inject(QuizService) private readonly quizzes: QuizService) {}

  @Post()
  @ApiOperation({
    summary: '创建出题任务',
    description: `校验刷题包后写入会话并投递 ${JOB_GENERATE_QUIZ}。未消灭错题入卷不超过 ${WRONG_QUESTION_RATIO_MAX}，其余由模型原创。证书已下架返回 PACK_UNAVAILABLE。未配置模型且未打开 LLM_MOCK 时返回 LLM_NOT_CONFIGURED。`,
  })
  @ApiBody({ type: CreateQuizSessionDto })
  @ApiCreatedResponse({ type: QuizSessionViewDto })
  async create(@CurrentUser() user: UserSummary, @Body() body: unknown) {
    const dto = await parseDto(CreateQuizSessionDto, body);
    return this.quizzes.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: '读出题进度或试卷',
    description: '生成中返回 generated/total。成卷后返回答题所需题目，不含标准答案和解析。',
  })
  @ApiOkResponse({ type: QuizSessionViewDto })
  getOne(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.quizzes.get(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '取消出题',
    description: '仅 pending 或 generating 可取消。已写入的题目会被删除。',
  })
  @ApiOkResponse({ type: QuizSessionViewDto })
  cancel(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.quizzes.cancel(user.id, id);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '进入答题',
    description: '试卷 ready 后变为 in_progress。交卷和判分不在本接口。',
  })
  @ApiOkResponse({ type: QuizSessionViewDto })
  start(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.quizzes.start(user.id, id);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '保存选择',
    description: '只记录选项，不判分、不写入错题本。空数组表示清除选择。',
  })
  @ApiBody({ type: SaveQuizAnswerDto })
  @ApiOkResponse({ type: QuizAnswerResultDto })
  async saveAnswer(
    @CurrentUser() user: UserSummary,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(SaveQuizAnswerDto, body);
    return this.quizzes.saveAnswer(user.id, id, dto.questionId, dto.selected);
  }
}

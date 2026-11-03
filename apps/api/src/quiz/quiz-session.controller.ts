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
import {
  JOB_GENERATE_QUIZ,
  QUIZ_SCORE_LIST_LIMIT,
  WRONG_QUESTION_RATIO_MAX,
  type UserSummary,
} from '@tishuashua/shared';
import { CurrentUser } from '../common/current-user';
import { parseDto } from '../common/parse-dto';
import { SessionAuthGuard } from '../session/session-auth.guard';
import {
  CreateQuizSessionDto,
  QuizAnswerResultDto,
  QuizScoreListDto,
  QuizSessionViewDto,
  SaveQuizAnswerDto,
  SubmitQuizDto,
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

  @Get()
  @ApiOperation({
    summary: '成绩列表',
    description: `只返回当前用户已交卷的成绩摘要，不含题目，按交卷时间从新到旧，最多 ${QUIZ_SCORE_LIST_LIMIT} 条。total 是已交卷总数，hasMore 为 true 时还有更早的记录没出现在 items 里。读取时会先把已到点的考试收卷。`,
  })
  @ApiOkResponse({ type: QuizScoreListDto })
  list(@CurrentUser() user: UserSummary) {
    return this.quizzes.listScores(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: '读出题进度或试卷',
    description:
      '生成中返回 generated/total。未交卷只返回答题所需题目，不含标准答案和解析。已交卷返回成绩、正确答案和解析。考试到点后再读取会先强制收卷。',
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
    description:
      '试卷 ready 后变为 in_progress，并记下 started_at。考试倒计时从这一刻起算。已经交卷时返回成绩。',
  })
  @ApiOkResponse({ type: QuizSessionViewDto })
  start(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.quizzes.start(user.id, id);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '保存选择',
    description: '只记录选项，不判分、不写入错题本。空数组表示清除选择。交卷或考试到点后不能再改。',
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

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '交卷并判分',
    description:
      '练习和考试都可以主动交卷。交卷后不可改答案，并返回成绩、正确答案和解析。重复交卷返回同一成绩。考试到点后记为到时收卷；未到点即使请求写 timeout 也记为主动交卷。答错、少选和未作答写入错题本，完全答对则消灭同一题。',
  })
  @ApiBody({ type: SubmitQuizDto, required: false })
  @ApiOkResponse({ type: QuizSessionViewDto })
  async submit(
    @CurrentUser() user: UserSummary,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(SubmitQuizDto, body);
    return this.quizzes.submit(user.id, id, dto.reason ?? 'manual');
  }
}

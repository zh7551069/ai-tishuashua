import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PACK_KNOWLEDGE_POINT_MAX,
  QUIZ_DIFFICULTIES,
  QUIZ_MODES,
  QUIZ_SESSION_SOURCES,
  QUIZ_SUBMIT_REASONS,
  QUIZ_TYPES,
  type QuizAnswerResult,
  type QuizScoreList,
  type QuizSessionView,
  type QuizSubmitReason,
  type SaveQuizAnswerRequest,
  type SubmitQuizRequest,
} from '@tishuashua/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class QuizTimerDto {
  @ApiProperty()
  @IsBoolean({ message: 'timer.enabled 必须是布尔值' })
  enabled!: boolean;

  @ApiPropertyOptional({ enum: ['paper', 'per_question'] })
  @IsOptional()
  @IsIn(['paper', 'per_question'], { message: '计时方式不正确' })
  kind?: 'paper' | 'per_question';

  @ApiPropertyOptional({ description: '整卷倒计时，单位分钟。默认 30。' })
  @IsOptional()
  @IsInt({ message: '整卷分钟数必须是整数' })
  @Min(1, { message: '整卷倒计时至少 1 分钟' })
  @Max(180, { message: '整卷倒计时最多 180 分钟' })
  paperMinutes?: number;

  @ApiPropertyOptional({ description: '每题限时，单位秒。' })
  @IsOptional()
  @IsInt({ message: '每题秒数必须是整数' })
  @Min(1, { message: '每题限时至少 1 秒' })
  @Max(600, { message: '每题限时最多 600 秒' })
  perQuestionSeconds?: number;
}

export class CreateQuizSessionDto {
  @ApiPropertyOptional({
    description: '普通、复练、变异必填。wrongSet 可省略；若传必须与来源场次 pack_id 一致。',
  })
  @ValidateIf((body: CreateQuizSessionDto) => wrongSetFieldRequired(body, 'packId'))
  @IsUUID('4', { message: 'packId 必须是 UUID' })
  packId?: string | null;

  @ApiPropertyOptional({
    description: '普通出题为 10、20、30 或 50。题型变异必须是 1。wrongSet 可省略，不作出卷依据。',
  })
  @ValidateIf((body: CreateQuizSessionDto) => wrongSetFieldRequired(body, 'count'))
  @IsInt({ message: '题量必须是整数' })
  @Min(1, { message: '题量不正确' })
  @Max(50, { message: '题量不正确' })
  count?: number;

  @ApiPropertyOptional({ enum: QUIZ_DIFFICULTIES })
  @ValidateIf((body: CreateQuizSessionDto) => wrongSetFieldRequired(body, 'difficulty'))
  @IsIn(QUIZ_DIFFICULTIES, { message: '难度不正确' })
  difficulty?: 'easy' | 'medium' | 'hard';

  @ApiPropertyOptional({
    enum: QUIZ_TYPES,
    isArray: true,
    description:
      '至少一种，且属于证书开放题型。variant 可省略，省略时用证书白名单。wrongSet 忽略。',
  })
  @ValidateIf((body: CreateQuizSessionDto) => !isConsistentWrongSet(body))
  @IsOptional()
  @IsArray({ message: 'types 必须是数组' })
  @ArrayUnique({ message: '题型不能重复' })
  @IsIn(QUIZ_TYPES, { each: true, message: '题型不正确' })
  types?: Array<'single' | 'multi' | 'judge'>;

  @ApiPropertyOptional({ type: QuizTimerDto })
  @ValidateIf((body: CreateQuizSessionDto) => wrongSetFieldRequired(body, 'timer'))
  @IsDefined({ message: '请设置计时' })
  @ValidateNested()
  @Type(() => QuizTimerDto)
  timer?: QuizTimerDto;

  @ApiPropertyOptional({ enum: QUIZ_MODES })
  @ValidateIf((body: CreateQuizSessionDto) => wrongSetFieldRequired(body, 'mode'))
  @IsIn(QUIZ_MODES, { message: '模式只能是练习或考试' })
  mode?: 'practice' | 'exam';

  @ApiPropertyOptional({
    enum: QUIZ_SESSION_SOURCES,
    description: '缺省 normal。wrongSet 必须同时带 sourceSessionId，由服务端按来源场次出卷。',
  })
  @IsOptional()
  @IsIn(QUIZ_SESSION_SOURCES, { message: '会话来源不正确' })
  source?: 'normal' | 'retrain_similar' | 'variant' | 'wrongSet';

  @ApiPropertyOptional({
    enum: QUIZ_SESSION_SOURCES,
    description: '历史草案字段。与 source 冲突时 400；未传 source 时映射为 source。',
  })
  @IsOptional()
  @IsIn(QUIZ_SESSION_SOURCES, { message: '会话来源不正确' })
  intent?: 'normal' | 'retrain_similar' | 'variant' | 'wrongSet';

  @ApiPropertyOptional({
    type: [String],
    description: '会话级知识点覆盖。不写回刷题包。variant 与 wrongSet 忽略，不作出卷范围。',
  })
  @ValidateIf((body: CreateQuizSessionDto) => !isConsistentWrongSet(body))
  @IsOptional()
  @IsArray({ message: '知识点不正确' })
  @ArrayMaxSize(PACK_KNOWLEDGE_POINT_MAX, { message: '知识点过多' })
  @IsUUID('4', { each: true, message: '知识点不正确' })
  knowledgePointIds?: string[];

  @ApiPropertyOptional({ description: '仅 source=variant 时必填。wrongSet 传入则 400。' })
  @IsOptional()
  @IsUUID('4', { message: 'wrongItemId 不正确' })
  wrongItemId?: string;

  @ApiPropertyOptional({ description: 'wrongSet 必填。来源已交卷场次的 UUID。' })
  @ValidateIf((body: CreateQuizSessionDto) => isConsistentWrongSet(body))
  @IsUUID('4', { message: '请指定来源场次' })
  sourceSessionId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '忽略。wrongSet 不接受客户端题单作为出卷范围。',
  })
  @IsOptional()
  questionIds?: string[];
}

function isConsistentWrongSet(body: { source?: string; intent?: string }): boolean {
  if (body.source && body.intent && body.source !== body.intent) {
    return false;
  }
  return body.source === 'wrongSet' || (!body.source && body.intent === 'wrongSet');
}

function wrongSetFieldRequired(
  body: CreateQuizSessionDto,
  field: 'packId' | 'count' | 'difficulty' | 'mode' | 'timer',
): boolean {
  if (!isConsistentWrongSet(body)) {
    return true;
  }
  const value = body[field];
  return value !== undefined && value !== null;
}

export class SaveQuizAnswerDto implements SaveQuizAnswerRequest {
  @ApiProperty()
  @IsUUID('4', { message: 'questionId 必须是 UUID' })
  questionId!: string;

  @ApiProperty({ type: [String] })
  @IsArray({ message: 'selected 必须是数组' })
  @ArrayMaxSize(6, { message: '选项过多' })
  @IsString({ each: true, message: '选项不正确' })
  selected!: string[];
}

export class SubmitQuizDto implements SubmitQuizRequest {
  @ApiPropertyOptional({ enum: QUIZ_SUBMIT_REASONS })
  @IsOptional()
  @IsIn(QUIZ_SUBMIT_REASONS, { message: '交卷原因不正确' })
  reason?: QuizSubmitReason;
}

export class QuizScoreListDto implements QuizScoreList {
  @ApiProperty({ type: 'array' })
  items!: QuizScoreList['items'];

  @ApiProperty({ description: '当前用户已交卷会话数，不含 wrongSet，含快照读不出来的记录' })
  total!: number;

  @ApiProperty({ description: '本次最多返回的条数' })
  limit!: number;

  @ApiProperty({ description: '还有更早的已交卷记录没有出现在 items 里' })
  hasMore!: boolean;
}

export class QuizAnswerResultDto implements QuizAnswerResult {
  @ApiProperty()
  questionId!: string;

  @ApiProperty({ type: [String] })
  selected!: string[];
}

export class QuizSessionViewDto implements QuizSessionView {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  packId!: string | null;

  @ApiProperty({ enum: QUIZ_MODES })
  mode!: QuizSessionView['mode'];

  @ApiProperty({ enum: QUIZ_SESSION_SOURCES })
  source!: QuizSessionView['source'];

  @ApiProperty()
  status!: QuizSessionView['status'];

  @ApiProperty()
  progress!: QuizSessionView['progress'];

  @ApiProperty()
  settings!: QuizSessionView['settings'];

  @ApiProperty({ nullable: true })
  error!: QuizSessionView['error'];

  @ApiProperty()
  context!: QuizSessionView['context'];

  @ApiProperty({
    nullable: true,
    description:
      '成卷后返回答题题目。未交卷时题目不含标准答案和解析；交卷后 review 才有答案、解析和得分。',
  })
  paper!: QuizSessionView['paper'];

  @ApiProperty({ nullable: true, description: '未交卷时为 null。' })
  result!: QuizSessionView['result'];

  @ApiProperty({ nullable: true })
  startedAt!: string | null;

  @ApiProperty({ nullable: true, description: '只有考试模式且已开始计时才有截止时间。' })
  deadlineAt!: string | null;
}

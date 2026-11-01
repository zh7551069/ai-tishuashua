import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  QUIZ_COUNTS,
  QUIZ_DIFFICULTIES,
  QUIZ_MODES,
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
  ArrayNotEmpty,
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
  @ApiProperty()
  @IsUUID('4', { message: 'packId 必须是 UUID' })
  packId!: string;

  @ApiProperty({ enum: QUIZ_COUNTS })
  @IsInt({ message: '题量必须是整数' })
  @IsIn(QUIZ_COUNTS, { message: '题量只能是 10、20、30 或 50' })
  count!: 10 | 20 | 30 | 50;

  @ApiProperty({ enum: QUIZ_DIFFICULTIES })
  @IsIn(QUIZ_DIFFICULTIES, { message: '难度不正确' })
  difficulty!: 'easy' | 'medium' | 'hard';

  @ApiProperty({ enum: QUIZ_TYPES, isArray: true })
  @IsArray({ message: 'types 必须是数组' })
  @ArrayNotEmpty({ message: '请至少选择一种题型' })
  @ArrayUnique({ message: '题型不能重复' })
  @IsIn(QUIZ_TYPES, { each: true, message: '题型不正确' })
  types!: Array<'single' | 'multi' | 'judge'>;

  @ApiProperty({ type: QuizTimerDto })
  @IsDefined({ message: '请设置计时' })
  @ValidateNested()
  @Type(() => QuizTimerDto)
  timer!: QuizTimerDto;

  @ApiProperty({ enum: QUIZ_MODES })
  @IsIn(QUIZ_MODES, { message: '模式只能是练习或考试' })
  mode!: 'practice' | 'exam';
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

import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  JOB_GENERATE_QUIZ,
  WRONG_QUESTION_RATIO_MAX,
  scaffoldPlaceholder,
} from '@tishuashua/shared';

@ApiTags('quiz')
@Controller('quiz/sessions')
export class QuizSessionController {
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '创建刷题会话（占位）',
    description: `后续由队列 ${JOB_GENERATE_QUIZ} 按需出题，不是静态题库。错题入卷比例上限 ${WRONG_QUESTION_RATIO_MAX}。`,
  })
  create() {
    return scaffoldPlaceholder('quiz', 'createSession');
  }

  @Get(':id')
  @ApiOperation({ summary: '读取刷题会话（占位）' })
  getOne() {
    return scaffoldPlaceholder('quiz', 'getSession');
  }
}

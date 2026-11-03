import {
  QUIZ_SCORE_LIST_LIMIT,
  type QuizScoreList,
  type QuizScoreSummary,
} from '@tishuashua/shared';

/** 把已交卷摘要和总数收成成绩列表。总数超过上限时 hasMore 为 true。 */
export function toQuizScoreList(items: QuizScoreSummary[], total: number): QuizScoreList {
  return {
    items,
    total,
    limit: QUIZ_SCORE_LIST_LIMIT,
    hasMore: total > QUIZ_SCORE_LIST_LIMIT,
  };
}

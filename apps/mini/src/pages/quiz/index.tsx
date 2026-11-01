import { WRONG_QUESTION_RATIO_MAX } from '@tishuashua/shared';
import { MiniPage } from '../../components/MiniPage';

export default function QuizPage() {
  return (
    <MiniPage
      title="刷题"
      hint={`会话页占位。题目按需生成，错题入卷比例上限 ${WRONG_QUESTION_RATIO_MAX * 100}%。`}
    />
  );
}

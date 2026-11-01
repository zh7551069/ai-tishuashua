import {
  JOB_GENERATE_QUIZ,
  scaffoldPlaceholder,
  type GenerateQuizJobPayload,
} from '@tishuashua/shared';
import type { Job } from 'bullmq';

export async function handleGenerateQuiz(job: Job<GenerateQuizJobPayload>) {
  console.log(`[worker] ${JOB_GENERATE_QUIZ} job=${job.id ?? 'n/a'} session=${job.data.sessionId}`);
  return scaffoldPlaceholder('worker', JOB_GENERATE_QUIZ);
}

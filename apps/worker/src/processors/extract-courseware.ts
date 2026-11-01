import {
  JOB_EXTRACT_COURSEWARE,
  scaffoldPlaceholder,
  type ExtractCoursewareJobPayload,
} from '@tishuashua/shared';
import type { Job } from 'bullmq';

export async function handleExtractCourseware(job: Job<ExtractCoursewareJobPayload>) {
  console.log(
    `[worker] ${JOB_EXTRACT_COURSEWARE} job=${job.id ?? 'n/a'} courseware=${job.data.coursewareId}`,
  );
  return scaffoldPlaceholder('worker', JOB_EXTRACT_COURSEWARE);
}

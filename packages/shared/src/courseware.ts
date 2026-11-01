/** 课件在对象存储中的引用。上传与提炼尚未实现。 */
export interface CoursewareRef {
  id: string;
  objectKey: string;
  byteSize: number;
}

export interface ExtractCoursewareJobPayload {
  coursewareId: string;
  objectKey: string;
}

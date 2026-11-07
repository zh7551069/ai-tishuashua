import type { QuizOption } from './quiz';

/**
 * 题干指纹。入库去重、抽题避复和错题消灭共用。
 * 与历史 wrongItemKey 同构：类型、trim 后的题干、选项原文顺序、排序后的答案。
 */
export function questionContentKey(snapshot: {
  type: string;
  stem: string;
  options: readonly QuizOption[];
  answer: readonly string[];
}): string {
  const options = snapshot.options
    .map((option) => `${option.id}\u0000${option.text}`)
    .join('\u0001');
  const answer = [...snapshot.answer].sort().join('\u0001');
  return `${snapshot.type}\u0002${snapshot.stem.trim()}\u0002${options}\u0002${answer}`;
}

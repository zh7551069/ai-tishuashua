import { ScrollView, Text, View } from '@tarojs/components';
import {
  QUIZ_MODE_LABELS,
  QUIZ_TYPE_LABELS,
  type QuizQuestionView,
  type QuizSessionView,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';

/**
 * 错题回顾视觉对齐 design/bridge-export/wrong-review-20261107。
 * 多选/判断展开稿里，个别选项的正文色和描边跟字牌、底色对调了。
 * 这里按该状态在单选展开帧里自洽的底色、描边、正文色来画，标签色仍用多选帧上对应文案的色。
 * 知识点 chip 只过滤下面的列表。底栏「再练这 N 道」的 N 用来源未过滤错题总数。
 */
export function ReviewView(props: {
  session: QuizSessionView;
  questions: QuizQuestionView[];
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const chips = knowledgeChips(props.questions);
  const [kpId, setKpId] = useState('all');
  useEffect(() => {
    if (kpId !== 'all' && !chips.some((chip) => chip.id === kpId)) {
      setKpId('all');
    }
  }, [chips, kpId]);
  const visible =
    kpId === 'all'
      ? props.questions
      : props.questions.filter((question) => (question.kpIds ?? []).includes(kpId));
  const pack = props.session.context.certName || props.session.context.packName;
  return (
    <View className="wr-stack">
      <View className="wr-pack">
        <Text className="wr-kicker">来自本卷</Text>
        <Text className="wr-pack-line">
          {pack} · {QUIZ_MODE_LABELS[props.session.mode]}模式
        </Text>
      </View>
      <ScrollView scrollX enableFlex showScrollbar={false} className="wr-chips">
        <View className="wr-chips-row">
          <View
            className={kpId === 'all' ? 'wr-chip wr-chip-on' : 'wr-chip'}
            onClick={() => setKpId('all')}
          >
            <Text className={kpId === 'all' ? 'wr-chip-label wr-chip-label-on' : 'wr-chip-label'}>
              全部 {props.questions.length}
            </Text>
          </View>
          {chips.map((chip) => {
            const on = kpId === chip.id;
            return (
              <View
                key={chip.id}
                className={on ? 'wr-chip wr-chip-on' : 'wr-chip'}
                onClick={() => setKpId(chip.id)}
              >
                <Text className={on ? 'wr-chip-label wr-chip-label-on' : 'wr-chip-label'}>
                  {chip.name} {chip.count}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {props.questions.length === 0 ? <Text className="wr-empty">本卷没有错题。</Text> : null}
      {props.questions.length > 0 && visible.length === 0 ? (
        <Text className="wr-empty">这个知识点下没有错题。</Text>
      ) : null}
      <View className="wr-list">
        {visible.map((question) => {
          const opened = Boolean(props.open[question.id]);
          const point = knowledgeLabel(question);
          return (
            <View key={question.id} className={opened ? 'wr-card wr-card-open' : 'wr-card'}>
              <View className="wr-head">
                <View className="wr-badges">
                  <Text className="wr-ordinal">第 {question.ordinal} 题</Text>
                  <Text className={`wr-type wr-type-${question.type}`}>
                    {QUIZ_TYPE_LABELS[question.type]}
                  </Text>
                </View>
                {point ? <Text className="wr-kp">{point}</Text> : null}
              </View>
              <Text className="wr-stem">{question.stem}</Text>
              {opened ? (
                <View className="wr-options">
                  {question.options.map((option) => {
                    const mark = reviewOptionMark(question, option.id);
                    return (
                      <View key={option.id} className={`wr-opt wr-opt-${mark.tone}`}>
                        <View className="wr-letter">
                          <Text className="wr-letter-text">{option.id}</Text>
                        </View>
                        <Text className="wr-opt-text">{option.text}</Text>
                        {mark.label ? <Text className="wr-opt-tag">{mark.label}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View className="wr-compare">
                  <View className="wr-compare-block">
                    <Text className="wr-compare-label wr-mine">你的答案</Text>
                    <Text className="wr-compare-value wr-mine">
                      {answerLine(question, question.selected)}
                    </Text>
                  </View>
                  <View className="wr-compare-block">
                    <Text className="wr-compare-label wr-right">正确答案</Text>
                    <Text className="wr-compare-value wr-right">
                      {answerLine(question, question.review?.answer ?? [])}
                    </Text>
                  </View>
                </View>
              )}
              {opened ? (
                <View className="wr-analysis">
                  <View className="wr-analysis-bar" />
                  <View className="wr-analysis-copy">
                    <Text className="wr-analysis-title">解析</Text>
                    <Text className="wr-analysis-body">
                      {question.review?.analysis || '这道题没有解析。'}
                    </Text>
                  </View>
                </View>
              ) : null}
              <View
                className={opened ? 'wr-toggle wr-toggle-shut' : 'wr-toggle'}
                onClick={() => props.onToggle(question.id)}
              >
                <Text
                  className={opened ? 'wr-toggle-label wr-toggle-label-shut' : 'wr-toggle-label'}
                >
                  {opened ? '收起解析' : '查看解析'}
                </Text>
                <Text className={opened ? 'wr-toggle-chev wr-toggle-chev-shut' : 'wr-toggle-chev'}>
                  {opened ? '⌃' : '›'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function knowledgeChips(
  questions: readonly QuizQuestionView[],
): { id: string; name: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const question of questions) {
    const ids = question.kpIds ?? [];
    const names = question.kpNames ?? [];
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      const name = (names[index] ?? '').trim();
      if (!name || seen.has(id)) {
        return;
      }
      seen.add(id);
      const current = map.get(id);
      if (current) {
        current.count += 1;
      } else {
        map.set(id, { id, name, count: 1 });
      }
    });
  }
  return [...map.values()];
}

function knowledgeLabel(question: QuizQuestionView): string {
  const ids = question.kpIds ?? [];
  const names = question.kpNames ?? [];
  const seen = new Set<string>();
  const labels: string[] = [];
  ids.forEach((id, index) => {
    const name = (names[index] ?? '').trim();
    if (!name || seen.has(id)) {
      return;
    }
    seen.add(id);
    labels.push(name);
  });
  return labels.join(' · ');
}

type ReviewTone =
  'yours' | 'answer' | 'picked' | 'hit' | 'miss' | 'key' | 'judge-yours' | 'judge-key' | 'plain';

/**
 * 展开后的选项标记。
 * 单选：选错标「你的答案」，正确项标「正确答案」。
 * 多选：选对标「正确 · 已选」，选错标「你的答案」；已选中过正确项时，没选到的正确项标「漏选」，否则标「正确答案」。
 * 判断：正确项标「正确答案」；选错的那一项用红底红字母，稿面没有再挂「你的答案」字牌。
 */
function reviewOptionMark(
  question: QuizQuestionView,
  optionId: string,
): { tone: ReviewTone; label: string } {
  const selected = question.selected.includes(optionId);
  const answer = question.review?.answer ?? [];
  const correct = answer.includes(optionId);
  if (question.type === 'judge') {
    if (correct) {
      return { tone: 'judge-key', label: '正确答案' };
    }
    if (selected) {
      return { tone: 'judge-yours', label: '' };
    }
    return { tone: 'plain', label: '' };
  }
  if (question.type === 'multi') {
    if (selected && correct) {
      return { tone: 'hit', label: '正确 · 已选' };
    }
    if (selected && !correct) {
      return { tone: 'picked', label: '你的答案' };
    }
    if (!selected && correct) {
      const anyHit = answer.some((id) => question.selected.includes(id));
      return anyHit ? { tone: 'miss', label: '漏选' } : { tone: 'key', label: '正确答案' };
    }
    return { tone: 'plain', label: '' };
  }
  if (selected && !correct) {
    return { tone: 'yours', label: '你的答案' };
  }
  if (correct) {
    return { tone: 'answer', label: '正确答案' };
  }
  return { tone: 'plain', label: '' };
}

function answerLine(question: QuizQuestionView, ids: string[]): string {
  if (ids.length === 0) {
    return '未作答';
  }
  return ids
    .map((id) => {
      const option = question.options.find((item) => item.id === id);
      if (!option) {
        return id;
      }
      if (question.type === 'judge') {
        return option.text;
      }
      if (question.type === 'multi') {
        return `${id}·${option.text}`;
      }
      return `${id} · ${option.text}`;
    })
    .join('  ');
}

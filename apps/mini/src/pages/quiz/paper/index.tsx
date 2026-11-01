import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  QUIZ_MODE_LABELS,
  QUIZ_TYPE_LABELS,
  type QuizQuestionView,
  type QuizSessionView,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { MiniPage } from '../../../components/MiniPage';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { fetchQuizSession, saveQuizAnswer, startQuizSession } from '../../../services/quiz-api';

export default function QuizPaperPage() {
  const sessionId = queryValue(useRouter().params.sessionId);
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [error, setError] = useState('');
  const [leftSeconds, setLeftSeconds] = useState<number | null>(null);

  const load = async () => {
    if (!sessionId) {
      setError('缺少试卷');
      return;
    }
    setError('');
    try {
      const loaded = await withAuth(async (token) => {
        const current = await fetchQuizSession(token, sessionId);
        if (current.status === 'ready' || current.status === 'in_progress') {
          return startQuizSession(token, sessionId);
        }
        return current;
      });
      if (!loaded) {
        return;
      }
      setSession(loaded);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '试卷加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  useEffect(() => {
    const timer = session?.settings.timer;
    if (!timer || !timer.enabled || timer.kind !== 'paper') {
      setLeftSeconds(null);
      return;
    }
    setLeftSeconds(timer.paperMinutes * 60);
    const handle = setInterval(() => {
      setLeftSeconds((value) => (value === null ? value : Math.max(0, value - 1)));
    }, 1000);
    return () => clearInterval(handle);
  }, [session?.id, session?.settings.timer]);

  const choose = async (question: QuizQuestionView, optionId: string) => {
    if (!session) {
      return;
    }
    const next =
      question.type === 'multi'
        ? question.selected.includes(optionId)
          ? question.selected.filter((id) => id !== optionId)
          : [...question.selected, optionId]
        : question.selected[0] === optionId
          ? []
          : [optionId];
    setSession(replaceSelection(session, question.id, next));
    try {
      await withAuth((token) =>
        saveQuizAnswer(token, session.id, { questionId: question.id, selected: next }),
      );
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : '保存失败',
        icon: 'none',
      });
    }
  };

  const paper = session?.paper;
  const timer = session?.settings.timer;
  return (
    <MiniPage
      title={session ? `${QUIZ_MODE_LABELS[session.mode]}答题` : '答题'}
      hint="可以选择答案。交卷、判分和错题收录还没开放，到时也不会自动交卷。"
    >
      {error ? <Text className="error">{error}</Text> : null}
      {!session && !error ? <Text className="hint">正在加载试卷。</Text> : null}
      {session && !paper ? <Text className="error">试卷还没准备好。</Text> : null}
      {session && paper ? (
        <View>
          <View className="card">
            <Text className="tree-name">
              {session.context.certName || session.context.packName}
            </Text>
            <Text className="meta">
              {paper.questions.length} 题 · 总分 {paper.totalScore}
            </Text>
            {timer?.enabled && timer.kind === 'paper' ? (
              <Text className={leftSeconds === 0 ? 'error' : 'meta'}>
                {leftSeconds === 0
                  ? '时间到。本题仍可继续选择。'
                  : `整卷剩余 ${formatClock(leftSeconds ?? 0)}`}
              </Text>
            ) : null}
            {timer?.enabled && timer.kind === 'per_question' ? (
              <Text className="meta">
                每题限时 {timer.perQuestionSeconds} 秒。限时强制交卷尚未开放。
              </Text>
            ) : null}
            {!timer?.enabled ? <Text className="meta">不限时</Text> : null}
          </View>
          {paper.questions.map((question) => (
            <View key={question.id} className="card">
              <Text className="meta">
                {question.ordinal}. {QUIZ_TYPE_LABELS[question.type]} · {question.score} 分
                {question.source === 'wrong_carry' ? ' · 错题' : ''}
              </Text>
              <Text className="tree-name">{question.stem}</Text>
              {question.options.map((option) => {
                const selected = question.selected.includes(option.id);
                return (
                  <View
                    key={option.id}
                    className={selected ? 'option option-on' : 'option'}
                    onClick={() => void choose(question, option.id)}
                  >
                    <Text className={selected ? 'option-text option-text-on' : 'option-text'}>
                      {option.id}. {option.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
          <Button className="ghost" onClick={() => void Taro.navigateBack()}>
            返回
          </Button>
        </View>
      ) : null}
      {error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
    </MiniPage>
  );
}

function replaceSelection(
  session: QuizSessionView,
  questionId: string,
  selected: string[],
): QuizSessionView {
  if (!session.paper) {
    return session;
  }
  return {
    ...session,
    paper: {
      ...session.paper,
      questions: session.paper.questions.map((question) =>
        question.id === questionId ? { ...question, selected } : question,
      ),
    },
  };
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

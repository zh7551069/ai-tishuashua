import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  DEFAULT_PAPER_MINUTES,
  DEFAULT_PER_QUESTION_SECONDS,
  DEFAULT_QUIZ_COUNT,
  DEFAULT_QUIZ_DIFFICULTY,
  DEFAULT_QUIZ_MODE,
  QUIZ_COUNTS,
  QUIZ_DIFFICULTIES,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_MODES,
  QUIZ_MODE_LABELS,
  QUIZ_TYPES,
  QUIZ_TYPE_LABELS,
  type PackView,
  type QuizCount,
  type QuizDifficulty,
  type QuizMode,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { useState } from 'react';
import { PackContextCard } from '../../components/PackContextCard';
import { MiniPage } from '../../components/MiniPage';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchPack } from '../../services/pack-api';
import { queryValue } from '../../services/query';
import { createQuizSession } from '../../services/quiz-api';

const KNOWN_TYPES = new Set<string>(QUIZ_TYPES);

export default function QuizSettingsPage() {
  const packId = queryValue(useRouter().params.packId);
  const [pack, setPack] = useState<PackView | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState<QuizCount>(DEFAULT_QUIZ_COUNT);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>(DEFAULT_QUIZ_DIFFICULTY);
  const [types, setTypes] = useState<QuizTypeCode[]>([]);
  const [typesTouched, setTypesTouched] = useState(false);
  const [timerOn, setTimerOn] = useState(false);
  const [timerKind, setTimerKind] = useState<'paper' | 'per_question'>('paper');
  const [paperMinutes, setPaperMinutes] = useState(DEFAULT_PAPER_MINUTES);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(DEFAULT_PER_QUESTION_SECONDS);
  const [mode, setMode] = useState<QuizMode>(DEFAULT_QUIZ_MODE);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!packId) {
      setError('缺少刷题包');
      setReady(true);
      return;
    }
    setError('');
    try {
      const data = await withAuth((token) => fetchPack(token, packId));
      if (!data) {
        return;
      }
      setPack(data);
      if (!typesTouched) {
        setTypes(
          data.enabledQuestionTypeCodes.filter((code): code is QuizTypeCode =>
            KNOWN_TYPES.has(code),
          ),
        );
      }
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  const secondsInvalid =
    timerOn &&
    timerKind === 'per_question' &&
    (!Number.isInteger(perQuestionSeconds) || perQuestionSeconds < 1 || perQuestionSeconds > 600);
  const typeMissing = types.length === 0;
  const blocked = !pack || pack.unavailable || typeMissing || secondsInvalid || busy;

  const toggleType = (type: QuizTypeCode) => {
    setTypesTouched(true);
    setTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  };

  const start = async () => {
    if (!pack || blocked) {
      return;
    }
    setBusy(true);
    try {
      const created = await withAuth((token) =>
        createQuizSession(token, {
          packId: pack.id,
          count,
          difficulty,
          types,
          mode,
          timer: !timerOn
            ? { enabled: false }
            : timerKind === 'per_question'
              ? { enabled: true, kind: 'per_question', perQuestionSeconds }
              : { enabled: true, kind: 'paper', paperMinutes },
        }),
      );
      if (!created) {
        return;
      }
      await Taro.navigateTo({ url: `/pages/quiz/progress/index?sessionId=${created.id}` });
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      await Taro.showToast({
        title: caught instanceof Error ? caught.message : '出题失败',
        icon: 'none',
      });
    } finally {
      setBusy(false);
    }
  };

  const enabledTypes = (pack?.enabledQuestionTypeCodes ?? []).filter((code): code is QuizTypeCode =>
    KNOWN_TYPES.has(code),
  );

  return (
    <MiniPage title="出题设置" hint="确认题量、难度和题型后，AI 会按当前刷题包出一份新卷。">
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在加载刷题包。</Text> : null}
      {pack ? <PackContextCard pack={pack} /> : null}
      {pack && !pack.unavailable ? (
        <View>
          <Text className="label">题量</Text>
          <View className="chips">
            {QUIZ_COUNTS.map((item) => (
              <Text
                key={item}
                className={item === count ? 'chip chip-on' : 'chip'}
                onClick={() => setCount(item)}
              >
                {item}
              </Text>
            ))}
          </View>
          <Text className="label">难度</Text>
          <View className="chips">
            {QUIZ_DIFFICULTIES.map((item) => (
              <Text
                key={item}
                className={item === difficulty ? 'chip chip-on' : 'chip'}
                onClick={() => setDifficulty(item)}
              >
                {QUIZ_DIFFICULTY_LABELS[item]}
              </Text>
            ))}
          </View>
          <Text className="label">题型</Text>
          <View className="chips">
            {enabledTypes.map((item) => (
              <Text
                key={item}
                className={types.includes(item) ? 'chip chip-on' : 'chip'}
                onClick={() => toggleType(item)}
              >
                {QUIZ_TYPE_LABELS[item]}
              </Text>
            ))}
          </View>
          {typeMissing ? <Text className="error">请至少选择一种题型</Text> : null}
          <Text className="label">计时</Text>
          <View className="chips">
            <Text className={timerOn ? 'chip' : 'chip chip-on'} onClick={() => setTimerOn(false)}>
              关
            </Text>
            <Text className={timerOn ? 'chip chip-on' : 'chip'} onClick={() => setTimerOn(true)}>
              开
            </Text>
          </View>
          {timerOn ? (
            <View>
              <View className="chips">
                <Text
                  className={timerKind === 'paper' ? 'chip chip-on' : 'chip'}
                  onClick={() => setTimerKind('paper')}
                >
                  整卷倒计时
                </Text>
                <Text
                  className={timerKind === 'per_question' ? 'chip chip-on' : 'chip'}
                  onClick={() => setTimerKind('per_question')}
                >
                  每题限时
                </Text>
              </View>
              {timerKind === 'paper' ? (
                <View className="chips">
                  {[15, 30, 45, 60].map((minutes) => (
                    <Text
                      key={minutes}
                      className={paperMinutes === minutes ? 'chip chip-on' : 'chip'}
                      onClick={() => setPaperMinutes(minutes)}
                    >
                      {minutes} 分钟
                    </Text>
                  ))}
                </View>
              ) : (
                <View>
                  <Text className="meta">每题限时（秒）</Text>
                  <Input
                    className="field"
                    type="number"
                    value={String(perQuestionSeconds)}
                    onInput={(event) => setPerQuestionSeconds(Number(event.detail.value))}
                  />
                  {secondsInvalid ? <Text className="error">每题限时须为 1 到 600 秒</Text> : null}
                </View>
              )}
            </View>
          ) : (
            <Text className="meta">关闭后不限时</Text>
          )}
          <Text className="label">模式</Text>
          <View className="chips">
            {QUIZ_MODES.map((item) => (
              <Text
                key={item}
                className={item === mode ? 'chip chip-on' : 'chip'}
                onClick={() => setMode(item)}
              >
                {QUIZ_MODE_LABELS[item]}
              </Text>
            ))}
          </View>
          <Button className="primary" disabled={blocked} onClick={() => void start()}>
            AI 开始出题
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

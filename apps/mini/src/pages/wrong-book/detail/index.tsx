import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, type WrongBookItem } from '@tishuashua/shared';
import { useState } from 'react';
import { Screen } from '../../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { formatSubmittedAt } from '../../../services/format';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { clearWrongItem, fetchWrongItem } from '../../../services/wrong-book-api';

export default function WrongBookDetailPage() {
  const itemId = queryValue(useRouter().params.id);
  const [item, setItem] = useState<WrongBookItem | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!itemId) {
      setError('缺少错题');
      return;
    }
    setError('');
    try {
      const data = await withAuth((token) => fetchWrongItem(token, itemId));
      if (!data) {
        return;
      }
      setItem(data);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '错题加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  const clear = async () => {
    if (!itemId || busy) {
      return;
    }
    setBusy(true);
    try {
      const data = await withAuth((token) => clearWrongItem(token, itemId));
      if (data) {
        setItem(data);
        await Taro.showToast({ title: '已消灭', icon: 'success' });
      }
    } catch (caught) {
      if (!isAuthFailure(caught)) {
        await Taro.showToast({
          title: caught instanceof Error ? caught.message : '消灭失败',
          icon: 'none',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const pending = item?.status === 'pending';

  return (
    <Screen
      back
      centerTitle
      title="错题详情"
      right={
        item ? (
          <Text className={pending ? 'u-tag u-tag-orange' : 'u-tag u-tag-green'}>
            {pending ? '未消灭' : '已消灭'}
          </Text>
        ) : null
      }
      footer={
        pending ? (
          <Button className="u-btn" disabled={busy} loading={busy} onClick={() => void clear()}>
            标记已消灭
          </Button>
        ) : null
      }
    >
      <View className="u-pad">
        {!item && !error ? <LoadingBlock label="正在加载错题" /> : null}
        {error ? <ErrorBlock detail={error} onRetry={() => void load()} onBack={() => void Taro.navigateBack()} /> : null}
        {item ? (
          <View>
            <Text className="u-note">
              {item.certName} · {formatSubmittedAt(item.updatedAt)}
            </Text>
            <View className="u-chips" style={{ marginTop: '15px' }}>
              <Text className={typeClass(item.type)}>{item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'}</Text>
              <Text className="u-tag u-tag-red">错过 {item.wrongCount} 次</Text>
            </View>
            <Text className="u-stem">{item.stem}</Text>
            {item.options.map((option) => {
              const right = item.answer.includes(option.id);
              return (
                <View key={option.id} className={right ? 'u-option u-option-right' : 'u-option'}>
                  <Text className={right ? 'u-letter u-letter-right' : 'u-letter'}>{option.id}</Text>
                  <View className="u-card-copy">
                    <Text className="u-option-text" style={{ color: right ? '#16a34a' : '#111827' }}>
                      {option.text}
                    </Text>
                    {right ? <Text className="u-note u-right">正确答案</Text> : null}
                  </View>
                </View>
              );
            })}
            <View className="u-analysis">
              <View className="u-analysis-bar" />
              <View className="u-analysis-copy">
                <Text className="u-analysis-title">解析</Text>
                <Text className="u-analysis-body">{item.analysis || '这道题没有解析。'}</Text>
              </View>
            </View>
            {!pending ? <Text className="u-meta">这道题已经消灭。</Text> : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function typeClass(type: WrongBookItem['type']): string {
  if (type === 'multi') {
    return 'u-tag u-tag-violet';
  }
  if (type === 'judge') {
    return 'u-tag u-tag-orange';
  }
  return 'u-tag u-tag-blue';
}

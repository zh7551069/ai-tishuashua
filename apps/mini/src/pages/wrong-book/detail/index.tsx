import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { QUIZ_TYPE_LABELS, WRONG_ITEM_STATUS_LABELS, type WrongBookItem } from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../../components/MiniPage';
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

  return (
    <MiniPage
      title="错题详情"
      hint="这里有正确答案和解析。消灭后，这道题不会再占用新试卷的错题名额。"
    >
      {error ? <Text className="error">{error}</Text> : null}
      {!item && !error ? <Text className="hint">正在加载错题。</Text> : null}
      {item ? (
        <View>
          <View className="card">
            <Text className="meta">
              {item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'} · {item.certName}
            </Text>
            <Text className="meta">
              {WRONG_ITEM_STATUS_LABELS[item.status]} · 错过 {item.wrongCount} 次
            </Text>
            <Text className="tree-name">{item.stem}</Text>
            {item.options.map((option) => {
              const right = item.answer.includes(option.id);
              return (
                <View key={option.id} className={right ? 'option option-right' : 'option'}>
                  <Text className="option-text">
                    {option.id}. {option.text}
                    {right ? ' · 正确答案' : ''}
                  </Text>
                </View>
              );
            })}
            <Text className="analysis">{item.analysis || '这道题没有解析。'}</Text>
          </View>
          {item.status === 'pending' ? (
            <Button className="primary" disabled={busy} onClick={() => void clear()}>
              标记已消灭
            </Button>
          ) : (
            <Text className="meta">这道题已经消灭。</Text>
          )}
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

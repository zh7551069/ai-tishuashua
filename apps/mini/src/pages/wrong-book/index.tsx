import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  QUIZ_TYPE_LABELS,
  WRONG_ITEM_STATUS_LABELS,
  type WrongBookItem,
  type WrongItemStatus,
} from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchWrongBook } from '../../services/wrong-book-api';

const FILTERS: { id: WrongItemStatus | 'all'; label: string }[] = [
  { id: 'pending', label: '未消灭' },
  { id: 'cleared', label: '已消灭' },
  { id: 'all', label: '全部' },
];

export default function WrongBookPage() {
  const [filter, setFilter] = useState<WrongItemStatus | 'all'>('pending');
  const [items, setItems] = useState<WrongBookItem[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async (next = filter) => {
    setError('');
    try {
      const data = await withAuth((token) => fetchWrongBook(token, next));
      if (!data) {
        return;
      }
      setItems(data.items);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setError(caught instanceof Error ? caught.message : '错题加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  return (
    <MiniPage
      title="错题本"
      hint="交卷后答错、少选和未作答的题会出现在这里。已消灭的题不会再被带入新试卷。"
    >
      <View className="chips">
        {FILTERS.map((item) => (
          <Text
            key={item.id}
            className={item.id === filter ? 'chip chip-on' : 'chip'}
            onClick={() => {
              setFilter(item.id);
              void load(item.id);
            }}
          >
            {item.label}
          </Text>
        ))}
      </View>
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在加载错题。</Text> : null}
      {ready && items.length === 0 ? <Text className="meta">这一栏还没有错题。</Text> : null}
      {items.map((item) => (
        <View
          key={item.id}
          className="card"
          onClick={() =>
            void Taro.navigateTo({ url: `/pages/wrong-book/detail/index?id=${item.id}` })
          }
        >
          <Text className="meta">
            {item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'} · {item.certName} ·{' '}
            {WRONG_ITEM_STATUS_LABELS[item.status]} · 错过 {item.wrongCount} 次
          </Text>
          <Text className="tree-name">{item.stem}</Text>
        </View>
      ))}
      {error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
    </MiniPage>
  );
}

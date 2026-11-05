import { Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  QUIZ_TYPE_LABELS,
  type WrongBookItem,
  type WrongItemStatus,
} from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../components/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { formatSubmittedAt } from '../../services/format';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchWrongBook } from '../../services/wrong-book-api';

export default function WrongBookPage() {
  const [filter, setFilter] = useState<WrongItemStatus | 'all'>('pending');
  const [items, setItems] = useState<WrongBookItem[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    setError('');
    try {
      const data = await withAuth((token) => fetchWrongBook(token, 'all'));
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

  const pending = items.filter((item) => item.status === 'pending').length;
  const cleared = items.filter((item) => item.status === 'cleared').length;
  const visible = useMemo(() => {
    const keyword = query.trim();
    return items.filter((item) => {
      if (filter !== 'all' && item.status !== filter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return item.stem.includes(keyword) || item.certName.includes(keyword);
    });
  }, [filter, items, query]);

  return (
    <Screen
      back
      centerTitle
      title="错题本"
      right={
        <Text className="u-link" onClick={() => setSearching((value) => !value)}>
          ⌕
        </Text>
      }
    >
      <View className="u-pad">
        {searching ? (
          <View className="u-search" style={{ marginBottom: '12px' }}>
            <Text className="u-search-mark">⌕</Text>
            <Input
              className="u-search-input"
              placeholder="搜索错题"
              placeholderStyle="color:#9ca3af"
              value={query}
              onInput={(event) => setQuery(event.detail.value)}
            />
          </View>
        ) : null}
        {!ready && !error ? <LoadingBlock skeleton /> : null}
        {error ? (
          <ErrorBlock detail={error} onRetry={() => void load()} onBack={() => void Taro.navigateBack()} />
        ) : null}
        {ready ? (
          <View className="u-summary">
            <View className="u-card-copy">
              <Text className="u-note">累计错题</Text>
              <Text className="u-count">
                {items.length}
                <Text className="u-note"> 道</Text>
              </Text>
            </View>
            <View className="u-summary-split" />
            <View className="u-card-copy">
              <Text className="u-note">已消灭</Text>
              <Text className="u-count-ok">
                {cleared}
                <Text className="u-note"> / {items.length}</Text>
              </Text>
              <View className="u-bar u-bar-thin">
                <View
                  className="u-bar-fill"
                  style={{
                    width: items.length ? `${Math.round((cleared / items.length) * 100)}%` : '0%',
                    background: '#059669',
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}
        {ready ? (
          <View className="u-pills" style={{ marginTop: '12px' }}>
            <Text className={filter === 'pending' ? 'u-filter u-filter-on' : 'u-filter'} onClick={() => setFilter('pending')}>
              待消灭 {pending}
            </Text>
            <Text className={filter === 'cleared' ? 'u-filter u-filter-on' : 'u-filter'} onClick={() => setFilter('cleared')}>
              已消灭 {cleared}
            </Text>
            <Text className={filter === 'all' ? 'u-filter u-filter-on' : 'u-filter'} onClick={() => setFilter('all')}>
              全部 {items.length}
            </Text>
          </View>
        ) : null}
        {ready ? (
          <View className="u-tip">错题将会随机出现在练习试卷中，答对即可标注为“已消灭”</View>
        ) : null}
        {ready && visible.length === 0 ? (
          <EmptyBlock title="这一栏还没有错题" detail="交卷后答错、少选和未作答的题会出现在这里。" />
        ) : null}
        {visible.map((item) => (
          <View
            key={item.id}
            className="u-panel u-wrong-card"
            onClick={() => void Taro.navigateTo({ url: `/pages/wrong-book/detail/index?id=${item.id}` })}
          >
            <View className="u-q-head">
              <View className="u-chips">
                <Text className="u-tag u-tag-blue">{item.type ? QUIZ_TYPE_LABELS[item.type] : '题目'}</Text>
                <Text className="u-tag u-tag-red">错 {item.wrongCount} 次</Text>
              </View>
              <Text className={item.status === 'cleared' ? 'u-tag u-tag-green' : 'u-tag u-tag-orange'}>
                {item.status === 'cleared' ? '已消灭' : '待消灭'}
              </Text>
            </View>
            <Text className="u-item-title">{item.stem}</Text>
            <View className="u-q-head u-item-meta">
              <Text className="u-note">{item.certName}</Text>
              <Text className="u-note">
                {formatSubmittedAt(item.updatedAt)} ›
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

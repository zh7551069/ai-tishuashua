import { Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { DomainSummary } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { Steps } from '../../../components/Steps';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchDomains } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';

export default function DomainPage() {
  const [items, setItems] = useState<DomainSummary[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    setError('');
    try {
      const data = await withAuth((token) => fetchDomains(token));
      if (!data) {
        return;
      }
      setItems(data.items);
      setReady(true);
    } catch (caught) {
      setReady(false);
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  const visible = useMemo(() => {
    const keyword = query.trim();
    if (!keyword) {
      return items;
    }
    return items.filter((item) => item.name.includes(keyword));
  }, [items, query]);

  return (
    <Screen back title="选择备考领域" subtitle="选领域 → 证书 → 知识点">
      <Steps current={1} />
      <View className="u-pad">
        <View className="u-search">
          <Text className="u-search-mark">⌕</Text>
          <Input
            className="u-search-input"
            placeholder="搜索领域"
            placeholderStyle="color:#9ca3af"
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
        {!ready && !error ? <LoadingBlock skeleton label="正在加载领域" /> : null}
        {error ? <ErrorBlock detail={error} onRetry={() => void load()} onBack={() => void Taro.navigateBack()} /> : null}
        {ready && visible.length === 0 ? (
          <EmptyBlock
            title="暂无领域"
            detail={query ? '换个关键词搜索' : '稍后再试，或换个关键词搜索'}
            action="重试"
            onAction={() => void load()}
          />
        ) : null}
        {ready && visible.length > 0 ? <Text className="u-section">选择备考领域</Text> : null}
        {visible.map((item) => (
          <View
            key={item.id}
            className="u-card"
            onClick={() => {
              void Taro.navigateTo({ url: `/pages/pack/certificate/index?domainId=${item.id}` });
            }}
          >
            <View className="u-mark">
              <Text className="u-mark-text">{item.name.slice(0, 1)}</Text>
            </View>
            <View className="u-card-copy">
              <Text className="u-card-title">{item.name}</Text>
            </View>
            <Text className="u-chev">›</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

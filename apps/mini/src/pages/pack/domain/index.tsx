import { Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { DomainSummary } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { Steps } from '../../../components/Steps';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchCertificates, fetchDomains } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';
import { domainBlurb, domainIcon, type DomainIcon } from '../../../ui/catalog-present';

export default function DomainPage() {
  const [items, setItems] = useState<DomainSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    setError('');
    try {
      const data = await withAuth(async (token) => {
        const domains = await fetchDomains(token);
        const listed = await Promise.all(
          domains.items.map(async (item) => {
            try {
              const certs = await fetchCertificates(token, item.id);
              return [item.id, certs.items.length] as const;
            } catch {
              return [item.id, null] as const;
            }
          }),
        );
        return { domains, listed };
      });
      if (!data) {
        return;
      }
      setItems(data.domains.items);
      const next: Record<string, number> = {};
      for (const [id, count] of data.listed) {
        if (count !== null) {
          next[id] = count;
        }
      }
      setCounts(next);
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

  const emptyShell = ready && items.length === 0;
  const titled = emptyShell || Boolean(error);
  const body = (
    <View className={emptyShell ? 'u-pad u-pad-pick u-pad-fill' : 'u-pad u-pad-pick'}>
      {error ? null : (
        <View className="u-search">
          <Text className="u-search-mark">⌕</Text>
          <Input
            className="u-search-input"
            placeholder={emptyShell ? '搜索' : '搜索领域'}
            placeholderStyle="color:#9ca3af"
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
      )}
      {!ready && !error ? <LoadingBlock skeleton label="正在加载领域" /> : null}
      {error ? <ErrorBlock detail={error} onRetry={() => void load()} /> : null}
      {ready && visible.length === 0 ? (
        <EmptyBlock
          fill={emptyShell}
          title="暂无领域"
          detail={query ? '换个关键词搜索' : '稍后再试，或换个关键词搜索'}
          action={query ? '清除搜索' : '重试'}
          onAction={() => (query ? setQuery('') : void load())}
        />
      ) : null}
      {ready && visible.length > 0 ? (
        <Text className="u-section u-section-first">选择备考领域</Text>
      ) : null}
      {ready && !error
        ? visible.map((item) => (
            <View
              key={item.id}
              className="u-pick"
              onClick={() => {
                void Taro.navigateTo({ url: `/pages/pack/certificate/index?domainId=${item.id}` });
              }}
            >
              <DomainMark name={item.name} code={item.code} />
              <View className="u-card-copy">
                <Text className="u-card-title">{item.name}</Text>
                <Text className="u-card-sub">{domainBlurb(item)}</Text>
                {counts[item.id] === undefined ? null : (
                  <Text className="u-count-link">{counts[item.id]} 个证书</Text>
                )}
              </View>
              <Text className="u-chev">›</Text>
            </View>
          ))
        : null}
    </View>
  );

  if (titled) {
    return (
      <Screen
        back
        title="选择备考领域"
        subtitle="选领域 → 证书 → 知识点"
        subtitleTone="muted"
        titleSize="page"
        bodyFill={emptyShell}
      >
        {body}
      </Screen>
    );
  }

  return (
    <Screen bare>
      <View className="u-greet u-greet-domain">
        <View className="u-greet-copy">
          <Text className="u-greet-title u-greet-title-domain">你好，备考人</Text>
          <Text className="u-crumb">选领域 → 证书 → 知识点</Text>
        </View>
        <View
          className="u-me"
          onClick={() => void Taro.navigateTo({ url: '/pages/settings/index' })}
        >
          <Text className="u-me-text">我</Text>
        </View>
      </View>
      <Steps current={1} />
      {body}
    </Screen>
  );
}

function DomainMark(props: { name: string; code: string }) {
  const kind: DomainIcon = domainIcon(props);
  return (
    <View className="u-mark">
      {kind === 'ai' ? (
        <View className="u-ico-chip">
          <View className="u-ico-chip-core" />
        </View>
      ) : null}
      {kind === 'edu' ? (
        <View className="u-ico-cap">
          <View className="u-ico-cap-top" />
          <View className="u-ico-cap-board" />
          <View className="u-ico-cap-stem" />
        </View>
      ) : null}
      {kind === 'money' ? <Text className="u-mark-text">¥</Text> : null}
      {kind === 'plain' ? <Text className="u-mark-text">{props.name.slice(0, 1)}</Text> : null}
    </View>
  );
}

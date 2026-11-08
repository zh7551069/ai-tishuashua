import { Image, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { DomainSummary } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { Steps } from '../../../components/Steps';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchCertificates, fetchDomains } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';
import { domainBlurb, domainIcon, type DomainIcon } from '../../../ui/catalog-present';
import iconAi from './assets/icon-ai.png';
import iconChevron from './assets/icon-chevron.png';
import iconEdu from './assets/icon-edu.png';
import iconMoney from './assets/icon-money.png';
import iconPlain from './assets/icon-plain.png';
import iconSearch from './assets/icon-search.png';

const DOMAIN_ICONS: Record<DomainIcon, string> = {
  ai: iconAi,
  edu: iconEdu,
  money: iconMoney,
  plain: iconPlain,
};

function readInset(): number {
  try {
    // 行内 px 不经 postcss。状态栏高度已是设备 px。
    return Taro.getSystemInfoSync().statusBarHeight ?? 0;
  } catch {
    return 0;
  }
}

export default function DomainPage() {
  const [inset] = useState(readInset);
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
  const search = (
    <DomainSearch
      placeholder={emptyShell ? '搜索' : '搜索领域'}
      value={query}
      onChange={setQuery}
    />
  );

  if (titled) {
    return (
      <Screen
        back
        centerTitle
        title="选择备考领域"
        subtitle="选领域 → 证书 → 知识点"
        subtitleTone="muted"
        titleSize="page"
        bodyFill={emptyShell}
      >
        <View className={emptyShell ? 'u-pad u-pad-pick u-pad-fill' : 'u-pad u-pad-pick'}>
          {error ? null : search}
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
        </View>
      </Screen>
    );
  }

  return (
    <Screen bare background="#f5f6f8" bodyFill>
      <View className="domain-sheet">
        <View
          className="domain-head"
          style={{ marginTop: `-${inset}px`, paddingTop: `${inset}px` }}
        >
          <View className="domain-header">
            <View className="domain-title-row">
              <Text className="domain-hello">你好，备考人</Text>
            </View>
            <Text className="domain-crumb">选领域 → 证书 → 知识点</Text>
          </View>
          <Steps className="domain-steps" current={1} />
          <View className="domain-search">{search}</View>
        </View>
        <View className="domain-list">
          {!ready && !error ? <LoadingBlock skeleton label="正在加载领域" /> : null}
          {ready && visible.length === 0 ? (
            <EmptyBlock
              title="暂无领域"
              detail={query ? '换个关键词搜索' : '稍后再试，或换个关键词搜索'}
              action={query ? '清除搜索' : '重试'}
              onAction={() => (query ? setQuery('') : void load())}
            />
          ) : null}
          {ready && visible.length > 0 ? (
            <Text className="domain-section">选择备考领域</Text>
          ) : null}
          {ready
            ? visible.map((item) => (
                <View
                  key={item.id}
                  className="domain-card"
                  onClick={() => {
                    void Taro.navigateTo({
                      url: `/pages/pack/certificate/index?domainId=${item.id}`,
                    });
                  }}
                >
                  <DomainMark name={item.name} code={item.code} />
                  <View className="domain-card-body">
                    <Text className="domain-card-title">{item.name}</Text>
                    <Text className="domain-card-sub">{domainBlurb(item)}</Text>
                    {counts[item.id] === undefined ? null : (
                      <Text className="domain-card-count">{counts[item.id]} 个证书</Text>
                    )}
                  </View>
                  <Image className="domain-chev" src={iconChevron} mode="aspectFit" />
                </View>
              ))
            : null}
        </View>
      </View>
    </Screen>
  );
}

function DomainSearch(props: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="u-search">
      <Image className="domain-search-ico" src={iconSearch} mode="aspectFit" />
      <Input
        className="u-search-input"
        placeholder={props.placeholder}
        placeholderStyle="color:#9ca3af"
        value={props.value}
        onInput={(event) => props.onChange(event.detail.value)}
      />
    </View>
  );
}

function DomainMark(props: { name: string; code: string }) {
  const kind: DomainIcon = domainIcon(props);
  return (
    <View className="domain-mark">
      <Image className="domain-ico" src={DOMAIN_ICONS[kind]} mode="aspectFit" />
    </View>
  );
}

import { Image, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import type { CertificateSummary } from '@tishuashua/shared';
import { useMemo, useState } from 'react';
import { Screen } from '../../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchCertificates, fetchDomains, fetchKnowledgeTree } from '../../../services/catalog-api';
import { withAuth } from '../../../services/guard';
import { queryValue } from '../../../services/query';
import { countKnowledgePoints } from '../../../ui/knowledge-meta';
import iconChevron from '../assets/icon-chevron.png';
import emptyShelf from '../assets/empty-shelf.png';
import iconSearch from '../assets/icon-search.png';
import { FlowSteps, SelectEmpty, goBackToHome } from '../flow';
import { PackSearch } from '../PackSearch';
import { PackTopBar } from '../PackTopBar';
import '../flow.css';
import './index.css';

function readInset(): number {
  try {
    return Taro.getSystemInfoSync().statusBarHeight ?? 0;
  } catch {
    return 0;
  }
}

export default function CertificatePage() {
  const domainId = queryValue(useRouter().params.domainId);
  const [inset] = useState(readInset);
  const [items, setItems] = useState<CertificateSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [domainName, setDomainName] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async () => {
    if (!domainId) {
      setError('缺少领域');
      setReady(false);
      return;
    }
    setError('');
    try {
      const data = await withAuth(async (token) => {
        const [certs, domains] = await Promise.all([
          fetchCertificates(token, domainId),
          fetchDomains(token),
        ]);
        const listed = await Promise.all(
          certs.items.map(async (item) => {
            try {
              const tree = await fetchKnowledgeTree(token, item.id);
              return [item.id, countKnowledgePoints(tree.nodes)] as const;
            } catch {
              return [item.id, null] as const;
            }
          }),
        );
        return { certs, domains, listed };
      });
      if (!data) {
        return;
      }
      setItems(data.certs.items);
      setDomainName(data.domains.items.find((item) => item.id === domainId)?.name ?? '');
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
  const headStyle = { marginTop: `-${inset}px`, paddingTop: `${inset}px` };

  return (
    <Screen bare background="#F7F8F4" bodyFill>
      <View className="cert-sheet">
        <View className="cert-head" style={headStyle}>
          <PackTopBar
            title="选择证书"
            subtitle={domainName ? `领域 · ${domainName}` : undefined}
            onBack={goBackToHome}
          />
          {error ? null : <FlowSteps current={2} />}
          {error ? null : (
            <View className="cert-search-wrap">
              <PackSearch
                className="flow-search"
                placeholder="搜索证书"
                value={query}
                onChange={setQuery}
                icon={iconSearch}
              />
            </View>
          )}
        </View>
        <View className={emptyShell ? 'cert-list cert-list-empty' : 'cert-list'}>
          {!ready && !error ? <LoadingBlock skeleton /> : null}
          {error ? (
            <ErrorBlock
              className="pack-state"
              detail={error}
              onRetry={() => void load()}
              onBack={goBackToHome}
            />
          ) : null}
          {ready && visible.length === 0 ? (
            <SelectEmpty
              image={query ? undefined : emptyShelf}
              art={query ? undefined : 'shelf'}
              title="暂无证书"
              detail={query ? '换个关键词搜索' : '该领域下暂无可用证书'}
              action={query ? '清除搜索' : '返回领域'}
              tone={query ? 'soft' : 'solid'}
              onAction={() => (query ? setQuery('') : goBackToHome())}
            />
          ) : null}
          {ready && visible.length > 0 ? (
            <Text className="cert-section">
              {domainName || '证书'} · {visible.length} 个证书
            </Text>
          ) : null}
          {ready && !error
            ? visible.map((item) => (
                <View
                  key={item.id}
                  className="cert-card"
                  onClick={() => {
                    void Taro.navigateTo({
                      url: `/pages/pack/knowledge/index?domainId=${domainId}&certId=${item.id}`,
                    });
                  }}
                >
                  <View className="cert-card-copy">
                    <Text className="cert-card-title">{item.name}</Text>
                    {counts[item.id] === undefined ? null : (
                      <Text className="cert-card-sub">{counts[item.id]} 个知识点</Text>
                    )}
                  </View>
                  <Image className="cert-chev" src={iconChevron} mode="aspectFit" />
                </View>
              ))
            : null}
        </View>
      </View>
    </Screen>
  );
}

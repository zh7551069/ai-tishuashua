import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import type { PackList, PackView, UserSummary } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PackSheet } from '../../components/PackSheet';
import { Screen } from '../../components/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { fetchCurrentUser } from '../../services/auth-api';
import { isAuthFailure, withAuth } from '../../services/guard';
import { activatePack, deletePack, fetchPacks, updatePack } from '../../services/pack-api';
import { queryValue } from '../../services/query';
import { clearToken, readToken } from '../../services/session';

export default function HomePage() {
  const saved = queryValue(useRouter().params.saved);
  const toasted = useRef(false);
  const [user, setUser] = useState<UserSummary | null>(null);
  const [packs, setPacks] = useState<PackList | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PackView | null>(null);

  const load = async () => {
    setError('');
    try {
      const data = await withAuth(async (token) => {
        const [me, list] = await Promise.all([fetchCurrentUser(token), fetchPacks(token)]);
        return { me, list };
      });
      if (!data) {
        return;
      }
      setUser(data.me);
      setPacks(data.list);
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
    if (saved === '1' && !toasted.current) {
      toasted.current = true;
      void Taro.showToast({ title: '已保存到刷题包', icon: 'success' });
    }
    void load();
  });

  const current = packs?.items.find((item) => item.id === packs.activePackId) ?? null;
  const nick = user?.nick?.trim() || '备考人';

  const run = async (task: (token: string) => Promise<void>) => {
    const token = readToken();
    if (!token) {
      await Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    setBusy(true);
    try {
      await task(token);
      await load();
    } catch (caught) {
      if (isAuthFailure(caught)) {
        clearToken();
        await Taro.reLaunch({ url: '/pages/login/index' });
      }
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  const removePack = async (id: string) => {
    const before = packs?.items.length ?? 0;
    await run(async (token) => {
      await deletePack(token, id);
    });
    if (before <= 1) {
      setSheetOpen(false);
    }
  };

  return (
    <Screen
      bare
      footer={
        ready && current ? (
          <Button className="u-btn" disabled={current.unavailable || busy} onClick={() => openQuiz(current)}>
            {current.unavailable ? '开始刷题（不可用）' : '开始刷题'}
          </Button>
        ) : null
      }
    >
      <View className="u-greet">
        <View className="u-greet-copy">
          <Text className="u-greet-title">你好，{nick}</Text>
          <Text className="u-greet-sub">
            {ready && !current
              ? '还没有刷题包'
              : current?.unavailable
                ? '当前刷题包不可用，请删除或新建'
                : '继续你的刷题包，或切换已保存的知识点'}
          </Text>
        </View>
        <View className="u-avatar-wrap" onClick={() => void Taro.navigateTo({ url: '/pages/settings/index' })}>
          <View className="u-avatar">
            <Text className="u-avatar-text">{nick.slice(0, 1)}</Text>
          </View>
          <Text className="u-avatar-label">我</Text>
        </View>
      </View>
      <View className="u-pad">
        {!ready && !error ? <LoadingBlock label="正在加载刷题包" /> : null}
        {error ? (
          <ErrorBlock detail={error} onRetry={() => void load()} />
        ) : null}
        {ready && !current ? (
          <EmptyBlock
            title="暂无刷题包"
            detail="选择领域与证书，创建你的第一个刷题包"
            action="去选包"
            onAction={() => void Taro.navigateTo({ url: '/pages/pack/domain/index' })}
          />
        ) : null}
        {ready && current ? (
          <PackHome
            pack={current}
            busy={busy}
            onOpenSheet={() => setSheetOpen(true)}
            onDelete={() => setPendingDelete(current)}
            onCreate={() => void Taro.navigateTo({ url: '/pages/pack/domain/index' })}
          />
        ) : null}
      </View>
      {sheetOpen && packs && packs.items.length > 0 ? (
        <PackSheet
          items={packs.items}
          activeId={packs.activePackId}
          busy={busy}
          onClose={() => setSheetOpen(false)}
          onSelect={(id) => {
            void run((token) => activatePack(token, id).then(() => undefined)).catch(
              (caught: unknown) => {
                if (isAuthFailure(caught)) {
                  return;
                }
                void Taro.showToast({
                  title: caught instanceof Error ? caught.message : '切换失败',
                  icon: 'none',
                });
              },
            );
          }}
          onCreate={() => {
            setSheetOpen(false);
            void Taro.navigateTo({ url: '/pages/pack/domain/index' });
          }}
          onRename={(id, name) =>
            run((token) => updatePack(token, id, { name }).then(() => undefined))
          }
          onDelete={(id) => removePack(id)}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title="删除刷题包"
          body={`确定删除「${pendingDelete.name}」？删除后不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const pack = pendingDelete;
            setPendingDelete(null);
            void deleteCurrent(pack).catch((caught: unknown) => {
              void Taro.showToast({
                title: caught instanceof Error ? caught.message : '删除失败',
                icon: 'none',
              });
            });
          }}
        />
      ) : null}
    </Screen>
  );
}

function openQuiz(pack: PackView): void {
  if (pack.unavailable) {
    return;
  }
  void Taro.navigateTo({ url: `/pages/quiz/index?packId=${pack.id}` });
}

async function deleteCurrent(pack: PackView): Promise<void> {
  const token = readToken();
  if (!token) {
    await Taro.reLaunch({ url: '/pages/login/index' });
    return;
  }
  await deletePack(token, pack.id);
  await Taro.reLaunch({ url: '/pages/home/index' });
}

function PackHome(props: {
  pack: PackView;
  busy: boolean;
  onOpenSheet: () => void;
  onDelete: () => void;
  onCreate: () => void;
}) {
  const pack = props.pack;
  const chips = pack.knowledgePoints.slice(0, 2);
  const extra = pack.knowledgePointCount - chips.length;
  return (
    <View>
      <View className={pack.unavailable ? 'u-pack u-pack-off' : 'u-pack'}>
        <View className="u-pack-accent" />
        <View className="u-pack-label-row">
          <Text className="u-kicker">当前刷题包</Text>
          <Text className="u-link" onClick={props.onOpenSheet}>
            切换
          </Text>
        </View>
        <Text className="u-h1">{pack.certName || pack.name}</Text>
        <Text className="u-meta">
          {pack.domainName} · {pack.knowledgePointCount} 个知识点
        </Text>
        {pack.unavailable ? (
          <View>
            <Text className="u-meta">关联证书已下架</Text>
            <Text className="u-meta">此包仅可删除，不可修改或继续刷题</Text>
          </View>
        ) : (
          <View className="u-chips">
            {chips.map((item) => (
              <Text key={item.id} className="u-chip">
                {item.name}
              </Text>
            ))}
            {extra > 0 ? <Text className="u-chip">+{extra}</Text> : null}
          </View>
        )}
      </View>
      {pack.unavailable ? (
        <View>
          <Button className="u-btn-danger" style={{ marginTop: '23px' }} disabled={props.busy} onClick={props.onDelete}>
            删除此刷题包
          </Button>
          <Button className="u-btn-ghost" style={{ marginTop: '15px' }} onClick={props.onCreate}>
            新建刷题包
          </Button>
        </View>
      ) : (
        <Button
          className="u-btn-ghost"
          style={{ marginTop: '23px' }}
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/pack/knowledge/index?domainId=${pack.domainId}&certId=${pack.certId}&packId=${pack.id}`,
            })
          }
        >
          切换知识点
        </Button>
      )}
    </View>
  );
}

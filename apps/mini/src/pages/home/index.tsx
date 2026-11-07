import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { PackList, PackView, UserSummary } from '@tishuashua/shared';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PackSheet } from '../../components/PackSheet';
import { Screen } from '../../components/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { fetchCurrentUser } from '../../services/auth-api';
import { isAuthFailure, withAuth } from '../../services/guard';
import { activatePack, deletePack, fetchPacks, updatePack } from '../../services/pack-api';
import { captureGrowthLaunch, settleGrowthLaunch } from '../../services/growth-launch-run';
import { clearToken, readToken } from '../../services/session';

export default function HomePage() {
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
    captureGrowthLaunch(
      Taro.getCurrentInstance().router?.params as Record<string, unknown> | undefined,
    );
    void load();
    const token = readToken();
    if (token) {
      void settleGrowthLaunch(token).then((message) => {
        if (message) {
          void Taro.showToast({ title: message, icon: 'none' });
        }
      });
    }
  });

  const current = packs?.items.find((item) => item.id === packs.activePackId) ?? null;
  const nick = user?.nick?.trim() || '备考人';
  const unavailableOthers =
    current && !current.unavailable ? (packs?.items.filter((item) => item.unavailable) ?? []) : [];
  const emptyHome = ready && !error && !current;
  const mixedHome = Boolean(current && !current.unavailable && unavailableOthers.length > 0);
  const greetClass = emptyHome
    ? 'u-greet u-greet-empty'
    : current?.unavailable || mixedHome
      ? 'u-greet u-greet-board'
      : 'u-greet';
  const subClass = current?.unavailable
    ? 'u-greet-sub u-greet-sub-warn'
    : mixedHome
      ? 'u-greet-sub u-greet-sub-mix'
      : 'u-greet-sub';
  const padClass = emptyHome
    ? 'u-pad u-pad-home u-pad-fill'
    : current?.unavailable || mixedHome
      ? 'u-pad u-pad-home u-pad-home-tight'
      : 'u-pad u-pad-home';

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

  const openDomain = () => {
    void Taro.navigateTo({ url: '/pages/pack/domain/index' });
  };

  return (
    <Screen
      bare
      bodyFill={emptyHome}
      footerClassName="home-foot"
      footer={
        ready && current ? (
          <Button
            className={current.unavailable ? 'u-btn u-btn-off' : 'u-btn'}
            disabled={current.unavailable || busy}
            onClick={() => openQuiz(current)}
          >
            {current.unavailable ? '开始刷题（不可用）' : '开始刷题'}
          </Button>
        ) : null
      }
    >
      <View className={greetClass}>
        <View className="u-greet-copy">
          <Text className="u-greet-title">你好，{nick}</Text>
          <Text className={subClass}>{homeSub(ready, current, packs?.items ?? [])}</Text>
        </View>
        <View
          className="u-avatar-wrap"
          onClick={() => void Taro.navigateTo({ url: '/pages/me/index' })}
        >
          <View className="u-avatar">
            <Text className="u-avatar-text">{nick.slice(0, 1)}</Text>
          </View>
          <Text className="u-avatar-label">我</Text>
        </View>
      </View>
      <View className={padClass}>
        {!ready && !error ? <LoadingBlock label="正在加载刷题包" /> : null}
        {error ? <ErrorBlock detail={error} onRetry={() => void load()} /> : null}
        {emptyHome ? (
          <EmptyBlock
            fill
            className="home-empty"
            title="暂无刷题包"
            detail="选择领域与证书，创建你的第一个刷题包"
            action="去选包"
            onAction={openDomain}
          />
        ) : null}
        {ready && current ? (
          <PackHome
            pack={current}
            others={unavailableOthers}
            canSwitch={(packs?.items.length ?? 0) > 1}
            busy={busy}
            onOpenSheet={() => setSheetOpen(true)}
            mixed={mixedHome}
            onDelete={setPendingDelete}
            onCreate={openDomain}
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
            setSheetOpen(false);
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
            openDomain();
          }}
          onRename={(id, name) =>
            run((token) => updatePack(token, id, { name }).then(() => undefined))
          }
          onDelete={(id) => removePack(id)}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.unavailable ? '删除不可用刷题包？' : '删除刷题包？'}
          body={
            pendingDelete.unavailable
              ? '证书已下架，删除后无法恢复。\n不会影响其他可用刷题包。'
              : `确定删除「${pendingDelete.name}」？\n删除后不可恢复。`
          }
          confirmText="确认删除"
          solid
          align="start"
          mask="strong"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const pack = pendingDelete;
            setPendingDelete(null);
            void removePack(pack.id).catch((caught: unknown) => {
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

function homeSub(ready: boolean, current: PackView | null, items: PackView[]): string {
  if (ready && !current) {
    return '还没有刷题包';
  }
  if (current?.unavailable) {
    return '当前刷题包不可用，请删除或新建';
  }
  if (ready && items.some((item) => item.unavailable)) {
    return '继续可用的刷题包，或清理不可用项';
  }
  return '继续你的刷题包，或切换已保存的知识点';
}

function openQuiz(pack: PackView): void {
  if (pack.unavailable) {
    return;
  }
  void Taro.navigateTo({ url: `/pages/quiz/index?packId=${pack.id}` });
}

function PackHome(props: {
  pack: PackView;
  others: PackView[];
  canSwitch: boolean;
  busy: boolean;
  mixed: boolean;
  onOpenSheet: () => void;
  onDelete: (pack: PackView) => void;
  onCreate: () => void;
}) {
  const pack = props.pack;
  const chips = pack.knowledgePoints.slice(0, 2);
  const extra = pack.knowledgePointCount - chips.length;
  const packClass = pack.unavailable
    ? 'home-pack home-pack-off'
    : props.mixed
      ? 'home-pack home-pack-mix'
      : 'home-pack';
  return (
    <View>
      <View className={packClass}>
        <View className="home-pack-accent" />
        <View className="home-pack-body">
          <View className="home-label">
            <Text className="home-kicker">当前刷题包</Text>
            {pack.unavailable ? (
              <Text className="home-flag">不可用</Text>
            ) : (
              <Text className="home-switch" onClick={props.onOpenSheet}>
                切换
              </Text>
            )}
          </View>
          <Text className="home-title">{pack.certName || pack.name}</Text>
          <Text className="home-meta">
            {pack.domainName} · {pack.knowledgePointCount} 个知识点
          </Text>
          {pack.unavailable ? (
            <View className="home-reason">
              <Text className="home-reason-title">关联证书已下架</Text>
              <Text className="home-reason-sub">此包仅可删除，不可修改或继续刷题</Text>
            </View>
          ) : (
            <View className="home-chips">
              {chips.map((item) => (
                <Text key={item.id} className="home-chip">
                  {item.name}
                </Text>
              ))}
              {extra > 0 ? (
                <Text className={props.mixed ? 'home-chip' : 'home-chip home-chip-more'}>
                  +{extra}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>
      {pack.unavailable ? (
        <View>
          <View className="home-actions">
            <Button
              className="u-btn home-btn-danger"
              disabled={props.busy}
              onClick={() => props.onDelete(pack)}
            >
              删除此刷题包
            </Button>
            <Button className="u-btn home-btn-create" onClick={props.onCreate}>
              新建刷题包
            </Button>
            <Text className="home-relink" onClick={props.onCreate}>
              重新选择领域
            </Text>
            {props.canSwitch ? (
              <Text className="home-relink" onClick={props.onOpenSheet}>
                切换刷题包
              </Text>
            ) : null}
          </View>
          <View className="home-faq">
            <Text className="home-faq-q">为什么不可用？</Text>
            <Text className="home-faq-a">证书下架后，已选包保留记录但无法再刷题</Text>
          </View>
        </View>
      ) : null}
      {props.others.map((item) => (
        <View key={item.id} className="home-off">
          <View className="home-off-top">
            <Text className="home-off-name">{item.certName || item.name}</Text>
            <Text className="home-flag">不可用</Text>
          </View>
          <Text className="home-off-meta">证书已下架 · 仅可删除</Text>
          <Text className="home-off-del" onClick={() => props.onDelete(item)}>
            删除
          </Text>
        </View>
      ))}
      {props.others.length > 0 ? (
        <View className="home-mix">
          <Text className="home-mix-title">还有 {props.others.length} 个不可用刷题包</Text>
          <Text className="home-mix-sub">建议删除以保持列表清晰</Text>
        </View>
      ) : null}
    </View>
  );
}

import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import type { PackList, PackView, UserSummary } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { PackSheet } from '../../components/PackSheet';
import { MiniPage } from '../../components/MiniPage';
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
    <MiniPage
      title="开始备考"
      hint={user ? `${user.nick || '微信用户'}，继续今天的刷题包。` : '正在确认登录状态。'}
    >
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在加载刷题包。</Text> : null}
      {ready && !current ? (
        <EmptyPack onCreate={() => void Taro.navigateTo({ url: '/pages/pack/domain/index' })} />
      ) : null}
      {ready && current ? (
        <PackHome
          pack={current}
          busy={busy}
          onSwitchPoints={() => {
            void Taro.navigateTo({
              url: `/pages/pack/knowledge/index?domainId=${current.domainId}&certId=${current.certId}&packId=${current.id}`,
            });
          }}
          onReselect={() => {
            void Taro.navigateTo({ url: '/pages/pack/domain/index' });
          }}
          onOpenSheet={() => setSheetOpen(true)}
          onStart={() => {
            void Taro.navigateTo({ url: `/pages/quiz/index?packId=${current.id}` });
          }}
          onCreate={() => {
            void Taro.navigateTo({ url: '/pages/pack/domain/index' });
          }}
          onDelete={() => {
            void confirmDelete(current).catch((caught: unknown) => {
              void Taro.showToast({
                title: caught instanceof Error ? caught.message : '删除失败',
                icon: 'none',
              });
            });
          }}
        />
      ) : null}
      {ready ? <StudyLinks /> : null}
      {error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
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
    </MiniPage>
  );
}

async function confirmDelete(pack: PackView): Promise<void> {
  const result = await Taro.showModal({
    title: '删除刷题包',
    content: `确定删除「${pack.name}」？删除后不可恢复。`,
    confirmText: '删除',
    confirmColor: '#b42318',
  });
  if (!result.confirm) {
    return;
  }
  const token = readToken();
  if (!token) {
    await Taro.reLaunch({ url: '/pages/login/index' });
    return;
  }
  await deletePack(token, pack.id);
  await Taro.reLaunch({ url: '/pages/home/index' });
}

function StudyLinks() {
  return (
    <View>
      <Button
        className="ghost"
        onClick={() => void Taro.navigateTo({ url: '/pages/wrong-book/index' })}
      >
        错题本
      </Button>
      <Button className="ghost" onClick={() => void Taro.navigateTo({ url: '/pages/score/index' })}>
        成绩
      </Button>
      <Button
        className="ghost"
        onClick={() => void Taro.navigateTo({ url: '/pages/certificate/index' })}
      >
        证书
      </Button>
    </View>
  );
}

function EmptyPack(props: { onCreate: () => void }) {
  return (
    <View>
      <View className="card">
        <Text className="tree-name">还没有刷题包</Text>
        <Text className="meta">选领域、证书和知识点后，就可以在这里开始刷题。</Text>
      </View>
      <Button className="primary" onClick={props.onCreate}>
        选择领域
      </Button>
    </View>
  );
}

function PackHome(props: {
  pack: PackView;
  busy: boolean;
  onSwitchPoints: () => void;
  onReselect: () => void;
  onOpenSheet: () => void;
  onStart: () => void;
  onCreate: () => void;
  onDelete: () => void;
}) {
  const pack = props.pack;
  const chips = pack.knowledgePoints.slice(0, 8);
  const extra = pack.knowledgePointCount - chips.length;
  return (
    <View>
      <View className={pack.unavailable ? 'card card-off' : 'card'}>
        <View className="card-head">
          <Text className="tree-name">{pack.certName}</Text>
          {pack.unavailable ? <Text className="badge">不可用</Text> : null}
        </View>
        <Text className="meta">
          {pack.knowledgePointCount} 个知识点 · {pack.domainName}
        </Text>
        {pack.unavailable ? (
          <View>
            <Text className="meta">关联证书已下架</Text>
            <Text className="meta">此包仅可删除，不可修改或继续刷题</Text>
          </View>
        ) : (
          <View className="chips">
            {chips.map((item) => (
              <Text key={item.id} className="chip">
                {item.name}
              </Text>
            ))}
            {extra > 0 ? <Text className="chip">+{extra}</Text> : null}
          </View>
        )}
      </View>
      {pack.unavailable ? (
        <View>
          <Button className="primary" disabled>
            开始刷题（不可用）
          </Button>
          <Button className="danger" disabled={props.busy} onClick={props.onDelete}>
            删除此刷题包
          </Button>
          <Button className="ghost" onClick={props.onCreate}>
            新建刷题包
          </Button>
          <Button className="ghost" onClick={props.onReselect}>
            重新选择领域
          </Button>
        </View>
      ) : (
        <View>
          <Button className="primary" onClick={props.onStart}>
            开始刷题
          </Button>
          <Button className="ghost" onClick={props.onSwitchPoints}>
            切换知识点
          </Button>
          <Button className="ghost" onClick={props.onReselect}>
            重新选择领域
          </Button>
        </View>
      )}
      <Button className="secondary" onClick={props.onOpenSheet}>
        切换刷题包
      </Button>
    </View>
  );
}

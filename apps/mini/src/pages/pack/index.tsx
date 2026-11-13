import { Image, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  DAILY_PLAN_GREETING,
  PACK_NAME_MAX_LENGTH,
  type DailyPlanView,
  type PackView,
} from '@tishuashua/shared';
import { useState } from 'react';
import banner from '../../assets/pack/banner.jpg';
import emptyArt from '../../assets/pack/empty.jpg';
import { AppButton } from '../../components/AppButton';
import { AppConfirm } from '../../components/AppConfirm';
import { AppNav } from '../../components/AppNav';
import { AppSheet } from '../../components/AppSheet';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { apiRequest } from '../../services/http';
import { isAuthFailure, withAuth } from '../../services/guard';
import { activatePack, deletePack, fetchPacks, updatePack } from '../../services/pack-api';
import { clearToken, readToken } from '../../services/session';
import { PACK_DOMAIN_ROUTE, packStartAction } from '../../theme/pack-entry';
import './index.css';

type PackPayload = {
  packs: PackView[];
  activePackId: string | null;
  plan: DailyPlanView;
};

export default function PackIndexPage() {
  const [data, setData] = useState<PackPayload | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PackView | null>(null);

  const load = async () => {
    setError('');
    try {
      const next = await withAuth(async (token) => {
        const [list, plan] = await Promise.all([
          fetchPacks(token),
          apiRequest<DailyPlanView>('/me/daily-plan', { method: 'GET', token }),
        ]);
        return { packs: list.items, activePackId: list.activePackId, plan };
      });
      if (!next) {
        return;
      }
      setData(next);
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
    void load();
  });

  const run = async (task: (token: string) => Promise<void>) => {
    const token = readToken();
    if (!token) {
      await Taro.reLaunch({ url: '/pages/login/index' });
      return false;
    }
    setBusy(true);
    try {
      await task(token);
      await load();
      return true;
    } catch (caught) {
      if (isAuthFailure(caught)) {
        clearToken();
        await Taro.reLaunch({ url: '/pages/login/index' });
        return false;
      }
      void Taro.showToast({
        title: caught instanceof Error ? caught.message : '操作失败',
        icon: 'none',
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    void Taro.navigateBack({
      fail: () => {
        void Taro.reLaunch({ url: '/pages/home/index' });
      },
    });
  };

  const pickDomain = () => {
    void Taro.navigateTo({ url: PACK_DOMAIN_ROUTE });
  };

  const active =
    data?.packs.find((item) => item.id === data.activePackId) ?? data?.packs[0] ?? null;
  const unavailableCount = data?.packs.filter((item) => item.unavailable).length ?? 0;
  const start = data ? packStartAction(data.plan) : null;

  const beginEdit = () => {
    if (!active || active.unavailable) {
      void Taro.showToast({ title: '此包仅可删除', icon: 'none' });
      return;
    }
    setDraft(active.name);
    setEditing(true);
  };

  const saveName = async (thenStart: boolean) => {
    if (!active || active.unavailable) {
      return;
    }
    const name = draft.trim();
    if (!name) {
      void Taro.showToast({ title: '请填写刷题包名称', icon: 'none' });
      return;
    }
    const ok = await run(async (token) => {
      await updatePack(token, active.id, { name });
    });
    if (!ok) {
      return;
    }
    setEditing(false);
    if (thenStart && start?.action === 'quiz') {
      void Taro.navigateTo({ url: start.url });
    }
  };

  const startQuiz = () => {
    if (!start || busy) {
      return;
    }
    if (start.action === 'quiz') {
      void Taro.navigateTo({ url: start.url });
      return;
    }
    if (start.action === 'disabled') {
      void Taro.showToast({
        title: start.reason === 'unavailable' ? '刷题包不可用' : '当前包没有可练习的知识点',
        icon: 'none',
      });
    }
  };

  return (
    <Screen bare background="#f5f5f7">
      <AppNav
        title={DAILY_PLAN_GREETING}
        subtitle={
          active
            ? '继续你的刷题包，或切换已保存的知识点'
            : '先选一个领域，创建你的刷题包'
        }
        onBack={back}
      />
      <View className="pk-page">
        {!ready && !error ? <LoadingBlock label="正在读取刷题包" /> : null}
        {error ? <ErrorBlock detail={error} onRetry={() => void load()} /> : null}
        {ready && data && !active ? (
          <View>
            <Image className="pk-empty-art" src={emptyArt} mode="aspectFill" />
            <EmptyState
              title="暂无刷题包"
              body="选择领域与证书，添加想练的知识点。"
              action="去选包"
              onAction={pickDomain}
            />
          </View>
        ) : null}
        {ready && data && active ? (
          <View className="pk-stack">
            <Image className="pk-banner" src={banner} mode="aspectFill" />
            {active.unavailable ? (
              <Text className="pk-note">当前刷题包不可用，请删除或新建</Text>
            ) : null}
            {!active.unavailable && unavailableCount > 0 ? (
              <Text className="pk-note">
                还有 {unavailableCount} 个不可用刷题包，建议删除以保持列表清晰
              </Text>
            ) : null}
            <View className={active.unavailable ? 'pk-card pk-card-off' : 'pk-card'}>
              <View className="pk-bar" />
              <View className="pk-card-copy">
                <View className="pk-kicker-row">
                  <Text className="pk-kicker">{active.unavailable ? '不可用' : '当前刷题包'}</Text>
                  <Text className="pk-link" onClick={() => setSwitching(true)}>
                    切换
                  </Text>
                </View>
                {editing ? (
                  <Input
                    className="pk-field"
                    value={draft}
                    maxlength={PACK_NAME_MAX_LENGTH}
                    onInput={(event) => setDraft(event.detail.value)}
                  />
                ) : (
                  <Text className="pk-name">{active.certName || active.name}</Text>
                )}
                <Text className="pk-meta">
                  {active.domainName} · {active.knowledgePointCount} 个知识点
                </Text>
                {active.unavailable ? (
                  <Text className="pk-note">此包仅可删除，不可修改或继续刷题</Text>
                ) : (
                  <View className="pk-pills">
                    {active.knowledgePoints.slice(0, 2).map((point) => (
                      <Text key={point.id} className="pk-pill">
                        {point.name}
                      </Text>
                    ))}
                    {active.knowledgePoints.length > 2 ? (
                      <Text className="pk-pill">+{active.knowledgePoints.length - 2}</Text>
                    ) : null}
                  </View>
                )}
                <View className="pk-actions">
                  {active.unavailable ? (
                    <Text className="pk-text-btn pk-text-danger" onClick={() => setPendingDelete(active)}>
                      删除此刷题包
                    </Text>
                  ) : (
                    <Text
                      className="pk-text-btn"
                      onClick={() => {
                        if (editing) {
                          setEditing(false);
                          return;
                        }
                        beginEdit();
                      }}
                    >
                      {editing ? '取消编辑' : '编辑'}
                    </Text>
                  )}
                  <Text className="pk-text-btn" onClick={pickDomain}>
                    新建刷题包
                  </Text>
                </View>
              </View>
            </View>
            {editing ? (
              <AppButton label="完成并开始刷题" onClick={() => void saveName(true)} />
            ) : (
              <AppButton
                label={active.unavailable ? '开始刷题（不可用）' : '开始刷题'}
                disabled={start?.action !== 'quiz'}
                onClick={startQuiz}
              />
            )}
          </View>
        ) : null}
      </View>
      {switching && data ? (
        <AppSheet title="切换刷题包" onClose={() => setSwitching(false)}>
          {data.packs.map((item) => (
            <View
              key={item.id}
              className={[
                'yg-sheet-row',
                item.id === data.activePackId ? 'yg-sheet-row-on' : '',
                item.unavailable ? 'yg-sheet-row-off' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                if (item.unavailable || busy) {
                  void Taro.showToast({
                    title: '不可用项无法选中或编辑，仅可删除',
                    icon: 'none',
                  });
                  return;
                }
                setSwitching(false);
                void run((token) => activatePack(token, item.id).then(() => undefined));
              }}
            >
              <View>
                <Text className="pk-sheet-name">{item.unavailable ? `${item.name} · 不可用` : item.name}</Text>
                <Text className="pk-sheet-meta">
                  {item.certName || item.domainName} · {item.knowledgePointCount} 个知识点
                </Text>
              </View>
              {item.unavailable ? (
                <Text
                  className="pk-text-btn pk-text-danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSwitching(false);
                    setPendingDelete(item);
                  }}
                >
                  删除
                </Text>
              ) : null}
            </View>
          ))}
          <View className="pk-foot">
            <AppButton tone="ghost" label="新建刷题包" onClick={pickDomain} />
          </View>
        </AppSheet>
      ) : null}
      {pendingDelete ? (
        <AppConfirm
          title={pendingDelete.unavailable ? '删除不可用刷题包？' : '删除此刷题包？'}
          body={
            pendingDelete.unavailable
              ? '证书已下架，删除后无法恢复。'
              : '删除后无法恢复。'
          }
          confirmText="确认删除"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            void run((token) => deletePack(token, id).then(() => undefined));
          }}
        />
      ) : null}
    </Screen>
  );
}

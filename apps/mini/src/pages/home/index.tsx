import { Button, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  DAILY_PLAN_CTA_LABEL,
  DAILY_PLAN_GREETING,
  DAILY_PLAN_MULTI_PACE,
  DAILY_PLAN_WEEKDAY_LABELS,
  dailyPlanDayNumber,
  dailyPlanFootnote,
  dailyPlanLayout,
  dailyPlanQuizPath,
  dailyPlanRing,
  formatDailyPlanDate,
  resolveDailyPlanCta,
  type DailyPlanItem,
  type DailyPlanView,
  type PackList,
  type UserSummary,
} from '@tishuashua/shared';
import { useState } from 'react';
import { PackSheet } from '../../components/PackSheet';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { fetchCurrentUser } from '../../services/auth-api';
import { captureGrowthLaunch, settleGrowthLaunch } from '../../services/growth-launch-run';
import { isAuthFailure, withAuth } from '../../services/guard';
import { activatePack, deletePack, fetchPacks, updatePack } from '../../services/pack-api';
import { apiRequest } from '../../services/http';
import { clearToken, readToken } from '../../services/session';
import './daily-plan.css';

export default function HomePage() {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [plan, setPlan] = useState<DailyPlanView | null>(null);
  const [packs, setPacks] = useState<PackList | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      const data = await withAuth(async (token) => {
        const [me, daily, list] = await Promise.all([
          fetchCurrentUser(token),
          apiRequest<DailyPlanView>('/me/daily-plan', { method: 'GET', token }),
          fetchPacks(token),
        ]);
        return { me, daily, list };
      });
      if (!data) {
        return;
      }
      setUser(data.me);
      setPlan(data.daily);
      setPacks(data.list);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setPlan(null);
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

  const openDomain = () => {
    void Taro.navigateTo({ url: '/pages/pack/domain/index' });
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

  const switchPack = (id: string) => {
    if (busy || id === plan?.activePackId) {
      return;
    }
    void run((token) => activatePack(token, id).then(() => undefined)).catch((caught: unknown) => {
      if (isAuthFailure(caught)) {
        return;
      }
      void Taro.showToast({
        title: caught instanceof Error ? caught.message : '切换失败',
        icon: 'none',
      });
    });
  };

  const layout = plan ? dailyPlanLayout(plan) : 'empty';
  const cta = plan ? resolveDailyPlanCta(plan) : null;
  const ring = plan ? dailyPlanRing(plan) : null;
  const startPractice = () => {
    if (!cta || !plan) {
      return;
    }
    if (!cta.enabled) {
      if (cta.reason === 'unavailable') {
        void Taro.showToast({ title: '刷题包不可用', icon: 'none' });
      }
      return;
    }
    void Taro.navigateTo({ url: dailyPlanQuizPath(cta.packId, cta.knowledgePointId) });
  };

  return (
    <Screen
      bare
      background="#f5f6f8"
      footerClassName="dp-foot"
      footer={
        ready && plan && cta ? (
          <View className="dp-foot-stack">
            <Text className="dp-foot-note">{dailyPlanFootnote(plan)}</Text>
            <Button
              className={cta.enabled ? 'u-btn' : 'u-btn u-btn-off'}
              disabled={!cta.enabled && cta.reason !== 'unavailable'}
              onClick={startPractice}
            >
              {DAILY_PLAN_CTA_LABEL}
            </Button>
          </View>
        ) : null
      }
    >
      <View className="dp-page">
        {!ready && !error ? <LoadingBlock label="正在加载今日练习" /> : null}
        {error ? <ErrorBlock detail={error} onRetry={() => void load()} /> : null}
        {ready && plan ? (
            <View className="dp-stack">
            <View className="dp-head">
              <View
                className="dp-avatar"
                onClick={() => void Taro.navigateTo({ url: '/pages/me/index' })}
              >
                <Text className="dp-avatar-text">{avatarChar(user?.nick)}</Text>
              </View>
              <View className="dp-head-copy">
                <Text className="dp-date">{formatDailyPlanDate(plan.businessDate)}</Text>
                <Text className="dp-hello">{DAILY_PLAN_GREETING}</Text>
              </View>
              {plan.packs.length > 0 ? (
                <Text className="dp-more" onClick={() => setSheetOpen(true)}>
                  …
                </Text>
              ) : null}
            </View>
            <View className="dp-week">
              {plan.week.map((day) => {
                const today = day.date === plan.businessDate;
                const future = day.date > plan.businessDate;
                return (
                  <View key={day.date} className={today ? 'dp-day dp-day-today' : 'dp-day'}>
                    <Text className="dp-day-label">
                      {DAILY_PLAN_WEEKDAY_LABELS[day.weekday - 1] ?? ''}
                    </Text>
                    <Text className={future && !today ? 'dp-day-num dp-day-future' : 'dp-day-num'}>
                      {dailyPlanDayNumber(day.date)}
                    </Text>
                    {day.hasCompletion ? <View className="dp-dot" /> : <View className="dp-dot-slot" />}
                  </View>
                );
              })}
            </View>
            {layout === 'empty' || !ring ? (
              <View className="dp-hero dp-hero-empty">
                <View className="dp-mark">
                  <Text className="dp-mark-title">待开启</Text>
                  <Text className="dp-mark-sub">练习之旅</Text>
                </View>
                <View className="dp-hero-copy">
                  <Text className="dp-kicker">每一步，都算数</Text>
                  <Text className="dp-done">从第一题开始</Text>
                  <Text className="dp-remain">创建刷题包，开启你的每日练习计划。</Text>
                </View>
              </View>
            ) : (
              <View className="dp-hero">
                <View
                  className="dp-ring"
                  style={{ background: `conic-gradient(#2563EB ${ring.percent}%, #E5E7EB 0)` }}
                >
                  <View className="dp-ring-hole">
                    <Text className="dp-ring-pct">{ring.percent}%</Text>
                    <Text className="dp-ring-cap">今日已完成</Text>
                  </View>
                </View>
                <View className="dp-hero-copy">
                  <Text className="dp-kicker">{ring.kicker}</Text>
                  <Text className="dp-done">{ring.doneLine}</Text>
                  <Text className="dp-remain">{ring.remainLine}</Text>
                  {layout === 'multi' ? <Text className="dp-pace">{DAILY_PLAN_MULTI_PACE}</Text> : null}
                </View>
              </View>
            )}
            {layout === 'empty' ? (
              <View className="dp-section">
                <View className="dp-section-head">
                  <Text className="dp-section-title">今日练习</Text>
                  <Text className="dp-plus" onClick={openDomain}>
                    +
                  </Text>
                </View>
                <View className="dp-empty">
                  <View className="dp-folder">
                    <Text>+</Text>
                  </View>
                  <Text className="dp-section-aside">还没有刷题包</Text>
                  <Text className="dp-empty-title">创建你的第一个刷题包</Text>
                  <Text className="dp-empty-sub">选择领域与证书，添加想练的知识点，让每天的进步有迹可循。</Text>
                  <Text className="dp-create" onClick={openDomain}>
                    创建刷题包
                  </Text>
                  <Text className="dp-empty-hint">也可以点击右上方「+」新增</Text>
                </View>
              </View>
            ) : null}
            {layout !== 'empty' && plan.activePack ? (
              <PracticeSection
                plan={plan}
                layout={layout}
                busy={busy}
                onCreate={openDomain}
                onActivate={switchPack}
                onManage={() => setSheetOpen(true)}
                onPractice={(knowledgePointId) => {
                  if (!plan.activePack || plan.activePack.unavailable) {
                    void Taro.showToast({ title: '刷题包不可用', icon: 'none' });
                    return;
                  }
                  void Taro.navigateTo({
                    url: dailyPlanQuizPath(plan.activePack.packId, knowledgePointId),
                  });
                }}
              />
            ) : null}
          </View>
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
            switchPack(id);
          }}
          onCreate={() => {
            setSheetOpen(false);
            openDomain();
          }}
          onRename={(id, name) => run((token) => updatePack(token, id, { name }).then(() => undefined))}
          onDelete={(id) => removePack(id)}
        />
      ) : null}
    </Screen>
  );
}

function PracticeSection(props: {
  plan: DailyPlanView;
  layout: 'single' | 'multi';
  busy: boolean;
  onCreate: () => void;
  onActivate: (packId: string) => void;
  onManage: () => void;
  onPractice: (knowledgePointId: string) => void;
}) {
  const active = props.plan.activePack;
  if (!active) {
    return null;
  }
  return (
    <View className="dp-section">
      <View className="dp-section-head">
        <Text className="dp-section-title">今日练习</Text>
        <Text className="dp-section-aside">
          {active.completedCount} / {active.knowledgePointCount} 项已完成
        </Text>
      </View>
      <View className="dp-chip-row">
        {props.layout === 'multi' ? (
          <ScrollView scrollX className="dp-chips" enableFlex>
            {props.plan.packs.map((pack) => (
              <Text
                key={pack.packId}
                className={chipClass(pack.active, pack.unavailable)}
                onClick={() => props.onActivate(pack.packId)}
                onLongPress={props.onManage}
              >
                {pack.unavailable ? `${pack.name} · 不可用` : pack.name}
              </Text>
            ))}
          </ScrollView>
        ) : (
          <View className="dp-chips">
            <Text className="dp-chip dp-chip-on">{active.certName || active.name}</Text>
          </View>
        )}
        <Text className="dp-plus" onClick={props.onCreate}>
          +
        </Text>
      </View>
      <View className="dp-card">
        <View className="dp-card-head">
          <Text className="dp-card-title">
            {props.layout === 'multi'
              ? active.certName || active.name
              : `${active.domainName} · ${active.knowledgePointCount} 个知识点`}
          </Text>
          <Text className="dp-card-sub">
            {props.layout === 'multi'
              ? `仅显示当前包 · ${active.knowledgePointCount} 个知识点 · 待练习优先`
              : '今日知识点练习 · 待练习优先'}
          </Text>
        </View>
        {active.items.map((item) => (
          <KnowledgeRow
            key={item.knowledgePointId}
            item={item}
            disabled={props.busy}
            onPractice={props.onPractice}
          />
        ))}
      </View>
    </View>
  );
}

function KnowledgeRow(props: {
  item: DailyPlanItem;
  disabled: boolean;
  onPractice: (knowledgePointId: string) => void;
}) {
  return (
    <View
      className="dp-row"
      onClick={() => {
        if (!props.disabled) {
          props.onPractice(props.item.knowledgePointId);
        }
      }}
    >
      <View className={props.item.done ? 'dp-badge dp-badge-done' : 'dp-badge dp-badge-todo'}>
        <Text className="dp-badge-text">{props.item.done ? '✓' : '!'}</Text>
      </View>
      <Text className="dp-row-name">{props.item.name}</Text>
      <Text className={props.item.done ? 'dp-row-state dp-row-done' : 'dp-row-state dp-row-todo'}>
        {props.item.done ? '已完成' : '待练习'}
      </Text>
    </View>
  );
}

function chipClass(active: boolean, unavailable: boolean): string {
  return ['dp-chip', active ? 'dp-chip-on' : '', unavailable ? 'dp-chip-off' : '']
    .filter(Boolean)
    .join(' ');
}

function avatarChar(nick: string | null | undefined): string {
  const text = nick?.trim();
  if (!text) {
    return '备';
  }
  return Array.from(text)[0] ?? '备';
}

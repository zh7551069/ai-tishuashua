import { ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  DAILY_PLAN_CTA_LABEL,
  DAILY_PLAN_GREETING,
  DAILY_PLAN_MULTI_PACE,
  DAILY_PLAN_WEEKDAY_LABELS,
  dailyPlanDayNumber,
  dailyPlanFootnote,
  dailyPlanLayout,
  dailyPlanRing,
  formatDailyPlanDate,
  type DailyPlanItem,
  type DailyPlanView,
} from '@tishuashua/shared';
import { useState } from 'react';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { FilterChip } from '../../components/FilterChip';
import { HeroIllustration } from '../../components/HeroIllustration';
import { ListRow } from '../../components/ListRow';
import { ProgressRing } from '../../components/ProgressRing';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { WeekStrip } from '../../components/WeekStrip';
import { captureGrowthLaunch, settleGrowthLaunch } from '../../services/growth-launch-run';
import { isAuthFailure, withAuth } from '../../services/guard';
import { apiRequest } from '../../services/http';
import { activatePack } from '../../services/pack-api';
import { clearToken, readToken } from '../../services/session';
import { paletteById } from '../../theme/palettes';
import { useThemeId } from '../../theme/apply-theme';
import { homeEntryTarget } from '../../theme/pack-entry';
import './daily-plan.css';

export default function HomePage() {
  const themeId = useThemeId();
  const [plan, setPlan] = useState<DailyPlanView | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      const daily = await withAuth((token) =>
        apiRequest<DailyPlanView>('/me/daily-plan', { method: 'GET', token }),
      );
      if (!daily) {
        return;
      }
      setPlan(daily);
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

  const go = (entry: 'plus' | 'cta' | 'create' | 'profile') => {
    void Taro.navigateTo({ url: homeEntryTarget(entry) });
  };

  const switchPack = (id: string) => {
    if (busy || id === plan?.activePackId) {
      return;
    }
    const token = readToken();
    if (!token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    setBusy(true);
    void activatePack(token, id)
      .then(() => load())
      .catch((caught: unknown) => {
        if (isAuthFailure(caught)) {
          clearToken();
          void Taro.reLaunch({ url: '/pages/login/index' });
          return;
        }
        void Taro.showToast({
          title: caught instanceof Error ? caught.message : '切换失败',
          icon: 'none',
        });
      })
      .finally(() => setBusy(false));
  };

  const layout = plan ? dailyPlanLayout(plan) : 'empty';
  const ring = plan ? dailyPlanRing(plan) : null;
  const accent = paletteById(themeId).accent;

  return (
    <Screen
      bare
      background="#f5f5f7"
      footerClassName="dp-foot"
      footer={
        ready && plan ? (
          <View className="dp-foot-stack">
            {layout === 'empty' ? null : (
              <Text className="dp-foot-note">{dailyPlanFootnote(plan)}</Text>
            )}
            <AppButton label={DAILY_PLAN_CTA_LABEL} onClick={() => go('cta')} />
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
              <View className="dp-head-copy">
                <Text className="dp-hello">{DAILY_PLAN_GREETING}</Text>
                <Text className="dp-date">{formatDailyPlanDate(plan.businessDate)}</Text>
              </View>
              <View className="dp-tools">
                <View className="dp-tool dp-tool-me" onClick={() => go('profile')}>
                  <View className="dp-sil">
                    <View className="dp-sil-head" />
                    <View className="dp-sil-body" />
                  </View>
                </View>
                <View className="dp-tool dp-tool-plus" onClick={() => go('plus')}>
                  <Text className="dp-plus-mark">+</Text>
                </View>
              </View>
            </View>
            <WeekStrip
              days={plan.week.map((day) => ({
                key: day.date,
                label: DAILY_PLAN_WEEKDAY_LABELS[day.weekday - 1] ?? '',
                number: String(dailyPlanDayNumber(day.date)),
                today: day.date === plan.businessDate,
                marked: day.hasCompletion,
              }))}
            />
            {layout === 'empty' || !ring ? (
              <View className="dp-hero-card">
                <View className="dp-hero-copy">
                  <Text className="dp-kicker">练习之旅</Text>
                  <Text className="dp-done">每一步，都算数</Text>
                  <Text className="dp-remain">
                    从第一题开始，创建刷题包后即可规划今天的练习。
                  </Text>
                </View>
                <HeroIllustration className="dp-hero-art" />
                <View className="dp-hero-fade" />
              </View>
            ) : (
              <View className="dp-hero-card">
                <ProgressRing percent={ring.percent} color={accent} />
                <View className="dp-hero-stats">
                  <Text className="dp-stat-line">{ring.kicker}</Text>
                  <Text className="dp-stat-line">{ring.doneLine}</Text>
                  <Text className="dp-stat-line">{ring.remainLine}</Text>
                </View>
                <HeroIllustration className="dp-hero-art" />
                <View className="dp-hero-fade" />
              </View>
            )}
            {layout === 'empty' ? (
              <EmptyState
                title="还没有刷题包"
                body="创建你的第一个刷题包。选择领域与证书，添加想练的知识点，让每天的进步有迹可循。"
                action="创建刷题包"
                hint="或点击右上方 +"
                onAction={() => go('create')}
              />
            ) : null}
            {layout !== 'empty' && plan.activePack ? (
              <PracticeSection
                plan={plan}
                layout={layout}
                busy={busy}
                onOpenPack={() => go('plus')}
                onActivate={switchPack}
                onPractice={(knowledgePointId) => {
                  if (!plan.activePack || plan.activePack.unavailable) {
                    void Taro.showToast({ title: '刷题包不可用', icon: 'none' });
                    return;
                  }
                  void Taro.navigateTo({
                    url: homeEntryTarget('knowledge', {
                      packId: plan.activePack.packId,
                      knowledgePointId,
                    }),
                  });
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function PracticeSection(props: {
  plan: DailyPlanView;
  layout: 'single' | 'multi';
  busy: boolean;
  onOpenPack: () => void;
  onActivate: (packId: string) => void;
  onPractice: (knowledgePointId: string) => void;
}) {
  const active = props.plan.activePack;
  if (!active) {
    return null;
  }
  return (
    <View className="dp-section">
      {props.layout === 'multi' ? <Text className="dp-pace">{DAILY_PLAN_MULTI_PACE}</Text> : null}
      <View className="dp-section-head">
        <Text className="dp-section-title">今日练习</Text>
        <Text className="dp-section-aside">
          {active.completedCount}/{active.knowledgePointCount}
        </Text>
      </View>
      <ScrollView scrollX className="dp-chips" enableFlex>
        {props.plan.packs.map((pack) => (
          <FilterChip
            key={pack.packId}
            label={pack.unavailable ? `${pack.name} · 不可用` : pack.name}
            active={pack.active}
            disabled={pack.unavailable}
            onClick={() => props.onActivate(pack.packId)}
            onLongPress={props.onOpenPack}
          />
        ))}
      </ScrollView>
      <View className="dp-card">
        <Text className="dp-card-sub">
          {props.layout === 'multi'
            ? `仅显示当前包 · ${active.knowledgePointCount} 个知识点 · 待练习优先`
            : '今日知识点练习 · 待练习优先'}
        </Text>
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
    <ListRow
      title={props.item.name}
      leading={
        <View className={props.item.done ? 'dp-badge dp-badge-done' : 'dp-badge dp-badge-todo'}>
          <Text className="dp-badge-text">{props.item.done ? '✓' : '!'}</Text>
        </View>
      }
      trailing={
        <Text className={props.item.done ? 'dp-row-state dp-row-done' : 'dp-row-state dp-row-todo'}>
          {props.item.done ? '已完成' : '待练习'}
        </Text>
      }
      onClick={() => {
        if (!props.disabled) {
          props.onPractice(props.item.knowledgePointId);
        }
      }}
    />
  );
}

import { Image, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import {
  DAILY_PLAN_CTA_LABEL,
  DAILY_PLAN_EMPTY_HINT,
  DAILY_PLAN_ENCOURAGEMENT,
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
import iconBangDot from './assets/1br7j41.svg';
import iconBangStem from './assets/1amsp4.svg';
import iconBangRing from './assets/1oxv2op.svg';
import iconClockStem from './assets/1e39bkr.svg';
import iconPlus from './assets/1ezc8yr.svg';
import iconHeroCheck from './assets/1f0w0g2.svg';
import iconClockRing from './assets/1i25k72.svg';
import iconPersonBody from './assets/1nfiptg.svg';
import iconPersonHead from './assets/1wzu7cw.svg';
import iconRowCheck from './assets/cz6ppj.svg';
import iconClockDot from './assets/d0fny6.svg';
import './daily-plan.css';

type GlyphLayer = { src: string; l: number; t: number; w: number; h: number };

function glyphRpx(px: number): string {
  return `${(px * 750) / 390}rpx`;
}

function Glyph(props: { box: string; layers: readonly GlyphLayer[] }) {
  return (
    <View className={`dp-glyph ${props.box}`}>
      {props.layers.map((layer) => (
        <Image
          key={`${layer.src}-${layer.l}-${layer.t}`}
          className="dp-glyph-img"
          src={layer.src}
          mode="aspectFit"
          style={{
            left: glyphRpx(layer.l),
            top: glyphRpx(layer.t),
            width: glyphRpx(layer.w),
            height: glyphRpx(layer.h),
          }}
        />
      ))}
    </View>
  );
}

function PersonGlyph() {
  return (
    <Glyph
      box="dp-glyph-16"
      layers={[
        { src: iconPersonHead, l: 5.33, t: 2.67, w: 5.33, h: 5.33 },
        { src: iconPersonBody, l: 3.13, t: 8.67, w: 9.73, h: 4 },
      ]}
    />
  );
}

function PlusGlyph() {
  return <Glyph box="dp-glyph-16" layers={[{ src: iconPlus, l: 2.1, t: 2.1, w: 11.8, h: 11.8 }]} />;
}

function HeroCheck() {
  return (
    <Glyph
      box="dp-glyph-18"
      layers={[{ src: iconHeroCheck, l: 2.79, t: 4.32, w: 12.42, h: 9.36 }]}
    />
  );
}

function HeroClock() {
  return (
    <Glyph
      box="dp-glyph-18"
      layers={[
        { src: iconClockRing, l: 0.9, t: 0.9, w: 16.2, h: 16.2 },
        { src: iconClockStem, l: 8.19, t: 4.68, w: 1.62, h: 6.12 },
        { src: iconClockDot, l: 8.05, t: 11.52, w: 1.89, h: 1.89 },
      ]}
    />
  );
}

function RowBang() {
  return (
    <Glyph
      box="dp-glyph-20"
      layers={[
        { src: iconBangRing, l: 1, t: 1, w: 18, h: 18 },
        { src: iconBangStem, l: 9.1, t: 5.2, w: 1.8, h: 6.8 },
        { src: iconBangDot, l: 8.95, t: 12.8, w: 2.1, h: 2.1 },
      ]}
    />
  );
}

function RowCheck() {
  return (
    <Glyph box="dp-glyph-20" layers={[{ src: iconRowCheck, l: 3.1, t: 4.8, w: 13.8, h: 10.4 }]} />
  );
}

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
  const palette = paletteById(themeId);
  const note = plan ? homeFootnote(plan) : null;

  return (
    <Screen
      bare
      background="#f5f5f7"
      footerClassName="dp-foot"
      footer={
        ready && plan && layout !== 'empty' ? (
          <View className="dp-foot-stack">
            {note ? <Text className="dp-foot-note">{note}</Text> : null}
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
              <View className="dp-me-hit" onClick={() => go('profile')}>
                <View className="dp-me">
                  <PersonGlyph />
                </View>
              </View>
              <View className="dp-head-copy">
                <Text className="dp-hello">{DAILY_PLAN_GREETING}</Text>
                <Text className="dp-date">{formatDailyPlanDate(plan.businessDate)}</Text>
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
                  <Text className="dp-remain">从第一题开始，创建刷题包后即可规划今天的练习。</Text>
                </View>
                <HeroIllustration className="dp-hero-art" />
                <View className="dp-hero-fade" />
              </View>
            ) : (
              <View className="dp-hero-card">
                <ProgressRing
                  percent={ring.percent}
                  color={palette.accent100}
                  track="#EEF0E8"
                  caps
                />
                <HeroStats plan={plan} layout={layout} />
                <HeroIllustration className="dp-hero-art" />
                <View className="dp-hero-fade" />
              </View>
            )}
            {layout === 'empty' ? (
              <EmptyState
                title="还没有刷题包"
                body="创建你的第一个刷题包。选择领域与证书，添加想练的知识点，让每天的进步有迹可循。"
                action="创建刷题包"
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

function homeFootnote(plan: DailyPlanView): string | null {
  if (dailyPlanLayout(plan) === 'empty') {
    return null;
  }
  const note = dailyPlanFootnote(plan);
  if (note === DAILY_PLAN_ENCOURAGEMENT || note === DAILY_PLAN_EMPTY_HINT) {
    return null;
  }
  return note;
}

function HeroStats(props: { plan: DailyPlanView; layout: 'single' | 'multi' }) {
  const pack = props.plan.activePack;
  const summary = props.plan.summary;
  const single = props.layout === 'single' && pack ? pack : null;
  const packCount = single ? 1 : summary.availablePackCount;
  const done = single ? single.completedCount : summary.completedCount;
  const total = single ? single.knowledgePointCount : summary.totalCount;
  const remain = single ? single.remainingCount : summary.remainingCount;
  return (
    <View className="dp-hero-stats">
      <View className="dp-stat dp-stat-base">
        <Text className="dp-stat-num">{packCount}</Text>
        <Text className="dp-stat-label">刷题包</Text>
      </View>
      <View className="dp-stat">
        <HeroCheck />
        <Text className="dp-stat-num">
          {done}/{total}
        </Text>
      </View>
      <View className="dp-stat">
        <HeroClock />
        <Text className="dp-stat-num">{remain}</Text>
      </View>
    </View>
  );
}

function packMeta(
  layout: 'single' | 'multi',
  pack: NonNullable<DailyPlanView['activePack']>,
): string {
  const count = `${pack.knowledgePointCount} 个知识点`;
  if (layout === 'single' && pack.domainName) {
    return `${pack.domainName} · ${count}`;
  }
  return count;
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
  const lead = props.layout === 'multi' ? DAILY_PLAN_MULTI_PACE : `${DAILY_PLAN_ENCOURAGEMENT}。`;
  return (
    <View className="dp-section">
      <Text className="dp-pace">{lead}</Text>
      <View className="dp-section-head">
        <View className="dp-title-row">
          <Text className="dp-section-title">今日练习</Text>
          <Text className="dp-section-count">
            {active.completedCount}/{active.knowledgePointCount}
          </Text>
        </View>
        <View className="dp-add-hit" onClick={props.onOpenPack}>
          <View className="dp-add">
            <PlusGlyph />
          </View>
        </View>
      </View>
      {props.layout === 'multi' ? (
        <ScrollView scrollX className="dp-chips" enableFlex>
          <FilterChip label="全部" onClick={props.onOpenPack} />
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
      ) : null}
      <View className="dp-pack-head">
        <Text className="dp-pack-name">{active.name}</Text>
        <Text className="dp-pack-meta">{packMeta(props.layout, active)}</Text>
      </View>
      <View className="dp-card">
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
      className={props.item.done ? 'dp-kp dp-kp-done' : 'dp-kp'}
      title={props.item.name}
      leading={props.item.done ? <RowCheck /> : <RowBang />}
      onClick={() => {
        if (!props.disabled) {
          props.onPractice(props.item.knowledgePointId);
        }
      }}
    />
  );
}

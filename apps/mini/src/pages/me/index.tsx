import { Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { PackView, UserSummary } from '@tishuashua/shared';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { fetchCurrentUser } from '../../services/auth-api';
import {
  fetchEntitlement,
  fetchGrowth,
  fetchMemberSkus,
  postGrowthCheckin,
} from '../../services/commerce-api';
import { isAuthFailure, withAuth } from '../../services/guard';
import { HttpError } from '../../services/http';
import { checkInToday, readCheckin, readThemeId, type ThemeId } from '../../services/local-prefs';
import {
  APP_FOOTER,
  avatarChar,
  badgeLabel,
  buildCenter,
  countRecent,
  dayKey,
  displayNick,
  EMPTY_CHECKIN,
  sumScores,
  type CenterView,
  type CheckinState,
  type WeekDot,
} from '../../services/me-model';
import {
  ME_DAILY_SHARE_ROUTE,
  ME_INVITE_ROUTE,
  ME_MEMBER_ROUTE,
  ME_SESSION_LEDGER_ROUTE,
  presentMeCheckin,
  presentMeEntitlement,
  type MeEntitlementPresent,
  type MeMemberSkuName,
} from '../../services/me-entitlement-present';
import { clearToken, readToken } from '../../services/session';
import { fetchPacks } from '../../services/pack-api';
import { fetchQuizScores } from '../../services/quiz-api';
import { fetchWrongBook } from '../../services/wrong-book-api';
import {
  BridgeBack,
  CheckMark,
  Chevron,
  GearGlyph,
  ListGlyph,
  PackGlyph,
  ProfileChevron,
  RecordGlyph,
  WrongGlyph,
} from '../../ui/glyphs';
import '../../ui/me-settings.css';
import { MeGrowthRow, MeStatusCard } from './commerce-blocks';

type Snapshot = {
  user: UserSummary;
  certName: string;
  packCount: number;
  questions: number;
  correct: number;
  wrongCount: number;
  practiceCount: number;
};

export default function MePage() {
  const [themeId, setThemeId] = useState<ThemeId>('blue');
  const [today, setToday] = useState(() => dayKey(new Date()));
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [checkin, setCheckin] = useState<CheckinState>(EMPTY_CHECKIN);
  const [serverChecked, setServerChecked] = useState(false);
  const [growthReady, setGrowthReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [commerce, setCommerce] = useState<MeEntitlementPresent | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const load = async (day: string) => {
    setError('');
    try {
      const loaded = await withAuth(async (token) => {
        const [user, packs, scores, wrongs, entitlement, memberNames, growth] = await Promise.all([
          fetchCurrentUser(token),
          fetchPacks(token),
          fetchQuizScores(token),
          fetchWrongBook(token, 'pending'),
          fetchEntitlement(token),
          readMemberNames(token),
          fetchGrowth(token).catch((error: unknown) => {
            if (isAuthFailure(error)) {
              throw error;
            }
            return null;
          }),
        ]);
        return { user, packs, scores, wrongs, entitlement, memberNames, growth };
      });
      if (!loaded) {
        return;
      }
      const totals = sumScores(loaded.scores.items);
      const active = activePack(loaded.packs.items, loaded.packs.activePackId);
      setSnapshot({
        user: loaded.user,
        certName: active?.certName ?? '',
        packCount: loaded.packs.items.length,
        questions: totals.questions,
        correct: totals.correct,
        wrongCount: loaded.wrongs.items.length,
        practiceCount: countRecent(
          loaded.scores.items.map((item) => item.submittedAt),
          day,
        ),
      });
      const presented = presentMeEntitlement(loaded.entitlement, loaded.memberNames);
      if (!presented) {
        throw new Error('权益暂时无法识别');
      }
      setCommerce(presented);
      if (loaded.growth?.checkin.done) {
        setGrowthReady(true);
        setServerChecked(true);
        setCheckin(checkInToday(day));
      } else if (loaded.growth) {
        setGrowthReady(true);
        setServerChecked(false);
        setCheckin(readCheckin());
      } else {
        setGrowthReady(false);
        setServerChecked(false);
        setCheckin(readCheckin());
      }
      setReady(true);
    } catch (caught) {
      setReady(false);
      setCommerce(null);
      setGrowthReady(false);
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    const day = dayKey(new Date());
    setToday(day);
    setThemeId(readThemeId());
    setCheckin(readCheckin());
    void load(day);
  });

  const view = snapshot ? buildCenter({ ...snapshot, checkin, today }) : null;
  const rewardChecked = growthReady ? serverChecked : Boolean(view?.checked);
  const checkinCopy = commerce ? presentMeCheckin(commerce.active, rewardChecked) : null;
  const failed = Boolean(error) && !ready;

  const onCheckIn = () => {
    if (!view || checking) {
      return;
    }
    if (rewardChecked) {
      void Taro.showToast({ title: '今日已签到', icon: 'none' });
      return;
    }
    const token = readToken();
    if (!token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    setChecking(true);
    void (async () => {
      try {
        const result = await postGrowthCheckin(token);
        setGrowthReady(true);
        setServerChecked(true);
        setCheckin(checkInToday(today));
        if (result.applied) {
          const entitlement = await fetchEntitlement(token);
          const memberNames = await readMemberNames(token);
          const presented = presentMeEntitlement(entitlement, memberNames);
          if (presented) {
            setCommerce(presented);
          }
          void Taro.showToast({ title: '签到成功', icon: 'success' });
        } else {
          void Taro.showToast({ title: '今日已签到', icon: 'none' });
        }
      } catch (caught) {
        if (caught instanceof HttpError && (caught.status === 401 || caught.code === 'FORBIDDEN')) {
          clearToken();
          void Taro.reLaunch({ url: '/pages/login/index' });
          return;
        }
        const message = caught instanceof HttpError ? caught.message : '签到失败';
        void Taro.showToast({ title: message || '签到失败', icon: 'none' });
      } finally {
        setChecking(false);
      }
    })();
  };

  return (
    <Screen
      back
      centerTitle
      navPlain
      navClassName="ms-nav"
      title="我"
      bodyFill={failed}
      backMark={<BridgeBack />}
    >
      <View className={failed ? `ms-error-fill ms-theme-${themeId}` : `ms-theme-${themeId}`}>
        {!ready && !error ? (
          <View className="ms-body">
            <LoadingBlock label="正在读取个人中心" />
          </View>
        ) : null}
        {failed ? (
          <ErrorBlock
            className="ms-error"
            detail="个人中心暂时无法获取，请检查网络后重试"
            onRetry={() => void load(today)}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {ready && snapshot && view && commerce && checkinCopy ? (
          <MeBody
            nick={displayNick(snapshot.user.nick)}
            initial={avatarChar(snapshot.user.nick)}
            view={view}
            commerce={commerce}
            checkinButton={checkinCopy.button}
            checkinNote={checkinCopy.note}
            rewardChecked={rewardChecked}
            onCheckIn={onCheckIn}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function MeBody(props: {
  nick: string;
  initial: string;
  view: CenterView;
  commerce: MeEntitlementPresent;
  checkinButton: string;
  checkinNote: string;
  rewardChecked: boolean;
  onCheckIn: () => void;
}) {
  const { view } = props;
  return (
    <View className="ms-body">
      <View className="ms-card ms-profile" onClick={() => open('/pages/settings/index')}>
        <View className="ms-avatar ms-brand-soft ms-brand-line">
          <Text className="ms-avatar-text ms-brand-fg">{props.initial}</Text>
        </View>
        <View className="ms-profile-copy">
          <Text className="ms-name">{props.nick}</Text>
          <Text className="ms-sub">{view.subtitle}</Text>
        </View>
        <ProfileChevron />
      </View>
      <MeStatusCard commerce={props.commerce} onOpenMember={() => open(ME_MEMBER_ROUTE)} />
      <View className="ms-card ms-stats">
        <Stat label="刷题数" value={String(view.questions)} unit="道" muted={view.questions <= 0} />
        <View className="ms-vdiv" />
        <Stat label="正确率" value={view.accuracy} muted={view.accuracy === '—'} />
        <View className="ms-vdiv" />
        <Stat label="连续天数" value={String(view.streak)} unit="天" muted={view.streak <= 0} />
      </View>
      <View className="ms-card ms-checkin">
        <View className="ms-checkin-head">
          <Text className="ms-checkin-title">每日签到</Text>
          <Text className={view.streak > 0 ? 'ms-streak ms-brand-fg' : 'ms-streak ms-streak-muted'}>
            {view.streakText}
          </Text>
        </View>
        <View className="ms-week">
          {view.week.map((day) => (
            <View key={day.label} className="ms-day">
              <Text className="ms-day-label">{day.label}</Text>
              <DayDot dot={day.dot} />
            </View>
          ))}
        </View>
        <Text className="ms-checkin-note">{props.checkinNote}</Text>
        <View
          className={
            props.rewardChecked ? 'ms-cta ms-brand-soft ms-brand-line' : 'ms-cta ms-brand-bg'
          }
          onClick={props.onCheckIn}
        >
          <Text className={props.rewardChecked ? 'ms-cta-text ms-brand-fg' : 'ms-cta-text'}>
            {props.checkinButton}
          </Text>
        </View>
      </View>
      {view.empty ? (
        <View
          className="ms-go ms-brand-bg"
          onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
        >
          <Text className="ms-go-text">去首页刷题</Text>
        </View>
      ) : null}
      <MeGrowthRow
        active={props.commerce.active}
        onOpenShare={() => open(ME_DAILY_SHARE_ROUTE)}
        onOpenInvite={() => open(ME_INVITE_ROUTE)}
      />
      <View className="ms-card">
        <MenuRow
          glyph={<ListGlyph />}
          title="场次明细"
          meta={props.commerce.ledgerMeta}
          onClick={() => open(ME_SESSION_LEDGER_ROUTE)}
        />
        <View className="ms-line" />
        <MenuRow
          glyph={<WrongGlyph />}
          title="错题本"
          meta={view.wrongText}
          badge={view.wrongCount > 0 ? badgeLabel(view.wrongCount) : ''}
          onClick={() => open('/pages/wrong-book/index')}
        />
        <View className="ms-line" />
        <MenuRow
          glyph={<PackGlyph />}
          title="刷题包"
          meta={view.packText}
          onClick={() => void Taro.reLaunch({ url: '/pages/home/index' })}
        />
        <View className="ms-line" />
        <MenuRow
          glyph={<RecordGlyph />}
          title="练习记录"
          meta={view.practiceText}
          onClick={() => open('/pages/score/index')}
        />
        <View className="ms-line" />
        <MenuRow glyph={<GearGlyph />} title="设置" onClick={() => open('/pages/settings/index')} />
      </View>
      <Text className="ms-version">{APP_FOOTER}</Text>
    </View>
  );
}

function Stat(props: { label: string; value: string; unit?: string; muted?: boolean }) {
  const valueClass = props.muted ? 'ms-num-value ms-num-muted' : 'ms-num-value';
  return (
    <View className="ms-stat">
      <Text className="ms-stat-label">{props.label}</Text>
      <View className="ms-num">
        <Text className={valueClass}>{props.value}</Text>
        {props.unit ? <Text className="ms-num-unit">{props.unit}</Text> : null}
      </View>
    </View>
  );
}

function DayDot(props: { dot: WeekDot }) {
  if (props.dot === 'past' || props.dot === 'today-on') {
    return (
      <View className={props.dot === 'past' ? 'ms-dot ms-brand-bg' : 'ms-dot ms-dot-today-on'}>
        <CheckMark />
      </View>
    );
  }
  if (props.dot === 'today') {
    return (
      <View className="ms-dot ms-brand-soft">
        <Text className="ms-dot-today-text ms-brand-fg">今</Text>
      </View>
    );
  }
  return <View className="ms-dot ms-dot-hollow" />;
}

function MenuRow(props: {
  glyph: ReactNode;
  title: string;
  meta?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <View className="ms-row" onClick={props.onClick}>
      <View className="ms-icon">{props.glyph}</View>
      <View className="ms-row-copy">
        <Text className="ms-row-title">{props.title}</Text>
        {props.meta ? <Text className="ms-row-meta">{props.meta}</Text> : null}
      </View>
      <View className="ms-right">
        {props.badge ? (
          <View className="ms-badge">
            <Text className="ms-badge-text">{props.badge}</Text>
          </View>
        ) : null}
        <Chevron />
      </View>
    </View>
  );
}

function open(url: string) {
  void Taro.navigateTo({ url });
}

async function readMemberNames(token: string): Promise<MeMemberSkuName[]> {
  try {
    const skus = await fetchMemberSkus(token);
    return skus.map((sku) => ({ code: sku.code, name: sku.name }));
  } catch (caught) {
    if (isAuthFailure(caught)) {
      throw caught;
    }
    return [];
  }
}

function activePack(items: PackView[], activeId: string | null): PackView | null {
  return items.find((item) => item.id === activeId) ?? items[0] ?? null;
}

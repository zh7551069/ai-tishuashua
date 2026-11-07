import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { type PackView, type QuizSessionView } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchPack } from '../../services/pack-api';
import { fetchQuizSession } from '../../services/quiz-api';
import iconChevron from './assets/icon-chevron.png';
import iconClose from './assets/icon-close.png';
import iconStar from './assets/icon-star.png';
import { ReviewView } from './review';
import './review.css';
import {
  bannerFor,
  celebrateFor,
  celebrates,
  durationFor,
  heroFor,
  knowledgeBars,
  modeBadge,
  packLine,
  resultTone,
  wrongQuestions,
  type KnowledgeBar,
} from './model';
import './result.css';

const CONFETTI = [
  'sc-d1',
  'sc-d2',
  'sc-d3',
  'sc-d4',
  'sc-d5',
  'sc-d6',
  'sc-d7',
  'sc-d8',
  'sc-d9',
  'sc-d10',
];
const RIBS = ['sc-r1', 'sc-r2', 'sc-r3', 'sc-r4', 'sc-r5', 'sc-r6'];

export function ScoreResult(props: { sessionId: string; tick: number }) {
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [pack, setPack] = useState<PackView | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [review, setReview] = useState(false);
  const [celebrate, setCelebrate] = useState(true);
  const [openAnalysis, setOpenAnalysis] = useState<Record<string, boolean>>({});

  const load = async () => {
    setError('');
    try {
      const loaded = await withAuth(async (token) => {
        const current = await fetchQuizSession(token, props.sessionId);
        let nextPack: PackView | null = null;
        if (current.packId) {
          try {
            nextPack = await fetchPack(token, current.packId);
          } catch (caught) {
            if (isAuthFailure(caught)) {
              throw caught;
            }
            nextPack = null;
          }
        }
        return { current, nextPack };
      });
      if (!loaded) {
        return;
      }
      setSession(loaded.current);
      setPack(loaded.nextPack);
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setSession(null);
      setError(caught instanceof Error ? caught.message : '成绩加载失败');
    }
  };

  useEffect(() => {
    if (props.tick === 0) {
      return;
    }
    void load();
  }, [props.tick, props.sessionId]);

  const leave = () => {
    void Taro.navigateBack({
      fail: () => {
        void Taro.reLaunch({ url: '/pages/home/index' });
      },
    });
  };

  const result = session?.result ?? null;
  const questions = session?.paper?.questions ?? [];
  const tone =
    session && result
      ? resultTone({
          mode: session.mode,
          passed: result.passed,
          scoreRate: result.scoreRate,
          passScore: result.passScore,
        })
      : null;
  const bars = knowledgeBars(questions);
  const weak = bars.filter((bar) => bar.weak);
  const banner = tone && result ? bannerFor(tone, result, weak.length) : null;
  const hero = session && tone ? heroFor(session, tone) : null;
  const plain = tone === 'practice-plain';
  const duration = session && tone ? durationFor(session, plain) : null;
  const badge = session && tone ? modeBadge(tone, session.mode) : null;
  const wrong = wrongQuestions(questions);
  const party =
    session && tone && celebrate && !review
      ? celebrateFor(session, tone, weak.length, bars.length > 0)
      : null;

  const retry = () => {
    if (!session?.packId) {
      void Taro.showToast({ title: '这份成绩没有关联刷题包', icon: 'none' });
      return;
    }
    void Taro.navigateTo({ url: `/pages/quiz/index?packId=${session.packId}` });
  };

  const drill = () => {
    if (!session?.packId || weak.length === 0) {
      return;
    }
    const kpIds = weak.map((bar) => encodeURIComponent(bar.id)).join(',');
    void Taro.navigateTo({
      url: `/pages/quiz/index?from=retrainSimilar&packId=${session.packId}&kpIds=${kpIds}`,
    });
  };

  return (
    <Screen
      back
      centerTitle
      navClassName={review ? 'sc-nav sc-nav-review' : 'sc-nav'}
      footerClassName={
        review ? 'sc-foot sc-foot-review' : plain ? 'sc-foot sc-foot-plain' : 'sc-foot'
      }
      background="#f8f9fb"
      title={review ? '错题回顾' : '答题结果'}
      backMark={
        review ? (
          <Text className="wr-back-mark">‹</Text>
        ) : (
          <Image className="sc-close" src={iconClose} mode="aspectFit" />
        )
      }
      onBack={review ? () => setReview(false) : leave}
      right={
        review ? (
          <Text className="wr-count">{wrong.length} 题</Text>
        ) : badge ? (
          <View className={badge.exam ? 'sc-badge sc-badge-exam' : 'sc-badge'}>
            <Text className={badge.exam ? 'sc-badge-text sc-badge-text-exam' : 'sc-badge-text'}>
              {badge.text}
            </Text>
          </View>
        ) : null
      }
      footer={
        session && result && tone ? (
          review ? (
            <Button className="wr-back" hoverClass="none" onClick={() => setReview(false)}>
              返回结果
            </Button>
          ) : (
            <Actions
              plain={plain}
              exam={session.mode === 'exam'}
              showWrong={plain && wrong.length > 0}
              showDrill={!plain && weak.length > 0}
              onHome={() => void Taro.reLaunch({ url: '/pages/home/index' })}
              onReview={() => setReview(true)}
              onRetry={retry}
              onDrill={drill}
            />
          )
        ) : null
      }
    >
      <View className={plain ? 'sc-stack sc-stack-plain' : 'sc-stack'}>
        {error ? <ErrorBlock detail={error} onRetry={() => void load()} onBack={leave} /> : null}
        {!ready && !error ? <LoadingBlock label="正在加载成绩" /> : null}
        {ready && session && session.status !== 'submitted' ? (
          <ErrorBlock title="这份试卷还没交卷" onBack={leave} />
        ) : null}
        {ready && session && session.status === 'submitted' && !result ? (
          <ErrorBlock title="这次交卷没有可用的分数" onBack={leave} />
        ) : null}
        {session && result && tone && !review && hero ? (
          <ResultBody
            packTitle={packLine(
              session.context.certName,
              session.context.packName,
              pack ? pack.knowledgePointCount : null,
            )}
            banner={banner}
            hero={hero}
            duration={duration}
            bars={bars}
            wrongCount={wrong.length}
            plain={plain}
            onReview={() => setReview(true)}
            onDrill={drill}
          />
        ) : null}
        {session && review ? (
          <ReviewView
            session={session}
            questions={wrong}
            open={openAnalysis}
            onToggle={(id) => setOpenAnalysis((current) => ({ ...current, [id]: !current[id] }))}
          />
        ) : null}
      </View>
      {tone && celebrates(tone) && party ? (
        <Celebrate party={party} onClose={() => setCelebrate(false)} />
      ) : null}
    </Screen>
  );
}

function ResultBody(props: {
  packTitle: string;
  banner: ReturnType<typeof bannerFor>;
  hero: NonNullable<ReturnType<typeof heroFor>>;
  duration: ReturnType<typeof durationFor>;
  bars: KnowledgeBar[];
  wrongCount: number;
  plain: boolean;
  onReview: () => void;
  onDrill: () => void;
}) {
  const weak = props.bars.some((bar) => bar.weak);
  return (
    <View className="sc-cards">
      <View className="sc-pack">
        <Text className="sc-pack-kicker">刷题包</Text>
        <Text className="sc-pack-title">{props.packTitle}</Text>
      </View>
      {props.banner ? <Banner banner={props.banner} /> : null}
      <Hero hero={props.hero} />
      {props.duration ? <Duration duration={props.duration} /> : null}
      {props.bars.length > 0 ? (
        <View className="sc-know">
          <View className="sc-know-head">
            <Text className="sc-know-title">知识点掌握</Text>
            <Text className="sc-know-meta">正确/题数</Text>
          </View>
          {props.bars.map((bar) => (
            <View key={bar.id} className="sc-kp">
              <View className="sc-kp-name">
                <Text>{bar.name}</Text>
                {bar.weak ? <Text className="sc-weak">薄弱</Text> : null}
              </View>
              <View className="sc-mini">
                <View
                  className="sc-mini-fill"
                  style={{ width: `${Math.round(bar.rate * 100)}%`, background: bar.color }}
                />
              </View>
              <Text className="sc-ratio">
                {bar.correct}/{bar.total}
              </Text>
            </View>
          ))}
          {weak ? (
            <Text className="sc-drill" onClick={props.onDrill}>
              {props.plain ? '针对薄弱知识点再练' : '针对薄弱知识点再练 →'}
            </Text>
          ) : null}
        </View>
      ) : null}
      {props.wrongCount > 0 ? (
        <View className="sc-wrong" onClick={props.onReview}>
          <Text className="sc-bang">!</Text>
          <View className="sc-wrong-copy">
            <Text className="sc-wrong-title">错题回顾</Text>
            <Text className="sc-wrong-sub">{props.wrongCount} 道错题 · 含解析</Text>
          </View>
          <Image className="sc-chev" src={iconChevron} mode="aspectFit" />
        </View>
      ) : null}
    </View>
  );
}

function Banner(props: { banner: NonNullable<ReturnType<typeof bannerFor>> }) {
  const theme = props.banner.theme;
  return (
    <View className={`sc-banner sc-banner-${theme}`}>
      <View className="sc-banner-icon">
        <Text className="sc-banner-mark">{props.banner.mark}</Text>
      </View>
      <View className="sc-banner-copy">
        <Text className="sc-banner-title">{props.banner.title}</Text>
        <Text className="sc-banner-detail">{props.banner.detail}</Text>
      </View>
    </View>
  );
}

function Hero(props: { hero: NonNullable<ReturnType<typeof heroFor>> }) {
  const hero = props.hero;
  const footClass =
    hero.footTone === 'green'
      ? 'sc-foot-green'
      : hero.footTone === 'red'
        ? 'sc-foot-red'
        : 'sc-foot-muted';
  return (
    <View className="sc-hero">
      <View
        className="sc-ring"
        style={{ background: `conic-gradient(${hero.color} ${hero.rate * 360}deg, #e5e7eb 0deg)` }}
      >
        <View className="sc-ring-hole">
          <Text className="sc-ring-num">{hero.center}</Text>
          <Text className="sc-ring-unit">{hero.unit}</Text>
        </View>
      </View>
      <View className="sc-meta">
        {hero.kicker ? <Text className="sc-kicker">{hero.kicker}</Text> : null}
        {hero.headline ? <Text className="sc-headline">{hero.headline}</Text> : null}
        <Text className="sc-correct">{hero.correctLine}</Text>
        <Text className={footClass}>{hero.foot}</Text>
      </View>
    </View>
  );
}

function Duration(props: { duration: NonNullable<ReturnType<typeof durationFor>> }) {
  const duration = props.duration;
  return (
    <View className="sc-time">
      <View className="sc-time-left">
        <Text className="sc-time-label">用时</Text>
        <View className="sc-time-row">
          <Text className="sc-time-value">{duration.elapsed}</Text>
          {duration.unlimited ? (
            <Text className="sc-time-limit">不限时</Text>
          ) : (
            <Text className="sc-time-limit">/ {duration.limit}</Text>
          )}
        </View>
      </View>
      {duration.usedPercent !== null ? (
        <View className="sc-time-right">
          <View className="sc-time-track">
            <View className="sc-time-fill" style={{ width: `${duration.usedPercent}%` }} />
          </View>
          <Text className="sc-time-meta">{duration.usedText}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Actions(props: {
  plain: boolean;
  exam: boolean;
  showWrong: boolean;
  showDrill: boolean;
  onHome: () => void;
  onReview: () => void;
  onRetry: () => void;
  onDrill: () => void;
}) {
  const retryLabel = props.exam ? '再考一次' : '再练一次';
  const rowClass = props.plain
    ? 'sc-actions sc-actions-plain'
    : props.showDrill
      ? 'sc-actions sc-actions-3'
      : 'sc-actions';
  return (
    <View className={rowClass}>
      <View className="sc-btn sc-btn-home" onClick={props.onHome}>
        <Text className="sc-btn-label">回首页</Text>
      </View>
      {props.showWrong ? (
        <View className="sc-btn sc-btn-wrong" onClick={props.onReview}>
          <Text className="sc-btn-label sc-btn-label-red">错题回顾</Text>
        </View>
      ) : null}
      {props.showDrill ? (
        <View className="sc-btn sc-btn-mid" onClick={props.onRetry}>
          <Text className="sc-btn-label sc-btn-label-blue">{retryLabel}</Text>
        </View>
      ) : (
        <View className="sc-btn sc-btn-primary" onClick={props.onRetry}>
          <Text className="sc-btn-label sc-btn-label-white">{retryLabel}</Text>
        </View>
      )}
      {props.showDrill ? (
        <View className="sc-btn sc-btn-primary" onClick={props.onDrill}>
          <Text className="sc-btn-label sc-btn-label-white">弱项复练</Text>
        </View>
      ) : null}
    </View>
  );
}

function Celebrate(props: {
  party: NonNullable<ReturnType<typeof celebrateFor>>;
  onClose: () => void;
}) {
  const exam = props.party.kind === 'exam';
  return (
    <View className="sc-mask" onClick={props.onClose}>
      <View className="sc-wash" />
      <View className={exam ? 'sc-glow sc-glow-exam' : 'sc-glow'} />
      {CONFETTI.map((name) => (
        <View key={name} className={`sc-confetti ${name}`} />
      ))}
      {RIBS.map((name) => (
        <View key={name} className={`sc-rib ${name}`} />
      ))}
      <View className="sc-celebrate" onClick={props.onClose}>
        <View className="sc-card">
          <View className={exam ? 'sc-accent sc-accent-exam' : 'sc-accent'} />
          <Text className={exam ? 'sc-cele-badge sc-cele-badge-exam' : 'sc-cele-badge'}>
            {props.party.badge}
          </Text>
          <View className={exam ? 'sc-star-ring sc-star-ring-exam' : 'sc-star-ring'}>
            <View className={exam ? 'sc-star-inner sc-star-inner-exam' : 'sc-star-inner'}>
              <Image className="sc-star" src={iconStar} mode="aspectFit" />
            </View>
          </View>
          <Text className="sc-cele-title">{props.party.title}</Text>
          <Text className="sc-cele-sub">{props.party.subtitle}</Text>
          <View className={exam ? 'sc-cele-score sc-cele-score-exam' : 'sc-cele-score'}>
            <Text className="sc-cele-kicker">{props.party.kicker}</Text>
            <View className="sc-cele-num">
              <Text className={exam ? 'sc-cele-value sc-cele-value-exam' : 'sc-cele-value'}>
                {props.party.value}
              </Text>
              <Text className={exam ? 'sc-cele-unit sc-cele-unit-exam' : 'sc-cele-unit'}>
                {props.party.unit}
              </Text>
            </View>
            <Text className="sc-cele-foot">{props.party.foot}</Text>
          </View>
          <Text className="sc-cele-context">{props.party.context}</Text>
          <View className="sc-cele-cta">
            <Text className="sc-cele-cta-label">继续加油</Text>
          </View>
        </View>
        <Text className="sc-cele-hint">点按任意处关闭</Text>
      </View>
    </View>
  );
}

import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import {
  QUIZ_DIFFICULTY_LABELS,
  type PackView,
  type QuizResultView,
  type QuizSessionView,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { isAuthFailure, withAuth } from '../../services/guard';
import { fetchPack } from '../../services/pack-api';
import { fetchQuizSession } from '../../services/quiz-api';
import { startWrongSetRetrain } from '../../services/wrong-set-retrain-start';
import iconChevron from './assets/icon-chevron.png';
import celebrateArt from './assets/f0114f64c2773fdcbfd45bf1155f8fb4c6b41e78.png';
import { RetrainBar } from './retrain-bar';
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
  type BannerModel,
  type HeroModel,
  type KnowledgeBar,
} from './model';
import './result.css';

export function ScoreResult(props: { sessionId: string; tick: number }) {
  const [session, setSession] = useState<QuizSessionView | null>(null);
  const [pack, setPack] = useState<PackView | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [review, setReview] = useState(false);
  const [celebrate, setCelebrate] = useState(true);
  const [openAnalysis, setOpenAnalysis] = useState<Record<string, boolean>>({});
  const [retraining, setRetraining] = useState(false);

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
  const comments = !plain && weak.length > 0 ? commentLines(bars) : [];

  const retry = () => {
    if (!session?.packId) {
      void Taro.showToast({ title: '这份成绩没有关联刷题包', icon: 'none' });
      return;
    }
    void Taro.navigateTo({ url: `/pages/quiz/index?packId=${session.packId}` });
  };

  const retrainWrong = () => {
    if (!session || retraining || wrong.length <= 0) {
      return;
    }
    setRetraining(true);
    void startWrongSetRetrain(session.id).finally(() => setRetraining(false));
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
      footerClassName={review ? 'sc-foot sc-foot-review' : 'sc-foot'}
      background="#f5f5f7"
      title={review ? '错题回顾' : '答题结果'}
      onBack={review ? () => setReview(false) : leave}
      right={
        review ? (
          <Text className="wr-count">{wrong.length} 题</Text>
        ) : badge ? (
          <View className="sc-badge">
            <Text className="sc-badge-text">{badge.text}</Text>
          </View>
        ) : null
      }
      footer={
        session && result && tone ? (
          review ? (
            <RetrainBar
              count={wrong.length}
              busy={retraining}
              onBack={() => setReview(false)}
              onRetrain={retrainWrong}
            />
          ) : (
            <Actions
              exam={session.mode === 'exam'}
              showDrill={!plain && weak.length > 0}
              onHome={() => void Taro.reLaunch({ url: '/pages/home/index' })}
              onRetry={retry}
              onDrill={drill}
            />
          )
        ) : null
      }
    >
      <View className={review ? 'sc-stack sc-stack-review' : 'sc-stack'}>
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
            exam={session.mode === 'exam'}
            correctCount={result.correctCount}
            missedCount={Math.max(0, result.questionCount - result.correctCount)}
            thirdLabel={session.mode === 'exam' ? '及格线' : '难度 · 题量'}
            thirdValue={
              session.mode === 'exam'
                ? passChip(result)
                : `${QUIZ_DIFFICULTY_LABELS[session.settings.difficulty]} · ${result.questionCount}`
            }
            comments={comments}
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
  banner: BannerModel | null;
  hero: HeroModel;
  duration: ReturnType<typeof durationFor>;
  bars: KnowledgeBar[];
  wrongCount: number;
  plain: boolean;
  exam: boolean;
  correctCount: number;
  missedCount: number;
  thirdLabel: string;
  thirdValue: string;
  comments: string[];
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
      <Hero banner={props.banner} hero={props.hero} plain={props.plain} exam={props.exam} />
      <View className="sc-stats">
        <Stat label="正确" value={String(props.correctCount)} />
        <Stat label="错误" value={String(props.missedCount)} />
        <Stat label={props.thirdLabel} value={props.thirdValue} />
      </View>
      {props.duration ? <Duration duration={props.duration} /> : null}
      {props.bars.length > 0 ? (
        <View className="sc-know">
          <View className="sc-know-head">
            <Text className="sc-know-title">知识点掌握</Text>
            <View className="sc-know-gap" />
            <Text className="sc-know-meta">正确/题数</Text>
          </View>
          {props.bars.map((bar) => (
            <View key={bar.id} className="sc-kp">
              <View className="sc-kp-name">
                <Text className="sc-kp-label">{bar.name}</Text>
                {bar.weak ? <Text className="sc-weak">薄弱</Text> : null}
              </View>
              <View className="sc-mini">
                <View
                  className="sc-mini-fill"
                  style={{ width: `${Math.round(bar.rate * 100)}%` }}
                />
              </View>
              <Text className="sc-ratio">
                {bar.correct}/{bar.total}
              </Text>
            </View>
          ))}
          {weak ? (
            <Text className="sc-drill" onClick={props.onDrill}>
              针对薄弱知识点再练 →
            </Text>
          ) : null}
        </View>
      ) : null}
      {props.comments.length > 0 ? (
        <View className="sc-ai">
          <Text className="sc-ai-title">AI 点评</Text>
          <View className="sc-ai-body">
            {props.comments.map((line) => (
              <Text key={line} className="sc-ai-line">
                {line}
              </Text>
            ))}
          </View>
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

function Stat(props: { label: string; value: string }) {
  return (
    <View className="sc-stat">
      <Text className="sc-stat-k">{props.label}</Text>
      <Text className="sc-stat-v">{props.value}</Text>
    </View>
  );
}

function Hero(props: {
  banner: BannerModel | null;
  hero: HeroModel;
  plain: boolean;
  exam: boolean;
}) {
  const hero = props.hero;
  const ring = ringParts(hero);
  const caption = props.exam ? hero.kicker : hero.unit;
  if (props.plain) {
    return (
      <View className="sc-hero sc-hero-plain">
        <Ring ring={ring} color={hero.color} rate={hero.rate} />
        <Text className="sc-hero-score">{hero.unit}</Text>
      </View>
    );
  }
  const theme = props.banner?.theme;
  return (
    <View
      className={
        theme ? `sc-hero sc-hero-banner sc-hero-${theme}` : 'sc-hero sc-hero-banner sc-hero-plain'
      }
    >
      <View className="sc-hero-copy">
        {props.banner ? (
          <Text className={`sc-hero-title sc-hero-title-${theme}`}>{props.banner.title}</Text>
        ) : hero.headline ? (
          <Text className="sc-hero-title sc-hero-title-green">{hero.headline}</Text>
        ) : null}
        <Text className="sc-hero-detail">{props.banner ? props.banner.detail : hero.foot}</Text>
      </View>
      <View className="sc-hero-side">
        <Ring ring={ring} color={hero.color} rate={hero.rate} />
        {caption ? <Text className="sc-hero-caption">{caption}</Text> : null}
      </View>
    </View>
  );
}

function Ring(props: { ring: { value: string; mark: string }; color: string; rate: number }) {
  return (
    <View
      className="sc-ring"
      style={{ background: `conic-gradient(${props.color} ${props.rate * 360}deg, #E7E5E4 0deg)` }}
    >
      <View className="sc-ring-hole">
        <Text className="sc-ring-num">{props.ring.value}</Text>
        <Text className="sc-ring-mark">{props.ring.mark}</Text>
      </View>
    </View>
  );
}

function Duration(props: { duration: NonNullable<ReturnType<typeof durationFor>> }) {
  const duration = props.duration;
  return (
    <View className="sc-time">
      <Text className="sc-time-label">用时</Text>
      <View className="sc-time-row">
        <View className="sc-time-clock">
          <Text className="sc-time-value">{duration.elapsed}</Text>
          {duration.unlimited ? (
            <Text className="sc-time-limit">不限时</Text>
          ) : (
            <Text className="sc-time-limit"> / {duration.limit}</Text>
          )}
        </View>
        {duration.usedText ? <Text className="sc-time-meta">{duration.usedText}</Text> : null}
      </View>
      {duration.usedPercent !== null ? (
        <View className="sc-time-track">
          <View className="sc-time-fill" style={{ width: `${duration.usedPercent}%` }} />
        </View>
      ) : null}
    </View>
  );
}

function Actions(props: {
  exam: boolean;
  showDrill: boolean;
  onHome: () => void;
  onRetry: () => void;
  onDrill: () => void;
}) {
  const retryLabel = props.exam ? '再考一次' : '再练一次';
  return (
    <View className={props.showDrill ? 'sc-actions sc-actions-3' : 'sc-actions'}>
      <View className="sc-btn sc-btn-home" onClick={props.onHome}>
        <Text className="sc-btn-label">回首页</Text>
      </View>
      {props.showDrill ? (
        <View className="sc-btn sc-btn-mid" onClick={props.onRetry}>
          <Text className="sc-btn-label sc-btn-label-green">{retryLabel}</Text>
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
  return (
    <View className="sc-mask" onClick={props.onClose}>
      <View className="sc-celebrate">
        <View className="sc-card">
          <View className="sc-cele-art-wrap">
            <Image className="sc-cele-art" src={celebrateArt} mode="aspectFit" />
          </View>
          <Text className="sc-cele-badge">{props.party.badge}</Text>
          <Text className="sc-cele-title">{props.party.title}</Text>
          <Text className="sc-cele-sub">{props.party.subtitle}</Text>
          <View className="sc-cele-score">
            <Text className="sc-cele-line">
              {props.party.kicker} {props.party.value} {props.party.unit}
            </Text>
            <Text className="sc-cele-line">{props.party.foot}</Text>
          </View>
          <Text className="sc-cele-context">{props.party.context}</Text>
          <View className="sc-cele-cta">
            <Text className="sc-cele-cta-label">继续加油</Text>
          </View>
          <Text className="sc-cele-hint">点按任意处关闭</Text>
        </View>
      </View>
    </View>
  );
}

function ringParts(hero: HeroModel): { value: string; mark: string } {
  if (hero.center.endsWith('%')) {
    return { value: hero.center.slice(0, -1), mark: '%' };
  }
  return { value: hero.center, mark: hero.unit };
}

function passChip(result: QuizResultView): string {
  if (result.passScore === null || result.passed === null) {
    return '未设及格线';
  }
  const line = Number.isInteger(result.passScore)
    ? String(result.passScore)
    : String(Math.round(result.passScore * 10) / 10);
  return `${line} · ${result.passed ? '已通过' : '未通过'}`;
}

function commentLines(bars: readonly KnowledgeBar[]): string[] {
  const strong = nameList(bars.filter((bar) => !bar.weak));
  const weak = nameList(bars.filter((bar) => bar.weak));
  const lines: string[] = [];
  if (strong) {
    lines.push(`${strong}尚可`);
  }
  if (weak) {
    lines.push(`${weak}偏弱`);
    lines.push('带上薄弱知识点，直达出题设置');
  }
  return lines;
}

function nameList(bars: readonly KnowledgeBar[]): string {
  if (bars.length === 0) {
    return '';
  }
  const names = bars.slice(0, 2).map((bar) => bar.name);
  return bars.length > 2 ? `${names.join('、')}等` : names.join('、');
}

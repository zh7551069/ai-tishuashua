import { Image, Navigator, Text, View } from '@tarojs/components';
import boardMark from './assets/board-mark.png';
import starLg from './assets/star-lg.png';
import starSm from './assets/star-sm.png';
import wechatSheet from './assets/wechat-sheet.png';
import wechatWhite from './assets/wechat-white.png';
import type { ProfileModel, ProfileRowModel } from './profile';

const FEATURES = [
  {
    key: 'generate',
    mark: '题',
    title: 'AI 即时出题',
    subtitle: '按知识点生成，不重复题干',
  },
  {
    key: 'analyze',
    mark: '析',
    title: '错题即析',
    subtitle: '答错立刻看解析与出处',
  },
  {
    key: 'clear',
    mark: '灭',
    title: '错题消灭',
    subtitle: '随机入卷，答对即已消灭',
  },
] as const;

export function LoginChecking(props: { inset: number }) {
  return <View className="lg" style={{ paddingTop: `${props.inset}px` }} />;
}

export function LoginLanding(props: {
  inset: number;
  error: string;
  authorizing: boolean;
  onLogin: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="lg" style={{ paddingTop: `${props.inset}px` }}>
      <Hero
        kicker="在职考证 · AI 出题刷练"
        welcome="欢迎开始高效备考"
        error={props.error}
      />
      <View className="lg-mid">
        <FeatureCard />
        <NoticeCard />
      </View>
      <View className="lg-foot">
        <Agreement topClass="lg-at-16" />
        <Capsule
          label="微信一键登录"
          tone={props.authorizing ? 'wait' : 'go'}
          icon
          topClass="lg-at-72"
          onClick={props.authorizing ? undefined : props.onLogin}
        />
        <Text className="lg-note lg-at-134">授权后自动注册 · 无需验证码</Text>
      </View>
      {props.authorizing ? <AuthorizingSheet onCancel={props.onCancel} /> : null}
    </View>
  );
}

export function LoginAuthFailed(props: {
  inset: number;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <View className="lg" style={{ paddingTop: `${props.inset}px` }}>
      <Hero title="授权未完成或被拒绝" subtitle="未获得微信授权，可以重试或稍后再登录" />
      <View className="lg-mid">
        <FeatureCard />
        <NoticeCard />
      </View>
      <View className="lg-foot">
        <Agreement topClass="lg-at-10" />
        <Capsule label="重新授权" tone="go" icon topClass="lg-at-62" onClick={props.onRetry} />
        <Capsule label="返回" tone="back" topClass="lg-at-124" onClick={props.onBack} />
      </View>
    </View>
  );
}

export function LoginProfile(props: {
  inset: number;
  model: ProfileModel;
  onStart: () => void;
  onResync: () => void;
  onBack: () => void;
}) {
  const { model } = props;
  return (
    <View className="lg" style={{ paddingTop: `${props.inset}px` }}>
      <Hero title={model.title} subtitle={model.subtitle} />
      <View className="lg-mid">
        <ProfileCard model={model} />
      </View>
      <View className="lg-foot">
        {model.mode === 'ready' ? (
          <>
            <Text className="lg-note lg-note-ready lg-at-47">将进入首页，选择领域与证书</Text>
            <Capsule label="开始备考" tone="go" topClass="lg-at-87" onClick={props.onStart} />
          </>
        ) : null}
        {model.mode === 'failed' ? (
          <>
            <Capsule label="重新同步" tone="go" topClass="lg-at-47" onClick={props.onResync} />
            <Capsule label="返回" tone="back" topClass="lg-at-109" onClick={props.onBack} />
          </>
        ) : null}
      </View>
    </View>
  );
}

function Hero(props: { kicker?: string; welcome?: string; title?: string; subtitle?: string; error?: string }) {
  return (
    <View className="lg-hero">
      <View className="lg-mark">
        <Image className="lg-mark-img" src={boardMark} mode="aspectFill" />
        <Image className="lg-star lg-star-lg" src={starLg} mode="aspectFit" />
        <Text className="lg-ai">AI</Text>
        <Image className="lg-star lg-star-sm" src={starSm} mode="aspectFit" />
      </View>
      {props.kicker ? <Text className="lg-kicker">{props.kicker}</Text> : null}
      {props.welcome ? <Text className="lg-welcome">{props.welcome}</Text> : null}
      {props.title ? <Text className="lg-title">{props.title}</Text> : null}
      {props.subtitle ? <Text className="lg-sub">{props.subtitle}</Text> : null}
      {props.error ? <Text className="lg-banned">{props.error}</Text> : null}
    </View>
  );
}

function FeatureCard() {
  return (
    <View className="lg-features">
      {FEATURES.map((feature) => (
        <View className="lg-feature" key={feature.key}>
          <View className="lg-feature-mark">
            <Text className="lg-feature-glyph">{feature.mark}</Text>
          </View>
          <View className="lg-feature-copy">
            <Text className="lg-feature-title">{feature.title}</Text>
            <Text className="lg-feature-sub">{feature.subtitle}</Text>
          </View>
        </View>
      ))}
      <View className="lg-fline lg-fline-1" />
      <View className="lg-fline lg-fline-2" />
    </View>
  );
}

function NoticeCard() {
  return (
    <View className="lg-notice">
      <Text className="lg-notice-text">仅支持微信联合登录。授权成功后自动注册并登录，将从微信同步昵称与手机号，用于账号与学习记录。</Text>
    </View>
  );
}

function Agreement(props: { topClass: string }) {
  return (
    <View className={`lg-agree ${props.topClass}`}>
      <Text className="lg-agree-muted">登录即表示同意</Text>
      <Navigator className="lg-agree-link" url="/pages/legal/terms/index">
        <Text className="lg-agree-link-text">《用户协议》</Text>
      </Navigator>
      <Text className="lg-agree-muted">与</Text>
      <Navigator className="lg-agree-link" url="/pages/legal/privacy/index">
        <Text className="lg-agree-link-text">《隐私政策》</Text>
      </Navigator>
    </View>
  );
}

function Capsule(props: {
  label: string;
  tone: 'go' | 'wait' | 'back';
  icon?: boolean;
  topClass: string;
  onClick?: () => void;
}) {
  const toneClass =
    props.tone === 'back' ? 'lg-btn-back' : props.tone === 'wait' ? 'lg-btn-wait' : 'lg-btn-go';
  return (
    <View
      className={`lg-btn ${toneClass} ${props.topClass}`}
      hoverClass={props.onClick ? 'lg-btn-hover' : undefined}
      onClick={props.onClick}
    >
      {props.icon ? <Image className="lg-btn-icon" src={wechatWhite} mode="aspectFit" /> : null}
      <Text className={props.tone === 'back' ? 'lg-btn-back-label' : 'lg-btn-label'}>{props.label}</Text>
    </View>
  );
}

function ProfileCard(props: { model: ProfileModel }) {
  const { model } = props;
  const width = `${(model.doneCount / 3) * 100}%`;
  return (
    <View className="lg-card">
      <Text className="lg-card-title">从微信补充资料</Text>
      {model.rows.map((row, index) => (
        <View key={row.key}>
          {index > 0 ? <View className="lg-divider" /> : null}
          <ProfileRow row={row} syncing={model.mode === 'syncing'} />
        </View>
      ))}
      <View className="lg-progress">
        <View className="lg-track">
          <View className={`lg-fill lg-fill-${model.fill}`} style={{ width }} />
        </View>
        <Text className="lg-progress-label">{model.progressLabel}</Text>
      </View>
    </View>
  );
}

function ProfileRow(props: { row: ProfileRowModel; syncing: boolean }) {
  const { row, syncing } = props;
  const muted = row.state === 'later' || (row.state === 'pending' && !syncing);
  const valueClass = `lg-row-value${row.state === 'failed' ? ' lg-row-value-fail' : ''}${muted ? ' lg-row-value-muted' : ''}`;
  return (
    <View className={`lg-row ${row.key === 'avatar' ? 'lg-row-avatar' : 'lg-row-line'}`}>
      {row.key === 'avatar' ? (
        <View className="lg-avatar">
          {row.imageUrl ? (
            <Image className="lg-avatar-img" src={row.imageUrl} mode="aspectFill" />
          ) : row.initial ? (
            <Text className="lg-avatar-letter">{row.initial}</Text>
          ) : null}
        </View>
      ) : (
        <View className="lg-mini">
          <Text className="lg-mini-text">{row.mark}</Text>
        </View>
      )}
      <View className="lg-row-copy">
        <Text className="lg-row-label">{row.label}</Text>
        <Text className={valueClass}>{row.value}</Text>
      </View>
      <View className="lg-row-status">
        {row.state === 'done' ? (
          <View className="lg-check">
            <Text className="lg-check-text">✓</Text>
          </View>
        ) : row.state === 'failed' ? (
          <View className="lg-fail">
            <Text className="lg-fail-text">!</Text>
          </View>
        ) : syncing ? (
          <View className="lg-spin lg-spin-sm" />
        ) : null}
      </View>
    </View>
  );
}

function AuthorizingSheet(props: { onCancel: () => void }) {
  return (
    <View className="lg-scrim" catchMove>
      <View className="lg-sheet">
        <View className="lg-sheet-mark">
          <Image className="lg-sheet-icon" src={wechatSheet} mode="aspectFit" />
        </View>
        <View className="lg-spin" />
        <Text className="lg-sheet-title">正在唤起微信授权</Text>
        <View className="lg-sheet-hints">
          <Text className="lg-sheet-hint">请在微信中确认登录</Text>
          <Text className="lg-sheet-hint">授权成功后将自动注册并登录</Text>
        </View>
        <View className="lg-cancel" onClick={props.onCancel}>
          <Text className="lg-cancel-label">取消</Text>
        </View>
      </View>
    </View>
  );
}

import { Image, Navigator, Text, View } from '@tarojs/components';
import { Fragment } from 'react';
import appMark from './assets/app-mark.png';
import spinBadge from './assets/spin-badge.png';
import spinnerLg from './assets/spinner-lg.png';
import spinnerSm from './assets/spinner-sm.png';
import wechatOnBlue from './assets/wechat-on-blue.png';
import wechatOnGreen from './assets/wechat-on-green.png';
import type { ProfileModel, ProfileRowModel } from './profile';

const FEATURES = [
  {
    key: 'generate',
    mark: '题',
    tone: 'blue',
    title: 'AI 即时出题',
    subtitle: '按知识点生成，不重复题干',
  },
  {
    key: 'analyze',
    mark: '析',
    tone: 'green',
    title: '错题即析',
    subtitle: '答错立刻看解析与出处',
  },
  {
    key: 'clear',
    mark: '灭',
    tone: 'violet',
    title: '错题消灭',
    subtitle: '随机入卷，答对即已消灭',
  },
] as const;

export function LoginChecking(props: { inset: number }) {
  return (
    <View className="auth auth-center" style={{ paddingTop: `${props.inset}px` }}>
      <Text className="auth-checking">正在确认登录状态</Text>
    </View>
  );
}

export function LoginLanding(props: {
  inset: number;
  error: string;
  authorizing: boolean;
  onLogin: () => void;
}) {
  return (
    <View className="auth" style={{ paddingTop: `${props.inset}px` }}>
      <View className="auth-hero auth-hero-landing">
        <AppMark badge="none" />
        <Text className="auth-brand">题刷刷</Text>
        <Text className="auth-tagline">在职考证 · AI 出题刷练</Text>
      </View>
      <View className="auth-features">
        {FEATURES.map((feature) => (
          <View className="auth-feature" key={feature.key}>
            <View className={`auth-feature-icon auth-feature-icon-${feature.tone}`}>
              <Text className={`auth-feature-glyph auth-feature-glyph-${feature.tone}`}>
                {feature.mark}
              </Text>
            </View>
            <View className="auth-feature-copy">
              <Text className="auth-feature-title">{feature.title}</Text>
              <Text className="auth-feature-sub">{feature.subtitle}</Text>
            </View>
          </View>
        ))}
      </View>
      <View className="auth-notice-wrap">
        <View className="auth-notice">
          <Text className="auth-notice-text">仅支持微信联合登录。授权成功后自动注册并登录，</Text>
          <Text className="auth-notice-text">将从微信同步昵称与手机号，用于账号与学习记录。</Text>
        </View>
      </View>
      <View className="auth-spacer" />
      <View className="auth-cta">
        {props.error ? <Text className="auth-error">{props.error}</Text> : null}
        <View className="auth-agree">
          <Text className="auth-agree-muted">登录即表示同意</Text>
          <Navigator className="auth-agree-link" url="/pages/legal/terms/index">
            《用户协议》
          </Navigator>
          <Text className="auth-agree-muted">与</Text>
          <Navigator className="auth-agree-link" url="/pages/legal/privacy/index">
            《隐私政策》
          </Navigator>
        </View>
        <View className="auth-btn" hoverClass="auth-btn-hover" onClick={props.onLogin}>
          <View className="auth-btn-row">
            <Image className="auth-btn-icon" src={wechatOnBlue} mode="aspectFit" />
            <Text className="auth-btn-label">微信一键登录</Text>
          </View>
        </View>
        <Text className="auth-cta-note">授权后自动注册 · 无需验证码</Text>
        <View className="auth-safe" />
      </View>
      {props.authorizing ? <AuthorizingSheet /> : null}
    </View>
  );
}

export function LoginProfile(props: { inset: number; model: ProfileModel; onStart: () => void }) {
  const { model } = props;
  return (
    <View className="auth" style={{ paddingTop: `${props.inset}px` }}>
      <View className={`auth-hero ${model.syncing ? 'auth-hero-sync' : 'auth-hero-ready'}`}>
        <AppMark badge={model.syncing ? 'spin' : 'check'} />
        <Text className="auth-title">{model.title}</Text>
        <Text className="auth-tagline">{model.subtitle}</Text>
      </View>
      <View className="auth-card">
        <View className="auth-card-head">
          <Text className="auth-card-title">从微信补充资料</Text>
          <Text className="auth-card-hint">{model.cardHint}</Text>
        </View>
        {model.rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 ? <View className="auth-divider" /> : null}
            <ProfileRow row={row} syncing={model.syncing} />
          </Fragment>
        ))}
        <View className="auth-progress">
          <View className="auth-track">
            <View
              className={`auth-fill ${model.complete ? 'auth-fill-done' : ''} ${model.syncing ? 'auth-fill-wait' : ''}`}
              style={model.syncing ? undefined : { width: `${(model.doneCount / 3) * 100}%` }}
            />
          </View>
          <Text
            className={`auth-progress-label ${model.complete ? 'auth-progress-label-done' : ''}`}
          >
            {model.progressLabel}
          </Text>
        </View>
      </View>
      <View className="auth-spacer" />
      <View className="auth-cta auth-cta-foot">
        {model.syncing ? (
          <View className="auth-btn auth-btn-disabled">
            <Text className="auth-btn-label">{model.cta}</Text>
          </View>
        ) : (
          <View className="auth-btn" hoverClass="auth-btn-hover" onClick={props.onStart}>
            <Text className="auth-btn-label">{model.cta}</Text>
          </View>
        )}
        <Text className="auth-cta-note">{model.ctaNote}</Text>
        <View className="auth-safe" />
      </View>
    </View>
  );
}

function ProfileRow(props: { row: ProfileRowModel; syncing: boolean }) {
  const { row, syncing } = props;
  const valueClass = `auth-row-value ${row.valueSize === 'sm' ? 'auth-row-value-sm' : ''} ${row.done ? '' : 'auth-row-value-pending'}`;
  return (
    <View className="auth-row">
      {row.key === 'avatar' ? (
        <View className="auth-avatar">
          {row.imageUrl ? (
            <Image className="auth-avatar-img" src={row.imageUrl} mode="aspectFill" />
          ) : (
            <Text className="auth-avatar-letter">{row.initial}</Text>
          )}
        </View>
      ) : (
        <View className={`auth-mini auth-mini-${row.tone}`}>
          <Text className={`auth-mini-text auth-mini-text-${row.tone}`}>{row.mark}</Text>
        </View>
      )}
      <View className="auth-row-copy">
        <Text className="auth-row-label">{row.label}</Text>
        <Text className={valueClass}>{row.value}</Text>
      </View>
      <View className="auth-row-status">
        {row.done ? (
          <View className="auth-check">
            <Text className="auth-check-text">✓</Text>
          </View>
        ) : syncing ? (
          <Image className="auth-row-spinner auth-spin" src={spinnerSm} mode="aspectFit" />
        ) : null}
      </View>
    </View>
  );
}

function AppMark(props: { badge: 'none' | 'spin' | 'check' }) {
  const framed = props.badge !== 'check';
  const mark = (
    <View className={framed ? 'auth-mark' : 'auth-mark auth-mark-plain'}>
      <Image className="auth-mark-img" src={appMark} mode="aspectFill" />
    </View>
  );
  if (props.badge === 'none') {
    return mark;
  }
  return (
    <View className={`auth-mark-wrap auth-mark-wrap-${props.badge}`}>
      {mark}
      {props.badge === 'spin' ? (
        <Image className="auth-spin-badge auth-spin" src={spinBadge} mode="aspectFit" />
      ) : (
        <View className="auth-check-badge">
          <Text className="auth-check-badge-text">✓</Text>
        </View>
      )}
    </View>
  );
}

function AuthorizingSheet() {
  return (
    <View className="auth-scrim" catchMove>
      <View className="auth-sheet">
        <View className="auth-wechat-mark">
          <Image className="auth-wechat-icon" src={wechatOnGreen} mode="aspectFit" />
        </View>
        <Image className="auth-spinner auth-spin" src={spinnerLg} mode="aspectFit" />
        <Text className="auth-sheet-title">正在唤起微信授权</Text>
        <View className="auth-sheet-hints">
          <Text className="auth-sheet-hint">请在微信中确认登录</Text>
          <Text className="auth-sheet-hint">授权成功后将自动注册并登录</Text>
        </View>
      </View>
    </View>
  );
}

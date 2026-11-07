import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { UserSummary } from '@tishuashua/shared';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { AuthApiError, bindWechatPhone, fetchCurrentUser } from '../../services/auth-api';
import { withAuth } from '../../services/guard';
import {
  clearDisposableCache,
  readCacheKb,
  readNotify,
  readThemeId,
  saveNotify,
  themeById,
  type NotifyPrefs,
  type ThemeId,
} from '../../services/local-prefs';
import { APP_VERSION, displayNick, formatCacheMb } from '../../services/me-model';
import { clearToken, readToken } from '../../services/session';
import { readPhoneAuthCode, type PhoneAuthDetail } from '../../services/wechat-auth';
import {
  BellGlyph,
  BookGlyph,
  BridgeBack,
  Chevron,
  InfoGlyph,
  Knob,
  NickGlyph,
  PaletteGlyph,
  PhoneGlyph,
  TrashGlyph,
} from '../../ui/glyphs';
import '../../ui/me-settings.css';

export default function SettingsPage() {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [binding, setBinding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>('blue');
  const [notify, setNotify] = useState<NotifyPrefs>({ practice: true, wrong: false });
  const [cacheKb, setCacheKb] = useState(0);

  const load = async () => {
    setError('');
    setThemeId(readThemeId());
    setNotify(readNotify());
    setCacheKb(readCacheKb());
    try {
      const me = await withAuth((token) => fetchCurrentUser(token));
      if (!me) {
        return;
      }
      setUser(me);
      setReady(true);
    } catch (caught) {
      setReady(false);
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    void load();
  });

  const onPhone = async (detail: PhoneAuthDetail) => {
    setError('');
    let code = '';
    try {
      code = readPhoneAuthCode(detail);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '授权失败';
      setError(message);
      void Taro.showToast({ title: message, icon: 'none' });
      return;
    }
    const token = readToken();
    if (!token) {
      await Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    setBinding(true);
    try {
      const next = await bindWechatPhone(token, code);
      setUser(next);
      setReady(true);
      void Taro.showToast({ title: '手机号已绑定', icon: 'success' });
    } catch (caught) {
      if (isSessionFailure(caught)) {
        clearToken();
        await Taro.reLaunch({ url: '/pages/login/index' });
        return;
      }
      const message = caught instanceof Error ? caught.message : '绑定失败，请重试';
      setError(message);
      void Taro.showToast({ title: '绑定失败', icon: 'none' });
    } finally {
      setBinding(false);
    }
  };

  const toggle = (key: keyof NotifyPrefs) => {
    const next = { ...notify, [key]: !notify[key] };
    setNotify(next);
    saveNotify(next);
  };

  const clearCache = () => {
    const next = clearDisposableCache();
    setCacheKb(next);
    setThemeId(readThemeId());
    setNotify(readNotify());
    void Taro.showToast({ title: '缓存已清除', icon: 'none' });
  };

  const failed = Boolean(error) && !ready;
  const phoneText = !user?.phoneBound ? '未绑定' : user.phoneMasked || '已绑定';
  const themeName = themeById(themeId).name;

  return (
    <Screen
      back
      centerTitle
      navPlain
      title="设置"
      bodyFill={failed}
      backMark={failed ? <Text className="ms-back-plain">‹</Text> : <BridgeBack />}
    >
      <View className={failed ? `ms-error-fill ms-theme-${themeId}` : `ms-theme-${themeId}`}>
        {!ready && !error ? (
          <View className="ms-body ms-body-set">
            <LoadingBlock label="正在读取账号" />
          </View>
        ) : null}
        {failed ? (
          <ErrorBlock
            className="ms-error"
            detail="设置信息暂时无法获取，请检查网络后重试"
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {ready && user ? (
          <View className="ms-body ms-body-set">
            <View className="ms-section">
              <Text className="ms-group-label">账号</Text>
              <View className="ms-card">
                <Button
                  className="ms-row ms-row-set ms-rowbtn"
                  openType="getPhoneNumber"
                  hoverClass="none"
                  loading={binding}
                  disabled={binding}
                  onGetPhoneNumber={(event) => void onPhone(event.detail)}
                >
                  <View className="ms-icon ms-icon-set">
                    <PhoneGlyph />
                  </View>
                  <Text className="ms-set-label">账号</Text>
                  <Text className="ms-set-value">{phoneText}</Text>
                  <Chevron />
                </Button>
                <View className="ms-line-set" />
                <Row
                  icon={
                    <View className="ms-icon ms-icon-set">
                      <NickGlyph />
                    </View>
                  }
                  label="昵称"
                  labelClass="ms-set-label ms-set-label-nick"
                  value={displayNick(user.nick)}
                  valueClass="ms-set-value ms-set-value-nick"
                  onClick={() =>
                    void Taro.showToast({
                      title: '昵称只在登录时填写，这里不能修改',
                      icon: 'none',
                    })
                  }
                />
              </View>
            </View>
            <View className="ms-section">
              <Text className="ms-group-label">通知</Text>
              <View className="ms-card">
                <ToggleRow
                  icon={
                    <View className="ms-icon ms-icon-set">
                      <BellGlyph />
                    </View>
                  }
                  label="练习提醒"
                  on={notify.practice}
                  onClick={() => toggle('practice')}
                />
                <View className="ms-line-set" />
                <ToggleRow
                  icon={
                    <View className="ms-icon ms-icon-danger">
                      <BookGlyph />
                    </View>
                  }
                  label="错题消灭提醒"
                  on={notify.wrong}
                  onClick={() => toggle('wrong')}
                />
              </View>
            </View>
            <View className="ms-section">
              <Text className="ms-group-label ms-group-label-plain">外观</Text>
              <View className="ms-card">
                <Row
                  icon={
                    <View className="ms-icon ms-icon-set">
                      <PaletteGlyph />
                    </View>
                  }
                  label="主题色"
                  trailing={
                    <>
                      <View className="ms-swatch" />
                      <Text className="ms-set-value">{themeName}</Text>
                    </>
                  }
                  onClick={() => void Taro.navigateTo({ url: '/pages/settings/theme/index' })}
                />
              </View>
            </View>
            <View className="ms-section">
              <Text className="ms-group-label">通用</Text>
              <View className="ms-card">
                <Row
                  icon={
                    <View className="ms-icon ms-icon-set ms-icon-gray">
                      <TrashGlyph />
                    </View>
                  }
                  label="清除缓存"
                  value={formatCacheMb(cacheKb)}
                  onClick={clearCache}
                />
                <View className="ms-line-set" />
                <Row
                  icon={
                    <View className="ms-icon ms-icon-set ms-icon-gray">
                      <InfoGlyph />
                    </View>
                  }
                  label="关于 题刷刷"
                  value={APP_VERSION}
                  onClick={() =>
                    void Taro.showModal({
                      title: '关于题刷刷',
                      content: `题刷刷 ${APP_VERSION}`,
                      showCancel: false,
                      confirmText: '知道了',
                    })
                  }
                />
                <View className="ms-line-set" />
                <Row
                  icon={
                    <View className="ms-icon ms-icon-set ms-icon-gray">
                      <Text className="ms-icon-letter ms-brand-fg">协</Text>
                    </View>
                  }
                  label="用户协议"
                  labelClass="ms-set-label ms-set-label-soft"
                  textChevron
                  onClick={() => void Taro.navigateTo({ url: '/pages/legal/terms/index' })}
                />
                <View className="ms-line-set" />
                <Row
                  icon={
                    <View className="ms-icon ms-icon-set ms-icon-gray">
                      <Text className="ms-icon-letter ms-brand-fg">隐</Text>
                    </View>
                  }
                  label="隐私政策"
                  labelClass="ms-set-label ms-set-label-soft"
                  textChevron
                  onClick={() => void Taro.navigateTo({ url: '/pages/legal/privacy/index' })}
                />
              </View>
            </View>
            {error && ready ? <Text className="ms-form-error">{error}</Text> : null}
            <View className="ms-logout-gap" />
            <Button
              className="ms-logout"
              hoverClass="none"
              disabled={binding}
              onClick={() => setConfirming(true)}
            >
              <Text className="ms-logout-text">退出登录</Text>
            </Button>
          </View>
        ) : null}
      </View>
      {confirming ? (
        <ConfirmDialog
          title="退出登录"
          body="只清除本机登录态，不会删除账号和已保存的学习数据。"
          confirmText="退出"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            clearToken();
            void Taro.reLaunch({ url: '/pages/login/index' });
          }}
        />
      ) : null}
    </Screen>
  );
}

function Row(props: {
  icon: ReactNode;
  label: string;
  labelClass?: string;
  value?: string;
  valueClass?: string;
  trailing?: ReactNode;
  textChevron?: boolean;
  onClick: () => void;
}) {
  return (
    <View className="ms-row ms-row-set" onClick={props.onClick}>
      {props.icon}
      <Text className={props.labelClass || 'ms-set-label'}>{props.label}</Text>
      {props.trailing}
      {props.value ? (
        <Text className={props.valueClass || 'ms-set-value'}>{props.value}</Text>
      ) : null}
      {props.textChevron ? <Text className="ms-chev-text">›</Text> : <Chevron />}
    </View>
  );
}

function ToggleRow(props: { icon: ReactNode; label: string; on: boolean; onClick: () => void }) {
  return (
    <View className="ms-row ms-row-set" onClick={props.onClick}>
      {props.icon}
      <Text className="ms-set-label">{props.label}</Text>
      <View className={props.on ? 'ms-toggle ms-toggle-on' : 'ms-toggle'}>
        <Knob on={props.on} />
      </View>
    </View>
  );
}

function isSessionFailure(error: unknown): boolean {
  if (!(error instanceof AuthApiError)) {
    return false;
  }
  if (error.status === 403) {
    return true;
  }
  return error.status === 401 && error.code !== 'WECHAT_AUTH_FAILED';
}

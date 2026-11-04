import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { UserSummary } from '@tishuashua/shared';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Screen } from '../../components/Screen';
import { ErrorBlock, LoadingBlock } from '../../components/StateBlock';
import { AuthApiError, bindWechatPhone, fetchCurrentUser } from '../../services/auth-api';
import { withAuth } from '../../services/guard';
import { clearToken, readToken } from '../../services/session';
import { readPhoneAuthCode, type PhoneAuthDetail } from '../../services/wechat-auth';

export default function SettingsPage() {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [binding, setBinding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = async () => {
    setError('');
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

  const phoneText = !user?.phoneBound ? '未绑定' : user.phoneMasked || '已绑定';

  return (
    <Screen back centerTitle title="设置">
      <View className="u-pad">
        {!ready && !error ? <LoadingBlock label="正在读取账号" /> : null}
        {error && !ready ? (
          <ErrorBlock
            detail="设置信息暂时无法获取，请检查网络后重试"
            onRetry={() => void load()}
            onBack={() => void Taro.navigateBack()}
          />
        ) : null}
        {ready && user ? (
          <View>
            <Text className="u-group-label">账号</Text>
            <View className="u-group">
              <Button
                className="u-rowbtn"
                openType="getPhoneNumber"
                loading={binding}
                disabled={binding}
                onGetPhoneNumber={(event) => void onPhone(event.detail)}
              >
                <View className="u-row-icon">
                  <Text className="u-row-icon-text">机</Text>
                </View>
                <Text className="u-row-label">账号</Text>
                <Text className="u-row-value">{phoneText}</Text>
                <Text className="u-chev">›</Text>
              </Button>
              <View className="u-divider" />
              <View
                className="u-row"
                onClick={() =>
                  void Taro.showToast({ title: '昵称只在登录时填写，这里不能修改', icon: 'none' })
                }
              >
                <View className="u-row-icon">
                  <Text className="u-row-icon-text">名</Text>
                </View>
                <Text className="u-row-label">昵称</Text>
                <Text className="u-row-value">{user.nick || '微信用户'}</Text>
                <Text className="u-chev">›</Text>
              </View>
            </View>
            <Text className="u-group-label">外观</Text>
            <View className="u-group">
              <View className="u-row">
                <View className="u-row-icon">
                  <Text className="u-row-icon-text">色</Text>
                </View>
                <Text className="u-row-label">主题色</Text>
                <View className="u-swatch" />
                <Text className="u-row-value">默认蓝</Text>
              </View>
            </View>
            <Text className="u-group-label">通用</Text>
            <View className="u-group">
              <SettingLink label="错题本" value="本" url="/pages/wrong-book/index" />
              <View className="u-divider" />
              <SettingLink label="成绩" value="分" url="/pages/score/index" />
              <View className="u-divider" />
              <SettingLink label="证书" value="证" url="/pages/certificate/index" />
              <View className="u-divider" />
              <SettingLink label="用户协议" value="约" url="/pages/legal/terms/index" />
              <View className="u-divider" />
              <SettingLink label="隐私政策" value="隐" url="/pages/legal/privacy/index" />
            </View>
            {error ? <Text className="u-state-sub">{error}</Text> : null}
            <Button className="u-logout" disabled={binding} onClick={() => setConfirming(true)}>
              退出登录
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

function SettingLink(props: { label: string; value: string; url: string }) {
  return (
    <View className="u-row" onClick={() => void Taro.navigateTo({ url: props.url })}>
      <View className="u-row-icon">
        <Text className="u-row-icon-text">{props.value}</Text>
      </View>
      <Text className="u-row-label">{props.label}</Text>
      <Text className="u-chev">›</Text>
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

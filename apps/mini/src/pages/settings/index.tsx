import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { UserSummary } from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { AuthApiError, bindWechatPhone, fetchCurrentUser } from '../../services/auth-api';
import { withAuth } from '../../services/guard';
import { clearToken, readToken } from '../../services/session';
import { readPhoneAuthCode, type PhoneAuthDetail } from '../../services/wechat-auth';

export default function SettingsPage() {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [binding, setBinding] = useState(false);

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
    <MiniPage
      title="设置"
      hint="查看当前账号。昵称不能在这里改。手机号用微信授权补全，不是短信登录。"
    >
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在读取账号。</Text> : null}
      {ready && user ? (
        <View>
          <View className="card">
            <Text className="tree-name">{user.nick || '微信用户'}</Text>
            <Text className="meta">
              昵称只在登录时填写，这里不能修改。要填写或更换，请退出后重新登录并在登录页填写；留空会保留已有昵称。
            </Text>
            <Text className="meta">本小程序不上传头像。</Text>
            <Text className="meta">手机号 {phoneText}</Text>
            <Text className="meta">
              {user.phoneBound ? '已通过微信授权绑定' : '尚未授权微信手机号'}
            </Text>
          </View>
          <Button
            className="primary"
            openType="getPhoneNumber"
            loading={binding}
            disabled={binding}
            onGetPhoneNumber={(event) => void onPhone(event.detail)}
          >
            {user.phoneBound ? '更新微信手机号' : '授权微信手机号'}
          </Button>
          <Text className="hint">
            授权后只保存脱敏号码，例如 138****8000。登录方式仍然只有微信。
          </Text>
        </View>
      ) : null}
      {error ? (
        <Button className="primary" onClick={() => void load()}>
          重试
        </Button>
      ) : null}
      {ready || error ? <LogoutBlock disabled={binding} onLogout={() => void onLogout()} /> : null}
    </MiniPage>
  );
}

async function onLogout(): Promise<void> {
  const result = await Taro.showModal({
    title: '退出登录',
    content: '只清除本机登录态，不会删除账号和已保存的学习数据。',
    confirmText: '退出',
    confirmColor: '#b42318',
  });
  if (!result.confirm) {
    return;
  }
  clearToken();
  await Taro.reLaunch({ url: '/pages/login/index' });
}

function LogoutBlock(props: { disabled: boolean; onLogout: () => void }) {
  return (
    <View>
      <Button className="danger" disabled={props.disabled} onClick={props.onLogout}>
        退出登录
      </Button>
      <Text className="hint">
        只清除本机登录态。账号、刷题记录、错题、课件、成绩和脱敏手机号仍保留。账号注销尚未开放。
      </Text>
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

import { Button, Input, Navigator, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { UserSummary, WechatLoginRequest } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { AuthApiError, fetchCurrentUser, loginWithWechatCode } from '../../services/auth-api';
import { clearToken, readToken, saveToken } from '../../services/session';
import { requestWechatLoginCode } from '../../services/wechat-auth';

type Phase = 'checking' | 'landing' | 'authorizing' | 'ready';

export default function LoginPage() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [nick, setNick] = useState('');
  const [user, setUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');
  const phaseRef = useRef<Phase>('checking');

  const setCurrentPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useDidShow(() => {
    if (phaseRef.current === 'authorizing' || phaseRef.current === 'ready') {
      return;
    }
    void restore();
  });

  const restore = async () => {
    const token = readToken();
    if (!token) {
      setCurrentPhase('landing');
      return;
    }
    try {
      await fetchCurrentUser(token);
      await Taro.reLaunch({ url: '/pages/home/index' });
    } catch (caught) {
      if (caught instanceof AuthApiError && (caught.status === 401 || caught.status === 403)) {
        clearToken();
        setError(caught.status === 403 ? '账号已停用' : '');
      }
      setCurrentPhase('landing');
    }
  };

  const onLogin = async () => {
    setError('');
    setCurrentPhase('authorizing');
    try {
      const code = await requestWechatLoginCode();
      const payload: WechatLoginRequest = { code };
      const trimmed = nick.trim();
      if (trimmed) {
        payload.nick = trimmed;
      }
      const result = await loginWithWechatCode(payload);
      saveToken(result.token);
      setUser(result.user);
      setCurrentPhase('ready');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '登录失败，请重试';
      setError(message);
      setCurrentPhase('landing');
      void Taro.showToast({
        title: message === '授权已取消' ? '授权已取消' : '登录失败',
        icon: 'none',
      });
    }
  };

  const onStart = () => {
    void Taro.reLaunch({ url: '/pages/home/index' });
  };

  if (phase === 'checking') {
    return <MiniPage title="微信登录" hint="正在确认登录状态。" />;
  }

  if (phase === 'ready' && user) {
    return (
      <MiniPage title="登录成功" hint="资料已同步到账号。手机号未授权时可以稍后在设置里补全。">
        <Text className="hint">昵称 {user.nick || '未填写'}</Text>
        <Text className="hint">头像 {user.avatar ? '已同步' : '未同步'}</Text>
        <Text className="hint">手机号 {user.phoneMasked || '未授权，稍后在设置中补全'}</Text>
        <Button className="primary" onClick={onStart}>
          开始备考
        </Button>
      </MiniPage>
    );
  }

  return (
    <MiniPage title="微信登录" hint="只用微信登录。没有游客，也没有手机号验证码。">
      <Text className="label">昵称（可选）</Text>
      <Input
        className="field"
        type="text"
        maxlength={64}
        placeholder="微信昵称，可稍后补"
        value={nick}
        onInput={(event) => setNick(event.detail.value)}
      />
      <Button
        className="primary"
        loading={phase === 'authorizing'}
        disabled={phase === 'authorizing'}
        onClick={() => void onLogin()}
      >
        {phase === 'authorizing' ? '授权中' : '微信一键登录'}
      </Button>
      {error ? <Text className="error">{error}</Text> : null}
      <View className="agree">
        <Text className="hint">登录即表示同意</Text>
        <Navigator className="link" url="/pages/legal/terms/index">
          《用户协议》
        </Navigator>
        <Text className="hint">与</Text>
        <Navigator className="link" url="/pages/legal/privacy/index">
          《隐私政策》
        </Navigator>
      </View>
    </MiniPage>
  );
}

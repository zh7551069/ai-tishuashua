import Taro, { useDidShow } from '@tarojs/taro';
import type { UserSummary } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { AuthApiError, fetchCurrentUser, loginWithWechatCode } from '../../services/auth-api';
import { clearToken, readToken, saveToken } from '../../services/session';
import { requestWechatLoginCode } from '../../services/wechat-auth';
import './index.css';
import { buildProfile } from './profile';
import { LoginChecking, LoginLanding, LoginProfile } from './ui';

type Phase = 'checking' | 'landing' | 'authorizing' | 'filling' | 'ready';

function readStatusBarHeight(): number {
  try {
    return Taro.getSystemInfoSync().statusBarHeight ?? 0;
  } catch {
    return 0;
  }
}

export default function LoginPage() {
  const [phase, setPhase] = useState<Phase>('checking');
  const [user, setUser] = useState<UserSummary | null>(null);
  const [error, setError] = useState('');
  const [inset] = useState(readStatusBarHeight);
  const phaseRef = useRef<Phase>('checking');

  const setCurrentPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useDidShow(() => {
    void Taro.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#eff6ff',
    }).catch(() => undefined);
    if (phaseRef.current === 'authorizing' || phaseRef.current === 'filling') {
      return;
    }
    if (phaseRef.current === 'ready') {
      void refreshReadyUser();
      return;
    }
    void restore();
  });

  const refreshReadyUser = async () => {
    const token = readToken();
    if (!token) {
      setUser(null);
      setCurrentPhase('landing');
      return;
    }
    try {
      setUser(await fetchCurrentUser(token));
    } catch (caught) {
      if (caught instanceof AuthApiError && (caught.status === 401 || caught.status === 403)) {
        clearToken();
        setUser(null);
        setCurrentPhase('landing');
      }
    }
  };

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
    if (phaseRef.current === 'authorizing' || phaseRef.current === 'filling') {
      return;
    }
    setError('');
    setUser(null);
    setCurrentPhase('authorizing');
    try {
      const code = await requestWechatLoginCode();
      setCurrentPhase('filling');
      const result = await loginWithWechatCode({ code });
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
    return <LoginChecking inset={inset} />;
  }

  if (phase === 'filling' || (phase === 'ready' && user)) {
    return (
      <LoginProfile
        inset={inset}
        model={buildProfile(user, phase === 'filling')}
        onStart={onStart}
      />
    );
  }

  return (
    <LoginLanding
      inset={inset}
      error={error}
      authorizing={phase === 'authorizing'}
      onLogin={() => void onLogin()}
    />
  );
}

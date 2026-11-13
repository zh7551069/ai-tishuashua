import Taro, { useDidShow } from '@tarojs/taro';
import type { UserSummary } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { AuthApiError, fetchCurrentUser, loginWithWechatCode } from '../../services/auth-api';
import { clearToken, readToken, saveToken } from '../../services/session';
import { requestWechatLoginCode } from '../../services/wechat-auth';
import { AttemptGate, isAccountDisabled, type Phase, withSuggestedSyncDeadline } from './flow';
import './index.css';
import { buildProfile } from './profile';
import { LoginAuthFailed, LoginChecking, LoginLanding, LoginProfile } from './ui';

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
  const attempts = useRef(new AttemptGate());

  const setCurrentPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useDidShow(() => {
    void Taro.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#F5F5F7',
    }).catch(() => undefined);
    const current = phaseRef.current;
    if (
      current === 'authorizing' ||
      current === 'filling' ||
      current === 'authFailed' ||
      current === 'syncFailed'
    ) {
      return;
    }
    if (current === 'ready') {
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
        if (caught.status === 403) {
          setError('账号已停用');
        }
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

  const syncWithCode = async (code: string, attempt: number) => {
    setCurrentPhase('filling');
    try {
      const result = await withSuggestedSyncDeadline(loginWithWechatCode({ code }));
      if (!attempts.current.isCurrent(attempt)) {
        return;
      }
      saveToken(result.token);
      setUser(result.user);
      setCurrentPhase('ready');
    } catch (caught) {
      if (!attempts.current.isCurrent(attempt)) {
        return;
      }
      if (isAccountDisabled(caught)) {
        setError('账号已停用');
        setUser(null);
        setCurrentPhase('landing');
        return;
      }
      setUser(null);
      setCurrentPhase('syncFailed');
    }
  };

  const onLogin = async () => {
    if (phaseRef.current === 'authorizing' || phaseRef.current === 'filling') {
      return;
    }
    const attempt = attempts.current.issue();
    setError('');
    setUser(null);
    setCurrentPhase('authorizing');
    try {
      const code = await requestWechatLoginCode();
      if (!attempts.current.isCurrent(attempt)) {
        return;
      }
      await syncWithCode(code, attempt);
    } catch {
      if (!attempts.current.isCurrent(attempt)) {
        return;
      }
      setCurrentPhase('authFailed');
    }
  };

  const onCancelAuth = () => {
    if (phaseRef.current !== 'authorizing') {
      return;
    }
    attempts.current.invalidate();
    setCurrentPhase('authFailed');
  };

  const onResync = async () => {
    if (phaseRef.current === 'authorizing' || phaseRef.current === 'filling') {
      return;
    }
    const attempt = attempts.current.issue();
    setError('');
    setUser(null);
    setCurrentPhase('filling');
    try {
      const code = await requestWechatLoginCode();
      if (!attempts.current.isCurrent(attempt)) {
        return;
      }
      await syncWithCode(code, attempt);
    } catch {
      if (!attempts.current.isCurrent(attempt)) {
        return;
      }
      setCurrentPhase('authFailed');
    }
  };

  const onBack = () => {
    setError('');
    setUser(null);
    setCurrentPhase('landing');
  };

  const onStart = () => {
    void Taro.reLaunch({ url: '/pages/home/index' });
  };

  if (phase === 'checking') {
    return <LoginChecking inset={inset} />;
  }

  if (phase === 'filling' || phase === 'syncFailed' || (phase === 'ready' && user)) {
    const mode = phase === 'filling' ? 'syncing' : phase === 'syncFailed' ? 'failed' : 'ready';
    return (
      <LoginProfile
        inset={inset}
        model={buildProfile(user, mode)}
        onStart={onStart}
        onResync={() => void onResync()}
        onBack={onBack}
      />
    );
  }

  if (phase === 'authFailed') {
    return (
      <LoginAuthFailed inset={inset} onRetry={() => void onLogin()} onBack={onBack} />
    );
  }

  return (
    <LoginLanding
      inset={inset}
      error={error}
      authorizing={phase === 'authorizing'}
      onLogin={() => void onLogin()}
      onCancel={onCancelAuth}
    />
  );
}

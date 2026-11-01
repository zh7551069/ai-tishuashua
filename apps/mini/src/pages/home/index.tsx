import { Button, Navigator } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { PRODUCT_NAME } from '@tishuashua/shared';
import { useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { AuthApiError, fetchCurrentUser } from '../../services/auth-api';
import { clearToken, readToken } from '../../services/session';

const links = [
  { url: '/pages/quiz/index', label: '刷题' },
  { url: '/pages/wrong-book/index', label: '错题' },
  { url: '/pages/certificate/index', label: '证书' },
  { url: '/pages/score/index', label: '成绩' },
];

export default function HomePage() {
  const [nick, setNick] = useState('');
  const [phoneLine, setPhoneLine] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const token = readToken();
    if (!token) {
      await Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    try {
      const me = await fetchCurrentUser(token);
      setNick(me.nick || '微信用户');
      setPhoneLine(me.phoneMasked || '手机号未授权，稍后在设置中补全');
      setError('');
      setReady(true);
    } catch (caught) {
      if (caught instanceof AuthApiError && (caught.status === 401 || caught.status === 403)) {
        clearToken();
        await Taro.reLaunch({ url: '/pages/login/index' });
        return;
      }
      setReady(false);
      setError(caught instanceof Error ? caught.message : '网络异常，请重试');
    }
  };

  useDidShow(() => {
    void load();
  });

  if (!ready) {
    return (
      <MiniPage title={PRODUCT_NAME} hint={error || '正在确认登录状态。'}>
        {error ? (
          <Button className="primary" onClick={() => void load()}>
            重试
          </Button>
        ) : null}
      </MiniPage>
    );
  }

  return (
    <MiniPage
      title="开始备考"
      hint={`${nick}，${phoneLine}。刷题包和出题会在后续开放，这里先进入首页。`}
    >
      {links.map((link) => (
        <Navigator key={link.url} className="link" url={link.url}>
          {link.label}
        </Navigator>
      ))}
    </MiniPage>
  );
}

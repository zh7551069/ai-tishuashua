import { Button, Text } from '@tarojs/components';
import { useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
import { miniApiBase } from '../../services/api-base';
import { requestWechatLoginCode } from '../../services/wechat-auth';

export default function LoginPage() {
  const [message, setMessage] = useState('尚未获取登录 code');

  const onLogin = async () => {
    try {
      const code = await requestWechatLoginCode();
      setMessage(`已取得微信 code（长度 ${code.length}）。会话交换尚未实现。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '微信登录失败');
    }
  };

  return (
    <MiniPage title="微信登录" hint="客户端鉴权只有微信登录。短信登录不在本期。">
      <Button onClick={() => void onLogin()}>获取微信 code</Button>
      <Text className="hint">{message}</Text>
      <Text className="hint">API {miniApiBase()}/auth/wechat/login</Text>
    </MiniPage>
  );
}

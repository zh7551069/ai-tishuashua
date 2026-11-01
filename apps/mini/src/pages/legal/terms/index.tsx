import { Text } from '@tarojs/components';
import { MiniPage } from '../../../components/MiniPage';

export default function TermsPage() {
  return (
    <MiniPage title="用户协议" hint="生效日期：2026-11-01。本页是题刷刷用户协议正文。">
      <Text className="hint">
        题刷刷是面向在职备考的刷题工具。你点击「微信一键登录」即表示已阅读并同意本协议和《隐私政策》。
      </Text>
      <Text className="hint">
        账号只通过微信身份建立。我们不提供游客模式、手机号验证码登录，也不接入其他第三方账号。首次登录会自动注册；同一微信身份对应同一个账号。
      </Text>
      <Text className="hint">
        你应合法使用本服务，不尝试破解接口、伪造登录码或干扰其他用户。刷题、错题和证书能力会分阶段开放，未开放的页面只说明入口，不代表该功能已经可用。
      </Text>
      <Text className="hint">
        你可以停止使用本服务。账号注销流程尚未开放；在注销可用之前，登录态会按服务端会话期限失效，你也可以清除小程序缓存来删除本机保存的
        token。
      </Text>
      <Text className="hint">
        我们可能更新本协议。更新后的正文仍放在这个页面。你继续登录或使用，即表示接受更新后的协议。
      </Text>
    </MiniPage>
  );
}

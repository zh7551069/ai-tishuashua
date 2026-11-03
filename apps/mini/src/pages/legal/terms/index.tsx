import { Text } from '@tarojs/components';
import { MiniPage } from '../../../components/MiniPage';

export default function TermsPage() {
  return (
    <MiniPage title="用户协议" hint="生效日期：2026-11-03。本页是题刷刷用户协议正文。">
      <Text className="hint">
        题刷刷是面向在职备考的刷题工具。你点击「微信一键登录」即表示已阅读并同意本协议和《隐私政策》。
      </Text>
      <Text className="hint">
        账号只通过微信身份建立。我们不提供游客模式、手机号验证码登录，也不接入其他第三方账号。设置里的微信手机号授权只用于保存脱敏号码，不会变成另一种登录方式。首次登录会自动注册；同一微信身份对应同一个账号。昵称只在登录时可选填写，设置页不能修改。本小程序不上传头像。
      </Text>
      <Text className="hint">
        你应合法使用本服务，不尝试破解接口、伪造登录码或干扰其他用户。刷题、交卷与成绩、错题本、课件提炼和证书查询已经可以使用。成绩页查看每次交卷的明细；证书页汇总你已关联的证书；选领域、证书和知识点建包走目录。
      </Text>
      <Text className="hint">
        你可以停止使用本服务。设置页「退出登录」只清除本机
        token。账号注销尚未开放：退出不会删除账号，也不会删除已保存的刷题记录、错题、课件、成绩或脱敏手机号。服务端会话在不再使用后失效，自上次使用起最多保留
        7 天。
      </Text>
      <Text className="hint">
        我们可能更新本协议。更新后的正文仍放在这个页面。你继续登录或使用，即表示接受更新后的协议。
      </Text>
    </MiniPage>
  );
}

import { Text } from '@tarojs/components';
import { MiniPage } from '../../../components/MiniPage';

export default function PrivacyPage() {
  return (
    <MiniPage title="隐私政策" hint="生效日期：2026-11-01。本页是题刷刷隐私政策正文。">
      <Text className="hint">
        我们只为提供备考账号和登录态处理下列信息：微信 openId、微信在可用时返回的
        unionId、你在登录时主动填写的昵称和头像。手机号不是登录凭证，也不能用短信验证码登录。你可以在设置页单独点微信手机号授权。小程序只把授权组件返回的临时
        code 交给 API，API 向微信换取手机号后，只保存脱敏展示值（例如
        138****2160），不回传完整手机号。
      </Text>
      <Text className="hint">
        登录流程是：小程序向微信取得临时 code，发给我们的 API。API 用保存在服务端的 AppId 和
        AppSecret 向微信换取 openId。AppSecret 不会写入小程序，也不会出现在接口响应里。微信返回的
        session_key 不交给小程序，也不写入用户表。
      </Text>
      <Text className="hint">
        登录成功后，服务端签发一个不透明 token，并把会话放在 Redis，默认 7 天；你之后带着 token
        访问时，有效期会顺延。小程序只在本地保存这个 token，用来请求「当前用户」等需要登录的接口。
      </Text>
      <Text className="hint">
        我们用这些信息识别你的账号、保持登录，以及在后续切片里保存你的刷题记录。我们不把
        openId、昵称或手机号出售给广告商。微信侧对 code 的处理遵循微信小程序平台规则。
      </Text>
      <Text className="hint">
        你可以通过清除小程序缓存删除本机
        token。服务端会话到期后失效。若你认为账号信息有误，请停止继续登录并联系产品维护者处理。本政策更新后仍发布在这个页面。
      </Text>
    </MiniPage>
  );
}

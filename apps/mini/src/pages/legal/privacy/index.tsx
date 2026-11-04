import { Text, View } from '@tarojs/components';
import { Screen } from '../../../components/Screen';

const PARAGRAPHS = [
  '为建立账号和保持登录，我们处理微信 openId，以及微信在可用时返回的 unionId。昵称只有你在登录页主动填写才会保存。本小程序不采集、不上传头像。',
  '手机号不是登录凭证，也不能用短信验证码登录。你可以在设置页单独授权微信手机号。小程序只把授权组件返回的临时 code 交给 API，API 向微信换取手机号后，只保存脱敏展示值（例如 138****2160），不保存、不回传完整手机号。未授权时不保存手机号。',
  '登录时，小程序向微信取得临时 code 发给 API。API 用保存在服务端的 AppId 和 AppSecret 向微信换取 openId。AppSecret 不会写入小程序，也不会出现在接口响应里。微信返回的 session_key 不交给小程序，也不写入用户表。',
  '登录成功后，服务端签发一个不透明 token，并把会话放在 Redis，默认 7 天；之后带着 token 访问时，有效期会顺延。小程序只在本机保存这个 token。设置里的「退出登录」只删除本机 token，不立刻作废服务端会话，也不删除账号。服务端会话自上次使用起最多保留 7 天。',
  '使用过程中，我们按你的账号保存这些学习数据，用来出题、判分、回看和继续备考：刷题包（领域、证书、知识点和名称）；刷题记录（出题设置、题目、你的作答和交卷状态）；成绩（分数、是否通过的快照、交卷时间）；错题（题目快照、知识点、错误次数和是否已消灭）；课件（你上传的文件和文件名、提炼草稿，以及你确认保存的知识点）。',
  '小程序「成绩」页是每次交卷的明细。「证书」页按你已经关联的证书做汇总，不是成绩明细，也不是选领域建包时的目录。我们不把 openId、昵称、脱敏手机号或上述学习数据出售给广告商。微信侧对 code 的处理遵循微信小程序平台规则。',
  '账号注销尚未开放。退出登录或清除小程序缓存不会删除刷题记录、错题、课件、成绩、脱敏手机号或账号本身。若你认为账号信息有误，请停止继续登录并联系产品维护者。本政策更新后仍发布在这个页面。',
];

export default function PrivacyPage() {
  return (
    <Screen back centerTitle title="隐私政策">
      <View className="u-legal">
        <Text className="u-legal-h">题刷刷隐私政策</Text>
        <Text className="u-legal-p">生效日期：2026-11-03。</Text>
        {PARAGRAPHS.map((paragraph) => (
          <Text key={paragraph.slice(0, 12)} className="u-legal-p">
            {paragraph}
          </Text>
        ))}
      </View>
    </Screen>
  );
}

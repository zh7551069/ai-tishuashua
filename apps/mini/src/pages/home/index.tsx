import { Navigator } from '@tarojs/components';
import { PRODUCT_NAME } from '@tishuashua/shared';
import { MiniPage } from '../../components/MiniPage';

const links = [
  { url: '/pages/login/index', label: '微信登录' },
  { url: '/pages/quiz/index', label: '刷题' },
  { url: '/pages/wrong-book/index', label: '错题' },
  { url: '/pages/certificate/index', label: '证书' },
  { url: '/pages/score/index', label: '成绩' },
];

export default function HomePage() {
  return (
    <MiniPage title={PRODUCT_NAME} hint="首页脚手架。刷题由服务端按需出题，这里只保留页面入口。">
      {links.map((link) => (
        <Navigator key={link.url} className="link" url={link.url}>
          {link.label}
        </Navigator>
      ))}
    </MiniPage>
  );
}

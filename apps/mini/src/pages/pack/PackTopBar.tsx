import { AppNav } from '../../components/AppNav';

/**
 * 选证书 / 选知识点共用顶栏，收进 AppNav。
 * Bridge：白父里的 navbar 与进度条、搜索平级；标题列在返回右侧，左对齐。
 */
export function PackTopBar(props: { title: string; subtitle?: string; onBack: () => void }) {
  return <AppNav title={props.title} subtitle={props.subtitle} onBack={props.onBack} />;
}

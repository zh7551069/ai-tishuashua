import { Image, Text, View } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import female from '../../../assets/hero/female.jpg';
import { Screen } from '../../../components/Screen';
import { readThemeId, saveThemeId, THEMES, type ThemeId } from '../../../services/local-prefs';
import { notifyThemeChanged } from '../../../theme/apply-theme';
import { ThemeBack } from '../../../ui/glyphs';
import '../../../ui/me-settings.css';

export default function ThemePage() {
  const [themeId, setThemeId] = useState<ThemeId>(() => readThemeId());

  useDidShow(() => {
    setThemeId(readThemeId());
  });

  const pick = (id: ThemeId) => {
    saveThemeId(id);
    setThemeId(id);
    notifyThemeChanged();
  };

  return (
    <Screen back centerTitle navPlain navClassName="ms-nav" title="主题色" backMark={<ThemeBack />}>
      <View className="ms-body ms-body-theme">
        <View className="ms-card ms-intro">
          <Text className="ms-intro-title">选择 App 主色调</Text>
          <Text className="ms-intro-sub">主按钮、选中态与强调色会一起更新</Text>
          <Text className="ms-intro-lock">插画保持黄绿主色，仅按钮与强调色随主题更新</Text>
        </View>
        <View className="ms-tile-grid">
          {THEMES.map((theme) => {
            const selected = theme.id === themeId;
            return (
              <View
                key={theme.id}
                className="ms-tile"
                style={selected ? { boxShadow: `inset 0 0 0 2px ${theme.color}` } : undefined}
                onClick={() => pick(theme.id)}
              >
                <View className="ms-tile-swatch" style={{ background: theme.color }} />
                <Text className="ms-tile-name">{theme.name}</Text>
              </View>
            );
          })}
        </View>
        <View className="ms-card ms-preview">
          <Text className="ms-preview-kicker">预览</Text>
          <View className="ms-preview-row">
            <Image className="ms-preview-art" src={female} mode="aspectFill" />
            <View className="ms-preview-copy">
              <View className="ms-chip ms-brand-soft ms-brand-chip">
                <Text className="ms-chip-text ms-brand-fg">练习模式</Text>
              </View>
              <View className="ms-preview-btn ms-brand-bg">
                <Text className="ms-preview-text">AI 开始出题</Text>
              </View>
            </View>
          </View>
        </View>
        <Text className="ms-hint">点选即生效 · 返回设置可查看入口色标</Text>
      </View>
    </Screen>
  );
}
